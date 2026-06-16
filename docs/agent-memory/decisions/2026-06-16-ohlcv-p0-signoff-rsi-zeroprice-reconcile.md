---
task_id: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
date: 2026-06-16T04:37Z
by: po-s77 / po-s78
commit: 2431e74d
---

# Decision — OHLCV-P0 sign-off + RSI-SINGLEDIGIT / ZERO-PRICE-RACE reconcile

## what-considered
- OHLCV-P0 disposition: (a) full done_verified now, (b) done with live_partial_verdict + pending_behavioral_gate, (c) demote qa's already-applied done_verified back to review.
- Chosen: **(b) layered onto qa's existing done_verified**. Rationale: a concurrent qa agent (cycle-276, commit 138bd74e) ALREADY moved review->done_verified between my reads (signal-row-lags-ground-truth class). qa's done_verified_evidence is RAW-sound and I independently re-verified the SAME live values (RSI 35.7/36.2/27.3, full 6-figure price, image 1c6f739c @04:29Z, tsc EXIT 0). Demoting (c) would thrash a correct lane. But qa OMITTED the next-session behavioral gate. So I kept the lane and STAMPED a po_signoff block carrying the full PO provenance (7 impl_commits, qa_verdict cycle-275, rebuild_landed_at, created_gate PASS, live_heal, residual_boundary) + the pending_behavioral_gate (mirrors RSI-SINGLEDIGIT pattern). done_verified is honest for code+ci+deploy+live-data NOW; the RE-corruption proof (next post-rebuild Writer D / briefing / TA scan) is next-session-only.

## why-change
- From the router's recommended "review->done with live_partial_verdict": the board had already advanced to done_verified under me. I reconciled rather than fought it — accepted the verified lane, added the missing gate. Net effect matches the router's intent (done + behavioral gate pending) without a demote-then-repromote thrash.

## RSI-SINGLEDIGIT (review[])
- Kept in review (NOT done_verified). Its root cause (OHLCV-P0) is now fixed+deployed+healed -> the DATA half of its 2026-06-16 gate is GREEN (canonical un-poisoned). The 2026-06-16 RED verdict is SUPERSEDED (superseding task closed). But the BEHAVIORAL half (next briefing 01:00Z + TA scan 02:15Z, majors mid-band, match canonical within 0.1pt, generic) is the SAME shared next-session gate. Stamped po_s78_disposition with the done_verified_release_condition = flip on the next tick that RAW-observes the gate GREEN. Withheld done_verified per non-zero-values plausibility + behavioral-gate discipline. Not a re-dispatch (code complete + rebuilt 2026-06-15T08:02Z + live).

## ZERO-PRICE-RACE (backlog HELD)
- Kept HELD. depends[] = [RSI-SINGLEDIGIT, OHLCV-P0]; OHLCV-P0 cleared, RSI-SINGLEDIGIT pending shared gate. The seed-bar that was this task's actual gia=0 source is now KILLED by the P0, so the race surface may be subsumed. Release condition: backlog->ready ONLY after a clean post-fix market open (shared behavioral gate GREEN), and RE-SCOPE FIRST (verify the gia=0 open-window path still reproduces; possibly fold/close as subsumed).

## PUSH
- HELD per router instruction. Router RAW-noted: the TS2367 head-chain (FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367) is CODE-RESOLVED on HEAD (6f9b3eba) and bunx tsc --noEmit = EXIT 0 (re-verified). So the push BLOCKER is technically cleared in code — but PUSH is the router's call, not po's, and the head-chain board lane (ready[], ba/po-s74) is in-flight; I did NOT touch it. Recorded the tsc-green finding in po_signoff.tsc_state_note so the router has it for the push decision.

## FOLLOW-ON minted
- FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (P3, S, dev-mcp-server, apps/mcp-server/, backlog, fast_track_eligible) — extend detectAndNormalizeScaleFromPrevClose to auto-repair the x1000 direction at write-time (currently FR-G2 only flags it). Per qa cycle-275 recommendation.
