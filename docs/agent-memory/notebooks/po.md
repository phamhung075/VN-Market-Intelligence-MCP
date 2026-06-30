# PO Notebook

_Last: 2026-06-30T20:21Z_

## Tick 2026-06-30T20:21Z — Kickoff OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 (dev-team triage, coord e71c7736)

**Finding (RAW-verified by ME via gateway 20:13Z — do NOT re-probe):** 2nd daily_ohlcv unit-contamination class, whole-row thousands-format (close<1000, e.g. FPT close=70.2 = 70200 VND) over ~Aug2025-Feb2026. Visible on the PUBLIC RS leaderboard across >=4 watchlist tickers (more than the 3 first triaged):
- FPT: rs h252=594.07 (LEADING artifact) / roc=606.29x decile10
- DHG: rs h63=922.59 + h126=918.06 (NEW — not in original triage)
- VHM: rs h126=-1.066 / h252=-1.350 p0 / roc=-0.998
- VIC: rs h252=-1.349 p2.78 (vs healthy h63 +0.475) / roc=-0.998
FPT recent 7 bars are CLEAN (70,200) → contamination is in the PAST window, exactly as triage said.

**Precedent (read, not re-derived):** prior sprint OHLCV-UNIT-CONTAM (CONTAM-4 writers / CONTAM-5 sanity job ohlcvSanityCheckJob.ts / CONTAM-6 repair scripts/migrations/repair-ohlcv-unit-contamination.ts / CONTAM-7 test). CONTAM-6 WHERE='(open<100 OR low<100) AND close>=1000' + normalizes only open/low → STRUCTURALLY misses this whole-row close<1000 class. Writer normalizeOhlcvToVnd fires x1000 only when max(OHLC)<100 → gap for mid-scale (100-1000) + all-series-contaminated (no clean prev_close).

**Decision = CREATE SPRINT-M (not defer, not direct-FIX):** scripts/po-s135-*.jq | orch-apply.sh (Stage0/1 PASS; 97 pre-existing SHG warnings not mine). Conservation backlog -1 / ready +1 / active_sprints +1 / sprint_goal +1; idempotent (re-run delta 0). Promoted FIX backlog→ready (SPRINT-M, P3→high, next_agent=architect, 3 deliverables + 4 critical_cautions + verification_gate + generic_mandate). Repointed head→architect. Sprint umbrella lock claimed (task:OHLCV-UNIT-CONTAM-WHOLEROW-LT1000).

**Key calls:**
- architect-first (NOT ba/direct-dev): WHAT is clear, only safe-HOW is open. CRITICAL caution = predicate MUST be per-ticker ~1000x discontinuity, NOT blind close<1000, and MUST exclude index rows (VNINDEX ~1300-1900, RC3 253-bar backfill) + legit-cheap stocks.
- recurring-bug-escalation: 2nd contam class same table → durable WRITER guard (deliverable C) is the real exit, not another one-off repair.
- reflow (deliverable B): RS tool returns source_tier 3 LIVE → likely computed-on-read (self-heals post-normalize); architect determines materialized-vs-computed FIRST.
- ahead=13 < push threshold 20 → no backstop push; fleet-push timer owns push.

## Carry-over
- Router: head→architect dispatches design of safe predicate + writer-gap + reflow plan; then pm decompose → developer (apps/mcp-server).
- Acceptance gate (RAW): get_relative_strength |rs|<=~3 all tickers + get_roc_momentum sane band; VNINDEX 253 bars untouched; writer unit-test rejects synthetic thousands push; CONTAM-5 flags close<1000 class.
- Decision trail → decisions/sprint-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000-po.md (po-S1).
