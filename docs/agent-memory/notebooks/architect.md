# Architect — Notebook

**Last updated:** 2026-05-15 UTC | **Sprint:** janitor-1912 git index cleanup

## Last session summary (janitor-1912 — git index cleanup)

Task: Zone split confirmation + handoff for janitor-1912 (RF-1 + RF-2 from 1912 post-merge review).

Brownfield finding: both paths already absent from git index before this task ran. `git rm --cached` would be no-ops. Root reason: 1912c cutover commit already ran `git rm` on TS sources; `.gitignore:19 apps/*/server` was added post-commit but `git rm --cached` was executed in a prior commit. Verified via `git ls-files` returning empty on both paths.

Actual scope narrowed to disk cleanup only:
- Delete `apps/stock-price/__tests__/unit/resolve-price-service.test.ts` + `apps/stock-price/__tests__/integration/fetch-price-usecase.test.ts` from disk (untracked Bun/TS tests).
- Delete `apps/alert-engine/server` binary from disk (gitignored, still present).

Zone split CONFIRMED INDEPENDENT: no shared files, no DDD conflict, no ordering constraint. Single-pass safe.

No TS test registry changes needed (both services fully Go, no TS test runner config involved).

Outputs:
- Handoff: `docs/handoffs/TASK_janitor-1912.md`
- TASKS.md janitor-1912 row updated (architect done)

## Last session summary (1914 — news-scout dedup API fix)

Task: Design blueprint for 1914-news-scout-dedup-api. S-size fix.

Root cause confirmed via brownfield read of `agentSignalStore.ts` + `agentSignalTools.ts` + `stage-signals.md`:
- `getSignals()` WHERE clause: `(to_agent = ? OR to_agent = 'all')`. No sender-side filter.
- News-scout posts `to_agent = "alert-commander"` (not itself, not "all"). Invisible on to_agent axis.
- Even if posted `to_agent = "all"`, default `status="unread"` marks rows read on first retrieval by alert-commander, so self-poll after alert-commander's read returns empty.
- Two compounding failures: (1) wrong axis (to vs from), (2) read-mark side-effect.

Design decision: Option A (extend `get_agent_signals` with optional `from_agent` param) over Option B (new `get_my_signals` alias). Rationale: backward compatible, no new tool-registry entry, no new agent-manifest entry, simpler test surface.

Key design constraint: when `fromAgent` is set, the read-mark side-effect must NOT fire — the query is a sender-history inspection, not an inbox read. Guard: `if (statusFilter === "unread" && opts.fromAgent === undefined)`.

Flow fix required: `stage-signals.md` dedup gate must pass `from_agent="news-scout", status="all"` — without `status="all"` the gate would still miss rows already read by alert-commander.

Risk flags:
- R-1914-1: LOW — display header misleading when from_agent set (cosmetic, non-blocking).
- R-1914-2: LOW — Task 1862g postSignal dedup (urgent_news 4h window) is complementary, not conflicting.
- R-1914-3: INFO — `status="all"` returns all TTL-live sender rows; flow must still apply 180-min `created_at` check manually.

Outputs:
- Handoff: `docs/handoffs/TASK_1914.md`
- TASKS.md 1914 row updated (architect done)

## Last session summary (c108 SPRINT-L — 1912 Go migration program-complete review)

## Last session summary (c108 SPRINT-L — 1912 Go migration program-complete review)

Task: Post-merge architect review for 1912 Go migration program (4 services).

Scope correction: prompt named 1912a as "macro-indicators" — actual service is api-gateway.
macro-indicators (port 5004) remains Bun/TS, is NOT in 1912 scope. Confirmed via TASKS.md +
processed signals. Signals reviewed: 1912a (QA-to-ops), 1912b (compressed-smoke-pass), 1912c
(deploy-complete-compressed-smoke-pass), 1912d (cutover-audit processed/).

