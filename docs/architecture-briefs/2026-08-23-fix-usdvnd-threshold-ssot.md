<!-- size-justification: unifies a 3-plane threshold conflict + a saturated-classifier design
     decision + two new findings discovered mid-design (dead code, double-application bug) that
     materially change the fix shape from what the dispatched row assumed. -->
# Architecture Brief — FIX-USDVND-THRESHOLD-SSOT

**Task:** FIX-USDVND-THRESHOLD-SSOT | **Zone:** multi (`apps/macro-indicators/` Go + `apps/mcp-server/` TS) | **BUILD-STANDARD:** not-applicable (bug-fix/unification, no new service)

---

## 0. Two findings that change the fix shape (neither was in the row's own text)

**Finding A — one of the "three live planes" is dead code, not live.** `currencySignal()` (`apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:124`, the cited `25500` "HIGH/LOW" narrative label) has **zero callers anywhere in the repo** — confirmed by a full-repo grep, including tests. So are its siblings `oilSignal()`, `goldSignal()`, `policySignal()` (each exactly 1 occurrence = their own definition). `dxyLabel`/`us10yLabel` in the same file ARE called (3/2 occurrences) — this is not a whole-file dead zone, just these four functions. **Consequence:** the row's plane (2) is not a live conflict source; it is dead code. Fixing it is a deletion, not a unification.

