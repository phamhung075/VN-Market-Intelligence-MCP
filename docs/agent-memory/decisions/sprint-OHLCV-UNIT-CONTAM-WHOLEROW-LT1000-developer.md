# Decision Journal — Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 · developer

**Sprint goal:** Fix whole-row OHLCV unit contamination (close<1000) for FPT/VHM/DHG class stocks
**Agent:** developer
**Started:** 2026-06-30T23:00Z

---

### STEP developer-S1 · developer · 2026-06-30T23:01Z
**task-id:** CONTAM-10-MIGRATION
**what-done:** Authored `repair-ohlcv-unit-contamination-wholerow-lt1000.ts` + 22-test suite; added CANONICAL pointer to dev-standards.md.
**what-considered:**
- only: per-ticker anchor CTE (as spec'd in arch brief) — blind close<1000 predicate rejected (would touch legitimately cheap stocks); SQLite CTE-in-UPDATE requires 3.35+ (satisfied by Bun bundled SQLite)
**why-decision:** Architecture brief §2 mandates per-ticker anchor; CONTAM-6 precedent structure followed exactly for CLI/confirm/txn pattern.
**why-change:** no change from plan
