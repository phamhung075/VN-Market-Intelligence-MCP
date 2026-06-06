# Architect — Notebook

**Last updated:** 2026-06-06 20:15 UTC | **Sprint:** ORCH-TASK-CANON

[3 most recent cycles retained below. Archive in git history.]

## 2026-06-06T20:15Z — ORCH-TASK-CANON blueprint

**Sprint:** ORCH-TASK-CANON — canonical task schema + decision visibility on orchestration dashboard.

**Blocker rulings (all 4 issued):**
- BLOCKER-1 (schema SSOT): BOTH — TypeScript interface `OrchStateTaskBoardTask` is machine-SSOT (compile-time enforcement) + `docs/standards/task-schema.md` (new, human-readable reference). TypeScript interface gains canonical `id` field (was `task_id`); `task_id` becomes legacy-optional.
- BLOCKER-2 (counts.done): `(taskBoard.done ?? []).length` authoritative. Active-sprint DONE tasks are transitional, excluded from counts.done.
- BLOCKER-3 (F3 rollout): `board.done ?? []` primary source, no startsWith fallback. Ships AFTER F1B migration + F2 REBUILD verified live. Empty done group is correct degraded state, not a crash.
- BLOCKER-4 (migration runner): agent-father runs F1B jq migration (ops-lane, not TypeScript). F1B commit = green light for F2 TypeScript rename.

**Fluidity audit addendum (F-4/F-5) folded into F4:**
- Per-agent journal path: `sprint-${SPRINT_ID}-${AGENT_ID}.md` — eliminates all parallel-append contention.
- CAP-REACHED rolls to continuation file + send_telegram(bug) — mandatory rule never silently broken.
- journalStore.ts glob: `sprint-${id}*.md` reads all per-agent files + legacy single-file (back-compat).

**Dispatch order confirmed:**
AF-ORCH-F1A-F4 (agent-father, merged F1a+F4) → AF-ORCH-F1B (agent-father, migration) → F2-MCP (dev-mcp-server + REBUILD) → F3-FE (dev-frontend + REBUILD) → QA

**Files produced:**
- `docs/handoffs/ORCH-TASK-CANON-ARCH.md` — full blueprint
- `docs/agent-memory/decisions/sprint-ORCH-TASK-CANON.md` — arch-S1 journal entry

**NEXT:** pm → create 5 tasks: AF-ORCH-F1A-F4 (agent-father), AF-ORCH-F1B (agent-father), F2-MCP (dev-mcp-server), F3-FE (dev-frontend), QA-ORCH-TASK-CANON.

## 2026-06-05T21:30Z — ORCH-DASH-DECISION-DRILLDOWN blueprint

**Sprint:** ORCH-DASH-DECISION-DRILLDOWN — clickable DONE-task decision trail on /dashboard/orchestration.

**Serving layer confirmed (raw read):** `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` exclusively. Go api-gateway :4000 not deployed. Zone F2 = dev-mcp-server.

**Key rulings:**
- JOIN-KEY: BOTH (optional `**task-id:**` line in STEP format + sprint_bucket fallback for legacy entries). Parser: task-id present → `by_task[task_id]`; absent → `sprint_bucket[sprint_id]`.
- SPRINT-ID DISCOVERY: union of ALL sprint_goal.entries[*].sprint_id (all statuses, not just active) + task_board.active_sprints[*].id — covers just-closed sprints whose DONE tasks still show on dashboard.
- LATENCY: per-sprint mtime cache (singleton Map in journalStore.ts); invalidated on mtime change; zero re-parse cost on 5s polling loop when no agent is writing.
- ACCORDION UX: multi-open (Set<string> of open task IDs) — audit surface requires comparing multiple task decisions simultaneously; single-open is destructive for that workflow.

**Files produced:**
- `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` — full blueprint (file map, parser pseudocode, risk flags, PM subtask spec)
- `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` — 4 architect STEP entries (rationale for all rulings)
- `docs/data/orch/orch-state.json` — ORCH-DASH sprint added to active_sprints; ARCH task DONE; PM-ORCH + F1/F2/F3/QA tasks TODO

**NEXT:** pm → create ARCH-ORCH-F1/F2/F3/QA subtask handoffs per PM-ORCH-DASH-DECISION-DRILLDOWN; dispatch agent-father (F1) first.

**Risk to flag for PM:** R-2 (mtime cache test bleed — journalStore.ts must export `_clearCacheForTesting()`); R-1 (buildOrchestrationDto impure after F2 — inject decisionsDir path parameter for testability).

## 2026-06-04T22:35Z — CARRY-YIELD-SINGLE-SIGNAL-FIXTURE (DSI-INV-1 gap on single-signal path)

**Finding:** DSI sprint /snapshot fix was necessary-not-sufficient. GET /carry-trade-signal and GET /yield-spread-signal had DI-free Go handler closures with own fixture consts (fedFunds=5.33, deposit=4.7, earningYield=8.2) — served FII_OUTFLOW_RISK/−0.63 while /snapshot served live NEUTRAL/+1.38. Zero source_tier/is_estimate in responses.

**Decision:** Option B (consolidate) — delete handlers_carry.go + handlers_yield.go + 2 router entries; TS MCP tools call POST /snapshot and project signals.carry/signals.yield sub-objects. Kills fixture-handler class definitively. Less code, less surface, single DSI-INV-1 logic path.

**Per-zone spec:**
- B-1: apps/macro-indicators/ — delete 2 files, edit router.go (remove 2 routes), rewrite 2 router tests (delete fixture-asserting, add retirement guard + anti-fixture regression guard).
- B-2: apps/mcp-server/ — edit carryTools.ts + dinhGiaTools.ts: GET→POST /snapshot + sub-object projection; adds source_tier/is_estimate/fetched_at_source to tool output.

