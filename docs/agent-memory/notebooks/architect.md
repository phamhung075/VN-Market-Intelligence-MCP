# Architect — Notebook

**Last updated:** 2026-05-25 23:30 UTC | **Sprint:** BCTC-TABLE-3

[3 most recent cycles retained below. Archive in git history.]

## BT3-DESIGN — BCTC-TABLE-3 parser fix ruling (2026-05-25T23:30Z) — DESIGN COMPLETE

**Task:** BT3-DESIGN. Produce the technical ruling for Sprint BCTC-TABLE-3. Root cause pre-pinned by PO: production `text_table_extractor.py` introduced a fabricated block-column state machine that (a) hardcodes `label=""` → 44 orphan rows, (b) positionally zips separated code/value lists → drops code 100, duplicates 222, nulls value_prior on 118/150 rows, (c) else-branch emits company name / address as junk rows → 94 junk rows. Spike's `lines_to_rows()` on the SAME stored OCR text produced ~80 perfect gold rows.

**Key decisions:**

1. **RE-PARSE, not zone-OCR.** Stored Tesseract OCR is already one-line-per-row. Spike proved it. Zone-OCR adds host-panic risk (kernel watchdog under concurrent Tesseract on 16GB Mac). Backfill path must be zero-Tesseract.

2. **Delete 3 functions** from `text_table_extractor.py`: `_detect_block_column_layout`, `_extract_block_columns`, `_build_rows_from_block_columns`. Collapse the `if block_column else inline` dispatch to inline-only for every page.

3. **Add shared pure `_parse_lines_to_rows()`** used by BOTH the live `assemble()` path AND the backfill path. Kills dual-path drift permanently. One canonical parser.

4. **Tighten else-branch junk filter**: only emit non-code lines as header/separator rows if they contain ≥3 consecutive alphabetic characters. Rejects company name/address/date/numeric noise.

5. **Row contract UNCHANGED.** `bctc_table_rows` schema, `push-bctc-table` handler, `bctcInspectHandler`, `bctc-inspector.html` — all untouched. Fix is pure pdf-extractor-side.

6. **Integration test mandate: no subclass bypass.** Replace `PreloadedTextTableExtractor` false-green with real `TextTableExtractor()` on committed FPT pages 4-7 fixture text. Assert 11 ACs against spike gold (0 orphan/junk rows, code 100 present, no dups, value_prior ≥90%, sentinels exact).

**Files authored this cycle (3):**
1. `docs/handoffs/TASK_BCTC-TABLE.md` — BT3-DESIGN ruling appended (§ [Architect] BT3-DESIGN), task ladder updated (BT3-DESIGN=DONE, BT3-FIX=READY)
2. `docs/architecture-briefs/2026-05-25-bctc-table-3-parser-fix-ruling.md` (NEW — full ruling with decision table, exact change spec, risk register)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags surfaced:**
- R-MEDIUM: Pages 5-7 multi-line label wraps (p7 scored 86.7%). Integration fixture must cover pages 5-7. Spike already handles gracefully.
- R-LOW: Pure-code-only OCR fragment lines (`"100"` alone) now reach the else-branch but will be filtered by the tightened length/alphabetic guard.
- R-LOW: Footnote note-number column (single digit between code and value) may be consumed as value_current by `_parse_value_cells`. Dev must unit-test this case.

**Next actor:** dev-pdf-extractor — BT3-FIX.

---

## P2-MCP-G9-CONTRACT-FIX — P2-H + P2-I plan correction (2026-05-25T22:00Z) — DESIGN COMPLETE

**Task:** P2-MCP-G9-CONTRACT-FIX. Correct two falsified assumptions in the mcp-server Phase-2 plan that would make the upcoming G9 USER sign-off (P2-I) a Potemkin/dishonest gate. Router-verified ground truth: (1) P2-H used addInitScript injection — test-path ≠ user-path; file:// double-click shows empty panels. (2) synthetic sparkline-regression-tripwire.json fixture = permanent red card that taints the "all tools working" verbal sign-off.

**Key design decisions:**

1. **G9 presentation contract: inline-data model.** Trace and module data inlined as `<script type="application/json">` blocks in index.html. Dashboard JS reads from DOM via `document.getElementById`. No fetch(), no window.__MCP_* globals. test-path == user-path. file:// promise genuinely honored. Simpler than local-HTTP alternative; no PO/user server overhead.

