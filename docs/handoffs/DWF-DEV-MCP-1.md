---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-MCP-1
branch: task/dwf-dev-mcp-1-is-trading-day
size: M
zone: apps/mcp-server/
depends_on: []
blocks: [DWF-DEV-MCP-2, DWF-DEV-CROSS-3]
---

# DWF-DEV-MCP-1 — is_trading_day Tool

## TLDR

Implement a new MCP tool `is_trading_day` that returns VN exchange open/holiday/half-day status. Uses embedded HOSE holiday calendar (JSON constants, no network). Required by pressure-state.json emitter (DWF-DEV-CROSS-3).

## [PM] Planning Context

**Zone:** `apps/mcp-server/`

**Acceptance Criteria:**

- [ ] **AC-P0-3-1:** `is_trading_day(date="2025-01-27")` returns `is_trading_day: false, session_status: "holiday"` (Tết Nguyên Đán 2025).
- [ ] **AC-P0-3-2:** `is_trading_day(date="2025-01-04")` returns `is_trading_day: true, session_status: "open"` (known HOSE trading day).
- [ ] **AC-P0-3-3:** `is_trading_day(date="2025-01-11")` returns `is_trading_day: false, session_status: "weekend"` (Saturday).
- [ ] **AC-P0-3-4:** Tool is read-only — writes nothing to database.
- [ ] **AC-P0-3-5:** Tool reachable via gateway wrapper `mcp__claude_ai_gateway__call_tool(server="vn-market", tool="is_trading_day", arguments={...})`.
- [ ] **AC-P0-3-6 (BLOCKING DV):** Deliberate-violation: assert `is_trading_day(date="2025-01-27")` returns `is_trading_day: true` — test must go RED (proves holiday data is not a stub).
- [ ] **AC-P0-3-7:** `toolCount` in mcp-server container increases by exactly 1 after rebuild (verify via container tool list).

**Files to read first:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § ARCH-DECIDE-A, § ARCH-DECIDE-B (embedded calendar rationale)
- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P0-3 (tool contract + ACs)
- `docs/handoffs/DWF-ARCH.md` § Verified Paths (schema, registry pattern)
- Reference: `apps/mcp-server/src/domain/services/financial-reports/earningsCalendar.ts` (static-data DDD pattern)

**Files to create:**

- `apps/mcp-server/src/domain/services/vnHolidayData.ts` — Embedded VN_HOLIDAYS map (YYYY-MM-DD → name) + VN_HALF_DAYS set, covering 2024–2027
- `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` — `isVnTradingDay(date: string): TradingDayResult` pure function; timezone handling for GMT+7; weekend detection via UTC date adjustment
- `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts` — MCP tool registration; schema with optional `date` param; defaults to today VN time
- `apps/mcp-server/src/__tests__/DWF-is-trading-day.test.ts` — Unit tests AC-P0-3-1..7 including DV-holiday-stub (AC-P0-3-6)

**Files to modify:**

- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — Add import + one line push to `toolRegistry` (no server.ts edit needed; see line 147 area in brief)

**Dependencies:**

None. This task is the first Phase 0 prerequisite and unblocks DWF-DEV-MCP-2 and DWF-DEV-CROSS-3.

**Knowledge needed:**

- `docs/policies/dev-standards.md` — DDD layers, testing standards
- `docs/standards/microservice-build-standard.md` § lean standard
- GMT+7 timezone arithmetic (Date.getUTCDay() after offset adjustment for VN midnight)
- Architect design decision ARCH-DECIDE-A (no network, embedded JSON only)

**Implementation notes:**

1. **vnHolidayData.ts** exports:
   - `VN_HOLIDAYS: Record<string, string>` — map of YYYY-MM-DD → Vietnamese holiday name
   - `VN_HALF_DAYS: Set<string>` — known half-day dates (e.g., "2025-01-27" Tết Nguyên Đán would be full day, but day-before-Tết is half-day)
   - Cover 2024–2027 per architect brief

2. **vnTradingCalendar.ts** exports:
   - `isVnTradingDay(date: string): TradingDayResult` where `TradingDayResult = { date: string, is_trading_day: boolean, session_status: "open" | "holiday" | "half_day" | "weekend" | "unknown", exchange: "HOSE" | "HNX", note?: string }`
   - All dates interpreted as YYYY-MM-DD in VN timezone (GMT+7)
   - Saturday/Sunday detection via JS `Date.getUTCDay()` after converting to VN midnight boundary
   - Unknown future dates (> 2027-12-31) → `session_status: "unknown"`, `is_trading_day: false`

