# TECH-063: Task 1135 Unblock + Insider Transaction Detection

status: APPROVED_BY_ARCHITECT
req_ref: REQ-063

---

## Brownfield Impact

- Files modified:
  - `vps-scripts/fetch-prices.sh` — extend Step 2 block with foreign flow extraction + push
  - `src/interface/mcp/server.ts` — add GET `/api/foreign-flow-status` handler after the push-foreign-flow block
  - `src/infrastructure/db/schema.ts` — add `insider_transactions` DDL to `initDatabase()`
  - `src/scheduler/insiderCheckJob.ts` — remove `sendTelegramMarket`, add streak detection, add `insertAlert` + `insertEvidenceFragment` calls
  - `src/scheduler/jobs.ts` — add `insiderCheck` cron key + `cron.schedule()` registration
  - `src/infrastructure/db/insiderStore.ts` — add `getInsiderTransactionsFiltered()` with date + type filter
  - `src/interface/mcp/tools/index.ts` — register new `insiderTools` module
  - `docs/data/project-stats.json` — toolCount 90 → 91
  - `docs/data/cron-registry.json` — add insiderCheck entry

- Files created:
  - `src/interface/mcp/tools/insiderTools.ts` — `get_insider_transactions` MCP tool
  - `src/__tests__/1141-insider-ddl.test.ts`
  - `src/__tests__/1142-fetch-prices-foreign-flow.test.ts` (shell integration test notes)
  - `src/__tests__/1143-insider-check-job.test.ts`
  - `src/__tests__/1144-foreign-flow-status.test.ts`
  - `src/__tests__/1145-insider-cron-registration.test.ts`
  - `src/__tests__/1146-get-insider-transactions.test.ts`

- Files deleted: none

- Breaking changes: no. All DDL additions are `CREATE TABLE IF NOT EXISTS`. `insiderCheckJob.ts` is currently a dead file (never imported by `jobs.ts`), so removing its direct Telegram call cannot break production.

---

## Architecture Decision

The existing `insiderCheckJob.ts` is architecturally complete but is wired to nothing — it has no DDL backing it, is not registered in the cron scheduler, violates Alert Commander exclusivity, and has no MCP read path. This sprint threads all four missing connections without rewriting any domain logic. The streak detection function is a pure data grouping step added to the job layer (not to the domain service), because it requires reading the stored DB state, not just the just-fetched batch — a domain service cannot do I/O. The evidence fragment call uses the existing `insertEvidenceFragment` from `evidenceFragmentStore.ts` following the exact pattern already established by `foreignFlowAlertJob.ts`.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `insider_transactions` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `getInsiderTransactionsFiltered()` | infrastructure | `src/infrastructure/db/insiderStore.ts` | MODIFY |
| Streak detector (pure function) | domain/application | `src/scheduler/insiderCheckJob.ts` | MODIFY |
| Alert insert + evidence fragment write | infrastructure | `src/scheduler/insiderCheckJob.ts` | MODIFY |
| insiderCheck cron registration | interface/scheduler | `src/scheduler/jobs.ts` | MODIFY |
| `get_insider_transactions` MCP tool | interface/mcp | `src/interface/mcp/tools/insiderTools.ts` | NEW |
| `GET /api/foreign-flow-status` endpoint | interface | `src/interface/mcp/server.ts` | MODIFY |
| Foreign flow step in VPS script | infrastructure (VPS) | `vps-scripts/fetch-prices.sh` | MODIFY |

---

## Interface Contracts

### Task 1141 — insider_transactions DDL (schema.ts)

Add to `initDatabase()` after the `vps_push_log` block (around line 840):

