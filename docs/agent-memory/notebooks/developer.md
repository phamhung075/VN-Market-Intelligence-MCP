# Developer — Notebook

**Last updated:** 2026-07-07 | **Cycle:** F1-LAUNCHD-COWORK-BACKSTOP + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED

## Session 2026-07-03 — FIX-AUDITOR-COMMIT-MUTEX-SKIP

**Task:** system-auditor's notebook commit step was non-deterministically SKIPPING the commit-mutex claim (flow-step drift on narrated prose) — 2 observed skips vs paired counterexamples. Consolidates DEFERRED sibling FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC (non-explicit `git add` had swept a peer's in-flight edits into f05795c3).
**Zone:** cross-service/ (scripts/ + docs/agents/) → developer handles directly, no zone match.

**Root-cause fix:** new `scripts/auditor-notebook-commit.sh` — ONE blessed script that internally claims/releases `commit-mutex:main` via a bash `trap ... EXIT` (claim can never be skipped by construction — no code path reaches `git commit` without passing the claim call first) and stages/commits ONLY the explicit paths passed as arguments (never `-A`/`-u`/`.`). Wired `docs/agents/system-auditor/flow/main.md`'s notebook commit step to call it instead of narrating raw git commands.

**Portability gotcha:** first draft used `mapfile -t arr < <(cmd)` — fails on macOS system `/bin/bash` (3.2, no `mapfile` builtin, this host has no bash4+ in PATH). Replaced with a portable `while IFS= read -r ...` loop.

**Live test evidence (no mocks, real gateway):** 4 scenarios verified against a scratch file (`docs/agent-memory/sessions/2026-07-03-auditor-commit-script-scratch-test.md`), each cross-checked via `task_list_held` before/after: (1) success → `[auditor-commit] mutex-paired commit <sha> paths=1`, lock paired claim+release; (2) no-op → `SKIP no-staged-changes`, lock still paired; (3) contended (simulated peer holding the lock) → `SKIP mutex-claim-failed contended ... — retry next tick`, exit 1, edit preserved uncommitted, then succeeded on retry once the peer released; (4) foreign-path guard — a peer file pre-staged in the shared index was detected and `git restore --staged`'d, never touching its content, while only the named own path was committed.

**Commit-mutex API gotcha:** `task_claim` rejects `ttl_seconds < 60` (Zod `too_small`) — script default is 90 (matches `.claude/skills/commit-mutex/SKILL.md`), safely above the floor.

## Session 2026-07-04 — IMPL-DRAIN-GATE-SEVERITY-RECURRENCE

**Task:** GATE-A (severity floor >=HIGH) + GATE-B (two-tier known-root DEDUP) inserted between drain-esc-dispatch.md Step 2 and Step 3, per architect brief `2026-07-04-drainesc-severity-recurrence-gate.md`. GATE-B Tier 2 needed one new read-only `--recurrence-count` CLI subcommand on `drain-signals.js` (inserted before the existing drain-mode gate, no touch to the hardened write path).

**Real bug found via live-data verification, not assumed:** the brief's literal Tier-1 jq filter (`(.related // []) | any(. == $rid)`) crashes (`Cannot iterate over string`) against LIVE `orch-state.json` — 3 real task_board rows store `.related` as a bare string, not an array (`FEAT-SEVERITY-OVERRIDE-SURFACING`, `FIX-ALERT-COMMANDER-DEAD-NO-SLOT`, `FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK`). Hardened to `if type=="array" then any(...) else false end` — same lesson class as the GVR context-key-drift finding already in the brief (assume nothing about freeform prod field shapes; verify against the live SSOT before shipping a filter).

**AC6 self-healing test gotcha:** testing against a raw COPY of the live orch-state.json produced a false positive — MY OWN in-flight task row (`IMPL-DRAIN-GATE-SEVERITY-RECURRENCE`, `related: [..., "REFLOW-MBB-Q1-2026", ...]`) is itself non-terminal and matches the Tier-1 filter, masking the real signal. Fixed by testing self-healing against a minimal isolated fixture (only the rows under test), not the noisy live doc — same "isolation-probe first" lesson as auditor false-positive triage, applied to jq fixture design.

