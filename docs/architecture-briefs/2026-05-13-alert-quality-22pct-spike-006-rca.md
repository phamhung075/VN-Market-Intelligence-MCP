---
id: SPIKE_006
title: Alert accuracy 22% RCA — scoring methodology bug
date: 2026-05-13
cycle: c60
author: architect
telegram_report: 2869
status: findings-complete
---

# SPIKE_006: Alert Accuracy 22% RCA

## 1. Context

TNB-c39-#5 deferred at 35% accuracy (2/141 scored) with hypothesis "verdictResolutionJob
catching up organically". At c60 (+17 cycles) accuracy is 22% (2/9 hits). Trend is
worsening, not recovering. Affected signal types: price_drop 17%, price_surge 33%.
Threshold target: 60%.

## 2. Method

Read: `alertAccuracy.ts` (alertAccuracy tool, scorer, fallback), `alertOutcomeJob.ts`,
`signalOutcomeJob.ts`, `alertOutcomeScorer.ts`, `alertVerdictStore.ts`,
`verdictResolutionJob.ts`, `alertStore.ts` (infra), cronConfig.ts, TASKS.md deferred,
`docs/data/alert-verdicts.json`. No jobs run; no live DB queried.

## 3. Evidence per hypothesis

### H-A (methodology bug) — PRIMARY

**For:**
- `formatAccuracyReport` (alertAccuracy.ts L340-341) computes accuracy as
  `hits / (hits + misses)` — UNKNOWN rows are excluded from denominator. With 9
  scored alerts (2 HIT, 7 MISS, remainder UNKNOWN) accuracy = 2/9 = 22%.
- The intraday fallback (alertAccuracy.ts L206-217): when strict 1-3 day window has
  no data, falls back to 1-12h intraday window. VN market open hours are 09:00-15:00
  GMT+7; alerts fired after 15:00 return intraday prices from the SAME session or
  none. A price_drop alert fired during a brief dip followed by intraday recovery
  will score MISS even though the drop was real — because fallback price is still
  within the same session bounce.
- `resolveDirection` in `verdictResolutionJob.ts` (L71): `abs(pct) < 1.0 → "confirmed"`
  regardless of direction. A price_drop alert confirmed as bearish is marked
  "confirmed" even if price moved +0.9% (almost no move). The 1% flat-band counts
  as "confirmed", inflating confirmed count — but this job feeds `alert-verdicts.json`
  (currently empty `[]`) not the `alerts.outcome` column scored by `get_alert_accuracy`.
  These are TWO independent scoring systems with no integration. verdictResolutionJob
  results are NEVER read by `formatAccuracyReport`.
- `alertOutcomeScorer.ts` (L113-116): `price-signal` hitThresholdPct = 0.1% for both
  price_drop and price_surge. This is noise-floor, not a meaningful threshold. A
  0.2% dip after a price_drop alert counts as HIT. But `scoreAlert` in alertAccuracy.ts
  uses a DIFFERENT path (Path 2 on-the-fly) with only a 0.1% noise floor and no
  directional threshold — two inconsistent scoring implementations coexist.
- The accuracy report denominates on `scoreable = hits + misses` only (excluding
  UNKNOWN), then reports `hitPct = hits / scoreable`. With high UNKNOWN rate, the
  reported 22% is the ratio among the few scored rows — sample size of 9 is not
  statistically meaningful. The 60% threshold is applied to this small-sample ratio.

**Against:**
- Logic paths are internally consistent; no exception-swallowing in the scorer itself.

### H-B (job runtime regression) — SECONDARY

**For:**
- `docs/data/alert-verdicts.json` is empty (`[]`). verdictResolutionJob runs hourly
  (`7 * * * *`) but the store has zero rows. Either no alerts were ever appended via
  `appendVerdict`, or all rows were pruned (30-day TTL). This means verdictResolutionJob
  processes nothing each cycle — zero contribution to accuracy score.
- `alertOutcomeJob.ts` L154 calls `readPendingOutcomeAlerts(90, db)` but
  `alertStore.ts` L230 signature is `readPendingOutcomeAlerts(windowDays=30, db)` —
  caller passes 90 correctly but the default diverges from usage, indicating uncertain
  intent. Non-fatal but signals drift.
