---
id: SUBTASK-OHLCV-WRITER-2-SSOT-ANNOTATION
task_id: SUBTASK-OHLCV-WRITER-2-SSOT-ANNOTATION
parent_task: ARCH-OHLCV-WRITER-SSOT-DURABLE
version: "2026-06-17"
zone: apps/mcp-server/
owner: dev-mcp-server
priority: P0
status: READY
type: ENHANCEMENT
size: XS
---

# SUBTASK-2: Add SSOT writer-bypass annotation to ohlcvWriteService.ts

---

## Context

This is a **documentation-level hardening** task for the OHLCV writer-bypass class closure. The problem: the codebase contains 8 writers into `daily_ohlcv`, but there is no SSOT document listing them and their dispositions (Migrated / Fixed / In-scope bypass with sentinel). Future developers cannot know whether a raw INSERT they see is intentional or a bug.

The architect's design calls for:
1. **JSDoc annotation** at the top of `ohlcvWriteService.ts` documenting the exhaustive writer inventory
2. **Sentinel pattern documentation:** `/* OHLCV-WRITE-BYPASS-ALLOWED */` explained
3. (Follow-on, NOT P0): Custom ESLint rule enforcing the sentinel pattern

This task covers items 1 and 2 — the P0 documentation scope.

---

## Files to Modify

### Primary: `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts`

Add a **comprehensive JSDoc block** at the top of the file (before the file-level exports and before the first class/function definition) documenting the writer inventory.

**Template:**

```typescript
/**
 * OHLCV Write Service — SSOT for daily_ohlcv writes
 *
 * This service is the authoritative chokepoint for all writes to daily_ohlcv.
 * It enforces:
 * - C=0 rejection (no zero-close stubs)
 * - FR-S1 flat-seed skipping (no vol=0 && O=H=L=C stubs)
 * - Unit normalization (VND scale)
 * - Duplicate detection
 *
 * WRITER INVENTORY (post-FIX-OHLCV-WRITER-SSOT-DURABLE):
 *
 * | Writer | File | SQL Path | Status | Notes |
 * |--------|------|----------|--------|-------|
 * | A (pushPricesHandler) | interface/mcp/routes/pushPricesHandler.ts | writeOhlcvBatch (intraday) | Migrated | Real-time market open / intraday writes |
 * | C (ohlcvDailyAggregatorJob) | scheduler/market-data/ohlcvDailyAggregatorJob.ts | writeOhlcvBatch (backfill) | Migrated | Daily aggregation from minute bars |
 * | D (taOhlcvBackfillJob) | scheduler/market-data/taOhlcvBackfillJob.ts | writeOhlcvBatch (backfill) | Migrated | Historical backfill for TA indicators |
 * | E (ohlcvBackfill.ts) | infrastructure/fetchers/ohlcvBackfill.ts | INSERT OR IGNORE (historical) | In-scope bypass | Historical backfill, guarded, sentinel required |
 * | F (priceBackfillService.ts) | domain/services/priceBackfillService.ts | INSERT OR IGNORE (historical mock) | In-scope bypass | Historical mock data, sentinel required |
 * | G (writeForeignFlowToOhlcv) | infrastructure/db/ohlcvForeignFlowStore.ts | UPDATE-only (merge) | Fixed | No INSERT stub; defers on absent row (/goal#1) |
 * | H (server.ts push-ohlcv-history) | interface/mcp/server.ts:1243-1256 | ON CONFLICT DO UPDATE (guarded) | In-scope bypass | Secondary push path, has C=0/vol=0 guard, sentinel required |
 *
 * WRITER-BYPASS PATTERN:
 *
 * Writers E, F, H are "in-scope bypasses" — they write directly to daily_ohlcv
 * WITHOUT routing through writeOhlcvBatch SSOT, BUT they have legitimate justifications
 * and are guarded against stub injection. They must have the sentinel comment:
 *
 *   // /* OHLCV-WRITE-BYPASS-ALLOWED */ — [justification: e.g. "historical backfill, guarded by FR-S1"]
 *   const sql = `INSERT OR IGNORE INTO daily_ohlcv ...`;
 *
 * Any new raw INSERT into daily_ohlcv that does NOT have this sentinel is an
 * ARCHITECTURAL VIOLATION and must be escalated.
 *
 * FUTURE HARDENING (follow-on LINT-OHLCV-WRITE-BYPASS):
 * A custom ESLint rule will enforce this pattern at lint time. For now,
 * this JSDoc is the authoritative human-readable inventory.
 */
```

Insert this JSDoc block at the very top of the file (after any module-level imports/exports that must come first, but BEFORE any class or function definitions).

---

## Detailed Annotation Sections

### 1. **Writer Inventory Table**

