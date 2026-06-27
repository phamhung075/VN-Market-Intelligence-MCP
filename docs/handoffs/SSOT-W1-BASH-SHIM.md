---
task_id: SSOT-W1-BASH-SHIM
sprint: SSOT-INTEGRITY-PERIMETER
wave: 1
rank: 6
type: dev
size: S
zone: scripts/
priority: high
owner: dev-mcp-server
depends_on:
  - SSOT-W1-ZOD-VALIDATOR-CLI
created_at: 2026-06-27T16:50:00Z
---

# SSOT-W1-BASH-SHIM

**Current state:** `scripts/orch-state-validate.sh` is ~90% complete. Thin shim exists and demotes prior bash-jq gates.

**What's shipped:**
- Thin shim: `exec bun scripts/orch-validate.mjs "$@"`
- All logic delegated to bun CLI (no duplication)
- Existing callers continue to work unchanged (backward compatible invocation)
- Default path and custom-path arguments passed through to CLI
- Header documents legacy bash-jq gates (G-1..G-5) now covered by Zod superset

**Delta — what this task hardens:**
1. **Superset proof documentation:**
   - In the shim header, add explicit proof that G-1..G-5 are now covered by Zod validator:
     - **G-1 (JSON validity):** Stage-1 `JSON.parse` (exit 2 on malformed JSON)
     - **G-2 (Structural sentinel):** OrchStateSchema requires `head`, `task_board`, `signal_queue` as mandatory fields
     - **G-3 (Lane types are arrays):** Lane = z.array(TaskSchema); signal_queue.rows = z.array() — type-enforced
     - **G-4 (No null sprint IDs):** SprintSchema.id: z.string().min(1) rejects null/empty strings
     - **G-5 (Status enum across all lanes):** StatusEnum (12 values) enforced across ALL 9 lanes (not just 3 as before) — stricter, includes new READY value

2. **QA-7 gate (full mcp-server test suite green):**
   - Run full mcp-server test suite: `npm test` or equivalent
   - Verify all tests pass (or are updated if they had stale expectations from pre-Zod days)
   - Confirm no regressions from schema migration

3. **Type compilation test:**
   - Verify `z.infer<typeof OrchStateSchema>` compiles without error
   - Check that TypeScript can derive types from the schema (no hand-maintained type duplicates)

4. **RED 1837a reconciliation:**
   - Confirm RED 1837a (pipeline-state.test.ts or equiv) passes with new schema
   - If it was failing due to old type/schema assumptions, update and verify passing

5. **Existing caller compatibility:**
   - Verify shim works with all existing invocations:
     - `bash scripts/orch-state-validate.sh` (default path)
     - `bash scripts/orch-state-validate.sh /path/to/candidate.json` (custom path)
   - Exit codes must match: 0=success, 1=dup-key, 2=schema fail, 3=file error

**Acceptance criteria:**
- Superset proof (G-1..G-5) documented in shim header with explicit Zod mapping.
- QA-7 test passes (z.infer compiles, full test suite green, 1837a reconciled).
- Existing callers continue to work unchanged (backward compatibility verified).
- Exit codes 0/1/2/3 match orch-validate.mjs behavior.
- No external dependencies beyond what's in scripts/orch-validate.mjs.

**Files touched:**
- `scripts/orch-state-validate.sh` (add superset proof documentation in header)
- `apps/mcp-server/src/infrastructure/*.test.ts` (verify existing tests pass, update if needed)

**Depends on:** SSOT-W1-ZOD-VALIDATOR-CLI (CLI must exist and be working).

**Time estimate:** 1h (superset proof documentation, test suite verification, backward compatibility check).
