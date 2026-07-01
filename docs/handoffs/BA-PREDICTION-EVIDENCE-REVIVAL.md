# BA Spec — PREDICTION-EVIDENCE-REVIVAL

**Task:** BA-PREDICTION-EVIDENCE-REVIVAL (SPRINT-M, high, zone=multi)
**Sprint:** PREDICTION-EVIDENCE-REVIVAL (`sprint_goal.entries[]`, status=active)
**BA date:** 2026-07-01T06:07:59Z
**Ground truth:** live-probed via `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "...bun:sqlite..."` against the named-volume `/app/data/market.db` (per lesson: live DB = named volume). All counts below are RAW, not badges.

---

## 0. Live ground truth (overrides/refines the router-verified board-row framing)

| Table | Row count | Freshness | Note |
|---|---|---|---|
| `evidence_fragments` | 48 | all within last ~2wk | **100% `evidence_type=foreign_flow_institutional`** — monoculture CONFIRMED live, not just inferred |
| `evidence_scores` | 616 | max `computed_at`=2026-06-30T16:00:01Z | FRESH — confirms EVIDENCE-ACCUM-SILENT-CRON (53d00955) fix holds; accumulator is healthy |
| `evidence_likelihood_ratios` | 47 | 45 rows frozen `last_updated`=2026-05-24; **2 rows fresh** (`last_updated`=2026-06-28, from live `foreignFlowAlertJob` fragments) | NOT literally "n=0 everywhere" — see §1.2 |
| `prediction_claims` | 12 | max id=12, created 2026-06-26 | Confirms "no new predictions since id=12" dashboard symptom |
| `prediction_signals` | 6 | all `detected_at`≈2026-04-01, test-fixture-shaped ids (`t163-sig-...`) | Separate pipeline — see §4 |
| `backtest_runs` | 45 | — | NOT empty — "Sharpe gate unsatisfiable at n=0" does not refer to this table (see §3) |

`cron_job_runs` confirms three relevant jobs are all running successfully on schedule (not silently dead):
`foreignFlowAlertJob` (daily 08:13 UTC), `insiderCheckJob` (daily 01:00 UTC), `baseRateComputationJob` (weekly Sun 19:00 UTC).

---

## 1. Work-item (a) — LR compute/backfill job — REFRAMED

**PO framing:** "find/build/repair" the LR compute job (folds `FIX-EVIDENCE-PIPELINE-STARVED` + `FIX-PREDICTION-SIGNALS-EMPTY`).

**BA finding:** The LR compute job **already exists and is healthy** — `apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts` (Task 1122), wired into `startScheduler.ts`, last run 2026-06-28 19:07:01 success. It is **not broken code** — it is **input-starved**: it computes LR only for `(evidence_type, direction)` pairs that currently have rows in `evidence_fragments`. With only 1 live `evidence_type`, 13 of the 14 known types (`bctc_*`, `macro_*`, `kinh_dich_signal`, `price_momentum_5d`, `news_sentiment_*`) have zero live fragments (naturally TTL-expired since no producer has written them since ~2026-05-24) and their LR rows are frozen forever at the original 2026-05-24 seed (`sample_size` 1–5).

### FR-1.1 — Fix `get_evidence_summary` hardcoded LR lookup (bug, independent of sample growth)
**DDD layer:** interface (`apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts`)
`get_evidence_summary` (line ~244) hardcodes the LR lookup to `(evidence_type, "bullish", 10)` **regardless of the fragment's own `direction`**. The one currently-TRUSTED row that exists live — `foreign_flow_institutional / bearish / 5d, sample_size=18` (≥10 trust threshold) — is **never surfaced**, because the tool only ever queries the bullish/10-day combination, which for `foreign_flow_institutional` has `sample_size=4` (untrusted). Fix: look up `(f.evidence_type, f.direction, <matching horizon>)`, not a hardcoded direction/horizon. This closes part of the "LR=1.00 (n=0) UNTRUSTED" symptom immediately, with zero dependency on new fragment volume.

### FR-1.2 — Cadence NFR (flag for architect/PM, not hard blocker)
**DDD layer:** infrastructure (scheduler)
`baseRateComputationJob` runs **weekly** (Sun 19:00 UTC). The sprint's own `success_metric` requires a new claim within "2 digest cycles" of deploy — digest-predict runs **daily** (17:30 UTC). If work-item (b) restores new fragment types on, say, a Tuesday, the LR for those types will not recompute until the following Sunday — outside the 2-cycle window. **BLOCKER B4** (below): confirm whether cadence upgrade (weekly → daily, or trigger-on-new-fragment-type) is in scope for this sprint's DoD.

