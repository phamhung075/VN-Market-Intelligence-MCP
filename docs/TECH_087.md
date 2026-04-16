# TECH-087: Fix SSC Fallback Regression + Prediction Tool Schema Drift

status: APPROVED_BY_ARCHITECT
req_ref: REQ-087

---

## Brownfield Impact

- Files modified: 2
  - `src/__tests__/1025-ssc-adf-pdf-discovery.test.ts`
  - `src/interface/mcp/tools/evidenceTools.ts`
- Files created: none
- Files deleted: none
- Breaking changes: no — both fixes are either test-side or backward-compatible schema relaxations

---

## Architecture Decision

Both defects are localized: task 1295 is a pure test call-site error (wrong entry point used, no production code change needed) and task 1296 is an interface-layer schema constraint tightening that broke pre-existing callers. The fix strategy is minimal-surface: correct the test's import and call signature for 1295, relax two zod fields from required to optional and guard the handler for 1296. No domain or infrastructure layer is touched.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| Test fix: cases 7 + 8 call site | infrastructure (test) | `src/__tests__/1025-ssc-adf-pdf-discovery.test.ts` | MODIFY |
| Schema relaxation: direction + expected_move_pct | interface | `src/interface/mcp/tools/evidenceTools.ts` | MODIFY |

---

## Interface Contracts

### Task 1295 — test call-site fix

No interface changes. `listSscDocumentsWithFlag` is already exported from `ssc.ts` at line 972 with this signature (confirmed):

```typescript
export async function listSscDocumentsWithFlag(
  actionCode: string,
  reportType: "quarterly" | "annual",
  year: number,
  disableSscPolling: boolean,
  httpClient?: HttpClient,
): Promise<SscDocument[]>
```

The flag `disableSscPolling=false` routes to `_runSscPath`, which exercises the SSC portal code path. Passing `false` from test cases 7 and 8 is the correct way to force SSC-first behavior without mutating `mcpConfig`.

**Import change only** — add `listSscDocumentsWithFlag` to the existing import statement in `1025-ssc-adf-pdf-discovery.test.ts` line 22–26. `listSscDocuments` can be retained or removed; no other test in this file uses it directly.

**Call-site changes:**

| Case | Current | Fixed |
|------|---------|-------|
| 7 (line 232) | `listSscDocuments("VCB", "quarterly", 2025, mockClient)` | `listSscDocumentsWithFlag("VCB", "quarterly", 2025, false, mockClient)` |
| 8 (line 256) | `listSscDocuments("VCB", "quarterly", 2025, mockClient)` | `listSscDocumentsWithFlag("VCB", "quarterly", 2025, false, mockClient)` |

### Task 1296 — zod schema and handler fix

**Schema diff (zod, in `evidenceTools.ts` `create_prediction_claim` tool definition):**

| Field | Before | After |
|-------|--------|-------|
| `direction` | `z.enum(["bullish", "bearish"])` | `z.enum(["bullish", "bearish"]).optional()` |
| `expected_move_pct` | `z.number().min(0.001).max(0.5)` | `z.number().min(0.001).max(0.5).optional()` |

**Handler diff (all changes inside the `create_prediction_claim` async handler):**

| Step | Location | Before | After |
|------|----------|--------|-------|
| Step 3: targetPrice | line 365–368 | direct ternary on `direction` | `(direction != null && expected_move_pct != null) ? ternary : null` |
| Step 5: direction arg | line 380 | `direction` (ClaimDirection) | `(direction ?? null) as ClaimDirection` |
| Step 7: direction line | line 407 | `` `Direction: ${direction}\n` `` | `direction ? \`Direction: ${direction}\n\` : ""` |
| Step 7: move line | line 410 | `` `Expected move: ${(expected_move_pct * 100).toFixed(1)}%\n` `` | `expected_move_pct != null ? \`Expected move: ${(expected_move_pct * 100).toFixed(1)}%\n\` : ""` |

**Full step 3 replacement:**

```typescript
// Step 3: compute target_price — null when either direction or pct is absent
const targetPrice: number | null =
  direction != null && expected_move_pct != null
    ? direction === "bullish"
      ? Math.round(creationPrice * (1 + expected_move_pct))
      : Math.round(creationPrice * (1 - expected_move_pct))
    : null;
```

**Full step 5 replacement (insertPredictionClaim call):**

```typescript
const id = insertPredictionClaim(database, {
  stock: ticker,
  agent_id: "08-prediction-synthesizer",
  claim_text,
  direction: (direction ?? null) as ClaimDirection,
  target_price: targetPrice,
  creation_price: creationPrice,
  resolution_date: resolutionDateStr,
  confidence: probability,
});
```

**Why `(direction ?? null) as ClaimDirection` is safe:** `PredictionClaimInput.direction` is typed `ClaimDirection` (non-nullable TS type). SQLite does not enforce this — the column accepts NULL. The cast tells TypeScript to accept the coercion without touching `PredictionClaimInput` or its downstream consumers (tests 1123, 1154).

---

## Task Breakdown (for PM)

Both tasks are independent — no dependency between them. Can be executed in parallel.

| Task ID | Title | Layer | File | Depends On |
|---------|-------|-------|------|------------|
| 1295 | fix(ssc): update test 1025 cases 7+8 to call `listSscDocumentsWithFlag` | infrastructure (test) | `src/__tests__/1025-ssc-adf-pdf-discovery.test.ts` | none |
| 1296 | fix(prediction): relax direction+expected_move_pct to optional in evidenceTools.ts | interface | `src/interface/mcp/tools/evidenceTools.ts` | none |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Case 7 `sscFetched` assertion: `_runSscPath` may not call the SSC URL for some tickers | Low | Medium | Confirmed at line 979–983: `disableSscPolling=false` calls `_runSscPath` unconditionally; mock's `congbothongtin.ssc.gov.vn` URL check will fire |
| TypeScript rejects `(direction ?? null) as ClaimDirection` | Low | Low | `as ClaimDirection` cast suppresses the type error; `ClaimDirection` is a string union, `null` is accepted at SQLite layer only |
| Relaxing `direction` to optional breaks test 1194 regression | Low | High | REQ-087 explicitly notes test 1194 passes `direction:"bullish"` and `expected_move_pct:0.05` — the optional fields still function normally when provided |
| `listSscDocuments` import still present after fix causes lint warning | Low | Low | Remove `listSscDocuments` from the import if unused after cases 7+8 are updated; verify no other case in 1025 uses it |

---

## Security Review

- [ ] SQL parameterized? Yes — no SQL changes in this task
- [ ] File paths validated (no `../`)? Yes — no file path handling
- [ ] External HTTP rate-limited? Yes — no new HTTP calls
- [ ] Secrets via Bun.env only? Yes — no env access in changed files

---

## Verification Commands

```bash
# Run targeted test suites after implementation
bun test src/__tests__/1025-ssc-adf-pdf-discovery.test.ts
bun test src/__tests__/1124-evidence-tools-phase-bc.test.ts
bun test src/__tests__/1194-agent08-tools.test.ts

# Type check
bun tsc --noEmit
```

Expected: all three test suites green, zero tsc errors.
