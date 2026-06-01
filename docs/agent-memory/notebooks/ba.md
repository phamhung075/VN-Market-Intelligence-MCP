# BA — Notebook

**Last updated:** 2026-06-01 | **Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD

## VPS-DEPLOY-PLACEHOLDER-GUARD-BA · 2026-06-01

Spec complete. REQ file: `docs/handoffs/TASK_VPS-PLACEHOLDER-GUARD.md`. Zero PO blockers. NEXT: pm (task decomposition).

Key BA findings (raw-read, not relayed):
- 6 hardcode-no-fallback scripts confirmed by direct grep (fetch-vn-news L7-8, fetch-sbv L7-8, fetch-gso L8-9, fetch-tradingeconomics L7-9, fetch-prices L15-18, enrich-bctc-urls L8-10).
- article-body-fetcher.py confirmed zero placeholder tokens — only imports (requests, bs4 conditional).
- deploy-vps-proxy.sh confirmed: `set -e` L17, TMP_NEWS at L107-116, no existing pre-scp assert.
- GUARD-1 regex: MUST use `[A-Za-z][A-Za-z0-9_]*` not all-caps — architect RISK-GUARD1-REGEX.
- GUARD-2 TE_API_KEY: empty-string fallback ONLY (`${TRADING_ECONOMICS_API_KEY:-}`). Using `__TE_API_KEY__` as fallback would false-block GUARD-1 (no sed rule for that token in deployer). Existing TE guard L13-17 handles empty correctly.
- GUARD-1 post-deploy: use glob `/root/fetch-*.sh /root/*.py` not explicit filenames (RISK-POSTDEPLOY-SCOPE).
- Deliberate-violation test is locally provable without SSH — inject `__GUARD_TEST_TOKEN__` as unknown token; sed does not substitute it; assert fires.
- No Docker rebuild. No new env vars required on VPS for normal operation. 3 services need systemctl restart after redeploy: vn-news-fetch, vn-sbv-fetch, vn-price-fetch.
- 3 scripts out of scope for deployer coverage: fetch-tradingeconomics (TRADING_ECONOMICS_API_KEY may not exist in .env), fetch-gso (browser automation disabled), enrich-bctc-urls (separate systemd timer — BCTC sprint).

**Last updated:** 2026-05-31 | **Sprint:** BRIEF-SECTOR-DRIFT (BSD-3)

## BRIEF-SECTOR-DRIFT-BA · 2026-05-31 (BSD-3)

Sprint BSD-3 spec complete. REQ file: `docs/handoffs/TASK_BSD3.md`. Zero PO blockers.
NEXT: architect not required — design answer is unambiguous (b1 drop, no new abstraction). Route directly to dev-mcp-server (docs change + test only).

Key BA findings (raw-read, not relayed):
- Brief-creation sites: 3 places stamp `**Sector**:` — `docs/references/analysis-ledger-template.md` (canonical), `docs/agents/digest-predict/flow/monthly.md:49` (inline copy), `docs/agents/unified-agent/flow/market-events-log.md:21` (inline copy). All 3 must be patched.
- Seam: b1 (DROP the line). All 7 consumers (chef/news-scout/fb-poster/market-watcher/digest-predict/unified-agent/bctc-analyst) confirmed zero parse of `**Sector**:` header — each derives sector from live tools (`get_watchlist()` domain, `SECTOR_NAME_VI`, `get_sector_comparison()`). The line is human-only display.
- `**Exchange**:` is retained — non-driftable, no live tool alternative without a DB call.
- Drift-fixture test: `apps/mcp-server/src/__tests__/BSD3-brief-sector-drift.test.ts` — 4 assertions including deliberate-drift injection that proves non-false-green.
- Rebuild: BSD-3 test is additive (new file), must batch with TSH-1/EI-P2/BANK rebuild — no standalone rebuild.
- Zone split: docs change commits separately from test file (no mixed `docs/` + `apps/mcp-server/` in one commit).

---

## TOOL-SURFACE-HYGIENE-BA · 2026-05-31

Sprint TOOL-SURFACE-HYGIENE spec complete. REQ file: `docs/REQ_TOOL-SURFACE-HYGIENE.md`. Zero PO blockers. NEXT: architect (ARCH-TSH).

