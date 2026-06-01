<!-- size-justification: 280L — sprint technical brief covering 6 FRs, brownfield source diff per FR, design decisions ARCH-DECIDE-1/2/3, DDD layer assignments, dev-ready task specs for PM, risk flags. All content load-bearing for PM → dev handoff. -->

# Technical Brief — Sprint TOOL-SURFACE-HYGIENE

**Date:** 2026-05-31
**Author:** Architect
**Sprint:** TOOL-SURFACE-HYGIENE
**Input:** `docs/REQ_TOOL-SURFACE-HYGIENE.md` (BA spec) + `docs/SPRINT_GOAL.md` §TOOL-SURFACE-HYGIENE
**Status:** DESIGN COMPLETE — handoff to PM

---

## Zone Summary

| FR | Decision | Zone |
|---|---|---|
| FR-1 | **1b DEREGISTER** (chosen — rationale below) | `apps/mcp-server/` |
| FR-2 | DISTINCT — clarify descriptions | `apps/mcp-server/` |
| FR-3 | DISTINCT — clarify descriptions | `apps/mcp-server/` |
| FR-4 | DISTINCT — clarify descriptions | `apps/mcp-server/` |
| FR-5 | WONTFIX-LOW — keep as-is (rationale below) | N/A |
| FR-6 | stat reconcile after churn | `docs/` (system-auditor/PM) |

All dev work is in `apps/mcp-server/` zone (dev-mcp-server) except FR-6 which is a PM/system-auditor doc-only task. BUILD-STANDARD: lean (brownfield, existing microservice).

---

## ARCH-DECIDE-1: FR-1 — Wire vs Deregister `get_market_hexagram`

**Decision: 1b — DEREGISTER.**

**Rationale:**

The wire option (1a) is NOT cheap. The `/market` endpoint in kinh-dich-service must aggregate VN-Index 5d/20d/60d momentum (requires price history queries) and USD/VND, oil, gold sigma deviations (requires macro data) to build 6 hao values — this is net-new application logic in a separate service zone (kinh-dich-service), a different dev owner, and a separate container rebuild. The work is bounded but non-trivial (1–2 days estimate minimum).

The deregister option (1b) is a surgical 35-line block removal (`kinhDichTools.ts:510–546`) with one potential dead-import cleanup. It closes the confirmed defect immediately with zero kinh-dich-service churn and no new domain logic at risk.

The decisive factor is `feedback_chef_kinhdich_confab` (memory): a live-but-501 oracle is an active CHEF confabulation footgun. Every agent call to `get_market_hexagram` currently returns an error text that the caller must handle; an oracle that is absent is strictly safer than one that lies. The default lean from the PO/router is also 1b. Wiring should be scheduled as a proper feature sprint (KINH-DICH-MARKET) once kinh-dich-service has an owner sprint slot — not squeezed into a hygiene sprint.

**Zone: `apps/mcp-server/`** (dev-mcp-server). kinh-dich-service is NOT touched.

---

## ARCH-DECIDE-2: FR-2 / FR-3 / FR-4 — Source Diffs

### FR-2 Source Diff: `mark_alert_outcome` vs `write_alert_verdict`

| Dimension | `mark_alert_outcome` | `write_alert_verdict` |
|---|---|---|
| File | `interface/mcp/tools/alerts/alertAccuracy.ts:494` | `interface/mcp/tools/alerts/alertVerdictTools.ts:107` |
| Datastore | SQLite `alerts` table (market.db) | JSON file `docs/data/alert-verdicts.json` |
| Infrastructure module | `infrastructure/db/alertStore.ts` — `writeAlertOutcome()` | `infrastructure/fileStore/alertVerdictStore.ts` — `appendVerdict()` |
| When called | POST-HOC: after alert outcome is known (manually, by Alert Commander after verifying price move). Idempotent — re-scoring updates existing row. | AT FIRE-TIME: when alert-commander fires a MARKET alert (step 4a). Writes a NEW pending row immediately. |
| Schema shape | Updates existing `alerts` row — sets `outcome` (HIT/MISS/UNKNOWN), `outcome_at`, `outcome_detail`. | Appends new `AlertVerdict` row — `id`, `ticker`, `direction`, `conviction`, `alertSource`, `firedAt`, `verdict="pending"`, nulled resolution fields. |
| Lifecycle | Retrospective accuracy scoring after real outcome is observed. | Forward-looking tracking: row starts pending, resolved later by `verdictResolutionJob`. |
| Consumer/caller | Alert Commander (manual scoring), alert accuracy review tools. | Alert Commander (fire path), resolved by scheduled job 1863b/c. |
| Any caller would break if removed | Yes — removing `mark_alert_outcome` breaks the post-hoc accuracy pipeline. Removing `write_alert_verdict` breaks the forward-looking verdict tracking. Both pipelines are active. |

