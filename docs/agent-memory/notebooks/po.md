# PO Notebook

## Cycle 2026-05-30T19:46Z — AIT-EXIT: BCTC-AI-INPUT-TAB ✅ SIGNED OFF (G9-ready)

**Sprint CLOSED.** Additive 7th tab "Đầu vào AI" on `/api/bctc-inspect`: per selected page shows the exact agent-input bundle the refine AI received — rasterized PNG + OCR text + page-window (which adjacent pages co-loaded as a unit). Built b4ed9266 + path-fix cbe96137; QA cycle-157 APPROVED all 7 gates.

**Critique-before-approve (verified on main + in live container, NOT trusted from ledger):**
- Both commits present on main; container healthy, built AFTER the commits → repo == live image.
- Path-fix cbe96137 = exactly 1 file / 1 line: `getPngPath` join("/data/bctc-page-images",…) instead of `process.cwd()` (which is /app, no subtree). Correct + necessary.
- Live route `page-image/{rid}?page=6` → HTTP 200 `image/png` 336971 bytes, magic `89 50 4e 47` = REAL PNG (not echo/placeholder).
- Live route miss `page=99` → honest HTTP 404 `{"error":"png_not_found",…}`.
- Live route `page-window/{rid}?page=6` → real `bctc_refined_units` (`unit-0003`, page_numbers [6], row_count 1, conf 0.9).
- Real PNGs exist for FPT report `e8ea3df5-3f32-413d-a3eb-c71634c0438d` pages 6-11 in `/data/bctc-page-images` volume.
- FPT `financial_reports` row UNTOUCHED — in-container bun:sqlite read (`/app/data/market.db`): `confirm_status=PENDING`, `refine_status=DONE`. Additive viewer-only, zero DB writes during QA.
- Additive-only confirmed: HEAD HTML AND live-served HTML both expose all 7 `data-tab` ids (6 prior bang/danhgia/md/ocr/soluyen/suatay intact + new `aiinput`).
- No false-green residue found.

**Docs:** SPRINT_GOAL.md build-status → ✅ SIGNED OFF (AIT-EXIT) with full critique evidence. TASKS.md → sprint collapsed into Closed-sprints one-liner; 66L (under 80 cap). Umbrella lock `task:BCTC-AI-INPUT-TAB` released (ok=false acceptable if TTL expired).

**G9 summary produced** for operator in ENGLISH (language-boundary: VN reserved for market product only). What operator can now do: open `/api/bctc-inspect` for FPT, pick a page, open "Đầu vào AI" tab → see the PNG + OCR text + page-window the AI received.

## Carry-over
- DB note: market.db lives at `/app/data/market.db` in mcp-server container (NOT `/data/market.db` — that path 404s). Page-image volume IS `/data/bctc-page-images`.
- Env: `xxd` not in container (use `od -An -tx1`). bun:sqlite via temp-file `bun run /tmp/q.ts`, not stdin-pipe.
- Open OTHER sprints: FF-DEAD (HIGH, vps-scripts/ foreign-flow dead fleet-wide); FU-MON (Monday DPI Brent/Gold + get_foreign_flow live-probe); SELF-IMPROVE-GATE X-1 dry-run; BCTC-LAYOUT-FIRST; CHEF-ATTN; AR-FU-DETERMINISM (MED, deferred).
- Scoped `git add <file>` ONLY — tree has MANY unrelated uncommitted files (incl. HCM-DISAMBIG-extraction.test.ts, NOT mine); NEVER `-A`.
- Optional UX follow-up if user wants: "lọc chỉ ô cảnh báo" filter + per-cell jump-to-page (not requested).
