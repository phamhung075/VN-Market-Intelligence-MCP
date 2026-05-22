---
task_id: P2-B1
title: "Rewire TA callers to HTTP (assembleBriefing + technicalIndicatorTools + type fixes)"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G5"]
files_touched:
  - "apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts (MODIFY)"
  - "apps/mcp-server/src/application/usecases/assembleBriefing.ts (MODIFY)"
  - "apps/mcp-server/src/__tests__/1408-tool-diacritics.test.ts (MODIFY — type import redirect)"
  - "apps/mcp-server/src/__tests__/1410-tool-diacritics-sweep.test.ts (MODIFY — type import redirect)"
status: "READY (P2-B0 done — next-up after A1/F2 land per WIP=2 rule)"
blocked_by: ["P2-B0"]
unblocks: ["P2-B2"]
estimate_hours: 1.0
ac_count: 10
---

# P2-B1 — Rewire TA Callers to HTTP (assembleBriefing + tool handler + type fixes)

**Goal:** G5 (Old TA code deleted)

**Scope Expansion:** Based on P2-B0 brownfield audit (commit `c175f745`), B1 scope now includes:
- Primary: `technicalIndicatorTools.ts` rewire to HTTP (A2 from audit)
- Secondary: `assembleBriefing.ts` rewire of `computeRSI` + `computeMA` calls (B1 from audit — SEV-2 gap vs architect pre-scan)
- Tertiary: `DailyCandle` type redirect in test files 1408 + 1410 (B2/B3 from audit — SEV-3 compile error prevention)

**Rationale:** Deleting `technicalIndicators.ts` (A1) in P2-B2 without fixing B1 (`assembleBriefing.ts`) will break the morning briefing at runtime. This is a SEV-2 blocking issue identified in the B0 audit.

---

## Files Touched

- `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` (MODIFY — HTTP rewire + local type definition)
- `apps/mcp-server/src/application/usecases/assembleBriefing.ts` (MODIFY — rewire computeRSI/computeMA calls)
- `apps/mcp-server/src/__tests__/1408-tool-diacritics.test.ts` (MODIFY — redirect DailyCandle type import)
- `apps/mcp-server/src/__tests__/1410-tool-diacritics-sweep.test.ts` (MODIFY — redirect DailyCandle type import)

---

## Acceptance Criteria

### Primary Scope (technicalIndicatorTools.ts HTTP rewire — A2 from P2-B0 audit)

1. **AC-1**: `technicalIndicatorTools.ts` no longer imports from `../../../../domain/services/technicalIndicators.js`
2. **AC-2**: Instead, it calls the existing HTTP client in `apps/mcp-server/src/infrastructure/microservices/clients.ts` (the `ta` entry at port 5003 is already wired)
3. **AC-3**: The MCP tool `get_technical_indicators` continues to accept the same input schema (symbol, optional period) and returns the same output format visible to Claude
4. **AC-4**: HTTP call uses `POST /ta/indicators` matching the Go service's `api/openapi.yaml`
5. **AC-5**: Error handling: if the Go service returns non-200 or times out, the tool returns a user-friendly error (not a raw stack trace)
6. **AC-6**: After AC-1 through AC-5, `technicalIndicatorTools.ts` defines a local `interface ToolCandle` (or re-exports a type from a shared types file) to avoid the DailyCandle type conflict described in P2-B0 §D

### Secondary Scope (assembleBriefing.ts rewire — B1 from P2-B0 audit, SEV-2)

7. **AC-7**: `apps/mcp-server/src/application/usecases/assembleBriefing.ts` no longer imports `computeRSI` or `computeMA` from the domain service
8. **AC-8**: Instead, `assembleBriefing.ts` either (a) defines local pure-math helper functions for `computeRSI` and `computeMA` inline, OR (b) calls the Go HTTP client for these functions. Local helpers are preferred for latency budget (computation already in-memory on price arrays). Document the choice in the commit message.

### Tertiary Scope (DailyCandle type redirect — B2/B3 from P2-B0 audit, SEV-3)

9. **AC-9**: Test files `1408-tool-diacritics.test.ts` and `1410-tool-diacritics-sweep.test.ts` update their `DailyCandle` type import to point to the new type source (either from `technicalIndicatorTools.ts` post-rewire if re-exported, or from a shared types file)

### Integration & Verification

10. **AC-10**: `cd apps/mcp-server && bun test && bun tsc --noEmit` both exit 0. Morning briefing assemble produces valid output post-rewire (smoke test: run `get_morning_briefing` MCP tool on a test stock, verify output structure matches pre-rewire format).

---

## Pre-Step (Before P2-B2 Deletion Commit)

**CRITICAL:** Before any deletion commit in P2-B2, create a rollback marker:

```bash
git tag p2-b-pre-delete
```

