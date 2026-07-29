/**
 * check-agent-signals-dup.ts — FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
 *
 * RAW-verify replay: re-runs the GROUP BY (from_agent, signal_type,
 * stock_code, minute-bucket, payload) HAVING COUNT(*)>1 dup-group query
 * against the LIVE agent_signals table. Read-only, no writes.
 *
 * This is the canonical corroboration probe for the identical-duplicate
 * defect class (genuine double-EMISSION, not retry/upsert) — replay it
 * whenever this class of finding needs re-verification (the underlying
 * scheduler re-entrancy mechanism this class depends on remains live; see
 * FIX-SCHEDULER-DOUBLE-REGISTRATION, still BACKLOG as of 2026-07-29).
 *
 * Usage (against the live named-volume DB — docker exec):
 *   docker cp scripts/audits/check-agent-signals-dup.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/tmp/check-agent-signals-dup.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /tmp/check-agent-signals-dup.ts
 *
 * Local/CI (uses Bun.env["DB_PATH"], defaults to /app/data/market.db):
 *   bun scripts/audits/check-agent-signals-dup.ts
 *
 * Exit code: always 0 (read-only report). Verdict is in the printed summary
 * — grep for "ALL-TIME identical dup-groups:" / "ACTIVE 24h identical
 * dup-groups:" for the two headline counts the task's verification gate uses.
 *
 * LIVE RESULT (2026-07-29T05:04Z, RAW-verified against the named-volume DB):
 * total=202 rows, ALL-TIME dup-groups=0, ACTIVE-24h dup-groups=0 — the
 * 2026-06-25 finding (102 all-time / 43 active-24h) had already expired out
 * of the table via TTL + cleanExpired GC by the time of this re-check.
 *
 * Part of: docs/agents/dev-mcp-server/flow/main.md
 * Policy:  docs/policies/dev-standards.md § Script Persistence
 */

import { Database } from "bun:sqlite";

const dbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? "/app/data/market.db";
const db = new Database(dbPath, { readonly: true });

type DupGroup = {
  from_agent: string;
  signal_type: string;
  stock_code: string | null;
  minute_bucket: string;
  payload: string;
  n: number;
  ids: string;
};

const total = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
console.log(`total agent_signals rows: ${total.n}`);

const allTime = db
  .query(
    `SELECT from_agent, signal_type, stock_code, substr(created_at,1,16) AS minute_bucket,
            payload, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
     FROM agent_signals
     GROUP BY from_agent, signal_type, stock_code, minute_bucket, payload
     HAVING COUNT(*) > 1
     ORDER BY n DESC`,
  )
  .all() as DupGroup[];

console.log(`\nALL-TIME identical dup-groups: ${allTime.length}`);
console.log(`ALL-TIME dup rows involved: ${allTime.reduce((acc, r) => acc + r.n, 0)}`);

const active24h = db
  .query(
    `SELECT from_agent, signal_type, stock_code, substr(created_at,1,16) AS minute_bucket,
            payload, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
     FROM agent_signals
     WHERE created_at >= datetime('now', '-24 hours')
     GROUP BY from_agent, signal_type, stock_code, minute_bucket, payload
     HAVING COUNT(*) > 1
     ORDER BY n DESC`,
  )
  .all() as DupGroup[];

console.log(`\nACTIVE 24h identical dup-groups: ${active24h.length}`);

const attrib = new Map<string, number>();
for (const r of active24h) {
  const key = `${r.from_agent}|${r.signal_type}`;
  attrib.set(key, (attrib.get(key) ?? 0) + 1);
}
console.log("\n24h dup-group attribution (from_agent|signal_type -> group count):");
for (const [k, v] of [...attrib.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k} = ${v}`);
}

console.log("\nSample dup groups (first 10, active 24h):");
for (const r of active24h.slice(0, 10)) {
  console.log(`  ${r.from_agent}|${r.signal_type}|${r.stock_code ?? "NULL"}|${r.minute_bucket} n=${r.n} ids=${r.ids}`);
}

console.log("\nSample dup groups (first 10, all-time):");
for (const r of allTime.slice(0, 10)) {
  console.log(`  ${r.from_agent}|${r.signal_type}|${r.stock_code ?? "NULL"}|${r.minute_bucket} n=${r.n} ids=${r.ids}`);
}

db.close();
