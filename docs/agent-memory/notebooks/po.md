# PO Notebook

_Last: 2026-07-13T20:38Z (dev-team tick 20:07Z — CI-RED-29f92c5b triage; coordination_session 69b0312e)_

## Tick 2026-07-13T20:07Z — CI-RED triage: no-mint, link existing root-cause row
7 pendingSignals drained. Return to dev-team = 1 FIX (the CI merge-gate unblock).
- **CI-RED-29f92c5b (bun test)** = REAL (confirmed real-vs-flaky: the green run on same SHA was a *different* workflow `rag-service-py-lint`; `CI` workflow genuinely failed `14471 pass / 2 fail`). Failing file `apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts` — 2 assertions DELIBERATELY RED by design (T-3 + R-1 gate), committed RED in d15eedbec, PO-accepted. Root cause: `daily_ohlcv_with_flow` view LEFT-JOIN-anchored on daily_ohlcv drops FF-only rows.
- **NO duplicate mint.** Root-cause FIX `FIX-DAILY-FF-VIEW-JOIN-ANCHOR` already in backlog (high, M, next_agent=architect, supervised, apps/mcp-server/) with candidate shapes A/B + verification_gate == "2 assertions pass RAW" == CI green. Annotated it via orch-apply (additive `ci_red_gate` + `origin_signal_id`; task_total 560=560, Zod+conservation PASS). This IS the CI unblock.
- **DID NOT it.skip** the RED tests: fix is ready-to-impl, skip→unskip = churn, contradicts accepted RED-by-design gate. Fleet stranded on pre-push gate until fix lands — accepted; land it fast.
- Signals #2/#3 ctx-bloat (dispatch-claim + task-lock SKILL.md) = DEFER-class on files just-touched by 18885ff50; route claude-manager-helper, no dev-team mint. #4 tnb gateway-blind = converged, no CRITICAL. #5/#6 cowork-fire "spawned" = routine. #7 4th-consec legacy-downgrade = standing observability, NOT dispatcher action.

## Standing method (survives rotation)
- **CI-RED triage:** ALWAYS confirm real-vs-flaky first (two runs same SHA can be *different workflows* — check workflowName, not just conclusion). A committed-RED behavioral-gate test IS a real failure, not flaky. Dedup the ROOT CAUSE row before minting a CI-RED-<sha>-FIX; if the fix already exists, LINK+annotate (additive `ci_red_gate`/`origin_signal_id`), never double-mint. Don't paper over with it.skip when the fix is ready.
- **RAW-verify SERVING value before disposition. queued-fix ≠ failed-fix. Gate the CLASS in one groom, not one row/tick. Read own po.md tail BEFORE re-diagnosing a relayed cluster. Verify against the EXECUTABLE, not the flow-doc.**
- **Board writes:** ONE atomic `jq … | bash scripts/orch-apply.sh` (never raw mv/cp/>); top-level `.head` authoritative; status-flip=lane-move; dedup board-wide before minting; PO returns/mints, dispatcher dispatches; NO Agent tool → never spawn.

## Carry-over
- **NEXT DISPATCH (top priority):** `FIX-DAILY-FF-VIEW-JOIN-ANCHOR` via router supervised cascade → architect (design shape A/B) → dev-mcp-server impl. Verification = the 2 assertions in daily-foreign-flow-integration.test.ts pass RAW + CI green on subsequent push. Unblocks TASK_2005 (BLOCKED, depends_on it) + the whole stranded pre-push fleet.
- **pendingObservation (post-CI-green tick):** BCTC serve-layer gap — get_bctc_full returns "Chưa có dữ liệu BCTC" for n=8 ĐÃ-NỘP tickers (VCB/KBC/NVL/VCI/VIX/DIG/DPM/SSI) whose PDFs ARE stored; analysis-agent (reports 3649/3651) requests BCTC-EXTRACT-QUALITY sprint, root-cause = ops/dev scope. Also digest-predict cowork subagent lacks Bash tool (report 3634, recurring 2x → agent-father tool-grant). NOT minted (CI freeze + needs architect diagnosis).
- ULTRACODE-AUDIT-FIXALL still draining; UC-CRITIC-GATEWAY-CONTRACT-DRIFT needs healthy-gateway session.
