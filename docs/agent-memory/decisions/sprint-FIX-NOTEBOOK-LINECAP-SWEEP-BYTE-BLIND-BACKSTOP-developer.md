# Decision Journal — Sprint FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP · developer

**Sprint goal:** notebook-linecap-sweep.sh (the ONLY write-path-agnostic cadence backstop for notebook caps) is byte-blind on both ends — line-only pre-filter + line-only success predicate — so 9/10 live over-byte-cap notebooks (line-under) never reach the already-fixed byte-aware pruner via the cron path.
**Agent:** developer
**Started:** 2026-07-29T00:15Z

---

### STEP developer-S1 · developer · 2026-07-29T00:16Z
**task-id:** FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP
**what-done:** Zone check: files are `scripts/` + `docs/data/file-size-caps.json`, both map to specialist `developer` per system-map.json — handled directly, no dispatch. Read predecessor commit `b42f3fa3a` (notebook-auto-prune.sh dual-axis fix) and its own decision journal — this row is exactly that task's own flagged follow-up finding (STEP developer-S7).
**what-considered:**
- only path: mirror the already-shipped hook fix's LINE_CAP/BYTE_CAP derivation exactly (same SSOT read, same `LINE_CAP*60` formula, same fallback) rather than inventing a second derivation.
**why-decision:** row explicitly calls out this file's hardcoded `cap=200` as "the exact second-hardcoded-copy defect the hook fix explicitly avoided" — reusing the identical derivation closes that class of bug instead of adding a third copy.
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-29T00:20Z
**task-id:** FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP
**what-done:** Wrote failing test case (byte-over/line-under fixture: ~140 lines, ~900 bytes/line → well over BYTE_CAP=12000 but under LINE_CAP=200) in `notebook-linecap-sweep.test.sh` before touching the script (RED phase) — confirmed it fails against the pre-fix script (fixture never reaches OVER-CAP path).
**what-considered:**
- only path: TDD mandate — failing test first.
**why-decision:** matches `docs/agents/developer/flow/main.md` TDD workflow; also gives AC5 (regression coverage for byte-over/line-under SELECTED+PRUNED) a concrete artifact.
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-29T00:35Z
**task-id:** FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP
**what-done:** Implemented dual-axis pre-filter (`line_count > LINE_CAP OR byte_count > BYTE_CAP` selects) and dual-axis PRUNED/NO-CHANGE predicate (`new_line_count < line_count OR new_byte_count < byte_count`), both LINE_CAP/BYTE_CAP read at runtime from `docs/data/file-size-caps.json` via the identical jq lookup + `200` fallback used by notebook-auto-prune.sh — removed both hardcoded `200` literals (start-banner echo + selection test).
**what-considered:**
- only path: the row's remedy is fully specified (dual-axis filter + predicate, SSOT-read caps); no design ambiguity.
**why-decision:** matches AC1/AC2/AC3 verbatim.
**why-change:** no change from plan.

### STEP developer-S4 · developer · 2026-07-29T00:45Z
**task-id:** FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP
**what-done:** AC4 raw live verification — ran the fixed sweep for real (no env override) against `docs/agent-memory/notebooks/`, re-measured all 46 notebooks before/after with `wc -c`. Committed the resulting real notebook prunes as a separate `chore(memory)` commit (not mixed into the code-fix commit), matching prior precedent (`bf7a21d66` "context-bloat sweep (5 notebooks pruned)").
**what-considered:**
- skip the live run and rely on the sandboxed test fixture only — rejected: AC4 explicitly requires "RAW live verification (not self-report)"; the sandboxed test alone does not touch real notebooks.
**why-decision:** row's own verification_gate is worded as a live re-measurement, not a unit-test pass; running the fixed cron backstop for real against production notebooks is the row's literal purpose (it is the same script code-janitor's 6h cron invokes).
**why-change:** no change from plan.