Key source findings (BA raw-read, not relayed):
- FR-1 (`get_market_hexagram`): `kinhDichTools.ts:510` — single registration, no duplicate. Delegation chain: `getMarketHexagram()` → `clients.ts:505` → kinh-dich-service GET /market. 501 is downstream. Split into 1a (wire = kinh-dich zone) / 1b (deregister = apps/mcp-server zone).
- FR-2 (`mark_alert_outcome` vs `write_alert_verdict`): DISTINCT datastores confirmed. `mark_alert_outcome` writes to SQLite `alerts` table (`writeAlertOutcome` from `infrastructure/db/alertStore.ts`). `write_alert_verdict` writes to `docs/data/alert-verdicts.json` (JSON file store via `infrastructure/fileStore/alertVerdictStore.ts`). Different schema, different lifecycle (post-hoc scoring vs fire-time pending write). Diff-before-merge gate required per sprint constraint.
- FR-3 macro accuracy trio: `get_calibration_report` reads `calibration_snapshots` (weekly Brier), `get_label_accuracy_report` reads `market_messages` (human label accuracy), `get_prediction_accuracy` reads Polymarket outcome computations. Three distinct sources.
- FR-4 (`get_patterns` vs `get_technical_indicators`): `get_patterns` queries `rag_analyses` (RAG memory, event/keyword match). `get_technical_indicators` calls Go TA microservice (port 5003) for RSI/MACD/MA/BB. Completely distinct.
- FR-5 (5 trigger tools): all thin SSH-trigger debug tools with same param shape but different VPS scripts. Return schemas slightly diverge (bctc returns `queued`, price returns `service`). Architect-discretion optional.
- FR-6: `project-stats.json` both `toolCount` fields = 146 (stale). Live = 154. Runs last.

---

**Last updated:** 2026-05-31 | **Sprint:** DWF-PHASE1 (P1-BA)

## DWF-PHASE1-BA · 2026-05-31

Sprint DWF-PHASE1 spec complete. REQ file: `docs/REQ_DYN-WF-PHASE1.md`. Three PO-level open questions (OQ-P1-1..3). Four architect blockers (BLOCKER-1..4). NEXT: architect (P1-ARCH).

Key decisions encoded:
- FR-P1-1: Cadence policy table in `docs/data/cadence-policy.json`. Pure deterministic look-up `(policy_id, calendar_status, signal_backlog_tier, volatility_tier) → interval_minutes`. First-match-wins, `*` wildcard. No LLM classifier (CLAUDE.md §3 hard constraint). Null result = suppress (non-guaranteed only).
- FR-P1-2: `policy_id` + `last_fired` fields additive to cowork-schedule.json slots. Absent/null = legacy cron fallback (backward-compatible). `guaranteed=true` slots use cron floor regardless of policy.
- FR-P1-3: `cowork-match-slots.js` gains `--mode=adaptive` path. Legacy cron for null-policy slots, due-based for policy slots. `last_fired=null` → always due (first-run). Output schema unchanged except two new observability fields.
- FR-P1-4: Calendar suppression — single `is_trading_day` call per tick (not per slot). Holiday/weekend suppresses all non-guaranteed slots. Tool failure → unknown → no suppression (conservative). CRITICAL: suppression must happen BEFORE per-work-item claim OR suppression path must call task_release. This is BLOCKER-1 for architect.
- FR-P1-5: Three-condition freshness downgrade for gatherers: last_regime=unknown AND signal_backlog=0 AND holiday/weekend. Advisory, non-guaranteed only.
- FR-P1-6: Pressure-state staleness gate (30 min / stale_warning) → legacy cron fallback. Degradation is never worse than today.
- FR-P1-7: `last_fired` write after successful spawn only (not on failure). Atomic write pattern. BLOCKER-3: must be single batched patch for all WON_SLOTS (not per-slot parallel — lost-update risk).

Phase-2 regression surface explicitly encoded in NFR-P1-1: leader lock + suffix-free token + published-marker belt must not be touched. Every new insertion point is additive between "leader won" and "fan-out."

Zone: cross-service only (`cowork-match-slots.js`, `cowork-team/flow/main.md`, `docs/data/cowork-schedule.json`, `docs/data/cadence-policy.json`). Zero diff on `apps/mcp-server/`.

TASKS.md updated: P1-BA ✅ + P1-ARCH 🔄 added. Files left unstaged per commit-discipline. NEXT: architect (P1-ARCH).

---

**Last updated:** 2026-05-30 | **Sprint:** BCTC-TRUST-RED (TR-BA)

## BCTC-TRUST-RED-BA · 2026-05-30

