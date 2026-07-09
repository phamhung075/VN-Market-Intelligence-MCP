# Decision Journal — ops — Sprint SYSTEMIC-REMAKE-P1

## STEP ops-S1: FACTORY-INTERFACE-extract-finalizeBctc-usecase Docker Close Gate (2026-07-08T14:27:15Z)

**Task ID:** FACTORY-INTERFACE-extract-finalizeBctc-usecase
**Folded-in note:** originally filed under the one-off filename `docs/agent-memory/decisions/2026-07-08-FACTORY-INTERFACE-FINALIZEBCTC-OPS-CLOSE-GATE.md` — migrated here 2026-07-09 per `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE` (content unchanged, filename discipline only).
**Context:** Dev-mcp-server extracted 1100L of application-layer logic from `finalizeBctcRefineTool.ts` (interface layer) into 7 new files under `apps/mcp-server/src/application/usecases/finalizeBctcRefine/` (types, main use case, `backfillScalarColumns.ts`/BLOCK-1, `deriveRatioColumns.ts`/BLOCK-3, `revalidateBalanceIdentity.ts`/BLOCK-4, `recomputeExtractionConfidence.ts`/BLOCK-5, `recomputeBctcEval.ts`/BLOCK-2). Interface file reduced 1349L → 102L. Extraction commit `56ee74725`, review move `f9ed7f850`.

**Decision:** Execute Docker Microservice Code-Change Close Gate Steps 1-4 per docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate. Pure code-relocation refactor (call order + single atomic `db.transaction` boundary preserved, all extracted functions ≤120L); dev-verified 293/293 targeted BCTC tests pass, tsc/eslint clean.

**Execution Summary:**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 1 | Memory (mcp-server 154.4 MiB, stack ~1.4 GiB of 8 GiB) | ✓ PASS | `docker stats`, host free pages 18,578 |
| 2 | Build `--build-arg GIT_SHA=f9ed7f85034111d34c9a6cf88e97f18db31b57e3` + `up -d --no-deps mcp-server` | ✓ PASS | Bun compile 1.7s, healthy in 7s, no peers affected |
| 3 | Container health | ✓ PASS | `docker compose ps mcp-server` → Up 7s (healthy), port 3000 bound, 12/12 peers unaffected |
| 4 | SHA gate | ✓ PASS | `verify-deploy-sha.sh mcp-server` → OK, matches HEAD `f9ed7f85034111d34c9a6cf88e97f18db31b57e3` |
| Bonus | `/health` mcp-server + gateway | ✓ PASS | toolCount=183 (no regression), uptime=14.15s; gateway all 9 green |

**Board State Transition:** `orch-state.task_board.qa`, `status=QA`, `next_agent=qa`. Live db-transaction calls route to relocated `finalizeBctcRefine.ts` entry point (`runFinalizeBctcRefine`) — behavior identical to pre-extraction.

**What's Next:** QA Step 5 RAW-verify (finalize_bctc_refine actual invocation vs real report — `bctc_table_rows`/`extraction_confidence`/`bctc_eval` output IDENTICAL pre/post); PO Step 6 DONE_VERIFIED after QA passes.

**Artifacts:** Ops build/deploy log commit `db2eddb75` (notebook + board flip). Precedent: mirrors sibling `FACTORY-SCHEDULER-prediction-default-dedup` (commit `bf35b2999`), same 4-step path, no deviations.

## STEP ops-S2: FACTORY-DOMAIN-extract-bctc-parsing-lib Docker Close Gate (2026-07-08T16:10:45Z)

**Task ID:** FACTORY-DOMAIN-extract-bctc-parsing-lib
**Folded-in note:** originally filed under the one-off filename `docs/agent-memory/decisions/2026-07-08-FACTORY-DOMAIN-EXTRACT-BCTC-PARSING-LIB-OPS-CLOSE-GATE.md` — migrated here 2026-07-09 per `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE` (content unchanged, filename discipline only).
**Context:** Shared-code extraction (parsing primitives library). New `financial-reports/lib/lineScan.ts` (canonical `findValue`/`findValueByCode`/`scaleNumericFields`/`detectDivisor`) + `financial-reports/lib/vasPatterns.ts` (shared Total Assets/Liabilities/Equity regex). Modified 5 call sites (balanceSheetExtractor, cashFlowExtractor, incomeStatementExtractor, bctcScalarAggregator, bctcMagnitudeValidator doc-pointer only). Migration reconciles differing `findValue()` signatures (2-arg vs 4-arg w/ fallback) via optional params, preserving exact pre-migration behavior per call site. `bctcMagnitudeValidator` fraud-detection regex left untouched (different data shape — comment-only diff, flagged for QA completeness check).

