# PO Notebook

_Last: 2026-06-30T17:28Z_

## Tick 17:28Z — Sprint kickoff FB-POSTER-LAUNCHD-FIRER (router req, coord d3292ca4)

**Goal:** durable OS-level all-local launchd firer for the guaranteed FB slots (fb-daily 09:15Z Mon-Fri, fb-weekend 13:13Z Sat-Sun) — independent of any live Claude CLI session. Root cause: the */15 cowork dispatcher is session-scoped; 06-30 fb-daily 09:15Z missed (posted ~6h late) — project_cowork_guaranteed_slot_needs_live_cli_session.

**Minted (scripts/po-s136-*.jq | orch-apply.sh — Stage0/1 PASS, 96 pre-existing SHG warnings non-mine):**
- sprint_goal entry FB-POSTER-LAUNCHD-FIRER (active).
- ready[]: FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL (developer, LEAD) — wrapper scripts/fb-poster-headless.sh (claude -p --dangerously-skip-permissions, single flow only) + 2 DST-robust plists + install/verify script + doc pointers.
- backlog[]: FIX-FB-WEEKEND-DEDUP-GATE (cowork-refactory-expert, ROUTER lane, parallel) | FB-LAUNCHD-OPS-INSTALL-VERIFY (ops, depends DEV) | FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP (qa, depends OPS+weekend-fix).

**Key design calls:**
- DOUBLE-POST GUARD = INHERITED: wrapper invokes the SAME flow → STEP 0a period-keyed task_claim `published:fb-daily:<VN-DATE>` (ttl 100800) dedups launchd vs cowork-*/15; first wins, other no-ops. Wrapper must NOT add a divergent key.
- GAP FOUND (RAW-grep): weekly-recap.md + weekly-prediction.md have NO dedup gate — main.md claim is false. Weekend firer unsafe until FIX-FB-WEEKEND-DEDUP-GATE ships → made it a hard prerequisite.
- DST = the "hard part": developer picks UTC self-gate vs dual-local-entry (AC3), mirror fleet-push.plist pattern. claude bin = /Users/admin/.local/bin/claude. Slot times from cowork-schedule.json SSOT (flow doc's 13:07Z is stale, use 13:13Z).
- QA gate = OBSERVED fire (real post written) + dedup demo + survives-session-end. exists != fires.
- head LEFT on the live OHLCV epic (session e71c7736) — no hijack.

## Carry-over
- FB-POSTER-LAUNCHD-FIRER: DEV in ready[] — dev-team cron adopts when WIP frees (OHLCV epic owns head, WIP=2). Router should ALSO dispatch FIX-FB-WEEKEND-DEDUP-GATE (cowork-refactory-expert lane, parallel-eligible).
- On QA PASS → FB-LAUNCHD-DEV row's withheld behavioral gate satisfied → done_verified.
- OHLCV-DEPTH epic (other session) — not my work this tick; head owned there.
- Decision trail → decisions/sprint-FB-POSTER-LAUNCHD-FIRER-po.md (po-S1..S3).
