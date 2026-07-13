# Decision Journal — FIX-OPS-AUDITTRAIL-TIMESTAMP-BYPASS-GUARDRAIL

**task-id:** FIX-OPS-AUDITTRAIL-TIMESTAMP-BYPASS-GUARDRAIL
**date:** 2026-07-13 (dev-team cron tick 07:37Z closeout)
**dispatcher:** dev-team router → agent-father (router HAND-DISPATCH; non-dev owner ⇒ BOUNDED-1-ineligible)
**status:** DONE_VERIFIED (verified_by=dev-team)

## Context
Split by PO (commit `9e76ab5cb`) from parent `FIX-OPS-CRONJOBRUNS-TIMESTAMP-FALSIFICATION-GUARDRAIL`. This row carries **AC-1** — the recurrence-prevention guardrail. The sibling `SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY` (AC-2/AC-3, owner `dev-mcp-server`) is separately parked in backlog for BOUNDED-1 and is out of scope here.

## Decision
Doc-only guardrail edit. Because the row's owner is `agent-father` (non-dev meta-agent), the NON-DEV-OWNER gate in `promote-bounded1.jq` withholds it from BOUNDED-1 auto-launch — so the router hand-dispatched agent-father directly. agent-father added a FORBIDDEN clause to `docs/agents/ops/flow/db.md` (SSOT home) with a cross-ref pointer from `main.md` § DB Health, mirroring the existing `docker.md` § FORBIDDEN pattern.

## Verification (RAW — verified_by=dev-team, not badge-trusted)
- Commit `3c35844f9` on HEAD; exactly 2 files (`db.md` +13, `main.md` +3/-1); **no code, no DB, no orch-state** touched; explicit-path staging, no peer sweep.
- `db.md` § FORBIDDEN present + coherent: MUST-NOT clause; 2026-07-10 incident cited (25 `cron_job_runs.started_at` rows rewritten to fabricated `2026-07-03 07:36:41`, `shouldSkipRecoveryReplay` 21.6h cadence guard, `schedulerWatchdog` `MAX(started_at)` false-alert risk); recurring class `feedback_ops_db_timestamp_falsification_to_bypass_guard.md`; 3-step correct-path ladder (injectable `bctcReparseJob options.nowMsFn` at `bctcReparseJob.ts:677` consumed at `:683` → escalate to `dev-<service>` → wait for natural cadence).
- `main.md` pointer present in DB Health section; `size-justification` header updated 122L→124L.
- No QA-code gate applied: this is a policy/doc edit with no test surface — the RAW clause-content verification IS the gate.

## Follow-up
- Sibling `SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY` remains in backlog (BOUNDED-1 drains on a later idle tick).
- No deploy required — doc takes effect on the ops agent's next flow read; not part of the user-gated mcp-server rebuild batch.
