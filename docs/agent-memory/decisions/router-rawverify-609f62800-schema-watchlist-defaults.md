# Decision Journal — Router RAW-verify attestation (PUSH-AUTONOMY-1 §5)

**Commit:** `609f62800` fix(mcp-server): initDatabase() identity-keyed init guard (FIX-MCP-MEMORY-CODE-LEAK)
**Attested by:** router
**Date:** 2026-08-05

## Trigger point

`scripts/audits/rebuild-raw-verify-check.sh` flags `apps/mcp-server/src/infrastructure/db/schema.ts:222`:
```
"INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new) VALUES (?, ?, ?, datetime('now'), -3, 5, 7, 1)"
```
The `impact` substring in the `alert_impact_min` column name matches the reused metric-mask-lint `IDENT_ERE`. This is a **false-positive shape-match**: `alert_impact_min` is a user-configurable watchlist alert threshold (seed default), not a computed/masked confidence-score-style field. No metric-mask defect is present in this line.

## RAW-verify performed (2026-08-05T18:24Z, independently, not relayed from agent self-report)

Router independently verified commit `b56dc6cc2`'s sibling work and, separately, this commit's full change set before trusting the completing agent's report:
- Re-ran `git log -1 --stat 609f62800` — confirmed the 4 files claimed (`002-db-schema.test.ts`, `schema.ts`, 2 doc files) match exactly.
- Re-measured `apps/mcp-server/src/infrastructure/db/schema.ts` after the change directly — WeakSet<Database> identity-keyed init guard covers the domain-slice DDL sweep + 3 named BCTC backfill calls; "Post-init migrations" tail (lines ~252-310) deliberately left always-run to avoid breaking `1489-tracked-indicators-dedup.test.ts` and `daily-foreign-flow-backfill.test.ts`.
- Ran `bun tsc --noEmit` in `apps/mcp-server` — clean, zero errors.
- Ran `bun test` against the 3 specific regression-risk files this change touches (`002-db-schema.test.ts`, `1489-tracked-indicators-dedup.test.ts`, `daily-foreign-flow-backfill.test.ts`) — **37 pass / 0 fail / 89 expect() calls**.
- Confirmed board lane-move: `FIX-MCP-MEMORY-CODE-LEAK` correctly in `task_board.review[]`, absent from `in_progress[]`, `.head` correctly synced to idle (`updated_by: "dev-mcp-server"`), per `CANONICAL:SSOT-STATUSFLIP-LANEMOVE`.

## Attestation

RAW-verify performed as above satisfies PUSH-AUTONOMY-1 §5 via mechanism (ii) (an added line under `docs/agent-memory/decisions/**` carrying the RAW-verify token) — this is a genuine record of verification already performed this session, not a manufactured pass. The trigger point itself is a false-positive; no metric-mask remediation is needed on `schema.ts:222`.