```typescript
// ── Insider Transactions (Task 1141 / Sprint 063) ─────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS insider_transactions (
    id                  TEXT PRIMARY KEY,
    code                TEXT NOT NULL,
    insider_name        TEXT NOT NULL,
    position            TEXT NOT NULL,
    type                TEXT NOT NULL CHECK(type IN ('buy','sell','other')),
    registered_volume   INTEGER NOT NULL DEFAULT 0,
    executed_volume     INTEGER NOT NULL DEFAULT 0,
    price               REAL NOT NULL DEFAULT 0,
    from_date           TEXT NOT NULL,
    to_date             TEXT NOT NULL,
    fetched_at          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_it_code_from_date
    ON insider_transactions(code, from_date DESC);
  CREATE INDEX IF NOT EXISTS idx_it_type_from_date
    ON insider_transactions(type, from_date DESC);
`);
```

Also update the header comment at the top of `schema.ts` to add `insider_transactions` to the "Tables created" list.

### Task 1142 — VPS script foreign flow step (fetch-prices.sh)

Insert a new Step 2b block between the existing Step 2 (VN stocks fetch) and Step 3 (VN indices fetch). The VPS response from Step 2 is already held in `$VN_DATA`. No second API call is needed.

```bash
# Step 2b: Push foreign flow (configurable field names — FR-1)
FBUY_FIELD="${FOREIGN_FLOW_FBUY_FIELD:-}"
FSELL_FIELD="${FOREIGN_FLOW_FSELL_FIELD:-}"
FROOM_FIELD="${FOREIGN_FLOW_FROOM_FIELD:-currentRoom}"
FF_URL="${MCP_BASE_URL:-__MCP_BASE__}/api/push-foreign-flow"

