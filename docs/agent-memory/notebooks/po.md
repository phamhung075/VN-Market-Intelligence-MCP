# PO Notebook

_Last: 2026-07-07T17:06Z_

## Tick 2026-07-07T16:37Z (dev-team fire-election triage) — 5 inputs, ZERO new rows (anti-churn convergence)

Handed 2 pendingSignals + 4 NEW Telegram reports. Disposition = dedup/advance/fold/ack — no dup mints (systemic-review 07-04 churn mandate honored; backlog stayed 418).

1. **ci_red f71643fb (bun test)** — NOT a new problem. gh confirms the CI workflow is RED continuously across c5b5f885 -> fb366a1e -> f71643fb (all `bun test` failure; c5b5f885 is git-ancestor of f71643fb). Already tracked by `CI-RED-c5b5f885-FIX` (TODO, backlog). Its resolved-by-chain hypothesis (31caeefcd search-timeout dep would close it GREEN) is DISPROVEN — both subsequent pushed HEADs still CI=failure. ADVANCED that row in place (orch-apply rc0): plan_only false, blocking true (red bun test strands fleet pre-push hook — red_prepush_strands_fleet), advanced_head_sha=f71643fb, folded the f71643fb+fb366a1e re-emissions, rewrote status_note = now a GENUINE coding FIX. RETURNED in BATCH for dispatch. Stable red x3 HEADs = not flaky.
2. **gateway 502 @16:30Z (dispatcher-error, cowork-team)** — RESOLVED. Same incident as ops #3505 (Docker daemon shutdown, restarted, localhost:3000 + zenmidi both healthy ~16:35Z) AND operationally proven UP (this tick's gateway ops all succeeded). ACK/close, no task.
3. **pollNews 0-items @~16:45Z (#3506, analysis-agent)** — corroborates in-progress `FIX-NEWS-VPS-CRASH-LOOP` (ops-vps-fetch already reconning the news-VPS crash signature). DEDUP — no new task; symptom of active work (or transient during the 16:35 Docker restart). Did NOT touch the in_progress/head lane (active work).
4. **CTG 2026-Q1 composite=0.00 (#3508)** — DEDUP: already `W5-FU-CTG-REFINE-96e36139` (review[], BLOCKED on DEPLOY-GATE: ops rebuild+deploy of FIX-BCTC-BANK-BS-COLUMN-ORDER then live finalize_bctc_refine). Re-flags because the gated reingest hasn't run. No task; review row is USER/deploy-gated -> NOT touched.
5. **D2D 2026-Q1 composite=0.10 (#3507)** — non-bank, untracked. FOLDED into `OPS-BCTC-REFINE-REPASS-NONBANK-5T` (folded_reports[], report_id TBD via get_bctc_pending_refine) instead of a standalone per-ticker row. Same DEPLOY-GATE + generic_mandate (no per-ticker regex).

**Writes:** 1 atomic orch-apply (rc0) — 2 backlog in-place edits, 0 rows added (418->418). No head/in_progress touch. Commit explicit-paths. No Telegram (nothing blocked/new). Fleet-push launchd timer owns push.

## Carry-over
- **CI-RED-c5b5f885-FIX** (backlog, blocking, TODO) — real coding FIX now; dev reads run 28689707086 logs to find failing bun-test file(s). Closes only on ci_green after f71643fb. RETURNED for dispatch.
- **OPS-BCTC-REFINE-REPASS-NONBANK-5T** (+D2D folded=6 tickers) & **W5-FU-CTG** & **REFLOW-MBB** — ALL await the SAME user-gated ops rebuild+deploy, then batch reingest (CTG+MBB+D2D+5 nonbank) in one post-deploy repass.
- **W5 deploy-gate rows in review[] (W5-FU-CTG, TASK-W5-...-REINGEST)** — deploy/USER-gated. Never promote/touch.
- **DEPLOY-GATE (standing):** any BCTC code/VPS fix -> route gated deploy/verify to ops (OVERRIDE 07-03: delegate, don't wait on user).
- **SYSTEMIC-REMAKE-P1** — 4 promoted + 10 atomic held supervised; Phase-2 USER-GATED. Router adjudicates re-promotion on a supervised tick.
- **P1 TODO stubs** (FIX-NEWS-CB-FALSE-CLOSED, FIX-BCTC-FPT-BT5-BALANCE-GATE, FIX-TA-INDICATORS-TIER3-ROUTING) — groom (detail_ref + live re-verify + next_agent) BEFORE promote; TA one may be a dup.
