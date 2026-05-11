# TASK REPORT 1293b — MCP Signal Validation for Chain Signals

| Field | Value |
|---|---|
| Task ID | 1293b |
| Sprint | 1293 — REQ-1293 Signal Quality Root Cause Fix |
| Branch | task/1293b-mcp-signal-validation |
| Verdict | **APPROVED** |
| Date | 2026-04-23 |
| Reviewer | QA Agent |

---

## Summary

Implements post_agent_signal validation layer for chain_catalyst, price_confirmation, urgent_news, and cross_validate signal types using strict Zod schemas. Rejects incomplete payloads BEFORE DB storage with detailed field-level error messages. Prevents agents from posting signals with missing required fields (e.g., confidence, direction, affected_stocks).

**Root cause fixed**: Prior to this task, MCP tool only validated cross_validate signals. Agents could post chain_catalyst/price_confirmation/urgent_news signals with missing numeric fields → chain synthesizer received incomplete data → causal chains broke downstream.

---

## Test Results

| Check | Status | Details |
|---|---|---|
| `bun test src/__tests__/1293b-*.test.ts` | ✅ PASS | 20/20 tests PASS |
| `bun test` (full regression) | ✅ PASS | 6373 pass (baseline 6353 +20) |
| `bun tsc --noEmit` | ✅ PASS | 0 TypeScript errors |

---

## Acceptance Criteria Verification

| AC | Description | Result |
|---|---|---|
| AC-1 | Valid payload (all 7 fields) for chain_catalyst accepted → stored + success response | PASS (test line 53–66) |
| AC-2 | Missing required field (event_type, confidence, etc.) → rejected + error response with field name | PASS (tests lines 68–189) |
| AC-3 | Null/undefined required field → rejected (even with other fields present) | PASS (tests lines 87–108, 224–243) |
| AC-4 | Extra fields in finding_data → accepted (forward compatible) | PASS (tests lines 366–395) |
| AC-5 | chain_catalyst: 7 fields (event_type, direction, confidence, affected_stocks, affected_sectors, headline, source) | PASS |
| AC-6 | price_confirmation: 5 fields (price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence) | PASS |
| AC-7 | urgent_news: 3 fields (headline, source, severity) | PASS (tests lines 285–340) |
| AC-8 | cross_validate (3 fields: direction, confidence, summary) backward compatible | PASS (test lines 343–352) |
| AC-9 | Unknown signal types pass through with warning log (forward compatible) | PASS (test lines 354–362, console.warn at line 104) |
| AC-10 | confidence must be in [0.0, 1.0] | PASS (schema line 67, test lines 171–188) |
| AC-11 | affected_stocks, affected_sectors must be non-empty arrays | PASS (schema line 68, tests lines 131–150) |
| AC-12 | affected_stocks as string instead of array → rejected | PASS (test lines 110–129) |
| AC-13 | volume_ratio must be >= 0 | PASS (schema line 101, test lines 264–281) |
| AC-14 | confirms_direction must be boolean | PASS (schema line 102, test lines 245–262) |

---

## Code Quality Checks

| Check | Status | Notes |
|---|---|---|
| DDD Layering (domain→infrastructure) | ✅ PASS | signalTypes.ts imports only `zod` (no infra imports). agentSignalTools.ts is interface layer (correct to import infrastructure). |
| DDD Layering (domain→application) | ✅ PASS | No cross-layer violations. |
| Security (process.env usage) | ✅ PASS | No process.env calls in modified files. |
| Security (SQL injection) | ✅ PASS | No SQL in these files; validation is schema-only. |
| Test coverage | ✅ PASS | 20 tests covering: 7 chain_catalyst cases, 5 price_confirmation cases, 4 urgent_news cases, 2 backward compat cases, 2 forward compat cases. |
| Error messages | ✅ PASS | Zod parse errors mapped to human-readable format: `"field_name: message"`. Agent receives clear feedback (e.g., `"confidence: Number must be less than or equal to 1"`). |

---

## Implementation Details

### Validation Function (exported, testable)
- **Location**: `src/interface/mcp/tools/news-analysis/agentSignalTools.ts:93–119`
- **Behavior**: Maps signal_type to Zod schema; calls `schema.safeParse()` on finding_data; returns `{ valid: true }` or `{ valid: false; errors: [] }`
- **Unknown types**: Logged with `console.warn()` and passed through (forward compatibility for future signal types)

### MCP Tool Integration
- **Location**: `post_agent_signal` handler, `agentSignalTools.ts:205–222`
- **Fail-fast**: Validation runs BEFORE `postSignal(db, signalInput)` call at line 244
- **Error response**: Returns MCP error with detailed field-level messages (e.g., `"confidence: Number must be less than or equal to 1"`)
- **Backward compatibility**: `finding_data` is optional in MCP args; defaults to `{}` if not provided (line 234)

### Signal Type Schemas (Task 1293a)
Imported from `src/domain/signals/signalTypes.ts`:
- ChainCatalystFindingDataSchema (7 required fields, numeric ranges, enum validation)
- PriceConfirmationFindingDataSchema (5 required fields, numeric constraints)
- UrgentNewsFindingDataSchema (3 required fields, enum validation)
- CrossValidateFindingDataSchema (3 required fields, existing type now validated)

---

## Changed Files

| File | Lines | Change |
|---|---|---|
| `src/domain/signals/signalTypes.ts` | 1–169 | Added CrossValidateFindingDataSchema (3 required fields); updated SignalSchemas barrel export. |
| `src/interface/mcp/tools/news-analysis/agentSignalTools.ts` | 33–37, 70–119, 205–222 | Imported 4 Zod validators; created SIGNAL_TYPE_VALIDATORS map; implemented validateSignalPayload() function; integrated validation into post_agent_signal handler before DB storage. |
| `src/__tests__/1293b-post-signal-validation.test.ts` | NEW | 20 test cases: chain_catalyst (7), price_confirmation (5), urgent_news (4), backward compat (2), forward compat (2). |

---

## Backward & Forward Compatibility

✅ **Backward**: cross_validate signals continue to work (now with validation). Existing test suite passes without modification.

✅ **Forward**: Unknown signal types (added in future) pass through with console.warn() instead of blocking. Extra fields in payloads are accepted (Zod strict schemas still allow unknown keys on z.object() without .passthrough() — they are silently stripped, not rejected).

⚠️ **Note**: Task 1293c (DB audit log) will add rejection logging to a signal_rejections table. Task 1293d will add synthesizer fallbacks for missing fields in downstream chain processing.

---

## Merge Status

✅ **Approved for merge to main**

- All 20 unit tests PASS
- Full regression suite PASS (6373 tests)
- TypeScript clean (0 errors)
- DDD and security checks PASS
- All ACs verified
- Forward/backward compatibility confirmed

---

## Next Steps

1. **Merge** to main: `git merge --no-ff task/1293b-mcp-signal-validation`
2. **Task 1293c**: Add signal rejection logging layer (signal_rejections table) + audit trail
3. **Task 1293d**: Add synthesizer fallbacks for missing finding_data fields
4. **Testing**: Verify in Claude Desktop with agents sending malformed signals; error messages should be clear + actionable

---

## Review Record

- **Verdict**: APPROVED
- **Blocking Issues**: None
- **Non-blocking**: None (all ACs satisfied)
- **Files Confirmed Clean**:
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/signals/signalTypes.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/news-analysis/agentSignalTools.ts
  - /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1293b-post-signal-validation.test.ts
