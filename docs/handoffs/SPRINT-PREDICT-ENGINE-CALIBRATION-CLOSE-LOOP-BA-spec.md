# Requirement Spec — SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP

**BA date:** 2026-08-22 | **Sprint:** PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP (SPRINT-L, priority high)
**Zone:** `apps/mcp-server/` | **Owner:** dev-mcp-server | **Chain:** ba → architect → pm → dev-mcp-server → qa
**Source of truth for root-cause evidence:** `docs/agent-memory/decisions/sprint-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-po.md`
(all D1-D4 findings below are po's live-verified investigation, re-read at source by BA against the
current code, not re-investigated — this spec only decomposes them into FR/DDD/AC form)

## Non-negotiable framing (carried from po, binding on architect/dev/QA)

1. **No-backtest-certification constraint (po AC-5, po Entry 7):** n=17 resolved predictions in the
   90d window, n=3 in each extreme confidence bucket. D1-D4 are structural/wiring defects, provable by
   exact code-reading and arithmetic — they do **not** need a backtest to justify fixing. QA must
   verify this sprint via **structural/code-level assertions** (unit tests on the changed arithmetic,
   store contracts, recency-bound behavior), never via a Brier/hit-rate improvement number computed off
   this same n=17 sample. A re-run of the calibration report over the same 17 claims (po's AC-5) is a
   directional sanity-check + no-regression gate only, not a pass/fail certification metric.
2. **Do not respec, do not duplicate:**
   - `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` (BCTC OCR `total_assets=0`) — separate sprint.
   - `SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE` — already `parent_sprint`-linked to this sprint
     (confirmed live in `orch-state.json`: `status_note` explicitly says "folded into
     SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP as its D4 / AC-4", `next_agent: architect`). FR-4
     below states the OUTCOME requirement only; the SPIKE's own `question`/`deliverable` fields remain
     the investigation brief for architect to execute against, not duplicated here.
   - Do NOT hard-code a sign flip or per-ticker/per-evidence-type refit for `foreign_flow_institutional`
     or the bearish channel off the VPB triple — po's Entry 5/7 showed that triple is one stale cache
     row (D4) read three times, nearer n=1 than n=3.
3. **Sequencing (informational, no action needed):** `FIX-CI-BUNTEST-167-PREDICTION-MARKET-JOB` is
   READY/dev-mcp-server, CI-red, same zone (`apps/mcp-server`). BA verified live: it touches
   `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts` (Polymarket external-market ingestion —
   `PolymarketTransportError`, `infrastructure/fetchers/polymarket.js`), which has **zero import overlap**
   with this sprint's 9 files (evidence/likelihood-ratio/calibration pipeline). No file collision; the
   "same code area" is zone-level only (`apps/mcp-server`), not file-level. No re-sequencing required —
   dev-mcp-server may land either first with no rebase risk on the other.

---

## Requirements

### FR-1 — LR-Weighted Evidence Score Aggregation (closes D1)

**DDD layer:** scheduler (`evidenceAccumulatorJob.ts`, orchestration) + infrastructure/db
(`likelihoodRatioStore.getLikelihoodRatio`, already exists) + candidate domain/services addition (pure
weighting math, if architect chooses to extract it — mirrors `baseRateComputer.ts`'s existing
domain-pure precedent of "no infra imports, db injected").

**Current defect, verified at source:** `evidenceAccumulatorJob.ts` `runEvidenceAccumulator()` computes
`score = sum(magnitude * confidence) / count` per direction and its import list is
`{logger, getDb, recordJobRun, evidenceFragmentStore}` only — `likelihoodRatioStore` is never imported.
Live proof: ACB bullish score `0.3012` = `(0.4224 + 0.1800) / 2` exactly, unmoved by both fragments'
TRUSTED LR values being `<1.0` (0.54 n=91, 0.86 n=195).

**Functional requirement:** each fragment's contribution to its direction's aggregate score MUST be
weighted by its own `(evidence_type, direction)` likelihood ratio before averaging, such that:
- A fragment backed by a TRUSTED LR < 1.0 (empirically anti-predictive) contributes **less** than its
  raw `magnitude * confidence` value.
- A fragment backed by a TRUSTED LR > 1.0 contributes **more**.
- A fragment with no LR row yet, or LR row with `sample_size < 10`, contributes at its raw
  `magnitude * confidence` value unchanged (LR = 1.0 neutral prior) — reuse
  `likelihoodRatioStore.getLikelihoodRatio`'s existing neutral-prior + `clampLikelihoodRatio(0.1, 5.0)`
  guards verbatim; do not reimplement either guard in the accumulator.
- **Horizon selection per fragment:** `getLikelihoodRatio` requires an explicit `horizonDays` (5/10/20).
  `evidenceTools.ts`'s `get_evidence_summary` already implements a horizon-selection algorithm (prefer
  shortest horizon with `sample_size >= 10`, else largest-`sample_size` honest-UNTRUSTED fallback, no
  cross-horizon blending). The accumulator MUST reuse the identical selection semantics — architect
  should factor it into one shared helper consumed by both `evidenceAccumulatorJob.ts` and
  `evidenceTools.ts` rather than maintaining two independently-drifting copies of the same algorithm.

**Acceptance identity (structural, code-level — satisfies po AC-1 and the no-backtest constraint):**
the ACB arithmetic identity `(0.4224 + 0.1800) / 2 == 0.3012` must **no longer hold** once wired, given
the same fixture inputs plus a seeded LR row with `sample_size >= 10` and `likelihood_ratio != 1.0`.

**Test-regression note (edge case, not in po's AC-6 list — BA found this independently):**
`1118-evidence-accumulator-job.test.ts` hard-codes exact unweighted-mean expected values (e.g.
`toBeCloseTo(0.72, 2)`, `toBeCloseTo(0.5 * 0.8, 2)`). These fixtures do not appear to seed
`evidence_likelihood_ratios` rows, so under the neutral-prior guard (LR defaults to 1.0 when no row
exists) these specific assertions likely continue to pass unchanged — but dev-mcp-server/QA MUST verify
this per-fixture rather than assume it, and MUST add new test cases that seed an actual
LR-row-with-`sample_size>=10` to prove the weighting takes effect (the negative-space gap: no existing
test currently seeds a non-1.0 trusted LR into this job's fixtures at all).

### FR-2 — Weekly Calibration → Likelihood-Ratio Feedback Loop (closes D2)

**DDD layer:** scheduler (`calibrationReportJob.ts`) + infrastructure/db (new write path; existing
`calibrationSnapshotStore.ts`/`likelihoodRatioStore.ts` as precedent for store shape) + candidate
domain/services addition (pure "correction factor from calibration curve" math).

**Current defect, verified at source:** `calibrationReportJob.ts` contains zero occurrences of
`likelihood` (grep -c = 0), does not import `likelihoodRatioStore`, and its 11-step run terminates at
step 9 `insertCalibrationSnapshot` + step 10 `sendCalibrationDigest`. Nothing consumes
`calibration_snapshots` to change future prediction behavior. `baseRateComputationJob` (daily, fits LRs
from fragment→outcome, D1) and `calibrationReportJob` (weekly, scores actual published predictions) are
two dead-ended loops with no path between them.

**Functional requirement:** `calibrationReportJob`'s existing per-bucket `calibration_curve` and
`avg_brier_by_direction` computation (already correct, steps 6/5) MUST feed a write-back that the
prediction-publishing path reads on its NEXT cycle, automatically, every time the job runs (weekly, same
cron `4 13 * * 0`) — no manual trigger. This is the literal "make it more recurrent" deliverable (po
Entry 3), not a nice-to-have.

**Design freedom flagged for architect (not a PO blocker — a modeling-boundary call):** an LR
(`evidence_likelihood_ratios`) answers "does this EVIDENCE TYPE predict outcomes" — a different
statistical object from a calibration correction, which answers "is our OVERALL published-confidence
bucket miscalibrated." BA recommends architect introduce a **separate** store (e.g.
`calibration_correction_factors`, keyed by `direction` and/or confidence bucket, same
neutral-prior-below-min-sample-guard + clamped-bounds shape as `likelihoodRatioStore`) rather than
overloading `evidence_likelihood_ratios` with a second, conceptually different meaning — but the final
schema choice is architect's technical design call.

**Ordering interaction with FR-3 — the single most important design decision in this sprint:**
D1/D2/D3 are three separate defects in po's writeup, but they compose into ONE published probability.
Architect MUST specify and document the exact order of operations so the three fixes do not
double-correct the same statistical signal from three different angles, e.g.:
`LR-weighted evidence score (FR-1, write time)` → `shrinkage toward base rate (FR-3, publish time)` →
`calibration-derived correction (FR-2, publish time)` → `final clamp [0.05, 0.95]`.

### FR-3 — Confidence Shrinkage Toward Base Rate, Replacing the Flat Dampening Multiplier (closes D3)

**DDD layer:** domain/services (pure shrinkage function, candidate location: beside
`baseRateComputer.ts`, following its established "no infra imports, db injected" precedent) +
`docs/agents/digest-predict/flow/daily-predict.md` (consumes the new code-side output instead of
computing its own multiplier — see NFR-3 below on why this belongs in code, not agent prose).

**Current defect, verified at source:** the ONLY shrinkage in the system today is a flat multiplicative
haircut living in an agent prompt, not code: `docs/agents/digest-predict/flow/daily-predict.md:30`,
`final_confidence = min(0.95, max(0.05, computed * 0.90))`, armed when calibration reads "degrading" AND
`trend_delta > 0.05` (plus an unconditional copy at line 25 when `REGIME=TIGHTENING`). Arithmetically
incapable of fixing the observed defect: `0.95 * 0.90 = 0.855`, and the 85% bucket **also** measures a
0.0% hit rate (po's calibration curve: 85%→0.0% n=3, 95%→0.0% n=3).

**Functional requirement:** published confidence must shrink toward 50% as an increasing function of
extremeness and a **decreasing** function of evidence strength (fragment count feeding the score, and
the LR `sample_size` backing those fragments) — thin evidence ⇒ strong shrinkage toward 0.5; many
fragments backed by high-`sample_size` TRUSTED LRs ⇒ little/no shrinkage. The concrete function is
architect's design call; the requirement is that a raw 85-95% score built on thin evidence (the
2-fragment ACB/VPB pattern po measured) must be shrunk meaningfully below those buckets, not by a flat
10%, so the same 0-hit-rate-at-85/95% failure mode cannot recur under equivalent inputs (po AC-3: "no
bucket may ship at 95% off a 2-fragment score").

**Must retire:** both flat-multiplier sites in `daily-predict.md` (line 25 unconditional TIGHTENING
haircut, line 30 conditional degrading-calibration haircut) once the code-side shrinkage function
supplies its output — replaced, not left as a parallel/duplicate correction. Editing this flow file is
in-scope for dev-mcp-server: it is already listed in the sprint's `files[]`, and git history confirms
dev/fix-class commits have edited this exact file for prediction-engine work before (`6feec3ab1`
`fix(mcp-server/prediction-claims)`, `636efc128` `fix(agent-father/digest-predict)`).

### FR-4 — Evidence Cache Recency Bound + Honest Degrade (closes D4 / absorbs `SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE`)

**DDD layer:** infrastructure/db (`evidenceFragmentStore.getLatestEvidenceScore`) + interface/mcp
(`evidenceTools.ts`'s `get_evidence_summary` docstring + response formatting).

**Current defect, verified at source:** `getLatestEvidenceScore` is
`SELECT * FROM evidence_scores WHERE stock = ? ORDER BY score_date DESC LIMIT 1` with **no recency
bound**, while `runEvidenceAccumulator` only writes rows for stocks with fragments in the last 30 days,
and `purgeExpiredFragments` deletes expired fragments first. A stock whose fragments all expire
therefore serves its last computed score forever. Live proof: VPB returned `Score date: 2026-08-09`
(13d stale), `Bearish: 0.9500`, `Fragment count: 2`, `(no fragments found)` on the live fragment SELECT
— a 0.95 bearish conviction with zero surviving backing evidence, served as current, while ACB (fresh
fragments) returns a same-day score. Per-ticker cache rot, not a dead cron.

**Functional requirement:** `getLatestEvidenceScore` (or its caller) MUST NOT serve a `score_date` older
than a defined freshness bound. BA recommends aligning the bound with the same 30-day active-fragment
window `runEvidenceAccumulator` already uses (a score computed from fragments that have since fully
expired is definitionally stale by the system's own accumulation contract) — exact bound value is
architect's call, informed by the linked SPIKE's own investigation. When the bound is breached,
`get_evidence_summary` MUST degrade **honestly** (e.g. "no fresh evidence — last score is N days stale,
treat as unreliable") instead of silently presenting a stale row as current. This satisfies po's AC-4.

**Docstring correction:** `evidenceTools.ts`'s `get_evidence_summary` registration string currently
claims "Data is at most 23 hours stale" — false for any stock whose fragments have all expired
(confirmed VPB, 13 days). Must be corrected to describe the new honest-degrade behavior, not a blanket
absolute-freshness guarantee.

**Scope discipline:** this FR states the OUTCOME only. The SPIKE's own `question` (prune-vs-cache-
staleness root-class determination) and `deliverable` (findings doc) remain architect's investigation
steps — not duplicated here, per po's explicit fold-not-remint instruction.

### FR-5 — Retire the Redundant Prompt-Layer "top_likelihood_ratio" Multiplier (new finding, BA — prevents double-counting LR)

**DDD layer:** `docs/agents/digest-predict/flow/daily-predict.md` (interface/agent-prompt layer only —
no code file affected).

**New finding, not in po's original D1-D4 list — BA traced this while reading the full pipeline:**
`daily-predict.md` line 62 already computes
`Probability: min(0.95, max(0.05, score * top_likelihood_ratio))`, where `top_likelihood_ratio` is the
LR of the single highest-`magnitude*confidence` fragment as displayed in `get_evidence_summary`'s text
output (the same per-fragment LR `get_evidence_summary` already computes for display — po's "decoration"
in Entry 2). This is a **prompt-level, single-fragment** proxy for LR-weighting that predates this
sprint and is separate from FR-1's fix.

**Requirement:** once FR-1 lands (LR baked into `evidence_scores` at write time, per-fragment, in code),
this prompt-level `score * top_likelihood_ratio` step in `daily-predict.md` line 62 MUST be retired
(the score arriving from `get_evidence_summary` is already LR-weighted) — otherwise the SAME correction
is applied twice: once per-fragment inside the persisted score (FR-1), and again as a second,
single-fragment-only multiplier at the prompt layer, which would over-correct and introduce a new,
harder-to-detect miscalibration in the opposite direction. Architect must call this out explicitly in
the technical design so dev-mcp-server does not ship FR-1 while leaving this line unchanged.

---

## Non-Functional Requirements

**NFR-1 — Structural verification only (binding on QA):** acceptance verification for FR-1 through FR-4
must be code-level (unit tests on the changed arithmetic/store contracts/recency-bound behavior), never
a live Brier/hit-rate improvement claim computed off the current n=17 sample. See "Non-negotiable
framing" §1 above.

**NFR-2 — Existing suite regression gate (po AC-6):** `1121-likelihood-ratio-store`,
`1127-calibration-snapshot-store`, `1128-calibration-report-job`, `1129-calibration-tools`,
`1173-calibration-label-integration`, `1392-calibration-report-diacritics` must stay green. Additionally
(BA addition, not in po's list): `1118-evidence-accumulator-job.test.ts`, `1116-evidence-fragment-store.test.ts`,
`1117-evidence-tools.test.ts`, `1124-evidence-tools-phase-bc.test.ts`, and `1194-agent08-tools.test.ts`
touch the files this sprint directly modifies (FR-1/FR-4) and must be checked for fixture assumptions
that assume the old unweighted-mean formula or the old unbounded-recency read.

**NFR-3 — Calibration correction logic belongs in code, not agent-prompt arithmetic:** D3's own root
cause (a flat `*0.90` in a markdown flow file, "arithmetically incapable" of the needed correction) is
itself evidence that encoding statistical correction as agent-prose arithmetic is the wrong layer —
prone to exactly the kind of static, unresponsive-to-data error po found. FR-2/FR-3's corrections should
be computed server-side (new/enhanced MCP tool response, or embedded directly in the value
`get_evidence_summary`/`create_prediction_claim` return) so the LLM agent calls a tool and receives an
already-calibrated number, rather than performing multiplication itself each cycle. Architect owns the
exact interface split.

---

## Edge Cases

- **Zero LR rows yet (cold start):** every fragment falls back to LR=1.0 neutral prior (FR-1) — accumulator
  behavior must be identical to today's unweighted mean until `baseRateComputationJob` has accumulated
  ≥10 resolvable samples for a given `(evidence_type, direction, horizon)` triple. No regression for
  low-volume tickers/evidence types.
- **`avg_baseRate = 0` in `baseRateComputationJob`** (already guarded today, defaults LR to 1.0) — FR-1's
  consumption of `getLikelihoodRatio` must not re-introduce a divide-by-zero risk; the store-layer guard
  is the single source of truth, never re-derived in the accumulator.
- **Bank vs non-bank evidence types:** the live ACB example (`bctc_roe_strong`, `bctc_roe_ratio`) are
  bank-specific BCTC ratios — per the existing `project_bank_aware_bctc.md` lesson, bank vs non-bank
  fragments may carry structurally different meaning for the same `evidence_type` string. Architect/dev
  should confirm the `(evidence_type, direction, horizon_days)` LR key does not silently conflate a
  bank-specific ratio's predictive power with a non-bank ticker's fragment of the same type name — out
  of scope to redesign this sprint, but worth a one-line note in the technical design if the LR table's
  current key granularity turns out to already segment by sector (verify, don't assume either way).
- **Stale calibration report itself:** the weekly `4 13 * * 0` cron produced no snapshot on 2026-08-16
  (13 days stale as of po's triage) — likely the known host-suspension cron-silence class. FR-2's
  feedback loop must be written assuming the job DOES run on its normal cadence; do not add cron-delivery
  guarding logic in this sprint (explicitly out of scope per po).
- **Missing OHLCV for a fragment's stock** (`baseRateComputationJob`'s `getClosePriceOnOrBefore`/
  `getClosePriceOnOrAfter` returning null) — already skips that fragment (`continue`); FR-1 must not
  assume every fragment resolves to a non-1.0 LR, since the underlying base-rate computation may itself
  be starved for some tickers.
- **`get_evidence_summary` "(no fragments found)" vs FR-4's honest-degrade message:** these are two
  different empty states — "(no fragments found)" today means the LIVE fragment SELECT is empty (D4's
  own symptom), while FR-4's new honest-degrade message means the SCORE itself is stale beyond the bound.
  Architect must keep these as distinguishable messages, not collapse them, so a future triage doesn't
  re-confuse "stale score, fragments may or may not exist" with "no fragments, score may or may not be
  fresh" the way D4's investigation had to untangle live.

---

## DDD Layer Mapping (summary)

| Requirement | Domain | Application/Scheduler | Infrastructure | Interface |
|---|---|---|---|---|
| FR-1 (D1) | candidate: LR-weighting math extraction | `evidenceAccumulatorJob.ts` | `likelihoodRatioStore.ts` (read, existing), `evidenceFragmentStore.ts` (write, existing) | — |
| FR-2 (D2) | candidate: correction-factor math | `calibrationReportJob.ts` | new store (correction factors) alongside `calibrationSnapshotStore.ts` | — |
| FR-3 (D3) | shrinkage function (beside `baseRateComputer.ts`) | consumed by digest-predict cycle | — | `docs/agents/digest-predict/flow/daily-predict.md` (lines 25/30 retired) |
| FR-4 (D4) | — | — | `evidenceFragmentStore.getLatestEvidenceScore` (recency bound) | `evidenceTools.ts` `get_evidence_summary` (honest degrade + docstring fix) |
| FR-5 (new) | — | — | — | `docs/agents/digest-predict/flow/daily-predict.md` line 62 (retire redundant multiplier) |

---

## Blockers

**None.** Po's decision journal (Entries 1-8) already resolved every question that only PO could answer
for this sprint: dedup checks against `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` (confirmed
duplicate, out of scope) and `SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE` (confirmed fold, not
re-mint), the statistical-defensibility ruling (no per-ticker/per-evidence-type refit off n=17,
Entry 7), and the sprint_goal governance-cap breach (Entry 8). Every open item BA flagged above
(FR-2's store-schema choice, the FR-1/FR-2/FR-3 ordering, FR-4's exact recency-bound value, NFR-3's
code-vs-prompt interface split) is an architect-owned technical design call, explicitly labeled as such
above — not a business decision requiring PO.

---

## Acceptance Criteria (carried verbatim from po, mapped to FRs above for traceability)

- **AC-1** → FR-1: `evidence_likelihood_ratios` demonstrably participates in the score, with
  `sample_size<10 → LR=1.0` neutral-prior guard and `clampLikelihoodRatio(0.1, 5.0)` bounds preserved.
- **AC-2** → FR-2: a recurring, scheduled path from `calibration_snapshots` back into future prediction
  behavior exists, replacing the agent-prompt flat `*0.90` haircut with a code-side correction. Cadence
  itself is the deliverable.
- **AC-3** → FR-3: published confidence shrinks toward the base rate as a function of evidence sample
  size / LR strength; no bucket ships at 95% off a 2-fragment score.
- **AC-4** → FR-4: no evidence score older than a defined freshness bound is ever served as current;
  `get_evidence_summary`'s docstring stops claiming "≤23 hours" unconditionally.
- **AC-5** → NFR-1: re-run of the calibration report over the same 17 resolved historical claims,
  reported alongside the old numbers as a directional sanity-check + no-regression gate — explicitly
  NOT a statistical certification (n=17 too small).
- **AC-6** → NFR-2: 1121/1127/1128/1129/1173/1392 stay green (+ BA-added 1118/1116/1117/1124/1194 check).
