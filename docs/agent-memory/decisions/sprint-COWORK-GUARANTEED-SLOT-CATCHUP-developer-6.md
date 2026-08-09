# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer

**Sprint goal:** no active sprint goal matched this task; resolved per skill mechanical rule (latest active sprint_goal.entries row) — this task is an unrelated cross-service P1 FIX, ambient to this sprint slot.
**Agent:** developer
**Started:** 2026-08-09T07:41:00Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-5.md (CAP-REACHED 2026-08-09T03:41:00Z, byte axis 37871/36000)

---

### STEP developer-S94 · developer · 2026-08-09T07:41:00Z
**task-id:** FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE
**what-done:** New `scripts/agents-flow/drain-signals-durable.test.js` (46 assertions): Scenario 1 (append→destructive, inbox fully populated), Scenario 2 (bounded1 short-circuit, REAL promote+claim jq scripts, inbox byte-identical), Scenario 3/3b (Step 1's own subtractive clear, byte-verbatim jq from main.md; concurrent-append survives), Scenario 4 (read-only orch dir → append fails, no destructive action, retry-recovery). Extended `orch-conservation-check.mjs` `signalTotal()` to sum `pending_triage_inbox` (TDD RED→GREEN). Added 2 `dev-standards.md` Script Persistence pointers.
**what-considered:**
- Reuse `drain-signals.test.js`'s harness via `require()` vs duplicate a tailored builder — chose duplicate: that file is a standalone script with top-level side effects, not an importable module (same convention it documents for itself).
- Scenario 2: hand-simulate bounded1's effect vs run the REAL `devteam-backlog-{promote,claim}-bounded1.jq` (+ `devteam-eligibility.jq` copied so `include` resolves — CWD-relative, verified empirically) — chose real scripts: a stub proves nothing about actual short-circuit safety.
- Scenario 4 failure mode: reuse the pre-existing "orch-state.json missing" case vs a genuinely new one — chose `chmod 0555` on the containing dir (fails inside `orch-apply.sh`'s own `mktemp`, not drain-signals.js's early-exit) — distinct code path, not a duplicate test.
**why-decision:** handoff's own Scenario 2 text ("run bounded1's promote/claim") only proves the negative control if the REAL scripts run; task's Risk section flags Scenario 4 retry/recovery as the hard part — added an explicit recovery-run assertion, not just the failure half.
**why-change:** no change from PM/architect's 4-scenario spec; added 2 supporting checks (backward-compat `// []` default, Conservation Guard Extension per Subtask 2's own AC) — both explicitly required by the handoff, not scope creep.
**verify:** RED confirmed (conservation-ext Case A failed pre-fix, 45/46) → GREEN (46/46) after 1-function fix. Regression: `drain-signals.test.js` 51/51, `orch-apply-wrapper-tests.sh` 75/75, `orch-state-hook.test.mjs` 21/21, `bun tsc --noEmit` 0 errors (no `.ts` touched). Repo-wide `bun test` times out >2min locally (pre-existing, unrelated to this change) — targeted/merge-gate suites above satisfy `dev-standards.md`'s own pinned reading (zero `.ts` files touched this task).

---