---

## 2. Work-item (b) — Evidence monoculture audit

**Confirmed root cause, three layers:**

1. **Only two producers are wired at all**, and both are **scheduler cron jobs**, not agent flows:
   - `foreignFlowAlertJob.ts` (writes `foreign_flow_institutional`) — actively producing (48 live rows).
   - `insiderCheckJob.ts` (writes `insider_accumulation` via `detectAccumulationStreaks()`) — runs "success" daily but **zero `insider_accumulation` fragments exist live**, despite ~2 months of daily runs.
2. **No cowork agent (`news-scout`, `bctc-analyst`, `market-watcher`) ever calls `record_evidence_fragment`.** The MCP tool exists (`evidenceTools.ts`, Task 1117) and is nominally granted in the server's `SKILL_MANIFEST` (`agentBootstrap.ts`) to `news_scout` / `financial_analyst` / `market_watcher` roles — but:
   - the agent-facing tool docs these agents actually read (`docs/agents/tools/package/news-analysis.md`, `financial-analysis.md`, `report-analysis.md`, `market-analysis.md`) **never mention `record_evidence_fragment`**, and
   - **no flow step** in `docs/agents/news-scout/flow/*.md`, `docs/agents/bctc-analyst/flow/*.md`, `docs/agents/market-watcher/flow/*.md` instructs a call to it.
   These agents simply do not know the tool exists.
