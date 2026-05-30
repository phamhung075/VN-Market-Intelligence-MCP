# Sprint BCTC-AI-INPUT-TAB — A 7th viewer tab showing the exact per-page input bundle the refine agent ingested

**BUILD STATUS 2026-05-30 — ✅ SIGNED OFF (PO, AIT-EXIT).** Sprint CLOSED. Additive-only 7th tab "Đầu vào AI" on `/api/bctc-inspect`. QA cycle-157 APPROVED all 7 gates @ b4ed9266 + path-fix cbe96137; container healthy (built after commits), repo==live image. **Critique-before-approve verified on main (not trusted from ledger):** both commits present on main; live routes probed in-container — `page-image/{rid}?page=6` → HTTP 200 `image/png` 336KB with real PNG magic bytes `89 50 4e 47` (not echo); miss `page=99` → honest HTTP 404 `png_not_found`; `page-window/{rid}?page=6` → real `bctc_refined_units` data (`unit-0003`, page_numbers [6]). Real PNGs exist for FPT (report `e8ea3df5…`, pages 6-11) in the `/data/bctc-page-images` volume. FPT `financial_reports` row UNTOUCHED (`confirm_status=PENDING`, `refine_status=DONE` via in-container bun:sqlite read) — additive viewer-only, no DB writes. Additive-only confirmed: HEAD HTML AND live-served HTML both expose all 7 tabs (6 prior `bang/danhgia/md/ocr/soluyen/suatay` intact + new `aiinput`); path-fix is exactly 1 file / 1 line. **ALL sprint artifacts + agent-to-agent comms in ENGLISH** per the language-boundary rule (Vietnamese ONLY for FB posts + MARKET Telegram group). The ONE Vietnamese exception is the new tab's user-facing LABEL, because the viewer is an existing all-Vietnamese operator tool.

## User intent (verbatim)
> "add tab for see what ai receive of each page bctc"

A new tab in the `/api/bctc-inspect` right pane that shows, for the CURRENTLY SELECTED PAGE, the exact input bundle the `refine_bctc_md` agent received for that page. Purpose: let the operator debug/understand WHY a page extracted the way it did.

## Vision
One sentence: **The operator opens the BCTC viewer, switches to a new "Đầu vào AI" (AI input) tab, and for whatever page is selected sees the exact bundle the refine agent ingested — the rasterized page PNG the agent's vision actually saw, the OCR text passed for that page, and which adjacent pages were co-loaded — so they can reason about the extraction.**

## Per-page bundle to surface (page nav is MASTER — content replays on `navigateToPage` like every other tab)
1. **Rasterized page IMAGE the agent's vision saw** — the PNG at `data/bctc-page-images/{report_id}/page_{N}.png` (the `get_bctc_page_image` / rasterize path). This is the AGENT-input PNG, which may differ from the left-pane PDF.js render. Show the actual PNG bytes, NOT a re-render. If no PNG exists yet for a page, show an honest "chưa có ảnh trang này" empty state — never a placeholder pretending it exists.
2. **OCR TEXT passed for that page** — `get_bctc_page_text` (filename+page lookup; `pdf_extracted_text` has NO report_id). The existing "Văn bản OCR" tab already shows OCR text alone; this tab's added value is the COMPLETE bundle (image + text + window) as the agent ingested it.
3. **PAGE-WINDOW context** — if this page belonged to a multi-page refined unit (`bctc_refined_units.page_numbers_json`), show which adjacent pages were also loaded into the agent's context for this page.
4. **Architect's call (optional)** — the static refine contract/instructions the agent operated under (numbers←text; structure←image; disagreement→FLAG never guess), shown read-only for transparency.

