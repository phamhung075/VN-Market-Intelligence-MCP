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

---

## STEP: FU-SCHEMA-DRIFT-P7 gate — afterAll-reinit DISPROVEN, code REVERTED (2026-06-09 ~03:30Z, dev-team-router)

**Gate:** native fail+error must DROP below the 629 absolute (after-P4 e442cf11).
**Result:** ROSE to 630 (+1) — GATE FAILED.

- Bundle pushed b9e305ae→3572444a (one CI run 27181821035, job "bun test").
- Native summary (`gh run view --log`): **10886 pass / 36 skip / 616 fail / 14 errors / Ran 11538 tests** → fail+error = **630**.
- after-P4 baseline (e442cf11, run 27177364641): 10886 / 36 / 615 / 14 / 11537 = **629**.
- Bug A (b3d3022c) added +1 passing regression test (234) → tests 11537→11538. Net P7 contribution = -1 pass / +1 fail / **zero heal**.

**Residual buckets BYTE-FOR-BYTE IDENTICAL to 629 baseline** (CI log occurrence-bucket):
agent_signals 37, sbv_rates_history 19, positions 19, commodity_prices_history 19,
commodity_prices 16, daily_ohlcv 5, imf_indicators 3, no-such-column foreign_net_vol 3,
deep_fetch_queue 2, cron_job_runs 2, watchlist/vps_service_health/vnstock_trading_stats/
signal_quality_audit/insider_transactions/evidence_scores 1 each. **ZERO classes healed.**

**Empirical conclusion — afterAll-reinit lever is DEAD regardless of target file:**
- P6 (084/089/1527, non-destroyers): +1, zero heal.
- P7 (the actual 7 close-no-init destroyers: 103/1076/1291/182/1869b/231/283): +1, zero heal.
- Root cause confirmed (from P6 gate analysis): `afterAll(closeDb(); await initDatabase())` re-creates
  tables in file X's teardown, but the NEXT file's beforeEach/beforeAll `closeDb()` re-empties the
  `:memory:` singleton before the polluted pure-singleton file runs. The reinit'd handle never survives
  to the consuming file. Architect P7 spike was structurally sound (correctly identified the 7
  destroyers) but its FIX HYPOTHESIS (afterAll reinit) is disproven — same pattern as P5/P6.

**Router actions done:**
- 7 P7 test files reverted to b3d3022c (`git checkout b3d3022c -- <7 files>`); apps/ proven byte-identical
  to b3d3022c (Bug A baseline) via empty `git diff --cached b3d3022c -- apps/`.
- Bug A (b3d3022c, vpsHealthPoller unixepoch normalise + 234 regression) RETAINED — legit, +1 passing test, healed its own ordering bug, did not regress.
- P7 dev notebook + architect spike brief (2ec3a582) RETAINED (docs).
- tsc CLEAN pre-commit.

**Exhausted levers (5 touches):** P4 per-file inline-DDL (-5, KEPT) · P5 production getDb() self-heal
(+6, created_at slice-drift, reverted) · P6 afterAll on non-destroyers (+1, reverted) · P7 afterAll on
real destroyers (+1, reverted) · 9454baad mechanized one-size init (+219, reverted).

**ONLY remaining untried direction (route to ARCHITECT, 6th touch / recurring-bug):**
Either (a) RECONCILE the drifted standalone init slices (the created_at-omitting CREATE TABLE that caused
P5's +6 column drift) so canonical init is internally consistent, THEN re-apply P5 self-heal in getDb()
(self-heal proven to heal 4 classes — sbv_rates_history/commodity_prices_history/imf_indicators/vps_service_health
— once the slice drift is removed it should heal the rest without the column-error regression); OR
(b) a bun global preload/setup that guarantees the singleton is re-initialised on first getDb() AFTER any
destroyer empties it (global, not per-file afterAll — the per-file lever is dead). Architect must verify
each missing table's authoritative DDL from its owning production module before adding.
