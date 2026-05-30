# Architecture Brief — BCTC-AGENTIC-REFINE

**Sprint:** BCTC-AGENTIC-REFINE
**Author:** architect
**Date:** 2026-05-30
**Triggered by:** REQ_BCTC-AGENTIC-REFINE.md (BA spec, 15 FRs) + approved plan magical-cooking-cocoa.md
**Status:** DESIGN COMPLETE (amended x3) — NEXT: pm
**Amended:** 2026-05-30 — User directive: Model-Tier Matrix + analyze-flow re-tiering
**Amended:** 2026-05-30 — User directive: Refine fan-out orchestration (§0.6, FR-12 update)
**Amended:** 2026-05-30 — AR-ARCH-INVOKE ruling: subagent invocation mechanism fixed (§0.6 superseded in part; see §0.7)

---

## 0. User Directive — Model-Tier Matrix (2026-05-30 amendment)

This section records the post-brief user directive verbatim and resolves it into binding design decisions that amend §3.3, §7, §8, and §9.

### 0.1 Directive (verbatim)

> "we can run multiple cheaper haiku flow (keep small but quality) for refine quality using logic and diagram wrote by opus"
> "the analyze flow (the expert BCTC analysis) using sonnet minimum or opus if find interrest thing or something need deeper analyst"

### 0.2 Model-Tier Matrix

| Pipeline | Authoring (one-time) | Runtime model | Notes |
|---|---|---|---|
| **REFINE flow** (transcription + verification) | Opus writes all flow files and worked examples | **claude-haiku-3-5** | Multiple small parallel sub-flows per page-window. Haiku keeps cost per report < $0.50. Sub-flows: table-page, prose-page, continuation-stitch, disagreement-verify. |
| **ANALYZE flow** (expert BCTC analysis — bctc-analyst) | Opus writes escalation sub-flow once | **claude-sonnet-4-5** baseline; **claude-opus-4** on escalation trigger | Sonnet runs all 6 standard passes. Opus runs the deep-dive sub-flow only when a deterministic trigger fires (§0.3). |

**Invariant:** No Opus in the live runtime loop by default. Opus touches runtime only via the deterministic escalation gate in the analyze flow. The authoring step (Opus writes flow files) is a one-time agent-father task, not a per-report cost.

### 0.3 Sonnet → Opus Escalation Spec (ANALYZE flow)

The escalation from Sonnet to Opus must be deterministic — not subjective. The following triggers are binding. Any single trigger firing during the Sonnet passes queues the deep-dive sub-flow on Opus.

| ID | Trigger | Threshold | What Opus does |
|---|---|---|---|
| ESC-1 | Suspected accounting manipulation | Any pass flags `accounting_trick` or `revenue_pull_forward` in its verdict JSON | Full re-read of the flagged statement section + related notes; output: confirmed/refuted + mechanism |
| ESC-2 | Balance sheet fails check | `\|assets - (liabilities + equity)\|` > 0.5% of total assets after rounding | Re-examine line items causing imbalance; output: source of discrepancy + confidence |
| ESC-3 | OCF vs net-profit divergence | `\|OCF / net_profit - 1\|` > 0.40 (i.e. cash conversion < 60% or > 140%) | Deep cash-flow quality analysis; accrual breakdown; quality-of-earnings verdict |
| ESC-4 | Unusual related-party or one-off item | Any pass extracts a related-party transaction > 10% of revenue OR a non-recurring gain/loss > 15% of net profit | Related-party risk assessment + adjusted earnings (strip one-off) |
| ESC-5 | Refine confidence below bar | Any `bctc_refined_units.confidence` for a statement-section < 0.50 at time bctc-analyst runs | Re-read raw OCR for that section + image; output: corrected values or elevated uncertainty flag |

**Output contract for the Opus deep-dive sub-flow:**

The Opus sub-flow produces a structured JSON block appended to the analysis output:
```json
{
  "escalation_trigger": "ESC-3",
  "trigger_value": 0.28,
  "threshold": 0.40,
  "deep_dive_verdict": "...",
  "confidence": 0.85,
  "recommended_action": "flag_for_human_review | hold | buy | sell"
}
```

This block is appended to the existing analysis passes output — it does NOT replace them.

**Sub-flow file:** `docs/agents/bctc-analyst/flow/deep-dive-opus.md` (new file, agent-father authors, Opus is the model declared in the frontmatter of this sub-flow only).

### 0.4 Impact on FR-6 / FR-7 (REFINE agent)

The sub-flow decomposition mandate (FR-6, FR-7) is unchanged. The addition from this directive: agent-father must author ALL flow files using Opus as the authoring model (one-time, not per-report). The flows themselves declare `model: claude-haiku-3-5` in their frontmatter. This is already consistent with D2 (Haiku runtime). No change to the flow file structure.

### 0.6 Refine Fan-Out Orchestration (2026-05-30 amendment)

This section fixes the execution model for the REFINE step. The prior brief described sequential per-page processing. User directive: run as **parallel fanned-out Haiku subagents**. This amends §3.2.6 (orchestrator) and §3.3.1 (agent). All prior content is unchanged.

#### 0.6.1 Fan-Out Unit = Page-Window, Not Bare Page

The cheap deterministic window-hint pre-pass (`classify_page_for_image_load`, FR-5) partitions the report into windows before any subagent is spawned.

Rules:
- A standalone page (not a table continuation) is its own 1-page window.
- A table spanning pp. N and N+1 detected by the continuation-stitch heuristic (`tiếp theo` / `continued` marker in p. N+1 header) is ONE 2-page (or n-page) window.
- Multi-page windows may span at most `REFINE_MAX_WINDOW_PAGES` pages (default 3; configurable). Any table continuation longer than 3 pages is treated as one window capped at 3 pages, with a `truncated_continuation` trust flag.

**Critical invariant:** the fan-out algorithm MUST never split a continuation table across two subagents. The window-partitioning function must consume the continuation-marker check BEFORE assigning subagent boundaries. Continuation detection is a sequential scan (O(n) pages); it completes fully before any subagent is spawned.

#### 0.6.2 One Haiku Subagent Per Window — Bounded Concurrency Pool

Spawn pattern:
- One `refine_bctc_md` Haiku subagent per window, all launched in parallel.
- Concurrency cap: `REFINE_FANOUT_CONCURRENCY` (env var; default 5). The orchestrator queues windows into a bounded pool — it never spawns more than the cap simultaneously. This respects the 8GB host memory constraint and Claude API rate limits.
- Each subagent receives a small, focused context: its window's OCR text + images (image only if `classify_page_for_image_load` returns true for at least one page in the window) + the relevant sub-flow reference + the refine contract. The subagent does NOT receive OCR text or images from other windows.
- Each subagent returns: `{ unit_id, page_numbers_json, markdown, confidence, flags }` (same contract as the existing §3.2.8 output, unchanged).

**Subagent invocation mechanism:** dev-mcp-server chooses between the fleet subagent-spawn pattern (claude CLI subprocess per window) or a Workflow-style parallel map. Both are valid. The architect fixes the SEMANTICS (window unit, bounded pool, collect-then-write, failure isolation) — the mechanism is an implementation decision for dev-mcp-server.

#### 0.6.3 Collector — Aggregate Then Write (Collect-Then-Write)

The orchestrator MUST aggregate ALL window results before any DB write. Pattern:

```
1. Spawn all window subagents (bounded pool).
2. Await all completions (with per-window timeout: REFINE_WINDOW_TIMEOUT_S, default 120s).
3. Collect results list: [ { unit_id, page_numbers_json, markdown, confidence, flags, status } ]
4. THEN (and only then): single DELETE-then-INSERT transaction into bctc_refined_units.
5. THEN: parse all markdown → bctc_table_rows (also in a single transaction).
```

**Rationale:** concurrent writes from subagents directly into `bctc_refined_units` would race on the `UNIQUE(report_id, unit_id)` constraint and create interleaved partial state. Collect-then-write makes the write step single-threaded and transactional. The orchestrator owns all DB writes — subagents never write to the DB.

#### 0.6.4 Failure Isolation — Partial Report Semantics

One window subagent failing does NOT abort the whole report.

Failure states per window:
- **Timeout** (subagent exceeds `REFINE_WINDOW_TIMEOUT_S`): mark window as `{ status: "FAILED", markdown: "", confidence: 0.0, flags: ["timeout"] }`.
- **Agent error** (non-zero exit or exception from subagent): mark window as `{ status: "FAILED", markdown: "", confidence: 0.0, flags: ["agent_error:<detail>"] }`.
- **Low confidence** (subagent returns but all cells flagged): window status remains `DONE`, confidence reflects the low score, flags propagate normally.

Report-level `refine_status` semantics after aggregation:

| Condition | `refine_status` |
|---|---|
| All windows returned status=DONE | `DONE` |
| Some windows FAILED, at least one DONE | `PARTIAL` |
| All windows FAILED | `FAILED` |
| In-progress (pre-collect) | `IN_PROGRESS` |
| Not yet started | `PENDING` |

`PARTIAL` reports are stored and usable. The orchestrator logs which `unit_id`s failed. FAILED windows are written to `bctc_refined_units` with `confidence=0.0` and the failure flag so the gap is visible in the `get_bctc_refined` tool output. They are NOT silently omitted.

**Re-run semantics:** a `PARTIAL` report is re-eligible on the next cron run. The DELETE-then-INSERT idempotency guarantees the re-run replaces all prior data (both successful and failed windows) cleanly.

#### 0.6.5 Schema Addition for Fan-Out (additive to §3.2.1)

Add one column to `bctc_refined_units`:

```sql
window_status  TEXT NOT NULL DEFAULT 'DONE'
  -- DONE | FAILED | PARTIAL (mirrors report-level semantics at window granularity)
```

