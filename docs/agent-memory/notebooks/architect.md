# Architect — Notebook

**Last updated:** 2026-06-02 12:00 UTC | **Sprint:** COWORK-LEADER-SELFLOCK

[3 most recent cycles retained below. Archive in git history.]

## 2026-06-02T12:00Z — COWORK-LEADER-SELFLOCK (leader-lock self-blocking fix)

**Brief:** `docs/architecture-briefs/2026-06-02-cowork-leader-selflock.md`

**Defect:** Step 0b re-claims a still-heartbeated leader lock. `task_claim` is not
re-entrant → returns `claimed:false` even for own-held lock → Step 0b silently exits
→ guaranteed slots dropped. Confirmed: chef-morning dropped 2026-06-02 (05:18Z tick
hit lock heartbeated to 05:34Z by the 05:03Z WON tick).

**Discriminator decision: `owner_session` via heartbeat probe, NOT `owner_agent` literal.**
Rationale: `owner_agent="cowork-dispatcher"` is a shared string — both concurrent sessions
would see own-held and both proceed, re-opening dup-spawn hole. `task_heartbeat` is
guarded server-side with `AND owner_session=<pid-bound-token>` → only the holding OS
process gets `ok=true`. The flow does not need to know its own session token.

**Fix logic:** After `claimed=false`, call `task_heartbeat("cowork-leader")`. If `ok=true`
→ own-held → renew and proceed. If `ok=false` → peer-held → silent-exit (unchanged).
Step 4.6b heartbeat stays; peer-held silent-exit stays. One-file edit (Step 0b only).

**Two-concurrent-session safety:** Session B's heartbeat hits owner_session mismatch
→ `changes=0` → `ok=false` → peer-held path. Phase-2 dup-spawn protection intact.

**Recurring-bug note:** Root cause = assumption that `task_claim` is re-entrant (wrong)
+ 1800s TTL > 900s inter-tick gap with no observability on silent-exit. Observability
gap flagged in brief §8 for PO backlog.

---

## 2026-06-02T10:45Z — FE-REROUTE-REAL-DATA (FE pages serving real data)

**Brief:** `docs/architecture-briefs/2026-06-02-fe-reroute-real-data.md`

**Per-dataset availability verdicts:**
- Kinh Dich reading: REAL-REACHABLE — `kinhdich_readings` in DB, `getLatestReading()` exists
- Kinh Dich market: REAL-REACHABLE (derived) — aggregate from watchlist readings, `derived:true` flag
- Stock price history: REAL-REACHABLE — `daily_ohlcv` table, existing `priceQueries.ts` pattern
- Stock price batch: REAL-REACHABLE — `market_prices` + `daily_ohlcv` fallback + `agent_signals` count
- News (Reuters/Bloomberg): REAL-REACHABLE — `rag_analyses` table, reuse `newsFetchLiveHandler` query
- TA indicators: HONEST UNAVAILABLE — no cache in mcp-server; frontend already handles `ta=null` gracefully

**Key design decisions:**
- 5 new REST endpoints on mcp-server under `/mcp/api/` namespace
- api-gateway `HandleProxy` gains not-deployed branch: routes `kinh-dich`/`stock`/`news` to mcp-server with path rewrite
- New primitive `not-deployed-rerouter/reroute.go` for path rewriting (pure, testable)
- `NOT_DEPLOYED_SERVICES` env var drives the set — restoring a real service = env var edit, no code change
- SSOT from `system-map.json .not_deployed_short_keys`; not hardcoded in Go

**Critical risks flagged:**
- R-1: VNINDEX actual code in `daily_ohlcv` must be verified before assuming `WHERE code='VNINDEX'`
- R-6: DDD footgun — route handlers must NOT call domain `kinhDichReading.ts` live per request

**Phase 1 (Kinh Dich + prices):** 12 tasks FE-RR-1..12 + QA-1. Sequential: mcp-server → api-gateway → rebuild → QA.
**Phase 2 (News + DB page):** 5 tasks FE-RR-13..17 + QA-2. After Phase 1 green.

---

## 2026-06-02T08:30Z — A-01b-1 DASHBOARD FALSE-RED (not-deployed status)

**Brief:** `docs/architecture-briefs/2026-06-02-dashboard-health-not-deployed.md`
**SSOT edit:** `docs/data/system-map.json` — added `short_key_to_compose` map + `not_deployed_short_keys` array; fixed `_ssot` self-ref (was `.infrastructure.docker...`, now `.project.infrastructure.docker...`).

Root cause confirmed: api-gateway probes all 9 services, 7 time-out → `StatusDown`, `ComputeOverallStatus` sees mixed → `degraded`. Not a real outage.