Sprint BCTC-TRUST-RED spec complete. REQ file: `docs/REQ_BCTC-TRUST-RED.md`. Blocker B-1 (ACB UUID) is a dev-time blocker, not a PO blocker. Zero PO blockers. NEXT: pm (TR-PM).

Key decisions encoded as requirements:

- FR-TR0-1 (purge): One-time in-container SQL only — NOT committed to migration. ACB UUID must be resolved by dev before running. Pattern: `SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1`.
- FR-TR0-2 (enum): `REJECTED_SANITY` added to `window_status` Zod enum in `pushBctcRefinedUnitTool.ts` + DDL comment in schema. No ALTER TABLE.
- FR-TR0-3 (ingest gate): validateBctcUnit called in push handler before INSERT. BLOCK → write with `window_status='REJECTED_SANITY'`, return `{ok:false, rejected_reason}`. WARN → write with adjusted_confidence, ok:true.
- FR-TR0-4 (publish guard): `checkPublishability(db, reportId)` private helper in `bctcFullTools.ts`. Evaluates PUB-1..PUB-4 in sequence. `refine_status` and `id` must be in `ReportRow` SELECT (already present per code read).
- FR-TR1-1 (DT-1): `bctcSanityValidator.ts` new domain service. Pure function. Cyclic-substring check via doubled ascending/descending cycles. ≥ 2 distinct hits = BLOCK; 1 hit = WARN.
- FR-TR1-2 (DT-2+DT-3): `bctcMagnitudeValidator.ts` new domain service. DT-2 income check + forced-zero balance check. DT-3 revenue contradiction (≥ 3 distinct values with >20% pairwise divergence). Label-match ambiguity → WARN not BLOCK (RISK-3 mitigation).
- FR-TR1-3 (finalize wiring): DT-2/DT-3 called after applyCorrections, before transaction. BLOCK → skip INSERT, set refine_status='REJECTED_SANITY'. CONFIRMED guard (Layer 1) takes precedence.
- FR-TR1-4 (DT-4): logger.warn only. No DB write. No block.
- TR-2: Routed to BCTC-LAYOUT-FIRST as LF-QA acceptance criteria (EC-1/3/4/5/1b). PM must add.

Zone: `apps/mcp-server/src/` only. Zero diff on: HCM-DISAMBIG-extraction.test.ts, pdf-extractor/*, docs/agents/refine_bctc_md/*.

TASKS.md updated: TR-BA ✅ + TR-PM 🔄 added. Files left unstaged per commit-discipline. NEXT: pm (task breakdown).

---

## Archived sprint specs (condensed)

- **BCTC-HUMAN-CONFIRM-BA** ✅ 2026-05-30. REQ `docs/REQ_BCTC-HUMAN-CONFIRM.md`. bctc_human_corrections table, 3-layer lock, confirm_status column, source_confidence column, Option B2 re-anchor key. SHIPPED.

---

## Archived sprint specs (condensed — older)

- **BCTC-AGENTIC-REFINE-BA** ✅ 2026-05-30. REQ `docs/REQ_BCTC-AGENTIC-REFINE.md`. 3-zone split (pdf-extractor/mcp-server/agent-father). SHIPPED.
- **DATA-PIPELINE-INTEGRITY-BA** ✅ 2026-05-30. REQ `docs/REQ_DATA-PIPELINE-INTEGRITY.md`. DPI-1..4 root causes confirmed. DPI-3 assigned dev-mcp-server (not macro-indicators). SHIPPED.
- **BCTC-TABLE-BOUNDARY-BA** ✅ 2026-05-29. REQ `docs/REQ_BCTC-TABLE-BOUNDARY.md`. 5 FR decisions (schema-page-type, intervening-prose break, title-band break, blank-page gate, output contract). SHIPPED.
- **VNH-SECTOR-FIX-BA** ✅ 2026-05-29. REQ `docs/REQ_VNH-SECTOR-FIX.md`. VNH domain real_estate→agriculture, DomainType type-tightening. SHIPPED.
- **Pre-2026-05-29 specs** — archived to `docs/archive/notebooks/ba-2026-05-21.md`.

## Known patterns / preferences

- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- apps/mcp-server zone = dev-mcp-server; kinh-dich-service zone = separate dev owner (port 5005).
- mark_alert_outcome → SQLite `alerts` table; write_alert_verdict → `docs/data/alert-verdicts.json` file store. DISTINCT.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- TASKS.md cap = 80L; notebook cap = 200L — check wc -l before adding rows.
