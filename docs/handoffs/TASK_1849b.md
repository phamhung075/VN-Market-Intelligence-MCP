# TASK-1849b — MCP Tool Upgrade + serializeReport Fix

**Sprint:** 1849
**Type:** SPRINT-S
**Priority:** MEDIUM
**Owner:** dev-mcp-server
**Status:** Todo
**Handoff Created:** 2026-05-07

---

## Objective

Update `process_telegram_report()` MCP tool to accept optional `resolution` parameter, wire it to `markResolved()` store function, and fix `serializeReport()` to include all fields (C-2 constraint).

---

## Acceptance Criteria

### AC-1: MCP Tool Signature Update (telegramReportTools.ts)

- [ ] File: `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts`
- [ ] Extend `process_telegram_report` Zod schema:
  ```typescript
  resolution: z.enum(["none", "fixed", "wontfix", "duplicate", "monitoring"]).optional().default("none")
  ```
- [ ] Keep existing parameters: `id` (required), `delete_telegram_message` (optional)
- [ ] Tool description updated to explain resolution field

### AC-2: MCP Tool Implementation

- [ ] When `resolution` provided (not 'none'):
  - Look up report by id
  - Call `markResolved(db, id, resolution, new Date().toISOString())`
  - Proceed to delete Telegram message if requested
  - Return success confirmation with resolution value in response
- [ ] When `resolution` NOT provided OR = 'none':
  - Old behavior preserved (backward-compatible)
  - No call to `markResolved()`
  - Report resolution remains unchanged
- [ ] Parameterized queries (no SQL injection)

### AC-3: Backward-Compatibility

- [ ] Existing calls `process_telegram_report(id=42)` work unchanged
- [ ] Existing calls `process_telegram_report(id=42, delete_telegram_message=true)` work unchanged
- [ ] Default resolution = 'none' (no side effects on old code paths)
- [ ] Error handling: if markResolved() fails, log error but don't break tool execution

### AC-4: serializeReport() Fix (C-2 Constraint)

- [ ] File: `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts`
- [ ] Update serializeReport() to include all fields in JSON output:
  - id
  - message_id
  - text
  - from_agent
  - priority
  - status
  - created_at
  - claimed_by (was omitted — ADD)
  - claimed_at (was omitted — ADD)
  - resolution (new field)
  - resolved_at (new field)
- [ ] Output format:
  ```json
  {
    "id": 42,
    "message_id": "12345",
    "text": "...",
    "from_agent": "dev-alert-engine",
    "priority": "high",
    "status": "new",
    "created_at": 1715070000,
    "claimed_by": "developer",
    "claimed_at": "2026-05-07T10:00:00Z",
    "resolution": "none",
    "resolved_at": null
  }
  ```

### AC-5: Tests (telegramReportTools.test.ts or 226-telegram-report-store.test.ts)

- [ ] File: `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts` or new file
- [ ] Add test cases:
  - `process_telegram_report(id, resolution="fixed")` calls markResolved() + deletes message
  - `process_telegram_report(id, resolution="monitoring")` sets resolution without deleting message
  - `process_telegram_report(id)` without resolution parameter — backward-compat, no resolution change
  - `serializeReport()` output includes all 11 fields
  - Invalid resolution value rejected by Zod schema
- [ ] At least 3 new test cases
- [ ] All new tests pass: `bun test`
- [ ] Baseline maintained: ≥8804 tests pass, 0 fail

### AC-6: No Regressions

- [ ] Run `bun test` — entire test suite passes
- [ ] No tsc errors or warnings
- [ ] Existing tool tests still pass (no breaking changes)

---

## Implementation Notes

### Files to Modify

| File | Changes | Estimated Lines |
|------|---------|-----------------|
| `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` | Zod schema + tool impl + serializeReport() | 45 |
| `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts` | Add 3 new tool-level tests | 30 |

**Total: ~75 lines**

### Zod Schema Pattern

```typescript
export const ProcessTelegramReportInput = z.object({
  id: z.number().int().positive().describe("Telegram report ID"),
  resolution: z.enum(["none", "fixed", "wontfix", "duplicate", "monitoring"])
    .optional()
    .default("none")
    .describe("How the underlying issue was resolved"),
  delete_telegram_message: z.boolean().optional().describe("Delete Telegram message?"),
});
```

### Tool Impl Pattern

```typescript
export async function processTelegramReport(params: z.infer<typeof ProcessTelegramReportInput>): Promise<{...}> {
  const db = getDb();
  const report = db.prepare(`SELECT * FROM telegram_reports WHERE id = ?`).get(params.id) as TelegramReport | undefined;
  if (!report) throw new Error(`Report ${params.id} not found`);

  // Mark resolution if provided
  if (params.resolution && params.resolution !== "none") {
    markResolved(db, params.id, params.resolution, new Date().toISOString());
  }

  // Delete Telegram message if requested
  if (params.delete_telegram_message) {
    await deleteTelegramMessage(report.message_id);
  }

  return {
    success: true,
    id: params.id,
    resolution: params.resolution,
    message: `Report ${params.id} processed with resolution: ${params.resolution}`,
  };
}
```

### Key Constraints from Architect

- **C-1:** Resolution enum = 5 values only (none/fixed/wontfix/duplicate/monitoring) — NO "claimed"
- **C-2:** serializeReport() must include all 11 fields (was omitting claimed_by/claimed_at)

---

## Definition of Done

- [ ] AC-1..6 all checked
- [ ] Zod schema validates 5-value enum
- [ ] Tool backward-compatible (old calls still work)
- [ ] serializeReport() projects all 11 fields
- [ ] Tests pass: `bun test` ≥8804 pass, 0 fail
- [ ] No regressions in existing tool tests
- [ ] Code review: confirm no SQL injection, enum values correct
- [ ] Task report created in `reports/TASK_REPORT_1849b.md`

---

## Dependencies

- Requires 1849a to be merged first (markResolved function must exist)
- Can run in parallel with 1849a (different files, no conflicts)
- Must complete before 1849c

---

## Error Handling

- If `markResolved()` throws:
  - Log error to WORK channel
  - Return success but with warning flag
  - Do not break tool execution
- If Telegram message deletion fails:
  - Log error but don't fail tool
  - Return success with "message_delete_failed" flag

