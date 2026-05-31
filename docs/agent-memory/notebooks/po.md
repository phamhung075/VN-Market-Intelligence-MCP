# PO Notebook

## Cycle 2026-05-31T10:08Z — OPENED sprint TOOL-SURFACE-HYGIENE (operator-approved tool-surface triage)

**Mode: sprint-seeding only. No code.** Router handed a live-probed triage of all 154 vn-market tool registrations. Authored SPRINT_GOAL.md § TOOL-SURFACE-HYGIENE (prepended, did NOT clobber ENV-ISOLATION/FU-TRUST-REFRESH ledger) + BA-TSH in TASKS.md + claimed `task:TOOL-SURFACE-HYGIENE` sprint lock.

**Raw-source verification BEFORE trusting the router (router-verify-raw + verify-raw-not-badges):**
- **#1 `get_market_hexagram` 501 — NOT a mcp-server stub.** `kinhdich/kinhDichTools.ts:510` delegates honestly to `getMarketHexagram()`→`clients.ts:505`→`GET {kinhDich}/market` on **kinh-dich-service port 5005**. The "pending B-bucket primitive wiring" 501 comes from the DOWNSTREAM SERVICE. So "wire it"=kinh-dich-service zone (diff dev owner); "deregister tool"=`apps/mcp-server/` zone. Architect MUST name the zone. This nuance was NOT in the router's framing ("dead stub in kinhDichTools.ts") — caught by reading raw.
- **NO double-registration** (I'd suspected one): `marketTools.ts:64` is the private helper `appendMarketHexagram`, not `server.tool(...)`. marketTools registers `get_market_snapshot`+`get_patterns`. Cleared by raw read.
- **154 live** = `grep -ro 'server.tool(' apps/mcp-server/src/interface/mcp/tools/ | wc -l`; matches router + HC-EXIT container `toolCount=154`. `project-stats.json toolCount=146` stale (dated 2026-05-20).

**Scope discipline:** #1 ships FIRST (only CONFIRMED defect). #2/#3/#4 = diff-before-merge (NO blind merge — architect writes the source diff first). #5 OPTIONAL/LOW. #6 reconcile LAST. OUT: BCTC tools (no recurring-bug conflict), the 3 cleared pairs, the other 5 wired kinhdich tools.

## Carry-over
- **First dispatch for router:** spawn **ba** for **BA-TSH** (requirement spec for SPRINT_GOAL.md § TOOL-SURFACE-HYGIENE). Then architect brief — REQUIRED for #2/#3/#4 source diffs and for the #1 wire-vs-deregister + zone decision.
- **#1 zone ambiguity is the load-bearing architect call:** deregister → dev-mcp-server (`apps/mcp-server/`); wire → kinh-dich-service dev. Default lean = deregister (live-but-fake oracle = CHEF-confab footgun) unless wiring is cheap.
- After dev change to mcp-server: ops REBUILD (`--no-cache` + force-recreate, not restart-stale); QA verifies surface in-container RAW not badges.
- #6 belongs to system-auditor/PM (`project-stats.json toolCount` + `infrastructureStatus.toolCount`) — reconcile after #1-#5 churn settles so final number is right.
- Other OPEN sprints untouched: ENV-ISOLATION (P1 ready, P2 gated on FU-4), FU-TRUST-REFRESH (FU-2 NEXT). No conflict — TOOL-SURFACE-HYGIENE is a different zone-cluster.
- task_claim schema = `task_id`/`task_kind`/`owner_agent`; `sprint-task` kind used for umbrella lock.
