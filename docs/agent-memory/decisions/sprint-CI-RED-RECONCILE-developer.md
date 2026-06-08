<!-- agent: developer | task: CI-HEALTH-FIX-BRIDGE | sprint: CI-RED-RECONCILE -->

# Decision Journal — developer — CI-RED-RECONCILE

---

## DJ-GATE-1 — CI-HEALTH-FIX-BRIDGE implementation

**Date:** 2026-06-08T18:34Z
**Agent:** developer
**Task-id:** CI-HEALTH-FIX-BRIDGE
**Sprint:** CI-RED-RECONCILE

### Decision

Implement `scripts/agents-flow/ci-health-probe.js` as the CANON-SCRIPT for
`docs/agents/dev-team/flow/ci-health-probe.md` (Steps CI-0..CI-4).

### Context

- origin/main HEAD is RED on run 27157108271: jobs `bun test` + `go-lint` failing.
- No prior ci-health-probe script existed. The spec (157L, commit 973a52c0) defines the
  complete contract including STALE-RUN GATE, 3-LAYER DEDUP, VERIFICATION GATE, and SAFE-JSON.
- Sibling script `drain-signals.js` used as style reference (same deps, same error patterns).

### Options considered

1. **bash one-liner** — rejected: bash nested-quote eval wedges (lesson: drain-signals.js
   first shipped after bash wedge). Node required per spec.
2. **shell string interpolation for gh fields** — rejected: FLEET-HOST-SAFETY / signal-payload
   shell-injection policy. All fields via JSON.parse + array execFileSync.
3. **Exit non-zero on gh failure** — rejected: spec mandates always exit 0 (non-fatal probe).

### Implementation choices

- CI-0/CI-1 STALE-RUN GATE: `git fetch origin main` then `git rev-parse origin/main`;
  filter runs where `workflowName === 'CI' && headSha === HEAD_SHA`.
- CI-2: filter jobs where `conclusion !== 'success' && conclusion !== 'skipped'`.
- CI-3 dedup: fingerprint = sha256(`ci_red:<headSha>:<sorted-job-names>`). Two-track:
  (a) sqlite3 `signals_processed` query; (b) filesystem scan of docs/signals/ +
  docs/signals/processed/ for matching `dedup_key`. Layer 3 (drain-signals DB insert)
  is downstream — referenced in spec, not duplicated here.
- CI-4: signal written via `JSON.stringify(signal, null, 2)` — no shell interpolation.
  `verification_gate: "ci_green_on_subsequent_push"` baked into payload per spec.

### QA results

- Run 1: emitted `docs/signals/ci-red-8ffb1985-20260608183355.json`
  (run 27157108271, HEAD 8ffb198570e7abf3f55aa2ebcb45d3be04039a97, jobs: bun test,go-lint)
- Run 2: "duplicate fingerprint found — dedup, skip" (filesystem Layer 1b gate fired)
- Signal JSON parsed cleanly; `verification_gate` field confirmed present.
- Test signal removed post-QA (not committed).

### Spec mismatches found

None. Spec matched exactly. One implementation detail not in spec but required for
correctness: filesystem scan of docs/signals/ covers the window between probe emit and
drain-signals run (before DB insert occurs). This is additive to the spec's Layer 1, not
contradictory.

### Commit

Committed `scripts/agents-flow/ci-health-probe.js` with explicit pathspec.
