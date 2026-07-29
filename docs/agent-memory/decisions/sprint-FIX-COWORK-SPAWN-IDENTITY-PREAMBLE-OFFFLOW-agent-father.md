**task-id:** FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW

**agent:** agent-father
**date:** 2026-07-29
**sprint:** FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW (recurring-bug-escalation, PO-triaged UNBLOCK, PLAN-ONLY, dispatched direct out of BACKLOG per recurring-bug policy — no lane wait)

---

## Root Cause

3rd occurrence of TASK_1967-04's SUCCESS→SILENT→FAILURE identity-overflow class. The 2026-07-12
fix (`FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD`, commit ae7dac51a) shipped a real Step -0/-1
identity + execute-not-narrate guard INSIDE `market-watcher/flow/main.md`. It did not prevent
recurrence because it guards the wrong layer: a 2026-07-29T04:00Z cowork spawn never opened that
flow file at all. It ran the project-root CLAUDE.md router protocol on itself
(session-presence, orphan-adoption, PRE-CLAIM, dispatch table) and returned "Coordination
Results / Dispatch Routing / Expected Behavior" prose — then `last_fired` still got stamped
(`2026-07-29T04:05:51Z`, confirmed live in `docs/data/cowork-schedule.json`) as if a real cycle
had run. An in-flow guard structurally cannot fire when the flow file is never entered — the
guard has to live at the one point every spawn is guaranteed to pass through: the dispatcher's
own prompt composition in `cowork-team/flow/spawn-fanout.md` Step 5.2, shared by every cowork
slot (not market-watcher-specific).

## Design Considered (PO recorded options A/B — synthesized, not picked alone)

- **A alone (spawn-prompt preamble, agent self-checks IDENTITY_CHECK=FAIL):** rejected as the
  *sole* mechanism — a self-report from an already-displaced agent is a vacuous reader-is-writer
  check (memory `feedback_reader_writes_its_own_trigger_field_check_is_vacuous`); the same
  process that already failed to read its own flow file cannot be trusted to reliably honor a
  *new* instruction either.
- **B literal (notebook-mtime pre/post liveness gate before stamping `last_fired`):** rejected as
  specified — legitimate quiet EXIT paths exist in `market-watcher/flow/main.md` Step -0/Step
  0-GW (e.g. the SIBLING_RECENT-corroborated gateway-skip EXIT, which touches neither the
  notebook nor `send_telegram`) and would false-positive as "off-flow" under a naive
  absence-of-mtime-advance check.
- **Chosen — synthesis:** (1) A, kept as cheap belt-and-suspenders — `IDENTITY_PREAMBLE`
  prepended to every `ENTRY_PROMPT` in Step 5.2, explicitly suppressing CLAUDE.md router-protocol
  inheritance and naming the exact bad-output shape to avoid. (2) refined-B, the load-bearing
  half — new **Step 5.3**, an *exogenous* detector: cowork-team (never itself displaced — it
  composed the prompt and observes the raw completion text) positive-matches each spawn's own
  returned text against verbatim CLAUDE.md router-protocol terms (`PRE-CLAIM`,
  `session-presence`, `orphan-adoption`, plus the incident's own observed heading shape). Positive
  match on a KNOWN BAD signature — not absence of a good one — sidesteps B's FP risk against
  legitimate silent exits, none of which emit that vocabulary (verified: grepped every
  cowork-spawnable agent's own flow/init files, zero hits outside cowork-team/dev-team/router
  docs).

## Fix Applied

- `docs/agents/cowork-team/flow/spawn-fanout.md` (309→409L, size-justification comment updated
  with delta): Step 5.2 computes `IDENTITY_PREAMBLE` once per slot and prepends it to
  `ENTRY_PROMPT` on both the `trigger_prompt` and legacy-fallback branches — never mutates
  `slot.trigger_prompt` itself, so the existing fail-loud consistency check and
  `cowork-match-slots.js`'s `extractPromptFlowPath()` keep matching its literal first line
  unchanged. New **Step 5.3** runs per-batch right after the inter-batch wait resolves: inspects
  each returned spawn's raw text for the off-flow signature; on hit, logs + `send_telegram(bug)`
  + adds `errors[]` entry `offflow_router_latch_detected` + removes the slot from `WON_SLOTS`
  (excludes it from the Step 5b `last_fired` write — conservative under-suppress, retried next
  due tick, same posture the file already applies on write failure).
- `docs/agents/cowork-team/flow/last-fired.md`: added `AC-P1-7-4` documenting the new exclusion
  path (same non-stamp treatment as `AC-P1-7-2` spawn failure, gated on returned content instead
  of transport success).
- `docs/agents/cowork-team/flow/main.md`: JUMP-TO table row for Step 5 now names both new
  sub-steps (5.2 preamble, 5.3 detector) for discoverability.

## Why This Is The Right Layer

Every cowork slot (market-watcher, news-scout, digest-predict, unified-agent, etc.) is fired
through this ONE file's Step 5.2 prompt composition — the fix is fleet-wide, not a repeat of the
2026-07-12 mistake of patching one agent's own flow. It does not depend on the displaced agent
doing anything right (Step 5.3 is dispatcher-side, exogenous) and does not weaken existing
guards (Step 5.0 blind guard, spawn-tool-error handling) — it closes the one class neither of
those can see: a spawn that returned cleanly but never ran its own flow.

## Verification Gate (behavioral — cannot be confirmed in this dispatch)

Per PO baseline: next real cowork tick where a spawn suffers identity displacement must produce
either a loud `IDENTITY_CHECK=FAIL` BUG telegram (Step 5.3, or self-reported per the preamble) in
place of a fabricated success + `last_fired` stamp. `scripts/agents-flow/cowork-schedule-consistency.test.js`
re-run clean post-change (9/9 pass, all 23 live slots) — confirms no regression to the
`trigger_prompt`/`flow_path` consistency invariant this file also owns. Live confirmation needs
the next natural off-flow-displacement incident (non-deterministic, cannot be forced) or a
targeted QA dry-run injecting a synthetic off-flow-shaped return string into Step 5.3's matcher.

## Files Changed

- `docs/agents/cowork-team/flow/spawn-fanout.md`
- `docs/agents/cowork-team/flow/last-fired.md`
- `docs/agents/cowork-team/flow/main.md`
- `docs/agent-memory/decisions/sprint-FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW-agent-father.md` (this file)

## Done Gate Status

DONE (implementation) — routing to `qa` for the behavioral verification gate above (dry-run
injection of a synthetic off-flow return string against Step 5.3, plus live observation over the
next several cowork ticks before this recurring-bug class can be marked closed).
