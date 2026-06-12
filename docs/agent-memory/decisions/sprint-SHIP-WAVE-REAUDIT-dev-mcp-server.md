# Decision Journal — Sprint SHIP-WAVE-REAUDIT · dev-mcp-server

**Sprint goal:** SHIP-WAVE-REAUDIT live-behavior re-audit: fix reputation trend compute, stale flags, foreign-flow stale_fields, stockPerformance direction, financials yoyDirection
**Agent:** dev-mcp-server
**Started:** 2026-06-11T22:50:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-11T22:50:00Z
**task-id:** REAUDIT-004
**what-done:** Added `direction: "up" | "down" | "flat"` derived field to `StockPerformanceItem` type and `buildDetail()` in `marketSummaryHandler.ts`; exported `deriveDirection()` pure helper.
**what-considered:**
- only: derive at read time in `buildDetail()` — pure sign check, no domain logic, no DB schema change; matches architect ruling.
**why-decision:** NFR-C-4 spec mandates derived field computed at read time; handler already owns the mapping layer; `deriveDirection` is a 3-line pure function with null/undefined safety.
**why-change:** no change from plan

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-11T21:05:00Z
**task-id:** REAUDIT-003
**what-done:** Added `computeStaleFields()` function and `stale_fields: string[]` root field to `ForeignFlowResponse` in `foreignFlowHandler.ts`; scans allItems post-buildSummary, >50% null threshold per field.
**what-considered:**
- Scan allItems (full day set, not display-limited items slice) — consistent with how buildSummary already uses allItems for authoritative counts.
- only: no SQL change needed — pure in-memory array scan, no hot path concern (~103 rows × 3 fields = O(N)).
**why-decision:** allItems is the authoritative dataset for column-level availability; using the display-limited slice would give wrong signal if limit < row-count. Strict >50% threshold from spec (exactly 50% not stale).
**why-change:** no change from plan

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-12T08:54:00Z
**task-id:** REAUDIT-004
**what-done:** Re-run after dead session: confirmed implementation from S1 was present but uncommitted; wrote 11 unit tests (AC-1..AC-10 + null guard) and committed both files.
**what-considered:**
- only: verify existing uncommitted code is correct before adding tests — avoids rewriting work.
**why-decision:** Previous session died before commit; code was correct (tsc clean, logic matches spec); tests were missing; added and committed both together per G12 DoD gate.
**why-change:** no change from plan — re-run of same task, same approach confirmed correct.