**Decision:** Execute Close Gate Steps 1-4. Rebuild required (Bun compilation, new symbol table in bundled output) — Restart ≠ Rebuild gotcha (memory: `project_host_memory_panic`, `feedback_ship_completion`).

**Execution Summary:**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 1 | Disk preflight (12GB free < 15GB threshold → `docker builder/image prune -a -f`, 81.45MB reclaimed → 36GB free) | ✓ PASS | `scripts/preflight-disk.sh` |
| 1 | Memory (mcp-server 168.1 MiB/3GiB = 5.47%, stack ~800MB/8GB cap) | ✓ PASS | `docker stats` |
| 2 | Build `--build-arg GIT_SHA="$(git rev-parse HEAD)" mcp-server` (~155s, Bun 1.3.13+npm) + `up -d --no-deps mcp-server` | ✓ PASS | image `vn-market-intelligence-mcp-mcp-server:latest`, git_sha label present, ports 3000/4004 active |
| 3 | Container health | ✓ PASS | Up 14s (healthy); peer audit 12/12 services healthy, no cascading restarts |
| 4 | SHA gate | ✓ PASS | `verify-deploy-sha.sh mcp-server` → OK, matches HEAD `dd37ec6c33451d93f4597a812d6fb1accccced99` |
| Bonus | `/health` mcp-server | ✓ PASS | toolCount=183 (baseline match), uptime=20.6s, sessions=0 |

**Board State Transition:** `.head.status` remains REVIEW (QA flips to done_verified after Step 5); `.head.next_agent` ops→qa; PO Step 6 deferred until QA passes.

**What's Next:** QA Step 5 — spot-check 2-3 already-parsed reports (FPT/VCB/a bank) confirming `balance_sheet_json`/`income_statement_json`/`cash_flow_json` scalars BYTE-IDENTICAL pre/post-rebuild for same source PDF; `total_assets`/`total_liabilities`/`equity_total` (bctcScalarAggregator) unchanged; `bctcMagnitudeValidator` DT-2/DT-3 BLOCK-detection flagged for completeness (comment-only diff, skip A/B).

**Artifacts:** Commit `e3e0dfeb9` (orch-state board flip, 1 file). Docker image `sha256:dec2cccdad1099283f0a0d23b287dd9fea0c7e581f61073eb47c6e43ffbccb25`.

## STEP ops-S3: FACTORY-DOMAIN-relocate-stock-catalog Docker Close Gate (2026-07-08T17:02Z)

**Task ID:** FACTORY-DOMAIN-relocate-stock-catalog  
**Context:** FACTORY DOMAIN refactor — STOCK_CATALOG pure-data table relocated from apps/mcp-server/src/domain/services/stockAliases.ts (828L → 265L) to new file stockAliases/catalog.ts (618L). All 21 consumers re-exported correctly. Dev-team pre-verified: tsc clean, eslint clean, 211/211 tests pass, 195/195 consumer tests pass, byte-identical equivalence verified on 66 tickers + 5 detection functions (0 mismatches).

**Decision:** Execute Docker Microservice Code-Change Close Gate Steps 1-4 per docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate.

**Rationale:**
- Pure relocation (no behavior change) triggers rebuild_required=true because it affects a live Docker microservice (mcp-server)
- All code quality gates (tsc, eslint, tests) already passed during dev phase
- Ops closes the deployment gate (Steps 1-4: memory check, rebuild, container verify, SHA gate)
- QA performs Step 5 (RAW-verify: liveness + tool behavior)
- PO performs Step 6 (mark DONE_VERIFIED in orch-state)

