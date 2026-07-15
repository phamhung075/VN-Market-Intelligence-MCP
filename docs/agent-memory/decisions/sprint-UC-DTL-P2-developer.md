# Decision Journal — Sprint UC-DTL-P2 · developer

**Sprint goal:** ULTRACODE-AUDIT-FIXALL task UC-DTL-P2 (dev-team-loop-P2, CONFIRMED, P1) — move
terminal-bloat/cold-eviction backstop into the deterministic tick-preflight so it is no longer
skippable by main.md's idle/adoption/session-gate exit shortcuts.
**Agent:** developer
**Started:** 2026-07-15T20:05:54Z

---

### STEP developer-S1 · developer · 2026-07-15T20:05:54Z
**task-id:** UC-DTL-P2
**what-done:** Ported `docs/agents/dev-team/flow/post-cycle.md` Step 4.2's cold-eviction backstop
(threshold predicate + `orch-cold-evict.sh`/`orch-state-validate.sh`/commit) into
`scripts/agents-flow/dev-team-tick-preflight.sh` as a new Step 5.5, called once from
`run_preflight()` right after Step 5's idle check and before either `_emit_verdict` call (RUN /
RUN-IDLE). post-cycle.md Step 4.2 demoted to a CANON-SCRIPT spec pointer (ci-health-probe.md
convention). 34 new tests (T21-T31), 89/89 GREEN (was 55/55 baseline, unchanged).
**what-considered:**
- Router dispatch prompt said the "existing eviction logic" lives in
  `scripts/agents-flow/context-bloat-backstop.sh` — REJECTED after reading both scripts + the
  brief: that script governs unrelated file-line-cap debt (PostToolUse Write/Edit hook, `docs/data/
  file-size-caps.json`), has nothing to do with orch-state.json terminal-sprint/done-lane bloat.
  The real target, confirmed by the architecture brief's own Change/Verifier text (dev-team-loop-P2)
  and by the log-line string match ("Terminal bloat: sprints=... done=..." appears verbatim only in
  post-cycle.md Step 4.2), is post-cycle.md's cold-eviction block. Implemented per the brief, not the
  router's paraphrase, since the task explicitly points to the brief for "full acceptance criteria."
- Router's stated test requirement ("assert eviction fires on RUN, RUN-IDLE, SKIP, AND ERROR") vs
  the brief's own verifier caveat ("must NOT run on SKIP — peer holds SF-1 and runs its own Step 5.5;
  must NOT run on ERROR — lock state undefined, unsafe to start a second guarded write"). These
  directly conflict. Chose the brief's verifier-vetted design: Step 5.5 placed structurally after
  Step 5 (reached only by RUN/RUN-IDLE — SKIP/ERROR both `return` earlier in `run_preflight`), so it
  cannot execute on those two verdicts by construction, not by an extra conditional. Wrote T21-T28 to
  test all 4 verdict paths, but asserting *selective* firing (fires RUN/RUN-IDLE-when-tripped, never
  SKIP/ERROR even with a tripping fixture) rather than the router's literal "fires on all 4."
- commit-mutex task_id: post-cycle.md's own inline pseudocode comment said
  `task_id="dev-team-evict-<slug>"`, but its own "Mutex contract" line 2 rows below already said the
  canonical `commit-mutex:main` — an internal inconsistency in the pre-existing doc. A per-caller
  slug would not actually mutex against other orch-state.json writers (defeats the lock's purpose).
  Used `commit-mutex:main` (matching `.claude/skills/commit-mutex/SKILL.md`) and corrected the
  now-stale inline comment in post-cycle.md to match, rather than porting the bug forward.
- Failure handling: `_step55_run_cold_evict`/`_step55_run_validate` failures must `return` (not
  `exit`) inside the sourced function — an `exit 1` (post-cycle.md's literal snippet, meant for an
  LLM-interpreted markdown block, not a real function body) would have killed the whole preflight
  script before any verdict JSON was ever emitted. Matches post-cycle.md's own stated contract:
  "Script exit non-zero -> log BUG-channel Telegram; skip commit; continue... (do not block)."
**why-decision:** Root-cause fix over literal-instruction compliance where the two conflict, per
standing "fix root cause, not recurrent symptom" — the brief is the authoritative, verifier-checked
source the dispatch prompt itself designates for "full acceptance criteria"; the router's summary
mischaracterized which script holds the eviction logic and over-generalized "every exit path" to
include verdicts (SKIP/ERROR) where running it would be actively unsafe or wasteful.
**why-change:** Deviates from the literal dispatch-prompt wording on 2 points (target script identity;
SKIP/ERROR firing) — both documented above with cited evidence, both resolved in favor of the
architecture brief + existing shipped invariants (commit-mutex canonical id, non-blocking backstop
contract). No change to the core deliverable: Step 5.5 exists, is reachable on every lock-winning
tick, reuses the existing cold-evict/validate scripts, orch-apply/ALLOW_SHRINK gating untouched.