This column is added to the `CREATE TABLE IF NOT EXISTS` DDL in §3.2.1. No ALTER TABLE needed (new table). The orchestrator writes `window_status` for each row at collect-time.

#### 0.6.6 Config Env Vars (additive to §8)

| Var | Default | Description |
|---|---|---|
| `REFINE_FANOUT_CONCURRENCY` | `5` | Max simultaneous Haiku subagents per report |
| `REFINE_WINDOW_TIMEOUT_S` | `120` | Per-window subagent timeout in seconds |
| `REFINE_MAX_WINDOW_PAGES` | `3` | Max pages per continuation window |

---

### 0.7 Subagent Invocation Mechanism — RULING (2026-05-30, AR-ARCH-INVOKE)

> **This section supersedes the final sentence of §0.6.2** ("Subagent invocation mechanism: dev-mcp-server chooses between the fleet subprocess pattern (claude CLI subprocess per window) or a Workflow-style parallel map. Both are valid.") **That sentence is incorrect at runtime and is struck.** Both options it listed are non-runnable in the actual deployment context. This section is the binding replacement.

#### 0.7.1 The Blocker — Proven at Runtime

`apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` currently fans out refine windows by calling `spawn("claude", ["run", "docs/agents/refine_bctc_md/flow/main.md", "--input", payloadJson])`. The mcp-server container is a Bun/TS microservice with NO `claude` CLI binary installed. Every spawn fails ENOENT (exit -2). The orchestrator collects empty results and marks every report `window_status=FAILED`, `row_count=0`.

The two options in the original §0.6.2 sentence are both non-runnable:
- **claude CLI subprocess** — binary absent in-container; ENOENT confirmed.
- **Workflow-style parallel map** — this is a Claude Code harness construct; it does not exist in a Bun microservice runtime.

#### 0.7.2 Decision — OPTION Y: Host-Level Fleet Cron (BINDING)

**Ruling: Option Y. The refine orchestration moves OUT of the mcp-server container to the host-level fleet (Claude Code cron), using the standard fleet Agent/Task subagent fan-out mechanism. `bctcRefineJob.ts` is reduced to a thin data-service helper (readiness query + push-write only). The `spawn("claude", ...)` call is deleted.**

#### 0.7.3 Reasoning (addressing each user directive)

| Constraint | Option X (in-container API) | Option Y (host fleet cron) — CHOSEN |
|---|---|---|
| "keep running claude code" | Violates: replaces CC runtime with bare Anthropic API fetch calls | Honors: fan-out uses host CC session, same Agent/Task pattern as all other cowork agents |
| "run multiple cheaper Haiku flow for refine using logic and diagram wrote by opus" | Opus-authored flow files (`docs/agents/refine_bctc_md/flow/*.md`) become dead letters — not executed by any agent runtime | Flow files ARE executed: CC cron runs `docs/agents/refine_bctc_md/flow/main.md`, Haiku executes each sub-flow per the authored instructions |
| "fan out subagent cheap Haiku executes them at runtime for every page/report on step transcription + verification flow" | Anthropic Messages API = raw inference, not a subagent fan-out; no flow dispatching | CC subagent fan-out via Task tool = exact match; bounded pool of Haiku sub-agents, one per window |
| Opus AUTHORS at authoring-time; NO live Opus in refine loop | Opus-authored prompts must be re-encoded as API system prompts manually; drift risk | Opus-authored flow files execute directly; no re-encoding; authoring is authoritative |
| Credential/security surface | ANTHROPIC_API_KEY added to mcp-server env (data microservice holds model key) | ANTHROPIC_API_KEY stays in the CC host session (already present); mcp-server holds no model key |
| DDD: model calls in a data microservice | DDD violation: infra/interface layer absorbs agent orchestration concern | Clean DDD: mcp-server is a pure data service; orchestration lives in the CC agent layer |

#### 0.7.4 Revised Architecture — Option Y

**Fleet cron skill (NEW):**
- Path: `.claude/commands/crons/cron-refine-bctc.md`
- Entry point: `run docs/agents/refine_bctc_md/flow/main.md`
- The `main.md` flow reads pending reports (via `get_bctc_pending_refine` MCP tool — see below), partitions windows, fans out one Haiku subagent per window via the CC Task tool, collects results, and pushes results back via `push_bctc_refined_unit` (new MCP push tool).
- Cron schedule: `'0 9,14,20 * * *'` UTC (unchanged from §3.2.6; all times outside OFF-HOSE window).

**New MCP tools (dev-mcp-server):**

| Tool | Schema | Purpose |
|---|---|---|
| `get_bctc_pending_refine` | `{ limit?: number }` → `[{ id, filename, page_count }]` | Fleet cron queries mcp-server for reports ready to refine (`text_status='COMPLETE'`, `refine_status IN ('PENDING','PARTIAL')`). Replaces the in-job SELECT. |
| `push_bctc_refined_unit` | `{ report_id, unit_id, page_numbers, markdown, confidence, flags, window_status }` → `{ ok }` | Single-window result push from fleet cron → mcp-server DB. One call per window. The orchestrator calls this after each subagent completes. |
| `finalize_bctc_refine` | `{ report_id, report_status: 'DONE'\|'PARTIAL'\|'FAILED' }` → `{ ok }` | Fleet cron calls this after all windows are collected to set `refine_status` on `financial_reports` and run the `bctc_table_rows` parse from `bctc_refined_units`. Encapsulates Phase 4 collect-then-write in the DB layer where it belongs. |

**`bctcRefineJob.ts` reduced role:**
- The `spawn("claude", ...)` block in `spawnWindowSubagent()` is DELETED.
- The cron entry point `runBctcRefineJob()` is DELETED (fleet cron replaces it).
- The file is reduced to: `partitionIntoWindows()`, `classifyPageForImageLoad()` import, `runBoundedPool()` helper, and `countRows()`. These are pure helpers used by the `finalize_bctc_refine` handler's parse phase.
- Alternatively, `partitionIntoWindows()` moves to `application/utils/` and `bctcRefineJob.ts` is deleted entirely (dev-mcp-server decides; architect recommends the move to application layer to preserve DDD).

**Phase 4 (collect-then-write) — now split between fleet cron and mcp-server:**
- `push_bctc_refined_unit` handles per-window writes (called after each window result, but still transactional per-window at the DB layer).
- `finalize_bctc_refine` handles the report-level status update + `bctc_table_rows` parse from `bctc_refined_units`. This call is the Phase 4 "collect-then-write" boundary in the new architecture. The fleet cron calls it once, after ALL `push_bctc_refined_unit` calls complete.
- The `DELETE-then-INSERT` idempotency contract (§0.6.3) is preserved: `finalize_bctc_refine` handler deletes all existing `bctc_table_rows` for the report and re-parses from `bctc_refined_units` atomically. For `bctc_refined_units` itself: `push_bctc_refined_unit` uses `INSERT OR REPLACE` (or explicit DELETE-then-INSERT for the whole report at finalize time). Dev-mcp-server resolves; architect recommends: at the start of the cron run for a report, the flow calls `push_bctc_refined_unit` with a `reset: true` flag (one DELETE for all prior units) before individual window pushes.

**Continuation-invariant (unchanged):**
- `partitionIntoWindows()` still runs sequentially to completion in the fleet cron flow (`main.md` Phase 1) before any subagent Task is spawned. The CC Task tool's parallel fan-out happens only after the window list is fully produced. The invariant (no table split across subagent boundaries) is preserved.

**Failure isolation (unchanged):**
- One window subagent failing does NOT abort the report. The flow collects all window results (DONE and FAILED) before calling `finalize_bctc_refine`. Per-window `push_bctc_refined_unit` calls handle failures with `window_status='FAILED'`, `confidence=0.0`, flags populated.

#### 0.7.5 Anti-False-Green Requirement (DV gate for new mechanism)

The new mechanism requires an end-to-end proof that a window actually returns refined rows in the DB — not just that the cron skill launches without error.

**DV test mandate:**
1. `get_bctc_pending_refine` returns at least one report from a seeded in-memory DB.
2. After the fleet cron run on FPT (real or seeded), `bctc_refined_units` has `COUNT(*) = windows.length` with at least one `window_status='DONE'` row.
3. `finalize_bctc_refine` called → `bctc_table_rows` has `COUNT(*) > 0` for FPT, all rows have non-null `label` and numeric `value_current`.
4. Idempotency: cron re-run on same report → same row counts (DELETE-then-INSERT semantics).
5. FAILED window isolation: one window seeded as FAILED → other windows' rows still present in `bctc_table_rows`.

**Test location:** `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` (already mandated in §6) — extend with the push-tool pathway scenarios above. The existing test file covers the in-orchestrator pathway; add a `push_tool_pathway` describe block for the new tool-mediated path.

#### 0.7.6 Impact on §7 File List (dev-mcp-server zone)

Add to **Create** list:
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

Add to **Create** list (cron skill — agent-father zone):
- `.claude/commands/crons/cron-refine-bctc.md` (new cron skill; points to `run docs/agents/refine_bctc_md/flow/main.md`)