**Verdict: GENUINELY DISTINCT.** Different datastores, different lifecycle positions, different schema, different callers. No merge. Action: clarify tool descriptions to make the distinction explicit in the description string.

---

### FR-3 Source Diff: Macro accuracy trio

| Dimension | `get_calibration_report` | `get_label_accuracy_report` | `get_prediction_accuracy` |
|---|---|---|---|
| File | `macro/calibrationTools.ts:282` | `macro/calibrationTools.ts:348` | `macro/predictionTools.ts:165` |
| Data source table | `calibration_snapshots` SQLite table | `market_messages` SQLite table | Computed in-memory from `predictionOutcomeJob.js` — reads `market_signals` or equivalent via `computePredictionAccuracy()` |
| Computation | Reads pre-computed weekly snapshot (Brier score, calibration curve). Snapshot written Sunday 20:00 VN by weekly prediction-resolution job. | Counts agent messages in `market_messages` labelled `verdict='signal'` vs `'noise'` by human review (`batch_review_market_messages`). Aggregates per-agent ratios. | Computes Polymarket signal precision: confirmed/(confirmed+false_positive) for `volume_spike`/`probability_shift` signals against ±2% price moves within 48h window. Rolling lookback. |
| What question answered | How well does the prediction engine's probability estimates match actual outcomes? (machine-calibrated Brier score) | How often does each agent produce signal vs noise, judged by the operator? (human-labelled quality) | How accurately do Polymarket signals predict VN stock moves? (Polymarket-specific signal precision) |
| Population | Past predictions resolved by the outcome job | All MARKET channel messages reviewed by operator | Only Polymarket-sourced prediction signals |
| Input params | Optional `date` (ISO, specific Sunday) | `since_days` (lookback, default 90) | `days` (rolling lookback, default 30) |

**Verdict: GENUINELY DISTINCT.** Three different data sources, three different computation methods, three different conceptual questions. No merge. Action: update all three tool descriptions to name their source and conceptual purpose explicitly.

---

### FR-4 Source Diff: `get_patterns` vs `get_technical_indicators`

| Dimension | `get_patterns` | `get_technical_indicators` |
|---|---|---|
| File | `market-data/marketTools.ts:328` | `market-data/technicalIndicatorTools.ts:513` |
| Data source | `rag_analyses` table (LanceDB/RAG memory) — queried via `getPatternSummary()` | Go TA microservice (port 5003) via HTTP POST `/ta/indicators`; fallback to local SQLite price history |
| Computation | Semantic/keyword historical precedent lookup: matches (stockCode, eventKeyword) against past RAG analyses; returns aggregate impact stats, dominant direction, list of past analyses | Quantitative price-derived indicator computation: RSI(14), MACD(12,26,9), MA(5/20/50), Bollinger Bands(20,2σ) |
| Input params | `stockCode`, `eventKeyword`, `lookbackHours` | `code`, `days` |
| Output | Aggregate: `avgImpactPct`, `dominantDirection`, list of matching precedents | Per-indicator numeric values with TANG/GIAM/TRUNG TINH conclusion block |
| Use case | "How did this stock historically respond to events like this keyword?" | "What do price-derived technical indicators say about this stock right now?" |
| Backend | LanceDB RAG store (semantic match) | Go TA service (numeric computation) |

