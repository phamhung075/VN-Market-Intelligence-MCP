# PO Notebook

## 2026-06-13T09:56Z — triage tick (post QUE-REFERENCE-PAGE close)

Channel audit: MARKET(5, 0 new — feed = BUG mirror, no clean market post; maps to OPS-POLLNEWS + data-layer parked) | WORK(7, all map to existing parked mcp tasks) | BUG(7, same). No NEW frontend issue. No duplicate tasks opened.

### Decision — 21-fail signal (router-frontend-testsuite-170fail)
RESOLVED + accepted. PO raw-ran vitest @HEAD: **real floor 21 fail / 1533 pass / 1554 total** (not 1518/21). All 21 = stale ANALYST_NAV absolute-count + last-item snapshots in 6 files (FE-HEADER-SSOT + task17-page14..18). Live SSOT TopNav.tsx = 26 analyst / 33 total.
Opened **FIX-FRONTEND-NAV-STALE-COUNT-TESTS** (READY, zone apps/frontend/, dev-frontend, test-only, no-rebuild, size S). Commit `7711a82a`. NOT blocked by mcp-server 16:00Z gate — frontend zone free. Root-cause fix = decouple pageNN tests from global count (presence+relative-order), single SSOT total test rebaselined to 26/33; FORBIDDEN: renumber-and-refreeze.

### mcp-server zone PARKED behind EVIDENCE-ACCUM-SILENT-CRON (16:00Z gate). Order (NOT made READY):
1. **ARCH-TSU** — ARCHITECT-FIRST (6 open blockers ARCH-U2-1..U6-1; design pass before any dev).
2. **ARCH-SHIP-WAVE-REAUDIT** — ARCHITECT-FIRST (multi-zone audit).
3. **FU-ALERT-COWRITE-SCHEDULER-JOBS** — dev-direct (follows shipped FIX-ALERT-ORPHAN-CORRELATION).
4. **FIX-BCTC-VPS-QUEUE-SYNC** — dev-direct (C-16/B-13 26 stale rows + VPS 5d stale).
5. **BCTC-PDF-PATH-BACKFILL** — dev-direct (schema backfill).
6. **OPS-POLLNEWS-NIGHT-ZERO** — OPS (infra/news-fetch, not mcp dev).
7. **FIX-CHEF-SENDTELEGRAM-ARGSHAPE** — cross-service (cowork-refactory-expert; not mcp-gated, low pri).
8. BCTC-CTG-FLEET-SERVE-SPIKE: NOT on active board (CTG cluster DONE) — dropped from queue.

### Carry-over (next cycle)
- Router: dispatch FIX-FRONTEND-NAV-STALE-COUNT-TESTS to dev-frontend NOW (frontend slot free).
- At ~16:00Z: EVIDENCE-ACCUM gate releases → QA verify evidenceAccumulatorJob live, THEN unpark mcp-server queue starting ARCH-TSU (architect first, NOT dev). Keep all mcp items PARKED until then.
- FU-SCHEMA-DRIFT cluster stays best-effort-exhausted (629 floor); no 7th touch.