## Grounding (already shipped — read, do NOT rebuild)
- **Viewer home**: `apps/mcp-server/src/interface/bctc-inspector.html` (2603L, embedded JS) served at `/api/bctc-inspect`. NOT Remix — this is mcp-server's own served HTML. Tab pattern is `rtab-btn[data-tab]` buttons + `tab-panel[data-tab-panel]` panels toggled by `switchTab(tabId)` (line ~2578); `navigateToPage(pageNum)` (line ~1249) is the MASTER orchestrator that replays per-page content for every tab on each page change.
- **Existing 6 tabs (do NOT break)**: `ocr` (Văn bản OCR), `bang` (Bảng), `md` (Bảng Markdown), `soluyen` (Số liệu), `danhgia` (Đánh giá 6 cổng), `suatay` (Sửa tay). New tab is the 7th, e.g. `data-tab="aiinput"`.
- **Browser↔server contract**: the viewer talks REST, NOT MCP tools. Per-page OCR today = `GET /api/bctc-inspect/ocr/{docId}?page={page}` (line ~1280). `docId` in the viewer === `report_id` (the image tool's key).
- **Tools that already produce the data (MCP-tool surface, not yet HTTP routes for the `<img>`)**:
  - `get_bctc_page_image` (#FR-4): keyed by `report_id`; builds `data/bctc-page-images/{reportId}/page_{paddedPage}.png`; rasterizes on miss. Source: `tools/financial-reports/getBctcPageImageTool.ts`.
  - `get_bctc_page_text`: `report_id`→`pdf_path`→`basename`→pdf-extractor `/api/page-text`. Source: `getBctcPageTextTool.ts`.
- **Page-window source**: `bctc_refined_units.page_numbers_json` (report_id, unit_id, page_numbers_json, ...).

## Scope
IN:
1. **New 7th tab** following the existing `switchTab`/`rtab-*`/`tab-panel` pattern. Vietnamese LABEL (architect/dev decide exact wording, e.g. "Đầu vào AI"). Per-page replay hooked into `navigateToPage`.
2. **Per-page agent-input PNG** rendered in the new tab. Architect decides the browser-reachable serving seam — most likely a SMALL additive HTTP route (e.g. `GET /api/bctc-inspect/page-image/{docId}?page=N`) returning REAL PNG bytes (Content-Type image/png), reusing the existing `get_bctc_page_image` resolve/rasterize logic. Honest empty state when no PNG.
3. **Per-page OCR text** shown inside the same bundle (architect decides: reuse existing ocr endpoint vs page-text path).
4. **Page-window** indicator from `page_numbers_json` for the selected page's unit.
5. **(Optional) read-only refine contract** text block.

OUT:
- The existing 6 tabs, 50/50 split, MD→table view, agent/debug toggle, has_pek, all 25 legacy pane IDs — UNTOUCHED.
- Remix frontend; PDF-Extract-Kit subtree (pristine); `text_table_extractor.py` (frozen 0-diff).
- Fabricating per-page data the system does not have (no live extraction to backfill during QA; honest empty states only).
- Any change to the refine pipeline or its determinism (that is AR-FU-DETERMINISM, separate).

## Success Metric
1. Viewer shows a 7th Vietnamese-labelled tab; clicking it shows the selected page's bundle; `navigateToPage` replays the bundle on every page change.
2. The PNG shown is the ACTUAL agent-input file bytes (verified the serving route returns real `image/png` bytes, not an echo/placeholder); pages with no PNG show the honest empty state.
3. OCR text + page-window for the selected page render correctly.
4. **Anti-false-green:** a DV test (RED-before / GREEN-after) lands in the SAME commit as production. If a new HTTP route serves the PNG, a test proves it returns real image bytes for a present file and the honest 404/empty path for a missing one. Balance badge FORBIDDEN as a gate (N/A here).
5. Zero regression: all 6 existing tabs, the 50/50 split, MD→table, agent toggle, and the 25 legacy pane IDs still pass their existing tests (HC-DEV-6/HC-DEV-7/page-nav suites green).
6. mcp-server rebuilt `--no-cache` + force-recreate; container healthy; toolCount unchanged (no new MCP tool unless architect adds one — additive HTTP route preferred); PNG verified served in-container.

## Constraints (non-negotiable — carried from operator)
- Additive ONLY. main branch only, NO branches. Scoped `git add <file>` per file, NEVER `-A` (tree has many unrelated changes). PDF-Extract-Kit pristine; `text_table_extractor.py` frozen 0-diff.
- MCP via gateway wrapper only. Rebuild via `docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`. Verify persistence/serving via direct in-container read.
- off-HOSE: no live extraction 02:00–08:59 UTC Mon–Fri (today Sat 2026-05-30 → permitted). Leave FPT/ACB report state untouched during QA (read-only).
- After any agent `.md` change (if architect routes one): invoke `agent-md-factory` skill first, then give operator a paste-ready Cowork refresh prompt.

---

# Sprint BCTC-HUMAN-CONFIRM — Human-in-the-loop correction layer for flagged BCTC cells (the final trust gate)

**BUILD STATUS 2026-05-30 — ✅ SIGNED OFF (PO, HC-EXIT).** QA HC-QA-3 cycle-156 APPROVED all 9 gates GREEN @ 441f8e18, container dd904d63 toolCount=154 healthy. Critique-before-approve verified on main: transaction ordering sound (DELETE-old-pinned BEFORE reAnchorCorrections per HC-ARCH-2 canonical order, single db.transaction); DV-HC-8 false-green closed (asserts anchor_status='ok' + COUNT==1); DV-HC-14 genuine-ambiguous safe-fail closed (anchor_ambiguous + COUNT==2). Recurring-bug-escalation honored (architect HC-ARCH-2 root-caused at round 2 before HC-FIX-2). Sprint CLOSED. Optional follow-up: AR-FU-DETERMINISM (upstream refine non-determinism affects HOW MANY cells get flagged — not a blocker; correction layer handles whatever is flagged). Previous sprint BCTC-AGENTIC-REFINE ✅ SIGNED OFF 2026-05-30.

## User intent (verbatim)
> "I need one other layer, manual fix, user can fix where đánh dấu cảnh báo (đỏ/vàng) for make bctc more correct for final confirmed."

A HUMAN-IN-THE-LOOP correction layer sitting on top of the agent-refine output. The refine step already FLAGS cells it is unsure about with Vietnamese trust prefixes embedded in the markdown: red `[ĐỘ TIN CẬY THẤP — OCR <x> vs image <y>]` (numeric disagreement → source_confidence 0.2) and yellow `[độ tin cậy thấp]` (low confidence → source_confidence 0.4). The user now wants to review, hand-correct, and lock a report as human-verified — so the corrected figures (not the flagged ones) feed `get_bctc_full` + the 6 `bctc-analyst` expert passes.

## Vision
One sentence: **A non-technical user can open the existing BCTC viewer, see every red/yellow flagged cell with both the OCR value and the image-read value side by side, hand-correct each one, mark the whole report "ĐÃ XÁC NHẬN" (final confirmed), and have those human-verified numbers flow back into `bctc_table_rows` — surviving any later automated refine re-run.**

## Grounding (already shipped — read, do NOT rebuild)
- **Refine output**: table `bctc_refined_units` (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, refined_at). Trust prefixes live IN the markdown; `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` is the SINGLE point of correctness that maps red→0.2 / yellow→0.4 / none→1.0 into `source_confidence` + a flag string on each `bctc_table_rows` row.
- **UI home**: the EXISTING mcp-server-served viewer at `http://localhost:3000/api/bctc-inspect` (`apps/mcp-server/src/interface/bctc-inspector.html` + `routes/bctcInspectHandler.ts` + `routes/bctcInspectMdHandler.ts`). Last sprint added a MD→table view + a "Người dùng | Agent (debug)" toggle. The "Sửa tay / Xác nhận cuối" mode is the ADDITIVE extension — do NOT touch the Remix frontend.
- **Status dimension**: `financial_reports` has `refine_status` (PENDING/IN_PROGRESS/DONE/PARTIAL/FAILED). A SEPARATE human-confirm dimension is needed (architect decides: `confirm_status` / `final_confirmed_at` / corrections table) — do NOT collapse it into `refine_status`.
- **Tools**: `get_bctc_refined`, `get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine` (#141-144). A NEW persist path for manual corrections is needed (architect's call: new tool + corrections table, or edit-in-place with audit trail).

## Scope
IN:
1. **Review surface** — in `/api/bctc-inspect`, list every red/yellow flagged cell for a report: OCR value, image-read value, page number, surrounding label/context, current value. Plain Vietnamese.
2. **Manual correction** — user picks OCR vs image, or types the true value, per cell.
3. **Final-confirm lock** — mark report "ĐÃ XÁC NHẬN" (human-verified) on its own status dimension.
4. **Flow-back** — corrected figures re-enter `bctc_table_rows` (prefer re-parse with overrides through the existing parser — keep it the single point of correctness). ESC-5 (confidence<0.50) clears for human-confirmed cells.
5. **Survival invariant** — a later cron refine re-run (`0 9,14,20 UTC`) does NOT silently clobber a human confirmation. Architect decides precedence (confirmed cell pinned/immutable, or cron re-flags only unconfirmed cells).
6. **Audit trail** — who/when/old→new for every correction.

OUT:
- Rebuilding/retuning the refine pipeline (that is AR-FU-DETERMINISM, separate).
- Remix frontend changes; PDF-Extract-Kit subtree (pristine); `text_table_extractor.py` (frozen).
- Multi-user auth/RBAC (single-user product).
- Mistral OCR swap (user-locked future).

## Success Metric
On a report with known red/yellow flags (FPT or ACB), a user: (1) sees all flags listed with OCR/image values + page + label; (2) corrects ≥1 cell by hand; (3) marks the report ĐÃ XÁC NHẬN; (4) direct in-container `market.db` read (bun:sqlite `new Database(path)`) shows the corrected value in `bctc_table_rows` with source_confidence cleared above 0.50 and an audit row for the change; (5) a simulated refine re-run leaves the confirmed cell intact per the chosen precedence rule. Verified by QA via DV tests RED-before/GREEN-after in the SAME commit as production, NOT by balance badge.

## Non-negotiables (carried into every handoff)
main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` · additive only (do not break `/api/bctc-inspect`, MD→table view, agent/debug toggle, `has_pek`) · PEK subtree pristine · `text_table_extractor.py` frozen · DV tests RED-before/GREEN-after in SAME commit as production · verify persistence via direct in-container `market.db` read with bun:sqlite plain `new Database(path)` · balance badge FORBIDDEN as sole QA gate · Vietnamese trust-prefix convention preserved · all user-facing viewer copy in PLAIN Vietnamese · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper (bare tool names) · never ask user to run code (spawn ops/developer/qa) · after any agent .md update give a paste-ready Cowork refresh prompt · ops REBUILDs container after dev changes (build --no-cache + force-recreate, never restart-stale) · off-HOSE no extraction 02:00-08:59 UTC Mon-Fri (manual UI edits are not extraction; triggered re-parse respects the same data-write discipline).
