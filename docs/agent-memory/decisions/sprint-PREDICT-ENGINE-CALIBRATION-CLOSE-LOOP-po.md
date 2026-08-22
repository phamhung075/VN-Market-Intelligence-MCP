# Decision Journal — po · PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP · 2026-08-22T2040Z

task_id: intent:po:predict-engine-accuracy-improve-20260822 (router-direct dispatch, session 88555d2e)

Inputs: user pasted the live "Dự báo AI & Kết quả" dashboard — 49 predictions, 25 resolved, 24% hit
rate, avg Brier 0.4743. Verbatim ask: *"actual performance is very low i need you improve and make it
more recurrent for find good to invest."* Router supplied 6 diagnostic hypotheses explicitly flagged
HYPOTHESES ONLY, to be verified against live tables. Output: **1 sprint_goal vision + 1 SPRINT-L mint
+ 1 pre-existing SPIKE escalated/folded, 2 router hypotheses reclassified, 1 confirmed duplicate.**

## Entry 1 — Brier 0.4743 > 0.25 means MISCALIBRATED, not imprecise — and the live curve is worse

Pulled `get_calibration_report` live rather than trusting the paste. It is itself 13 days stale
(computed `2026-08-09T13:04:00Z`; the weekly Sunday `4 13 * * 0` slot on 08-16 did not produce a newer
one). Live 90d window: overall Brier **0.5319** on n=17, trend *degrading* (+0.244 WoW). Per-direction
splits the problem cleanly — **bearish 0.7045** vs bullish 0.4380 vs neutral 0.3309.

The decisive artifact is the calibration curve, which is **monotonically anti-calibrated**:
65%→50.0% (n=2), 75%→33.3% (n=9), **85%→0.0% (n=3), 95%→0.0% (n=3)**. The engine is most wrong exactly
where it is most confident. That shape — not the headline Brier — is what justified a SPRINT-L rather
than a FIX.

## Entry 2 — ROOT CAUSE (new): the likelihood ratio is computed, displayed, then discarded

`evidenceAccumulatorJob.ts` computes the score every prediction is built from as
`score = sum(magnitude * confidence) / count` and **does not import `likelihoodRatioStore` at all**.
So `evidence_likelihood_ratios` — the only table in the system derived from realized price outcomes,
rewritten daily by `baseRateComputationJob` — never enters prediction arithmetic. It is decoration in
`get_evidence_summary` and nowhere else.

Proved arithmetically off live data rather than by reading intent. `get_evidence_summary("ACB")`:
`bctc_roe_strong` score=0.4224 **LR=0.54 (n=91) TRUSTED**, `bctc_roe_ratio` score=0.1800 **LR=0.86
(n=195) TRUSTED** → reported `Bullish: 0.3012` = (0.4224+0.1800)/2 **exactly**. Both fragments carry a
large-sample TRUSTED LR *below 1.0* (empirically anti-predictive) and the score is completely unmoved.
The system already measured, on n=91 and n=195, that its own bullish BCTC evidence does not work — and
keeps weighting it at full strength. **This identity is now the sprint's primary success metric**: it
must stop holding.

## Entry 3 — ROOT CAUSE (new): the outer loop does not exist — this IS "make it more recurrent"

`calibrationReportJob.ts` contains **zero** occurrences of `likelihood` (grep -c = 0) and does not
import `likelihoodRatioStore`. Its documented 11-step run ends at `insertCalibrationSnapshot` +
`sendCalibrationDigest`. It measures Brier, per-direction Brier and the full curve every week, writes
`calibration_snapshots`, posts Telegram — and discards the measurement. Nothing consumes
`calibration_snapshots` to change future behavior.

Two loops, both dead-ended: `baseRateComputationJob` (daily) fits LRs whose output is unused (Entry 2);
`calibrationReportJob` (weekly) scores real predictions and its output is unused (this entry). There is
no path from *"this prediction was wrong"* to *"weight that evidence type less next time."* The user's
"more recurrent" is therefore **the literal deliverable**, not a nice-to-have framing.

## Entry 4 — Router hypothesis #2 ("blanket -10% dampening") CONFIRMED, and reclassified as insufficient

