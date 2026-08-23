# TASK-CRON-LIVENESS-PROBE-SCRIPT

**Zone:** `scripts/agents-flow/` · **Owner:** `developer` · **Size:** M (~2.5h) · **Priority:** P0
**Parent row:** `FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE`
**Architect brief (READ FIRST, in full):** `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md`
**depends_on:** none — this is the first task in the ROW 1 chain
**blocks:** `TASK-CRON-LIVENESS-PROBE-TESTS`, `TASK-CRON-SKILLMD-PROBE-WIRING`

---

## TLDR
Build `scripts/agents-flow/cron-marker-liveness-probe.sh` — one script, three cron families — that decides whether a cron-registration marker's owning session is DEAD / LIVE / UNKNOWN by **observing the operating system**, not by reading bookkeeping the dying session wrote about itself. This is the whole fix: both existing oracles (session-presence roster, `task_force_release_orphan`'s `heartbeat_at`) are self-reported, so no threshold value can make either sound.

## Root cause you are fixing (brief §2)
`session-presence` is a *participation* signal (measured 2026-08-23T09:18Z: **2 roster rows against 5 live `claude` PIDs**), and `task_force_release_orphan` reads `heartbeat_at` on the **same marker row** — renewed only by the now-dead owner. It answers "was alive T ago", never "is alive". One defect, two faces: false-LIVE at `T=7200` (cowork/detect-loop, renewal hook present) and false-DEAD at `T=120` (standalone, no renewal hook). **Do not "fix" this by tuning thresholds.**

## Oracle ranking — do NOT reorder (brief §3)
| # | Oracle | Soundly proves | Blind window |
|---|---|---|---|
| **O1** | recorded PID absent from `ps`, or present with a different `(pid, start_epoch, comm)` | **DEAD** | none |
| **O2** | transcript `.jsonl` mtime within window `W` | **LIVE** | none *in the LIVE direction* |
| **O3** | `heartbeat_age` / presence-roster membership | neither | up to `T`; roster undercounts |

O1 is first. At the incident instant the dead session's transcript was **16 s old** — any mtime threshold above 16 s also returns LIVE, so O2-as-primary reproduces the outage with a smaller constant.

