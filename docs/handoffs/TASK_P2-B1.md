---
task_id: P2-B1
title: "Rewire `technicalIndicatorTools.ts` to HTTP call against TA Go service"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G5"]
files_touched:
  - "apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts (MODIFY)"
status: "PENDING"
blocked_by: ["P2-B0"]
unblocks: ["P2-B2"]
estimate_hours: 0.75
ac_count: 6
---

# P2-B1 — Rewire `technicalIndicatorTools.ts` to HTTP call against Go TA service

**Goal:** G5 (Old TA code deleted)

**Description:**
Remove the direct import of the TypeScript domain service. Rewire the MCP tool handler to call the Go technical-analysis service via HTTP (port 5003). The HTTP client infrastructure is already in place via `clients.ts`.

---

## Files Touched

- `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` (MODIFY)

---

## Acceptance Criteria

1. **AC-1**: The file no longer imports from `../../../../domain/services/technicalIndicators.js`
2. **AC-2**: Instead, it calls the existing HTTP client in `apps/mcp-server/src/infrastructure/microservices/clients.ts` (the `ta` entry at port 5003 is already there)
3. **AC-3**: The MCP tool `get_technical_indicators` continues to accept the same input schema (symbol, optional period) and returns the same output format visible to Claude
4. **AC-4**: HTTP call uses `POST /ta/indicators` matching the Go service's `api/openapi.yaml`
5. **AC-5**: Error handling: if the Go service returns non-200 or times out, the tool returns a user-friendly error (not a raw stack trace)
6. **AC-6**: Existing test `1302-technical-indicators.test.ts` must be updated to mock the HTTP call (not the domain service import) — tests must still pass: `cd apps/mcp-server && bun test`

---

## Smoke Check

```bash
cd apps/mcp-server && bun test && bun tsc --noEmit
```

Both must exit 0.

---

## Atomic Commit Format

```
feat(technical-analysis): P2-B1 — rewire technicalIndicatorTools.ts → HTTP port 5003

Removes direct import of technicalIndicators.ts domain service.
Tool now calls existing TA HTTP client (clients.ts ta entry).
HTTP endpoint: POST /ta/indicators per api/openapi.yaml.

Sprint: <sprint>
Task: P2-B1
AC: no domain service import / HTTP call to port 5003 / bun test passes / bun tsc passes
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G5   | IN-PROGRESS (tool handler rewired) |

---

## Dependencies

**Upstream:** P2-B0 (caller inventory identified)
**Downstream:** P2-B2 (domain service moves to _deprecated)

---

## Testing Notes

- Update `1302-technical-indicators.test.ts` to use HTTP mocks (e.g., via Bun mock/fetch)
- Ensure error cases are tested: service down, timeout, invalid response
- Verify test output format matches Claude's expected MCP tool response
