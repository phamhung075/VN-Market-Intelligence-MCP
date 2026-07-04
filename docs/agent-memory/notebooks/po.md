# PO Notebook

_Last: 2026-07-04T06:07Z_

## Tick 2026-07-04T06:07Z (router-dispatched) — quiet grooming tick, WIP=0: 1 MINT (plan-only), verdict NOTHING

First quiet tick since head directive "drain deferred backlog (MBB batch-reflow + drain-esc follow-ups)". Both named targets un-drainable: **REFLOW-MBB-Q1-2026 = BLOCKED** (user-gated rebuild, not promotable); **drain-esc follow-ups = 0 rows** in backlog (grep drainesc/severity-recurrence → empty; the FIX-DRAINESC sprint already closed done_verified). pendingSignals empty; telegram #3502/#3503 pre-tracked (don't re-mint).

**Item 1 (cold-evict 31 DONE rows) — CORRECTED the inputs framing.** The 31 status=DONE rows are inside `.task_board.backlog[]`, NOT `done[]`. RAW-verified BOTH eviction paths — `scripts/orch-cold-evict.sh` (Pass-1) AND dev-team post-cycle Step 4.2 (HSC-6) — scan only done[]/done_verified[]/active_sprints[]/sprint_goal.entries[], **never backlog[]**. So these rows are eviction-BLIND → permanent hot-file bloat (~8% of 407-row backlog; aged 06-27..06-30). Cold-evict is NOT PO's flow (it's the dev-team/pm post-cycle hook) → did NOT perform the write. Instead MINTED plan-only tracker `FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND` (backlog, P2, cross-service, id-guarded via orch-apply.sh). Root = writers flip status in-place instead of relocating backlog[]→done[]. Fix options: durable (relocate-on-terminal) / one-time relocate / extend HSC-6 predicate to scan backlog[]. generic_mandate baked (no one-off script).

**Item 2 (promote a READY item) — declined, none genuinely ready.** WIP=0 (slot free) but every P1/high TODO is a thin STUB (only detail_ref+title; no next_agent/root_cause/fix_spec/files/vgate; FIX-TA-INDICATORS-TIER3-ROUTING even carries folded_under+superseded_note). DEFERRED rows intentionally parked (corpus/infra/low-pri). Promoting an ungroomed weeks-old stub cold = force-dispatch of stale/inverted spec (po-s138 class). Mandate explicitly authorizes NOTHING; did not force-promote.

**Writes:** one atomic jq→orch-apply rc=0 (backlog 406→407, +1 plan-only mint; 105 pre-existing SHG lane-coherence warns non-blocking — they independently corroborate the drift). ready/in_progress stay 0; user-owned review[] (3 W5 rows) byte-untouched; `.head` untouched. No push (fleet-push timer owns; ahead=25). Provenance "(po router-dispatched)" — 0 session UUID in any tracked file. Verdict to router: **NOTHING**.

## Tick 2026-07-04T04:07Z — 2 telegram reports → 1 MINT + 1 DEDUP, verdict NOTHING

#3502 get_foreign_room token-budget (RECURRING 3rd) = MINT `FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET`. #3503 A-13 api-gw /health CURL_ERR = DEDUP FALSE-POSITIVE (curl :4000/health HTTP 200 x3) → folded into FIX-AUDITOR-HEALTHCHECK-FALSE-UNHEALTHY-NONHTTP-SERVICES. Both PLAN-ONLY → NOTHING.

## Carry-over
- **FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND** (backlog, plan-only, P2) — durable root: relocate backlog[] rows to done[] on terminal transition so HSC-6 archives them; 31 stranded DONE rows need a one-time conservation-guarded relocate (they lack created_at → stamp completed_at at move for the 7-day age gate). Dedup against the SHG lane-coherence migration when groomed.
- **REFLOW-MBB-Q1-2026** — BLOCKED on user-gated mcp-server rebuild+reingest (ops). At gate-clear, batch MBB+CTG reflow in ONE reingest pass. Do NOT redispatch Opus while parked.
- **FIX-DRAINESC-SEVERITY-RECURRENCE-GATE** — DONE_VERIFIED (qa PASS, router re-ran 11/11). Sprint closed.
- **W5 deploy-gate rows in review[] (3)** — USER-OWNED. Never promote/touch over them.
- **DEPLOY-GATE (standing):** any BCTC code/VPS fix → route gated deploy/verify to ops (don't wait on user).
- **P1 TODO stubs** (FIX-NEWS-CB-FALSE-CLOSED, FIX-BCTC-FPT-BT5-BALANCE-GATE, FIX-TA-INDICATORS-TIER3-ROUTING) — need a grooming pass (pull detail_ref, re-verify root still live, add next_agent/spec) BEFORE any promote. TA one may be a dup (folded_under).
