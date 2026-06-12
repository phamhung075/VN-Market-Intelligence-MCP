# Decision Journal — Sprint FE-CORPEVENTS-TICKER-FILTER · qa

**Sprint goal:** Add client-side ticker selector to /dashboard/corporate-events; default 'Tất cả'; compose with category filter + days selector; no hardcoded list; payload SSOT.
**Agent:** qa
**Started:** 2026-06-12T15:45:00Z

---

### STEP qa-S1 · qa · 2026-06-12T17:40:00Z
**task-id:** FE-CORPEVENTS-TICKER-FILTER
**what-done:** Full QA gate completed — 17 browser checks PASS, 84 unit tests GREEN, tsc clean, mock-guard EXIT 0; task flipped REVIEW→DONE.
**what-considered:**
- only path: all checks green (unit + tsc + DDD + mock-guard + Playwright 17/17); no blocking issues found
**why-decision:** All 10 ACs verified live in rendered browser DOM. Empty state (AC-6) confirmed with ACV+Nội bộ combination producing "Không có sự kiện trong danh mục này." Cascade (AC-4) confirmed dividend-only=10 narrowed to 1 with specific ticker. No server fetch triggered on ticker change (AC-5). Stale banner unaffected (AC-7 — 1 banner present throughout).
**why-change:** no change from plan — routine APPROVED path