This tag marks the state immediately after B1 lands (all callers rewired, TS domain service still in place). If deletion in P2-B2 breaks something unforeseen, rollback via `git revert <delete-commit-hash>` (single atomic commit, no force-push required).

**Responsibility:** dev-technical-analysis author of P2-B1 will document the tag creation in the final commit message or in a note to P2-B2 author.

---

## Smoke Check

```bash
cd apps/mcp-server && bun test && bun tsc --noEmit
```

Both must exit 0. Additionally:

```bash
# Verify no direct imports of technicalIndicators remain (except _deprecated/ after P2-B2)
grep -r "from.*technicalIndicators" apps/mcp-server/src/ --include="*.ts" | grep -v "_deprecated"
# Expected: 0 results (no hits outside _deprecated/)
```

Morning briefing assemble smoke test (optional, manual verification):
- Call `get_morning_briefing` MCP tool on a test stock (e.g., VNM)
- Verify output contains expected fields: `rsi`, `ma`, `macd` (via Go service)
- Verify output format matches pre-rewire baseline

---

## Atomic Commit Format

```
feat(technical-analysis): P2-B1 — rewire TA callers to HTTP (assembleBriefing + tool handler + type fix)

Primary: technicalIndicatorTools.ts → HTTP port 5003 (POST /ta/indicators).
Secondary: assembleBriefing.ts computeRSI/computeMA → local helpers or HTTP.
Tertiary: DailyCandle type imports redirected in test files 1408, 1410.

Scope expansion per P2-B0 audit (c175f745): SEV-2 gap (assembleBriefing.ts rewire required for B2 deletion).
Local ToolCandle type defined in technicalIndicatorTools.ts to resolve type conflict.

Sprint: <sprint>
Task: P2-B1
AC-1..AC-10: technicalIndicatorTools HTTP rewire / assembleBriefing fix / type redirect / bun test + tsc pass / pre-step git tag documented
```

---

## B0 Audit Cross-Reference (Scope Expansion)

**Audit Doc:** `docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md`

P2-B0 audit (commit `c175f745`) surfaced **additional callers NOT in the architect's pre-scan**:
- **A2** `technicalIndicatorTools.ts` — primary rewire target (as planned)
- **B1** `assembleBriefing.ts` — **SEV-2 gap**: imports `computeRSI` + `computeMA` directly. Deleting A1 without fixing B1 breaks morning briefing at runtime.
- **B2/B3** `1408-tool-diacritics.test.ts` + `1410-tool-diacritics-sweep.test.ts` — **SEV-3**: type-only imports of `DailyCandle`. Will fail `bun tsc --noEmit` after A1 deletion.
- **B4/B5** Already HTTP-routed or false positives (no action required).

**Architect Decision:** P2-B1 scope must expand to cover B1 (assembleBriefing fix) + B2/B3 (type redirect) in the same atomic window. Estimate remains ≤1h (was 45 min, now ~1h with extra rewires).

**Signal File:** `docs/signals/main-router-P2-B0-finding-20260523T223500Z.json` — escalated the SEV-2 gap to ensure scope expansion before B1 dispatch.

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G5   | IN-PROGRESS (caller rewires + type fixes, all 4 files) |

---

## Dependencies

**Upstream:** P2-B0 (caller inventory identified, commit `c175f745`)
**Downstream:** P2-B2 (domain service moves to `_deprecated/`; must not proceed until B1 complete + tag `p2-b-pre-delete` created)

---

## DailyCandle Type Conflict Resolution (§D from P2-B0 audit)

**Background:** Two incompatible `DailyCandle` interfaces exist:
1. `domain/services/technicalIndicators.ts`: `{ day: string; close: number }` (TA-specific minimal shape)
2. `domain/repositories/IBacktestPriceRepository.ts`: `{ date: string; open/high/low/close; volume }` (full OHLCV for backtesting)

**Issue:** After A1 deletion, any file importing `DailyCandle` from `technicalIndicators.ts` will get a compile error.

**Resolution Strategy:**
- In `technicalIndicatorTools.ts` (A2), after removing the domain import, define a local type: `interface ToolCandle { day: string; close: number }`
- OR: Extract `ToolCandle` to a shared types file (e.g., `domain/types/marketDataTypes.ts`) and re-export from the tool handler
- Update tests 1408 and 1410 to import from the new source
- **DO NOT reuse `IBacktestPriceRepository.DailyCandle`** — shapes are incompatible

**AC-6 + AC-9 cover this resolution** — no separate commit needed; both are in-scope for the main B1 rewire commit.

---

## Testing Notes

- Update mock setup in tests to simulate HTTP calls to port 5003 (e.g., via Bun mock/fetch)
- Ensure error cases are tested: Go service down, timeout, invalid response
- Verify test output format matches Claude's expected MCP tool response pre-rewire
- Morning briefing flow must still produce valid output (schema match check)
- Type compile check: `bun tsc --noEmit` must pass with zero `DailyCandle` conflicts
