## Task Report FR-DEGRADE-01-FIX
changed: [apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts (+34/-2), apps/mcp-server/src/__tests__/240-bctc-full.test.ts (+109)]
tests: 38 pass / 0 fail (240-bctc-full.test.ts + 1982-quality-burndown-CHIJ.test.ts, 107 expect()) | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

## Test Results
- Targeted suite (RAW re-run by qa, not badge-trusted): 38 passed / 0 failed / 107 expect()
- `bun tsc --noEmit`: exit 0
- `mock-guard.sh --files bctcFullTools.ts`: PASS (no fabricated-data pattern)
- Full-suite background reds (1518-foreign-flow timeouts, 1407b-coverage-map `market_messages`): confirmed known pre-existing flaky class, zero file overlap with the 2 changed files — not run/blocked on per Smart-Skip (test+source pair, no new domain/MCP tool/cross-service).

## DDD Compliance: PASS
No new domain->infrastructure/application imports. Change is confined to the interface/mcp layer (existing tool handler), threading two already-computed local variables (`bctcVpsStaleSince`, new `bctcVpsStaleAgeHours`) into the existing success-path response shape.

## Security: PASS
No `process.env`, no hardcoded secrets, no new SQL (reuses existing parameterized `vps_push_log` query). Empty-catch around the `vps_push_log` query is a deliberate fail-open (missing table/no rows -> `stale=false`), not a swallowed error — mirrors the pre-existing pattern already accepted in this file.

## Code Quality
Root-cause gap (verified by direct code read, not accepted on faith): the 2026-06-10 fix (815ccaed) wired `bctcVpsStaleSince` into the `!latestRow` (no financial_reports row) branch only. This fix threads the SAME already-computed variable (+ new `bctcVpsStaleAgeHours`) into the ordinary success path (`latestRow` truthy — data present, last-known-good): `content[0]` text output gains a human-readable `[FR-DEGRADE-01]` staleness note appended when `bctcVpsStaleSince !== null`; `content[1]` structured JSON gains `stale` (boolean) / `stale_since` / `stale_age_hours`. Convention matches the existing `DS-DEGRADE-01` `{stale, stale_since, source}` shape in `get_public_contracts`. The underlying financial data is never withheld — serving value is stale-but-flagged, never an error/crash, satisfying FR-DEGRADE-01's forbidden-failure-mode definition.

Read the 3 new tests directly (not trusting their names): stale-flagged case (72h push age > 48h SLA) asserts `content[0]` still contains the full `=== BCTC SUMMARY: VCB ===` output (never withheld) AND the `FR-DEGRADE-01` note, `content[1]` parses to `stale===true` + `stale_since` (string) + `stale_age_hours>48`, and `structured_data.net_profit` is still served unchanged. Fresh-push case asserts `stale===false`/`stale_since===null`/no note. No-`vps_push_log`-rows case asserts fail-open `stale===false` (cannot assert staleness with zero push history — matches the pre-existing "unknown -> not stale" contract).

## Blockers
None.

## Merge Status
Board: `FR-DEGRADE-01-FIX` moved `.task_board.review[]` -> `.task_board.done_verified[]` via `scripts/orch-apply.sh` (conservation PASS: task_total 544=544, signal_total 0=0). `.head` / `.task_board.head` left idle (was already idle pre- and post-flip). Commits carried on push: `00dca96fe` (fix+tests), `22050845b` (dev memory), `ef60d2964` (orch lane-move review flip) + this QA closeout commit.