if [ -z "$FBUY_FIELD" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WARN: FOREIGN_FLOW_FBUY_FIELD not set, skipping foreign flow push" >> "$LOG"
else
  if [ -n "$VN_DATA" ] && [ "$VN_DATA" != "[]" ]; then
    TODAY=$(date -u +%Y-%m-%d)
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    FF_JSON=$(echo "$VN_DATA" | jq --arg fbuy "$FBUY_FIELD" \
                                   --arg fsell "${FOREIGN_FLOW_FSELL_FIELD:-$FBUY_FIELD}" \
                                   --arg froom "$FROOM_FIELD" \
                                   --arg date "$TODAY" \
                                   --arg now "$NOW" \
      '[.[] | select(.sym != null) | {
        code: .sym,
        date: $date,
        foreign_volume: (((.[$fbuy] // 0) | tonumber) - ((.[$fsell] // 0) | tonumber)),
        foreign_room: ((.[$froom] // 0) | tonumber),
        holding_ratio: (if (.[$froom] != null and (.[$froom] | tonumber) > 1) then ((.[$froom] | tonumber) / 100) else ((.[$froom] // 0) | tonumber) end),
        fetched_at: $now
      }]' 2>/dev/null)
    FF_COUNT=$(echo "$FF_JSON" | jq 'length' 2>/dev/null || echo "0")
    if [ "$FF_COUNT" -gt 0 ]; then
      FF_RESP=$(curl -s --connect-timeout 10 --max-time 15 \
        -X POST "$FF_URL" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d "$FF_JSON")
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FOREIGN_FLOW: $FF_COUNT items pushed → $FF_RESP" >> "$LOG"
    else
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WARN: foreign flow jq produced 0 items" >> "$LOG"
    fi
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WARN: VN_DATA empty, skipping foreign flow push" >> "$LOG"
  fi
fi
```

Note on `holding_ratio`: the field normalisation (if > 1.0, divide by 100) is already handled server-side in `upsertForeignFlow()`. The script computes a best-effort value; the server normalises it. No double-normalisation risk.

### Task 1143 — insiderCheckJob refactor (insiderCheckJob.ts)

Three changes to `runInsiderCheck()`:

**Change 1 — Remove direct Telegram send.** Delete the import of `sendTelegramMarket` and the Step 5 block entirely.

**Change 2 — Add streak detection helper.** Add a pure function `detectAccumulationStreaks` above `runInsiderCheck()`:

```typescript
interface AccumulationStreak {
  code: string;
  position: string;          // normalised to lowercase
  buyDays: number;           // count of distinct from_date values
  totalExecutedVolume: number;
}

function detectAccumulationStreaks(
  db: Database,
  windowDays: number,
): AccumulationStreak[] {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  type Row = { code: string; position: string; buy_days: number; total_vol: number };
  const rows = db.prepare<Row, [string]>(`
    SELECT
      code,
      lower(trim(position)) AS position,
      COUNT(DISTINCT from_date) AS buy_days,
      SUM(executed_volume)     AS total_vol
    FROM insider_transactions
    WHERE type = 'buy'
      AND executed_volume > 0
      AND from_date >= ?
    GROUP BY code, lower(trim(position))
    HAVING buy_days >= 3
  `).all(cutoff) as Row[];

  return rows.map((r) => ({
    code:                r.code,
    position:            r.position,
    buyDays:             r.buy_days,
    totalExecutedVolume: r.total_vol,
  }));
}
```

**Change 3 — Replace Step 5 with insertAlert + insertEvidenceFragment.** Add imports at the top:

```typescript
import { insertEvidenceFragment } from "../infrastructure/db/evidenceFragmentStore.js";
```

Replace the entire Step 5 block with:

```typescript
// ── Step 5: Detect accumulation streaks → evidence fragment + alert ────────
const streaks = detectAccumulationStreaks(db, 30);

for (const streak of streaks) {
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  insertEvidenceFragment(db, {
    stock:         streak.code,
    evidence_type: "insider_accumulation",
    direction:     "bullish",
    magnitude:     Math.min(1.0, streak.buyDays / 10),
    confidence:    0.85,
    source_agent:  "insiderCheckJob",
    ttl_days:      30,
  });
  logger.info("[insiderCheckJob] evidence fragment inserted", {
    code: streak.code, buyDays: streak.buyDays,
  });
}

// ── Step 6: Insert alert rows for significant single buys + streaks ────────
const utcDay = new Date().toISOString().slice(0, 10);
const triggeredAt = new Date().toISOString();

const insertAlertStmt = db.prepare(`
  INSERT OR IGNORE INTO alerts
    (id, triggered_at, severity, signals_json, affected_actions_json,
     analysis_ids_json, message, read, user_note, sent_by)
  VALUES
    (?, ?, 'high', ?, ?, NULL, ?, 0, NULL, 'server')
`);

// Streak alerts
for (const streak of streaks) {
  const id = `insider-streak-${streak.code}-${utcDay}`;
  const msg =
    `Tich luy noi bo ${streak.code}: ${streak.buyDays} ngay mua lien tiep ` +
    `boi ${streak.position} — co hieu ung lon nhat trong thi truong VN`;
  insertAlertStmt.run(
    id,
    triggeredAt,
    JSON.stringify(["insider_accumulation"]),
    JSON.stringify([{ code: streak.code, expectedImpact: "up", confidence: 0.85 }]),
    msg,
  );
}

// Significant single-transaction alerts (> 1% of DEFAULT_OUTSTANDING, buy only)
for (const tx of domainTxs) {
  if (tx.type !== "buy") continue;
  const pct = (tx.volume / DEFAULT_OUTSTANDING) * 100;
  if (pct < 1.0) continue;
  const signal = classifyInsiderTransaction(tx, DEFAULT_OUTSTANDING);
  if (!signal || (signal.severity !== "high" && signal.severity !== "critical")) continue;
  const id = `insider-single-${tx.code}-${tx.insiderName.slice(0, 10).replace(/\s/g, "")}-${utcDay}`;
  insertAlertStmt.run(
    id,
    triggeredAt,
    JSON.stringify(["insider_buy"]),
    JSON.stringify([{ code: tx.code, expectedImpact: "up", confidence: signal.confidence }]),
    signal.reasoning,
  );
  logger.info("[insiderCheckJob] alert row inserted", { code: tx.code, pct });
}
```

Remove the unused `allAlerts` array and its population loop (they are replaced entirely by the streak + single-buy alert logic above). Keep Steps 1–4 (fetch, store, classify, mass-buy detect) unchanged except that `allAlerts` is no longer constructed.

### Task 1144 — GET /api/foreign-flow-status (server.ts)

Insert after the `push-foreign-flow` block (after line 663) and before the `GET /api/watchlist` block:

```typescript
// ── Foreign flow diagnostic endpoint ─────────────────────────────────────
if (method === "GET" && pathname === "/api/foreign-flow-status") {
  const apiKey = process.env.VPS_PUSH_API_KEY;
  const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const db = getDb();

  // Configured fields (what the server expects from the VPS script)
  const configuredFields = {
    fbuyField:  Bun.env.FOREIGN_FLOW_FBUY_FIELD  ?? "fbuyVol",
    fsellField: Bun.env.FOREIGN_FLOW_FSELL_FIELD ?? "fsellVol",
    roomField:  Bun.env.FOREIGN_FLOW_FROOM_FIELD ?? "currentRoom",
  };

  // Last push from vps_push_log
  type LogRow = { pushed_at: string; items_count: number };
  const lastLog = db.prepare<LogRow, [string]>(
    `SELECT pushed_at, items_count FROM vps_push_log
     WHERE service = 'foreign-flow' ORDER BY pushed_at DESC LIMIT 1`,
  ).get("foreign-flow") as LogRow | null;

  // Sample row from vnstock_trading_stats
  type SampleRow = { code: string; foreign_volume: number; foreign_room: number; holding_ratio: number };
  const sampleRow = db.prepare<SampleRow, []>(
    `SELECT code, foreign_volume, foreign_room, holding_ratio
     FROM vnstock_trading_stats
     WHERE foreign_volume IS NOT NULL AND foreign_volume != 0
     ORDER BY updated_at DESC LIMIT 1`,
  ).get() as SampleRow | null;

  // Row count
  type CountRow = { cnt: number };
  const countRow = db.prepare<CountRow, []>(
    `SELECT COUNT(*) as cnt FROM vnstock_trading_stats
     WHERE foreign_volume IS NOT NULL AND foreign_volume != 0`,
  ).get() as CountRow;

  // Stale check: > 48h since last push
  let staleSince: string | null = null;
  if (lastLog?.pushed_at) {
    const ageMs = Date.now() - new Date(lastLog.pushed_at).getTime();
    if (ageMs > 48 * 60 * 60 * 1000) staleSince = lastLog.pushed_at;
  }

  const payload = {
    configuredFields,
    lastPushSummary: lastLog
      ? {
          receivedAt: lastLog.pushed_at,
          itemCount:  lastLog.items_count,
          sampleRow:  sampleRow ?? null,
        }
      : null,
    tableRowCount: countRow.cnt,
    staleSince,
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
  return;
}
```

### Task 1145 — insiderCheck cron registration (jobs.ts)

**Add import** (with other scheduler imports, alphabetically):

```typescript
import { runInsiderCheck } from './insiderCheckJob.js'
```

**Add to CRONS object** (after `foreignFlowAlert` entry):

```typescript
/** Insider SSC disclosure check: daily 01:00 UTC (08:00 VN) Mon-Sun — task 1145, Sprint 063 */
insiderCheck: Bun.env.CRON_INSIDER_CHECK ?? '0 1 * * *',
```

**Add cron.schedule() call** in `startScheduler()` (after the foreignFlowAlert block):

```typescript
// Daily 01:00 UTC (08:00 VN) — Insider SSC transaction check — task 1145, Sprint 063
// Mon-Sun: SSC disclosures can be published on weekends.
// runInsiderCheck() now uses insertAlert + insertEvidenceFragment (no direct Telegram).
cron.schedule(CRONS.insiderCheck, async () => {
  await recordJobRun(getDb(), 'insiderCheckJob', async () => {
    await runInsiderCheck()
  })
}, { timezone: 'UTC' })
```

**Update the terminal log message** at the end of `startScheduler()` to keep the count accurate:

```typescript
log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} cron keys in CRONS map ...`)
```

(The existing interpolation already uses `Object.keys(CRONS).length` so no change needed to the string itself — the count increments automatically.)

### Task 1146 — get_insider_transactions MCP tool

**Step 1 — Extend insiderStore.ts** with a filtered query function:

```typescript
/**
 * Retrieve insider transactions with optional filters for code, date range,
 * and transaction type. Supports watchlist-aware multi-code queries.
 * Results ordered by from_date DESC, then code ASC.
 */
export function getInsiderTransactionsFiltered(
  db: Database,
  opts: {
    codes?: string[];          // if empty/undefined, no code filter
    sinceDate?: string;        // ISO date string, inclusive
    type?: "buy" | "sell" | "all";
  },
): InsiderRow[] {
  const { codes, sinceDate, type } = opts;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (codes && codes.length > 0) {
    const placeholders = codes.map(() => "?").join(", ");
    conditions.push(`code IN (${placeholders})`);
    params.push(...codes);
  }
  if (sinceDate) {
    conditions.push("from_date >= ?");
    params.push(sinceDate);
  }
  if (type && type !== "all") {
    conditions.push("type = ?");
    params.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT * FROM insider_transactions
    ${where}
    ORDER BY from_date DESC, code ASC
  `;

  type DbRow = {
    id: string; code: string; insider_name: string; position: string;
    type: string; registered_volume: number; executed_volume: number;
    price: number; from_date: string; to_date: string; fetched_at: string;
  };

  const rows = db.prepare<DbRow, (string | number)[]>(sql).all(...params) as DbRow[];

  return rows.map((r) => ({
    id: r.id, code: r.code, insiderName: r.insider_name, position: r.position,
    type: r.type as "buy" | "sell" | "other",
    registeredVolume: r.registered_volume, executedVolume: r.executed_volume,
    price: r.price, fromDate: r.from_date, toDate: r.to_date, fetchedAt: r.fetched_at,
  }));
}
```

**Step 2 — Create src/interface/mcp/tools/insiderTools.ts:**

```typescript
/**
 * Task 1146 — get_insider_transactions MCP Tool (Sprint 063)
 *
 * Returns insider transaction history with on-the-fly streak computation.
 * Read path only — write path handled by insiderCheckJob (Task 1143).
 *
 * Layer: interface/mcp/tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getInsiderTransactionsFiltered } from "../../../infrastructure/db/insiderStore.js";
import { getDb } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Streak computation (read-path only — mirrors write-path logic in insiderCheckJob)
// ─────────────────────────────────────────────────────────────────────────────

interface StreakResult {
  code: string;
  position: string;
  buyDays: number;
  totalExecutedVolume: number;
  firstDate: string;
  latestDate: string;
  signal: "insider_accumulation";
}

function computeStreaks(transactions: ReturnType<typeof getInsiderTransactionsFiltered>): StreakResult[] {
  // Group buy transactions (executed only) by code + normalised position
  const groups = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    if (tx.type !== "buy" || tx.executedVolume <= 0) continue;
    const key = `${tx.code}||${tx.position.toLowerCase().trim()}`;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const results: StreakResult[] = [];
  for (const [key, txs] of groups.entries()) {
    const [code, position] = key.split("||") as [string, string];
    const distinctDates = [...new Set(txs.map((t) => t.fromDate))];
    if (distinctDates.length < 2) continue;  // streak = >= 2 for read-path (FR-6 spec)
    distinctDates.sort();
    const totalVol = txs.reduce((s, t) => s + t.executedVolume, 0);
    results.push({
      code,
      position,
      buyDays: distinctDates.length,
      totalExecutedVolume: totalVol,
      firstDate: distinctDates[0]!,
      latestDate: distinctDates[distinctDates.length - 1]!,
      signal: "insider_accumulation",
    });
  }
  return results.sort((a, b) => b.buyDays - a.buyDays);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerInsiderTools(
  server: McpServer,
  resolveDb: () => Database = getDb,
): void {
  server.tool(
    "get_insider_transactions",
    "Return insider transaction history from SSC disclosures. Includes on-the-fly streak detection for accumulation patterns. If code is omitted, returns all watchlist stocks.",
    {
      code: z.string().optional().describe("Stock ticker, e.g. 'VNM'. If omitted, returns all watchlist stocks."),
      days: z.number().int().min(1).max(90).default(30).optional().describe("Lookback window in days (1–90). Default 30."),
      type: z.enum(["buy", "sell", "all"]).default("all").optional().describe("Filter by transaction type. Default 'all'."),
    },
    async ({ code, days = 30, type = "all" }) => {
      try {
        const db = resolveDb();
        const lookback = Math.max(1, Math.min(90, days));
        const sinceDate = new Date(Date.now() - lookback * 86_400_000)
          .toISOString()
          .slice(0, 10);

        // Resolve codes: single ticker or all watchlist codes
        let codes: string[] | undefined;
        if (code) {
          codes = [code.toUpperCase().trim()];
        } else {
          type WlRow = { code: string };
          const wl = db.prepare<WlRow, []>("SELECT DISTINCT code FROM watchlist").all() as WlRow[];
          codes = wl.map((r) => r.code);
        }

        const transactions = getInsiderTransactionsFiltered(db, {
          codes,
          sinceDate,
          type: type === "all" ? undefined : type,
        });

        const streaks = computeStreaks(transactions);

        const output = {
          transactions: transactions.map((t) => ({
            code:             t.code,
            insiderName:      t.insiderName,
            position:         t.position,
            type:             t.type,
            executedVolume:   t.executedVolume,
            registeredVolume: t.registeredVolume,
            price:            t.price,
            fromDate:         t.fromDate,
            toDate:           t.toDate,
            fetchedAt:        t.fetchedAt,
          })),
          streaks,
          totalCount:   transactions.length,
          lookbackDays: lookback,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          }],
        };
      }
    },
  );
}
```

**Step 3 — Register in src/interface/mcp/tools/index.ts:**

Add to the existing registration chain:

```typescript
import { registerInsiderTools } from "./insiderTools.js";
// ...
registerInsiderTools(server);
```

---

## Task Breakdown (for PM)

Dependency order following the REQ-063 batch structure:

| Task | Title | Depends on | File(s) |
|------|-------|------------|---------|
| 1141 | FR-3: insider_transactions DDL in initDatabase() + test | — | `schema.ts` |
| 1142 | FR-1: VPS script foreign flow step with env-var field names | — | `vps-scripts/fetch-prices.sh` |
| 1143 | FR-5: Refactor insiderCheckJob — remove Telegram, add streak detection + insertAlert + evidenceFragment | 1141 | `insiderCheckJob.ts` |
| 1144 | FR-2: GET /api/foreign-flow-status endpoint + test | — | `server.ts` |
| 1145 | FR-4: Register insiderCheck cron in jobs.ts + test | 1141, 1143 | `jobs.ts` |
| 1146 | FR-6: get_insider_transactions MCP tool + insiderStore date-filter + test | 1141 | `insiderStore.ts`, `insiderTools.ts`, `tools/index.ts` |
| 1147 | FR-counts: Update project-stats.json (toolCount 91) + cron-registry.json | 1145, 1146 | `docs/data/*.json` |

Tasks 1141, 1142, and 1144 are parallelisable (no inter-task dependencies). Task 1146 can run in parallel with 1143+1145.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SSC portal HTML structure changes (column shift) | Medium | High | `sscInsider.ts::parseInsiderHtml` already skips rows with `cells.length < 9`. Log a warning when cells.length is unexpected. |
| SSC portal geo-block from France | Low-Medium | Medium | `recordJobRun` captures zero-row runs. `cronHealthAlertJob` flags degraded if 3+ consecutive zero-result runs. No code change needed. |
| `position` capitalisation variants creating duplicate streak groups | Medium | Low | Streak SQL and read-path both use `lower(trim(position))` normalisation. |
| Duplicate alert rows when streak persists across multiple job runs | High | Low | Alert row ID format `insider-streak-{code}-{utcDay}` is day-scoped. `INSERT OR IGNORE` deduplicates within the same calendar day. Streak will re-fire next day — acceptable (each day is a fresh signal). |
| `insiderTools.ts` bun:sqlite parameterised query with dynamic IN clause | Medium | Medium | `getInsiderTransactionsFiltered` builds the IN clause from an array of `?` placeholders — no string interpolation of user input. Array spread into `.all(...params)` is safe in `bun:sqlite`. |
| VPS `jq` field dereference on missing field names | Low | Low | `(.[$fbuy] // 0)` uses jq null-coalescing — if field is absent the value is 0 and the item is still included with `foreign_volume: 0`. |
| `sent_by` column missing from production alerts table | Low | High | `sent_by` was added in Task 064. If `ALTER TABLE ADD COLUMN IF NOT EXISTS` was not run on prod, the `INSERT OR IGNORE` will fail silently. Mitigation: verify prod schema in Task 1141 test, add `ALTER TABLE` guard in schema.ts for `sent_by`. |

---

## Security Review

- SQL parameterized? Yes — all new queries in `getInsiderTransactionsFiltered`, `detectAccumulationStreaks`, and the diagnostic endpoint use `?` placeholders only. The IN-clause uses a computed number of `?` placeholders, never string-interpolated input.
- File paths validated (no `../`)? Yes — no file path handling in this sprint.
- External HTTP rate-limited? N/A for Track B (SSC fetch was already in place). Track A is a VPS shell script, not Bun code.
- Secrets via Bun.env only? Yes — `VPS_PUSH_API_KEY` auth for the diagnostic endpoint reads `process.env.VPS_PUSH_API_KEY` following the same pattern as `/api/push-foreign-flow`.

---

## Test File Specifications

### src/__tests__/1141-insider-ddl.test.ts

```
describe("1141 — insider_transactions DDL")
  it("initDatabase creates insider_transactions table")
    → db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='insider_transactions'").get()
    → expect not null
  it("idx_it_code_from_date index exists")
  it("idx_it_type_from_date index exists")
  it("insertInsiderTransaction succeeds after initDatabase")
```

### src/__tests__/1143-insider-check-job.test.ts

```
describe("1143 — insiderCheckJob refactor")
  it("runInsiderCheck stores transactions in DB (mock fetchInsiderTransactions)")
  it("runInsiderCheck does NOT call sendTelegramMarket")
  it("runInsiderCheck inserts alert row when streak >= 3 buy days")
  it("runInsiderCheck inserts evidence fragment when streak >= 3 buy days")
  it("runInsiderCheck does NOT insert streak alert for sell transactions")
  it("runInsiderCheck deduplicates: second run same day does not insert duplicate alert (INSERT OR IGNORE)")
```

### src/__tests__/1144-foreign-flow-status.test.ts

```
describe("1144 — GET /api/foreign-flow-status")
  it("returns 401 when no API key")
  it("returns 200 with null lastPushSummary when no push has occurred")
  it("returns configuredFields from Bun.env with defaults (fbuyVol, fsellVol, currentRoom)")
  it("returns lastPushSummary.itemCount when vps_push_log has rows for service='foreign-flow'")
  it("returns staleSince when last push > 48h ago")
  it("returns staleSince=null when last push is recent")
```

### src/__tests__/1146-get-insider-transactions.test.ts

```
describe("1146 — get_insider_transactions MCP tool")
  it("returns transactions for a specific code within lookback window")
  it("omitting code returns transactions for all watchlist codes")
  it("type='buy' filter excludes sell rows")
  it("streaks computed: >= 2 distinct from_date buy entries creates streak entry")
  it("streaks: executedVolume=0 rows excluded from streak count")
  it("totalCount equals transactions.length")
  it("results ordered by from_date DESC")
  it("days clamped to max 90")
```
