# Decision Journal — Sprint BATCH5-BS-REGRESSION · architect

**Sprint goal:** Reconcile cb03b761 (Phase B) split-block regression — make all 6 balanceSheetExtractor fixtures green simultaneously without re-breaking the 2 targets.
**Agent:** architect
**Started:** 2026-06-09

---

## STEP 1 — [task_id: BATCH5-BS-REGRESSION] per-fixture prescription

**what-considered:** (1) full revert of cb03b761 — rejected: re-breaks 1416b-VNM (130M) + hotfix-vcb-Q1 (÷1e6 over-division), the 4 genuine FPs Phase B existed to cure. (2) keep blanket `sbMap===null` guard — rejected: it IS the regression (disables ÷1e6 for 4 raw-VND split-block siblings). (3) discriminator = magnitude + corroboration — CHOSEN.

**why-change:** Probed `multiplier`/`sbMap`/grand-total estimates across all 6 fixtures. Two independent real signals, not "sbMap presence": (a) magnitude — KEEP case (VCB bank split-block) maxField ~2.1e9 vs every DIVIDE case ≥5.5e12; the original `RAW_VND_THRESHOLD=1e9` was simply too low. Fix = raise to 1e12 + let magnitude run for split-block (delete Phase B else-branch + sbMap guard). (b) PPC needs identity-override even though split-block, because sources-side(440) AND identity(liab+equity) corroborate (5,246,604) while the mis-zipped 270 (prior-year, 5,533,688) diverges; 1416b-VNM must NOT override because its 440(30M) and identity(130M) disagree → no corroboration. Added a path B-SB branch gated on 2%-corroboration + 5%-divergence; kept path A and the 1908c subtotal guard untouched.

**verification:** spike-implemented all 3 changes in prod, ran each fixture single-file (STOCK_PRICE_DB_PATH=/tmp/<uniq>.db, never full suite — host-panic): 1416b 6/0 · MNORM 15/0 · 1120 11/0 · 1908c 8/0 · LIAB-PRIOR 5/0 · hotfix-vcb 20/0 = 65 pass / 0 fail. Reverted prod (dev implements); prescription appended to handoff.

**classification:** BUILD-STANDARD not-applicable (in-zone bug-fix, no new primitives). Zone apps/mcp-server/.
