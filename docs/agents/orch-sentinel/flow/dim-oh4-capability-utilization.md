# Orch Sentinel — OH-4 Capability Utilization

**Parent flow:** `docs/agents/orch-sentinel/flow/main.md` (MODE=FULL only)
**Answers:** Does cowork use the app's full capability?

---

## OH-4.1 — Utilization Snapshot

```bash
jq '.totalCount' docs/data/tool-registry.json
jq '{uniqueTools, toolCounts}' docs/agent-memory/modules/tool-usage-stats.json
Glob docs/agents/tools/package/*.md   # per-package grant lists — parse each for granted-tool union
```
Compute live: `{granted_never_called, called_over_registry_pct, top5_concentration_pct}`. Never hardcode `"183"`/`"104"`/`"43"` or any prior-run number — every value is a fresh jq/glob pass this cycle.
**Flag:** `INFO` snapshot always recorded; no severity on the raw number alone.

## OH-4.2 — Delta vs Previous Run

Diff THIS run's OH-4.1 numbers against the **previous scorecard's** stored OH-4.1 block (from the `<!-- OH-STATE: {json} -->` fence read in `main.md` Step 0b). No notebook history needed — self-diff mechanism only.
**Flag:** `LOW` if utilization % has been flat (±2pp) for 3+ consecutive full runs (read the consecutive-flat counter from OH-STATE, increment or reset this run) — flags stagnation, not a fresh finding.

## OH-4.3 — Persistent High-Value Dormancy

Cross-reference call counts (`docs/agent-memory/modules/tool-usage-stats.json` `.toolCounts`) against this fixed list of architecturally-significant tools:
```
prediction stack:      create_prediction_claim, get_prediction_accuracy, get_calibration_report
evidence-synthesis:     get_evidence_summary, get_open_chain_findings
sector/cascade:         get_supply_chain_exposure, get_sector_rotation, get_cascade_metrics, get_correlation_matrix
BCTC deep reads:        get_bctc_full, get_cash_flow, compare_financials
portfolio risk:         get_portfolio_risk, get_performance_attribution
```
For each tool absent from `.toolCounts` (i.e. call count 0) — check the prior OH-STATE block's `oh4_3_zero_streak` counter for that tool. Increment if still 0 this run; reset to 0 if now called.
**Flag:** `MED` for any tool at 0 calls across 3+ consecutive full runs (persistent, not noise — a single-run zero is not itself a finding).

## OH-4.4 — Doc-Coverage Drift

```bash
ls docs/agents/tools/list/*.md | wc -l
jq '.totalCount' docs/data/tool-registry.json
```
**Flag:** `LOW` on mismatch between the doc-file count and the registry `totalCount`.

---

## Output of this sub-flow

Return `[{check_id: "OH-4.1", severity, metric, summary}, ...]` for OH-4.1 through OH-4.4 to `main.md`, INCLUDING the raw OH-4.1 snapshot object (needed by `emit-scorecard.md` to compose the next cycle's OH-STATE block). Same anti-flood dedup gate as OH-1 applies before any signal_queue write.