Not in code at all — it lives in an agent prompt: `docs/agents/digest-predict/flow/daily-predict.md:30`,
`final_confidence = min(0.95, max(0.05, computed * 0.90))`, armed only when the calibration report reads
*degrading* AND `trend_delta > 0.05` (plus an unconditional copy at line 25 on `REGIME=TIGHTENING`).
Router called it "ad hoc catch-all" — correct, but the sharper finding is that it is **arithmetically
incapable** of fixing the observed defect: 95% × 0.90 = 85.5%, and the 85% bucket *also* has a 0.0%
actual hit rate. It is also computed off a calibration report that was 13 days stale. Recorded as D3.

## Entry 5 — Router hypothesis #3 ("stale evidence reuse") CONFIRMED, root cause found, folded not re-minted

`getLatestEvidenceScore` is `ORDER BY score_date DESC LIMIT 1` with **no recency bound**, while
`runEvidenceAccumulator` only writes rows for stocks having fragments in the last 30d and
`purgeExpiredFragments` deletes expired ones first. A stock whose fragments all expire therefore serves
its last score forever. Live: `get_evidence_summary("VPB")` → `Score date: 2026-08-09` (13d stale),
`Bearish: 0.9500`, `Fragment count: 2`, `(no fragments found)` — a 0.95 bearish conviction with zero
surviving backing evidence, served as current, while the tool's own description advertises "at most 23
hours stale." ACB by contrast returns a fresh 2026-08-22 score → **per-ticker cache rot, not a dead cron.**

**Dedup held:** this is exactly `SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE`, created 2026-07-16, still
BACKLOG, unrouted for 37 days. Escalated to `priority: high` + `parent_sprint` + a status_note carrying
the newly-measured cost, rather than re-minted. That cost is the reason it stopped being a SPIKE-priority
curiosity: VPB is the worst-scoring ticker in the engine (Brier 0.9025) and its three worst 95% bearish
predictions were all generated off this one stale fragment-less row.

## Entry 6 — Router hypothesis #4 (BCTC OCR `total_assets=0`) is a DUPLICATE — no mint

Already carried by `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE` (BACKLOG, architect), which names POW
Q1/2026 `total_assets=0` and VEA explicitly. Router flagged it to check-before-minting; check performed,
duplicate confirmed, written into the sprint's scope_out so BA cannot re-absorb it.

## Entry 7 — Router hypothesis #1 (foreign_flow_institutional sign flipped) DELIBERATELY NOT ACTIONED

what-considered: (a) hard-code a sign flip / LR refit for `foreign_flow_institutional` bearish off the
3× VPB + 3× ACB repeats; (b) fix structure only and let the LR re-fit itself once wired.
why-change: **chose (b).** The VPB "three consecutive independent misses" are not independent — Entry 5
shows they are *one stale cache row read three times*, so that evidence is nearer n=1 than n=3. With
n=17 resolved in-window and n=3 in each extreme bucket, a per-evidence-type or per-ticker refit is not
statistically defensible and would over-fit the exact artifact we are fixing. By contrast D1/D2/D3 are
structural defects provable by code-reading and exact arithmetic, independent of sample size — safe to
fix now. Written into `scope_out` as an explicit prohibition so architect does not reintroduce it, and
into AC-5 so QA cannot certify the sprint on a backtest over the same n=17.

## Entry 8 — Governance: sprint_goal cap 15 → 16, breached knowingly

what-considered: (a) breach the cap; (b) close `PREDICTION-CLAIMS-DAILY-CADENCE` (OPEN, the likeliest
candidate) to stay at 15; (c) merge this into that entry.
why-change: **chose (a).** (c) rejected — that vision is about *page cadence*, this is about *accuracy*;
merging would muddy both success metrics. (b) rejected — its success_metric requires LIVE
consecutive-day `prediction_claims` verification that this triage did not perform, and closing a vision
on an unverified assumption is precisely what the closure gate exists to prevent. Breach recorded
in-band on `sprint_goal._note` and on the entry's own `_note`, with the closure audit owed to the next
triage pass. A user-originated P0 accuracy defect on a shipped user-facing surface outranks a soft
governance cap.

## Routing

`ba → architect → pm → dev-mcp-server → qa`. Zone `apps/mcp-server/` → owner `dev-mcp-server` per
`docs/references/agent-roster.md` (confirmed at source, not assumed). Sequencing note handed to BA:
`FIX-CI-BUNTEST-167-PREDICTION-MARKET-JOB` is READY on dev-mcp-server and CI-red in the same area —
likely wants to land first.