2. **Assertion-5 resolution: option (i) pure unit assertion.** All 9 real traces are `status: "pass"` (ground truth). Synthetic fixture deleted. Assertion-5 re-specified as: `renderCard({status:"fail",...})` called IN-MEMORY in the spec, assert returned HTML contains `mcp-dot-fail`. No on-disk fixture. Real RED→GREEN proof properly deferred to G10/P2-J-K (genuine bug injection).

3. **Files dev-mcp-server must touch in P2-H-FIX:**
   - `apps/mcp-server/dashboard/index.html` — add inline JSON blocks, remove fetch()/window.__ paths
   - `apps/mcp-server/dashboard/traces/sparkline-regression-tripwire.json` — DELETE
   - `apps/mcp-server/dashboard/tests/trust-contract.spec.js` — remove addInitScript, re-spec assertion-5
   - `apps/mcp-server/dashboard/playwright-verdict.json` — re-generate and commit

4. **P2-I corrected.** PO must verify file:// opens real populated panels (P2-H-FIX AC-3) before presenting to user. "No server needed" claim is now genuinely honored (inline data = zero fetch).

5. **Legitimate P2-H parts kept unchanged:** playwright.config.js (headless:true, no webServer), bunfig.toml root="./src", assertions 1/2/3/4/6, assertion-7 now structurally stronger (no fetch() at all).

**Files authored this cycle (4):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-2-task-plan.md` (MODIFIED — P2-H rewritten, P2-I corrected, Task Ledger + Sequencing updated, Correction Log appended, P2-Z AC-4 updated)
2. `docs/pipeline-state.json` (UPDATED — P2-H-FIX required, nextAgent dev-mcp-server, activeTaskId P2-H-FIX)
3. `docs/signals/architect-mcp-g9-contract-fix-2026-05-25T220000Z.json` (NEW — contract decision + assertion-5 resolution + files dev must touch)
4. `docs/agent-memory/notebooks/architect.md` (this entry)

**Risk flags surfaced:**
- If dev-mcp-server re-implements P2-H-FIX without verifying that KNOWN_TRACES array is fully removed and all 9 inline traces match the actual on-disk sandbox output, the inline block will silently drift from reality. The `<!-- AUTO-GENERATED: run bun run src/sandbox/runner.ts --emit-traces to refresh -->` comment is the only guard; architect recommends a follow-up build-step automation as technical debt.

**Next actor:** dev-mcp-server — implement P2-H-FIX per corrected P2-H section. After AC-3 confirmed: PO dispatches P2-I. Then qa P2-J onward per existing plan.

---

## P2-MCP-PLAN — mcp-server Phase-2 task plan (2026-05-25T18:05Z) — DESIGN COMPLETE

**Task:** P2-MCP-PLAN. Author the mcp-server SCALE Phase-2 task plan. Input: PO signal po-20260525T174842Z.json (Phase-1 7/12 honest grade), Phase-1 task plan, pilot-status-mcp-server.json, brownfield scan (intelligenceCycleJob kinhDich callers, src/index.ts 199L, no eslintrc on disk).

**Key design decisions:**

1. **G3 split design confirmed.** src/index.ts → thin entry (≤80L: env suppression + imports + `await bootstrapMcpServer()`) + composition-root.ts (≤120L: all 5 startup sections, graceful shutdown, signal handlers). Zero domain logic in composition root. Task P2-E.

2. **G4 fence adapted to mcp-server layers.** SI-3 spec is FINAL (no re-design). Fence elements mapped to existing mcp-server structure: domain/application/infrastructure/interface/scheduler/sandbox/composition-root. Fence-A: domain must not import infra/interface/scheduler. Fence-B: application must not import interface/scheduler. Fence-C: infra only from composition-root + application. Fence false-green trap explicitly guarded: deliberate-violation proof (non-zero exit + "Fence-A" in output) is MANDATORY. Tasks P2-A through P2-D.

3. **G5a scope NARROW.** Only `kinhDichWrapper.ts` moves to `_deprecated/`. All other kinhDich domain files (hexagramLibrary, kinhDichReading, etc.) stay — they are legitimately KEEP: intelligenceCycleJob's in-process hexagram computation path (dynamic imports at lines 409-420) is NOT a G5 violation. 2 test files need import path update. Task P2-F.

4. **G9 dashboard-first, verbal-second.** Module panel + microservice panel filled with live data (P2-G), then Playwright trust-contract (P2-H, Path B PO default), then USER verbal sign-off (P2-I — ONLY USER-gated step, PO presents file:// dashboard, user says YES, NEVER ask user to run commands). 7 Playwright assertions including offline fallback.

5. **G10/G11 target confirmed.** signal-bus-helper (signalBuilders.ts) for G10 injection. sector-classifier (sectorPeers.ts) for G11 Trial-2 dedicated mutation. Trial-1 may reuse G10 evidence if coupling observed.

6. **13 tasks (P2-A→P2-Z), strictly sequential WIP=1.** ~9h dev+qa effort. Pre-revert tags: mcp-server-pre-ci (P2-A), mcp-server-pre-delete (P2-F), mcp-server-pre-inject (P2-J). All three listed in Phase-1 plan §Pre-Revert Tags.

**Files authored this cycle (4):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-2-task-plan.md` (NEW — full plan, 13 tasks)
2. `docs/pipeline-state.json` (UPDATED — phase2=PLANNED, nextAgent pm/dev-mcp-server)
3. `docs/data/pilot-status-mcp-server.json` (UPDATED — phase2 block populated)
4. `docs/signals/DASHBOARD.md` (UPDATED — Phase-2 plan-ready row in header)
5. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** pm — break plan into dev-mcp-server + qa handoffs. Then dev-mcp-server RUN-SOLO P2-A→P2-H+P2-K+P2-L. qa: P2-C/D/H/J/K/L/Z. po: P2-I (G9 verbal) + 12/12 terminal flip after P2-Z.

