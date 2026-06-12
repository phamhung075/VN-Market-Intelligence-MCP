## Task Report FE-CORPEVENTS-TICKER-FILTER
date: 2026-06-12
outcome: APPROVED

changed:
- apps/frontend/app/routes/dashboard.corporate-events.tsx (filterEvents 3rd param + distinctCodes + ticker <select> UI)
- apps/frontend/app/__tests__/task17-corporate-events-loader.test.ts (Suites 17/18/19 — 31 new tests)

tests: 84 pass / 0 fail (task17 file, Vitest QA-reproduced) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0
browser: Playwright 17/17 AC checks PASS (live localhost:3001)

### Live DOM Evidence (Playwright)
- AC-1: select[aria-label="Chọn mã chứng khoán"] — 1 element. 47 options (1 'Tất cả' + 46 codes). Codes sorted A-Z: ACB, ACV, BID, DBC, DGC...
- AC-2: Default value='Tất cả', 237 event rows rendered initially.
- AC-3: Select ACB → 9 rows; re-select 'Tất cả' → 237 rows restored.
- AC-4: Dividend category alone = 10 rows; dividend + first code = 1 row (cascade confirmed).
- AC-5: No /api/ network requests triggered on ticker change (0 server fetches).
- AC-6: ACV (1 event) + Nội bộ category → "Không có sự kiện trong danh mục này." rendered, no crash.
- AC-7: Stale banner (role=status) present throughout, unaffected by ticker changes.
- AC-8: aria-label="Chọn mã chứng khoán" confirmed present in rendered DOM.
- AC-9: Zero /api contract changes (git diff — frontend zone only; orch-state metadata update unrelated to AC scope).
- AC-10: "Chọn mã chứng khoán" + "Tất cả" in DOM; "Select ticker"/"Choose stock" absent.

### Scope check
Commit 4f0d407a modifies: apps/frontend/app/routes/ + apps/frontend/app/__tests__/ + docs/data/orch/orch-state.json (unrelated ARCH-QUE-REFERENCE-PAGE status metadata — not a zone violation; no mcp-server/ops code touched).

verdict: APPROVED
