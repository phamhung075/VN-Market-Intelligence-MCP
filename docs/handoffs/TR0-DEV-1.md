# Handoff — TR0-DEV-1: Purge + Ingest Gate + REJECTED_SANITY Enum

**Sprint:** BCTC-TRUST-RED
**Task ID:** TR0-DEV-1
**Owner:** dev-mcp-server
**Estimated Scope:** 2h
**Priority:** HIGHEST (data-integrity RED, blocker for TR1 tasks)
**Date Created:** 2026-05-30

---

## Summary

Add ingest gate to `pushBctcRefinedUnitTool.ts` that calls domain-layer sanity validator (DT-1 stub, implements digit-run detection) before INSERT. Extend Zod schema to allow `window_status='REJECTED_SANITY'`. Add DDL comment to schema file noting new valid value. Design one-time purge SQL that dev will execute in-container before any code ships. This task GATES all downstream TR1 tasks.

---

## Files to Create

1. `apps/mcp-server/src/domain/services/financial-reports/bctcSanityValidator.ts` — stub with `validateBctcUnit` signature only (DT-1 impl deferred to TR1-DEV-1)

**File skeleton (DT-1 stub):**
```typescript
export interface SanityViolation {
  code: string;
  description: string;
  severity: "BLOCK" | "WARN";
}

export interface SanityResult {
  valid: boolean;
  violations: SanityViolation[];
  adjusted_confidence: number;
}

export function validateBctcUnit(
  markdown: string,
  confidence: number,
  flags: string[],
  reportId: string,
  allUnitMarkdowns?: string[],
): SanityResult {
  // STUB: returns { valid: true, violations: [], adjusted_confidence: confidence }
  // Full DT-1 digit-run detector implemented in TR1-DEV-1
  return {
    valid: true,
    violations: [],
    adjusted_confidence: confidence,
  };
}
```

---

## Files to Modify

### 1. `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts`

**Changes:**
1. Import `validateBctcUnit` from `domain/services/financial-reports/bctcSanityValidator.ts`
2. In handler, after `reset` DELETE (if any) and BEFORE INSERT:
   ```typescript
   const validation = validateBctcUnit(
     markdown,
     confidence,
     flags,
     report_id,
     undefined  // allUnitMarkdowns not needed in TR0
   );
   ```
3. If validation violations contain any BLOCK:
   - INSERT with `window_status='REJECTED_SANITY'` instead of caller-supplied `window_status`
   - Append violations to `flags` array (JSON stringify)
   - Return `{ ok: false, unit_id, rejected_reason: violations[] }` instead of `{ ok: true, unit_id }`
4. Extend Zod schema for `window_status` field from `z.enum(["DONE", "FAILED"])` to `z.enum(["DONE", "FAILED", "REJECTED_SANITY"])`

**Acceptance Criteria:**

- AC-TR0-1-1: File exists at path above and compiles without errors.
- AC-TR0-1-2: `validateBctcUnit` is called with markdown, confidence, flags, report_id before INSERT.
- AC-TR0-1-3: When validator returns violations with severity="BLOCK", the tool returns `ok: false`.
- AC-TR0-1-4: When validator returns BLOCK, unit is inserted with `window_status='REJECTED_SANITY'`, NOT the caller-supplied status. Verify via direct `bun:sqlite` query: `SELECT window_status FROM bctc_refined_units WHERE unit_id=?` returns "REJECTED_SANITY".
- AC-TR0-1-5: Violations are appended to flags JSON array in the row. Verify: `SELECT flags FROM bctc_refined_units` contains violation codes.
- AC-TR0-1-6: Zod schema for `window_status` includes `"REJECTED_SANITY"` as valid enum value.
- AC-TR0-1-7: TypeScript compilation succeeds; `bun run build` exits 0.

---

### 2. `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`

