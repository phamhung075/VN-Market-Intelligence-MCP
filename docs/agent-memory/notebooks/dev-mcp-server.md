# dev-mcp-server -- Notebook

## 2026-08-23 — TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY (scripts/audits/ zone, architect brief 2026-08-23-signal-type-registry-open-namespace-vs-closed-allowlist.md, direct dispatch) → review[]

**Session:** 007e33e4-b453-4bb3-8ab1-ef31495906a3 (router-held). Task carried `next_agent: "developer"` on the board — a dead-end (Task-tool subagent, no nested `Agent()`, cannot spawn zone specialists); corrected to `qa` in the same lane-move write.

**Root cause fixed:** `scripts/audits/guard-signal-type-coverage.sh` (2026-08-22) only parsed Pipeline-B's routing table (`.signal_queue.rows[]`) — Pipeline-A (`.dev_team_idle_chain.pending_triage_inbox[]`) had zero machine coverage, and neither pipeline's rules were tagged, so a type routed on ONE pipeline's table could false-pass coverage for a signal that actually arrived on the OTHER. This caused the 2026-08-23 CI red (`audit-handoff` routed on Pipeline-A only, tripped on Pipeline-B).

**Fix — 3 parts, all inside the existing script (no new file, per brief §4):** (1) generalized `extract_type_column()` to pull every backtick-quoted token out of a table cell, not just a single one — Pipeline-A has genuine multi-alias cells (`brief_complete` / `architecture_brief`, `news_impact` / `price_anomaly` / ...) the old single-token regex silently dropped. (2) added `pipeline_a_section()` (awk-scoped to the `(Pipeline A)` prose header through the `## Live ... (Pipeline B` heading) alongside the existing `pipeline_b_section()`, now also excluding a `**CORRECTION` stats sub-block (a `| \`system_issue\` (underscore) | ... |` measurement table, NOT a routing table) that would otherwise have been mis-parsed as a routing rule — caught this live during manual dry-run against the real doc, would have been a new false-pass class in the very code meant to close false-passes. (3) `UNROUTED_A`/`UNROUTED_B` are now checked independently, each against only its own pipeline's tagged routed-set. (4) `mint_routing_gap_row()`: on any unrouted type, dedup-checks NON-TERMINAL lanes on `dedup_key="signal-type-registry-gap:{type}"`; if absent, mints a `.task_board.backlog[]` row (`type: "routing-gap"`, `status: "BACKLOG"`) via the real `scripts/orch-apply.sh` (`ORCH_APPLY_LIVE_FILE_OVERRIDE=$ORCH_STATE` — a no-op in prod, lets tests target a disposable fixture). Kept `exit 1` as the forcing function regardless of mint outcome.

**Hard constraint honored:** `apps/mcp-server/src/infrastructure/orchStateSchema.ts` diff confirmed empty via `git diff` (0 lines) — no `z.enum()` added to `SignalRowSchema.type`/`.severity`, per the brief's measured write-outage risk (WARN severity = 20/29 live rows, not in the enum).

**Tests:** `guard-signal-type-coverage.test.sh` expanded 7→24 assertions (new: Pipeline-A routing, multi-alias extraction, cross-pipeline blind spot in BOTH directions, mint-success + row-shape, dedup-skip-on-repeat-run — no duplicate row), `write_orch_fixture()` rebuilt as a full schema-valid skeleton (was a bare `{signal_queue:{...}}` stub that could never have exercised the real `orch-apply.sh` validation chain the mint path now depends on) so the mint assertions run against the REAL Zod validator + conservation + prose-ceiling gates, unmocked. All 24 GREEN. Manually verified end-to-end against disposable fixtures before writing the test file (mint lands a correctly-shaped row; second run dedup-skips, row count stays 1). Live smoke test: `bash scripts/audits/guard-signal-type-coverage.sh --check` against the real `docs/data/orch/orch-state.json` → PASS (Pipeline A: 1/21 known routed, Pipeline B: 8/22 known routed) — 0 unrouted, so mint never fires against the real board.

**CI:** `.github/workflows/ci.yml`'s `signal-type-coverage-guard` job comment updated to describe dual-pipeline scope. Deliberately did NOT add `oven-sh/setup-bun` to that job — CI never persists a mint (ephemeral checkout, no push-back step) and its actual gate (`exit 1`) is unaffected by mint success/failure; documented honestly in the comment that a mint attempt there degrades to a logged non-fatal skip rather than silently claiming full coverage it doesn't have.

**Board:** moved `TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY` `ready[]→review[]` via `orch-apply.sh` (`next_agent: "developer"→"qa"` fixed in the same write). `.head` left untouched — `active_task_id` was already `null` and never named this task (guard condition correctly not satisfied, not blind-nulled).

**Evidence:** DJ `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md` S12. Commit `4e7aa7eaf` (4 files: `guard-signal-type-coverage.sh`, `.test.sh`, `.github/workflows/ci.yml`, `docs/data/orch/orch-state.json`).