**Test harness convention followed:** `<script>.test.js` colocated (matches `cowork-match-slots.test.js`), each scenario builds its own `os.tmpdir()` mkdtemp harness (own `docs/signals/signals.db` + copied script) so the live signals.db/inbox is never touched. AC7 (byte-identical no-arg drain-mode) proven two ways: (1) ad hoc before/after diff of stdout+DB rows+processed/ files across a real pre-change vs post-change script copy; (2) a permanent golden-stdout regression assertion in the committed test.

**Verified:** all 9 ACs (AC1/AC2 via a GATE-A pseudocode mirror script; AC3/AC6/AC9 via jq against live + isolated fixtures; AC4/AC5/AC7/AC8/AC9 via `drain-signals.test.js`, 11/11 pass). Line cap: drain-esc-dispatch.md 87L→150L (<200 cap). Commit `bf0b2cc9a`.

## Session 2026-07-07 — F1-LAUNCHD-COWORK-BACKSTOP + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED

**Task:** Two READY board tasks worked together (PO brief-signoff `2026-07-07-cowork-guaranteed-slot-durability.md`, closes ~73h multi-day guaranteed-slot outage). **Zone:** cross-service, no zone match → developer handles directly.

**F1:** generalized `scripts/cowork-fb-daily-firer.sh` (fb-only, hardcoded UTC-window if-chain) into `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` — calls the SAME matcher the live `*/15` dispatcher uses (`cowork-match-slots.js`), filters `slots[]` to `guaranteed===true`, fires each match's `trigger_prompt` read VERBATIM off the slot object. A new `guaranteed:true` row needs zero script edits. Retired old script + `launchd/com.vn-market.fb-daily-firer.plist` into the generalized `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist`.

**Empirical verification, not assumed (brief §3.7 explicitly required this):** this macOS host has NEITHER `timeout` NOR `gtimeout` on PATH (stock macOS ships no GNU coreutils). `_bounded_exec()` prefers either if present, but the real production code path is a pure-bash background-process + watchdog fallback — proven by a regression test (T10) that a hung claude invocation is actually killed near the configured bound (2s test), not the full 300s sleep.

**FIX:** extended `scripts/agents-flow/auditor-tier1-probe.sh` with check 6 (`_check_launchd_agents`) — SSOT = this repo's own `launchd/*.plist` Label fields (read off each file, never hardcoded, same "no-hardcode" pattern as F1's matcher-driven design) must all appear in `launchctl list`. Closes the exact gap the brief found: old fb-daily-firer.plist WAS loaded+firing 07-01→07-04, then silently unloaded with nothing detecting it. Bug-alerting is inherited via the existing FAILURE→spawn-system-auditor pipeline (cron-detect-loop Job 2) — no new alert code inside this READ-ONLY pre-gate script (its own invariant: no MCP calls).

**Test-seam gotcha:** `HEARTBEAT_FILE`/`LAUNCHD_DIR` are plain vars bound once at source-time from `HEARTBEAT_FILE_PATH`/`LAUNCHD_DIR_PATH` env — a sourced-function test overriding per-scenario behavior must reassign the SCRIPT'S OWN internal var name directly (dynamic-scope re-read at call time), not re-export the `_PATH` env var (only read once at source). Real subprocess (CLI-level) tests use the `_PATH` env var correctly since each invocation is a fresh process.

**Tests:** 25/25 (`cowork-guaranteed-slot-firer.test.sh`, new) + 79/79 (`auditor-tier1-probe.test.sh` — 60 pre-existing regression byte-behavior-unchanged + 19 new incl. mandatory injected-fault pair T25/T26 per brief §6.7). Zero real `claude`/`node`/`launchctl load-unload` calls in any test. `graphify --update --no-viz` skipped — no LLM API key in this session's environment (pre-existing env gap, not this task's scope).

**Board:** both READY→IN_PROGRESS→REVIEW via `scripts/orch-apply.sh` (jq transforms in `scripts/dev-cowork-guaranteed-slot-durability-{claim,to-review}.jq`). Signaled qa — unblocks `QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL` (backlog, 7-point test per brief §6) once both land DONE_VERIFIED.