**Brief:** `docs/architecture-briefs/2026-06-05-carry-yield-single-signal-fixture.md`
**DSI brief annotation:** §9 sequence summary updated with CARRY-YIELD-SINGLE-SIGNAL-FIXTURE entry.
**NEXT:** pm → create 2 sub-tasks (B-1 dev-macro-indicators, B-2 dev-mcp-server, sequential).

## 2026-06-05T00:00Z — FU-MACRO-INDICATORS-MISSCOPE + FU-SBV-DEPOSIT-PROVENANCE-GO

**Items:** Two WIP batched corrections to DSI-ARCH brief + handoff.

**Item 1 — FU-MACRO-INDICATORS-MISSCOPE (DONE):**
Deploy-scope error corrected in both docs. `docker ps` confirms macro-indicators:5004 Up+healthy. "LATENT LANDMINE / not in deploy set" annotations struck through and annotated RESOLVED. DSI-INV-1 producer fix (resolveFedFundsRate/resolveVNDDepositRate → (value,isLive); buildCarryDTO suppression) reclassified from "latent backlog" to "live fix, already shipped." R-4 annotated RESOLVED HOT. No silent rewrites — original text preserved with strikethrough + dated correction notes.

**Item 2 — FU-SBV-DEPOSIT-PROVENANCE-GO (RULING ISSUED):**
Tier ruling for SBV administered max deposit rate: `tier:2 / is_estimate:false` — IF `sbv_rates` row carries a real SBV decree `effective_date` (not a DB insert timestamp). `tier:4 / is_estimate:true` if no effective_date column/value exists (bare constant). EFFR unaffected (tier:1 correct). `buildCarryDTO` must use min(tier:1, tier:2) = tier:2 for the overall carry DTO `SourceTier` when vndDeposit resolves live but is only tier:2. Full spec in brief §2 addendum. Go code change = dev-macro-indicators's job.

**Files changed:** `docs/architecture-briefs/2026-06-04-data-serve-integrity.md`, `docs/handoffs/DSI-ARCH.md`.
**Next:** dev-macro-indicators implements Go code change per §2 addendum spec.

## 2026-06-04T19:30Z — DSI-ARCH: DATA-SERVE-INTEGRITY brief + per-zone split

**Brief:** `docs/architecture-briefs/2026-06-04-data-serve-integrity.md`
**Handoff:** `docs/handoffs/DSI-ARCH.md`

**Fleet invariant defined (DSI-INV-1):** No served macro/price/financial value may be a hardcoded substitute presented as live. Fallback = FAIL-LOUD OR carry-forward with per-field source_tier + true fetched_at (never re-stamped) + is_estimate that propagates fetcher → DB → tool output → TS type → render.

**Regression root-cause confirmed:**
- `macroIndicatorSla.ts:35,73` queries `country='VN'` — dead since commit 7a0adfdc (1923a, 2026-05-17) which moved active writer to `'vietnam'`.
- `freshnessSlaChecker` always returns false (no row found) → SLA alert never fires.
- Domain fetcher (`macroIndicatorFetcher.ts`) writing `'VN'` is dead code (production path returns `success:false`).
- push-gso HTTP endpoint (server.ts:1435,1520) defaults to `'VN'` — may write rows if VPS omits country.
- `usecases.go` allLive flag covers only oil/gold/usdVnd, NOT carry/yield — fixture fed/deposit invisible in dataSource.

**Per-zone split:**
- dev-mcp-server: S1-SLA (XS, first), S1-FE-TYPE (S), S2-PRICE client side (S), S3-SECTOR-FIN (L, P2)
- dev-stock-price: S2-PRICE service side (M) — Staleness field missing from FetchPriceResponse DTO
- dev-macro-indicators: LATENT LANDMINE (not deployed, backlog only)

**Sequence:** DSI-S1-SLA first (restores detection net) → DSI-S1-MACRO + DSI-S1-FE-TYPE → DSI-S2-PRICE → DSI-S3-SECTOR-FIN.

**Next agent:** BA-DSI. orch-state.head.next_agent = 'ba'.

## 2026-06-04T10:30Z — FIX-I officer-appointment-year / CEO tenure design

**Handoff:** `docs/handoffs/TASK_FIX-I.md`

**Multi-zone split (relay to pm):**
- Zone A: `vps-scripts/` → dev-vps-crawls — Python scraper + shell loop + systemd, mirrors FIX-G agm-plan pattern exactly; serves via VPS:8765/proxy/board-details.
- Zone B: `apps/mcp-server/` → dev-mcp-server — extend `vnstock_officers` with `appointment_year INTEGER` nullable column (ALTER TABLE migration); new `boardDetailsFetcher.ts` + `boardDetailsStore.ts` + `boardDetailsJob.ts` (all mirror agmPlan counterparts); extend `companyProfileTools.ts` to surface `appointment_year` + `ceo_tenure_years` on every `OfficerEntry`.

**Key design decisions:**
- EXTEND `vnstock_officers` (not new table): avoids name-mismatch JOIN orphans; single-table read in get_company_profile preserved; UPDATE-only in store (not INSERT OR REPLACE) to preserve VCI-sourced own_percent/quantity columns.
- Only current-term (page=1) appointment year stored — no historical term pagination.
- `appointment_year=null` for N/A entries; `ceo_tenure_years=null` propagated honestly (no fabrication).
- BUILD-STANDARD: lean (existing service, new feature).

**Sprint close gate:** FIX-I is the last open core item of RAPID-DATA-LAYER. Ship + router raw-verify `get_company_profile("FPT").officers[0].appointment_year=1988` → sprint closes.

