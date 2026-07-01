## Task Report TASK-EVIDENCE-HOP2-AGENTS

**Sprint:** BA-PREDICTION-EVIDENCE-REVIVAL (hop2) | **Zone:** docs/agents/ | **Specialist:** agent-father | **Commit:** 20264221 (10 files, docs-only)

changed:
- docs/agents/news-scout/flow/stage-sentiment.md (+29L — `record_evidence_fragment` for `news_sentiment_stock` / `news_sentiment_macro`)
- docs/agents/bctc-analyst/flow/stage-analyze.md (+23L, 131→154L — routine Step 4c + release R4 addendum, 6 evidence_type derivations)
- docs/agents/market-watcher/flow/cycle.md (+20L, 233→253L — Step 1b, `price_momentum_5d` + `price_momentum_20d`)
- docs/agents/digest-predict/init.md (FR-3 — strip false "Sharpe>1.0 hard gate" language, advisory-only rewrite)
- docs/agents/tools/list/record_evidence_fragment.md (bonus fix — stale `thesis_id`/`content`/`source` contract corrected to live `stock`/`evidence_type`/`direction`/`magnitude`/`confidence`/`source_agent`/`ttl_days` schema)
- docs/agents/tools/package/{news-scout,bctc-analyst,market-watcher}.md (new "Evidence Pipeline (Prediction Engine)" sections)

tests: N/A — docs-only change, no `bun test` per brief §4 test strategy | mock-guard: N/A-PASS (no production source files) | YAML: `digest-predict/init.md` agent block parses OK post-edit

verdict: **APPROVED**

### Verification detail

- **evidence_type set** — live-probed `evidence_likelihood_ratios` directly (bun:sqlite, named-volume `market.db`, docker exec): confirmed seeded set = `bctc_net_profit`(bearish), `bctc_regulatory_compliance`(bearish), `bctc_report_overdue`(bearish), `bctc_roe_ratio`(bullish), `bctc_roe_strong`(bullish), `bctc_valuation_premium`(bearish), `news_sentiment_stock`(bullish n=16/neutral n=5), `news_sentiment_macro`(bullish n=3), `price_momentum_5d`(bullish n=1/bearish n=1), `foreign_flow_institutional`(bearish n=18/bullish n=4), plus `kinh_dich_signal`/`macro_*`/`climate_*`. `bctc_revenue_growth`/`bctc_pe_ratio`/`bctc_debt_equity` confirmed absent (zero rows). Every `evidence_type` string used in all 3 flow-doc edits is a 1:1 match to this live-verified set — zero invented types.
- **record_evidence_fragment.md contract fix** — cross-checked against live `evidenceTools.ts:77-122`: params `stock, evidence_type, direction, magnitude, confidence, source_agent, ttl_days?` match exactly (old doc's `thesis_id`/`content`/`source` genuinely stale and corrected).
- **FR-3** — `digest-predict/init.md` diff confirmed: `capabilities` line + `workflows.validate_prediction_claims.steps` rewritten from hard-gate framing to accurate advisory text referencing the real coded gate (`daily-predict.md` P-5: `sample_size<10 → LR=1.0`). Full YAML `agent:` block parses cleanly post-edit.
- **Zone boundary** — all 10 files under `docs/agents/**`, correct specialist (agent-father, per brief §0-C2/RISK-5 correction that this is NOT a dev-* zone). Zero `apps/mcp-server/` files touched, zero file overlap with hop1 (confirmed via `git show --name-only` on both commits).

### 200L flow-doc discipline (judged non-blocking)
`bctc-analyst/flow/stage-analyze.md` (154L, split-policy threshold 120L) and `market-watcher/flow/cycle.md` (253L) exceed the split-policy line threshold. Both files already carried pre-existing size-justification-header debt (131L / 233L respectively) BEFORE this task — not new debt introduced here. The increment (+23L / +20L) is small, directly reuses signals the flow already computes (per the size-justification header's own "cannot decompose without losing pipeline continuity" argument), and was honestly documented (headers updated to reflect true current size rather than left silently stale). Judged acceptable-as-follow-up, consistent with prior QA precedent on oversized-but-justified files (cycle-352: "PO sweep recommended", non-blocking). No new backlog row filed for this specific item — it is pre-existing systemic debt, not scoped to this docs-wiring hop.

### Board
`TASK-EVIDENCE-HOP2-AGENTS`: REVIEW → DONE_VERIFIED via orch-apply.sh, qa_verdict=APPROVED.

### Follow-up (per architecture brief §4, non-blocking on this gate)
Runtime verification — `evidence_fragments` distinct `evidence_type` count > 1 within one digest-predict cycle window — is a 24-48h post-deploy live-probe, not verifiable at docs-review time. Recommend a lightweight PO/router check in ~2 days.