3. **Orthogonal dead-code note (not a live blocker, flag so architect doesn't design around it):** `SKILL_MANIFEST`/`getToolsForSkills()` permission-gating is **not actually invoked** in the live request path — `createMcpServerInstance()` is called with no `skills` argument at both live call sites in `server.ts` (probe server + request handler), so every session always gets the full unrestricted `toolRegistry`. The manifest differences (e.g. `alert_commander` lacking `record_evidence_fragment`) have zero runtime effect today.

### FR-2.1 — Wire `record_evidence_fragment` into producing agent flows
**DDD layer:** application/agent-flow (`docs/agents/**`, NOT `apps/mcp-server/`)
Add explicit flow steps + tools_package doc entries for:
- `news-scout` → `news_sentiment_stock`, `news_sentiment_macro` (from its own sentiment analysis output).
- `bctc-analyst` → `bctc_revenue_growth`, `bctc_pe_ratio`, `bctc_debt_equity` (from `get_financial_summary` output it already computes).
- `market-watcher` → `price_momentum_5d`, `price_momentum_20d` (from `get_technical_indicators` output it already has access to).
No production code change required — the tool/store/table already exist. This is a **docs/agents-zone** change (architect must NOT route this to `dev-mcp-server`).

### FR-2.2 — Diagnose `insider_accumulation` zero-yield
**DDD layer:** infrastructure (`apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts`, `domain/services/leadershipSignal.ts::detectAccumulationStreaks`)
Per no-fake-data / honest-null standing rule: must not assume either "genuinely zero streaks" or "silent bug" without a live probe. Probe raw `insider_transactions` row volume over the same 30-day window `detectAccumulationStreaks` scans; if real accumulation streaks exist in the raw data but the function returns none, this is a second silent-empty-success bug (same class as the original `FIX-EVIDENCE-PIPELINE-STARVED`). **BLOCKER B2** (below).

---

## 3. Work-item (c) — Validation-gate cold-start bootstrap DESIGN — REFRAMED

**BA finding:** "Sharpe>1.0 backtest gate unsatisfiable at n=0" is **not a hard server-side code gate**. It originates from `docs/agents/digest-predict/init.md` `workflows.validate_prediction_claims` (an **identity-level** block, `trigger: before_creating_prediction_claim`) instructing the agent to call `compare_backtest_runs` and require Sharpe>1.0 before `create_prediction_claim`. This workflow is **not wired into any flow step** in `daily-predict.md` / `monday.md` — no step ever calls `compare_backtest_runs`. The actual **coded** gate in `daily-predict.md` P-5 is only:
```
Probability: min(0.95, max(0.05, score * top_likelihood_ratio))
sample_size < 10 → untrusted → top_likelihood_ratio = 1.0
```
This does **not block** claim creation — it neutralizes the LR multiplier to 1.0 (no directional boost/penalty from evidence), it does not zero out probability or prevent `create_prediction_claim`. `backtest_runs` has 45 live rows (not empty), so the literal "n=0" framing applies specifically to evidence-fragment `sample_size`, conflated in the digest-predict notebook narrative with the separate, unwired backtest-validation workflow. Reading the notebook cycles 06-24→06-30: most days' actual 0-claim outcome is produced by the agent's own P-4/P-5 correlation/hexagram-contradiction/staleness filtering (legitimate business logic), not a hard Sharpe block.

### BLOCKER B1 (PO-only — business intent, not technical)
Was `validate_prediction_claims` (Sharpe>1.0, win-rate>50%) always meant to be a **hard pre-claim gate**, or is it **advisory/color** only? Two divergent designs follow:
- **(A) Hard gate, intended:** wire `compare_backtest_runs` into `daily-predict.md` as an explicit P-4.5 step, and design a genuine **cold-start bootstrap threshold** — e.g. a `COLD_START` confidence tier that permits claims when the evidence score qualifies (>0.6) but LR is untrusted (n<10), explicitly tagged so Brier/calibration tracking can separate cold-start claims from LR-trusted claims once volume grows.
- **(B) Advisory only, current code is correct:** the coded `sample_size<10 → LR=1.0` neutral-multiplier behavior IS the intended design (claims still get created, just without an evidence-derived edge). In this case work-item (c) reduces to a **docs-only fix**: strip/correct the misleading "Sharpe>1.0 hard gate" language from `digest-predict/init.md` so the agent stops narrating false structural blockers in its notebook (12 consecutive cycles of "dev gap" framing that the code does not actually enforce).

Architect should design against whichever intent PO confirms; BA recommends (B) as the minimal-risk reading of the *actual shipped code*, but flags this squarely as a business-priority call, not a technical one.

---

## 4. Scope correction — `FIX-PREDICTION-SIGNALS-EMPTY` is a code-distinct pipeline

**PO framing:** folded under work-item (a) as a "downstream symptom of the same starved chain."

**BA finding (code-level, not opinion):** `prediction_signals` is populated by `predictionMarketJob.ts` (Polymarket external-prediction-market poll — see `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts`), a structurally **independent** pipeline from `evidence_fragments` → `evidence_likelihood_ratios` → `create_prediction_claim`. Live probe: `prediction_signals` = 6 rows, all `detected_at`≈2026-04-01, with test-fixture-shaped ids (`t163-sig-null-prev`, `t163-sig-defaults`, `t163-sig-001`) — strongly suggests either a genuinely separate stalled job or leftover test-seed data never purged, **unrelated to the LR starvation chain**.

### BLOCKER B3 (PO-only)
Confirm whether PO wants `FIX-PREDICTION-SIGNALS-EMPTY` **decoupled** from work-item (a) (re-opened as an independent BACKLOG item for `predictionMarketJob.ts`, since it is a different code path with a different — as yet undiagnosed — root cause), or kept folded (in which case architect's SPLIT must NOT claim it "auto-resolved" by the evidence-fragment fixes above, since nothing in FR-1/FR-2 touches `predictionMarketJob.ts`).

---

## 5. Requirements summary (FR / NFR / DDD layer)

| ID | Requirement | DDD layer | Zone |
|---|---|---|---|
| FR-1.1 | Fix `get_evidence_summary` hardcoded `(evidence_type,"bullish",10)` LR lookup → use fragment's own direction/horizon | interface | `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts` |
| FR-1.2 (NFR) | `baseRateComputationJob` cadence weekly→daily or trigger-on-new-type (pending B4) | infrastructure | `apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts` |
| FR-2.1 | Wire `record_evidence_fragment` into news-scout / bctc-analyst / market-watcher flows + tools_package docs | application/agent-flow | `docs/agents/news-scout/**`, `docs/agents/bctc-analyst/**`, `docs/agents/market-watcher/**`, `docs/agents/tools/package/*.md` |
| FR-2.2 | Diagnose `insider_accumulation` zero-yield (probe raw `insider_transactions` vs `detectAccumulationStreaks` output; fix if silent-bug, else document as honest-zero) | infrastructure | `apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts`, `apps/mcp-server/src/domain/services/leadershipSignal.ts` |
| FR-3 (design, pending B1) | Cold-start bootstrap: either wire `compare_backtest_runs` + `COLD_START` confidence tier into `daily-predict.md` (design A), or correct misleading gate language in `digest-predict/init.md` (design B) | application/agent-flow | `docs/agents/digest-predict/**` |
| Scope note | `FIX-PREDICTION-SIGNALS-EMPTY` (Polymarket poll, `predictionMarketJob.ts`) is code-distinct — do not claim auto-resolved (pending B3) | infrastructure | `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts` |

## 6. Edge cases

- **Cold-start ramp for newly-restored evidence types:** once FR-2.1 lands, new fragment types will themselves start at `sample_size<10` for weeks — FR-3's design decision directly governs whether those thin-sample types can contribute to claims during the ramp, not just the existing `foreign_flow_institutional` type.
- **Honest-zero vs silent-bug for `insider_accumulation`:** must not assume either without a live probe (no-fake-data standing rule) — FR-2.2 mandates the probe before any fix is written.
- **Regression risk on FR-1.1:** `get_evidence_summary` is a live, already-shipped MCP tool. Changing the LR lookup could flip previously-"TRUSTED"/"UNTRUSTED" labels for any downstream consumer that depended on the old hardcoded bullish/10d convention as a stable reference number regardless of the fragment's actual direction. Dev must add a regression test asserting the fix does not silently corrupt other tickers' summaries.
- **Zone boundary:** FR-2.1 and the docs-only branch of FR-3 live entirely under `docs/agents/**`, not `apps/mcp-server/`. Architect must not route these to `dev-mcp-server` in the SPLIT — they belong to whichever agent/process owns cowork flow-doc authoring (per existing convention, `agents-architect` or direct PM/architect doc edit, not a dev-* service team).

## 7. Blockers (PO-only)

- **B1:** `validate_prediction_claims` Sharpe>1.0 — hard pre-claim gate (design A, needs cold-start bootstrap) vs advisory-only (design B, docs-only fix, matches current shipped code)? See §3.
- **B2:** Is `insider_accumulation` diagnosis (FR-2.2) in scope for this sprint's DoD, or defer to a separate FIX ticket once probed?
- **B3:** Decouple `FIX-PREDICTION-SIGNALS-EMPTY` from work-item (a) (reopen independently) or keep folded but NOT claim auto-resolved? See §4.
- **B4:** Is `baseRateComputationJob` cadence upgrade (FR-1.2, weekly→daily) in scope for this sprint's DoD? Needed to plausibly hit the sprint's own success_metric ("new claim within 2 digest cycles") once FR-2.1 restores new fragment types outside the current Sunday-only recompute window.

## 8. Non-blocking architect ratification items

- **ARCH-RATIFY-PER-1:** Confirm horizon selection for FR-1.1's fix when a fragment has no matching-horizon LR row yet (fall back to nearest horizon, or return UNTRUSTED honestly — recommend honest UNTRUSTED, no interpolation).
- **ARCH-RATIFY-PER-2:** FR-1.2 cadence mechanism — cron interval change vs event-triggered recompute (recompute a single triple immediately after each new fragment insert of a previously-empty type) — event-triggered is more responsive but is a bigger structural change; cron-interval change is the minimal-risk option.
- **ARCH-RATIFY-PER-3:** FR-2.1 evidence_type naming — reuse the exact strings already seeded in `evidence_likelihood_ratios` (`bctc_revenue_growth`, `price_momentum_5d`, `news_sentiment_stock`, etc.) so the 45 frozen LR rows recompute against the SAME types rather than fragmenting further into new type-name variants.

## 9. DDD layer map (for architect SPLIT)

- **domain:** `baseRateComputer.ts` (pure calc, unaffected).
- **infrastructure:** `evidenceFragmentStore.ts`, `likelihoodRatioStore.ts`, `insiderCheckJob.ts` (FR-2.2), `baseRateComputationJob.ts` (FR-1.2), `predictionMarketJob.ts` (out-of-scope note §4, pending B3).
- **interface:** `evidenceTools.ts::get_evidence_summary` (FR-1.1).
- **application/agent-flow (docs/agents/**):** `news-scout`, `bctc-analyst`, `market-watcher` flows + tools_package docs (FR-2.1); `digest-predict/init.md` + `flow/daily-predict.md` (FR-3, pending B1).

Multi-zone confirmed — architect must SPLIT into at minimum: (1) `apps/mcp-server/` dev-mcp-server hop [FR-1.1, FR-2.2, FR-1.2 if B4 confirms in-scope], (2) `docs/agents/` doc-flow hop [FR-2.1, FR-3 pending B1] — these two hops have NO file overlap and can run in parallel.