**Verdict: GENUINELY DISTINCT.** Completely different data backends (RAG vs TA service), different computation paradigms (semantic precedent lookup vs quantitative technical indicators), different use cases. No merge. Current descriptions are reasonably clear but can be sharpened. Action: update descriptions to make the backend and use-case contrast explicit.

---

## ARCH-DECIDE-3: FR-5 — 5x trigger_*_vps_fetch consolidation

**Decision: WONTFIX-LOW — keep 5 separate tools as-is.**

**Rationale:**

Three structural barriers make consolidation genuinely harmful rather than merely "not worth it":

1. **Schema divergence is a breaking change.** `trigger_bctc_vps_fetch` returns `{queued, attempted, success, failed, log_tail}` while `trigger_price_vps_fetch`, `trigger_foreign_flow_vps_fetch`, `trigger_sbv_vps_fetch`, `trigger_news_vps_fetch` return `{service, attempted, success, failed, log_tail}`. The `queued` field is BCTC-specific (queue depth from SQLite). Any caller parsing the response by field name breaks on the unified schema unless a typed union is maintained — which reproduces the current per-source dispatch in the response handler rather than in the registration.

2. **Param shapes diverge.** `trigger_news_vps_fetch` and `trigger_sbv_vps_fetch` have NO `tickers` param (not ticker-scoped services). Adding `tickers?` as optional on a unified tool would allow nonsensical calls like `trigger_vps_fetch(source="news", tickers=["FPT"])` — the call silently ignores a meaningful param, which violates the fail-loud principle. The param shape difference maps directly to service architecture.

3. **Zero actual confusion observed.** These are debug/diagnostic SSH triggers — called by operators and agents for specific pipeline diagnosis. A `source` enum does not reduce cognitive load here because the operator already knows which source they need to debug. The per-tool name (`trigger_bctc_vps_fetch`) is more explicit than `trigger_vps_fetch(source="bctc")` for the same call surface.

The consolidation would cost one PR (5 files deleted, 1 created, all callers re-pointed, tests updated), add a typed union response schema, and gain nothing in clarity or safety. Not worth the churn.

---

## Risk Flags

**RISK-1 (FR-1b dead import):** After removing the `server.tool("get_market_hexagram", ...)` block at lines 510–546 of `kinhDichTools.ts`, the import of `getMarketHexagram` from `infrastructure/microservices/clients.ts` at the top of the file becomes orphaned. TypeScript will surface this as an unused import warning. Developer MUST check import list and remove the dead symbol. If `getMarketHexagram` is re-exported by `clients.ts` for other consumers, verify no other caller uses it before removing — grep: `grep -r "getMarketHexagram" apps/mcp-server/src/`.

**RISK-2 (FR-1b fence):** Verifying tool absence requires a live `list_server_tools("vn-market")` call via the gateway wrapper after container rebuild, not a source grep. Source grep can confirm the `server.tool()` call is gone, but only the live gateway list proves the surface. Per `feedback_fence_false_green`: exit 0 is NOT acceptance.

**RISK-3 (FR-2/3/4 description update scope):** Description string changes in the `server.tool()` call are Interface layer only — zero infrastructure or domain impact. The strings are not persisted to DB. No schema migration, no test change required beyond verifying the updated strings appear in `list_server_tools` output.

**RISK-4 (FR-6 count race):** The FR-6 stat update must run AFTER FR-1b container rebuild is confirmed (to get the post-deregister count). If FR-5 were done, it would further shift the count. Since FR-5 is WONTFIX, the final count after FR-1b = 154 → 153. PM must enforce the sequencing gate on FR-6.

**RISK-5 (rebuild after code change):** Per `feedback_rebuild_after_dev_change`, any code change to `apps/mcp-server/` requires ops to rebuild the container (`build --no-cache` + `force-recreate`, NEVER `restart`). FR-1b modifies `kinhDichTools.ts` and possibly a dead-import line — this is a code change. FR-2/3/4 modify only description strings in the same file — still code changes, still require rebuild. One rebuild can cover all description updates if they land in the same commit, but FR-1b MUST rebuild first (ships first, sequenced per NFR-1).

---

## Task Specifications for PM

### TSH-1 — Deregister `get_market_hexagram` (FR-1b)