**Decisions made (unambiguous for devs):**
- Enum literal: `"not_deployed"` (Go const `StatusNotDeployed`, TS union extension).
- Classify-before-probe in `AggregateHealthService.Aggregate`; inject `[]string` via constructor + `NOT_DEPLOYED_SERVICES` env default.
- `ComputeOverallStatus`: filter `not_deployed` entries before OK/DEGRADED/DOWN loop; empty-after-filter → `"ok"` (not `"down"`).
- Frontend: grey `NOT DEPLOYED` badge; latency guard `>= 0`; info sub-text when `ok` + any `not_deployed`.
- Sequential dispatch: A-01b-2 (api-gateway) first, A-01b-3 (frontend) second.

**QA DoD anti-false-green: two mandatory clauses (A=not-deployed-grey, B=real-docker-stop-still-fires-red).**

---

## 2026-06-02T05:04Z — BCTC-EXTRACT-QUALITY (BEQ-1 diagnostic spike)

**Brief:** `docs/architecture-briefs/2026-06-02-bctc-extract-quality.md`

4 symptoms, all root-caused to one structural gap: refine pipeline covers <50% of corpus.

**A. EMPTY (CTG/VCB):** refine_status=PENDING, 0 bctc_refined_units, PUB-1 gate blocks
get_bctc_full. CTG also has cover-letter-only PDF (2 pages, no tables). Not a parser
failure — refine job was never dispatched for these tickers.

**B. ZEROED SECONDARY LINES (FPT/ACB):** bctcScalarAggregator writes only 10/~20 columns.
operating_profit/ebitda/cash/EPS are NOT in ScalarAggregate — they permanently hold the
legacy OCR-parse placeholder (0 or 1). FPT code=30 value=2.75T IS in table_rows but
is never read by the aggregator. Pure mapping scope gap. Recurring-bug flag: ≥5 fix
commits on bctcScalarAggregator.ts — escalation warranted, full column audit needed.

**C. GARBAGE /docs SCALARS:** /docs reads financial_reports.net_profit directly.
Same column as get_bctc_full; no divergence. PENDING tickers retain OCR-parse garbage.
VNM=5.1e-05: 143 table_rows all NULL value_current + no refine units. CTG=5, EIB=1:
near-zero from failed regex on cover-letter/degraded OCR.

**D. CONTAMINATION (FPT YoY):** FPT 2025-Q4 prior period has net_profit=20,225M =
net_revenue÷1000 (legacy OCR unit-scale bug, pdf-parse path). buildComparisonSection
has no refine_status guard on the prior row → uses garbage as baseline. 2-line fix.

**Fix plan:** BEQ-4 (guard, XS) → BEQ-2 (refine trigger, S) → BEQ-3 (full column audit, M)
→ BEQ-5 (CTG PDF fetch, existing BCTC-CTG-ATTACHMENT-FETCH backlog).
All separable from BCTC-LAYOUT-FIRST.

---

## 2026-06-01T21:30Z — DASHBOARD-STATE-SYNC (analysis-only brief)

**Brief:** `docs/architecture-briefs/2026-06-01-dashboard-state-sync.md`

Brownfield recon: orchestration state (pipeline-state.json, TASKS.md, DASHBOARD.md,
agent notebooks, analysis-briefs) lives ONLY in repo docs/ — no container reachable,
no HTTP endpoint, zero frontend surface. mcp-server has docs/agent-memory mounted but
NOT pipeline-state.json / TASKS.md / signals/DASHBOARD.md.

Recommendation: Option A — new read-only mcp-server endpoints + new volume mounts +
frontend Remix loader routes through api-gateway. REJECTED: Option B (frontend bind-mount
violates gateway-only rule), Option C (sync-to-DB over-engineered for hourly cadence).

Critical flag: NEVER parse TASKS.md/DASHBOARD.md markdown in an endpoint. Mandate JSON
twins (tasks-state.json, signals-state.json) emitted by PO/signal-dashboard skill as
machine-readable projections BEFORE dev impl.

Phase 1: pipeline-state.json endpoint only (safe, no parsing risk, immediate value).
Phase 2: tasks + signals after twins shipped.

Scope: ~14–18 atomic tasks across 3 zones (agent-father, dev-mcp-server, dev-frontend).

---

## 2026-06-01T20:45:42Z — FBT-ARCH (FRONTEND-BCTC-TAB)

**Brief:** `docs/architecture-briefs/2026-06-01-frontend-bctc-inspect-tab.md`

A2 server-side proxy design locked for surfacing the BCTC Inspect viewer as a new dashboard tab in apps/frontend; two Remix resource routes + one NAV_ITEMS entry, zero mcp-server edits, with full binary-stream passthrough contract for PDF and PNG sub-paths.

**Signal dropped:** `docs/signals/frontend-bctc-inspect-tab.json` → agent-father → dev-frontend

---

## VPS-DEPLOY-PLACEHOLDER-GUARD (2026-06-01T11:20 UTC) — DEPLOY GUARD DESIGN

**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD | Task: ARCH (a/b/c boundary design)

**Root cause confirmed (raw-read):** `scripts/deploy-vps-proxy.sh` render step EXISTS (L108-110) but cafef sprint 814088b0 bypassed it via ad-hoc scp, clobbering `/root/fetch-vn-news.sh` with raw template. 6 hardcode-no-fallback scripts; 9 already safe.

