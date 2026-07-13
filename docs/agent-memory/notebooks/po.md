# PO Notebook

_Last: 2026-07-13T21:52Z (FINAL merge-gate signoff FIX-DAILY-FF-VIEW-JOIN-ANCHOR; coordination_session 69b0312e)_

## Tick 2026-07-13T21:52Z — FINAL merge-gate signoff: APPROVED (CI-red unblocker)
- **SIGNOFF=APPROVED** for `FIX-DAILY-FF-VIEW-JOIN-ANCHOR` — sole unblocker for CI-RED-29f92c5b; entire dev-team pre-push fleet stranded behind it. Supervised cascade complete: architect cacf5607f (SHAPE=A) -> dev d71f45949 -> qa 8e905c31d (APPROVE).
- **RAW-verified by me (not self-reports):** re-ran merge-gate pair POST qa-commit -> 20 pass/0 fail/85 expect (no drift); the 2 RED-by-design assertions in daily-foreign-flow-integration.test.ts now pass. qa commit scope = 3 docs only (no prod/test/orch touch). dev impl = 1 infra/db file (schema-market-data.ts, DDD PASS) + companion schema test. 18 unpushed commits; d71f45949 NOT pushed; CI baseline GREEN thru 07-12, 29f92c5be first-red = this gate.
- **PUSH_READINESS=ready.** Pushing d71f45949 + local board/signal commits to origin/main lifts the CI-red freeze + flips CI green — BUT `git push origin main` is USER-GATED. Did NOT push. Did NOT touch orch-state head/lanes (router owns board move) or the chain-mutex lock. Single user action to surface = authorize push.

## Standing method (survives rotation)
- **Merge-gate signoff:** re-run the EXECUTABLE merge-gate pair myself POST the qa-commit (verify raw not badges; drift-check after qa's own commit), confirm qa-commit scope docs-only, confirm CI baseline (first-red SHA = the gate itself, not a prior regression). SIGNOFF only when nothing is left to fix. queued-fix != failed-fix.
- **CI-red freeze:** push lifts it — but push is USER-GATED; record PUSH_READINESS + surface the single user action, NEVER self-push. Router owns board move + chain-mutex; PO records signoff in journal+notebook only (no orch-state touch on a router-owned row).
- **Board writes:** ONE atomic `jq … | bash scripts/orch-apply.sh`; top-level `.head` authoritative; PO returns/mints, dispatcher dispatches; NO Agent tool -> never spawn.

## Carry-over
- **USER ACTION PENDING:** authorize `git push origin main` -> lifts CI-red freeze, flips CI green, clears merge gate for the stranded fleet (49 ULTRACODE + TE rows).
- **pendingObservation (post-CI-green tick — do NOT act now):** tnb signal (20:23Z); bctc_signal_FPT_20260713_routine; BCTC serve-layer gap (get_bctc_full "Chưa có dữ liệu BCTC" for n=8 ĐÃ-NỘP tickers whose PDFs ARE stored -> BCTC-EXTRACT-QUALITY, needs architect diagnosis); digest-predict cowork subagent lacks Bash tool (recurring 2x -> agent-father tool-grant).
- ULTRACODE-AUDIT-FIXALL still draining; UC-CRITIC-GATEWAY-CONTRACT-DRIFT needs healthy-gateway session.
