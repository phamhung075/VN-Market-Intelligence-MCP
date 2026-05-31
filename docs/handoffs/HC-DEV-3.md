---
task_id: HC-DEV-3
sprint: BCTC-HUMAN-CONFIRM
agent: dev-mcp-server
status: READY
zone: apps/mcp-server/
depends_on: [HC-DEV-1]
blocks: [HC-DEV-6]
date_assigned: 2026-05-30
---

# HC-DEV-3 — HTTP Route Handlers + Server Dispatch

**Scope:** Three new route handlers for the flag review, correction submission, and confirmation lock/reset. Wire them into the server dispatch. These are the HTTP layer serving the viewer panel.

**Atomic goal:** GET `/api/bctc-inspect/flags/{doc_id}`, POST `/api/bctc-inspect/correct/{doc_id}`, POST `/api/bctc-inspect/confirm/{doc_id}`, POST `/api/bctc-inspect/confirm/{doc_id}/reset` all live and callable. Viewer panel can fetch flag list and submit corrections.

**DEPENDS ON:** HC-DEV-1 (needs services)
**BLOCKS:** HC-DEV-6 (viewer panel needs these endpoints)

---

## Files to Create

### Route Handlers (3 new files)

**`apps/mcp-server/src/interface/mcp/routes/bctcFlagsHandler.ts`**

Pattern: follow `bctcInspectHandler.ts` DI structure (db, docId as params).

```typescript
export async function handleBctcInspectFlags(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): Promise<void> {
  // Validate UUID
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_uuid" }));
    return;
  }

  // Enumerate flags using service from HC-DEV-1
  const result = bctcFlagEnumerationService.enumerateFlaggedCells(db, docId);
  
  // Return flagged cells or empty list
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
```

- Import `isValidUuid` from `bctcInspectHandler.ts` (reuse, do not duplicate)
- Return 404 if report not found (check `financial_reports WHERE id = ?`)
- Return 400 if UUID invalid
- Return 200 with `FlagEnumerationResult` for all data cases (including empty flags)

**`apps/mcp-server/src/interface/mcp/routes/bctcCorrectHandler.ts`**

```typescript
export async function handleBctcInspectCorrect(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): Promise<void> {
  // Validate UUID
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_uuid" }));
    return;
  }

  // Parse JSON body: { row_id: number, new_value: number }
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  
  let input: { row_id: number; new_value: number };
  try {
    input = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  // Validate input
  if (!Number.isInteger(input.row_id) || typeof input.new_value !== 'number') {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_input" }));
    return;
  }

  // Submit correction
  const result = bctcCorrectionService.submitCorrection(db, {
    report_id: docId,
    row_id: input.row_id,
    new_value: input.new_value,
  });

  // Return 409 if report confirmed, 400 if validation error, 200 on success
  const statusCode = result.error ? (result.http_status || 400) : 200;
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
```

- Pattern: body parsing same as `server.ts` lines 427-435 (async for loop, chunk concatenation)
- Validate `row_id` is integer, `new_value` is number
- Delegate to `bctcCorrectionService.submitCorrection()`
- Return correct HTTP status codes: 409 (confirmed), 400 (validation), 200 (success)

**`apps/mcp-server/src/interface/mcp/routes/bctcConfirmHandler.ts`**

```typescript
export async function handleBctcInspectConfirm(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): Promise<void> {
  // Validate UUID
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_uuid" }));
    return;
  }

  // Confirm: UPDATE financial_reports SET confirm_status = 'CONFIRMED', final_confirmed_at = datetime('now')
  db.prepare(`
    UPDATE financial_reports
    SET confirm_status = 'CONFIRMED', final_confirmed_at = datetime('now')
    WHERE id = ?
  `).run(docId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, confirm_status: 'CONFIRMED' }));
}

export async function handleBctcInspectConfirmReset(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  docId: string,
): Promise<void> {
  // Validate UUID
  if (!isValidUuid(docId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_uuid" }));
    return;
  }

  // Reset: UPDATE financial_reports SET confirm_status = 'PENDING', final_confirmed_at = NULL
  // DO NOT delete bctc_human_corrections records (AC-FR3-2)
  db.prepare(`
    UPDATE financial_reports
    SET confirm_status = 'PENDING', final_confirmed_at = NULL
    WHERE id = ?
  `).run(docId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, confirm_status: 'PENDING' }));
}
```

- Confirm: sets `confirm_status = 'CONFIRMED'` + timestamp. Idempotent (re-confirm updates timestamp, returns 200).
- Reset: sets `confirm_status = 'PENDING'` + clears timestamp. Does NOT delete correction records (AC-FR3-2).
- Both return 400 on invalid UUID, 200 on success.

---

## Files to Modify

**`apps/mcp-server/src/interface/mcp/server.ts`**

In the route dispatch block (lines 367-502, the bctc-inspect section), add after line 502:

```typescript
// Flags: GET /api/bctc-inspect/flags/{doc_id}
if (method === "GET" && pathname.startsWith("/api/bctc-inspect/flags/")) {
  const docId = pathname.split("/").pop();
  await handleBctcInspectFlags(req, res, db, docId || "");
  return;
}

// Correct: POST /api/bctc-inspect/correct/{doc_id}
if (method === "POST" && pathname.startsWith("/api/bctc-inspect/correct/")) {
  const docId = pathname.split("/").pop();
  await handleBctcInspectCorrect(req, res, db, docId || "");
  return;
}

// Confirm: POST /api/bctc-inspect/confirm/{doc_id}
if (method === "POST" && pathname.startsWith("/api/bctc-inspect/confirm/")) {
  const parts = pathname.split("/");
  if (parts[parts.length - 1] === "reset") {
    const docId = parts[parts.length - 2];
    await handleBctcInspectConfirmReset(req, res, db, docId);
  } else {
    const docId = parts[parts.length - 1];
    await handleBctcInspectConfirm(req, res, db, docId);
  }
  return;
}
```