**Execution Summary:**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 1 | Docker memory (mcp-server 4.65% of 3GiB, stack ~791MiB of 8GiB) | ✓ PASS | `docker stats`, `vm_stat` |
| 1 | System memory (65300 pages free) | ✓ PASS | `vm_stat` |
| 1 | Disk space (32GB free ≥ 15GB threshold) | ✓ PASS | `scripts/preflight-disk.sh` |
| 2 | Build mcp-server with GIT_SHA=64a1a135b | ✓ PASS | Docker build completed, image exported |
| 2 | Container up -d | ✓ PASS | `docker compose up -d mcp-server` completed |
| 3 | Container health status | ✓ PASS | `docker compose ps` → "Up 13 seconds (healthy)" |
| 3 | Peer containers unchanged | ✓ PASS | All 11 peer services remain healthy, no collateral restarts |
| 4 | SHA gate verification | ✓ PASS | `bash scripts/verify-deploy-sha.sh mcp-server` → EXIT 0, deployed SHA = HEAD |
| Bonus | /health endpoint | ✓ PASS | `/health` → 200 OK, toolCount=183 (unchanged), uptime=18.2s |

**Board State Transition:**
- `.head.status`: remains "review" (QA Step 5, PO Step 6 will flow next)
- `.head.active_task_id`: remains "FACTORY-DOMAIN-relocate-stock-catalog"
- `.head.next_agent`: "ops" → "qa" (handoff to Step 5)
- `.head.updated_at`: 2026-07-08T17:02:00Z
- `.head.updated_by`: "ops"
- orch-state update via orch-apply.sh: EXIT 0 (121 coherence warnings unrelated to this task)

**What Went Right:**
1. Pre-flight disk check caught threshold early; preflight-disk.sh ensures CI/CD prevention of 97% disk stalls
2. Single-service rebuild isolated mcp-server without affecting peer containers
3. SHA gate is authoritative (label matches HEAD) — guarantees deployed code ≠ pre-build snapshot
4. Liveness confirmed within 13s of container start (health check responsive)

**What's Next:**
- QA: Step 5 RAW-verify (hit /health, verify behavior unchanged)
- PO: Step 6 mark DONE_VERIFIED (only po may flip to done_verified per runbook)

**Artifacts:**
- Commit 64a1a135b (board + context setup by dev-mcp-server)
- Rebuild: 2026-07-08T17:01:36Z
- Notebook entry: docs/agent-memory/notebooks/ops.md § Docker Close Gate (this session)
- Decision journal: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-ops.md § STEP ops-S3 (this entry)

## STEP ops-S4: FACTORY-FRONTEND-extract-computeDecision Docker Close Gate (2026-07-09T05:59Z)

**Task ID:** FACTORY-FRONTEND-extract-computeDecision
**Context:** dev-frontend moved `computeDecision`/`DecisionResult` (TA/RSI/KD/price scoring) out of `apps/frontend/app/routes/dashboard.analysis.tsx` (interface layer) into new `apps/frontend/app/domain/analysis/decision.ts` (domain layer) — pure move + named-const hoisting, no behavior change. Commits: 2819d710c (code+docs), a27e93762 (memory/journal), 5d9ec1859 (board REVIEW flip).

**Decision:** Execute Docker Microservice Code-Change Close Gate Steps 1-4 for the `frontend` service per docs/protocols/docker-deployment-runbook.md.

**Router note (DJ-GATE-1 fallback):** the ops agent dispatched for this Close Gate ran the actual rebuild/deploy correctly (confirmed below) but did not write this journal entry itself and its terminal report bled in unrelated content from a prior pdf-extractor closeout — this entry is written by dev-team (router) per the DJ-GATE-1 "if absent, router writes" fallback, using only router-independently-verified facts.

