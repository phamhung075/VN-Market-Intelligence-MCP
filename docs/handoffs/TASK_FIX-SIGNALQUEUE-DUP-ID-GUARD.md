---
sprint: SYSTEMIC-REMAKE-P1
branch: task/FIX-SIGNALQUEUE-DUP-ID-GUARD
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TL;DR
Add id-uniqueness guard across signal_queue.rows[]+archive[] at write time in orchStateSchema.ts + orch-validate.mjs (defense in depth for ANY emitter, not just D4).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Target:** `apps/mcp-server/src/infrastructure/orchStateSchema.ts` + `scripts/orch-validate.mjs`

**Mechanism:** Add an id-uniqueness guard across signal_queue.rows[]+archive[] at write time (validates every orch-state mutation, defense in depth for ANY emitter, not just D4).

**Files to read first:**
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (Zod schema structure)
- `scripts/orch-validate.mjs` (validator logic, where to add check)
- `docs/standards/orch-state-access.md` (orch-state write contract)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` — Add uniqueness constraint via Zod .superRefine
- `scripts/orch-validate.mjs` — Wire the check (if not using Zod directly)

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/standards/gateway-call-contract.md` (orch-apply validation flow)

**Acceptance Criteria (machine-checkable):**

1. Zod validator rejects writes with duplicate signal_queue.rows[] ids → orch-apply.sh exits non-zero, live file untouched
2. Test: inject two rows with same signal id → validation fails
3. Validator check runs BEFORE orch-apply.sh writes to live file (atomic gate)

