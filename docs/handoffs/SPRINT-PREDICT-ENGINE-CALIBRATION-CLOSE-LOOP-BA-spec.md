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

---

## [Architect] Brownfield Findings

**Zone:** `apps/mcp-server/` (single zone — confirmed Tier-1 explicit, `task_board` row already carries `zone: "apps/mcp-server/"` and a `files[]` list that is 100% inside this zone; no split needed).

**BUILD-STANDARD:** `not-applicable` — bug-fix/refactor in an existing service, no new primitives, no new microservice.

### Verified paths (read at source, 2026-08-22)

- `apps/mcp-server/src/scheduler/news-analysis/evidenceAccumulatorJob.ts:18-27` (imports), `:94-119` (per-direction score loop + `avg()`) — confirmed D1: `likelihoodRatioStore` absent from import list, `avg(values) = sum/values.length` with raw `magnitude*confidence` only.
- `apps/mcp-server/src/scheduler/macro/calibrationReportJob.ts:195-233` (`computeCalibrationCurve`, bucket formula `Math.min(9, Math.floor(c.confidence*10))` at `:208`, midpoint at `:224`), `:494-524` (steps 6-9, snapshot insert) — confirmed D2: zero `likelihood` references, terminates at `insertCalibrationSnapshot`/`sendCalibrationDigest`.
- `apps/mcp-server/src/infrastructure/db/likelihoodRatioStore.ts:122-144` (`getLikelihoodRatios`, plural, **no try/catch**), `:161-185` (`getLikelihoodRatio`, singular, **has** a defensive `try { } catch { return 1.0 }` with the comment "never throw even if table is missing in some edge case") — asymmetry confirmed: the plural read (needed for FR-1/horizon-selection) has no such guard today.
- `apps/mcp-server/src/infrastructure/db/evidenceFragmentStore.ts:269-291` (`getLatestEvidenceScore`, unbounded `ORDER BY score_date DESC LIMIT 1`) — **zero other callers** in the codebase besides `evidenceTools.ts:192` and its own test file (verified via grep) — safe to extend without a wider blast radius.
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:174-182` (tool docstring, "at most 23 hours stale"), `:214-222` (live fragment SELECT), `:249-290` (inline horizon-selection duplicate of the algorithm BA wants shared).
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (full file, 123L) — existing DDD-pure precedent: header docstring at `:6-9` states "MUST NOT import from src/infrastructure/... only non-domain import allowed is `bun:sqlite` (type-only)". Existing exports: `computeRollingBaseRate`, `computeBrierScore`, `clampLikelihoodRatio` (`:120-122`).
- `apps/mcp-server/src/infrastructure/db/schema-system.ts:1-20` (table inventory header comment), `:170-183` (`evidence_likelihood_ratios` DDL — the shape to mirror), `:234-251` (`calibration_snapshots` DDL).
- `docs/agents/digest-predict/flow/daily-predict.md:25` (unconditional TIGHTENING haircut), `:28-32` (P-0 self-assessment, conditional `*0.90`), `:50-51` (P-3 parses `bullish_score/bearish_score/neutral_score, likelihood ratios` as free text), `:60-72` (P-5, `score * top_likelihood_ratio`), `:192` (P-8 WORK narrative "-10%").
- Test fixtures (own local DDL, do **not** import `schema-system.ts`): `apps/mcp-server/src/__tests__/1118-evidence-accumulator-job.test.ts:21-49` (`createEvidenceSchema()` creates `evidence_fragments`+`evidence_scores` only — **no `evidence_likelihood_ratios` table at all**), `apps/mcp-server/src/__tests__/1128-calibration-report-job.test.ts:49-101` (creates `prediction_claims`/`calibration_snapshots`/`cron_job_runs`/`market_messages` only — **no correction-factor table**).

### Reuse patterns (extend, never duplicate)

- `baseRateComputer.ts` is the ONE existing domain-pure module for this feature area (confirmed by its own docstring + BA's DDD table naming it as candidate location for FR-1's math AND FR-3's shrinkage). **Extend this single file** with 4 new pure functions rather than fragmenting into new domain files — consistent with "always_extend_not_duplicate."
- `likelihoodRatioStore.ts`'s existing `clampLikelihoodRatio`-adjacent guard pattern (neutral-prior-below-min-sample, `[0.1, 5.0]` clamp) is reused **verbatim** for FR-2's new correction-factor store — same shape, same constants, not reinvented.
- `evidenceFragmentStore.ts`'s `purgeExpiredFragments` already establishes the precedent of a "maintenance helper" pure-ish function living beside the CRUD helpers in the same infra file — FR-4's new `isScoreStale` helper follows that precedent rather than opening a new file.
- The confidence-bucket formula (`Math.min(9, Math.floor(x*10))` → midpoint) exists today in exactly ONE place (`calibrationReportJob.ts`, confirmed via grep — no other copy). Extracting it now to a shared function *pre-empts* a second independently-drifting copy before FR-2/FR-3 would otherwise create one, applying the same "one shared helper" principle BA asked for on FR-1's horizon-selection algorithm.

### Design decisions — the ONE pipeline (answers BA's "single most important design decision" ask)

**Exact order of operations, single choke point at `get_evidence_summary`:**

1. **Write time — nightly `evidenceAccumulatorJob`, FR-1.** Per fragment: `contribution = magnitude * confidence * likelihoodRatio`, where `likelihoodRatio` comes from the NEW shared `selectLikelihoodRatio()` (see below) fed by `getLikelihoodRatios(db, evidence_type, direction)` (existing, already horizon-ASC-ordered). `evidence_scores.{direction}_score = sum(contribution) / count` — same normalisation divisor as today, only the numerator changes. This is where the acceptance identity `(0.4224+0.1800)/2 == 0.3012` stops holding (a seeded LR row with `sample_size>=10` and `likelihood_ratio != 1.0` changes the numerator).
2. **Read time — `get_evidence_summary`, on every call, FR-3 then FR-2:**
   a. `rawScore` = `evidence_scores.{direction}` (already FR-1-weighted).
   b. `minLrSampleSize` = the **minimum** `sampleSize` across the top-5 contributing fragments' own `selectLikelihoodRatio()` result for that direction (weakest-link, conservative — one untested fragment among several well-sampled ones still forces caution; this is reused from the SAME per-fragment selection call already made for the existing TRUSTED/UNTRUSTED display line — zero extra DB round-trips).
   c. `shrunkScore = computeConfidenceShrinkage(rawScore, fragmentCount, minLrSampleSize, regime?)` — FR-3.
   d. `bucketMidpoint = confidenceBucketMidpoint(shrunkScore)` — same shared formula as `calibrationReportJob`'s curve bucketing.
   e. `correctionFactor = calibrationCorrectionStore.getCorrectionFactor(db, bucketMidpoint)` (defaults `1.0` if no row yet — cold start, zero regression) — FR-2.
   f. `publishedProbability = clamp(shrunkScore * correctionFactor, 0.05, 0.95)` — **final clamp, last step, once.**
3. `create_prediction_claim`'s `probability` param is unchanged code-wise — the AGENT now copies `published_probability_{direction}` verbatim from `get_evidence_summary`'s text output instead of computing `score * top_likelihood_ratio` itself (FR-5 retirement) or applying a flat `*0.90` (FR-3 retirement). No arithmetic left in the agent prompt — satisfies NFR-3.

This composes each correction exactly once, in one place, in the order BA specified (`LR-weighted score → shrinkage → calibration correction → final clamp`), and gives QA one function call chain to unit-test instead of three independently-verified-but-possibly-compounding pieces.

**FR-1 — shared LR-selection helper (new, domain-pure).**
Add to `baseRateComputer.ts`:
```ts
export interface RatioCandidate {          // structural type — NOT imported from infra;
  likelihood_ratio: number;                // LikelihoodRatioRow[] satisfies this by structural
  sample_size: number;                     // typing (TS excess-property checks only apply to
  horizon_days: number;                     // object literals, not passed variables) — zero infra coupling.
}
export function selectLikelihoodRatio(candidates: RatioCandidate[]): {
  likelihoodRatio: number; trusted: boolean; sampleSize: number; horizonDays: number | null;
}
```
Body = the EXACT selection algorithm already inlined at `evidenceTools.ts:249-290` (prefer shortest-horizon `sample_size>=10` row; else largest-`sample_size` honest-UNTRUSTED; never blend). Both `evidenceAccumulatorJob.ts` (new caller) and `evidenceTools.ts` (refactored existing caller) call this ONE function — no more risk of the two copies drifting. `evidenceAccumulatorJob.ts` fetches `getLikelihoodRatios(db, evidence_type, direction)` once per `(evidence_type,direction)` pair per stock (cache in a `Map` keyed by `${evidence_type}|${direction}` inside the per-stock fragment loop — avoids N redundant identical queries for repeated evidence types).

**Regression-risk finding NOT flagged by BA (architect-found, sharper than BA's note):** BA's spec says the 1118 test's exact-value assertions "likely continue to pass unchanged" under the neutral-prior guard. That is only true if the LR read does not throw. `getLikelihoodRatios` (**plural**, no try/catch) will THROW `no such table: evidence_likelihood_ratios` against `1118-evidence-accumulator-job.test.ts`'s own `createEvidenceSchema()` fixture, which never creates that table (confirmed above) — this breaks **every** test in the file with a hard SQL error, not just the exact-value ones. **Fix (small, root-cause, benefits existing callers too):** add the SAME defensive `try { } catch { return [] }` to `getLikelihoodRatios` that `getLikelihoodRatio` (singular) already has — mirrors an established pattern in the same file, and also retroactively hardens `evidenceTools.ts`'s existing (currently unguarded) call site against the identical missing-table edge case in production. With this fix, the 1118 fixture's missing table degrades to "no rows → neutral 1.0" exactly as BA predicted, rather than crashing. dev-mcp-server should STILL update the 1118 fixture to create the real table and seed a `sample_size>=10, ratio!=1.0` row for a genuine positive-path test (BA's own ask, still needed) — the store-layer fix is a safety net, not a substitute for that test.

**FR-2 — new store, direction-agnostic, confidence-bucket-keyed (architect's schema call, per BA's explicit delegation).**

New file `apps/mcp-server/src/infrastructure/db/calibrationCorrectionStore.ts`, mirroring `likelihoodRatioStore.ts` 1:1 (upsert/get/getAll, same neutral-prior + clamp guard shape). New table in `schema-system.ts` (add to the header inventory comment too):
```sql
CREATE TABLE IF NOT EXISTS calibration_correction_factors (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  confidence_bucket  REAL NOT NULL,             -- bucket_midpoint: 0.05..0.95, same 10 buckets as calibration_curve
  correction_factor  REAL NOT NULL DEFAULT 1.0, -- multiplicative; 1.0 = neutral (cold start / sample_size<10)
  sample_size        INTEGER NOT NULL DEFAULT 0,-- the calibration_curve bucket's own sample_size at write time
  source_snapshot_id INTEGER NOT NULL,          -- calibration_snapshots.id that produced this row (traceability)
  last_updated       TEXT NOT NULL,
  UNIQUE(confidence_bucket)
)
```
**Why direction is NOT part of the key (explicit design call, not an oversight):** BA's spec allows "keyed by direction and/or confidence bucket." Cross-tabbing by direction would split n=17 into even thinner per-(direction,bucket) cells than the already-thin n=3 extreme buckets po's Entry 7 explicitly warned against over-fitting. Keying by confidence-bucket ONLY reuses `computeCalibrationCurve`'s EXISTING output verbatim (zero new statistical surface, zero new query) and directly targets the artifact po's Entry 1 named as decisive ("the calibration curve... monotonically anti-calibrated"). Per-direction correction is left as a documented non-goal for this sprint, not silently dropped.

`computeCorrectionFactor(actualHitRate, bucketMidpoint, sampleSize, minSample=10): number` (new, `baseRateComputer.ts`): `sampleSize < minSample → 1.0` (same `MIN_SAMPLE=10` constant reused system-wide, not a new invented number); else `clampLikelihoodRatio(actualHitRate / bucketMidpoint)` — **literal reuse** of the existing clamp function (same `[0.1, 5.0]` bounds already exported), not a new duplicate clamp. Given the current n=17/n=3-per-extreme-bucket reality, EVERY bucket ships `correction_factor=1.0` today (neutral) — the mechanism is wired, not pre-tuned, satisfying the no-backtest-certification constraint directly: nothing is "fit" off this sample, the pipe is simply open for when volume grows.

**Write path (`calibrationReportJob.ts`), new Step 6.5** (between existing step 6 `computeCalibrationCurve` and step 7 `trend_delta`, same weekly cron, zero new schedule): for each `calibration_curve` bucket, `upsertCorrectionFactor(db, { confidence_bucket: bucket.bucket_midpoint, correction_factor: computeCorrectionFactor(bucket.actual_hit_rate, bucket.bucket_midpoint, bucket.sample_size), sample_size: bucket.sample_size, source_snapshot_id: snapshotId })`. **No change to `CalibrationJobResult`'s shape** — this is a pure side-effect write, keeping the blast radius on the 5 existing green suites (1127/1128/1129/1173/1392) to "one new table must exist in their fixtures," not "the return contract changed."

**Regression-risk finding (architect-found):** `1128-calibration-report-job.test.ts` defines its OWN local schema (lines 49-101, confirmed above) — it does not import `schema-system.ts`. Step 6.5's new `upsertCorrectionFactor` write will throw `no such table` against this fixture the moment it lands. Unlike the FR-1 read-path case above, this is a WRITE — it must NOT be silently swallowed (that would hide a real regression), so the fix here is fixture-side only: dev-mcp-server MUST add the `calibration_correction_factors` DDL to this test file's local schema block. Flagging explicitly so it is not missed as "just a new file, no existing test touches it."

**FR-3 — shrinkage function (new, domain-pure, `baseRateComputer.ts`).**
```ts
export function computeConfidenceShrinkage(
  rawScore: number, fragmentCount: number, minLrSampleSize: number,
  regime?: "TIGHTENING" | "EASING" | "NEUTRAL",
): number {
  const FULL_TRUST_FRAGMENTS = 5;   // reuses the existing "top 5 fragments" constant already
                                     // surfaced by get_evidence_summary — not a new invented number
  const FULL_TRUST_SAMPLE = 10;     // SAME MIN_SAMPLE constant used everywhere else in this system
  let weight = Math.min(1, fragmentCount / FULL_TRUST_FRAGMENTS)
             * Math.min(1, minLrSampleSize / FULL_TRUST_SAMPLE);
  if (regime === "TIGHTENING") weight *= 0.9;  // relocates the EXISTING daily-predict.md:25
                                                 // "-10%" constant into the one pipeline stage —
                                                 // continuity of existing accepted behavior, not a new number
  return 0.5 + (rawScore - 0.5) * weight;
}
```
Multiplicative composition of "fragment count strength" × "LR sample-size strength" means BOTH must be adequate to escape shrinkage — directly satisfies "thin evidence in EITHER dimension ⇒ strong shrinkage." Worked example (po's VPB 2-fragment, untrusted-LR case): `fragmentCount=2, minLrSampleSize=0` → `weight = 0.4 * 0 = 0` → `shrunkScore = 0.5` exactly — a raw 0.95 score collapses fully to neutral, unconditionally satisfying AC-3 ("no bucket may ship at 95% off a 2-fragment score") regardless of how the calibration-factor step (2e above) subsequently behaves.

**`regime` parameter — explicit scope-expansion flag for PM/QA visibility.** FR-3's spec text mandates retiring BOTH `daily-predict.md:25` (TIGHTENING) and `:30` (degrading-calibration) sites "once the code-side shrinkage function supplies its output." Line 30's function is a strict-superset replacement (evidence-based shrinkage + calibration correction do its job properly). Line 25's TIGHTENING signal is a DIFFERENT, macro-regime input, not derived from evidence/calibration data — retiring it without a replacement would silently drop an accepted existing behavior; leaving it as a bespoke agent-prompt multiplier re-opens the exact "parallel/duplicate correction" anti-pattern this sprint closes. Architect's call: fold `regime` as an OPTIONAL parameter into `get_evidence_summary`'s Zod schema (`z.enum(["TIGHTENING","EASING","NEUTRAL"]).optional()`), threaded straight through to `computeConfidenceShrinkage` — the agent still does zero arithmetic, only passes through a string it already parsed from `get_macro_snapshot` in its own bootstrap step. This is a genuine (small) MCP tool-contract change beyond the sprint's literal FR-1..5 text — called out here explicitly so PM/QA do not treat it as out-of-scope drift.

**FR-4 — recency bound (new pure helper, `evidenceFragmentStore.ts`, matches BA's own DDD-layer assignment).**
```ts
export const MAX_SCORE_AGE_DAYS = 30;  // same 30-day window runEvidenceAccumulator/getEvidenceFragments
                                          // already use — literal reuse, not a new invented bound, per BA's
                                          // own recommendation + rationale