Verification results:
- docker-compose.yml: CLEAN — zero Dockerfile.go references. All 4 migrated services use `dockerfile: Dockerfile`.
- api-gateway Dockerfile: golang:1.22-alpine, no CGO (stdlib only, Hono→net/http). Go binary confirmed.
- alert-engine Dockerfile: golang:1.22-alpine + gcc musl-dev sqlite-dev → alpine:3.20 runtime. CGO=1 mattn/go-sqlite3. PASS.
- stock-price Dockerfile: golang:1.22-alpine + gcc musl-dev → alpine:3.19 runtime. CGO=1. PASS.
- TS sources in alert-engine: CLEAN (src/ dir removed). 
- TS sources in stock-price: 2 legacy bun:test .ts test files git-tracked in __tests__/ (RF-1, LOW, janitor-only).
- alert-engine/server binary git-tracked despite .gitignore rule (RF-2, LOW, janitor-only).
- node_modules/ in alert-engine + stock-price: gitignored, no runtime impact (RF-3, INFO).
- project-stats.json: updated to PROGRAM COMPLETE status.
- tree-map.md: VALID — no broken pointers to removed TS sources (docs/architecture refs point to .md docs, not source .ts files).

Risk flags raised (all non-blocking):
RF-1: apps/stock-price/__tests__/*.ts (2 files) git-tracked — import paths broken vs Go layout.
RF-2: apps/alert-engine/server binary git-tracked — gitignore added post-commit.
Both are janitor tasks, not blockers.

Lessons learned for future Go migrations:
1. Add `git rm --cached apps/<service>/server` step to cutover checklist before .gitignore rule — prevents RF-2 class.
2. Delete all TS test files in same cutover commit as TS src removal — TASKS.md 1912c scope (b+c) missed __tests__/.
3. compressed-smoke pattern (T+10min vs 6h) is now precedent for 2 migrations — add to architecture-briefs index if a 3rd migration occurs.
4. Prompt-level service naming can drift from actual signals — always verify via signals + TASKS.md before committing review findings.

Outputs:
- Signal: docs/signals/20260514T182941Z-1912-go-migration-program-complete.json
- project-stats.json: PROGRAM COMPLETE status updated.

## Last session summary (c108-tick3-blocker — 1912b schema migration decision)

Task: 1912b-cutover crashloop blocker. Decision: Option 1 (auto-migrate at init). ONE file edit.

Root cause confirmed via docker exec + sqlite3 on live volume:
`InitAlertTables` DDL string calls `CREATE INDEX ... ON alert_engine_records(outcome) WHERE outcome IS NULL`
BEFORE `ALTER TABLE ADD COLUMN outcome` runs. SQLite rejects partial index on non-existent column.
The `CREATE TABLE IF NOT EXISTS` skips silently (TS-era table already exists), then the partial index
line fails immediately, returning `"no such column: outcome"` wrapped as `"init alert tables: ..."`.
The ALTER TABLE block never executes.

DB state: 0 rows in both tables. Zero data loss risk. Option 3 (wipe) acceptable but unnecessary.
Option 1 wins because it's a code fix that scales to future schema deltas.

Fix spec: Split single DDL `db.Exec(ddl)` into 3 ordered phases:
- Phase 1: base CREATE TABLE + non-outcome indexes + alert_mutes
- Phase 2: ALTER TABLE ADD COLUMN loop (existing, unchanged)
- Phase 3: CREATE INDEX for outcome partial index (after column guaranteed present)

Ignore "already exists" on Phase 3 index via new `sqliteIndexExists` helper (or string-match on error).

Test: `TestInitAlertTables_PreMigrationDB` — create TS-era schema in :memory:, call InitAlertTables,
assert outcome columns present + idx_alerts_outcome_pending in sqlite_master.

Outputs:
- Signal: docs/signals/20260514T175450Z-1912b-schema-migration-decision.json
- Brief: docs/architecture-briefs/2026-05-14-1912b-schema-migration.md

## Last session summary (1912a spec review — APPROVE)

Task: 1912a-gateway-spec BA spec review. Both blockers resolved. Verdict: APPROVE.

D-1 (/healthz): Option b confirmed. TS source verified — NO /healthz handler exists (only
/health, /health/:service, /health-dashboard, /:service/*). Go implementation adds /healthz
as k8s liveness probe alias to /health. TS gateway no backport needed (no k8s orchestrator,
no mcp-server consumer calls /healthz). Brief § 3.1 updated in-place.

Dev role gap: Option A confirmed. Extend dev-api-gateway with Go lazy-load block (trigger:
go_migration). Route to agent-father — architect does NOT edit agent files. PM sprintify gate:
agent-father must commit dev-api-gateway.md Go block first.

AC adequacy: All 11 ACs pass. All 5 BA-flagged endpoints have explicit ACs (AC-2: /health +
/health/:service; AC-4: /health-dashboard; AC-3: /api/* + /:service/*). Rollback concrete
(stateless, image-tag swap, docker-compose up -d). SDD-1 structurally preserved (no MCP tools
in gateway; source_tier in mcp-server only). Bun teardown risk eliminated by design (no CGO,
no bun:sqlite in gateway). AC-10 smoke window unambiguous on pass condition; fail-early
trigger is impl note for developer (503 sustained >5 min → abort P2, revert TS image).

Outputs: review doc at docs/architecture-briefs/2026-05-14-1912a-spec-review.md,
signal to PM at docs/signals/2026-05-14T11-02-21Z-1912a-architect-to-pm.json.

## Last session summary (c97 — 1912 Go migration brief)

Task 1912-go-migration-program. User-approved option 3 (selective Go rewrite) post-1910a stop.
Crash evidence: `bun:sqlite` FFI teardown confirmed across QA cycles (qa.md, qa-archive, REQ_1903a).
Pattern: JSC GC + macOS VirtioFS SHM tear on container stop = SIGABRT 134 / SIGSEGV 139 post-completion.

Target services confirmed:
- api-gateway: ~1145 LOC, 5 test files, zero native deps (hono only). Lowest risk.
- stock-price: ~467 LOC, 2 test files, `bun:sqlite` in Tier3 fetcher (3 dynamic imports).
- alert-engine: ~1289 LOC, 3 test files, `bun:sqlite` synchronous at startup — highest crash-avoidance ROI.

None of the 3 services register MCP tools. All expose HTTP only. SDD-1 invariant automatic.
MCP bridge: none needed — all 3 services are HTTP downstream of mcp-server. Go replaces the HTTP server.
Recommended SQLite strategy: `mattn/go-sqlite3` (CGO, stable) over `modernc.org/sqlite` (pure-Go, 2x slower).

Phase sequence: gateway (P1) → alert-engine (P2) → stock-price (P3).
Effort: 18h best / 34h likely / 50h worst total across 3 services.

Top 3 open questions for PO:
1. Go version pin (recommended 1.22)
2. CGO policy (mattn/go-sqlite3 vs modernc pure-Go)
3. Log format (structured slog vs plain text)

Brief: `docs/architecture-briefs/2026-05-14-go-migration-3-services.md`

## Previous session summary (c94 — 1910 rubber-stamp review)

Rubber-stamp review for Sprint 1910 (get_ism_subcomponents FRED tool + get_fed_liquidity_spread package reg).
SD-1 RESOLVED: PATH (a) chosen — FRED REST API + free API key (`FRED_API_KEY` env var).
Public CSV tier (`fredgraph.csv?id=`) does not serve ISM sub-component series; REST API does.
Provisional series IDs NAPMNO/NAPMEMP/NAPMPI/NAPMBI require developer confirmation at build time.
1910b auto-cure: 3-cycle evidence confirmed (FA 2026-05-11/12/13, UA 2026-05-14, NS 2026-05-13). Ships unconditionally.
agentBootstrap.ts lines 30/46/224 confirmed correct; get_fed_liquidity_spread absent from all 3 arrays.
get_fed_liquidity_spread confirmed registered: registry.ts:98+199. Zero-build package reg.
No new arch brief. Output: docs/handoffs/ARCH_REVIEW_1910.md.
Risk R2: FRED_API_KEY must not be committed — .env only.

## Previous session summary (c94 — 1909 rubber-stamp review)

Rubber-stamp review for Sprint 1909 (BCTC OCF Extractor Expansion + `get_bctc_ocf` tool).
Authority brief: `docs/architecture-briefs/2026-05-14-bctc-val07-extractor-rethink.md`.
All 4 BA spec-time discoveries resolved cleanly:
- SD-1: VN CF PDFs carry numeric line codes — dual strategy (code primary + keyword fallback)
  confirmed correct. No fallback gap.
- SD-2: `extraction_method` is a REAL DB column (enum: pdf-parse/ocr-200/ocr-300/news_inference).
  Omitted from `CashFlowRow` in cashFlowTool.ts (under-declaration). Dev must add to new tool's
  row type + SELECT from DB. Do NOT hardcode "ocr_parsed".
- SD-3: STALE — 1890a-B SHIPPED-c90 (commit 915763a2). No sequence constraint.
- SD-4: PM action — not architect concern.
Risk flags: R1 (extraction_method must read from DB, not hardcode); R2 (E-4 zero guard explicit).
No new brief. APPROVED. Output: `docs/handoffs/ARCH_REVIEW_1909.md`.

## Previous session summary (c92 — BCTC-VAL-07 / totalAssets positional drift rethink)

Recurring-bug rule fired: tasks 1815 + 1908a = 2 fix commits on `balanceSheetExtractor.ts`.
Root cause confirmed: `extractSplitBlockAll` maps code "270" to a page-6 sub-item value
(`Tài sản dài hạn khác`, ~957B VND) instead of the grand total (~53.3T VND) in multi-page
VPBank-style balance sheets. Zero-guard fallback (line 714) never fires because value is non-zero.
VAL-07 hard-fails to confidence=0.0. VNM Q4 2025 + DIG Q4 2025 affected. Banking cohort at risk.
Recommendation: Option B (upstream plausibility override in extractor, symmetric to existing
`liabPlausible` guard at lines 765-776). Option A (downstream VAL-07 soft-penalty) rejected as
primary; may be added as secondary. Brief: `docs/architecture-briefs/2026-05-14-bctc-val07-extractor-rethink.md`.
Task 1908c: dev-pdf-extractor, S effort. Post-fix: DELETE VNM+DIG Q4 2025 rows, reparse.

## Previous session summary (1890a-spec-expanded — FA tool-package +5 tools)

Brownfield audit complete. 5 tools assessed for financial-analyst SKILL_MANIFEST.
Key finding: `get_insider_signals` already in SKILL_MANIFEST (agentBootstrap.ts:64) — doc gap only.
`get_cash_flow` does NOT exist as MCP tool — must build. Pattern: computeAccrualsTool.ts.
Other 3 (get_macro_snapshot, get_bond_maturity_calendar, get_investment_clock_phase) exist in
registry but missing from `financial_analyst` manifest array — manifest + doc additions only.
Task split: 1890a-A (dev-mcp-server, CRITICAL — BCTC banking Q1/2026 window today) +
1890a-B (agent-md-editor, HIGH — manifest 3 additions + doc verify).
Specs: docs/REQ_1890a.md, docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md.
Risk R1: Subtask A must ship before 03:30 UTC FA cycle (BCTC G-step 5th cycle gap).
Risk R4: agentBootstrap.ts line 27 requires docs/SKILL_MANIFEST.md updated in same commit.

## Previous session summary (1881a-impl-arch-brief — source_tier schema decision)

BLK-1 resolved. Chose option (a) JSON wrapper for text-output tools over option (b) header
line. Rationale: FR-5 compile-time constant + AC-7 tsc enforcement only achievable with
typed object literal. Text preserved verbatim in `.text` field — zero content loss.
Brief: `docs/architecture-briefs/2026-05-13-source-tier-schema-decision.md`
Sub-tasks split: 1881a-impl-mcp (all 16 tool edits + tests, zone: apps/mcp-server/) is
the sole implementation zone — apps/macro-indicators has no MCP tools (spec-confirmed).
1881a-impl-ssot is a companion docs-only task (zone: docs/).
Parallel dispatch approved for -mcp and -ssot after brief lands.
Branch: task/1881a-impl-arch-brief. Commit pending.

## Previous session summary (SPIKE_006-c60 — alert accuracy 22% RCA)

SPIKE_006 findings complete. Primary verdict: H-A methodology bug (CONFIRMED, HIGH confidence).
Three root defects identified:
1. Two independent scoring paths (alertAccuracy.ts Path 2 on-the-fly vs alertOutcomeScorer domain
   vs verdictResolutionJob → alert-verdicts.json) never share state. alert-verdicts.json = empty [].
2. Intraday fallback (1-12h window) biases same-session alerts to MISS (VN market close creates
   artificial recovery within session).
3. hitThresholdPct=0.1% for price-signal class is noise-floor, not meaningful direction threshold.
4. Accuracy denominator = hits/(hits+misses) on n=9 scoreable — too small for 60% threshold to mean anything.

H-B partial: verdictResolutionJob confirmed inert (empty alert-verdicts.json). High skip rate in
alertOutcomeJob plausible but unconfirmed without live run.

Brief: `docs/architecture-briefs/2026-05-13-alert-quality-22pct-spike-006-rca.md` (≤120L)
Commits: `07c10bfe` (findings doc) + `2d91c859` (TASKS.md Done row)
Phase 5: c2-alert GREEN both commits. tree-verify passes.
Telegram report 2869: claimed=architect / resolution=monitoring / status=processed.
c61 task proposal: BA spec (M) — scoring unification + intraday fallback gate + threshold tuning.

## Previous session summary (ARCH-BRIEF-UPDATE-H4-c58 — Tier 3)

H4 CONFIRMED brief update. Updated `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md`:
- Status bumped to RESOLVED-MECHANISM, OPEN-FIX-PICK
- Tally corrected: 5 cycles → 7 cycles (c52–c58)
- H1/H2/H3 marked REJECTED/ELIMINATED; H4 CONFIRMED with VirtioFS mechanism
- F1-F4 ranked: F2 PRIMARY (named volumes, phased F2a+F2b), F4 SECONDARY (retry wrapper)
- F3 REJECTED (too disruptive), F1 BLOCKED (user action)
- c59+ impl plan added (c59-T1: F2a, c59-T2: F4, c60-T1: F2b)
- Q1+Q2 closed (both resolved c57)
- c58 orphan `.claude/worktrees/agent-a0f89162/` noted in Section 5
- Cross-link to `2026-05-13-container-restart-rca-v2.md` added (both touch Docker Desktop VM)
- 118L → 139L (within 140L cap)

## Previous session summary (ARCH-1896-RE-RCA-c58 — Tier 2)

Re-RCA for TNB c43 CRITICAL escalation ("3rd restart in <24h, 1896c-impl insufficient").
Loaded docker-events log (1896c-impl start: 17:31:34 UTC 2026-05-12). Found 5 die events,
zero OOM events, zero health_status:unhealthy events. All post-1896c-impl die events are
exit=0 (clean stop) or exit=137-via-SIGKILL (Docker stop-timeout, NOT kernel OOM):
- api-gateway 17:31 UTC: SIGTERM hang → SIGKILL during 1862c-DE deploy (ops action)
- mcp-server 19:58+20:00 UTC: 1876a-A5 exec-only migration restart (ops action)
- mcp-server 20:29 UTC: 1876a-A6 docker-compose up --build (ops action)
TNB c43 saw 20:29 restart, computed uptime=2h18m at 22:47, misclassified as crash.
VERDICT: false-alarm-h4-batch. 1896c-impl logging is working correctly.
Brief: `docs/architecture-briefs/2026-05-13-container-restart-rca-v2.md` (117L)
c40 status: unchanged — inconclusive (pre-log, no ops evidence in window).
Recommendation: MONITOR c59+c60, then close 1896 fully.
c59 fix (if opened): TNB recalibration — add `# TNB-PLANNED-RESTART` tag convention to ops
flow. SPRINT-S, ≤20 LOC, zone: `.claude/flows/ops/`.

---

## Known patterns / preferences

- Phase-gate: SPRINT-L always split Phase 1 (design) + Phase 2+ (impl). Never single-phase.
- `domain/repositories/` = clean boundary. Repository interfaces in domain, SQLite impls in infra.
- Default-param injection: `constructor(private repo = new SqliteRepo())`. Tests inject mocks.
- `initDatabase()` is the migration runner. Container restart = migration execution.
- `server.ts` bootstrap: all new MCP tools registered there. Single wiring point.
- DDD layer audit before design: `grep -r "from.*infrastructure" src/domain/`.

## Carry-over for next session

- ARCH-1884 brief: Hybrid decision. Calculators in mcp-server domain; BTN detectors in
  forensic-analysis service (port 5007). Sprint 1887 (Virtual Capital) → forensic-analysis.
- 1878b `compute_accruals` spec: `docs/specs/1878b-compute-accruals.md`.
- c40 container restart: inconclusive (pre-log). Re-evaluate if TNB flags again post-c60.
- TNB recalibration (1896 close gate): SPRINT-S pending — `# TNB-PLANNED-RESTART` convention.
- Headlock F2a + F4: c59-T1 (ops/developer) + c59-T2 (dev-team). F2b after writer-audit c60.
- F1 (Docker Desktop .git/ exclusion): user-queue carry item.
- SPIKE_006 c61: BA spec needed — scoring unification (alertAccuracy.ts + alertOutcomeScorer + verdictResolutionJob).
  Primary: merge Path 2 to domain scorer. Secondary: gate intraday fallback (≥1 trading day). Tertiary: hitThresholdPct 0.1%→1.0%.
  Open Q before BA spec: confirm with user whether 60% threshold is hits/(hits+misses) or hits/total.