Modify `bctcRefineJob.ts` status in §7:
- **Changed from CREATE to MODIFY/REDUCE:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` — DELETE `runBctcRefineJob()` cron entry point and `spawnWindowSubagent()` production spawn block; RETAIN `partitionIntoWindows()` and `runBoundedPool()` as application utils or migrate them to `apps/mcp-server/src/application/utils/`.

Modify `cronConfig.ts` entry: the `bctcRefineJob` key previously scheduled in `cronConfig.ts` is REMOVED (the cron is now a fleet-level CC cron, not an in-container schedule). Dev-mcp-server removes the `cronConfig.ts` entry.

#### 0.7.7 Impact on §8 Decisions Table

Replace the row:
```
| Fan-out mechanism | Dev-mcp-server chooses: fleet subprocess pattern OR Workflow-style parallel map. Semantics fixed by §0.6. |
```
With:
```
| Fan-out mechanism | RULED: Option Y — host-level fleet cron (CC Agent/Task subagent fan-out). spawn("claude",...) deleted from bctcRefineJob.ts. mcp-server is a pure data service; orchestration is a fleet cron + refine_bctc_md agent. See §0.7. |
```

---

### 0.5 Impact on bctc-analyst (existing agent)

The `bctc-analyst` agent (`docs/agents/bctc-analyst/`) requires two changes, which are a NEW TASK in this sprint's scope (see §7 amendments):

1. **Frontmatter model update:** `model: claude-sonnet-4-5` (from whatever is currently declared). Architect does not assume the current value — dev-mcp-server or agent-father reads the live file first.
2. **New deep-dive sub-flow:** `docs/agents/bctc-analyst/flow/deep-dive-opus.md` declares `model: claude-opus-4`. The main flow (`flow/main.md`) must add a post-pass gate: evaluate escalation triggers ESC-1 through ESC-5, call deep-dive-opus sub-flow if any fires.
3. **Escalation gate logic** in `flow/main.md`: deterministic check after all standard passes complete. The gate reads the pass verdict JSON (already emitted by bctc-analyst's existing passes) and checks ESC-1 to ESC-5 conditions. No subjective judgment — pure threshold comparison.

---

## 1. Brownfield Findings

### 1.1 Zone: multi

| Zone | Owner | Files In Scope |
|---|---|---|
| `apps/pdf-extractor/` | dev-pdf-extractor | FR-1, FR-2, FR-14 |
| `apps/mcp-server/` | dev-mcp-server | FR-3, FR-4, FR-5, FR-9, FR-10, FR-11, FR-12, FR-13 |
| `docs/agents/` | agent-father | FR-6, FR-7, FR-13 (agent prompt) |

**BUILD-STANDARD: lean** (both services exist; this is a replace-and-extend operation, not a new service).

### 1.2 Verified Existing Paths

**pdf-extractor:**
- `apps/pdf-extractor/domain/repositories.py` — contains `OcrPort`, `OcrBackendPort`, `AlertPort` protocols. `OcrBackendPort` is the existing pluggable cell/text backend (for PEK text recognition). The NEW `OcrTextSourcePort` (FR-2) is a DIFFERENT port — it abstracts reading per-page OCR text already stored in `pdf_extracted_text` table, not the recognition step itself. Both ports coexist without conflict.
- `apps/pdf-extractor/infrastructure/ocr_backends.py` — existing `select_ocr_backend()` factory using `OCR_TEXT_BACKEND` env var. The new `OCR_TEXT_BACKEND` values `sqlite` / `mistral` are for the NEW port (page-text retrieval), distinct from the existing cell-recognition backends (`tesseract-vie` / `paddleocr`). Use a SEPARATE env var to avoid collision: `BCTC_PAGE_TEXT_BACKEND` (default `sqlite`).
- `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` — 5-state machine, `_is_continuous`, `_is_title_band`. MARKED FOR REMOVAL. No imports survive except the stateless constants listed in §3.1.
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` — imports `group_pages_into_units` from `bctc_page_grouper`. Post-removal: this import is deleted. The `_run_extraction` YOLO bbox grouping logic is removed. The LF-OVERLAY push (`LayoutFirstPushClient`) survives but no longer receives YOLO-derived layout data (it will be fed from refine results at a later phase — not in scope here). For this sprint, `_run_extraction` becomes a minimal pass-through: OCR only, no bbox grouping.
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — geometry table-stitching removed (see §3.1). The file itself may survive if it contains helpers used by `text_table_extractor.py`; dev-pdf-extractor must verify. The geometry-grouping section is removed; `text_table_extractor.py` is 0-byte-diff.
- `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` — the 42-test boundary machine from BCTC-TABLE-BOUNDARY. MARKED FOR DELETION. Test file and all tests it covers become orphan on grouper removal.

**mcp-server:**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — existing `bctc_table_rows` DDL uses columns `label` (not `row_label`), `period_current`, `period_prior`, `value_current`, `value_prior`. The BA spec FR-10 mentions `row_label`, `value_current`, `value_previous` — this is a spec naming drift. **Resolution (architect):** the parser output type `BctcTableRow` uses the LIVE schema column names: `label` (not `row_label`), `period_prior` / `value_prior` (not `value_previous`). The BA spec was using logical names; the schema is the authority.
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — NO `text_status` or `refine_status` column exists on `financial_reports` today. Both must be added via idempotent `ALTER TABLE IF NOT EXISTS` migration in `initFinancialReportsTables`. The `text_status` field tracks OCR completion (COMPLETE / IN_PROGRESS / PARTIAL); it is set by the pdf-extractor push pipeline (not in scope for this sprint — architect notes that an existing `audit_status` column covers some of this; however `text_status` is a new dedicated field for OCR lifecycle, not audit). The `refine_status` field tracks the refine job lifecycle.
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — the registration pattern is: one `import` line + one array entry in `toolRegistry`. No edits to `server.ts`. Confirmed for all 3 new tools.
- `apps/mcp-server/src/scheduler/cronConfig.ts` — existing cron jobs. New `bctcRefineJob` key must be added. The OFF-HOSE window (02:00-08:59 UTC Mon-Fri) is already documented for `bctcPdfPull` and others. The refine cron runs `'0 9,14,20 * * *'` UTC (09:00, 14:00, 20:00 UTC — all outside the 02:00-08:59 ban on weekdays, and no restriction on weekends). Dev-mcp-server picks the exact schedule; this is the architect recommendation.
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` — existing reparse/cron pattern. Refine job follows the same structure (pick pending, claim, process, release).
- The `task_claim` / `task_release` coordination tools are live (registered via `registerCoordinationTools`, Sprint task-lock Phase 1, entry #135-138 in registry). The refine orchestrator calls these via the MCP tool surface, not by importing the coordination store directly — but since the orchestrator runs inside mcp-server, it may call the coordination store directly via its infrastructure layer. **Architect resolution:** the orchestrator calls `task_claim` / `task_release` through the existing `coordinationTools.ts` logic by importing the underlying store directly (same pattern as other cron jobs that call infra stores), not via the MCP protocol. Kind value: `sprint-task` (commit-mutex-enum-drift workaround — `sprint-task` is a confirmed valid kind).

### 1.3 What Does NOT Exist Today

- `apps/pdf-extractor/infrastructure/page_rasterizer.py` — does not exist. Genuine new file.
- `data/bctc-page-images/` volume mount — does not exist. Needs Docker compose volume configuration.
- `apps/mcp-server/src/infrastructure/db/` — `bctc_refined_units` table does not exist.
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` — does not exist.
- `apps/mcp-server/src/interface/mcp/routes/` — `GET /api/rasterize` endpoint does not exist.
- `docs/agents/refine_bctc_md/` — agent does not exist.

---

## 2. Replace-Outright Manifest (FR-14)

The following MUST be removed from the live code path. They remain in git history.

| File | Action | Reason |
|---|---|---|
| `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` | Delete file | 5-state machine is the root cause of over-merge bug |
| Import `from infrastructure.bctc_page_grouper import ...` in `pek_engine_adapter.py` | Delete import + calling code | Replaced by agent refine |
| YOLO bbox grouping in `pek_engine_adapter.py._run_extraction` | Remove section | Agent classifies table boundaries; no geometry needed |
| Geometry table-stitching in `generic_md_table_extractor.py` | Remove section | Replaced by agent refine |
| `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py` | Delete file | 42-test machine is now orphan |
| `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py` | Delete file | Tests the deleted grouper; orphan |
| `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py` | Delete file | Tests convergence between PATH A/B via grouper; orphan |

**Page-window hint survival decision (D4):** The constants from `bctc_page_grouper.py` (`_CONTINUATION_MARKERS`, `_TITLE_BAND_SCAN_LINES`) are stateless text classifiers. The `classify_page_for_image_load` function (FR-5) uses similar heuristics. **Decision: the slimmed hint is absorbed into `classify_page_for_image_load` in the mcp-server orchestrator.** No surviving import of `bctc_page_grouper` is needed. The text patterns (continuation markers, column-header keywords) become inline constants in the orchestrator function.

**text_table_extractor.py:** 0-byte-diff. Not touched. The structured row extraction path (`bctc_table_rows` via text-table) is superseded by the new markdown→rows parser for future refined reports, but the file is not deleted (it may still serve as fallback for reports that have not yet been refined).

---

## 3. Technical Design

### 3.1 pdf-extractor Zone (dev-pdf-extractor)

#### 3.1.1 `page_rasterizer.py` (FR-1)

**File:** `apps/pdf-extractor/infrastructure/page_rasterizer.py`
**DDD layer:** infrastructure

```python
# Public API
def rasterize_page(pdf_path: str, report_id: str, page_number: int, dpi: int) -> Path:
    """Render page N (1-indexed) to PNG. Returns output path. Idempotent."""

def rasterize_report(pdf_path: str, report_id: str, dpi: int | None = None) -> list[Path]:
    """Rasterize all pages. Reads BCTC_RASTER_DPI env var if dpi is None."""
```

