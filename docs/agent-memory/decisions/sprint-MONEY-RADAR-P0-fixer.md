# Decision Journal — Sprint MONEY-RADAR-P0 · fixer

**Sprint goal:** Money Radar composite tool (P0 MVP) — 4 required divergence detectors + honest-NULL guards
**Agent:** fixer
**Started:** 2026-07-01T10:41:08Z

---

### STEP fixer-S1 · fixer · 2026-07-01T10:41:50Z
**task-id:** MONEY-RADAR-P0-T2-COMPOSITE
**what-done:** Fixed deterministic null foreign_accum_z_market by correcting request field-name + empty-object drift (two-part wiring defect).
**what-considered:**
- Skip one issue, fix both (unnecessary): no, both cause production null
- Only rename field, leave empty call: incomplete, Go still receives no codes
- Only pass codes, skip field rename: incomplete, old field name still sent
**why-decision:** Both parts required: (1) field-name 'tickers'→'codes' matches Go DTO json tag, (2) pass watchlistCodes in scope to actually wire codes array.
**why-change:** QA curl-verified: empty {} always yields null, {"codes":[...41]} yields real value. Regression test added to prevent field-name drift reoccurrence.
