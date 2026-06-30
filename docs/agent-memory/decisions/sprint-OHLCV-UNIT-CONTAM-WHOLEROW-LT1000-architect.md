# Decision Journal — Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 · architect

**Sprint goal:** Eliminate whole-row thousands-format contamination in daily_ohlcv; harden writer so residue cannot re-accumulate.
**Agent:** architect
**Started:** 2026-06-30T20:40:00Z

---

### STEP architect-S1 · architect · 2026-06-30T20:40:00Z
**task-id:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**what-done:** Designed 3 deliverables (A=repair migration, B=reflow determination, C=writer guard) and produced architecture brief + handoff.
**what-considered:**
- A predicate: blind close<1000 sweep — REJECTED: touches legitimately cheap stocks and fails for index rows; PO caution explicitly forbids this.
- A predicate: per-ticker anchor (most recent clean bar, close>=1000, last 180 days) with ratio>=100 — CHOSEN: naturally handles index-ticker exclusion, RC3 skip, legitimately cheap stock skip; human-confirm dry-run covers residual anchor misread risk.
- B reflow: write a reflow migration — REJECTED: RS/ROC/52w are ALL computed-on-read by Go TA microservice (confirmed via source_tier=3 in tool docs + schema has zero materialized RS columns). Post-repair gateway probe is sufficient.
- C.1: lower normalizeOhlcvToVnd threshold to mag<1000 — REJECTED: breaks legitimately cheap stocks (100–999 VND real price). Domain function stays pure and threshold unchanged.
- C.1: add fetchCleanReferenceCloseMap in application layer as effectivePrevClose override — CHOSEN: fixes the bootstrap gap (contaminated prevClose) without touching domain purity; single batched query; no N+1.
**why-decision:** Per-ticker anchor approach is the only predicate that satisfies all 4 cautions simultaneously. C.1 fix at application layer preserves DDD invariants. B=no-reflow because evidence is conclusive (source_tier=3 in live tool code, schema confirmed).
**why-change:** No change from dev-team triage framing — all 3 deliverables implemented as specified.