**Implementation notes:**
- `import fitz` (PyMuPDF). PyMuPDF is already in the pdf-extractor Dockerfile or must be added (`pip install pymupdf`). Dev must verify; if absent, add to `requirements.txt` only — do NOT touch PDF-Extract-Kit subtree.
- Output path: `/data/bctc-page-images/{report_id}/page_{N:04d}.png`. Directory created with `mkdir -p`. N is zero-padded 4 digits to sort correctly.
- Idempotency: `Path.exists()` check before render; re-render overwrites (idempotent by design per AC-FR1-3).
- `BCTC_RASTER_DPI` env var: `int(os.getenv("BCTC_RASTER_DPI", "150"))`.
- DDD: no domain imports. Zero network. Zero model weights.
- No FastAPI route here — rasterization is triggered by the on-demand endpoint (§3.1.3) and can also be called directly at extraction time.

#### 3.1.2 `OcrTextSourcePort` + Implementations (FR-2)

**Files:**
- `apps/pdf-extractor/domain/repositories.py` — add `OcrTextSourcePort` Protocol at the bottom of the existing file.
- `apps/pdf-extractor/infrastructure/ocr_text_source.py` — new file, two implementations.
- `apps/pdf-extractor/infrastructure/ocr_text_source_factory.py` — factory, reads `BCTC_PAGE_TEXT_BACKEND` env var.

**Domain port (`repositories.py` addition):**
```python
class OcrTextSourcePort(Protocol):
    """Port: retrieve per-page OCR text already stored in pdf_extracted_text."""
    def get_page_text(self, filename: str, page_number: int) -> str:
        """Return OCR text for (filename, page_number). Empty string if not found."""
        ...
```

**Implementations (`ocr_text_source.py`):**
- `SqliteOcrTextSource` — connects to `market.db` path (injected), queries `pdf_extracted_text` by `(filename, page_number)`, returns `text_content`. Uses `sqlite3` stdlib (NOT `bun:sqlite` — this is Python).
- `MistralOcrSource` — stub, raises `NotImplementedError("Mistral OCR not yet wired")`.

**Factory (`ocr_text_source_factory.py`):**
```python
def select_ocr_text_source(db_path: str) -> OcrTextSourcePort:
    backend = os.getenv("BCTC_PAGE_TEXT_BACKEND", "sqlite")
    if backend == "sqlite":
        return SqliteOcrTextSource(db_path)
    if backend == "mistral":
        return MistralOcrSource()
    raise ValueError(f"Unknown BCTC_PAGE_TEXT_BACKEND: {backend}")
```

Note: this port is used by the mcp-server `get_bctc_page_text` MCP tool, NOT directly in pdf-extractor code. The pdf-extractor exposes it via the HTTP API endpoint `/api/page-text` (§3.1.3). The port definition lives in pdf-extractor's domain because that is where OCR knowledge belongs — mcp-server reaches it via HTTP, not by importing Python.

#### 3.1.3 New HTTP Endpoints (pdf-extractor FastAPI)

**File to modify:** `apps/pdf-extractor/interface/handlers.py`

Two new route handlers:

**`POST /api/rasterize`** (FR-4 AC-FR4-2 on-demand rasterization contract, D5 resolved):
```
Request:  { "report_id": str, "filename": str, "pages": list[int] }
Response: { "rasterized": list[int], "paths": list[str] }
```
- Resolves `filename` to PDF path in `data/pdfs/`.
- Calls `rasterize_page()` for each missing page only (idempotent).
- Returns list of rasterized page numbers. No error on already-present pages.
- Auth: none (internal service, same Docker network).

**`GET /api/page-text`** (supporting `get_bctc_page_text` MCP tool):
```
Query:    ?filename=<str>&page_number=<int>
Response: { "text": str, "source": "sqlite_ocr" | "mistral_ocr" }
```
- Uses `SqliteOcrTextSource` to read `pdf_extracted_text`.
- Returns `{ "text": "" }` (not 404) when no text found.

**Note:** mcp-server calls these endpoints via the existing `pdfExtractorClient.ts` HTTP client pattern. Dev-mcp-server adds two new methods to the client.

### 3.2 mcp-server Zone (dev-mcp-server)

#### 3.2.1 Schema Migration (FR-9, FR-12-AC-FR12-3)

**File:** `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`

Add inside `initFinancialReportsTables()` after existing migrations:

```typescript
// ── BCTC-AGENTIC-REFINE: bctc_refined_units table ────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bctc_refined_units (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id         TEXT    NOT NULL,
    unit_id           TEXT    NOT NULL,
    page_numbers_json TEXT    NOT NULL,
    markdown          TEXT    NOT NULL,
    row_count         INTEGER NOT NULL DEFAULT 0,
    confidence        REAL    NOT NULL DEFAULT 0.0,
    flags             TEXT,
    refined_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(report_id, unit_id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bru_report ON bctc_refined_units(report_id)`);

// ── BCTC-AGENTIC-REFINE: text_status + refine_status on financial_reports ────
try {
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(financial_reports)").all();
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has("text_status")) {
    db.exec("ALTER TABLE financial_reports ADD COLUMN text_status TEXT NOT NULL DEFAULT 'COMPLETE'");
    // Existing rows have completed OCR — default COMPLETE is correct.
  }
  if (!colNames.has("refine_status")) {
    db.exec("ALTER TABLE financial_reports ADD COLUMN refine_status TEXT NOT NULL DEFAULT 'PENDING'");
    // Existing rows need refine — default PENDING is correct.
  }
} catch {
  // fresh DB — columns included via SQLITE_DDL or table does not yet exist
}
```

**Column conventions:**
- `text_status`: `COMPLETE` | `IN_PROGRESS` | `PARTIAL` — set by the pdf-extractor push pipeline when OCR finishes. Existing rows get `COMPLETE` (correct default: they have already-extracted `pdf_extracted_text`).
- `refine_status`: `PENDING` | `IN_PROGRESS` | `DONE` | `FAILED` | `PARTIAL` — set by the refine orchestrator. Existing rows get `PENDING` (correct: they need to be refined).

**Verification:** dev-mcp-server runs `PRAGMA table_info(financial_reports)` in a test to confirm both columns exist after migration.

#### 3.2.2 `get_bctc_page_text` MCP Tool (FR-3)

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts`

```typescript
// Input schema
{ report_id: z.string(), page_number: z.number().int().min(1) }
// Output: { text: string, source: "sqlite_ocr" | "mistral_ocr" } | { error: string }
```

**Implementation chain:**
1. Query `financial_reports` by `id = report_id` to get `filename` (the PDF filename, not the path). This join already exists in the codebase (`fetchParseAndStoreBctc.ts` patterns).
2. Call pdf-extractor `GET /api/page-text?filename={filename}&page_number={page_number}` via the existing `pdfExtractorClient`.
3. Return result or `{ error }` — never throws.

**DDD layer:** interface. Zero DB writes. Delegates to pdf-extractor for text retrieval.

**Registry:** add `import { registerGetBctcPageTextTool } from "./financial-reports/getBctcPageTextTool.js"` + one array entry in `toolRegistry`.

#### 3.2.3 `get_bctc_page_image` MCP Tool (FR-4)

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageImageTool.ts`

```typescript
// Input schema
{
  report_id: z.string(),
  pages: z.array(z.number().int().min(1)).min(1).max(BCTC_IMAGE_PAGE_CAP)
}
// BCTC_IMAGE_PAGE_CAP = parseInt(Bun.env.BCTC_IMAGE_PAGE_CAP ?? "3")
// Output: { images: Array<{ page: number, base64_png: string }> } | { error: string }
```

**D3 resolved (page cap):** Hard cap = 3 pages (default). Rationale: at 150 DPI a BCTC A4 page PNG is ~200-400KB raw; base64 adds ~33%; 3 pages ≈ 1.2-1.6MB in the tool response, within MCP transport limits. The cap is configurable via `BCTC_IMAGE_PAGE_CAP` env var for future tuning.

**Implementation chain:**
1. Query `financial_reports` by `id = report_id` → get `filename` and resolve the `report_id`.
2. Read PNGs from `data/bctc-page-images/{report_id}/page_{N:04d}.png` on the shared volume.
3. If a page PNG is missing → call `POST /api/rasterize` on pdf-extractor (on-demand rasterization), wait for response, then read the PNG.
4. Base64-encode each PNG via `Buffer.from(fs.readFileSync(path)).toString("base64")`.
5. Return array. If any page fails after on-demand rasterize attempt → include `{ error }` for that page, do not fail the whole call.

**DDD layer:** interface. Reads shared volume directly (infrastructure side-effect) — acceptable for a tool handler (interface layer may read infra directly per DDD for read-only file access).

**Registry:** same pattern.

#### 3.2.4 `classify_page_for_image_load` (FR-5)

**File:** `apps/mcp-server/src/application/usecases/bctcRefineOrchestrator.ts` (in the same file as the orchestrator, or extracted to `apps/mcp-server/src/application/utils/pageClassifier.ts`)

**DDD layer:** application (pure function, no I/O, unit-testable).

```typescript
const TABLE_STRUCTURAL_TOKENS = /\||\d[\d\s]*\d{3,}/;
const VN_COLUMN_HEADERS = /Mã số|Thuyết minh|Số cuối|Số đầu|chỉ tiêu/i;

