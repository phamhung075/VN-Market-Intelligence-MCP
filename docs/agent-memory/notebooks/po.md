# PO Notebook

## Cycle 2026-05-30T19:07Z — KICKOFF: BCTC-AI-INPUT-TAB (7th viewer tab, additive)

**Self-initiated from operator verbatim** "add tab for see what ai receive of each page bctc". Goal written (SPRINT_GOAL.md top section), AIT-BA task added to TASKS.md, umbrella lock `task:BCTC-AI-INPUT-TAB` claimed:true (TTL 3600).

**Scoped the surface BEFORE writing the goal (de-risk the architect's brief):**
- Viewer = `apps/mcp-server/src/interface/bctc-inspector.html` (2603L embedded JS), served at `/api/bctc-inspect`. NOT Remix — mcp-server's own HTML. Confirmed zone = `apps/mcp-server/` only (single tree, serializes).
- Tab pattern: `rtab-btn[data-tab]` buttons + `tab-panel[data-tab-panel]` panels, toggled by `switchTab(tabId)` (~L2578). `navigateToPage(pageNum)` (~L1249) = MASTER per-page replay orchestrator. 6 existing tabs: ocr/bang/md/soluyen/danhgia/suatay. New = 7th (`aiinput`).
- Browser↔server = REST, NOT MCP tools. Per-page OCR today = `GET /api/bctc-inspect/ocr/{docId}?page=N` (~L1280). `docId` === `report_id`.
- **KEY GAP for architect**: `get_bctc_page_image` (report_id→`data/bctc-page-images/{id}/page_{N}.png`, rasterize-on-miss) + `get_bctc_page_text` exist but are MCP-tool surface — NO browser-reachable HTTP route serves the PNG to an `<img>`. Architect must design an additive route (likely `GET /api/bctc-inspect/page-image/{docId}?page=N` returning real image/png bytes). Anti-false-green flag raised: prove REAL bytes not echo; honest "chưa có ảnh" empty state on miss.
- Page-window source = `bctc_refined_units.page_numbers_json`.

**Language boundary ENFORCED**: all sprint docs/comms ENGLISH; Vietnamese ONLY for the new tab's user-facing label (the one exception — existing all-Vietnamese operator tool).

**Env note**: harness emitted spurious ENOSPC "tasks full" warnings on grep commands that produced empty stdout — red herring (disk 32Gi free). Workaround: redirect probe output to a project file + Read it. Worked.

**Chain dispatched**: architect (mini-brief) → ba/pm right-size → dev-mcp-server → qa → ops rebuild → po-exit. WIP=2. Continue to G9 autonomously, no user contact until G9.

## Cycle 2026-05-30T18:34Z — HC-EXIT: BCTC-HUMAN-CONFIRM ✅ SIGNED OFF (G9-ready)

**Sprint CLOSED.** QA HC-QA-3 cycle-156 APPROVED all 9 gates GREEN @ 441f8e18, container dd904d63 toolCount=154 healthy. Human-in-the-loop correction layer on `/api/bctc-inspect`: review red/yellow flagged cells (OCR vs image), hand-correct, lock "ĐÃ XÁC NHẬN"; corrections survive cron refine re-runs; 50/50 viewer + 6 tabs.

**Critique-before-approve (verified on main, not trusted from ledger):**
- All 9 commits present on main (4c40939c·89100e07·ae3c5039·dca93898·7a3734ed·204344ec·9234e9c2·d5976d1e·441f8e18).
- Transaction ordering SOUND — `finalizeBctcRefineTool.ts` lines 264-272: DELETE-old-pinned loop BEFORE `reAnchorCorrections`, inside one `db.transaction()` (matches HC-ARCH-2 canonical Step 4→5). reAnchor sees exactly 1 row per non-ambiguous corrected label.
- DV-HC-8 false-green CLOSED — test lines 937-954 now assert `anchor_status='ok'` + `COUNT==1` (the two gaps cycle-155 flagged). RED-before/GREEN-after comment present.
- DV-HC-14 genuine-ambiguous safe-fail CLOSED — asserts `anchor_ambiguous` + `COUNT==2`, correction NOT mis-applied.
- Recurring-bug-escalation HONORED — Gate 3 took 2 rounds; architect re-engaged at round 2 (HC-ARCH-2 root-cause) before HC-FIX-2 point-fix. Cannot round-3 (both false-green gaps now have direct assertions).

**Docs:** SPRINT_GOAL.md build-status → ✅ SIGNED OFF (HC-EXIT). TASKS.md → sprint collapsed into Closed-sprints one-liner; 65L (under 80 cap). Umbrella lock `task:BCTC-HUMAN-CONFIRM` release ok:false (TTL expired across long sprint — acceptable).

**G9 summary produced** in plain Vietnamese for user relay (returned to main terminal).

## Carry-over
- AR-FU-DETERMINISM (MED, shared by AGENTIC-REFINE + HUMAN-CONFIRM): upstream Haiku refine fan-out emits non-deterministic markdown coverage (FPT run-1=91 vs run-2=18 flagged). Affects HOW MANY cells the user must review, NOT correctness of the correction layer. Optional follow-up, NOT a blocker. DEFERRED.
- Other OPEN: FF-DEAD (HIGH, vps-scripts/ — foreign-flow dead fleet-wide); DPI FU-MON (Monday Brent/Gold + get_foreign_flow live-probe); SELF-IMPROVE-GATE X-1 dry-run; BCTC-LAYOUT-FIRST; CHEF-ATTN.
- Scoped `git add <file>` ONLY — tree has MANY unrelated uncommitted files; NEVER `-A`.
- Optional UX follow-up if user wants: a "lọc chỉ ô cảnh báo" filter + per-cell jump-to-page on the viewer (not requested, would polish the review loop).
