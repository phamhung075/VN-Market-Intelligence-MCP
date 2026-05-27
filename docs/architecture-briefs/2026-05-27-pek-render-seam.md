# Architecture Brief — PEK-RENDER-SEAM

**Date:** 2026-05-27
**Sprint:** PEK-INTEGRATE (Round 6)
**Author:** architect
**Escalation trigger:** ≥6 fix commits on the PEK pipeline; user-visible bug ("OCR Text render always old data FPT page 3 and 5") persists after every backend fix. Root cause code-proven by main terminal.
**Zone:** multi — `apps/mcp-server/` (render repoint) + `apps/pdf-extractor/` (trigger fix + SSOT populate)
**BUILD-STANDARD:** not-applicable (bug-fix / render-seam correction)

---

## §1 — Root Cause (do NOT re-derive — CODE-PROVEN)

Two independent structural defects explain the entire user-visible bug.

### Defect 1 — DUAL-PATH RENDER DRIFT

The bctc-inspector has three panels sourced from three different DB tables, only one of which PEK writes:

| Panel | Route | Table read | Written by PEK? |
|---|---|---|---|
| OCR Text | `GET /api/bctc-inspect/ocr/{doc_id}` | `pdf_extracted_text` (filename-keyed) | NO |
| Structured table | `GET /api/bctc-inspect/table/{doc_id}` | `bctc_table_rows` | NO |
| Zones overlay | `GET /api/bctc-inspect/zones/{doc_id}` | `bctc_page_zones` | YES |

PEK writes ONLY `bctc_layout_units` + `bctc_page_zones` (via `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts`). A perfect PEK extraction can never change what the OCR Text or structured-table panels display. They are reading `pdf_extracted_text` and `bctc_table_rows`, populated by the OLD extraction pipeline, permanently stale.

This is why: zones display correctly (PEK writes `bctc_page_zones`); OCR Text and table panels show 2026-05-26 data regardless of how many times PEK runs.

**Verified paths:**

- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:489–499` — OCR Text reads `pdf_extracted_text`, filename-keyed via `basename(pdf_path)`, 1-indexed `page_number` column.
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:574–582` — structured-table reads `bctc_table_rows WHERE report_id = ?`.
- `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts:141–191` — PEK push writes only `bctc_layout_units` + `bctc_page_zones`.

### Defect 2 — 422 RE-EXTRACT TRIGGER

`PekExtractRequestSchema` (`apps/pdf-extractor/interface/handlers.py:142–155`) declares:

```python
class PekExtractRequestSchema(BaseModel):
    report_id: str
    pdf_path: str      # mandatory — no Optional, no default
```

The backfill driver that triggered re-extraction sent `{"report_id": "..."}` only. Pydantic raised `422 Unprocessable Entity` on every POST. PEK never ran on FPT or the other 9 reports. Only DGC and DIG (which had `pdf_path` supplied at first extraction) have PEK units in the corpus.

**Corpus ground truth (direct market.db COUNT, not re-derived):** 2/12 reports have PEK units; FPT sentinel `e71f845d` has 0 PEK units and retains `pdf_extracted_text` rows from 2026-05-26.

---

## §2 — SSOT Decision: Option A — Repoint Inspector Panels to PEK Tables

**The two options:**