export function classifyPageForImageLoad(
  ocrText: string,
  prevPageWasImage: boolean,
): boolean {
  if (TABLE_STRUCTURAL_TOKENS.test(ocrText)) return true;
  if (VN_COLUMN_HEADERS.test(ocrText)) return true;
  if (prevPageWasImage && TABLE_STRUCTURAL_TOKENS.test(ocrText)) return true;
  // Continuation window: prev was image → check if continuation markers present
  if (prevPageWasImage) {
    const continuationMarkers = /tiếp theo|continued/i;
    if (continuationMarkers.test(ocrText)) return true;
  }
  return false;
}
```

**Unit tests (required):**
- AC-FR5-1: page with `|` → true.
- AC-FR5-2: page with `Mã số` → true.
- AC-FR5-3: pure prose, `prevPageWasImage=false` → false.
- AC-FR5-4 (integration): refine orchestrator only calls `get_bctc_page_image` for pages where classification is true.

**Target image-load ratio** on real BCTC pages: architect estimates ~40-55% based on FPT structure (46 pages: ~20-25 cover/notes/prose, ~20-25 statement tables). Target < 60% per FR-5 AC-FR5-5 is achievable.

#### 3.2.5 Markdown → `bctc_table_rows` Parser (FR-10)

This is the highest-risk component. The design must be airtight.

**File:** `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts`
**DDD layer:** application (pure function, deterministic, no I/O).

**Contract:**
```typescript
export interface BctcTableRow {
  report_id: string;
  statement_section: string;  // e.g. "balance_sheet", "income_statement", "cash_flow"
  row_order: number;
  code: string | null;        // maps to bctc_table_rows.code
  label: string;              // NOT row_label — matches live schema column name
  period_current: string;
  value_current: number | null;
  period_prior: string | null;
  value_prior: number | null;  // NOT value_previous — matches live schema
  unit: string;               // default "billion_vnd"
  page_number: number;
  source_confidence: number;  // 0.0–1.0
  is_summary_row: number;     // 0 or 1
}

export interface ParseResult {
  rows: BctcTableRow[];
  errors: string[];
}

export function parseRefinedMarkdown(
  markdown: string,
  report_id: string,
  page_numbers: number[],  // from bctc_refined_units.page_numbers_json
): ParseResult;
```

**Algorithm (deterministic, no ML):**

1. **Section header detection:** scan for Vietnamese statement headers:
   - `BẢNG CÂN ĐỐI KẾ TOÁN` → `balance_sheet`
   - `BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH` → `income_statement`
   - `BÁO CÁO LƯU CHUYỂN TIỀN TỆ` → `cash_flow`
   - `THUYẾT MINH BÁO CÁO TÀI CHÍNH` → `notes`
   - Default: `general` if no header matched above.

2. **Pipe-table row parsing:** for each line matching `/^\|.+\|$/`:
   - Split on `|`, trim cells.
   - Skip header rows (line after `|---|---|...`).
   - Column detection: assume columns are `[code?, label, value_current, value_prior?]`. The refined agent emits a consistent 4-column format: `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |`. Header row detection by checking if all numeric cells are absent (header row) or if a `---` separator follows.

3. **Vietnamese number normalization:**
   ```typescript
   function parseVnNumber(raw: string): number | null {
     const cleaned = raw.trim().replace(/\./g, "").replace(/,/g, ".");
     const n = parseFloat(cleaned);
     return isNaN(n) ? null : n;
   }
   ```
   Rule: Vietnamese thousands separator is `.`; decimal separator is `,`. Remove all `.`, replace `,` with `.`, then parse.

4. **Trust flag parsing:**
   - `[ĐỘ TIN CẬY THẤP — {reason}]` in any cell → `source_confidence = 0.2`, append `"high_discrepancy:{reason}"` to flags.
   - `[độ tin cậy thấp]` in any cell → `source_confidence = 0.4`, append `"minor_discrepancy"` to flags.
   - No flag → `source_confidence = 1.0`.
   - Trust flag is stripped from the cell value before numeric parsing.

5. **Error handling:** if a row is malformed (wrong column count, non-numeric value where number expected), record in `errors[]` and skip the row. NEVER insert partial rows. This implements AC-FR10-4 (DV test).

6. **`is_summary_row`:** heuristic: if `code` is null and `label` is ALL-CAPS → `1` (summary/total row). Otherwise `0`.

7. **`page_number`:** use `page_numbers[0]` for single-page units; for multi-page, assign rows to `page_numbers[0]` (the owning unit's first page). This is a simplification — QA verifies with FPT span [22,23].

**DV Test (mandatory, AC-FR10-4):**

File: `apps/mcp-server/src/__tests__/AR-parser-dv.test.ts`

Test must be committed with `RED_BEFORE = true` guard comment, then the implementation makes it GREEN:
```typescript
// DV-1: malformed markdown (missing value columns) → empty rows, errors[] non-empty
const result = parseRefinedMarkdown("| Mã số | Chỉ tiêu |\n|---|---|\n| 100 | Tiền |", "rpt1", [1]);
expect(result.rows).toHaveLength(0);
expect(result.errors.length).toBeGreaterThan(0);

// DV-2: well-formed 5-row table → exactly 5 rows, correct values
// DV-3: red trust flag → source_confidence = 0.2
// DV-4: yellow trust flag → source_confidence = 0.4
// DV-5: Vietnamese number "1.234.567" → 1234567
```

#### 3.2.6 `bctcRefineOrchestrator.ts` (FR-12) — UPDATED: parallel fan-out per §0.6

**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`
**DDD layer:** application (orchestration use case)

**Fan-out orchestration state machine (amended per §0.6):**

The orchestrator runs in 4 sequential phases. No subagent touches the DB — all writes are orchestrator-owned.

```typescript
async function refineOneReport(db: Database, reportId: string): Promise<void> {
  // ── Phase 0: claim + readiness gate ──────────────────────────────────────
  const claimed = await claimTask(db, `bctc-refine-${reportId}`, "sprint-task", "refine-orchestrator", 3600);
  if (!claimed) { logger.info(`[refine] skip ${reportId} — already claimed`); return; }

  try {
    const row = db.query<{text_status: string}, [string]>(
      "SELECT text_status FROM financial_reports WHERE id = ?"
    ).get(reportId);
    if (!row || row.text_status === "IN_PROGRESS" || row.text_status === "PARTIAL") {
      logger.info(`[refine] skip ${reportId} — text_status=${row?.text_status}`);
      return;
    }
    db.exec(`UPDATE financial_reports SET refine_status='IN_PROGRESS' WHERE id=?`, [reportId]);

    // ── Phase 1: window partition (sequential, O(n) pages) ───────────────────
    // Must complete fully BEFORE any subagent is spawned.
    // Continuation tables MUST NOT be split across window boundaries.
    const pageTexts = await fetchAllPageTexts(reportId);  // get_bctc_page_text per page
    const windows = partitionIntoWindows(pageTexts, {
      maxWindowPages: parseInt(Bun.env.REFINE_MAX_WINDOW_PAGES ?? "3"),
    });
    // windows: Array<{ unit_id: string, page_numbers: number[], texts: string[], needsImage: boolean[] }>
    // partitionIntoWindows: scans continuation markers; never splits a table.
    // needsImage[i]: classifyPageForImageLoad result for page i within the window.

    // ── Phase 2: fan-out — spawn one Haiku subagent per window ───────────────
    // Bounded concurrency pool. DB is NOT touched during this phase.
    const concurrency = parseInt(Bun.env.REFINE_FANOUT_CONCURRENCY ?? "5");
    const windowTimeout = parseInt(Bun.env.REFINE_WINDOW_TIMEOUT_S ?? "120") * 1000;
    const rawResults = await runBoundedPool(windows, concurrency, async (win) => {
      return spawnWindowSubagent(reportId, win, windowTimeout);
      // Returns: { unit_id, page_numbers_json, markdown, confidence, flags, status: "DONE"|"FAILED" }
      // On timeout/error: returns { ...win, markdown:"", confidence:0.0, flags:["timeout"|"agent_error:..."], status:"FAILED" }
      // NEVER throws — failure is captured in status.
    });

    // ── Phase 3: aggregate → determine report-level status ───────────────────
    const anyDone   = rawResults.some(r => r.status === "DONE");
    const anyFailed = rawResults.some(r => r.status === "FAILED");
    const reportStatus = !anyFailed ? "DONE" : anyDone ? "PARTIAL" : "FAILED";

    // ── Phase 4: collect-then-write (single-threaded, transactional) ─────────
    // bctc_refined_units: DELETE-then-INSERT for ALL windows (including FAILED ones).
    db.transaction(() => {
      db.exec(`DELETE FROM bctc_refined_units WHERE report_id=?`, [reportId]);
      for (const r of rawResults) {
        db.exec(
          `INSERT INTO bctc_refined_units
             (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [reportId, r.unit_id, JSON.stringify(r.page_numbers), r.markdown,
           r.markdown ? countRows(r.markdown) : 0,
           r.confidence, JSON.stringify(r.flags), r.status]
        );
      }
    })();

    // bctc_table_rows: parse DONE windows only; FAILED windows contribute nothing.
    db.transaction(() => {
      db.exec(`DELETE FROM bctc_table_rows WHERE report_id=?`, [reportId]);
      for (const r of rawResults.filter(r => r.status === "DONE")) {
        const balanceResult = checkBalance([r]);  // per-unit balance catch-net
        const parsed = parseRefinedMarkdown(r.markdown, reportId, r.page_numbers);
        for (const tableRow of parsed.rows) {
          db.exec(`INSERT INTO bctc_table_rows ...`, [...tableRow fields...]);
        }
      }
    })();

    db.exec(`UPDATE financial_reports SET refine_status=? WHERE id=?`, [reportStatus, reportId]);

  } catch (err) {
    db.exec(`UPDATE financial_reports SET refine_status='FAILED' WHERE id=?`, [reportId]);
    throw err;
  } finally {
    await releaseTask(db, `bctc-refine-${reportId}`, "refine-orchestrator");
  }
}
```

**Key design invariants from §0.6 (binding on dev-mcp-server):**

1. `partitionIntoWindows` runs to completion before the first subagent spawns — no interleaving.
2. Subagents are read-only with respect to the DB and shared state. They write only to the output exchange point (`docs/refine-output/{report_id}/{unit_id}.json` or equivalent; orchestrator reads and deletes).
3. `runBoundedPool` never spawns more than `REFINE_FANOUT_CONCURRENCY` simultaneously. A semaphore or p-limit-style queue is the implementation pattern.
4. ALL windows (DONE and FAILED) are written to `bctc_refined_units` in Phase 4 — FAILED windows are visible via `get_bctc_refined`, not silently dropped.
5. `bctc_table_rows` parse runs only on DONE windows, inside Phase 4's second transaction.

**`window_status` column:** see §0.6.5 — added to `bctc_refined_units` DDL in §3.2.1.

**Cron schedule:** `'0 9,14,20 * * *'` UTC. All three times are outside 02:00-08:59 UTC Mon-Fri. Off-HOSE guard verified:
- 09:00 UTC = 16:00 GMT+7 → market is closed (HOSE closes 15:00 GMT+7). Safe.
- 14:00 UTC = 21:00 GMT+7. Safe.
- 20:00 UTC = 03:00 GMT+7 next day. Safe.

**On-demand path:** `POST /api/refine-bctc/{report_id}` handler calls `refineOneReport()` directly.

**Idempotency proof (AC-FR9-2, AC-FR12-2):**
- Phase 4 DELETE-then-INSERT covers ALL windows atomically. A re-run (including PARTIAL → DONE re-run) produces a stable final state.
- Test: run `refineOneReport()` 3 times on FPT in-memory DB; assert `COUNT(*) FROM bctc_refined_units WHERE report_id='FPT'` is stable and equals `windows.length` after each run.

#### 3.2.7 `get_bctc_refined` MCP Tool (FR-11)

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcRefinedTool.ts`

