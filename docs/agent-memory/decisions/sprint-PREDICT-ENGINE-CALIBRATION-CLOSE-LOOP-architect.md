# Decision Journal — Sprint PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP · architect

**Sprint goal:** Prediction engine is anti-calibrated (95% confidence -> 0% actual hit rate): the LR
table is computed but never applied, and weekly Brier measurement feeds back into nothing.
**Agent:** architect
**Started:** 2026-08-22T21:10:00Z

---

### STEP architect-S1 · architect · 2026-08-22T21:10:00Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
**what-done:** Read po/ba decision journals + BA spec + all 9 sprint files at source (evidenceAccumulatorJob.ts,
calibrationReportJob.ts, likelihoodRatioStore.ts, evidenceFragmentStore.ts, evidenceTools.ts,
baseRateComputer.ts, baseRateComputationJob.ts, calibrationSnapshotStore.ts, schema-system.ts,
daily-predict.md) + the linked SPIKE row + 5 test fixture files. Wrote full technical design (FR-1..FR-5
pipeline ordering, new store schema, DDD assignment, test strategy, risk flags) as
`[Architect] Brownfield Findings` appended to the BA-spec handoff.
**what-considered:**
- FR-2 schema: key `calibration_correction_factors` by (direction, confidence_bucket) cross-tab vs
  confidence_bucket-only.
- Chose confidence_bucket-only — cross-tabbing by direction splits n=17 into thinner-than-n=3 cells,
  directly conflicting with po's Entry 7 anti-overfit ruling; bucket-only reuses computeCalibrationCurve's
  existing output verbatim with zero new query surface.
**why-decision:** smallest statistical surface that still satisfies AC-2/AC-3 without slicing the
already-thin n=17 sample any further than po explicitly ruled out.
**why-change:** narrows BA's "direction and/or confidence bucket" menu to bucket-only; documented as an
explicit non-goal (not silently dropped) in the handoff.

### STEP architect-S2 · architect · 2026-08-22T21:10:00Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
**what-done:** Designed the single ordered pipeline (LR-weighted score at write time → shrinkage → 
calibration correction → final clamp) all converging at one choke point, `get_evidence_summary`'s
new `published_probability_{direction}` fields — resolves BA's "single most important design decision"
ask (do the three FRs compose or double-correct).
**what-considered:**
- Where should FR-2/FR-3's corrections live: a new/enhanced MCP tool vs embedded in
  get_evidence_summary/create_prediction_claim (NFR-3 gave both as options).
- Chose get_evidence_summary — it already holds rawScore + fragmentCount + per-fragment LR sample
  sizes needed by shrinkage; create_prediction_claim only receives an opaque `probability` from the
  agent today and would need new params to recompute independently, a bigger/less-reusing change.
**why-decision:** one function-call chain to unit-test instead of three independently-verified pieces
that could still compound; reuses data the tool already fetches (zero extra DB round-trips for the
per-fragment LR sample sizes, already computed for the existing TRUSTED/UNTRUSTED display line).
**why-change:** no change from plan — this is exactly the ordering BA asked architect to resolve.

### STEP architect-S3 · architect · 2026-08-22T21:10:00Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
**what-done:** Resolved FR-3's "must retire daily-predict.md:25 (TIGHTENING) and :30 (degrading-calibration)"
clause. Line 30 is a strict-superset replacement by the new shrinkage+correction pipeline. Line 25
(macro regime, not evidence-derived) is NOT superseded by an evidence-based shrinkage function by
construction — folded it in as an optional `regime` param on `computeConfidenceShrinkage` (relocates
the existing "-10%" constant into the one pipeline stage) rather than silently dropping the signal or
leaving it as a second independent multiplier.
**what-considered:**
- (a) drop TIGHTENING dampening entirely as out-of-scope; (b) leave it as its own agent-prompt
  multiplier applied after published_probability; (c) fold it as an input to the shrinkage function.
**why-decision:** chose (c) — (a) silently discards an accepted existing behavior with no FR authorizing
its removal; (b) reopens the exact "parallel/duplicate correction" anti-pattern this whole sprint exists
to close (a second manual multiply stacked on an already-corrected published_probability).
**why-change:** this is a genuine small MCP tool-contract change (new optional `regime` param on
get_evidence_summary) beyond the sprint's literal FR-1..5 file list — flagged explicitly in the handoff
for PM/QA visibility, not hidden inside the FR-3 file diff.

### STEP architect-S4 · architect · 2026-08-22T21:10:00Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
**what-done:** Found and documented an architect-level regression risk BA did not flag: `getLikelihoodRatios`
(plural, no try/catch) will throw against `1118-evidence-accumulator-job.test.ts`'s own schema fixture
(confirmed it never creates `evidence_likelihood_ratios` at all, not merely leaves it empty) the moment
FR-1 wires it into evidenceAccumulatorJob — breaking every test in that file, not just the exact-value
ones BA anticipated. Designed the fix: harden `getLikelihoodRatios` with the same defensive try/catch
`getLikelihoodRatio` (singular) already has. Found the mirror-image risk on the write side: Step 6.5's
new `calibration_correction_factors` write will throw against `1128-calibration-report-job.test.ts`'s
local schema fixture (also confirmed no such table) — this one CANNOT be defensively swallowed (it's a
write, silently dropping it would hide a real regression), so flagged as a mandatory fixture update
instead.
**what-considered:** swallow-on-error at the store layer for both read and write paths, uniformly, vs
differentiate by read/write.
**why-decision:** reads defaulting to a neutral prior on a missing table is safe and already the
established pattern (getLikelihoodRatio singular); writes silently no-op'ing on a missing table would
mask a real schema-drift bug in production, not just in tests — different risk profile, different fix.
**why-change:** none from po/ba's scope — this is new information (a fixture DDL gap) surfaced only by
reading the actual test files at source, per architect's own brownfield-first mandate.

### STEP architect-S5 · architect · 2026-08-22T21:10:00Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
**what-done:** Answered the linked SPIKE's own question (root-class verdict, folded per po's instruction,
not re-triaged independently): root class is (b) cache never recomputed/invalidated once a stock's
fragments all expire (runEvidenceAccumulator's stock-enumeration query simply stops visiting it), not a
distinct "pruned after score computed" mechanism — the recency bound (FR-4) is the correct, minimal fix
for this exact class, reusing the existing 30-day fragment-window constant rather than adding a new
live-COUNT reconciliation query per call.
**what-considered:** age-bound (cheap, reuses existing data) vs the SPIKE's own alternative
(reconcile scoreRow.fragmentCount against a live COUNT on every call).
**why-decision:** age-bound achieves the same honest-degrade outcome at zero extra query cost.
**why-change:** no change — this is exactly the SPIKE's own deliverable, executed as FR-4's outcome per
po's fold-not-remint instruction.

### STEP architect-S6 · architect · 2026-08-22T21:10:00Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
**what-done:** Confirmed no MCP gateway/vn-market tool binding this session (Read/Edit/Write/Bash only —
same recurring limitation ba's cycle noted). Did not attempt task_claim/task_release/send_telegram;
router holds the PRE-CLAIM (intent:architect:predict-engine-calibration-close-loop-20260822) and per the
spawn prompt will release it on RETURN since this grant lacks the MCP tool binding.
**what-considered:** only path — no MCP tool surface available to attempt any call against.
**why-decision:** fail-loud-protocol: do not fabricate a tool call that did not happen.
**why-change:** no change from plan.
