# Task Report 1495 — compact
date: 2026-04-19
outcome: APPROVED

changed:
- src/infrastructure/db/schema.ts:360-390 — macro_indicators DDL +9 cols + idempotent ALTER migration
- src/interface/mcp/server.ts:1321-1458 — POST /api/push-tradingeconomics + TE_COLUMN_MAP allowlist
- vps-scripts/fetch-tradingeconomics.sh (NEW) — 12 indicators via TE API + push
- src/__tests__/1495-tradingeconomics-vps-push.test.ts (NEW) — 8 assertions

bun test (task): 8 pass / 0 fail
bun test (full): 5682 pass / 0 fail (baseline ~5672 + 8 new + 2 pre-existing delta)
tsc: 0 errors
ddd: PASS (interface imports infrastructure — permitted by layer rules)
security: PASS — SQL injection blocked (TE_COLUMN_MAP allowlist enforces col names; values parameterized); Bun.env used in prod code; process.env in test scaffolding only (beforeAll/afterAll)

## Merge Notes
Conflict in server.ts between task/1495 (push-tradingeconomics) and main (push-reuters from 1494).
Resolution: kept both endpoints. Both tests pass post-merge.

## Unblocked
1499_a and 1499_b (push-gso endpoint) now unblocked — macro_indicators +9 cols merged to main.

## Server Restart Required
Schema change (new cols via ALTER). After deploy: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp

verdict: APPROVED
merge_commit: f3de96a
