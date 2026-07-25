# Decision Journal — Sprint INPUT-VALIDATION-COVERAGE · architect

**Sprint goal:** Uniform strict-schema input validation across ALL agent write surfaces (A MCP-tools / B script-gated JSON / C direct-write docs/data + notebooks + handoffs); rejected writes throw a per-field descriptive error; fail-closed.
**Agent:** architect
**Started:** 2026-07-25T00:00:00Z

---

### STEP architect-S1 · architect · 2026-07-25T00:00:00Z
**task-id:** IVC-ARCH-BLUEPRINT
**what-done:** Wrote `docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md` — Class-C mechanism decision, canonical error contract, strict-completeness rule, Class-A inventory, proposed decomposition.
**what-considered:**
- Class-C: (a) fail-closed PreToolUse hook + glob-keyed schema registry vs (b) 77× per-store apply-wrapper clones vs (c) shared validate-before-write helper.
- Whether to keep `orch-state-hook-prewrite.mjs` as a separate parallel hook or absorb it into the new generic mechanism.
- Exact-path vs glob-keyed schema registry given 77 files cluster into ~15-20 real shapes (unified-agent-synthesis-*, cycle-snapshot-*, pilot-status-*, auditor-tier*-last-healthy).
**why-decision:** (b) rejected — still needs a hook on top to block raw-Write bypass of the wrapper convention (doesn't remove the need for (a), just adds 77x cost beside it), and most of the 77 stores are single-writer so CAS-mtime concurrency protection buys little. (c) is not a separate mechanism — a "must call" helper has the same vigilance-shaped weakness as the fail-open hooks PO is closing; it only becomes enforcement once (a) or the server write-door makes calling it unconditional. Chose (a), generalizing the ALREADY-MANDATED SSOT-zod-validation-directive dual-point pattern (Point-1 hook / Point-2 server write-door) rather than inventing a third mechanism — DDD "extend not duplicate" rule applies to scripts too. `orch-state.json` absorbed as registry entry #1 (not a parallel hook) to keep exactly one `PreToolUse Write|Edit` matcher. Fail-closed bounded via per-registry-entry blast radius + registry-miss=pass-through (not a PO-constraint violation — nothing validated today, no validator to crash) + narrow named emergency bypass (mirrors proven `ORCH_APPLY_ALLOW_SHRINK`) + proactive auditor canary probe (closes the silent-rot half of UC-CRITIC-HOOKS-ENFORCEMENT, not just the loud-block half).
**why-change:** Deviated from a literal "copy orch-apply.sh for the apply-wrapper option" reading of the task brief — live evidence (77 files, mostly single-writer, glob-clusterable) showed 77 bespoke wrappers is disproportionate; the wrapper's validator-CLI-separation idiom is reused inside the hook mechanism instead of being the primary gate.

### STEP architect-S2 · architect · 2026-07-25T00:05:00Z
**task-id:** IVC-ARCH-BLUEPRINT
**what-done:** Live-counted Class-A inventory instead of guessing: 162 tool files / 120 register server.tool / 115 import zod / 14 use explicit safeParse+reject / 12 zero-zod / 8 raw-SQL-in-interface-layer (2 of which safeParse).
**what-considered:**
- Manually reading all 162 tool files vs a proportionate grep-based triage + propose a scripted classifier for PM to mint.
- Treating "zero zod import" as an automatic gap vs spot-checking first.
**why-decision:** Spot-checked 3 of the 12 zero-zod files (customAlertTools, portfolioTools, targetAllocationTools) — all read-only, mutation tools deliberately removed ("task 241"). Confirms zero-zod is NOT automatically a write-gap; manual full-162 read would be disproportionate SPIKE effort and duplicate what a script should do repeatably. Proposed `IVC-A1` scripted inventory instead of fabricating a full per-file table.
**why-change:** no change from plan — matches PO's own instruction to inventory, not exhaustively hand-fix, Class-A.

### STEP architect-S3 · architect · 2026-07-25T00:08:00Z
**task-id:** IVC-ARCH-BLUEPRINT
**what-done:** Merged 3 existing error-shape precedents (agentSignalTools message+audit-log, foreignFlowValidator `{field,reason,originalValue}`, SSOT-directive `path/problem/expected/fix`) into one canonical `FieldValidationError`/`ValidationRejection` contract with a class-appropriate two-sink audit log (DB table for Class A, JSONL for Class C hook — no live DB in a standalone hook process).
**what-considered:** One universal DB-backed sink vs class-appropriate physical sinks with the same logical record shape.
**why-decision:** The hook runs as a standalone `bun` script outside the mcp-server process — no DB handle available — so a single physical sink is infeasible; kept the record SHAPE canonical while letting the sink differ by necessity (documented, not silently inconsistent).
**why-change:** no change from plan.

### STEP architect-S4 · architect · 2026-07-25T00:10:00Z
**task-id:** IVC-ARCH-BLUEPRINT
**what-done:** Proposed (not minted) ~11-14 row decomposition: 1 BA spec row, 6 Class-C rows, 2 Class-A scaffolding rows, N gap-fix rows (N left to IVC-A1's scan output, not guessed), routed almost entirely to dev-mcp-server per PO's own routing note; UC-CRITIC-HOOKS-ENFORCEMENT marked closed-by-reference once IVC-C1 ships rather than re-implemented separately.
**what-considered:** Fan-out-minting concrete dev rows myself now vs proposing counts/owners for BA/PM to formalize.
**why-decision:** Task instruction explicitly warns against self-minting dozens of rows (stale-duplicate churn risk per standing memory lesson); BA→PM chain is the correct next owner per agent-roster.md.
**why-change:** no change from plan.