Add imports at the top of server.ts:
```typescript
import { handleBctcInspectFlags } from "./routes/bctcFlagsHandler.js";
import { handleBctcInspectCorrect } from "./routes/bctcCorrectHandler.js";
import { handleBctcInspectConfirm, handleBctcInspectConfirmReset } from "./routes/bctcConfirmHandler.js";
```

**Pattern match:** follow the existing pattern at lines 367-502 for all other routes (method check → pathname match → extract ID → call handler).

---

## Acceptance Criteria

### AC-HC-DEV-3-1 Flags Handler
- [ ] GET `/api/bctc-inspect/flags/{doc_id}` returns 200 with `FlagEnumerationResult` (from HC-DEV-1 service)
- [ ] Returns 400 for invalid UUID
- [ ] Returns 404 if report not found (empty flags list, not error)
- [ ] Correct flag structure: `row_id`, `label`, `page_number`, `statement_section`, `flag_type`, `ocr_value`, `image_value`, `current_value`, `has_correction`, `corrected_value`

### AC-HC-DEV-3-2 Correct Handler
- [ ] POST `/api/bctc-inspect/correct/{doc_id}` accepts JSON body `{ row_id: number, new_value: number }`
- [ ] Returns 400 for invalid JSON or invalid input types
- [ ] Returns 400 for invalid UUID
- [ ] Returns 409 if report `confirm_status = 'CONFIRMED'` (from service)
- [ ] Returns 400 if row not found (from service)
- [ ] Returns 200 on success with `{ ok: true, row_id, new_value, source_confidence: 1.0 }`

### AC-HC-DEV-3-3 Confirm Handler
- [ ] POST `/api/bctc-inspect/confirm/{doc_id}` sets `confirm_status = 'CONFIRMED'` + timestamp
- [ ] Idempotent: re-confirm returns 200, updates timestamp
- [ ] Returns 400 for invalid UUID
- [ ] POST `/api/bctc-inspect/confirm/{doc_id}/reset` sets `confirm_status = 'PENDING'` + clears timestamp
- [ ] Reset does NOT delete `bctc_human_corrections` records

### AC-HC-DEV-3-4 Server Dispatch
- [ ] All 4 routes (flags GET, correct POST, confirm POST, confirm/reset POST) registered in server.ts dispatch block
- [ ] Correct path parsing for `/api/bctc-inspect/confirm/{doc_id}/reset` (distinguish from confirm)
- [ ] All handlers receive db parameter via DI (no getDb() inside handlers)

---

## DV Test Requirements (RED-before, GREEN-after, same commit)

**Test file:** `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts` (continues from HC-DEV-1/2)

**Minimum DV tests for HC-DEV-3 coverage (from brief §5.1):**
- DV-HC-1: GET `/flags/{doc_id}` returns red flagged cells with `ocr_value` / `image_value` extracted from red prefix (seed `bctc_refined_units` with known red-flag markdown; assert exact values)
- DV-HC-2: GET `/flags/{doc_id}` returns yellow flag with null `ocr_value`/`image_value` (seed yellow-flag markdown; assert both null)
- DV-HC-4: POST `/correct/{doc_id}` on confirmed report returns 409 (set `confirm_status = 'CONFIRMED'` first; assert 409)
- DV-HC-5: POST `/confirm/{doc_id}` sets `confirm_status = 'CONFIRMED'` (direct DB read `SELECT confirm_status FROM financial_reports` after POST)
- DV-HC-6: POST `/confirm/{doc_id}/reset` clears status; correction records remain (assert `confirm_status = 'PENDING'`, assert `bctc_human_corrections` count unchanged)

All tests use in-memory DB with schema from HC-DEV-1. Verify responses via HTTP mock (inject mock res object, capture writeHead + end calls). Verify DB state via direct reads.

---

## Exit Criteria

1. 3 new route handler files created with correct signatures and logic
2. `server.ts` dispatch block extended with 4 route entries (flags GET, correct POST, confirm POST, confirm/reset POST)
3. All handlers receive `db: Database` via DI (no getDb() inside)
4. HC-DEV-3 DV tests RED (baseline), GREEN after code
5. **HTTP contract verified:**
   - GET `/flags/{doc_id}` returns 200 with correct shape
   - POST `/correct/{doc_id}` returns 200 on success, 409 on confirmed report, 400 on bad input
   - POST `/confirm/{doc_id}` returns 200, sets confirm_status
   - POST `/confirm/{doc_id}/reset` returns 200, clears confirm_status, preserves corrections

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add` per file, never `-A`
- DV tests RED-before/GREEN-after, same commit as production
- HTTP mock-based tests with in-memory DB
- Direct DB reads verify state (not HTTP response assertions)
- No balance badge assertions
- Plain Vietnamese in user-facing strings (handled in panel, none in handlers)
- Never ask user to run code

---

## RETURN

```
READY: HC-DEV-3 handoff. Three HTTP handlers + server dispatch.
ZONE: apps/mcp-server/
DEPENDS_ON: HC-DEV-1 (services)
BLOCKS: HC-DEV-6 (viewer panel needs these endpoints)
DV_TESTS: DV-HC-1, DV-HC-2, DV-HC-4, DV-HC-5, DV-HC-6
NEXT: dev-mcp-server — implement handlers and DV-test
DURATION: ~1.5h (3 handlers + dispatch wiring)
SERIALIZATION: HC-DEV-1 must be done first; can be parallel to HC-DEV-2/4
```