**Key brownfield findings:**
- Deploy script deploys 5 services (prices/bctc/news/sbv/foreign-flow). NOT deployed: tradingeconomics, gso, enrich-bctc-urls, article-body-fetcher.py.
- `article-body-fetcher.py` has ZERO `__PLACEHOLDER__` tokens (it takes `--url` as CLI arg, no MCP contact directly). Pre-scp assert trivially passes for it.
- `fetch-tradingeconomics.sh` has a 3rd placeholder `__TE_API_KEY__`. Deploy script has no sed rule for it. GUARD-2 must use empty-string fallback for TE_API_KEY (not `__TE_API_KEY__`) to avoid GUARD-1 false-block.

**Decisions:**
- GUARD-2: ALL-6 scripts in one slice (symmetric blast radius, convert-all prevents future recurrence of same class)
- GUARD-1 regex: `__[A-Za-z][A-Za-z0-9_]*__` (case-insensitive, broader than original brief)
- GUARD-3 scope: article-body-fetcher.py + pip3 install bs4 only; tradingeconomics/gso/enrich deferred
- Zone: dev-vps-crawls owns all three guards + scripts/deploy-vps-proxy.sh changes
- DV test: inject `__GUARD_TEST_TOKEN__` into fixture → pre-scp assert must exit 1 before scp

**Brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md`

---

## PROSE-DEV-1 (2026-05-31T23:00 UTC) — PROSE TEXT LOSS ROOT CAUSE

**Sprint:** PROSE-DEV-1 | Task: ARCH (operator defect — prose pages blank in Văn bản OCR tab)

**Root cause: display layer only (Layer C). Zone: dev-mcp-server.**

**Evidence (concrete, from live DB + code):**
- Layer A (extraction): CLEAN. `pdf_extracted_text` has all 27 ACB pages, text_len 352-2327.
- Layer B (storage/refine): CLEAN. `bctc_refined_units` has 27 DONE prose units, md_len 129-2431.
- Layer C (viewer): ROOT CAUSE. `handleBctcInspectOcr` in `bctcInspectHandler.ts` queries `bctc_layout_units WHERE page_type='table'`. ACB has 5 prose-typed PEK units with `stitched_markdown=""`. When a prose page is requested: table filter returns null → coverage-gap path emits `text_content:""` → viewer shows "No PEK unit for page N". Raw OCR in `pdf_extracted_text` is never consulted.

**Fix (PROSE-DEV-1):**
1. `bctcInspectHandler.ts`: in coverage-gap branch, add `pdf_extracted_text` fallback query for the requested page. Serve `text_content: rawRow.text_content` (+ `confidence: rawRow.confidence`) while keeping `pek_coverage_gap:true`.
2. `bctc-inspector.html`: render `text_content` when `pek_coverage_gap=true` (remove static "No PEK unit" message, replace with gap banner + raw text).

**DV test:** `PROSE-DEV-1-prose-text-display.test.ts` — DV-1 RED (text_content="" before) / GREEN (text_content="Prose page one content" after). DV-2/DV-3 regressions green throughout.

**Brief:** `docs/architecture-briefs/2026-05-31-prose-text-loss.md`

---

## VPS-DEPLOY-PLACEHOLDER-GUARD — DEPLOYER CONSOLIDATION (2026-06-01T14:12 UTC)

**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD | Task: ARCH (wrong-deployer design decision)

**Decision: OPTION A — Consolidate to deploy-vinahost.sh as single canonical deployer.**

**Verification raw (independent read):**
- `deploy-vinahost.sh` → Vinahost 125.212.251.27 (live), 9 services, 0 guards.
- `deploy-vps-proxy.sh` → Vultr 139.180.185.18 (dead since 2026-04-13), 5 services, GUARD-1/2/3.
- `deploy-vinahost.sh` ALREADY has `__TE_API_KEY__` sed rule at L232-234.
- `fetch-tradingeconomics.sh` L15 VPS-side graceful-skip: correct defence-in-depth, retain as-is.
- `enrich-bctc-urls.sh` fully covered by vinahost section 7; no extra guards needed.

**Rationale (A over B):** B keeps Vultr deployer alive → future agents keep landing work on dead host.
GUARD-1 post-deploy SSH verify in deploy-vps-proxy.sh would connect to dead server = false-green.
deploy-vinahost.sh ships superset (9 vs 5 services); no service in deploy-vps-proxy.sh is absent.
article-body-fetcher.py must reach Vinahost (cafef endpoint consumer is mcp-server on Vinahost).

**Task map for PM:** T1=OPS-RECON(ops gate) → T2=GUARD-1 migrate 9 blocks → T3=GUARD-3 article-body
block → T4=retire deploy-vps-proxy.sh + remove VULTR_IP/.env → T5=QA (DV-1..6).

**Brief:** `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md`

---