---

## BCTC-TABLE BT-2 — Integration Blueprint (2026-05-25T18:00Z) — DESIGN COMPLETE

**Task:** BT-2. Design the produce→store→render pipeline for the bctc-inspect table view. PO gate: BT-0-PICK DONE (TEXT path, commit f3931b3a). User complaint: `/api/bctc-inspect` right-pane shows only OCR text, never a structured table (architecture gap — nothing stored).

**Key decisions:**

1. **Storage in `market.db` (mcp-server), not `pdf_extractor.db`.** mcp-server is the sole WRITE owner of `market.db`. pdf-extractor POSTs extracted rows via HTTP to a new `POST /api/push-bctc-table` endpoint. Zero direct DB access from pdf-extractor. Follows 1954c consolidated ownership pattern exactly.

2. **Two new tables in `schema-financial-reports.ts`:** `bctc_table_rows` (per-row: report_id, page, row_order, code, label, period_current/prior, value_current/prior, unit, is_summary_row) + `bctc_balance_checks` (per-report: total_assets/liab/equity, balance_delta, balance_pass). DDL as `CREATE TABLE IF NOT EXISTS` — auto-migrates at server startup.

3. **New ExtractTablesUseCase** (application layer, pdf-extractor) orchestrates `TextTableExtractor` (infra, Tesseract+BT-1 primitives) → balance check (domain pure via reconcile_figures) → `TablePushClient` (infra, aiohttp POST). Import-linter Fence-A/B fully respected.

4. **New GET /api/bctc-inspect/table/{doc_id}** on mcp-server returns `{has_table, rows[], balance_check}`. `has_table=false` when no rows stored (200, not 404). Inspector adds `#table-section` with balance PASS/FAIL badge.

5. **New POST /api/push-bctc-table** on mcp-server (DELETE+INSERT idempotent, UUID-gated). Registered alongside existing push-* handlers.

6. **BT-4b trigger:** `bctcBatchTableBackfillJob.ts` (one-shot, NOT cron). Iterates 14 `financial_reports` rows with `pdf_path IS NOT NULL`, calls `POST pdf-extractor:5001/extract-tables` for each. Runs AFTER BT-3+BT-3i+BT-5, BEFORE BT-6.

7. **R-1 (HIGH) low cell-F1 (0.07-0.12):** TEXT path gets figures right but column alignment is weak. Design mitigated by `row_order` preservation + BT-5 cross-check gate on summary codes. PP-StructureV3 IMAGE cross-check DEFERRED (self-hosted only if ever activated). No external API.

8. **1954c collision: NONE.** Existing `POST /extract` → `ExtractPDFUseCase` path untouched. New `POST /extract-tables` → `ExtractTablesUseCase` is additive.