```
zone: apps/mcp-server/
layer: Interface
file: apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts
action: Remove server.tool("get_market_hexagram", ...) block at lines 510–546 (37 lines).
        Check import list at top of file: if getMarketHexagram import from
        infrastructure/microservices/clients.ts is now orphaned, remove it.
        Verify no other file in apps/mcp-server/src/ imports getMarketHexagram
        (grep: grep -r "getMarketHexagram" apps/mcp-server/src/).
ac:
  - TSH-1-AC1: After rebuild, get_market_hexagram is ABSENT from list_server_tools("vn-market")
               via gateway wrapper — raw list, not a badge.
  - TSH-1-AC2: The other 5 kinhdich tools remain present and functional:
               spot-check get_kinhdich_reading via gateway call, non-error response.
  - TSH-1-AC3: TypeScript compiles with 0 new errors (bun tsc --noEmit or build step).
ops: REBUILD required after this task. build --no-cache + force-recreate. QA verifies
     before TSH-2/3/4 begin.
```

### TSH-2 — Clarify `mark_alert_outcome` vs `write_alert_verdict` descriptions (FR-2)

```
zone: apps/mcp-server/
layer: Interface (description string only)
files:
  - apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts (line 496–498)
  - apps/mcp-server/src/interface/mcp/tools/alerts/alertVerdictTools.ts (line 109–113)
action:
  mark_alert_outcome — update description to include:
    "Writes to SQLite alerts table (market.db), updating the outcome/outcome_at/outcome_detail
    columns of an existing alert row. POST-HOC only — call after the real price outcome is
    known, not at fire time. Distinct from write_alert_verdict which writes a pending row
    to the alert-verdicts JSON file at fire time."
  write_alert_verdict — update description to include:
    "Writes a NEW pending AlertVerdict row to docs/data/alert-verdicts.json (file store,
    NOT the SQLite alerts table). Call AT FIRE TIME (alert-commander step 4a). Verdict starts
    as 'pending' and is resolved later by the verdict resolution job. Distinct from
    mark_alert_outcome which scores an existing SQLite alerts row post-hoc."
ac:
  - TSH-2-AC1: Updated description strings appear in list_server_tools("vn-market") output
               (raw list verified in-container after rebuild).
  - TSH-2-AC2: No change to handler logic, no schema change, no test change needed.
```

### TSH-3 — Clarify macro accuracy trio descriptions (FR-3)

```
zone: apps/mcp-server/
layer: Interface (description strings only)
file: apps/mcp-server/src/interface/mcp/tools/macro/calibrationTools.ts
      apps/mcp-server/src/interface/mcp/tools/macro/predictionTools.ts
action:
  get_calibration_report — prepend to description:
    "Reads from calibration_snapshots table (SQLite). Machine-computed Brier score —
    measures how well probability estimates match actual outcomes. Weekly snapshot.
    Distinct from get_label_accuracy_report (human-labelled signal quality) and
    get_prediction_accuracy (Polymarket signal precision)."
  get_label_accuracy_report — prepend to description:
    "Reads from market_messages table (SQLite). Human-labelled signal quality —
    counts operator 'signal' vs 'noise' verdicts per agent. Distinct from
    get_calibration_report (Brier/machine accuracy) and get_prediction_accuracy
    (Polymarket signal precision)."
  get_prediction_accuracy — prepend to description:
    "Computed from Polymarket prediction signals only (predictionOutcomeJob).
    Measures precision = confirmed/(confirmed+false_positive) for volume_spike/
    probability_shift signals vs ±2% price moves. Distinct from get_calibration_report
    (Brier/machine accuracy) and get_label_accuracy_report (human-labelled quality)."
ac:
  - TSH-3-AC1: Updated descriptions appear in list_server_tools("vn-market") after rebuild.
  - TSH-3-AC2: No logic change, no schema change.
```

### TSH-4 — Clarify `get_patterns` vs `get_technical_indicators` descriptions (FR-4)