**Finding B — the TS cascade layer already runs BOTH a fixed-threshold rule set AND a σ-based dynamic rule set on the SAME domains, additively, every cycle stats are available.** `cascadeEngine.ts:329,334` calls `applyMacroAdjustments` (old, fixed `usdVnd>25500`/`usdVnd<24500`, `macroAdjustments.ts:111-147,209-238`) **unconditionally** whenever `macroContext != null`, THEN calls `applyDynamicMacroAdjustments` (new, σ-based, `DYNAMIC_MACRO_MAP`'s `usdVndRate`/`usdVndOfficial` entries) whenever `macroStats` is non-empty — and `getAllMacroStats()`/`getCommodityStats()` (`macroStatsStore.ts`) is live-wired from `pollNews.ts`/`runImpactChain.ts`, reading a real rolling 30-point history from `commodity_prices_history`. Both rules target the **identical domain sets** (`aviation`/`automotive` bearish, `agriculture`/`steel` bullish) and both apply their delta additively (`entry.confidence = entry.confidence + delta`, sequential, not mutually exclusive). **This is a genuine, previously-unflagged double-counting bug for every indicator in both maps (oil, gold, USD/VND), not just USD/VND.** Flagged here, NOT fixed fleet-wide in this ticket (out of scope — see §4); for USD/VND specifically, §2's fix retires the static half, which closes it for this one indicator as a direct side effect of "pick one SSOT."

---

## 1. Decision: SSOT = the already-shipped relative/σ-based system (option **(a)**) — not a new design

Per po's saturation addendum, this row's durable fix must choose among (a) relative/z-score threshold, (b) absolute levels anchored to a real policy reference + staleness alarm, or (c) delete the NEUTRAL/BULLISH branches and honestly reframe as a boolean red-line. **Decision: (a).** Not because it's the abstractly "best" of three blank-slate options — because it is **already built, already live, and already correctly handles the exact failure mode that saturated the Go classifier**:

- `apps/mcp-server/src/domain/services/macroThresholds.ts` — `computeRollingStats()` + `classifyDeviation()`: mean/stdDev over a rolling window (≥5 samples), 1σ/2σ/3σ buckets (`elevated`/`high`/`extreme`), **plus two guards purpose-built for exactly this indicator**: an absolute-VND floor (`minAbsDeviation=50` for any `*vnd*`-named indicator, `Task 1270` — "50 VND is the minimum economically observable move") and an `FX_SLOW_MOVER_INDICATORS` %-move floor (0.5%, "typical valid moves ±0.3-0.4%... genuine macro events exceed 0.5%") that **already lists `usdVndRate` AND `usdVndOfficial` by name**. This is not a hypothetical fit — it is the SAME `feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip`-adjacent phantom-spike class this fleet has hit before, already solved here.
- `apps/mcp-server/src/infrastructure/db/macroStatsStore.ts` — reads real history from `commodity_prices_history` (not the sparse `macro_indicators` table PO's own evidence measured at `n=1`), `usd_vnd_rate` included.
- This is option (b)'s spirit too, incidentally: `usdVndOfficial` is the live SBV-sourced rate (`sbvRatesJob.ts`/`sbv.ts` fetcher) already tracked alongside the market rate — a real policy anchor already exists in this data model; it does not need to be invented.
- Option (c) is rejected: it would throw away a system that already works and is already live for two-thirds of the conflict.

**What "SSOT" means concretely after this fix:** not one bare number, but one **methodology** (rolling mean ± Nσ with the two guards above) that every plane reads from the same computed stats, replacing three independently-invented absolute constants (25000 Go / 25500 TS-dead / 25500+24500 TS-cascade) with one shared derivation.

---

## 2. Migration plan (per plane)

**Plane 1 — `macroTools.ts` dead code (Finding A):** DELETE `currencySignal()`, `oilSignal()`, `goldSignal()`, `policySignal()` (4 functions, 0 callers, confirmed live). Pure debt removal — CLAUDE.md "detect then reduce debt, dead code." Not a design decision, a cleanup.

**Plane 2 — TS cascade static rules (Finding B, USD/VND slice only):** Retire the 8 `usdVnd>25500`/`usdVnd<24500` entries from `MACRO_ADJUSTMENTS` (`macroAdjustments.ts:111-147,209-238`) now that `DYNAMIC_MACRO_MAP`'s `usdVndRate`/`usdVndOfficial` mapping (`:278-284`) already covers the identical domain sets via the σ-based path. This is the ONE-SSOT fix for the cascade-impact half AND closes Finding B's double-count for this indicator as a direct consequence — do not touch the sibling oil/gold static rules in this ticket (separate, larger, out-of-scope finding, see §4).

**Plane 3 — Go classifier (`macro_usdvnd_direction_classifier.go`), the actually-saturated one:** Extend `UsdVndDirectionInput` with pre-computed rolling stats (`MeanVND`, `StdDevVND`, `SampleCount float64/int`, computed by the caller — `macro_signals.go`/`usecases.go` — from the same historical series the TS side reads) and port `classifyDeviation()`'s formula verbatim into Go: same 1σ/2σ/3σ buckets, same 50-VND absolute floor, same 0.5%-move FX-slow-mover floor. This is a **formula port across an unavoidable language boundary** (`macro_usdvnd_direction_classifier.go`'s own DDD Fence-A: "imports ONLY standard library packages, no cross-layer imports" — Go structurally cannot `import` a TS module), not a duplicate design decision; `always_extend_not_duplicate` governs business decisions and interfaces, not a mechanical port of an already-ratified formula across a hard language wall the codebase itself mandates. Not inventing a pattern for this Go app either: `apps/macro-indicators/pkg/domain/services_vmt_omo.go` already does rolling/derived computation in Go (`ComputeImpliedShortRates`) — same app, same layer, existing precedent to extend stylistically. **This closes the saturation bug precisely as intended**: `BULLISH`/`NEUTRAL` become reachable again because the discriminating band travels with the rolling mean instead of sitting at a fixed 23000-25000 that VND's secular drift has permanently cleared.
`Reasoning` string must render the derived values ("USDVND at 26130, +2.3σ above 90-day mean 25400 (BEARISH — elevated)") instead of a bare fixed number — this is also what kills the sourceless "26500 resistance" fabrication risk structurally: once the narrative is inherently data-derived every call, there is no static number left for an LLM to drift around.

**Plane 4 — cross-language agreement test (the row's own explicit AC):** Feed the SAME `(current, mean, stdDev, sampleCount)` tuple to both `classifyDeviation()` (TS) and the extended `Classify()` (Go) and assert equivalent bucket + direction. This is a stronger test than the row's literal ask ("Go and TS agree") because it tests the shared FORMULA, not two independently-hardcoded constants that could coincidentally match today and drift apart tomorrow — directly satisfies the saturation-addendum's mandatory AC too ("a test asserting that BOTH the bullish and bearish branches remain reachable at the CURRENT live rate, not a fixture rate" — with a rolling-mean-based band, the current live rate is *by construction* within reach of a bullish/neutral verdict once the rate reverts toward its own recent mean, unlike the old fixed band).

---

## 3. Narrative-layer rule (per the row's own NOTE)

`FIX-USDVND-FROZEN-26110`/`FIX-COMMODITY-WTI-DELTA-CORRUPT I8` already own "never quote a delta the payload does not carry" — this brief adds the companion rule for whoever implements Plane 3/4: **the narrative layer (news-scout, any agent) must cite the classifier's own `Reasoning` string verbatim or its constituent `{current, mean, stdDev, zScore}` fields — never re-derive or invent a threshold number of its own.** Once Plane 3 ships, "exceeds 25000 threshold" as a literal string disappears from the codebase entirely, closing the mechanism PO identified as the likely source of recurring "25,000"/"26500" citations in published dishes.

---

## 4. Flagged, NOT fixed here (candidate follow-ups for PO/PM — do not fold in)

- **Finding B's general form** (oil/gold static-vs-dynamic double-application in `cascadeEngine.ts` Step 2b+2c) — same bug class, larger blast radius (every `MACRO_ADJUSTMENTS`/`DYNAMIC_MACRO_MAP` domain overlap, not just USD/VND), needs its own row.
- The 4 dead functions in `macroTools.ts` beyond `currencySignal` (`oilSignal`/`goldSignal`/`policySignal`) — bundled into Plane 1's deletion since they're in the identical file, but note for the record they were not independently reported before this brief.
- SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (instance 12, per po's catalogue) — this row remains the fix; the SPIKE owns the cross-cutting class question only, unchanged.

---

## Test Strategy

Unit: TS side — extend existing `macroThresholds`/`macroAdjustments` test suites with the retired-rule negative control (USD/VND static rule removed, dynamic rule alone produces equivalent-or-better confidence delta on a live-shaped fixture) and the dead-code deletion (build/typecheck green, no import errors). Go side — new fixture table across the 1σ/2σ/3σ/50VND-floor/0.5%-floor boundaries (mirrors `macroThresholds.ts`'s own guard logic, ported as literal Go test cases, not re-derived). Cross-language: the shared-tuple agreement test in §2 Plane 4, run in CI on both stacks.

## Risk Flags

- **DDD Fence-A compliance:** Plane 3's stats must arrive as plain `float64`/`int` fields on `UsdVndDirectionInput` — the primitive package itself still imports nothing beyond `fmt`; only the CALLER (`macro_signals.go`/`usecases.go`, already cross-layer-eligible) computes and threads the stats in.
- **Sample-size cold start:** early in `commodity_prices_history`'s life (or after a data gap), `sampleCount < 5` → TS already degrades to `"normal"`/`zScore:0` (safe default); Go's port must mirror this exact early-return, not silently fall back to the old fixed bands (that would silently reintroduce plane 3's saturation under a data-gap condition — a regression, not a fix).
- **No apps/frontend change needed** — this is backend-only; frontend consumes `direction`/`reasoning` strings already, format-compatible.

## Task-board disposition

`FIX-USDVND-THRESHOLD-SSOT`: `architect_design_complete=true`, `architect_handoff` → this file, `next_agent=pm` (multi-zone split: Go primitive + caller wiring vs TS cascade retirement + dead-code deletion — two dev-role tracks, `zone-detect` Tier-2 needed since files span two `apps/` roots).

## NEXT

**pm** — split into (i) TS track: delete dead functions (Plane 1) + retire static USD/VND cascade rules (Plane 2), size S; (ii) Go track: extend `Classify()` input + port formula (Plane 3) + cross-language agreement test (Plane 4), size M, sequenced after (i) only insofar as the agreement test needs both sides — otherwise independent.