- `alertOutcomeJob.ts` calls `classifyAlertType(alert.signals_json, null)` — passes
  `null` for message, which is correct, but the `alertStore.readPendingOutcomeAlerts`
  returns rows with `NULL as alert_type` aliased; `signals_json` and
  `affected_actions_json` must be present or skipping occurs (L167-170). High skip
  rate without logging makes silent partial-scoring plausible.

**Against:**
- `alertOutcomeJob` has console.error on per-row errors (not silent swallowing).
- `verdictResolutionJob` sends Telegram BUG on each fetch failure — if it were
  crashing loudly, BUG channel would show it.

### H-C (genuine signal regression) — TERTIARY

**For:**
- price_drop 17% and price_surge 33% are both below 60% threshold; suggests broad
  underperformance rather than one signal type regressing.
- Post-2026-04 market regime change is plausible (cannot confirm without live data).

**Against:**
- Sample is only 9 scored rows. Cannot distinguish signal regression from scoring
  artifact at n=9. H-A fully explains observed numbers without requiring market
  change.
- No evidence of threshold recalibration since original deployment.

## 4. Verdict

1. **H-A — CONFIRMED (confidence: HIGH)**. Two independent scoring systems (verdictResolutionJob
   → alert-verdicts.json vs alertOutcomeJob → alerts.outcome column vs alertAccuracy.ts
   on-the-fly Path 2) do not feed the same metric. The reported 22% is computed on
   Path 2 on-the-fly scoring from a sample of 9 rows. The intraday fallback introduces
   systematic bias toward MISS for same-session alerts. hitThresholdPct=0.1% is
   effectively no threshold for price-signal class. The accuracy denominator
   (hits+misses only, excluding UNKNOWN) amplifies noise when n is small.

2. **H-B — PARTIAL (confidence: MEDIUM)**. Empty alert-verdicts.json confirms
   verdictResolutionJob is inert (zero contribution). High skip rate in alertOutcomeJob
   from missing affected_actions_json is plausible but unconfirmed without live data.

3. **H-C — UNCONFIRMED (confidence: LOW)**. Cannot distinguish from H-A noise at n=9.

## 5. Recommended fix path

**ba spec** — concrete refactor task for developer.

Scope: unify the two scoring paths into one canonical `scoreAlertOutcome` domain function
already in `alertOutcomeScorer.ts`; wire `get_alert_accuracy` (Path 2 fallback) to call
the same domain scorer; remove intraday fallback or gate it to post-close-only window
(≥1 trading day, not 1h); raise price-signal hitThresholdPct from 0.1% to 1.0% for
price_drop/price_surge (matching signalOutcomeJob's 1% direction threshold); report
accuracy with minimum sample guard (n<20 → "insufficient sample, N=X"); integrate
verdictResolutionJob resolved rows into the `alerts.outcome` column so both systems
share one truth table.

## 6. Open questions

- (a) Need to run alertOutcomeJob with logging enabled to measure skip rate (how many
  rows are skipped due to missing affected_actions_json vs missing prices).
- (b) Need live DB query: count of `alerts` rows with `outcome IS NULL` vs non-null,
  and distribution of `signals_json` types in the last 30 days, to confirm n=9
  denominator vs actual alert volume.
- (c) Need user confirmation: is the 60% accuracy target measured on (hits/scoreable)
  excluding UNKNOWN, or on (hits/total) including UNKNOWN? The two interpretations
  differ by ~5-10x at current UNKNOWN rates.

## 7. c61 task proposal

**BA spec task (M):** "Alert accuracy scoring unification — SPIKE_006 fix." BA to spec
the following: (1) merge Path 2 on-the-fly scorer in `alertAccuracy.ts` to use
`alertOutcomeScorer.scoreAlertOutcome` as single source; (2) remove or post-close-gate
intraday fallback (≥1 trading day minimum); (3) raise price-signal hitThresholdPct
0.1% → 1.0%; (4) add minimum-sample guard (n<20 → report as insufficient); (5) write
verdictResolutionJob resolved rows back to `alerts.outcome` column. Size: M (~3 dev
tasks: domain scorer update, alertAccuracy.ts wiring, verdictResolutionJob integration).
Expected outcome: accuracy denominator becomes meaningful (n≥20) and threshold logic
aligns across all three scoring paths.