```
zone: apps/mcp-server/
layer: Interface (description strings only)
files:
  - apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts (line 329)
  - apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts (line 514)
action:
  get_patterns — prepend to description:
    "Reads from RAG memory (LanceDB rag_analyses). Semantic/keyword historical
    precedent lookup — answers 'how did this stock respond to events like X in the past?'
    Distinct from get_technical_indicators which computes price-derived quantitative
    indicators (RSI/MACD/MA) from the Go TA service."
  get_technical_indicators — prepend to description:
    "Calls Go TA microservice (port 5003), falls back to local price history.
    Quantitative price-derived indicators (RSI, MACD, MA, Bollinger Bands).
    Distinct from get_patterns which does semantic historical precedent lookup
    from RAG memory."
ac:
  - TSH-4-AC1: Updated descriptions appear in list_server_tools("vn-market") after rebuild.
  - TSH-4-AC2: No logic change, no schema change.
```

### TSH-5 — Reconcile toolCount in project-stats.json (FR-6)

```
zone: docs/ (system-auditor / PM — not dev-mcp-server)
layer: Documentation / SSOT data file
file: docs/data/project-stats.json
sequencing: LAST — runs only after TSH-1 container rebuild is confirmed and QA verifies
            tool surface. TSH-2/3/4 description changes require another rebuild; FR-6
            runs after that rebuild too.
action:
  Re-run: grep -ro 'server.tool(' apps/mcp-server/src/interface/mcp/tools/ | wc -l
  Expected count after TSH-1 (deregister): 154 → 153.
  Update both fields atomically:
    - toolCount (line 34) → 153
    - infrastructureStatus.toolCount (line 55) → 153
    - date/version field → 2026-05-31
  Commit: git add docs/data/project-stats.json (scoped, no -A)
ac:
  - TSH-5-AC1: Both toolCount fields match the live grep count after TSH-1 rebuild.
  - TSH-5-AC2: Single atomic commit scoped to docs/data/project-stats.json only.
  - TSH-5-AC3: date/version field updated to 2026-05-31.
```

---

## Ops Rebuild Gate

After TSH-1 code lands: ops runs `docker build --no-cache` + `docker compose up --force-recreate` on mcp-server. QA verifies `get_market_hexagram` is absent from `list_server_tools("vn-market")` (raw, not badge) before TSH-2/3/4 are considered complete.

TSH-2/3/4 are description-only changes that can land in one commit. After that commit, a second rebuild is required. QA spot-checks updated description strings appear in the live tool list.

Per `feedback_rebuild_after_dev_change`: restart-stale is forbidden. Always `--no-cache build` + `force-recreate`.

---

## Sequencing

```
TSH-1 (deregister) → ops rebuild #1 → QA verify absence
  → TSH-2 + TSH-3 + TSH-4 (descriptions, may land same commit)
    → ops rebuild #2 → QA verify descriptions
      → TSH-5 (stat reconcile, PM/auditor, last)
```

TSH-2/3/4 have no mutual dependency — they can be batched in one commit if dev-mcp-server chooses. TSH-1 is strictly first.

---

## Files to Modify (complete list)

| Task | File | Change type |
|---|---|---|
| TSH-1 | `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` | Remove 35-line block + possibly 1 import line |
| TSH-2 | `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts` | Description string update |
| TSH-2 | `apps/mcp-server/src/interface/mcp/tools/alerts/alertVerdictTools.ts` | Description string update |
| TSH-3 | `apps/mcp-server/src/interface/mcp/tools/macro/calibrationTools.ts` | Description string updates (×2 tools in same file) |
| TSH-3 | `apps/mcp-server/src/interface/mcp/tools/macro/predictionTools.ts` | Description string update |
| TSH-4 | `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` | Description string update |
| TSH-4 | `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` | Description string update |
| TSH-5 | `docs/data/project-stats.json` | Two integer fields + date field |

**Zero touch:** `apps/mcp-server/src/infrastructure/microservices/clients.ts` (unless `getMarketHexagram` is only exported to the removed block — delete export if so), all BCTC tools, the 3 cleared pairs, the other 5 kinhdich tools, kinh-dich-service, any other microservice.

---

## Build Standard

BUILD-STANDARD: lean (brownfield, existing microservice, no new primitives, no new dependencies).
