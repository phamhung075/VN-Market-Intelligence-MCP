# scripts/architect-fix-usdvnd-threshold-ssot-design-20260823.jq
#
# Architect design-complete stamp for FIX-USDVND-THRESHOLD-SSOT (ready[],
# priority=high, PO-mint w/ saturation addendum). Decision: option (a)
# relative/sigma-based threshold is the SSOT -- NOT new design, ALREADY
# SHIPPED for the TS cascade side (macroThresholds.ts classifyDeviation +
# FX_SLOW_MOVER_INDICATORS floor, already lists usdVndRate/usdVndOfficial by
# name). Fix = migrate remaining fixed-threshold call sites onto it + delete
# dead code, not invent a new mechanism.
#
# Kept the review note compact -- this row already carries ~7.2KB of prior
# PO saturation-evidence prose; the orch-row-prose-ceiling-check.mjs guard is
# growth-only against a 12000B ceiling, so headroom here is ~4.7KB. Full
# design detail lives in architect_handoff, not duplicated inline.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/architect-fix-usdvnd-threshold-ssot-design-20260823.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.ready | map(.id == "FIX-USDVND-THRESHOLD-SSOT") | index(true)) as $idx
| if $idx == null then error("FIX-USDVND-THRESHOLD-SSOT not found in .task_board.ready[]") else . end
| .task_board.ready[$idx] += {
    architect_design_complete: true,
    architect_completed_at: $now,
    architect_handoff: "docs/architecture-briefs/2026-08-23-fix-usdvnd-threshold-ssot.md",
    architect_review_note: "DESIGN COMPLETE 2026-08-23 (architect). TWO NEW FINDINGS not in the row's own text: (A) the '25500 currencySignal' plane (macroTools.ts:124) is DEAD CODE -- zero callers repo-wide, confirmed by full grep (+3 sibling dead fns oilSignal/goldSignal/policySignal, same file) -- delete, do not unify. (B) cascadeEngine.ts runs the OLD fixed MACRO_ADJUSTMENTS (usdVnd>25500/<24500) AND the NEWER sigma-based DYNAMIC_MACRO_MAP additively on the IDENTICAL domain sets every cycle both have data -- a real double-counting bug, flagged fleet-wide (oil/gold too) but only the USD/VND static half is retired in this ticket. DECISION: option (a) relative/sigma threshold is the SSOT -- ALREADY SHIPPED, not new design: apps/mcp-server/.../macroThresholds.ts's classifyDeviation() (rolling mean+-Nsigma, 1/2/3sigma buckets) already carries a 50-VND absolute floor AND an FX_SLOW_MOVER_INDICATORS 0.5%-move floor that BY NAME lists usdVndRate + usdVndOfficial (the live SBV-anchored rate, already tracked via sbvRatesJob.ts -- option (b)'s policy anchor already exists too). FIX: migrate the Go classifier (apps/macro-indicators .../macro_usdvnd_direction_classifier.go, the actually-saturated plane) onto the SAME formula -- a mechanical cross-language port (DDD Fence-A forbids importing the TS module, precedent for Go-side rolling math already exists in services_vmt_omo.go), not a duplicate design decision; retire the TS static USD/VND rule (closes Finding B for this indicator); delete the 4 dead functions. Test: feed the SAME (current,mean,stdDev,sampleCount) tuple to both languages' classifiers and assert agreement -- stronger than comparing two hardcoded numbers. Full design, migration plan per-plane, risk flags, flagged-not-fixed items: see architect_handoff.",
    next_agent: "pm",
    updated_by: "architect"
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "architect (FIX-USDVND-THRESHOLD-SSOT design)"