```typescript
{ report_id: z.string() }
// Output: { units: Array<{ unit_id, page_numbers, markdown, flags }> } | { error }
```

Reads from `bctc_refined_units`. Returns `{ error }` if no rows found. Never throws.
Registry: same pattern.

#### 3.2.8 `orchestrator → agent spawn` contract (amended for fan-out)

The refine orchestrator spawns ONE `refine_bctc_md` Haiku subagent **per window**, all running in parallel (bounded by `REFINE_FANOUT_CONCURRENCY`). Spawn mechanism: existing `claude` CLI subprocess pattern used by other fleet agents.

**Per-window invocation:** the orchestrator passes each subagent a focused payload:
- The window's OCR page text(s).
- Image base64 (only for pages where `classifyPageForImageLoad` is true within the window).
- The relevant sub-flow path (table-page, prose-page, or continuation-stitch).
- The refine contract (static, cached — see §3.3.1 prompt-caching note).

**Output exchange (per-window, not per-report):** each subagent writes its single-window result to:
```
docs/refine-output/{report_id}/{unit_id}.json
```
Schema: `{ unit_id, page_numbers_json, markdown, confidence, flags }`.

The orchestrator watches for this file (or awaits the subprocess exit), reads it, and marks the window result. The orchestrator deletes the file after reading. On subprocess timeout, the orchestrator marks the window FAILED without waiting for a file.

**Output directory:** `docs/refine-output/{report_id}/` (in-container, not volume-mounted externally). The orchestrator creates the directory before spawning and removes it entirely after Phase 4 collect-then-write completes.

**No subagent writes to DB.** All DB writes happen in Phase 4 of the orchestrator, after all windows are collected (§3.2.6).

### 3.3 Agent Zone (agent-father)

#### 3.3.1 `refine_bctc_md` Agent (FR-6, FR-7, FR-13)

**File:** `docs/agents/refine_bctc_md/init.md`
**Frontmatter must start on line 1** (project_agent_frontmatter_line1 memory).

**Model tier decision (D2 resolved + §0.2 user directive):**

Runtime model: **claude-haiku-3-5**. Flow authoring (one-time): **Opus** (agent-father runs Opus to write logic + worked examples in all sub-flow files; Haiku never writes its own flows).

Rationale:
- The refine contract is fully deterministic: numbers from text, structure from image, flag disagreements. A well-authored flow (Opus-written, with worked examples) leaves no ambiguity for Haiku at runtime.
- Haiku at ~150 DPI crisp vector images performs well on table OCR verification (the images are NOT blurry scans).
- At ~8K tokens/page (text + image) × 46 pages, Haiku keeps cost per report under $0.50 estimated. Sonnet would be 5× more expensive per token.
- QA bake-off measures actual token consumption on FPT + ACB and flags if Haiku accuracy is unacceptable (>10% of cells require red flags page-wide → QA escalates to architect, who re-evaluates DPI + flow instructions; NOT an automatic runtime escalation to Sonnet for refine).
- Sub-flows run in PARALLEL per page-window via the bounded fan-out pool (§0.6.2). Each subagent instance handles exactly one window — independent pages run fully concurrently up to `REFINE_FANOUT_CONCURRENCY`. Continuation windows are guaranteed to land in ONE subagent (§0.6.1). This parallelism is the primary cost lever: a 46-page FPT report with concurrency=5 processes in ~10 parallel batches instead of 46 sequential calls.

**Frontmatter:**
```yaml
---
agent:
  id: refine_bctc_md
  model: claude-haiku-3-5          # RUNTIME model — Haiku executes per-page. See §0.2.
  authored_by: claude-opus-4       # agent-father uses Opus to write flow files (one-time, not per-report)
  description: BCTC page refine agent. Reads OCR text + page images. Produces trusted markdown per FR-13 contract.
  tools:
    - get_bctc_page_text
    - get_bctc_page_image
  output: docs/refine-output/{report_id}/{unit_id}.json   # per-window output; orchestrator collects all, then deletes
```

**Flow decomposition — MULTIPLE small focused sub-flows (Opus authors once; Haiku executes per page):**

Agent-father writes FOUR sub-flow files. Each is narrow, self-contained, includes worked examples in Vietnamese.

**Sub-flow A: `flow/table-page.md`** (the core flow — most pages)

Purpose: process one table-dense page. Input: OCR text + page image. Output: trusted pipe-table markdown.

Contract (verbatim, must appear in the system prompt block):
```
REFINE CONTRACT — MANDATORY, NOT OPTIONAL:
1. Numbers ← OCR text (get_bctc_page_text). These are the numeric source of record.
2. Structure / column boundaries / row labels ← image (get_bctc_page_image). Read table layout from the image.
3. Text ≠ image on a number: FLAG immediately. NEVER silently pick one.
   - High discrepancy or unsure which is correct: [ĐỘ TIN CẬY THẤP — {specific reason}]
   - Minor discrepancy, text chosen: [độ tin cậy thấp]
4. Balance check (assets = liab + equity) is a catch-net ONLY. A passing balance does NOT clear a flagged number.
```

Worked example (Vietnamese, included in flow):
```markdown
OCR text cell: "1.234.567"  (meaning 1,234,567 thousand VND — dot is thousands separator)
Image cell shows: "1 234 567" or "1.234.567"
→ Agreement: emit value as-is in pipe table cell: 1234567
→ Disagreement example: OCR "1.234.567", image "1.345.678"
  → Emit: [ĐỘ TIN CẬY THẤP — OCR 1234567 vs image 1345678] in value cell
```

Output format: one pipe-table markdown block. Header row = `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |`.

**Sub-flow B: `flow/prose-page.md`**

Purpose: process a prose/notes page (no table structure detected). Input: OCR text only (no image call needed — `classifyPageForImageLoad` returned false). Output: clean paragraph text (no pipe tables). Instruction: extract key numerical disclosures as `**Label:** value` pairs for the narrative passes.

This is the cheapest flow: text-only, no image token cost.

**Sub-flow C: `flow/continuation-stitch.md`**

Purpose: handle a multi-page table that continues across two or more pages. Input: OCR text for pages N and N+1 (or N, N+1, N+2) + images for those pages. Output: ONE unified pipe-table with continuation rows appended to the first page's table. No duplicate header row.

Critical instruction: detect the continuation marker (`tiếp theo` / `continued`) in page N+1's header → suppress N+1's table header and merge rows into page N's table. The merged unit gets `page_numbers_json = [N, N+1]`.

Worked example: FPT span [22, 23] — include a synthetic example showing two partial tables stitching into one complete table with no double header.

**Sub-flow D: `flow/disagreement-verify.md`**

Purpose: re-examine a previously flagged cell when the orchestrator requests a second look (AC-FR13-2 orchestrator cross-check). Input: the specific flagged cell context (OCR text excerpt + image crop indicator). Output: `{ confirmed: boolean, best_value: number | null, flag: string }`. The orchestrator calls this sub-flow after the main refine pass when it detects unflagged numeric discrepancies by re-reading OCR text.

**Prompt caching (FR-7):**

The system prompt (refine contract + column format + worked examples) is the same across all page calls in a report session. The agent must structure its prompt so the static system block is cacheable. Claude prompt caching uses the `cache_control` breakpoint on the system message. Agent-father encodes this in the agent init.md instructions: "The refine contract block is the system prompt. Do not repeat it in each user turn. It is sent once and cached."

**DPI decision (D1, FR-8 resolved):**

Architect initial recommendation: **150 DPI** as the baseline default. Rationale: at 150 DPI, A4 page (210×297mm) rasterizes to 1240×1754 pixels — sufficient for Haiku vision to distinguish Vietnamese diacritics in 10pt font tables. QA bake-off tests at 100, 120, 150 DPI per FR-8 AC-FR8-1. If 100 DPI passes (< 10% of cells flagged low-confidence), it becomes the default. If 100 DPI fails, try 120, then 150.

**Volume mount for PNG sharing:**

The Docker Compose must mount the same named volume at:
- pdf-extractor: `/data/bctc-page-images` (write path from rasterizer)
- mcp-server: `/data/bctc-page-images` (read path for `get_bctc_page_image`)

