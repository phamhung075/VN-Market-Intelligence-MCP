---
task_id: SSOT-W1-ZOD-VALIDATOR-CLI
sprint: SSOT-INTEGRITY-PERIMETER
wave: 1
rank: 2
type: dev
size: M
zone: scripts/
priority: high
owner: dev-mcp-server
depends_on:
  - SSOT-W1-ZOD-SCHEMA-MODEL
created_at: 2026-06-27T16:50:00Z
---

# SSOT-W1-ZOD-VALIDATOR-CLI

**Current state:** `scripts/orch-validate.mjs` is ~95% complete. Two-stage validator exists with all required logic.

**What's shipped:**
- Stage-0: duplicate JSON key detection (pre-parse, on raw text with tokenizer correctly handling escape sequences)
- Stage-1: OrchStateSchema.safeParse() with structured error output
- Stage-1b: checkLaneCoherence() call (warn-only, non-blocking exit 0)
- Stage-1c: checkRefIntegrity() call with FileResolver (hard-fail exit 2 on dangling refs)
- Auto-fix error contract: per-issue structured output (path, problem, expected, fix hint) keyed by Zod issue.code
- Exit codes: 0=success, 1=Stage-0 dup-key fail, 2=Stage-1 schema/ref fail, 3=file not found
- Default target: docs/data/orch/orch-state.json; accepts command-line path override
- Validator called by: orch-apply.sh, PreToolUse hook, PostToolUse hook, bash shim

**Delta — what this task hardens:**
1. **Stage-0 tokenizer correctness:** Verify recursive-descent tokenizer correctly handles:
   - String escape sequences (especially `\"` which must NOT terminate the key string)
   - Nested objects with separate key-tracking context per object
   - All JSON primitive types (string, number, boolean, null)
   - Test with a synthetic JSON containing duplicate keys at nesting depth >2.

2. **QA-2 gate (duplicate-key rejection):** Write test that creates raw JSON with a duplicate key (exact same key, different values) → Stage-0 must detect and reject with exit 1 before JSON.parse. Stage-1 never runs.

3. **Auto-fix error contract completeness:** Verify all expected issue.code mappers are present:
   - `invalid_enum_value` (status field): hint tells agent to use an enum value + note verify_note field
   - `invalid_enum_value` (other): hint lists allowed options
   - `unrecognized_keys`: hint suggests cold-storage migration
   - `invalid_type`: hint suggests provide expected type
   - `too_small`: hint suggests minimum length check
   - `custom` (superRefine): message extracted after "fix:" marker
   
4. **Exit code contract:** Test each exit path (0, 1, 2, 3) with appropriate inputs:
   - Exit 0: valid orch-state, or coherence warnings only (SHG migration)
   - Exit 1: duplicate JSON key in raw text
   - Exit 2: schema violation or dangling ref
   - Exit 3: file not found / unreadable

5. **Invocation contract:** Verify bun can execute the script with:
   - Default path: `bun scripts/orch-validate.mjs` → uses docs/data/orch/orch-state.json
   - Custom path: `bun scripts/orch-validate.mjs path/to/candidate.json`

**Acceptance criteria:**
- QA-1, QA-2, QA-4 test gates pass (status enum, dup-key, dangling ref).
- Stage-0 tokenizer test proves escape-sequence handling correct.
- Auto-fix hints tested for all issue.code types.
- Exit codes 0/1/2/3 verified with appropriate test inputs.
- No external dependencies beyond what's already in apps/mcp-server/ package.json (zod, fs, path already present).
- Full mcp-server test suite green post-validator-hardening.

**Files touched:**
- `scripts/orch-validate.mjs` (review logic, add test coverage)
- `apps/mcp-server/src/infrastructure/*.test.ts` (Stage-0/Stage-1 integration tests)

**Depends on:** SSOT-W1-ZOD-SCHEMA-MODEL (schema imports must succeed).

**Time estimate:** 2h (tokenizer verification, auto-fix contract coverage, exit code testing, integration with mcp-server test suite).