| | Option A: repoint inspector to PEK tables | Option B: PEK also writes the OLD tables |
|---|---|---|
| Freshness | Single source — PEK data immediately visible after push | Requires PEK to produce pdf_extracted_text format (page-by-page text) + bctc_table_rows format (label/code/value) in addition to its native output |
| Fail-loud | Natural: if PEK units absent, response carries `has_pek: false` + explicit empty state; no silent fallback to stale rows possible | Requires explicit "do not fall back" guard; old rows for the same report_id could coexist |
| Least dead data | Eliminates `pdf_extracted_text` as a dead render path (it was the OLD engine's output, now stale by design) | Keeps two competing representations of the same document in the DB; dual-write drift is exactly the bug this sprint is fixing |
| Regression risk | Zero: `bctc_table_rows` write path (`text_table_extractor.py` → `pushBctcTableHandler.ts`) is NOT touched; zone overlay contract is NOT touched | Must carefully avoid clobbering `bctc_table_rows` that `text_table_extractor.py` already writes correctly for older-path reports; coordination overhead |
| Implementation surface | 1 file in `apps/mcp-server/` (bctcInspectHandler.ts); zero pdf-extractor handler change for the render half | 2–3 new conversion functions in pdf-extractor + 1 mcp-server handler extension |

**DECISION: Option A.**

Rationale: the architecture invariant is that mcp-server is the SOLE WRITE OWNER of market.db (recorded in `pushBctcLayoutHandler.ts:9`). The correct fix is to extend the READERS on the mcp-server side to consume the PEK tables that are already being written correctly. Option B would require PEK to produce two incompatible output formats, perpetuating dual-path logic. Option A eliminates the stale path entirely for any report_id that has PEK units, and fails loudly for those that do not.

**The `bctc_table_rows` path (`text_table_extractor.py`) is NOT touched and remains fully operational** for reports that have NOT been processed by PEK. It continues to serve the structured-table panel for those reports. This is not dual-path drift — it is tiered-availability: PEK units take priority when present; the old path is the explicit fallback for non-PEK reports only, and this fallback is VISIBLE to the user via the `has_pek` flag (not silent).

---

## §3 — OCR Text Panel: New Read Contract

### Current (broken)

`handleBctcInspectOcr` reads `pdf_extracted_text WHERE filename = basename(pdf_path)` → returns page text for a single 1-indexed page.

### New (PEK SSOT)

For a given `doc_id`, the handler:

1. Checks `bctc_layout_units WHERE report_id = ? AND page_type = 'table'` for units covering the requested page (via `page_numbers_json` JSON array contains the page).
2. If PEK units exist for this report: return `stitched_markdown` from the unit whose `page_numbers_json` contains the requested page number. `has_pek: true`. Response also includes `unit_id`, `page_numbers_json`, `schema_page`, `quarantined`.
3. If NO PEK units for this report: fall back to `pdf_extracted_text` as before, AND set `has_pek: false` in the response. This fallback is the transparent non-silent path (flag is always emitted — no hidden switching).
4. If PEK units exist for this report but the requested page has no unit (e.g. a prose page): return the `bctc_page_zones` record for that page to show the page type, with `stitched_markdown: null` and `has_pek: true`. Do NOT fall back to `pdf_extracted_text` silently.

**Fail-loud guard:** if `bctc_layout_units` has rows for this `report_id` but ZERO units cover the requested page, the response MUST include `"pek_coverage_gap": true` rather than silently serving `pdf_extracted_text`. This is the gate that prevents the next false-green: the user can see exactly which pages PEK did not extract.

### Page-numbering reconciliation

Both PEK (`pek_engine_adapter.py:398,467` — `page_num: 1-indexed`) and the inspector OCR endpoint (`bctcInspectHandler.ts:489` — `1-indexed → 0-indexed OFFSET` comment) use 1-indexed page numbers. `page_numbers_json` in `bctc_layout_units` stores 1-indexed page numbers (e.g. `[7, 8, 9]`). The handler's `?page=N` query parameter is also 1-indexed. No conversion is required — they are already on the same coordinate system.

**SQLite JSON query for coverage check:**

```sql
SELECT unit_id, schema_page, page_numbers_json, stitched_markdown, quarantined
FROM bctc_layout_units
WHERE report_id = ?
  AND page_type = 'table'
  AND json_each.value = ?
  -- join: SELECT * FROM bctc_layout_units, json_each(page_numbers_json) WHERE json_each.value = <page>
```

The exact SQL idiom: `WHERE EXISTS (SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?)`.

---

## §4 — Structured-Table Panel: New Read Contract

### Current (broken)

`handleBctcInspectTable` reads `bctc_table_rows WHERE report_id = ?` → returns structured rows.

### New (PEK SSOT, tiered)

For a given `doc_id`:

1. Check `SELECT COUNT(*) FROM bctc_layout_units WHERE report_id = ?` — if > 0, this report has PEK units.
2. **If PEK units exist:** read all units (`stitched_markdown`, `page_numbers_json`, `schema_page`, `quarantined`) and return them as the structured content. Response shape: `{ has_pek: true, units: [...], has_table: false }`. The `units` array replaces the `rows` array for PEK-processed reports.
3. **If NO PEK units:** fall back to `bctc_table_rows` as today. Response shape: `{ has_pek: false, has_table: <bool>, rows: [...] }`. Flag is always emitted.

**Fail-loud guard:** same principle as the OCR panel — `has_pek` is never omitted. The front-end inspector HTML must branch on `has_pek` to display the appropriate content. This flag is the structural prevention of silent stale-data fallback.

**`bctc_table_rows` non-regression:** the `text_table_extractor.py` write path is not touched. For reports that have `bctc_table_rows` but no `bctc_layout_units`, the old structured path continues to work identically. Zero regression.

---

## §5 — 422 Re-Extract Trigger Fix

### Root cause (confirmed)

`PekExtractRequestSchema` requires `pdf_path` as a mandatory field with no default. The caller must supply it. It was not supplied.

### Fix: server-side pdf_path lookup in the trigger

**The endpoint schema stays unchanged.** The fix lives in the CALLER that triggers `/pek-extract`, not in the schema. Removing the `pdf_path` requirement from the schema would hide future missing-path bugs.

**Fix location:** in the re-extract trigger driver, before posting to `/pek-extract`, resolve `pdf_path` server-side:

```sql
SELECT pdf_path FROM financial_reports WHERE id = ?
```

`financial_reports.pdf_path` is populated by the `backfillBctcPdfPaths` use case at startup and by the PDF pull pipeline. It stores the absolute local filesystem path (e.g. `/app/data/pdfs/FPT/FPT_Q4_2025.pdf`). This is the same field used by `bctcInspectHandler.ts:255–265` to stream the PDF bytes — it is the authoritative on-disk path.

**If `pdf_path IS NULL`:** two known cases exist (VCB Q1/Q4 — geo-restricted, never downloaded). Do NOT attempt to trigger PEK for these. Log a warning and skip. This preserves the existing QA note (2 excluded from corpus).

**Trigger driver location:** there are two possible owners:

- **Option T-A (SELECTED):** A new endpoint `POST /api/trigger-pek-extract` on mcp-server's API that accepts `{ report_id: str }`, looks up `pdf_path` from `financial_reports`, and calls `POST http://pdf-extractor:5001/pek-extract` with `{ report_id, pdf_path }`. mcp-server owns the DB lookup (it is the market.db owner). The backfill driver and the cron job call this internal endpoint.
- **Option T-B (NOT selected):** Caller (cron/driver) performs its own DB lookup and sends both fields. This is viable but leaves the pdf_path lookup responsibility ambiguous across callers — every future trigger would need to re-implement the lookup.

Option T-A is selected because it encapsulates the lookup in the service that owns the data (mcp-server), and makes the trigger endpoint safe to call with only a `report_id` — the correct abstraction boundary.

**Market-hours guard:** the `/pek-extract` endpoint on pdf-extractor already returns HTTP 503 during VN market hours (Layer 2 guard, verified intact). The new mcp-server `/api/trigger-pek-extract` endpoint must propagate 503 to its caller with the same semantics. The cron schedule guard (Layer 1: `CRON_BCTC_REPARSE_JOB=0 21 * * *`) remains intact.

**`PekExtractRequestSchema` on pdf-extractor:** NO CHANGE to the schema. `pdf_path` stays mandatory. The fix is in the caller.

---

## §6 — Zone Split (Exact Files per Developer)

### dev-mcp-server owns: `apps/mcp-server/`

| File | Change |
|---|---|
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | (1) Extend `handleBctcInspectOcr`: add PEK-priority read from `bctc_layout_units` + `json_each` page coverage query; emit `has_pek`, `unit_id`, `page_numbers_json`, `pek_coverage_gap` fields; retain `pdf_extracted_text` fallback behind `has_pek: false`. (2) Extend `handleBctcInspectTable`: add PEK-priority read from `bctc_layout_units` for PEK-processed reports; emit `has_pek` flag; retain `bctc_table_rows` fallback behind `has_pek: false`. No change to `handleBctcInspectZones` (already reads the correct PEK table). |
| `apps/mcp-server/src/interface/mcp/server.ts` | Add route registration for `POST /api/trigger-pek-extract` endpoint. Route parses `{ report_id }`, looks up `financial_reports.pdf_path`, calls `POST http://pdf-extractor:5001/pek-extract` with `{ report_id, pdf_path }`, returns 202 (or 503/404 on failures). |
| `apps/mcp-server/src/interface/bctc-inspector.html` | Update the OCR Text panel and structured-table panel client JS to branch on `has_pek: true`/`false` in the response and render accordingly. When `has_pek: true`, render `stitched_markdown` as the OCR text (pre-formatted, not JSON). When `pek_coverage_gap: true`, show a visible "PEK: no unit for this page" notice rather than blank. |
| `apps/mcp-server/src/__tests__/` | New test file (or extend existing `1272-push-bctc-layout.test.ts`) covering: (a) OCR endpoint returns `has_pek: true` + stitched_markdown when `bctc_layout_units` rows present; (b) OCR endpoint returns `has_pek: false` + `pdf_extracted_text` fallback when no PEK units; (c) `pek_coverage_gap: true` when PEK units exist but page not covered; (d) structured-table endpoint returns `has_pek: true` + units when PEK units present; (e) trigger endpoint resolves pdf_path + calls pdf-extractor correctly; (f) trigger endpoint returns 404 when pdf_path IS NULL. |

**Frozen in mcp-server:** `pushBctcLayoutHandler.ts` (write path unchanged); `pushBctcTableHandler.ts` (write path unchanged); `bctcReparseJob.ts` (the existing `/extract` call path stays — it feeds `pdf_extracted_text` for non-PEK reports).

### dev-pdf-extractor owns: `apps/pdf-extractor/`

| File | Change |
|---|---|
| `apps/pdf-extractor/interface/handlers.py` | **NO CHANGE to `PekExtractRequestSchema`** — `pdf_path` stays mandatory. The fix is in the caller (mcp-server). |

**No other changes to `apps/pdf-extractor/`** for the render-seam fix. The PEK pipeline already writes `bctc_layout_units` + `bctc_page_zones` correctly (verified by DGC and DIG corpus entries). The 422 trigger was the only blocker on the pdf-extractor side, and it is fixed by the caller.

**FROZEN surfaces (unchanged, zero diff):** `apps/pdf-extractor/PDF-Extract-Kit/` subtree (pristine invariant); `apps/pdf-extractor/infrastructure/text_table_extractor.py`; `apps/pdf-extractor/sandbox/runner.py`; `docs/data/pilot-status-pdf-extractor.json`; `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`.

---

## §7 — Acceptance Test

**THE gate for this design.** QA runs this after ops deploys both services:

Open `/api/bctc-inspect` for FPT `e71f845d`. The OCR Text panel for pages 3 and 5 (user-reported pages) and pages 7, 8, 9 (sentinel pages) MUST show the FRESH PEK stitched_markdown from `bctc_layout_units` (extracted_at timestamp AFTER the re-extract trigger run, NOT 2026-05-26 data). The response MUST have `has_pek: true`. The structured-table panel for the same report MUST show `has_pek: true` + the PEK units array.

**SQL verification (direct in-container, NOT push-handler echo):**

```sql
-- On mcp-server container: docker exec ...mcp-server-1 bun -e "..."
SELECT COUNT(*) FROM bctc_layout_units WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65';
-- Must be > 0 AFTER re-extract trigger

SELECT extracted_at FROM bctc_layout_units
WHERE report_id = 'e71f845d-ffa5-48f9-8f09-30ac2cd09c65'
ORDER BY extracted_at DESC LIMIT 1;
-- Must be TODAY's date (2026-05-27 or later), NOT 2026-05-26
```

---

## §8 — DDD Layer Assignment

| Component | Layer | Rationale |
|---|---|---|
| `handleBctcInspectOcr` extended read | Interface (mcp-server) | Pure HTTP handler — reads DB, shapes response. No business logic. |
| `handleBctcInspectTable` extended read | Interface (mcp-server) | Same. |
| `POST /api/trigger-pek-extract` handler | Interface (mcp-server) | Receives trigger, looks up `financial_reports.pdf_path` (DB read = infrastructure), calls pdf-extractor (outbound HTTP = infrastructure). The handler itself is interface layer; the DB lookup and HTTP call are infrastructure operations. |
| `pdf_path` lookup SQL | Infrastructure (mcp-server, inline) | DB read inside handler — acceptable for a thin lookup in an interface handler when there is no domain logic. No domain service needed for a key-value lookup. |
| `PekExtractRequestSchema` (unchanged) | Interface (pdf-extractor) | Pydantic input validation at the HTTP boundary. |

**Golden rule check:** `domain/` imports nothing from `infrastructure/`. The new trigger handler is in the interface layer and imports infrastructure directly — no domain layer involved. DDD compliant.

---

## §9 — Risk Flags

**R-CRIT-1 — `json_each` SQLite compatibility.** The `json_each` table-valued function is available in SQLite 3.38+. Bun bundles SQLite 3.43+ (verified in prior cycles). The query pattern `WHERE EXISTS (SELECT 1 FROM json_each(page_numbers_json) WHERE value = ?)` is safe. Dev must NOT use `LIKE '%7%'` (matches page 17, 27) — must use `json_each` or a JSON extract path.

**R-CRIT-2 — Trigger atomicity.** The mcp-server trigger endpoint calls pdf-extractor over HTTP. This is fire-and-forget (202 Accepted). If pdf-extractor is down or returns 503 (market hours), the trigger returns the upstream status code to the caller. No retry logic in the trigger — ops must re-trigger manually outside market hours.

**R-HIGH-1 — `has_pek` flag must never be omitted.** Any path through the handler that does NOT emit `has_pek` will silently serve stale data when the client expects PEK output. Dev must verify every return branch emits the flag. QA acceptance test checks for `has_pek: true` on FPT.

**R-HIGH-2 — html panel update must match the new response shape.** `bctc-inspector.html` client JS currently renders `text_content` for the OCR panel and `rows[]` for the table panel. After the handler change, the response shape for PEK-processed reports changes. If the HTML is not updated in the same task, FPT will show blank panels instead of stitched_markdown. Dev-mcp-server must update both in one commit.

**R-MED-1 — Re-extract of 10 corpus reports.** Ops must trigger re-extraction for all 10 reports that have 0 PEK units (FPT + 9 others; 2 VCB excluded per pdf_path IS NULL). This takes approximately 26 seconds per page. FPT is 46 pages (~20 min). Ops must schedule extraction strictly outside VN market hours (after 09:00 UTC, before 02:00 UTC Mon-Fri). The 503 guard prevents accidental extraction during market hours.

**R-LOW-1 — Old `pdf_extracted_text` rows for PEK-processed reports remain in the DB.** They are not deleted. Once `has_pek: true`, these rows become unreachable through the inspector (no UI path to them). This is intentional dead data — it does not need to be cleaned up as part of this sprint, but a future maintenance task may archive or purge them.

---

## §10 — Hard Constraints (unchanged, carried verbatim)

- `apps/pdf-extractor/PDF-Extract-Kit/` subtree: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` MUST remain EMPTY. Zero edits.
- CPU-only, 8GB Docker cap, no gpu/lmdeploy/struct-eqtable.
- FROZEN unless explicitly reopened: `text_table_extractor.py`, `sandbox/runner.py`, `pilot-status-pdf-extractor.json`, `generic_md_table_extractor.py`.
- All work on `main`, no branches.
- Serialized commits: scoped per-file `git add`, never `-A`.
- DB verify = direct in-container `bun -e` readonly query on market.db. NEVER use push-handler `rows_stored` echo as the truth source (write-wedge false-success, proven in prior cycle).
- `bctc_table_rows` write path via `text_table_extractor.py` stays unregressed.
- Market-hours guard: `is_vn_market_open_utc()` + `CRON_BCTC_REPARSE_JOB=0 21 * * *` — INTACT, not weakened.

---

## §11 — Verification Sequence

1. **dev-mcp-server:** implements `bctcInspectHandler.ts` changes + `/api/trigger-pek-extract` + HTML panel update + tests. Runs `bun test` (full suite, zero regressions). Does NOT rebuild — notifies ops.
2. **dev-pdf-extractor:** no code change required for the render-seam fix. If ops needs the trigger wired into the existing cron, dev-mcp-server owns that change (it's in the mcp-server scheduler or the trigger endpoint).
3. **ops:** `docker compose build --no-cache mcp-server` + `up -d --no-deps --force-recreate mcp-server`. Then trigger re-extraction for all 10 non-VCB corpus reports via `POST /api/trigger-pek-extract` with each `report_id` (strictly outside 02:00–08:59 UTC). Verify each trigger returns 202. Monitor container logs for `_run_pek_extract: DONE`.
4. **qa:** Run the acceptance test in §7. Check `has_pek: true` on FPT OCR Text panel response. Verify `extracted_at` is today. Run the 4-gate PEK-MULTIPAGE sweep (md_len-based Gate B) for all 12 corpus reports. Emit `qa-pek-render-<UTC>.json`.
5. **po:** PEK-RENDER-EXIT sign-off if all gates pass. Then main terminal obtains USER verbal G9.

---

## §12 — Files Authored This Cycle

1. `docs/architecture-briefs/2026-05-27-pek-render-seam.md` — this file
2. `docs/handoffs/TASK_PEK-INTEGRATE.md` — `[Architect] PEK-RENDER-DESIGN` section to be appended
3. `docs/TASKS.md` — PEK-RENDER-DESIGN → DONE; PEK-RENDER-MCP + PEK-RENDER-PDFX → READY

---