**Files authored this cycle (2):**
1. `docs/handoffs/TASK_BCTC-TABLE.md` — [Architect] BT-2 section appended (full blueprint + ACs for BT-3/3i/4/4b/5/6)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** pm — create per-task handoffs for BT-3 (dev-pdf-extractor) and BT-3i (dev-mcp-server). BT-3 first; BT-3i depends on schema from BT-3. BT-4 parallel with BT-3i (ops sizing). BT-5 after BT-3. BT-4b after BT-3+3i+5. BT-6 after BT-4b.

---

## P0-MCP-5 — mcp-server Phase-1 task plan (2026-05-25T~UTC) — DESIGN COMPLETE

**Task:** P0-MCP-5. Last Phase-0 analysis deliverable before mcp-server pilot Phase-0 close. FULL-scope plan (not MVR) — domain host rationale restated. Inputs: P0-MCP-1 brownfield + P0-MCP-2 bug baseline + mcp-server-charter.md + pilot-charter.md + frontend-phase-1-task-plan.md (format template) + dev-mcp-server/main.md (G12 streak rule).

**Key design decisions:**

1. **FULL verdict confirmed.** mcp-server IS the domain host; MVR is inappropriate (no upstream delegate, 146-tool blast radius, G5-inverse R-CRITICAL violations live, G4 fence doesn't exist, G6 trust dashboard doesn't exist).

