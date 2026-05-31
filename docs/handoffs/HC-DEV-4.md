---
task_id: HC-DEV-4
sprint: BCTC-HUMAN-CONFIRM
agent: dev-mcp-server
status: READY
zone: apps/mcp-server/
depends_on: [HC-DEV-1]
blocks: none
date_assigned: 2026-05-30
---

# HC-DEV-4 — MCP Tools + Registry

**Scope:** Two new MCP tools for remote agent access: `list_flagged_bctc_cells` and `submit_bctc_correction`. Wire them into the tool registry. These are the agent-facing API for correction submission and flag enumeration.

**Atomic goal:** Both tools (#145, #146) registered, callable with proper Zod input schemas, delegate to HC-DEV-1 services, return correct shapes. Agents can discover and call them via the gateway.

**DEPENDS ON:** HC-DEV-1 (needs services)

---

## Files to Create

### MCP Tool Implementations (2 new files)

**`apps/mcp-server/src/interface/mcp/tools/financial-reports/listFlaggedBctcCellsTool.ts`**

```typescript
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { bctcFlagEnumerationService } from "../../application/usecases/bctcFlagEnumerationService.js";

const schema = z.object({
  report_id: z.string().uuid("must be valid UUID"),
});

export type ListFlaggedBctcCellsInput = z.infer<typeof schema>;

export function listFlaggedBctcCellsTool(db: Database) {
  return {
    name: "list_flagged_bctc_cells",
    description: "Enumerate all red and yellow flagged BCTC cells for a report with OCR/image values and correction status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        report_id: {
          type: "string",
          description: "Financial report UUID",
        },
      },
      required: ["report_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const parsed = schema.parse(input);
      
      const result = bctcFlagEnumerationService.enumerateFlaggedCells(db, parsed.report_id);
      
      return {
        type: "text" as const,
        text: JSON.stringify(result),
      };
    },
  };
}
```

- Input: `{ report_id: z.string().uuid() }`
- Returns: `FlagEnumerationResult` as JSON string
- Returns `{ flags: [] }` (not error) on empty (AC-FR8-2)
- Delegates to service from HC-DEV-1

**`apps/mcp-server/src/interface/mcp/tools/financial-reports/submitBctcCorrectionTool.ts`**

```typescript
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { bctcCorrectionService } from "../../application/usecases/bctcCorrectionService.js";

const schema = z.object({
  report_id: z.string().uuid("must be valid UUID"),
  row_id: z.number().int("must be integer"),
  new_value: z.number("must be numeric"),
  correction_source: z.string().optional().default("human_ui"),
});

export type SubmitBctcCorrectionInput = z.infer<typeof schema>;

export function submitBctcCorrectionTool(db: Database) {
  return {
    name: "submit_bctc_correction",
    description: "Submit a human-confirmed correction for a flagged BCTC cell. Updates bctc_table_rows.value_current and source_confidence.",
    inputSchema: {
      type: "object" as const,
      properties: {
        report_id: {
          type: "string",
          description: "Financial report UUID",
        },
        row_id: {
          type: "number",
          description: "bctc_table_rows.id — the row to correct",
        },
        new_value: {
          type: "number",
          description: "The corrected numeric value",
        },
        correction_source: {
          type: "string",
          description: "Source of correction (default: 'human_ui')",
        },
      },
      required: ["report_id", "row_id", "new_value"],
    },
    execute: async (input: Record<string, unknown>) => {
      const parsed = schema.parse(input);
      
      const result = bctcCorrectionService.submitCorrection(db, {
        report_id: parsed.report_id,
        row_id: parsed.row_id,
        new_value: parsed.new_value,
        correction_source: parsed.correction_source,
      });
      
      return {
        type: "text" as const,
        text: JSON.stringify(result),
      };
    },
  };
}
```

- Input: `{ report_id: UUID, row_id: integer, new_value: number, correction_source?: string }`
- Returns: `CorrectionResult` as JSON string
- Delegates to service from HC-DEV-1
- Shared service as HTTP handler (zero duplication)

---

## Files to Modify

**`apps/mcp-server/src/interface/mcp/tools/registry.ts`**

Find the imports block (lines ~104-109) and add:
```typescript
import { listFlaggedBctcCellsTool } from "./financial-reports/listFlaggedBctcCellsTool.js";
import { submitBctcCorrectionTool } from "./financial-reports/submitBctcCorrectionTool.js";
```

Find the tool registration array and add at the end (after current #144):
```typescript
{
  tool_id: 145,
  name: "list_flagged_bctc_cells",
  maker: (db: Database) => listFlaggedBctcCellsTool(db),
},
{
  tool_id: 146,
  name: "submit_bctc_correction",
  maker: (db: Database) => submitBctcCorrectionTool(db),
},
```

**Pattern match:** follow existing entries at lines ~107-109 (tool_id increment, name string, maker function signature).

**`apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts`**

Add barrel exports:
```typescript
export { listFlaggedBctcCellsTool } from "./listFlaggedBctcCellsTool.js";
export { submitBctcCorrectionTool } from "./submitBctcCorrectionTool.js";
export type { ListFlaggedBctcCellsInput, SubmitBctcCorrectionInput } from "./listFlaggedBctcCellsTool.js";
export type { SubmitBctcCorrectionInput } from "./submitBctcCorrectionTool.js";
```

Pattern: follow existing barrel exports (one line per file).

---

## Acceptance Criteria

### AC-HC-DEV-4-1 `list_flagged_bctc_cells` Tool
- [ ] Tool name: `list_flagged_bctc_cells` (registry #145)
- [ ] Input schema: `{ report_id: z.string().uuid() }`
- [ ] Returns: `FlagEnumerationResult` with `flags: FlaggedCell[]`
- [ ] Returns empty list (not error) when no flags (AC-FR8-2)
- [ ] Delegates to `bctcFlagEnumerationService.enumerateFlaggedCells()`

### AC-HC-DEV-4-2 `submit_bctc_correction` Tool
- [ ] Tool name: `submit_bctc_correction` (registry #146)
- [ ] Input schema: `{ report_id: UUID, row_id: integer, new_value: number, correction_source?: string }`
- [ ] Returns: `CorrectionResult` with `ok`, `row_id`, `new_value`, `source_confidence`, or `error`/`http_status`
- [ ] Validates input types (UUID, integer, number)
- [ ] Delegates to `bctcCorrectionService.submitCorrection()` (shared with HTTP handler)

### AC-HC-DEV-4-3 Registry
- [ ] Both tools registered in `registry.ts` with correct IDs (#145, #146) and maker functions
- [ ] Barrel exports added to `financial-reports/index.ts`
- [ ] Tool maker function receives `db: Database` parameter (DI pattern)

### AC-HC-DEV-4-4 Service Sharing
- [ ] `submitBctcCorrectionTool` uses same `bctcCorrectionService` as `bctcCorrectHandler` (zero duplication)
- [ ] Both return same result shape

---

## DV Test Requirements (RED-before, GREEN-after, same commit)

**Test file:** `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts` (continues from earlier tasks)

**Minimum DV tests for HC-DEV-4 coverage (from brief §5.1):**
- DV-HC-10: `submit_bctc_correction` MCP tool delegates to same service as HTTP handler (spy on `bctcCorrectionService.submitCorrection`; verify called once from both paths)

Tests use in-memory DB with service spy/mock. Verify tool output via JSON parse + shape validation.

---

## Exit Criteria

1. Two tool files created with correct schemas and delegations
2. Registry updated with entries #145 and #146
3. Barrel exports added to `financial-reports/index.ts`
4. HC-DEV-4 DV tests RED (baseline), GREEN after code
5. **Tool contract verified:**
   - Both tools callable with correct input schemas
   - Both return correct output shapes (JSON-serializable)
   - Service delegation verified (same service instance shared with HTTP handlers)

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add` per file, never `-A`
- DV tests RED-before/GREEN-after, same commit as production
- Service sharing with HTTP handlers (zero duplication)
- MCP tools use `mcp__claude_ai_gateway__call_tool` wrapper on caller side (not relevant here)
- Never ask user to run code

---

## RETURN

```
READY: HC-DEV-4 handoff. Two MCP tools + registry.
ZONE: apps/mcp-server/
DEPENDS_ON: HC-DEV-1 (services)
BLOCKS: none (independent)
DV_TESTS: DV-HC-10
NEXT: dev-mcp-server — implement tools and DV-test
DURATION: ~1h (2 tools + registry + barrel)
SERIALIZATION: HC-DEV-1 must be done first; can be parallel to HC-DEV-2/3
```