Zone health: split-table blind spot closed and verified in both directions (not just today's specific `audit-handoff` instance), self-filing mint mechanism proven end-to-end against the real orch-apply.sh validation chain (not asserted), schema-untouched constraint independently confirmed via `git diff`, a second latent false-pass class (the CORRECTION stats table) caught and fixed during implementation rather than shipped | HEALTHY.

## 2026-08-23 — TASK-BCTC-INSPECT-LABEL-FIX (AC9 buildLabel() quarter-dup fix + AC-14 test correction, decompose:FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER) → review[]

**Session:** 669e1d9f-6aa0-49b5-bbf3-5aa3f92f55e3. Architect's D-1 corrected AC9's root cause beyond BA's initial 2-HUT-row framing: `period_type` already holds `'Q1'..'Q4'` on every live row, so buildLabel()'s unconditional quarter-append duplicated the token on all 255 normal rows, not just the 2 string-typed HUT rows.

**Fix:** `bctcInspectHandler.ts` — added `QUARTERLY_PERIOD_TYPE_RE` + exported `normalizeQuarter()`; `buildLabel()` now skips the quarter suffix when `period_type` already matches `/^Q[1-4]$/`. Updated the AC-14 hardcoded assertion (`PI3-bctc-inspect.test.ts:361`, in-scope correction, not a preserved regression) `"VCB Q1 Q1 2025"` → `"VCB Q1 2025"`; added 6-case `normalizeQuarter()` unit-test block.

**Verified:** 49/49 `PI3-bctc-inspect.test.ts` pass; 4 sibling regression files (reopen2/md/page-nav/overlay) 60/60 pass untouched; `tsc --noEmit` clean; `PORT=3099` boot healthy (toolCount=183, `/api/bctc-inspect` + `/dashboards/news-fetch/` both 200). Live-probed `:3099/api/bctc-inspect/docs`: 0/268 rows show a duplicated/garbled quarter token post-fix (was 255/257 pre-fix) — HUT rows now render `"HUT Q1 2024"` correctly.

**Board:** claimed `ready[]→in_progress[]` via `orch-apply.sh` before starting (sole authority — sprint-task lock held by dispatcher per INV-GATEWAY-1, no `task_claim` MCP call from this specialist). Sibling `TASK-BCTC-INSPECT-UI-FILTERS` confirmed in `in_progress[]` (different dev-mcp-server session, disjoint files — `bctc-inspector.html` + new test file, zero overlap with my `bctcInspectHandler.ts`/`PI3-bctc-inspect.test.ts`).

**Evidence:** DJ `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md` S13. Commit `237fa6e26` (code+test).

Zone health: 268/268 live rows render clean labels post-fix (0 duplicated-quarter tokens, verified via direct API probe not assumption), 4 sibling test files stay green by construction (label-only change, no shared code path touched), parallel sibling task confirmed disjoint before commit | HEALTHY.

## 2026-08-23 — TASK-BCTC-INSPECT-UI-FILTERS (quarter + ticker facet filters, decompose:FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER) → review[]

**Session:** 669e1d9f-6aa0-49b5-bbf3-5aa3f92f55e3 (sibling task's session — resumed for the paired UI-filter deliverable). Added `#quarter-filter`/`#ticker-filter` selects to `bctc-inspector.html`'s `.controls` bar, module-scope `allDocs` cache, `normalizeQuarter()`/`renderDocOptions()`/`populateFilterOptions()`/`applyFilters()` per architect D-2/D-3/D-4/D-5 + BA FR-1..FR-8. `applyFilters()` mutates `select.value` directly with NO synthetic `change` event — the existing handler unconditionally refetches PDF/OCR/table/MD, which would defeat AC2's zero-network-call design.

**Verified live:** 11 distinct quarter options, 50 distinct ticker options (AC3/AC4 exact match, 268-row live dataset). New `FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts`: 18 pure-fn assertions GREEN, incl. the live HUT `period_quarter="Q1"` string quirk. 5 named regression files + new file: 145 pass/0 fail. `tsc --noEmit` clean. `PORT=3099` boot healthy (toolCount=183, `/api/bctc-inspect` served HTML confirmed containing both new `<select>` ids).

**Full-suite honesty check:** `bun test` (whole repo) = 15359 pass/40 skip/50 fail. Every failing test name grepped and confirmed outside this task's files (backtest_runs, vps_push_log, insider_transactions, task_heartbeat/task_release Zod, get_foreign_flow, VPS-proxy-health, MCP SSE registration) — zero touch bctc-inspector/filter code; many carry 5000ms timeouts (shared-DB/network contention signature from concurrent live agents on this host), pre-existing and unrelated. Documented in the handoff's Implementation Record rather than silently claimed clean or silently left unmentioned.

**REBUILD_REQUIRED:** `apps/mcp-server/src/` bakes into the Docker image at build time — live `:3000`/`:3001` container still serves pre-change HTML (confirmed: `quarter-filter` id absent there, present on local `:3099` build). Ops must rebuild before AC10's dual-origin manual verify shows real results.

**Board:** `TASK-BCTC-INSPECT-UI-FILTERS` moved `ready[]→in_progress[]→review[]` via `orch-apply.sh`.

**Evidence:** DJ `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md` S14. Commit `2e66153fd` (bctc-inspector.html + new test + financial-reports.md doc section).

Zone health: filter feature verified end-to-end against live growing dataset (not fixture assumption), zero-refetch design structurally + functionally confirmed (5-file regression suite 0 fail), pre-existing full-suite red surfaced honestly with a fingerprint (test names) rather than hidden behind a scoped subset run | HEALTHY.