2. **G12 streak tasks confirmed: P1-B / P1-C / P1-D** — aligned with `.claude/flows/dev-mcp-server/main.md` §G12 Streak Rule. P1-B = dashboard stub (streak #1), P1-C = system/ barrel wave (streak #2), P1-D = macro/ barrel wave (streak #3).

3. **Barrel decomposition waves ordered smallest-blast-radius first:** SEAM-1 `system/` 21→5 sub-barrels (P1-C), SEAM-2 `macro/` 14→HTTP-proxy+local-computation (P1-D), SEAM-3 `sector/` 15→3 cluster cuts (P1-E). Each QA-gated against full 146-tool surface before next.

4. **G5-inverse remediation track (P1-F + P1-G):** Explicit tasks for kinhDichWrapper bypass (marketTools.ts + analysis.ts + portfolioTools.ts QUE_META), and pdf.ts/pdfOcrWorker.ts post-1954c verify. Each ends with "every handler proven HTTP-routed" grep evidence.

5. **G1 primitive scaffolding (P1-H, secondary):** signal-bus-helper (signalBuilders.ts) + sector-classifier (sectorPeers.ts). Both pure, zero-IO confirmed. ≥3 scenario JSON each. severityLabels.ts annotated as G1-PRIMITIVE-CANDIDATE in P1-E.

6. **Regression tripwires carried from P0-MCP-2:** tool count ≥146, Gate 2d=68, tsc EXIT:0, bun test ≥9408/≤348, BCTC+news-fetch dashboards HTTP 200, no new domain→infra imports — re-checked after EVERY wave.

7. **Carried-debt note:** cronJobCount SSOT=77 vs live=68/73 (stale). testBaselinePass SSOT=9277 vs live=9408-9411 (stale). PO reconciles at P1-EXIT, NOT in Phase-1 scope.

8. **Docker rebuild deferred** to separate session (memory cap). Phase-1 verified host-side only.

9. **10 tasks total** (P1-A through P1-EXIT): 9 dev tasks + 1 PO close-out. WIP=1, RUN-SOLO, ~30h dev effort.

**Risk flags:**
- R-CRITICAL: kinhDichWrapper bypass → P1-F (remediation task)
- R-MEDIUM: pdf.ts/pdfOcrWorker not in _deprecated/ → P1-G (verify task)
- R-HIGH: 146-tool blast radius per barrel wave — QA-gated after each
- R-HIGH: BUG-1 commit-mutex enum drift — workaround: kind=sprint-task, key=commit-mutex:main
- R-LOW: bctc-schema.ts monorepo-root relative import (deferred to Phase 2)

**Files authored this cycle (2):**
1. `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md` (REWRITTEN — full FULL-scope plan, 10 tasks, 78 ACs)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** PO — P0-MCP-EXIT (Phase-0 close). dev-mcp-server scheduled LAST after all other service pilots complete.

---

## P0-MCP-1 — mcp-server brownfield inventory (2026-05-25T~UTC) — DESIGN COMPLETE

**Task:** P0-MCP-1. Read-only brownfield inventory of the mcp-server scale pilot (LAST factory microservice, RUN-SOLO / HIGHEST-RISK). Phase-0 UNBLOCKED by PO (HELD pre-0 → ACTIVE 2026-05-25T08:40:43Z, commit 15134e72-area). Mirrors frontend P0 pattern.

**Key brownfield findings:**

1. **12 barrel modules confirmed:** system(21), sector(15), macro(14), market-data(9), news-analysis(9), alerts(9), financial-reports(8), portfolio(7), briefings(5), backtesting(2), analysis(1), kinhdich(1). Total tool files: 115 non-index .ts files across tools/.

2. **Tool count SSOT:** `docs/data/project-stats.json#toolCount` = 146. **Cron count SSOT:** `docs/data/project-stats.json#cronJobCount` = 77. System-map.json shows 125 tools / 65 crons (curation lag vs live stats).

3. **G5-inverse headline:** TA ✓, stock-price ✓, RAG ✓ fully HTTP-routed. kinh-dich PARTIAL (kinhDichWrapper bypassed by marketTools.ts + analysis.ts — R-CRITICAL). macro PARTIAL (8+ local computation tools legitimately owned, only get_macro_snapshot routes via HTTP). pdf-extractor PARTIAL (1954c consolidation landed but pdf.ts + pdfOcrWorker.ts not yet in _deprecated/).

4. **R-CRITICAL (kinhDichWrapper bypass):** `marketTools.ts` and `news-analysis/analysis.ts` directly import `appendKinhDich()` from `domain/services/kinhDich/kinhDichWrapper.ts`. `portfolioTools.ts` imports `QUE_META` from `hexagramLibrary.ts`. These bypass kinh-dich-service:5005 — live G5-inverse violation flagged.

5. **Top 3 barrel-decomposition seams:** SEAM-1 = `system/` (21 files, 5 sub-domain clusters); SEAM-2 = `macro/` (HTTP-proxy vs local-computation split); SEAM-3 = `sector/` (15 topic files, pure domain clusters).

6. **Scheduler coupling risk:** `dailyDashboardJob.ts` reads `docs/agent-memory/sessions/` + `docs/TASKS.md` + `docs/data/project-stats.json` via `getProjectRoot()` — ENOENT class on any path change. `bctcPdfPullJob.ts` in 1954c consolidation zone.

7. **Dashboards served:** bctc-inspector.html + news-fetch-dashboard/ via 8 HTTP route handlers. NOT G6 trust layer — G6 three-tier trust dashboard must be built fresh in Phase 1.

8. **Test harness:** 905 Bun test files (`bun test`). No ESLint layer fence. One lint test (`no-local-project-root`). G4 fence = ESLint + `eslint-plugin-boundaries` or `no-restricted-imports` — must be installed in Phase 1.

9. **bctc-schema.ts monorepo-root coupling:** Dockerfile COPY + relative import path from `src/infrastructure/db/` — fragile, must resolve during barrel reorganization.

10. **MVR-vs-FULL verdict: FULL.** mcp-server IS the domain host; no upstream service to delegate to. Full G1-G12 scope mandatory.

**Risk flags:**
- R-CRITICAL: kinhDichWrapper bypass in marketTools.ts + analysis.ts (live G5 debt pre-existing)
- R-MEDIUM: pdf.ts + pdfOcrWorker.ts not in _deprecated/ (post-1954c cleanup pending)
- R-HIGH: 146-tool blast radius on any barrel split — QA-gate required per barrel before proceeding
- R-HIGH: 77 cron jobs — regression silently breaks daily operational data (dailyDashboardJob ENOENT class)
- R-LOW: bctc-schema.ts monorepo-root relative import (fragile path)
- R-LOW: 905 test files must not regress the 9277 passing baseline

**Files authored this cycle (2):**
1. `docs/handoffs/TASK_P0-MCP-1-brownfield-inventory.md` (NEW)
2. `docs/agent-memory/notebooks/architect.md` (this entry)

**Next actor:** PO — P0-MCP-2 (bug-inventory baseline) + P0-MCP-3 (dev-mcp-server agent/flow confirm) + P0-MCP-5 (Phase-1 task plan) gated on this inventory.

[Older cycles archived in git history — see commits before 2026-05-25]
