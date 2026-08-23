# TASK-CRON-LIVENESS-PROBE-TESTS

**Zone:** `scripts/agents-flow/` · **Owner:** `developer` · **Size:** M (~2h) · **Priority:** P0
**Parent row:** `FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md` §6
**depends_on:** `TASK-CRON-LIVENESS-PROBE-SCRIPT`
**blocks:** `TASK-CRON-SKILLMD-PROBE-WIRING`

---

## TLDR
Build `scripts/agents-flow/cron-marker-liveness-probe.test.sh`. **F1 and F2 passing under ONE spec is the entire thesis of the parent row** — one guard shape, both failure directions, no per-family threshold. A run that proves only one direction re-proves nothing.

## Acceptance Criteria

- [ ] **F1 — the 2026-08-23 corpse (false-LIVE direction).** Marker `cron-registration:cowork-team`, owner `2eaf4045`, `heartbeat_age=328 s` (well inside `T=7200`), owner **absent** from the presence roster, recorded pid **absent** from `ps`, transcript mtime **16 s old**. → assert `verdict=DEAD`.
      The transcript is *fresh* in this fixture on purpose: **F1 fails against any implementation that ranks O2 (transcript-mtime) above O1 (process-absence)**. If F1 passes trivially, the fixture is wrong.
- [ ] **F2 — the live standalone false-DEAD (false-DEAD direction).** Marker `cron-registration:standalone-team`, owner `88555d2e`, `heartbeat_age=30948 s` (≫ `T=120`), owner **absent** from the presence roster, recorded pid **present** with matching `start_epoch` and `comm=claude`. → assert `verdict=LIVE`.
      This was found FIRING LIVE during the architect pass — it is a captured live state, not a hypothetical.
- [ ] **F3 — pre-v2 marker.** `registering_process` absent, or a plain string (e.g. the live broken value `"ppid-42648-start-Dim_23_aoû_02:40:51_2026_-host-admins-MBP.lan"`), or `fp_version != 2` → assert `verdict=UNKNOWN`, alarm fired (telegram **and** `docs/signals/` row), and **no** silent `STOP`.
- [ ] **F4 — locale.** The suite runs under `LC_TIME=fr_FR.UTF-8` and asserts `start_epoch` parses **identically** to an `LC_ALL=C` run. Positive control: pid 42648 → `1787445651` → `2026-08-23T00:40:51Z`.
- [ ] **F2b — PID-reuse negative control (brief R2).** Recorded pid present in `ps` but with a **different** `start_epoch` (or a different `comm`) → assert `verdict=DEAD`, not LIVE. A pid-only check is a correctness bug, not an optimisation.
- [ ] **F3b — R1 degrade.** Transcript path unreadable (permission denied) with no usable O1 → assert `verdict=UNKNOWN`, never LIVE and never DEAD.
- [ ] **AC-T1 — fully mocked.** Tests mock `ps` / `stat` / `mcp_call`; **zero** real invocations. Mirror the existing `scripts/agents-flow/auditor-tier1-probe.test.sh` pattern — do not invent a second test harness convention.
- [ ] **AC-T2 — per-family coverage.** Each of the three families exercises its `on_unknown` disposition from the probe's `has_fire_election_mutex` table: `cowork-team`/`detect-loop` → `steal`; `standalone-team` → `defer` **+ alarm**.
- [ ] **AC-T3 — suite is runnable standalone and exits non-zero on any failure** (fail-loud; no `|| true` swallowing — see memory `feedback_silent_swallow_serial_bugs`).

**F5 is deliberately NOT in this task.** F5 asserts all three `SKILL.md` Step 1b.1 blocks invoke the probe and that `grep -c 'orphan_threshold_seconds: 7200'` across `.claude/skills/cron-*/SKILL.md` returns **0** — that can only pass after `TASK-CRON-SKILLMD-PROBE-WIRING` lands, so it is that task's AC.

## Files
- **Create:** `scripts/agents-flow/cron-marker-liveness-probe.test.sh`
- **Read first:** `scripts/agents-flow/auditor-tier1-probe.test.sh` (harness pattern) · `scripts/agents-flow/cron-marker-liveness-probe.sh` (from the blocking task) · brief §6 + §7
- **Do NOT modify:** `cron-marker-liveness-probe.sh` itself. If a fixture cannot be expressed without changing the script, that is a **BLOCKED escalation to pm/architect**, not a silent edit of the thing under test.

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-CRON-LIVENESS-PROBE-TESTS` + `AC:` trailer)