**Changes:**
1. In DDL comment for `refine_status` column, add note: "Valid values: PENDING | IN_PROGRESS | DONE | FAILED | PARTIAL | REJECTED_SANITY (new — terminal state, rejected by sanity gate)".
2. In DDL comment for `window_status` column in `bctc_refined_units` table, add note: "Valid values: DONE | FAILED | REJECTED_SANITY (new — failed sanity check at ingest)".
3. NO ALTER TABLE. TEXT columns are untyped in SQLite; new value is additive.

**Acceptance Criteria:**

- AC-TR0-2-1: DDL comment in the `refine_status` column definition includes `REJECTED_SANITY`.
- AC-TR0-2-2: DDL comment in the `window_status` column definition includes `REJECTED_SANITY`.
- AC-TR0-2-3: No ALTER TABLE statement present (schema is non-migration).
- AC-TR0-2-4: Grep confirms zero `ALTER TABLE` in the file: `grep -i "ALTER TABLE" schema-financial-reports.ts` returns 0 matches.

---

### 3. Purge SQL (One-Time In-Container Script — Not Committed)

**Purpose:** Reset FPT + ACB contaminated data back to PENDING state before any refine cron runs.

**Procedure (dev executes in mcp-server container AFTER code ships, BEFORE cron resumes):**

```bash
# Step 1: Resolve ACB report_id (FPT is known: e8ea3df5-3f32-413d-a3eb-c71634c0438d)
bun run /tmp/query-acb-uuid.ts
# Output: ACB_UUID (e.g., "abcd1234-...")

# Step 2: Create purge script with both UUIDs
cat > /tmp/purge-trust-red.ts << 'EOF'
import { Database } from "bun:sqlite";

const db = new Database("/app/data/market.db");

const FPT_UUID = "e8ea3df5-3f32-413d-a3eb-c71634c0438d";
const ACB_UUID = process.argv[2]; // Passed as argument

// Verify both exist before purge
const fptCheck = db.query("SELECT id FROM financial_reports WHERE id = ?").get(FPT_UUID);
const acbCheck = db.query("SELECT id FROM financial_reports WHERE id = ?").get(ACB_UUID);

if (!fptCheck || !acbCheck) {
  console.error("UUID validation failed");
  process.exit(1);
}

// Purge
db.query("DELETE FROM bctc_table_rows WHERE report_id IN (?, ?)").run(FPT_UUID, ACB_UUID);
db.query("DELETE FROM bctc_refined_units WHERE report_id IN (?, ?)").run(FPT_UUID, ACB_UUID);
db.query("UPDATE financial_reports SET refine_status='PENDING' WHERE id IN (?, ?)").run(FPT_UUID, ACB_UUID);

console.log("Purge complete. FPT + ACB reset to PENDING.");
EOF

# Step 3: Run purge
bun run /tmp/purge-trust-red.ts "$ACB_UUID"

# Step 4: Verify purge
bun run /tmp/verify-purge.ts "$FPT_UUID" "$ACB_UUID"
```

**Verification script** (`/tmp/verify-purge.ts`):
```typescript
import { Database } from "bun:sqlite";

const db = new Database("/app/data/market.db");
const [fptId, acbId] = process.argv.slice(2);

const fptRows = db.query("SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id=?").get(fptId);
const fptUnits = db.query("SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id=?").get(fptId);
const fptStatus = db.query("SELECT refine_status FROM financial_reports WHERE id=?").get(fptId);

const acbRows = db.query("SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id=?").get(acbId);
const acbUnits = db.query("SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id=?").get(acbId);
const acbStatus = db.query("SELECT refine_status FROM financial_reports WHERE id=?").get(acbId);

console.log(`FPT: rows=${fptRows.cnt}, units=${fptUnits.cnt}, status=${fptStatus.refine_status}`);
console.log(`ACB: rows=${acbRows.cnt}, units=${acbUnits.cnt}, status=${acbStatus.refine_status}`);

if (fptRows.cnt > 0 || acbRows.cnt > 0) {
  console.error("Purge FAILED — rows remain");
  process.exit(1);
}
if (fptStatus.refine_status !== "PENDING" || acbStatus.refine_status !== "PENDING") {
  console.error("Purge FAILED — status not PENDING");
  process.exit(1);
}
console.log("Purge VERIFIED ✓");
EOF
```