Dev-ops adds the volume declaration. The path `data/bctc-page-images/{report_id}/page_{N:04d}.png` is the canonical shared path.

---

## 4. DDD Layer Summary

| Component | Layer | Service |
|---|---|---|
| `OcrTextSourcePort` | domain | pdf-extractor |
| `page_rasterizer.py` | infrastructure | pdf-extractor |
| `SqliteOcrTextSource` / `MistralOcrSource` | infrastructure | pdf-extractor |
| `/api/rasterize`, `/api/page-text` handlers | interface | pdf-extractor |
| `classifyPageForImageLoad()` | application | mcp-server |
| `bctcRefineOrchestrator` / `bctcRefineJob.ts` | application | mcp-server |
| `parseRefinedMarkdown()` | application | mcp-server |
| `bctc_refined_units` DDL | infrastructure | mcp-server |
| `get_bctc_page_text` tool | interface | mcp-server |
| `get_bctc_page_image` tool | interface | mcp-server |
| `get_bctc_refined` tool | interface | mcp-server |
| `refine_bctc_md` agent `.md` | interface (agent-father domain) | agents |
| Refine contract enforcement | domain | mcp-server + agent |

**DDD violation check:** NONE. pdf-extractor domain never imports mcp-server. mcp-server accesses pdf-extractor via HTTP only. The new `OcrTextSourcePort` in pdf-extractor domain imports nothing from infrastructure (pure Protocol). `parseRefinedMarkdown` is pure application — no DB import, no HTTP.

---

## 5. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| `bctc_table_rows` column name drift (BA spec used `row_label`/`value_previous`; live schema has `label`/`value_prior`) | HIGH | Architect resolved: use live schema names. Parser type `BctcTableRow` uses `label` + `value_prior`. Dev-mcp-server must NOT introduce `row_label` column. |
| `text_status` not in live `financial_reports` — orchestrator picks reports by `text_status = 'COMPLETE'` | HIGH | Migration adds `text_status` with default `'COMPLETE'` for existing rows. Confirmed safe default (existing rows have completed OCR in `pdf_extracted_text`). |
| `BCTC_PAGE_TEXT_BACKEND` vs existing `OCR_TEXT_BACKEND` name collision | MEDIUM | Use distinct env var names: `BCTC_PAGE_TEXT_BACKEND` (page-text retrieval) vs `OCR_TEXT_BACKEND` (cell recognition). Dev-pdf-extractor must not reuse the existing var name. |
| Parser silent partial-row insertion on malformed input | HIGH (the DV gate) | DV test mandated RED-before/GREEN-after. Parser returns `{ rows: [], errors: [...] }` on malformed input; orchestrator skips DB write and sets `row_count=0, flags=["parser_error"]`. |
| FPT-42 double-emit on continuation (page 23 emitted twice) | HIGH | DELETE-then-INSERT transaction eliminates dupes. Idempotency test ≥3× mandatory. continuation-stitch sub-flow produces ONE unit for [22,23]. |
| Haiku vision accuracy on 100 DPI: Vietnamese diacritics may be unreadable | MEDIUM | Bake-off at 100/120/150 DPI as gating test. Default 150 until proven otherwise. |
| `pek_engine_adapter.py` removal of YOLO grouping may break the LF-OVERLAY push | MEDIUM | The LF-OVERLAY push client (`LayoutFirstPushClient`) continues to exist but will receive empty/minimal payload after YOLO removal. For this sprint, `pushBctcLayout` is effectively a no-op (no YOLO data). Refined units render in the viewer via `bctc_refined_units` — the viewer overlay contract will need a future update (NOT in scope for this sprint). Flag in PM handoff. |
| Volume mount not configured in Docker Compose | HIGH | Dev-ops adds `bctc-page-images` named volume to both services before any refine test. Without it, mcp-server cannot read PNGs. |
| Orphaned tests (42-test boundary machine) cause CI failure after file deletion | MEDIUM | Dev-pdf-extractor deletes test files listed in §2 alongside the production files. CI must pass after deletion. |
| `task_claim` kind `sprint-task` workaround (commit-mutex-enum-drift memory) | LOW | Confirmed: `sprint-task` is a valid kind in the live enum. Orchestrator uses `bctc-refine-{report_id}` as the claim key, kind `sprint-task`. |

---

## 6. Test Strategy

| Layer | Test type | File / Location | What it proves |
|---|---|---|---|
| parser unit | unit | `src/__tests__/AR-parser-dv.test.ts` | DV: malformed → empty; 5-row → 5 rows; flags → confidence scores; VN number |
| `classifyPageForImageLoad` | unit | `src/__tests__/AR-page-classifier.test.ts` | AC-FR5-1/2/3 |
| `bctc_refined_units` idempotency | integration | `src/__tests__/AR-refined-units-idempotency.test.ts` | ≥3× runs → stable COUNT; DV: second write does not dupe |
| readiness gate | unit | `src/__tests__/AR-refine-readiness-gate.test.ts` | IN_PROGRESS text_status → skip, no write |
| `page_rasterizer.py` | unit | `__tests__/unit/test_page_rasterizer.py` | idempotent PNG output; DPI from env |
| `SqliteOcrTextSource` | unit | `__tests__/unit/test_ocr_text_source.py` | reads correct row by (filename, page_number) |
| schema migration | integration | `src/__tests__/AR-schema-migration.test.ts` | `text_status` + `refine_status` columns exist after migration; idempotent second run |
| bake-off metrics | QA | Manual / scripted | Token count, image-load ratio, continuation correctness, balance check (FR-15) |

---

## 7. Files to Create / Modify / Delete

### pdf-extractor (dev-pdf-extractor)

**Create:**
- `apps/pdf-extractor/infrastructure/page_rasterizer.py`
- `apps/pdf-extractor/infrastructure/ocr_text_source.py`
- `apps/pdf-extractor/infrastructure/ocr_text_source_factory.py`
- `apps/pdf-extractor/__tests__/unit/test_page_rasterizer.py`
- `apps/pdf-extractor/__tests__/unit/test_ocr_text_source.py`

**Modify:**
- `apps/pdf-extractor/domain/repositories.py` — add `OcrTextSourcePort` Protocol
- `apps/pdf-extractor/interface/handlers.py` — add `/api/rasterize` + `/api/page-text` routes
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` — remove YOLO grouping import + call
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — remove geometry stitching section
- `apps/pdf-extractor/requirements.txt` — add `pymupdf` if not present (check first)

**Delete:**
- `apps/pdf-extractor/infrastructure/bctc_page_grouper.py`
- `apps/pdf-extractor/__tests__/unit/test_table_boundary_state_machine.py`
- `apps/pdf-extractor/__tests__/unit/test_anti_drift_grouper.py`
- `apps/pdf-extractor/__tests__/unit/test_grouping_convergence.py`

### mcp-server (dev-mcp-server)

**Create:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageTextTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPageImageTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcRefinedTool.ts`
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts`
- `apps/mcp-server/src/application/utils/pageClassifier.ts`
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`
- `apps/mcp-server/src/interface/mcp/routes/bctcRefineHandler.ts` (on-demand POST)
- `apps/mcp-server/src/__tests__/AR-parser-dv.test.ts`
- `apps/mcp-server/src/__tests__/AR-page-classifier.test.ts`
- `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts`
- `apps/mcp-server/src/__tests__/AR-refine-readiness-gate.test.ts`
- `apps/mcp-server/src/__tests__/AR-schema-migration.test.ts`

