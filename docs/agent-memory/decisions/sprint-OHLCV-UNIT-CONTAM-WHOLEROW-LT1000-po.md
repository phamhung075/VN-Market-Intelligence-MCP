# Decision Journal — Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 · po

**Sprint goal:** Eliminate the 2nd daily_ohlcv unit-contamination class (whole-row thousands-format, close<1000) degrading public RS/ROC/52w cards; harden the writer so residue cannot re-accumulate.
**Agent:** po
**Started:** 2026-06-30T20:20:52Z

---

### STEP po-S1 · po · 2026-06-30T20:20:52Z
**task-id:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**what-done:** RAW-verified the bug via gateway (get_relative_strength + get_roc_momentum) then kicked off SPRINT-M (sprint_goal + active_sprints umbrella), promoted the backlog FIX -> ready[] (next_agent=architect), repointed head -> architect.
**what-considered:**
- DEFER as low-pri data noise — REJECTED: RAW probe shows >=4 watchlist tickers (FPT rs594/roc606x, DHG rs922, VHM/VIC -1.35/-0.998) visibly degraded on the PUBLIC RS leaderboard — confirmed user-facing, not noise.
- Single-FIX direct-to-dev — REJECTED: needs a safe per-ticker discontinuity predicate that MUST exclude index rows (VNINDEX ~1300-1900, RC3 backfill) + a durable writer guard; data-corruption risk if predicate wrong -> architect design first.
- Route to ba (requirements) — REJECTED: WHAT is unambiguous; only HOW-to-do-it-safely is open -> architect.
**why-decision:** 2nd contamination class same table (feedback_recurring_bug_escalation) + CRITICAL data-safety caution (must not touch index/legit-cheap rows) -> architect-led design, then pm decompose -> developer (apps/mcp-server). CONTAM-6's 'close>=1000' clause structurally misses this whole-row close<1000 class, so a genuinely new repair + writer-gap fix is required.
**why-change:** no change from dev-team triage hand-off — scoped exactly the 3 deliverables requested (migration / reflow / durable writer guard).
