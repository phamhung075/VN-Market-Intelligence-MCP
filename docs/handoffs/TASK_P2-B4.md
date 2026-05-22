---
task_id: P2-B4
title: "Integration test: TA MCP tool end-to-end via Go service"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G5"]
files_touched: []
status: "PENDING"
blocked_by: ["P2-B3"]
unblocks: []
estimate_hours: 0.5
ac_count: 5
---

# P2-B4 — Integration test: TA MCP tool end-to-end via Go service

**Goal:** G5 (Old TA code deleted) — Final verification

**Description:**
QA verifies end-to-end integration: the MCP tool `get_technical_indicators` now calls the Go service via HTTP, returns correct output format, and all TypeScript migration code is deleted.

---

## Files Touched

None (verification only; evidence recorded in handoff)

---

## Acceptance Criteria

1. **AC-1**: Go TA service is running (`docker compose up technical-analysis -d` or local `go run ./cmd/server/`)
2. **AC-2**: MCP tool `get_technical_indicators` called (via Claude or direct JSON-RPC test) → returns RSI/MACD/BB values for a test ticker
3. **AC-3**: Response format matches the previous TS-backed response shape (same field names visible to Claude)
4. **AC-4**: `find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*"` returns 0 results (G5 charter verification method)
5. **AC-5**: `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/` returns 0 results (G5 charter verification method)

---

## Smoke Check

```bash
find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*" | wc -l
grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ | wc -l
# Both must print 0
```

---

## Atomic Commit Format

No commit for this task — QA records evidence in handoff file only.

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G5   | COMPLETE (old TA code deleted, HTTP rewire verified) |

---

## Dependencies

**Upstream:** P2-B3 (cleanup complete)
**Downstream:** None (G5 complete after this task)

---

## Evidence to Record in Handoff

- Timestamp of test run
- MCP tool call test (JSON-RPC or Claude call)
- Response output (redacted if needed)
- Confirmation of find/grep results
- Screenshot or log showing Go service running
- Confirmation that output format matches expected schema