The table MUST include all 8 writers with these columns:
- **Writer** — single letter + brief name
- **File** — exact file path (e.g., `infrastructure/fetchers/ohlcvBackfill.ts`)
- **SQL Path** — the mechanism (e.g., `INSERT OR IGNORE`, `writeOhlcvBatch`, `UPDATE-only`)
- **Status** — one of: `Migrated` (uses writeOhlcvBatch), `Fixed` (no INSERT stub), or `In-scope bypass` (direct INSERT with justification)
- **Notes** — brief explanation (e.g., "Real-time market open", "Historical backfill, guarded", "No INSERT stub; defers on absent row")

Reference the architect brief's §"Writer Inventory" for the canonical list.

### 2. **Sentinel Pattern Documentation**

Explain the `/* OHLCV-WRITE-BYPASS-ALLOWED */` sentinel:
- It must appear on the line BEFORE (or within the same line as) any raw INSERT
- It signals intentional bypass (not a bug)
- It must be accompanied by a comment explaining WHY (e.g., "historical backfill, guarded by FR-S1")

### 3. **Future Hardening Note**

Clarify that the ESLint rule is a follow-on (LINT-OHLCV-WRITE-BYPASS, queued backlog, not P0). For now, the JSDoc is the authoritative source.

---

## Acceptance Criteria

- [ ] JSDoc block added to `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` (top of file, before first class/function)
- [ ] Writer inventory table includes ALL 8 writers (A, C, D, E, F, G, H) with correct file paths, SQL mechanisms, and statuses
- [ ] Sentinel pattern `/* OHLCV-WRITE-BYPASS-ALLOWED */` explained with example usage
- [ ] Future ESLint rule noted as follow-on (LINT-OHLCV-WRITE-BYPASS, backlog)
- [ ] No code logic changes — purely documentation / JSDoc annotation
- [ ] File compiles without errors (`bun check` clean)

---

## Architecture Justification

- **Zone:** `apps/mcp-server/` — single zone, no conflicts
- **DDD Layer:** application/usecases — correct layer, this is the SSOT chokepoint
- **Documentation-only scope:** No runtime behavior changes, purely declarative annotation
- **Class closure:** Hardens the writer-bypass class by making the inventory explicit and unmissable

---

## Implementation Notes

1. **Placement:** Insert the JSDoc block at the very top of the file, AFTER module-level imports/exports but BEFORE the first class or function definition.
2. **Formatting:** Use standard JSDoc block comment syntax (`/** ... */`). The table can use markdown or plain text; markdown is preferred for readability.
3. **Writer Names:** Use the canonical names from the architect brief (A, C, D, E, F, G, H). Skip B (there is no Writer B).
4. **Linking:** Consider adding file path links (e.g., `[file](../../path/to/file.ts)`) if the codebase uses that pattern in JSDoc.
5. **No code changes:** Do NOT modify any actual SQL, logic, or signatures — this is purely documentation.

---

## Knowledge Load

Read before starting:
- `docs/architecture-briefs/2026-06-17-ohlcv-writer-ssot-durable.md` — §"Writer Inventory" for the canonical list
- `docs/handoffs/ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md` — §"DDD Layer Assignments" + brief explanation

---

## Parallel with SUBTASK-1

This task **can run in parallel with SUBTASK-1** (no dependencies). It does not depend on the SQL rewrite and does not block any downstream tasks.

---

## Shared Verification Gate

After all 3 subtasks merge, the shared verification gate fires at NEXT VN market open (2026-06-18, first TA scan 02:15Z):
- RSI matches canonical within 0.1pt, no single-digit/no 100.0
- No "giá 0 dưới BB" MARKET messages
- Generic all 30 tickers

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` — added writer inventory comment block (7 writers A/C/D/E/F/G/H), sentinel pattern (OHLCV-WRITE-BYPASS-ALLOWED), future ESLint note (LINT-OHLCV-WRITE-BYPASS). Converted from JSDoc to inline comments to avoid Unicode/backtick parse issues in tsc.
- **Tests written:** none (documentation-only task)
- **Git commits:** `41b4344c` fix(mcp-server/ohlcv-writer-ssot-durable): SUBTASK-1+2 writeForeignFlowToOhlcv merge-only UPDATE + SSOT annotation
- **Type check:** clean (bun tsc --noEmit, exit 0)
- **bun test:** N/A (no code logic change)
- **Tool count:** 165 tools — unchanged
- **Scheduler count:** 3 cron.schedule — unchanged
- **Docs updated:** ohlcvWriteService.ts annotation is self-documenting SSOT
- **Graphify:** skipped
- **REBUILD_REQUIRED:** YES (co-commits with SUBTASK-1)

This task contributes the **documentation barrier** to prevent a 5th writer from reintroducing the bug class.