**Modify:**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — add `bctc_refined_units` DDL + `text_status`/`refine_status` migration
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — add 3 new tool imports + array entries
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` — add 3 new exports
- `apps/mcp-server/src/scheduler/cronConfig.ts` — add `bctcRefineJob` key
- `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` — add `rasterizePages()` + `getPageText()` methods

### agents (agent-father)

**Create — refine_bctc_md (NEW agent, model: haiku runtime, Opus-authored flows):**
- `docs/agents/refine_bctc_md/init.md` (frontmatter on line 1; `model: claude-haiku-3-5`)
- `docs/agents/refine_bctc_md/flow/main.md` — dispatcher → select sub-flow
- `docs/agents/refine_bctc_md/flow/table-page.md` — `model: claude-haiku-3-5`
- `docs/agents/refine_bctc_md/flow/prose-page.md` — `model: claude-haiku-3-5`
- `docs/agents/refine_bctc_md/flow/continuation-stitch.md` — `model: claude-haiku-3-5`
- `docs/agents/refine_bctc_md/flow/disagreement-verify.md` — `model: claude-haiku-3-5`

**Agent-father authoring requirement:** all flow files above must be written by agent-father using Opus as its authoring session model (one-time authoring sprint task). Flow files declare `model: claude-haiku-3-5` — Haiku runs them at runtime.

**Create — bctc-analyst retier (EXISTING agent, new sub-flow + model update; §0.5):**
- `docs/agents/bctc-analyst/flow/deep-dive-opus.md` — `model: claude-opus-4`; escalation sub-flow; gated by ESC-1 through ESC-5 (§0.3)

**Modify — bctc-analyst (EXISTING agent):**
- `docs/agents/bctc-analyst/init.md` — update `model:` field to `claude-sonnet-4-5` (agent-father reads live value first; only changes if it differs; no other edits)
- `docs/agents/bctc-analyst/flow/main.md` — add escalation gate block after all standard passes: deterministic ESC-1..ESC-5 evaluation → if any fires, call `deep-dive-opus.md` sub-flow; append Opus output JSON to analysis result

### docker / ops

- `docker-compose.yml` — add `bctc-page-images` named volume, mount in both pdf-extractor and mcp-server at `/data/bctc-page-images`.

---

## 8. Decisions Resolved

| Decision | Resolution |
|---|---|
| D1: Minimum DPI | Initial default: **150 DPI**. QA bake-off tests 100→120→150; lowest passing becomes default. |
| D2: Refine runtime model | **claude-haiku-3-5** runtime. Opus is authoring-only (agent-father uses Opus to write all flow files once; Haiku executes per-page at runtime). Multiple Haiku sub-flows may run in parallel per page-window. |
| D2b: Analyze baseline model | **claude-sonnet-4-5** for all 6 standard bctc-analyst passes. No subjective escalation — deterministic only. |
| D2c: Analyze escalation model | **claude-opus-4** deep-dive sub-flow, gated by ESC-1..ESC-5 (§0.3). Fires at most once per analysis run. |
| D3: Page cap for `get_bctc_page_image` | **3 pages** (env `BCTC_IMAGE_PAGE_CAP`, default 3). |
| D4: Page-window hint survival | ABSORBED into `classifyPageForImageLoad()` in mcp-server. `bctc_page_grouper.py` fully deleted. |
| D5: `/api/rasterize` endpoint contract | `POST /api/rasterize` with `{ report_id, filename, pages }` → `{ rasterized, paths }`. Internal only. |
| Schema naming drift (`row_label`) | Use live schema: `label`, `value_prior`, `period_prior`. Parser type `BctcTableRow` matches live columns. |
| `text_status` not in live schema | Migration adds it with default `'COMPLETE'` for existing rows. |
| `BCTC_PAGE_TEXT_BACKEND` env var | Use distinct name from `OCR_TEXT_BACKEND` (cell recognition). |
| `task_claim` kind | `sprint-task` (confirmed valid per commit-mutex-enum-drift memory). |
| Fan-out unit | Page-window (not bare page). Continuation tables land in ONE window. Sequential partition scan before any spawn. |
| Fan-out concurrency | `REFINE_FANOUT_CONCURRENCY` env var, default 5. Bounded pool, not unlimited parallel. |
| Fan-out write pattern | Collect-then-write. No subagent touches DB. Single transactional Phase 4 after all windows complete. |
| Partial report semantics | `PARTIAL` = some windows DONE, some FAILED. Stored and re-eligible on next cron. FAILED windows written with `confidence=0.0` — never silently dropped. |
| Fan-out mechanism | ~~Dev-mcp-server chooses: fleet subprocess pattern OR Workflow-style parallel map. Semantics fixed by §0.6.~~ **SUPERSEDED by §0.7 (AR-ARCH-INVOKE ruling).** RULED: Option Y — host-level fleet cron (CC Agent/Task subagent fan-out). `spawn("claude",...)` DELETED from `bctcRefineJob.ts`. mcp-server is a pure data service. Three new push tools: `get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine`. Cron skill: `.claude/commands/crons/cron-refine-bctc.md`. |

---

## 9. What is NOT in scope for this sprint

- Updating the LF-OVERLAY viewer to render `bctc_refined_units` instead of `bctc_layout_units` (future sprint).
- Mistral OCR swap (stub exists, not wired).
- BCTC batch backfill for all existing reports (run risks host panic; sequential per-report is the path).
- Any change to the 6 STANDARD passes inside `bctc-analyst` (they run unchanged; the §0.5 task only adds the escalation gate + deep-dive-opus sub-flow AFTER the existing passes, and updates the model frontmatter to sonnet — it does not touch pass logic).
- Any change to `text_table_extractor.py` (0-byte-diff, preserved as fallback).

---

## RETURN

```
DONE: Technical design complete + amended x3 (2026-05-30).
      Amendment 1: Model-Tier Matrix (Haiku refine runtime, Sonnet/Opus analyze).
      Amendment 2: Refine fan-out orchestration (§0.6, FR-12 updated).
      Amendment 3: AR-ARCH-INVOKE ruling — subagent invocation mechanism (§0.7).
                   DECISION: Option Y (host-level fleet cron). spawn("claude",...) deleted.
                   New push tools: get_bctc_pending_refine / push_bctc_refined_unit / finalize_bctc_refine.
                   New cron skill: .claude/commands/crons/cron-refine-bctc.md
      Brief: docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md

ZONE: multi
  apps/pdf-extractor/  → dev-pdf-extractor (FR-1, FR-2, FR-14)
  apps/mcp-server/     → dev-mcp-server    (FR-3 through FR-13; + §0.7 push tools)
  docs/agents/         → agent-father      (FR-6, FR-7, FR-13 prompt; + §0.7 cron skill)
                                            + bctc-analyst retier (§0.5, new task)

NEXT: pm | break into atomic zone-scoped handoffs per the file list in §7 + §0.7.6.
      PM-specific notes (all prior + §0.7 additions):

      AR-OPS (prereq, UNBLOCKS AR-PDF + AR-MCP + AR-AGENT):
        PREREQ-1 (unchanged): Docker volume bctc-page-images mount.
        PREREQ-2 (unchanged): Add REFINE_FANOUT_CONCURRENCY / REFINE_WINDOW_TIMEOUT_S /
          REFINE_MAX_WINDOW_PAGES to compose env.
        PREREQ-3 (NEW from §0.7): Remove the in-container bctcRefineJob cron entry from
          cronConfig.ts to eliminate the ENOENT spawn loop on every cron tick.
          File: apps/mcp-server/src/scheduler/cronConfig.ts — remove bctcRefineJob key.
          This prereq is CRITICAL: the failing cron is actively marking every report FAILED
          on every tick until removed.

      AR-MCP (dev-mcp-server) — §0.7 replaces the spawn mechanism:
        REMOVE from bctcRefineJob.ts:
          - The spawn("claude",...) block in spawnWindowSubagent() production path.
          - runBctcRefineJob() cron entry point.
        MIGRATE to application/utils/:
          - partitionIntoWindows() → apps/mcp-server/src/application/utils/windowPartitioner.ts
          - runBoundedPool() → apps/mcp-server/src/application/utils/boundedPool.ts
          - countRows() → kept in refinedMarkdownParser.ts or co-located with parser
        ADD three new MCP tools (§0.7.4):
          - getBctcPendingRefineTool.ts → get_bctc_pending_refine
            Schema: { limit?: number } → [{ id, filename, page_count }]
            Query: text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL') ORDER BY parsed_at ASC
          - pushBctcRefinedUnitTool.ts → push_bctc_refined_unit
            Schema: { report_id, unit_id, page_numbers, markdown, confidence, flags,
                      window_status, reset?: boolean }
            On reset=true: DELETE FROM bctc_refined_units WHERE report_id=? first.
            On each call: INSERT OR REPLACE into bctc_refined_units.
          - finalizeBctcRefineTool.ts → finalize_bctc_refine
            Schema: { report_id, report_status: 'DONE'|'PARTIAL'|'FAILED' }
            Action: DELETE bctc_table_rows WHERE report_id=?;
                    parse all DONE bctc_refined_units rows → INSERT bctc_table_rows;
                    UPDATE financial_reports SET refine_status=? WHERE id=?
        All three tools registered in registry.ts (one import + one array entry each).
        DV test additions (extend AR-refined-units-idempotency.test.ts):
          - push_tool_pathway describe block:
            (a) push 3 windows (2 DONE + 1 FAILED) → finalize → table_rows has rows from
                DONE windows only; bctc_refined_units COUNT=3.
            (b) re-run with reset=true + all 3 DONE → table_rows replaces prior; COUNT stable.
            (c) finalize with PARTIAL status → financial_reports.refine_status='PARTIAL'.

      AR-AGENT-REFINE (agent-father):
        Task A (unchanged): author refine_bctc_md flows using Opus authoring session;
          all flow files declare model: claude-haiku-3-5. (FR-6, FR-7)
          Each subagent instance handles exactly ONE window.
          Output: { unit_id, page_numbers, markdown, confidence, flags } (returned via
          CC subagent result, NOT written to a file; fleet cron collects and calls
          push_bctc_refined_unit per window).
          NOTE (§0.7 update): the output file exchange
          (docs/refine-output/{report_id}/{unit_id}.json) described in §3.2.8 is REPLACED
          by the fleet cron collecting each subagent's return value directly via the CC
          Task tool mechanism. Agent-father must NOT author flow files that write to
          docs/refine-output/; the result is returned as structured JSON in the task
          output, not written to disk.
        Task B (unchanged): bctc-analyst retier.
          BLOCKED on Task A.
        Task C (NEW from §0.7): cron skill
          File: .claude/commands/crons/cron-refine-bctc.md
          Content: one-liner pointing to run docs/agents/refine_bctc_md/flow/main.md
          Schedule annotation: '0 9,14,20 * * *' UTC
          This is a thin cron skill wrapper — agent-father authors it; the heavy logic
          is inside the refine_bctc_md flow.

      DV gate (non-negotiable, extended for §0.7):
        - AR-parser-dv + AR-refined-units-idempotency commit with production code.
        - No production code commit without co-located DV test.
        - Fan-out idempotency (via push tools): (a) all-DONE, (b) some-FAILED→PARTIAL,
          (c) PARTIAL re-run → DONE with same window count.
        - End-to-end DV (§0.7.5): get_bctc_pending_refine returns a seeded report;
          after fleet cron run on FPT, bctc_refined_units COUNT=windows.length,
          at least 1 window_status='DONE'; after finalize_bctc_refine, bctc_table_rows
          COUNT>0 with non-null label + numeric value_current.

      Backlog (out of scope for this sprint):
        - LF-OVERLAY viewer rendering bctc_refined_units (future sprint).
        - docs/refine-output/ directory (no longer needed; remove any stale mkdir calls).

HANDOFF: docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md
PIPELINE: continue
```