**Blocker B-1 Resolution:**
- Dev MUST run the query script FIRST and capture ACB_UUID before attempting purge.
- Running purge with wrong UUID silently no-ops (WHERE IN clause misses) and leaves data poisoned.
- Verification script catches this error (rows > 0).

---

## Test Plan

### Unit Tests
Create test cases in a temporary test file (will be merged into TRUST-RED-sanity-gate.test.ts in TRUST-QA-1):

1. **TC-TR0-1-1: REJECTED_SANITY write on validator BLOCK**
   - Mock `validateBctcUnit` to return `{ valid: false, violations: [{severity:"BLOCK", code:"DIGIT_RUN"}], adjusted_confidence: 0.1 }`
   - Call push tool with valid markdown, confidence=0.85
   - Assert: tool returns `{ ok: false, rejected_reason: [...] }`
   - Assert DB: `SELECT window_status FROM bctc_refined_units WHERE unit_id=?` returns "REJECTED_SANITY"

2. **TC-TR0-1-2: DONE write when validator passes**
   - Mock `validateBctcUnit` to return `{ valid: true, violations: [], adjusted_confidence: 0.85 }`
   - Call push tool with window_status="DONE"
   - Assert: tool returns `{ ok: true, unit_id }`
   - Assert DB: `SELECT window_status FROM bctc_refined_units WHERE unit_id=?` returns "DONE"

3. **TC-TR0-1-3: Zod enum validation**
   - Call tool with `window_status="INVALID"` — should fail Zod validation before handler executes
   - Call tool with `window_status="REJECTED_SANITY"` — should pass Zod validation

### Integration Test (Post-Purge)

After ops executes purge SQL in container:
1. Query FPT + ACB: `SELECT refine_status FROM financial_reports WHERE id IN (?, ?)` → both "PENDING"
2. Query FPT + ACB: `SELECT COUNT(*) FROM bctc_refined_units WHERE report_id IN (?, ?)` → both 0
3. Query FPT + ACB: `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id IN (?, ?)` → both 0

---

## Implementation Notes

- The `validateBctcUnit` stub (DT-1 placeholder) returns pass-through (`valid: true`). TR1-DEV-1 will implement the actual digit-run detector.
- Insert happens REGARDLESS of violation (audit trail preserved). Only `window_status` changes on BLOCK.
- The REJECTED_SANITY row is visible to analysts in `get_bctc_refined` (the AI-input tab); it's an audit trail, not a hidden row.
- Purge is NOT a migration — it's a forensic cleanup, one-time per environment. Document it in RELEASE_NOTES.md if releases are tracked.

---

## Dependencies

- DT-1 stub: `bctcSanityValidator.ts` created (stub returns pass-through)
- Schema: `financial_reports`, `bctc_refined_units`, `bctc_table_rows` tables exist (no ALTER)
- Zod: `z.enum` expanded (no new packages)

**Blocked by:** None (this is the lead item)

**Blocks:** TR1-DEV-1, TR1-DEV-2, TR0-DEV-2, TRUST-QA-1 (all downstream tasks require ingest gate in place)

---

## Sign-Off

- **Code Review Checklist:**
  - Stub function signature matches requirement
  - Zod enum includes new value
  - DDL comment added (no ALTER TABLE)
  - Import paths correct (domain service isolated, no infrastructure imports in validator)
  - Tool handler logic correct (gate fires before INSERT, REJECTED_SANITY written on BLOCK)

- **Verification:**
  - Compile: `bun run build` exits 0
  - Purge queries execute without errors
  - All ACs above verified before marking DONE

---