export function isScoreStale(scoreDate: string, maxAgeDays = MAX_SCORE_AGE_DAYS, now = new Date()): boolean {
  const ageMs = now.getTime() - new Date(scoreDate + "T00:00:00Z").getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
```
`getLatestEvidenceScore`'s own signature/query is UNCHANGED (zero blast radius on its 0-other-callers contract) — the caller (`get_evidence_summary`) checks `isScoreStale(scoreRow.score_date)` immediately after the fetch and, if true, returns the honest-degrade message EARLY (before the fragments SELECT / published-probability computation), e.g.: `"No fresh evidence for {ticker} — last score computed {score_date} ({ageDays}d ago), exceeds the {MAX_SCORE_AGE_DAYS}d freshness bound. Treat as unreliable."` — kept textually DISTINCT from the existing "(no fragments found)" (empty live-fragment SELECT, D4's other symptom) and "No evidence accumulated yet" (no `evidence_scores` row at all) messages, per BA's edge-case note — three distinguishable empty/degraded states, not collapsed into one. Docstring fix: replace "Data is at most 23 hours stale" with language describing the new honest-degrade behavior (no unconditional freshness guarantee).

**SPIKE root-class verdict (folds `SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE`, per its own `question`):** root class is **(b) cache never recomputed/invalidated**, not (a) fragments-pruned-after-score-computed as a distinct failure. Mechanism: `runEvidenceAccumulator`'s stock enumeration (`SELECT DISTINCT stock FROM evidence_fragments WHERE timestamp >= 30d`) simply stops visiting a stock once ALL its fragments have expired — the `evidence_scores` row from the last day it WAS visited is never touched again, and `getLatestEvidenceScore`'s unbounded `ORDER BY ... LIMIT 1` then serves that frozen row forever. The recency bound above is the correct fix for this root class (an age-based reconciliation check against live fragment count, as the SPIKE's question posed as option "reconcile scoreRow.fragmentCount against the live SELECT," is a heavier alternative that would require a live COUNT query on every `get_evidence_summary` call — the age bound achieves the same honest-degrade outcome at zero extra query cost, reusing data already fetched).

**FR-5 — retirement (docs-only, `daily-predict.md`).** Once `get_evidence_summary` returns `published_probability_{direction}` (step 2f above), P-5's `Probability: min(0.95, max(0.05, score * top_likelihood_ratio))` (line 62) is replaced by "read `published_probability_{direction}` directly — do not recompute." `top_likelihood_ratio` sourcing is dropped from the probability calculation (the per-fragment TRUSTED/UNTRUSTED display line stays — still useful diagnostic text, just no longer fed into a second manual multiply). P-0's `DAMPENING_ACTIVE` boolean is KEPT as a narrative/logging-only flag (still gates the P-8 WORK message text) but no longer performs its own arithmetic — both `daily-predict.md:25` and `:30` flat multipliers are deleted outright, not left dormant. P-8's "-10%" copy (`:192`) is corrected to describe server-side shrinkage instead of a fixed percentage (the actual shrink magnitude now varies per-ticker).

### DDD layer assignment (final)

| Component | Layer | File |
|---|---|---|
| `selectLikelihoodRatio`, `computeCorrectionFactor`, `computeConfidenceShrinkage`, `confidenceBucketMidpoint` | domain/services (pure, no infra imports) | `baseRateComputer.ts` (extended) |
| LR-weighted score aggregation | scheduler | `evidenceAccumulatorJob.ts` |
| Correction-factor write (Step 6.5) | scheduler | `calibrationReportJob.ts` |
| `evidence_likelihood_ratios` plural-read hardening | infrastructure/db | `likelihoodRatioStore.ts` |
| Recency-bound helper + constant | infrastructure/db | `evidenceFragmentStore.ts` |
| New correction-factor store | infrastructure/db | `calibrationCorrectionStore.ts` (new) |
| New table DDL | infrastructure/db | `schema-system.ts` |
| Honest-degrade, published-probability assembly, `regime` param, docstring fix | interface/mcp | `evidenceTools.ts` |
| Retire flat multipliers, consume `published_probability` | interface/agent-prompt | `docs/agents/digest-predict/flow/daily-predict.md` |

### Test strategy (structural, per NFR-1 — no Brier/hit-rate certification)

- **FR-1:** unit test on `selectLikelihoodRatio` (pure, table-free) covering TRUSTED/UNTRUSTED/no-rows cases (should be behaviorally IDENTICAL to the existing inline logic at `evidenceTools.ts:249-290` — the FR-1.1 regression tests at `1124-evidence-tools-phase-bc.test.ts:191-233` must still pass unchanged after the refactor, proving zero behavior drift from extraction). New `evidenceAccumulatorJob` test seeding a `sample_size>=10, ratio!=1.0` LR row to prove the weighted numerator changes (the arithmetic-identity assertion BA specified). Existing exact-value assertions (`toBeCloseTo(0.72,2)` etc.) stay green under the neutral-prior default, PROVIDED the `getLikelihoodRatios` hardening above lands first (or in the same commit).
- **FR-2:** unit test on `computeCorrectionFactor` (pure): `sample_size<10→1.0`; `sample_size>=10` computes and clamps correctly. Integration test on `calibrationReportJob` confirming Step 6.5 upserts one row per non-empty curve bucket into the (fixture-added) `calibration_correction_factors` table, with `source_snapshot_id` matching the snapshot just inserted.
- **FR-3:** unit tests on `computeConfidenceShrinkage` — the anti-DESC-flip-style explicit negative assertion here is: 2-fragment/untrusted-LR input MUST return exactly `0.5` (not merely "less than raw"), proving full shrinkage, not partial.
- **FR-4:** unit tests on `isScoreStale` (boundary at exactly `MAX_SCORE_AGE_DAYS`, one day under/over). `get_evidence_summary` test: score older than bound → honest-degrade message, textually distinct from both the "(no fragments found)" and "No evidence accumulated yet" paths (3-way distinguishability assertion).
- **FR-5:** no code test — verify via `daily-predict.md` diff review only (both flat-multiplier lines physically removed) at PM/QA review time.
- **NFR-2 fixture updates required before FR-1/FR-2 land** (blocking, not optional): `1118-evidence-accumulator-job.test.ts`'s `createEvidenceSchema()` must gain the `evidence_likelihood_ratios` DDL; `1128-calibration-report-job.test.ts`'s local schema block must gain the `calibration_correction_factors` DDL. Both are hard prerequisites, not nice-to-haves — without them the respective job under test throws immediately on the new code path (mitigated for FR-1 only, by the `getLikelihoodRatios` hardening above; FR-2's write has no such safety net by design).

### Risk flags

- **Security/perf:** all new queries are parameterized (no string interpolation), consistent with existing store files. `evidenceAccumulatorJob`'s new per-fragment LR lookup is memoized per `(evidence_type,direction)` pair per stock to avoid N redundant identical queries — flagged so dev doesn't skip the cache and reintroduce an O(fragments) query-count regression on nightly cron duration.
- **DDD violation avoided:** the 3 new domain functions use structural typing (`RatioCandidate` interface with only the 3 fields needed) specifically so `baseRateComputer.ts` does NOT gain an infra import even as a type — preserves the file's own documented invariant.
- **Scope-expansion flag (surfaced, not hidden):** the `regime` parameter addition to `get_evidence_summary`'s MCP schema (FR-3's TIGHTENING-retirement requirement) is a genuine, small tool-contract change beyond the literal FR-1..5 file list — PM should note this when creating the dev-mcp-server task so QA's test plan includes it.
- **No statistical refit performed or required** — `MIN_SAMPLE=10` gates BOTH FR-1's LR consumption and FR-2's correction factor identically, so at today's n=17 the system behaves IDENTICALLY to today except for the (already-required, sample-size-independent) FR-3 shrinkage and FR-4 recency bound — consistent with po's Entry 7 ruling and the sprint's no-backtest-certification constraint.

**Scan clean:** true ✓

## RETURN (architect)
DONE: Technical design complete for FR-1..FR-5 (LR-weighted aggregation, weekly calibration→correction-factor feedback store, evidence-based confidence shrinkage replacing the flat multipliers, evidence-score recency bound + honest degrade, retirement of the redundant prompt-layer LR multiplier) — brownfield findings + full pipeline ordering + schema + 2 architect-found regression risks (missing `evidence_likelihood_ratios`/`calibration_correction_factors` tables in 2 test fixtures) written above.
ZONE: apps/mcp-server/
NEXT: pm | break design into atomic dev-mcp-server tasks per FR, in dependency order FR-4 (independent) → FR-1 (independent) → FR-3+FR-5 together (FR-5 depends on FR-1's `published_probability` existing) → FR-2 (independent of the others, but Step 6.5 lands alongside FR-3's `confidenceBucketMidpoint` extraction)
HANDOFF: docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md
PIPELINE: continue
