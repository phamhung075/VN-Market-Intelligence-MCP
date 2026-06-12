# Decision Journal — Sprint 2026-06-12 · dev-frontend

**Sprint goal:** SHIP-WAVE-REAUDIT — NFR quality fixes across mcp-server + frontend
**Agent:** dev-frontend
**Started:** 2026-06-12T09:28:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-12T09:32:00Z
**task-id:** REAUDIT-FE-003
**what-done:** Added direction arrow rendering (↑/↓/—) to stockPerformance changePct cell in market-summaries; exported directionArrow + directionArrowColorClass helpers; updated StockPerf.direction? type.
**what-considered:**
- only path: probe live payload first (confirmed direction field live from DEV-REAUDIT-4); export pure helpers for testability; inline arrow before changePct number (consistent with keyEvents arrow pattern already in file)
**why-decision:** Existing keyEvents direction pattern (L628-646) established the Unicode glyph + color class approach; reuse same pattern for consistency; backward compat via undefined → "" guard.
**why-change:** no change from plan

---

### STEP dev-frontend-S2 · dev-frontend · 2026-06-12T13:35:00Z
**task-id:** QUE-TOOLTIP-DRY-1a
**what-done:** Rewrote gen-que-descriptions.ts to parse que-reference.js directly (no import from hexagramLibrary.ts). QueDescription 4→2 fields. Regenerated generated file (64 entries). QueName.tsx: state_trend→marketTrendLabel, removed italic.
**what-considered:**
- strip strategy: indexOf("window.__QUE_REFERENCE__") then slice (handles leading comment lines); pure regex on raw content would silently fail if comments have "=" chars
- build tier 4: existing generated file + component update — Tier 3 (api layer) unchanged; no new route, no new api call
- test scope: pure data-layer tests (entry count, interface shape, spot-check against known SSOT values) — no DOM render test needed for codegen output
**why-decision:** Option B (static file parse, no HTTP) is correct: que-reference.js is committed static artifact, zero docker dependency at codegen time. The indexOf+slice approach is robust vs comment variance.
**why-change:** no change from architect plan