3. **isTradingDayTool.ts** registers tool on McpServer:
   - Schema: `{ date?: z.string().optional() }`
   - No `date` param → use today in VN time (compute `new Date()` shifted +7h)
   - Read-only, no DB writes

4. **registry.ts** one-line addition:
   - Import: `import { registerIsTradingDayTool } from "..."`
   - Push: `toolRegistry.push(registerIsTradingDayTool())`

5. **Test DWF-is-trading-day.test.ts** includes:
   - AC-P0-3-1: Holiday test
   - AC-P0-3-2: Open day test
   - AC-P0-3-3: Weekend test
   - AC-P0-3-4: Read-only assertion (coordination.db row count unchanged)
   - AC-P0-3-6 (DV): Deliberate-violation stub test (assert holiday returns true → RED)
   - Edge case: Date > 2027 → `session_status: "unknown"`

**Build & rebuild:**

- Rebuild mcp-server container
- Verify toolCount +1 (AC-P0-3-7)
- Verify all tests pass before unblocking MCP-2 and CROSS-3

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/domain/services/vnHolidayData.ts:108` — Embedded VN_HOLIDAYS (2024–2027) + VN_HALF_DAYS Set + VN_CALENDAR_LAST_YEAR constant
  - `apps/mcp-server/src/domain/services/vnTradingCalendar.ts:160` — isVnTradingDay() pure function + getTodayVnDate() helper; GMT+7 weekend detection via Date.UTC
  - `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts:49` — registerIsTradingDayTool() MCP tool registration; optional date param; defaults to VN today
  - `apps/mcp-server/src/__tests__/DWF-is-trading-day.test.ts:151` — 13 tests: AC-P0-3-1..4, AC-P0-3-6 DV, edge cases (half-day, boundary, invalid format)
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — +2 lines: import + push registerIsTradingDayTool (#147)
- **Tests written:** `apps/mcp-server/src/__tests__/DWF-is-trading-day.test.ts` — 13 tests, 12 GREEN / 1 RED (DV AC-P0-3-6 intentional)
- **Git commits:** `16117375` feat(mcp-server/is-trading-day): DWF-DEV-MCP-1 add is_trading_day tool with embedded VN calendar
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test (DWF file):** 12 pass / 1 fail (AC-P0-3-6 DV RED — correct, proves calendar is real)
- **Pre-existing failure:** `get_price_history` test was failing before this task (confirmed via git stash check — not introduced by this change)
- **Tool count:** 157 tools (was 156, +1 for is_trading_day #147)
- **Scheduler count:** 70 cron.schedule entries (unchanged — did not touch startScheduler.ts)
- **AC status:**
  - AC-P0-3-1: GREEN — 2025-01-27 → {is_trading_day: false, session_status: "holiday"}
  - AC-P0-3-2: GREEN — 2025-01-06 (Monday) → {is_trading_day: true, session_status: "open"} (spec date 2025-01-04 is actually Saturday; corrected to nearest Monday)
  - AC-P0-3-3: GREEN — 2025-01-11 (Saturday) → {is_trading_day: false, session_status: "weekend"}
  - AC-P0-3-4: GREEN — read-only, domain layer only, zero DB imports
  - AC-P0-3-5: PENDING — requires container rebuild + gateway call (AC-P0-3-7 handles this)
  - AC-P0-3-6 DV: RED (correct) — asserting holiday returns true fails, proves calendar not stub
  - AC-P0-3-7: PENDING — requires container rebuild to verify toolCount +1 in container
- **Docs updated:** NONE (no service-level docs required for new tool addition)
- **Graphify:** skipped (no docs impacted)

---

## RETURN

Upon completion, developer will commit with trailers per `docs/policies/commit-convention.md`:

```
feat(mcp-server/is-trading-day): add is_trading_day tool with embedded VN calendar

Add domain service vnTradingCalendar.ts with pure isVnTradingDay() function
using embedded holiday data (vnHolidayData.ts constants). Register isTradingDayTool.ts
on MCP registry. All tests pass including DV-holiday-stub (AC-P0-3-6 RED→GREEN).
Tool count +1 verified.

Task: DWF-DEV-MCP-1
AC: AC-P0-3-1, AC-P0-3-2, AC-P0-3-3, AC-P0-3-4, AC-P0-3-5, AC-P0-3-6, AC-P0-3-7
```

Then PM will unblock DWF-DEV-MCP-2 and DWF-DEV-CROSS-3.
