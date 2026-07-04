/**
 * Interface — Macro/news VPS-push routes (Stage 2 of server.ts staged extraction)
 *
 * Extracted from server.ts lines ~1552–1769
 * (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md §4 Stage 2).
 *
 * Routes:
 *   POST /api/push-reuters           — VPS RSS push (Task 1494)
 *   POST /api/push-tradingeconomics  — VPS macro push (Task 1495)
 *   POST /api/push-gso               — VPS GSO macro push (Task 1499)
 *
 * `upsertMacroIndicators` dedupes the near-identical TE/GSO column-allowlist
 * upsert core (filter against allowlist → ensure row exists → conditionally
 * update the matched columns). The two callers differ in payload validation
 * and response shape (preserved verbatim per-route) — only the shared
 * "filter + upsert" DB-write core is unified here. push-reuters writes to a
 * different table (`rag_analyses`) via a SHA-1 id-hash insert loop that does
 * not share this shape, so it stays inline per the dispatch brief.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { createLogger } from "../../../infrastructure/logger.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";

type Logger = ReturnType<typeof createLogger>;

interface MacroIndicatorInput {
  name: string;
  value: number;
  unit?: string;
  fetched_at?: string;
}

// Allowlist: TE indicator name → macro_indicators column
const TE_COLUMN_MAP: Record<string, string> = {
  cpi:                 "cpi",
  gdp_growth:          "gdp_growth",
  interest_rate:       "interest_rate",
  unemployment_rate:   "unemployment_rate",
  inflation_rate:      "inflation_rate",
  trade_balance:       "trade_balance",
  current_account:     "current_account",
  government_debt:     "government_debt",
  budget_deficit:      "budget_deficit",
  manufacturing_pmi:   "manufacturing_pmi",
  consumer_confidence: "consumer_confidence",
  retail_sales:        "retail_sales",
};

// Allowlist: GSO indicator name → macro_indicators column
const GSO_ALLOWED_COLS: Record<string, string> = {
  cpi:                 "cpi",
  gdp_growth:          "gdp_growth",
  unemployment_rate:   "unemployment_rate",
  inflation_rate:      "inflation_rate",
  retail_sales:        "retail_sales",
  trade_balance:       "trade_balance",
  consumer_confidence: "consumer_confidence",
  manufacturing_pmi:   "manufacturing_pmi",
  government_debt:     "government_debt",
  budget_deficit:      "budget_deficit",
  current_account:     "current_account",
};

/**
 * Filters raw indicators against `allowedCols`, ensures a `macro_indicators`
 * row exists for `country` (touching `fetched_at`), and — if any indicators
 * matched — updates just those columns (+ `fetched_at` again). Returns the
 * matched indicators so callers can derive `updated_cols` / `upserted` from
 * `.length` without duplicating the filter predicate.
 */
function upsertMacroIndicators(
  db: Database,
  country: string,
  indicators: MacroIndicatorInput[],
  allowedCols: Record<string, string>,
): MacroIndicatorInput[] {
  const known = indicators.filter(
    (i) => typeof i.name === "string" && i.name in allowedCols && typeof i.value === "number",
  );

  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO macro_indicators (country, fetched_at) VALUES (?, ?)
     ON CONFLICT(country) DO UPDATE SET fetched_at = excluded.fetched_at`,
  ).run(country, now);

  if (known.length > 0) {
    const setClauses = known.map((i) => `${allowedCols[i.name]} = ?`).join(", ");
    const values = known.map((i) => i.value);
    db.prepare(
      `UPDATE macro_indicators SET ${setClauses}, fetched_at = ? WHERE country = ?`,
    ).run(...values, now, country);
  }

  return known;
}

// ── POST /api/push-reuters ──────────────────────────────────────────────────

export async function handlePushReuters(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const payload = JSON.parse(body) as { items?: unknown };
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO rag_analyses
        (id, created_at, level, source_url, source_title, source_type,
         published_at, sentiment, impact_score, impact_direction, confidence,
         time_horizon, summary, reasoning, affected_countries, affected_domains,
         affected_actions, parent_ids, tags, embedding_text)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    let inserted = 0;
    let duplicate = 0;
    const now = new Date().toISOString();

    for (const raw of rawItems as Record<string, unknown>[]) {
      const url = typeof raw.url === "string" ? raw.url : null;
      const title = typeof raw.title === "string" ? raw.title : "";
      const publishedAt = typeof raw.published_at === "string" ? raw.published_at : now;
      // Use crypto hash of url (or title+now) so IDs are unique even for similar URLs
      const hashInput = url ?? (title + now);
      const hashBuf = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(hashInput)));
      const hashHex = Array.from(hashBuf).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const id = `reuters-${hashHex}`;

      const result = stmt.run(
        id, now, "global",
        url, title, "news",
        publishedAt, "neutral", null, "neutral", null,
        "short", title, null,
        JSON.stringify(["VN"]), JSON.stringify([]), JSON.stringify([]),
        JSON.stringify([]), JSON.stringify(["reuters"]),
      );
      if ((result.changes as number) > 0) {
        inserted++;
      } else {
        duplicate++;
      }
    }

    log.info("[push-reuters] items processed", { inserted, duplicate });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, inserted, duplicate }));
  } catch (err) {
    log.error("[push-reuters] error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
  return;
}

// ── POST /api/push-tradingeconomics ─────────────────────────────────────────

export async function handlePushTradingEconomics(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const payload = JSON.parse(body) as {
      country?: string;
      indicators?: MacroIndicatorInput[];
    };
    // DSI-S1-SLA: default to 'vietnam' (SSOT key) — not 'VN'
    const country = typeof payload.country === "string" ? payload.country : "vietnam";
    const rawIndicators = Array.isArray(payload.indicators) ? payload.indicators : [];

    const known = upsertMacroIndicators(db, country, rawIndicators, TE_COLUMN_MAP);

    if (known.length > 0) {
      log.info("[push-tradingeconomics] updated macro_indicators", { country, updated_cols: known.length });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, country, updated_cols: known.length }));
  } catch (err) {
    log.error("[push-tradingeconomics] error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
  return;
}

// ── POST /api/push-gso ───────────────────────────────────────────────────────

export async function handlePushGso(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  let body = "";
  for await (const chunk of req) body += chunk;
  let payload: { country?: string; indicators?: unknown };
  try {
    payload = JSON.parse(body) as { country?: string; indicators?: unknown };
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }
  if (!Array.isArray(payload.indicators)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "indicators must be an array" }));
    return;
  }
  // DSI-S1-SLA: default to 'vietnam' (SSOT key) — not 'VN'
  const country = typeof payload.country === "string" ? payload.country : "vietnam";
  const rawIndicators = payload.indicators as MacroIndicatorInput[];

  const known = upsertMacroIndicators(db, country, rawIndicators, GSO_ALLOWED_COLS);

  log.info("[push-gso] upserted macro_indicators", { country, updated_cols: known.length });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, country, upserted: true }));
  return;
}