## Acceptance Criteria
- [ ] **AC-1 — CLI contract.** `bash scripts/agents-flow/cron-marker-liveness-probe.sh --family cowork-team|detect-loop|standalone-team`. One line of JSON on stdout: `{verdict, family, marker_owner_session, evidence:{o1,o2,o3}, recommended_action}`, `verdict ∈ DEAD|LIVE|UNKNOWN|NO_MARKER|SELF|ERROR`. Exit code follows the fleet's existing tick-preflight idiom (`0` = terminal, no LLM read needed; non-zero = LLM continues) — see `scripts/agents-flow/cowork-tick-preflight.sh`.
- [ ] **AC-2 — Three-branch verdict (brief §4.1), no forced guess.** `DEAD` iff O1 proves dead; `LIVE` iff O2 proves live OR O1 matches on all of `(pid, start_epoch, comm)`; `UNKNOWN` otherwise (no fingerprint recorded / transcript unreadable / transport error). The current two-branch LIVE/DEAD shape is what cost 8 h 10 m — the third branch is mandatory, not optional.
- [ ] **AC-3 — `has_fire_election_mutex` table lives in THIS script (brief §4.2), one place, not three docs.** `cowork-team: true` (`cowork-tick-preflight.sh` Step 3 claims `cron:cowork:<tick>`), `detect-loop: true` (`dev-team-tick-preflight.sh` `_step_fire_election()` claims `cron:dev-team:<tick>`), `standalone-team: false` (verified: no cross-session mutex in `cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-db-data-integrity.md`; `cron-code-janitor.md` has a local SKIP/SPAWN preflight only). `on_unknown` derives from that field: `true → steal`, `false → defer + alarm`.
- [ ] **AC-4 — v2 fingerprint reader + backward compat (brief §4.5).** Parse the structured `registering_process` object (`fp_version:2, pid, start_epoch, comm, host, session_id, transcript`). If `registering_process` is **absent, a string, or `fp_version != 2`** → O1 unavailable → `UNKNOWN`, never a guess. The probe **reads** this field; `TASK-CRON-SKILLMD-PROBE-WIRING` makes the skills **write** it.
- [ ] **AC-5 — every measured trap handled (brief §4.6).** All six, each with a comment naming it:
  1. `LC_ALL=C` on **both** `ps -p "$PID" -o lstart=` **and** `date -j -f "%a %b %d %T %Y"`. Without it `ps` prints `Dim 23 aoû …` and the parse fails. (Host is CEST, `LC_TIME=fr_FR.UTF-8`.)
  2. macOS `ps` has **no `etimes`** (`ps: etimes: keyword not found`) — only `etime` and `lstart`. Do not port the Linux idiom.
  3. Never test `ps` by exit code through a pipe — `LC_ALL=C ps -p 99999 -o lstart= | sed …` returns `rc=0` (that is `sed`'s status), and `ps -p 999999` prints `process id too large` to stderr. **Capture stdout before any pipe and test for empty.**
  4. `stat -f '%m'` (epoch), never `stat -f '%Sm'` (prints `23 aoû 11:03` for a `09:03Z` mtime — locale trap and UTC-offset trap in one field).
  5. **PID reuse** — never check pid alone; require the full `(pid, start_epoch, comm)` triple to agree.
  6. **Transcript path: read it from the marker, never re-derive it.** Pre-v2 markers fall back to glob `~/.claude/projects/*/<SID>.jsonl`. The probe must never re-implement the `/`→`-`, `_`→`-`, `.`→`-` encoding.
- [ ] **AC-6 — reuse `scripts/agents-flow/mcp-call.sh`** for `task_list_held`. Do not reinvent the transport — that helper's own header says "Built ONCE per architect risk note R1 — do not reinvent this transport per script."
- [ ] **AC-7 — no branch terminates silently (brief §4.3).** `UNKNOWN` and `DEFER` emit `send_telegram(channel="bug", …)` **and** a `docs/signals/` row, deduped on `(family, marker_owner_session)` with a cooldown, **reusing the existing `docs/signals/` dedup-key convention** — do not invent a new suppression mechanism. The 8 h 10 m cost came from the wrong answer being *unobservable*, not only from it being wrong.
- [ ] **AC-8 — evidence always emitted.** Every oracle's raw evidence appears in the JSON even when it did not decide, so a wrong verdict is diagnosable from the log alone.
- [ ] **AC-9 — `SELF` branch.** If the marker owner is the probing session itself, return `verdict=SELF` (never DEAD) so a re-arm in the same session is a clean no-op.
- [ ] **AC-10 — R1 degrade.** An unreadable peer transcript (different macOS user / sandboxed path) degrades to `UNKNOWN`, never to LIVE or DEAD.

## Files
- **Create:** `scripts/agents-flow/cron-marker-liveness-probe.sh`
- **Read first:** `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md` §3, §4.1–§4.7, §7 · `scripts/agents-flow/mcp-call.sh` (transport) · `scripts/agents-flow/cowork-tick-preflight.sh` (exit-code idiom, Step 3 mutex) · `scripts/agents-flow/dev-team-tick-preflight.sh` (`_step_fire_election`) · `.claude/skills/cron-cowork-team/SKILL.md:82-103`, `.claude/skills/cron-detect-loop/SKILL.md:51-72`, `.claude/skills/cron-standalone-team/SKILL.md:68-91`
- **Do NOT modify:** any `.claude/skills/cron-*/SKILL.md` — those are `TASK-CRON-SKILLMD-PROBE-WIRING` (owner `agent-father`), and editing them here is an out-of-zone breach.

## Out of scope
- Giving `standalone-team` its missing per-tick fire-election mutex → `FOLLOWUP-CRON-STANDALONE-PER-TICK-FIRE-ELECTION-MUTEX` (brief §4.2, R6). Explicitly **not** a blocker for this row: today standalone is wrong in both directions; after this task it is wrong in at most one, and loudly.
- Tests → `TASK-CRON-LIVENESS-PROBE-TESTS`. Write the script so `ps` / `stat` / `mcp_call` are **injectable/mockable** (env-overridable command names or thin wrapper functions) — the test task mocks all three and must make zero real invocations.

## Standards
`docs/policies/dev-standards.md` · `docs/standards/gateway-call-contract.md` · fail-loud: `docs/protocols/fail-loud-protocol.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-CRON-LIVENESS-PROBE-SCRIPT` trailer + `AC:` trailer)