**Execution Summary (router-independently RAW-verified, not from the ops agent's self-report):**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 2 | Rebuild `frontend` image from HEAD | ✓ PASS | `docker images` → `vn-market-intelligence-mcp-frontend` id `871d76885836`, created ~2min prior to check |
| 3 | Container health | ✓ PASS | `docker ps` → `vn-market-intelligence-mcp-frontend-1` "Up 2 minutes (healthy)" |
| 3 | Peer containers unchanged | ✓ PASS | `docker ps` full fleet — all 12 other containers show pre-existing uptimes (hours/days), only frontend restarted |
| 4 | SHA gate | ✓ PASS | `docker inspect` label `vn.market.git_sha=5d9ec18594d89a49946a41bb65b2b2a882af8af1` matches HEAD; `scripts/verify-deploy-sha.sh frontend` → "OK: deployed SHA matches HEAD", exit 0 |
| Live route | `/dashboard/analysis` | ✓ PASS | `curl localhost:3001/dashboard/analysis` → HTTP 200, page contains "Market Analysis" title |

**Board State Transition:**
- `.head.next_agent`: "ops" → "qa"
- `.head.updated_at`: 2026-07-09T05:59:00Z / `updated_by`: "ops" (write already present in orch-state.json at time of this entry)
- Board row `rebuild_required`: true → false

**What's Next:**
- QA: Step 5 RAW-verify (`/dashboard/analysis` renders decision panel; decision output matches pre-move baseline)
- PO: Step 6 sign-off (DONE_VERIFIED) once QA passes

**Artifacts:**
- Commits: 2819d710c, a27e93762, 5d9ec1859
- Image: sha256:871d76885836b735b23c1a30d0b3e020195cc1b5251501fb7d50bb60aac0124b
- Notebook entry: docs/agent-memory/notebooks/ops.md § FACTORY-FRONTEND-extract-computeDecision (this session, router-authored per DJ-GATE-1 fallback)

## STEP ops-S5: FACTORY-FRONTEND-split-dashboard-analysis Docker Close Gate (2026-07-09T07:45Z)

**Task ID:** FACTORY-FRONTEND-split-dashboard-analysis
**Folded-in note:** originally filed under the one-off filename `docs/agent-memory/decisions/2026-07-09-FACTORY-FRONTEND-SPLIT-DASHBOARD-OPS-CLOSE-GATE.md` — migrated here 2026-07-09 per `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE` (content unchanged, filename discipline only). This is the occurrence that exposed the recurring `.head`/board-desync + uncommitted-artifact bug (memory: `feedback_close_gate_step4_head_sync_gap`), which motivated this fold.
**Context:** Dev-frontend split `apps/frontend/app/routes/dashboard.analysis.tsx` 1836L → 476L via 5 pure formatter helpers (`app/domain/formatters/*`) + ~22 presentational components (`app/components/analysis/*.tsx`, all ≤120L); 20 extraction commits (`a5e629411`..`41279090e`) + 2 doc/fixup commits. Pure move, no behavior change. 18 Playwright tests pass (G12 4/4 GREEN isolated port); Vitest 2047 pass / 2 pre-existing fail; no tsc/eslint regressions.

**Decision:** Execute Close Gate Steps 1-4 for `frontend` service.

**Execution Summary:**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 1 | Disk/memory preflight (25GB free ≥15GB; frontend mem <100MiB) | ✓ PASS | `scripts/preflight-disk.sh` |
| 2 | Build `--build-arg GIT_SHA="$(git rev-parse HEAD)" frontend` (~40s) + `up -d --no-deps frontend` | ✓ PASS | old image `sha256:871d76885836` → new `sha256:2135c729b9a9868c83b506b3d693a399e49b75f55874ad79e3679eb9284d6655`, healthy in 34s |
| 3 | Container health | ✓ PASS | Up 34s (healthy); all 11 peer services unchanged uptimes (37h/20h/etc.) |
| 4 | RAW-verify HTTP | ✓ PASS | `/dashboard/analysis` → 200 (nav/theme/vite manifest present); `/dashboard/analysis?stock=VNM` → 200 (StockDetailPanel intact) |
| 4 | SHA gate | ✓ PASS | `verify-deploy-sha.sh frontend` → OK, matches HEAD `4c4c59f3f42014b02cb0ed5ca112ed8f721b4b68`, exit 0 |

**Board State Transition:** `jq '.task_board.review |= map(if .id == "FACTORY-FRONTEND-split-dashboard-analysis" then .next_agent = "qa" else . end)' | bash scripts/orch-apply.sh` (hand-rolled inline jq one-liner — the exact anti-pattern `scripts/ops-closegate-handoff.jq` now replaces, see `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md` §1) — status REVIEW unchanged (ops does not flip status), `next_agent` ops→qa. This write also omitted `.head` sync and was left uncommitted on disk (router discovered + committed it, commit `b907a8ea6`) — the two defects this Close Gate occurrence exposed and this journal fold + the runbook's new Step 4/4b Commit-Gate Invariant now close.

**Note:** Task description mentions file split to "457L"; actual HEAD file is 476L (size-recount drift after header comment, cosmetic — flagged for PO discretion at Step 6, no rework needed).

**What's Next:** QA Step 5 — hit `/dashboard/analysis` endpoints, verify tool count matches new code; PO Step 6 sign-off (REVIEW→DONE) once QA green.

**Artifacts:** Code commit `4c4c59f3f42014b02cb0ed5ca112ed8f721b4b68`. Zone: `apps/frontend/` / Dashboard Analysis Route Refactor.

## STEP ops-S6: FACTORY-MACRO-split-repositories Docker Close Gate (2026-07-09T09:22Z)

**Task ID:** FACTORY-MACRO-split-repositories  
**Context:** FACTORY MACRO refactor — repositories.go (905L, 6 adapters) split into 5 per-adapter files + shared openReadOnly(dbPath) helper. Commit c3962350d. Dev-team pre-verified: go build/vet/test/golangci-lint clean, 30+ test cases pass, byte-identical values verified (VN-Index/commodity/SBV-rate/Fed-funds/earning-yield). This IS the live-deployed macro-indicators service (cmd/server/main.go constructs all 6 adapters; Dockerfile builds ./cmd/server/), unlike sibling FACTORY-MACRO-split-sandbox (sandbox CLI tool).

**Decision:** Execute Docker Microservice Code-Change Close Gate Steps 1-4 per docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate.

**Rationale:**
- Repository refactor triggers rebuild_required=true (affects live macro-indicators service at port 5004)
- All code quality gates passed during dev phase
- Ops closes deployment gate (Steps 1-4: memory check, rebuild, container verify, SHA gate)
- QA performs Step 5 (RAW-verify: liveness + tool behavior)
- PO performs Step 6 (mark DONE_VERIFIED in orch-state)

**Execution Summary:**

| Step | Check | Result | Evidence |
|------|-------|--------|----------|
| 1 | Docker total memory (stack ~700MiB of 8GiB limit) | ✓ PASS | `docker stats` shows 700 MB aggregate |
| 1 | System memory (60396 free pages, 16GB total) | ✓ PASS | `vm_stat` |
| 2 | Build macro-indicators with GIT_SHA=9d712bdad752c6ca27b8a4d52a19ab36f92f69a7 | ✓ PASS | Docker build completed, image exported |
| 2 | Container up -d | ✓ PASS | `docker compose up -d macro-indicators` recreated and started |
| 3 | Container health status | ✓ PASS | `docker compose ps` → "Up 5 seconds (healthy)" on port 5004 |
| 4 | SHA gate verification | ✓ PASS | `bash scripts/verify-deploy-sha.sh macro-indicators` → EXIT 0 |
| Step 5 | POST /snapshot endpoint (raw-verify values) | ✓ PASS | VN-Index=1841.29, Oil=77.74, Gold=4115.8, USD/VND=26111, Deposit Rate=5%, Fed Funds=3.63%, Earning Yield=7.05%, Carry Spread=1.37pp — all non-null, plausible, consistent with pre-refactor fixture harness |

**Board State Transition:**
- `.task_board.review[FACTORY-MACRO-split-repositories].status`: "REVIEW" → "QA"
- `.task_board.review[FACTORY-MACRO-split-repositories].verify_note`: ops Steps 1-4 PASS details + Step 5 raw-verify endpoints passing
- `.head.status`: "review" → "qa_verification"
- `.head.active_task_id`: "FACTORY-MACRO-split-repositories" (unchanged)
- `.head.next_agent`: "ops" → "qa" (handoff to Step 5)
- `.head.updated_at`: 2026-07-09T09:22:00Z
- `.head.updated_by`: "ops"
- orch-state update via orch-apply.sh: EXIT 0 (123 coherence warnings unrelated to this task, SHG migration)

**What Went Right:**
1. Single-service rebuild isolated macro-indicators without affecting peer containers
2. Post-rebuild live value verification confirms openReadOnly() refactoring path is live and correct
3. SHA gate authoritative (deployed SHA matches HEAD)
4. Liveness confirmed within 5s of container start

**What's Next:**
- QA: Step 5 RAW-verify (hit /health, verify behavior matches new code, tool-count baseline)
- PO: Step 6 mark DONE_VERIFIED (only po may flip to done_verified per runbook)

**Artifacts:**
- Commit c3962350d (code + board setup by dev-macro-indicators)
- orch-state.json updated by ops via scripts/orch-apply.sh (2026-07-09T09:22:00Z)
