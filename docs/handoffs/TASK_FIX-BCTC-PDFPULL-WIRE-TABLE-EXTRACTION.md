# TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION

**Board row:** `docs/data/orch/orch-state.json` `.task_board.backlog[]` (SPRINT-S, high, zone `apps/mcp-server/`)
**Source:** `docs/spikes/SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW.md` (commit `336a6ce11`), PO round BATCH triage `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE`

---

## [Architect] Brownfield Findings

### Zone
**`apps/mcp-server/`** — SINGLE-ZONE. No `apps/pdf-extractor/` change required (justification below, see "Zone confirmation").

### Verified paths (RAW-read this cycle, beyond what the SPIKE already covered)

- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:317-323,382-411,552-620` — the 0-row gate: reads `bctc_table_rows`/`bctc_md_tables` counts via a JOIN on `fr.action_code = ? AND fr.sort_key = ?` immediately after `triggerExtraction` resolves (synchronous), then either `updateDone` or `updateEnrichFailed`.
- `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts:149-284` — `triggerPushBctcExtraction`, 3-tier scalar-only fallback (pdf_path → remote URL → local pdf-parse), calls `runPipeline` (`fetchParseAndStoreBctc`) **iff** resolved text ≥100 chars.
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts:73-96` — **NEW FINDING, root cause of `pdf_path IS NULL` (GVR/MBB/D2D):** `report = await parseBctcReport(...)` (line 86) already performs the DB INSERT internally (see next bullet) using `report.source.pdfPath = null` (parseBctcReport's own default). Only *after* that call returns does line 96 set `report.source.pdfPath = join(...)` on the **already-persisted, in-memory-only** `report` object — this mutation is never written back to SQLite. The bug is a plain post-persist-mutation-never-flushed bug, not a race or timing issue.
- `apps/mcp-server/src/application/usecases/parseBctcReport.ts:204-386,584-629` — `storeReport()` does `INSERT OR REPLACE INTO financial_reports (id, ..., pdf_path, ...)` using `report.id = randomUUID()` (line 588, freshly generated **every call**) and `report.source.pdfPath = null` (line 598, hardcoded at assembly time, before the caller's later mutation).
- `apps/mcp-server/bctc-schema.ts:727-822` — `financial_reports` DDL: `id TEXT PRIMARY KEY`, `UNIQUE(action_code, sort_key)`. **`INSERT OR REPLACE` resolves conflicts through ANY unique index, not just the PK** — so a second call for the same `(action_code, sort_key)` deletes the old row (whatever `id` it had) and inserts a new row with a **freshly-generated `id`**.
- **NEW HIGH-RISK FINDING (id instability — not previously documented):** `bctc_table_rows.report_id`, `bctc_md_tables.report_id`, `bctc_layout_units.report_id`, `bctc_page_zones.report_id` are plain `TEXT NOT NULL` columns matched to `financial_reports.id` **by convention only — no FK constraint** (`apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:103-156,161-197`). Only `bctc_eval_results` has an actual `FOREIGN KEY ... ON DELETE CASCADE` (line 214). Consequence: if the legacy scalar pipeline (`parseBctcReport`/`storeReport`) ever re-runs for a report **after** PEK has already landed `bctc_layout_units`/`bctc_page_zones` rows keyed to the *old* `id` (e.g. a retry, `bctcReparseJob`, or any future re-parse), the new row gets a **new `id`**, and all previously-populated PEK rows become permanently orphaned/invisible to any query joining on `fr.id = tr.report_id` (including the pull job's own 0-row gate) — even though the rows still physically exist. This is silent data-loss-by-orphaning, not a crash, so it would not be caught by the existing 0-row gate; it would instead look like "PEK ran but 0 rows landed" on the very next gate check.
- **NEW CRITICAL FINDING (wrong tables being gated — corrects the SPIKE's framing):** RAW-verified via `pushBctcLayoutHandler.ts:1-20` (doc comment: *"Zero writes to bctc_table_rows, bctc_balance_checks, or bctc_md_tables"*) and `apps/pdf-extractor/interface/handlers.py:207-269` (`_run_pek_extract` calls `push_client.push_layout(...)`, the SAME client `/extract-layout-first`'s use case uses) that **`/pek-extract`'s push-back writes ONLY `bctc_layout_units` + `bctc_page_zones`** — never `bctc_table_rows`/`bctc_md_tables`. Of the SPIKE's 4 candidate endpoints, only `/extract-tables` → `pushBctcTableHandler.ts` (writes `bctc_table_rows`) and `/extract-md-tables` → `pushBctcMdTablesHandler.ts` (writes `bctc_md_tables`) populate the tables the *existing* 0-row gate actually checks. `/pek-extract` — the ONLY endpoint proven functional right now (parallel ops mitigation is using it live) — populates a **different pair of tables that the gate never looks at**. Wiring `/pek-extract` automatically without ALSO changing the gate's target tables would leave the gate reading 0/0 forever even after 100% successful PEK runs — a second silent no-op layered on top of the first. This is the single most load-bearing correction in this design.
- `apps/mcp-server/src/interface/mcp/routes/bctcVpsIngestHandler.ts:194-280` — `handleTriggerPekExtract`: requires `{report_id}` (a `financial_reports.id`), looks up `pdf_path` by that id, 404s if either the report row doesn't exist or `pdf_path IS NULL`. Confirms: **a `financial_reports` row with `id` + non-null `pdf_path` must exist BEFORE `/pek-extract` can be triggered at all** — this is why concerns 2 and 3 are prerequisites for concern 1, not independent work.
- `apps/pdf-extractor/domain/services.py:21,42,71` — `_OCR_CONFIDENCE_THRESHOLD = 0.5` (Python, pdf-extractor domain layer, confirmed as the SPIKE stated) gates `ExtractPDFService.process_pdf`; this stays completely untouched by this design (concern 3's fix bypasses it structurally rather than raising/removing it).
- `apps/mcp-server/src/scheduler/financial-reports/cronConfig.ts:26-32` + `schedulerJobTable.ts:245-246,1013` — existing cron wiring pattern (`CRONS.bctcPdfPull`, `CRONS.bctcReparseJob`) — the canonical place to register a new reconciliation cron.
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts:1-22` — reconciliation job candidate assessed: **NOT reusable as-is.** It is purpose-built around `agent_feedback` "stranded PDF" rows written by `dataAuditJob` D-7c and drives the SAME legacy scalar pipeline (`fetchParseAndStoreBctc`) that this task is explicitly working around — not a PEK/table-verification pass. The SPIKE itself lists `bctcReparseJob` as explicitly OUT OF SCOPE. Building a small new reconciliation job (or a second phase inside `bctcPdfPullJob`'s own cron tick) is cleaner than overloading this job's existing contract.
- **Cross-cutting `enrich_failed`/queue-status consumers (still `apps/mcp-server/`, in-scope, must be updated in step with the new status):**
  - `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts:280-340` — orphan re-sync arm currently sweeps `status IN ('url_not_found', 'enrich_failed')` after repeated attempts; must be extended to also recognize/expire the new async-pending status so genuinely-stuck rows still get swept, without prematurely sweeping legitimately-in-flight ones.
  - `apps/mcp-server/src/domain/services/vpsHealthPoller.ts:88-92,204-225,307-317` and `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:179-214` — both compute `active_count` via `status IN ('pending', 'url_not_found', 'enrich_failed')` as the "ongoing work, don't false-alarm idle" queue guard. The new async-pending status MUST be added to both lists, or the freshness/health gate will misread in-flight PEK work as "queue idle" and could false-alarm.

### Zone confirmation (single-zone, not multi)

SPIKE's mandate: escalate to `multi` only if the deferred-gate write-back genuinely needs a NEW pdf-extractor callback that doesn't exist. RAW-verified this cycle: `/pek-extract`'s push-back path (`_run_pek_extract` → `LayoutFirstPushClient.push_layout` → `POST /api/push-bctc-layout` → `pushBctcLayoutHandler.ts`) already exists, is already wired, and is proven live (same code path the parallel ops mitigation is exercising right now via `/api/trigger-pek-extract`). The only defect is that **mcp-server's own gate reads the wrong table pair**. Fixing what a query checks is entirely an `apps/mcp-server/` change. **Confirmed single-zone.**

### Design decisions

**D1 — Stabilize `financial_reports.id` across repeat writes (foundational fix, unblocks D2/D3).**
Replace the blind `INSERT OR REPLACE` (fresh `randomUUID()` every call) in `parseBctcReport.ts::storeReport()` with an upsert that preserves the existing `id` when a row already exists for `(action_code, sort_key)`:
```sql
INSERT INTO financial_reports (id, action_code, ..., sort_key, ...)
VALUES ($id, $actionCode, ..., $sortKey, ...)
ON CONFLICT(action_code, sort_key) DO UPDATE SET
  company_name = excluded.company_name, ... <all scalar/json columns>,
  pdf_path = COALESCE(financial_reports.pdf_path, excluded.pdf_path)
  -- id is NEVER in the SET list — SQLite ON CONFLICT DO UPDATE never touches
  -- columns absent from the SET clause, so the original id survives.
```
`$id` passed into the statement is only used on first-insert; a caller-side pre-check (`SELECT id FROM financial_reports WHERE action_code=? AND sort_key=?`) supplies the existing `id` to reuse when present, otherwise `randomUUID()` for the true first write. This is a small, mechanical, low-risk change to one file and directly fixes the id-orphaning risk found above — it must land in this task, not be deferred, because D2/D3 depend on `id` stability to be safe.

**D2 — `financial_reports` shell-row creation, decoupled from the legacy OCR-confidence gate (concern 3) + `pdf_path` set at PDF-save time (concern 2), in one write.**
New small application usecase (e.g. `ensureFinancialReportShellRow({actionCode, year, quarter, pdfPath})` in `apps/mcp-server/src/application/usecases/bctc/ensureFinancialReportShellRow.ts`), called from `bctcPdfPullJob.ts` immediately after `deps.savePdf()` succeeds (current Step 4, before Step 5 `triggerExtraction`). Idempotent upsert on `(action_code, sort_key)`:
```sql
INSERT INTO financial_reports (id, action_code, company_name, exchange, domain,
  period_year, period_quarter, period_type, period_start, period_end, sort_key,
  pdf_path, parsed_at, validation_status,
  balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
VALUES ($id, $actionCode, '', 'HOSE', 'other', ..., $pdfPath, datetime('now'), 'pending_extraction',
  '{}', '{}', '{}', '{}')
ON CONFLICT(action_code, sort_key) DO UPDATE SET
  pdf_path = excluded.pdf_path
  WHERE financial_reports.pdf_path IS NULL;   -- never clobber a pdf_path a later successful scalar/legacy write already set correctly
```
This single write closes concern 2 (pdf_path is now set at the moment the file lands on disk — no dependency on any downstream extraction succeeding) AND concern 3 (a shell row now exists for every pulled PDF regardless of OCR confidence — GAS gets a row even though its scalar tiers would still fail the 0.5 threshold). `validation_status='pending_extraction'` is a new, additive enum value — distinct from the existing `pending|passed|failed|passed_with_warnings|low_confidence` — so downstream consumers of `validation_status` (PM/dev must grep+enumerate all reads before implementation) can distinguish "shell, not yet scalar-parsed" from "scalar-parsed, low confidence." The later legacy scalar pipeline (if/when it succeeds) upserts the SAME row via D1's `ON CONFLICT` path, overwriting scalar/JSON columns but reusing the same `id` — so any `/pek-extract` triggered off the shell row's `id` stays valid even if the scalar pipeline runs afterward.
Layer: `application` (orchestrates a DB write with no cross-service call — pure persistence, acceptable as a thin application usecase per existing `fetchParseAndStoreBctc` precedent).

**D3 — Automatic table-extraction trigger + deferred gate + corrected reconciliation target (concern 1).**
1. In `bctcPdfPullJob.ts`, after D2's shell-row upsert succeeds and `filePath` is known, fire `POST http://pdf-extractor:5001/pek-extract` with `{report_id: <shell row id from D2>, pdf_path: filePath}` — reuse the exact same fetch/market-hours-503-handling pattern already proven in `handleTriggerPekExtract` (`bctcVpsIngestHandler.ts:240-278`), factored into a small shared helper (e.g. `triggerPekExtractionForReport()`) so both the manual route and the new automatic call share one implementation — do not duplicate the HTTP-call logic.
2. **Remove the synchronous 0-row gate from `bctcPdfPullJob.ts`'s per-item loop entirely.** Since `/pek-extract` is 202/fire-and-forget, checking `bctc_table_rows`/`bctc_md_tables` (or even `bctc_layout_units`) immediately after firing it is structurally guaranteed to read 0 — there is no synchronous outcome to gate on. Replace the current terminal states (`done` vs `enrich_failed`, decided synchronously) with a new intermediate status:
   - `bctc_vps_queue.status = 'pek_triggered'` — PDF pulled + saved, shell row exists with `pdf_path` set, `/pek-extract` POST returned 202 (or the market-hours 503, tracked distinctly — see state machine below). Row is NOT `done` yet; NOT `enrich_failed` either (no failure has been observed — this is deliberately a distinct "awaiting async result" state, not a repurposed failure state).
   - `updateAttempt`/`recordFailedAttempt` semantics are unaffected — the existing fetch/save/size-guard failure paths are unchanged; only the post-save extraction-trigger step changes shape.
3. **New reconciliation cron** (small, purpose-built — NOT `bctcReparseJob`; see brownfield note above): `bctcExtractReconcileJob.ts`, registered in `schedulerJobTable.ts`/`cronConfig.ts` (new `CRONS.bctcExtractReconcile`, suggested cadence `*/30 * * * *` offset from the pull cron, e.g. `5,35 * * * *`, so it always runs after PEK has had at least ~5-30 min async runway — tune based on PEK's observed per-doc latency, ~26s/page per the render-seam brief's R-MED-1 estimate). Each tick:
   - `SELECT * FROM bctc_vps_queue WHERE status = 'pek_triggered' AND last_attempt < datetime('now', '-5 minutes')` (grace window so a just-triggered row isn't checked before PEK could plausibly have finished).
   - For each row, re-derive `report_id` (via the same `(action_code, sort_key)` lookup D1/D2 made stable) and check: `SELECT COUNT(*) FROM bctc_layout_units WHERE report_id = ? AND quarantined = 0` **UNION with the legacy tables for forward-compat** — i.e. success = `(bctc_layout_units non-quarantined count > 0) OR (bctc_table_rows count > 0) OR (bctc_md_tables count > 0)`. This corrects the SPIKE's gate-target and stays forward-compatible if `/extract-tables`/`/extract-md-tables` are ever wired later.
   - Success → `status = 'done'`. Still-zero after a bounded number of reconciliation passes (reuse the existing `MAX_404_ATTEMPTS`-style pattern, a new named constant e.g. `MAX_RECONCILE_ATTEMPTS`) → `status = 'enrich_failed'` (this is now a genuinely-terminal fail-loud state, reached only after giving the async pipeline a fair chance — not an immediate false-positive on every row as today). Still-zero but under the attempt cap → leave `pek_triggered`, increment an attempt counter, re-check next tick (or optionally re-fire `/pek-extract` — PM to decide bounded retry vs pure re-check based on whether repeated `/pek-extract` calls are idempotent/cheap; `pushBctcLayoutHandler.ts`'s DELETE-before-INSERT pattern at lines 150-151 suggests idempotent re-runs are safe).
   - `enrich_failed` semantics are preserved (same Telegram BUG fail-loud notification, moved from the pull job into the reconciliation job) — this satisfies fail-loud-protocol.md's anti-silent-swallow rule while no longer firing on every single pull.

**State machine (`bctc_vps_queue.status`):**
```
pending → fetching(via push route only; pull-job path skips this) → [fetch/save/size-guard as today]
  → pek_triggered   (NEW: PDF saved + shell row upserted (D2) + /pek-extract POST 202'd)
      → done               (reconciliation job confirms bctc_layout_units/bctc_table_rows/bctc_md_tables > 0)
      → enrich_failed      (reconciliation job exhausts MAX_RECONCILE_ATTEMPTS with still-zero — genuinely terminal, fail-loud)
      → pek_triggered      (still within attempt budget — re-checked next tick)
  → deferred_infra   (unchanged — MAX_404_ATTEMPTS on fetch, orthogonal to extraction)
  → url_not_found    (unchanged — bctcQueueEnricherJob discovery exhaustion)
```
`pek_triggered` additionally needs a distinct sub-case for the VN-market-hours 503 (pdf-extractor's own Layer-2 guard): PM/dev should decide whether this is folded into `pek_triggered` (treat as "will retry via reconciliation job's re-fire" since 503 means PEK never even started) or a separate `pek_deferred_market_hours` status — flagging as an open decomposition question for PM, not resolving here (SPRINT-S scope, low-complexity either way).

### Reuse patterns
- Extend `triggerPekExtractionForReport()` (new shared helper, factored out of `handleTriggerPekExtract`'s existing fetch-with-market-hours-handling logic) — do not duplicate the HTTP call between the manual route and the new automatic caller.
- Extend `bctc_vps_queue.status` enum (plain `TEXT`, no CHECK constraint — confirmed via schema read) rather than adding a new table for extraction-pending state.
- Extend `storeReport()`'s write pattern (D1) rather than adding a parallel upsert path — one write chokepoint for `financial_reports`.

### DDD layer assignment
| Component | Layer | Rationale |
|---|---|---|
| `ensureFinancialReportShellRow` (D2) | application (`usecases/bctc/`) | Orchestrates a single persistence operation, no domain logic — mirrors `fetchParseAndStoreBctc` precedent. |
| `storeReport()` ON CONFLICT rewrite (D1) | application (`usecases/parseBctcReport.ts`, existing file) | Same file, same layer — mechanical SQL change only. |
| `triggerPekExtractionForReport()` shared helper (D3) | infrastructure (`infrastructure/fetchers/` or co-located with `pdfExtractorClient.ts`) | Outbound HTTP call — matches existing `pdfExtractorClient.ts` layer placement. |
| `bctcExtractReconcileJob.ts` (D3) | interface (`scheduler/financial-reports/`) | Cron job — matches `bctcPdfPullJob.ts`/`bctcReparseJob.ts` placement. |
| `bctcPdfPullJob.ts` gate removal + `pek_triggered` write | interface (scheduler, existing file) | Mechanical edit to existing file. |

### Test strategy
- Unit: `ensureFinancialReportShellRow` — idempotent upsert (create then no-op re-call preserves `pdf_path`; re-call with different `pdf_path` when existing is NULL updates it; re-call when existing is non-NULL does NOT clobber it).
- Unit: `storeReport()` ON CONFLICT — two sequential calls for the same `(action_code, sort_key)` yield the SAME `id`; `bctc_table_rows` rows seeded under the first `id` remain joinable after the second call.
- Unit: `bctcPdfPullJob` — PDF saved → shell row exists with `pdf_path` set (not null) → `/pek-extract` called with correct `{report_id, pdf_path}` → queue row lands at `pek_triggered`, not `done`/`enrich_failed`, synchronously.
- Unit: `bctcExtractReconcileJob` — `pek_triggered` row with `bctc_layout_units` rows present (non-quarantined) → `done`; with zero rows and under attempt cap → stays `pek_triggered`; with zero rows and cap exceeded → `enrich_failed` + Telegram BUG fired exactly once.
- Regression: existing `FIX-BCTC-ENRICH-SILENT-0ROWS.test.ts`, `bctc-pdf-pull-job.test.ts`, `pek-render-seam.test.ts`, `pushBctcTableHandler.test.ts`, `1270-push-bctc-md-tables.test.ts`, `1272-push-bctc-layout.test.ts` — all touch adjacent contracts PM must scope into the atomic task breakdown for non-regression.
- Integration/E2E (flagged for QA, not architect-owned): live cohort re-check post-deploy — GVR/MBB/D2D `pdf_path` populated on next pull cycle touch (or targeted backfill); GAS gets a shell row on next pull; `bctc_layout_units` count increases for newly-pulled 2025-Q4 reports within one reconciliation window.

### Risk flags
- **R-CRIT-1 (id instability, D1 above) — MUST fix in this task, not defer.** Without D1, D2's shell-row `id` gets silently replaced the first time the legacy scalar pipeline runs afterward, orphaning any PEK rows already landed. This is the highest-severity latent risk found this cycle.
- **R-CRIT-2 (gate-target correction, D3 above) — MUST fix in this task.** Wiring `/pek-extract` without retargeting the reconciliation check from `bctc_table_rows`/`bctc_md_tables` to `bctc_layout_units` reproduces the exact 0-row silent-failure class this task exists to close, one layer downstream.
- **R-HIGH-1 — cross-file status-enum blast radius.** `vpsHealthPoller.ts`, `freshnessSlaMonitorJob.ts`, `bctcQueueEnricherJob.ts` orphan re-sync all pattern-match on the CURRENT `bctc_vps_queue.status` enum inline (`status IN (...)` literals, not a shared constant). PM must enumerate ALL of these as atomic sub-tasks in the same sprint — a partial rollout (new status introduced, but freshness/health monitors not updated) creates a false "queue idle" reading during normal async operation.
- **R-HIGH-2 — market-hours 503 handling for the automatic trigger.** Unlike the manual `/api/trigger-pek-extract` route (a human decides when to call it, naturally avoiding market hours), the automatic post-pull trigger fires unconditionally on the `*/30 * * * *` pull cron, which runs during VN market hours too. PM must decompose a sub-task for: does `bctcPdfPullJob` check `is_vn_market_open` client-side before even attempting `/pek-extract` (avoiding a guaranteed 503 round-trip), or does it always attempt and let the reconciliation job's retry-budget absorb the wasted attempts? Recommend client-side pre-check (cheap, avoids noisy 503 log spam every 30 min during 02:00-08:59 UTC).
- **R-MED-1 — reconciliation cadence/PEK-latency mismatch.** Per the render-seam brief (§9 R-MED-1), PEK takes ~26s/page; a 46-page report (FPT-scale) is ~20 min. A `5,35 * * * *` reconciliation cadence with a 5-min grace window may check too early for large reports on the first pass — this is fine (falls through to "stays `pek_triggered`, re-check next tick") but PM should size `MAX_RECONCILE_ATTEMPTS` generously enough (e.g. ≥4 passes / ~2h) to not falsely terminal-fail large reports.
- **R-LOW-1 — `validation_status='pending_extraction'` is a new enum value.** PM must grep all reads of `financial_reports.validation_status` (dashboards, MCP tool responses, publishability gates) to confirm none of them treat an unrecognized value as `failed` by default (anti-default-mask — per `feedback_composite_score_masks_dead_detector_pruned_table` pattern in project memory, a naive `validation_status != 'passed'` check would silently misclassify every shell row as bad).

### Scan clean: true (with the corrections above layered onto the SPIKE's already-verified baseline)

**Standard Detection:** BUG-FIX / REFACTOR (in-zone, no new primitives) → `BUILD-STANDARD: not-applicable`.
