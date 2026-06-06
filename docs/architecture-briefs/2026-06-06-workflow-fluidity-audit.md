# Workflow Fluidity Audit — 2026-06-06

**Author:** agents-architect
**Date:** 2026-06-06T18:35:59Z
**Scope:** Full multi-agent pipeline — liveness, contention, throughput (READ-ONLY audit)
**Status:** COMPLETE

---

## Summary Scorecard

| Finding | Area | Verdict | Severity |
|---|---|---|---|
| F-1 | Handoff chain liveness — QA→fixer bounded exit | OK | — |
| F-2 | Handoff chain liveness — blocked task re-entry | DEADLOCK-RISK | HIGH |
| F-3 | orch-state.json atomic write discipline — partial coverage | CONFLICT | MEDIUM |
| F-4 | Decision journal — parallel-agent shared-file append | CONFLICT | HIGH |
| F-5 | Decision journal — 600L CAP-REACHED sentinel vs mandatory rule | CONFLICT | MEDIUM |
| F-6 | commit-mutex TTL expiry — covers crash-mid-cycle for all kinds | OK | — |
| F-7 | commit-mutex cross-session hold — no long-step hold risk | OK | — |
| F-8 | dev-team agents lack MCP gateway binding — who claims for them | BOTTLENECK | MEDIUM |
| F-9 | Cron cadence overlap — commit collision window | CONFLICT | HIGH |
| F-10 | WIP=2 global — binding constraint while backlog grows | BOTTLENECK | MEDIUM |
| F-11 | signal_queue drain only at dev-team Step 0a — queue starve window | BOTTLENECK | LOW |
| F-12 | fail-loud STOP — task lock not released on early exit | DEADLOCK-RISK | HIGH |
| F-13 | Sequential spawn mandate (c44 gate) — not yet lifted | BOTTLENECK | LOW |

**Totals: 3 OK · 3 CONFLICT · 3 DEADLOCK-RISK · 4 BOTTLENECK**

---

## 1. Handoff Chain Liveness

### F-1 — QA→fixer bounded exit: OK

**Evidence read:** `docs/agents/qa/flow/main.md` § changes-requested: "round < 2 → NEXT: fixer | round ≥ 2 → NEXT: architect". `docs/agents/fixer/flow/main.md` § Called from: "triggered exclusively by qa CHANGES_REQUESTED (round < 2); round ≥ 2 escalates to architect instead." `docs/protocols/agent-chaining-protocol.md` § Pipeline Map: "FIX: developer → qa ↔ fixer (max 2 rounds)".

The round counter is stored in the handoff file (`[QA] Review Record` section — round count incremented per QA pass). Both QA and fixer read the same handoff file. At round ≥ 2, QA returns `NEXT: architect` unconditionally — no condition that could re-enter fixer. Escalation to architect opens a new task in the task_board, breaking the loop.

**Verdict: OK.** Bounded at 2 rounds with a definite escalation owner.

### F-2 — Blocked task returns to claimable state: DEADLOCK-RISK

**Evidence read:** `docs/agents/developer/flow/main.md` L70-71: "depends_on not Done → STOP, notify PM" and "Load knowledge files (fail-loud → send_telegram(channel="bug"), STOP)". There is NO `task_release` call on either STOP path before the RETURN block. The sprint-task lock (TTL=3600s, claimed via `task_claim` at step 2b) remains held for up to 3600s after a fail-loud STOP.

`docs/protocols/fail-loud-protocol.md` § Error Boundary: "send_telegram(bug) → drop signal → EXIT immediately". No task_release step is specified.

`docs/protocols/task-lock-protocol.md` § TTL: "If the agent crashes, TTL expiry is the fallback — no manual cleanup needed." This means the lock eventually expires, but 3600s = 1h of lock hold time during which the task appears IN_PROGRESS and no other agent can claim it.

During that window, `dev-team Step 0b` pipeline-resume will attempt to respawn the same agent (because `.head.status = "in_progress"` and `.head.next_agent` is stale-populated). A fail-loud STOP agent cannot write `.head.status = "idle"` (it exits immediately), so the stale `.head` drives one spurious re-spawn per cron tick for up to 24h (24h expiry per Step 0b).

**Risk:** A developer that hits a knowledge-load failure leaves the task stuck IN_PROGRESS for ≤3600s and the pipeline head pointing at it for ≤24h. This is not a permanent deadlock (TTL rescues the lock; the 24h stale-head guard eventually resets), but it is a 24h potential head-lock scenario if the STOP happens early in a sprint cycle and the `.head` is not corrected.

**Fix proposal:** Add a mandatory `task_release(task_id)` call to developer/qa/fixer flows' STOP path, before `send_telegram` EXIT. Also instruct the fail-loud STOP path to write `.head.status = "idle"` atomically before exiting (same §2.3 pattern). This closes the 24h window to ≤5min (commit-mutex TTL).

---

## 2. Shared-File Contention — orch-state.json

### F-3 — Atomic write discipline: CONFLICT (partial coverage)

**Evidence read:** `docs/protocols/agent-chaining-protocol.md` § Pipeline Map L6: "Use atomic temp-file-then-rename write (see docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3). Read the full file, modify only the .head section, write atomically — never overwrite sibling sections." This is mandatory for all dev-team pipeline agents.

`docs/agents/pm/flow/main.md` § Signal Queue Write Guard: "Read docs/data/orch/orch-state.json → If .head.status == idle/closed → SKIP signal write → Log." PM has an explicit CAS guard.

**Gaps found:**
- `docs/agents/ba/flow/main.md` § Output: "Create Architect task in `docs/data/orch/orch-state.json` `.task_board.backlog[]`" — no explicit atomic write reference; the text reads "atomic write per §2.3" only in the PO-approves step (L72). The task creation step itself (L60-63) has no atomic write annotation.
- `docs/agents/system-auditor/flow/main.md` § Anomaly Reporting L420: "append row to `docs/data/orch/orch-state.json .signal_queue.rows[]` per signal-dashboard SKILL § WRITE (atomic write)" — auditor does write orch-state but does NOT claim commit-mutex for the orch-state write (only claims it for the notebook commit). The signal-dashboard skill's write procedure (verified in skill) says "atomic temp-file-then-rename" but the auditor write is NOT serialized against concurrent dev-team cron writes to the same file.
- **FU-ORCH-HEAD-CAS** is confirmed open per `orch-state.json .narrative.watch_items[2]`: "non-fresh-read caller can stale-read→sibling-clobber .head".

**Concurrent writers at same moment:** cowork-team (*/15 mark READ), system-auditor Tier-2 (*/4h emit signal row), dev-team (hourly drain + head write). These CAN fire within the same minute (e.g. 08:00 UTC: system-auditor Tier-2 at `0 */4` AND dev-team at `7 * * * *` offset is 7min — they don't overlap. Cowork-team at `*/15` CAN overlap auditor at `0 */4`: both fire on :00 of every 4th hour).

**Fix proposal:** The signal-dashboard § WRITE procedure should mandate a pre-write fresh-read sentinel check (same pattern as PM's CAS guard). Document that orch-state.json has THREE concurrent writer classes (dev-team, cowork-team via signal_queue, auditor via signal_queue) and that each must use a fresh-read-then-compare-then-write atomic idiom. FU-ORCH-HEAD-CAS should be promoted from backlog to sprint task.

---

## 3. Decision Journal — New Contention Point

### F-4 — Parallel-agent shared-file append: CONFLICT

**Evidence read:** `docs/agents/dev-team/flow/execute-tier.md` § Per-Tier Parallel Spawn: "→ Agent(dev-stock-price, taskA) + Agent(dev-alert-engine, taskB)". Both developer agents append to `docs/agent-memory/decisions/sprint-<id>.md` via the decision-journal skill. The skill says "entries accumulate; commit once per cycle" with `git add docs/agent-memory/decisions/sprint-<id>.md` — a single shared file per sprint.

Verified decision-journal skill (`SKILL.md` § Write Entry): no append serialization. No mention of commit-mutex for the journal append itself (only for the final git commit, which IS mutex-guarded). Two agents running in parallel worktrees that both append in-memory then commit the same file will experience a lost-write: the second committer's `git add` will see a different HEAD version of the file than the first, resulting in git conflict or the second agent's entries overwriting the first's.

The `docs/protocols/agent-chaining-protocol.md` § Parallel Isolation: "Tasks with disjoint file scopes (no file appears in both agents' write sets)" — but `sprint-<id>.md` appears in EVERY agent's write set. The file is a shared SSOT per sprint, not per-agent.

**Note:** With the current "Sequential mandate until c44 verification" (execute-tier.md L65), parallel spawns are suppressed. But the mandate is Phase 3-only and is intended to be relaxed (Phase 4 after c44+c45 pass). When Phase 4 activates, this contention will become live.

**Fix proposal (three options):**
1. Per-agent journal files: rename to `sprint-<id>-<agent-id>.md`. Dashboard/drilldown reads all files matching `sprint-<id>-*.md`. Eliminates all append contention. No shared writes.
2. commit-mutex wraps the journal append: treat the journal append+commit as a critical section. The 60s TTL is tight for multi-agent parallel scenarios (6 retries × ~20s = ~125s queue time), introducing up to 125s serialization latency per parallel agent.
3. Deferred journal: each agent writes to a private scratch file `sprint-<id>-<agent-id>-tmp.md`; a post-tier merge step (run by main terminal after all tier agents return) concatenates all tmp files into the canonical journal. No contention during execution; merge is sequential.

**Recommendation: Option 1 (per-agent files)** — simplest, zero contention, no latency cost, compatible with the ORCH-DASH-DECISION-DRILLDOWN sprint's join-key design (sprint-id field in STEP already disambiguates; per-agent file adds agent disambiguation).

### F-5 — 600L CAP-REACHED sentinel vs mandatory rule: CONFLICT

**Evidence read:** `SKILL.md` § Cap Check: "LINES > 600 → append sentinel `### CAP-REACHED · <ts>`, stop." The rule says "Ops concern only" — meaning further entries are silently dropped. However, the flow files mandate: "MANDATORY: one entry per task before REVIEW/DONE" (developer.md, qa.md, fixer.md, po.md — all carrying this language).

Once a sprint journal reaches 600L (currently `sprint-ORCH-DASH-DECISION-DRILLDOWN.md` is already 171L — a moderate sprint), the CAP-REACHED sentinel is appended and subsequent tasks in that sprint receive NO journal entry. The mandatory rule is then silently violated mid-sprint.

The `cowork-end-cycle` flush (Step 0) also calls the journal skill — cowork agents with many slots can push a sprint journal to 600L quickly if the sprint is long-running.

**Fix proposal:** The CAP-REACHED path must either (a) auto-archive the current file and create a new `sprint-<id>-part2.md`, or (b) emit a BUG telegram so the operator can run manual archival. The current "Ops concern only" note is insufficient given the mandatory-rule context. Add an explicit `send_telegram(channel="bug", "[decision-journal] sprint-<id> CAP-REACHED — mandatory entries now silently dropped; archive sprint journal")` call in the § Cap Check block, to make the violation audible rather than silent.

---

## 4. Lock Liveness

### F-6 — TTL expiry frees sprint-task lock on holder crash: OK

**Evidence read:** `docs/protocols/task-lock-protocol.md` § commit-mutex rules: "TTL=60s... crash recovery via TTL". § claim grammar: "If the agent crashes, TTL expiry is the fallback — no manual cleanup needed." `docs/.claude/skills/commit-mutex/SKILL.md` § TTL and Stale-Lock Reclaim: "TTL=60s. If the holder crashes before task_release, the lock expires in ≤60s and the next task_claim call wins (overwrite semantics built into coordination.db)."

Sprint-task locks (TTL=3600s) also auto-expire. The `task-lock/SKILL.md` § On claim-fail migration check handles stale-lock detection: if `ps.active_task_id == bare_task_id AND next_agent == owner_agent AND heartbeat_at > 300s stale`, agent exits with PIPELINE: blocked and waits for natural TTL expiry before retry.

**Verdict: OK.** TTL-based auto-expiry is functional and documented. No manual watchdog needed.

### F-7 — No flow holds commit-mutex across a long step: OK

**Evidence read:** `docs/.claude/skills/commit-mutex/SKILL.md` § Purpose: "ONLY the seconds-long critical section below. Everything before (read, build, test, generate, signal emit, heartbeat for other lock kinds) is lock-free." All flows confirm: commit-mutex is claimed immediately before `git add` and released immediately after `git show --name-only HEAD` self-verify. No flow steps exist between acquire and release other than the 4-step git sequence.

**Verdict: OK.** Bottleneck window = 2–10s. With 60s TTL and 6-retry backoff (~125s max), any contention resolves within ~135s worst case.

### F-8 — dev-team agents lack MCP gateway binding: BOTTLENECK

**Evidence read:** Memory note (commit-mutex-enum-drift): "dev-* sub-agents run INSIDE this session (not separate `claude -n` procs) → dev-team agents still lack the MCP gateway binding → still can't claim directly." `docs/agents/dev-team/flow/execute-tier.md` § Per-Tier Parallel Spawn: outer claim is made by `dev-team` (owner_agent="dev-team"), not by the individual agent. The inner claim (developer Step 2b) uses owner_agent="developer".

The mismatch: outer claim = dev-team, inner claim = developer. Both claims on the same task_id ("task:NNN"). The inner claim from developer will fail with `claimed=false` if outer claim is still held. The task-lock skill § On claim-fail migration check handles this by detecting stale-lock: if `ps.next_agent == owner_agent AND heartbeat stale > 300s`, it exits with stale-lock-takeover. But if outer claim is NOT yet stale (dev-team actively heartbeating), developer would see `claimed=false WITH current_holder=dev-team`, which maps to "real collision — peer session actively heartbeating" → SKIP.

**Risk:** If the outer dev-team claim is held by the dispatcher-wrap `finally` block (which releases AFTER the spawn returns), and the inner developer agent claims before the outer releases (impossible in single-thread), there is no issue. But if the developer spawn runs in a worktree and the outer claim is released before developer's inner claim step, there is a timing window where a peer dev-team cron tick could steal the outer claim slot. This is a LOW probability window but the protocol is complex and relies on sequential ordering within a single session.

**Verdict: BOTTLENECK** — the dual-layer claim model is functional but adds protocol complexity and a dependency on session-scoped execution that is undocumented as a constraint. If the worktree isolation model (Phase 4) activates multi-session parallel spawns, this assumption breaks.

**Fix proposal:** Document explicitly that the outer dev-team claim MUST be held until after the inner agent claim succeeds (not just until after spawn returns). Add a heartbeat for the outer claim in the executor loop. Alternatively, simplify to a single claim (inner agent claims directly with owner_agent="developer"), with the dispatcher acting as a check-only (no claim) before spawn.

---

## 5. Cron/Cadence Overlap

### F-9 — Concurrent commit collision window: CONFLICT

**Evidence read:** Cron schedules:
- cowork-team: `*/15 * * * *` (fires at :00, :15, :30, :45 every hour)
- dev-team: `7 * * * *` (fires at :07 every hour)
- system-auditor Tier-1: `*/30 * * * *` (fires at :00 and :30)
- system-auditor Tier-2: `0 */4 * * *` (fires at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
- system-auditor Tier-3: `0 2 * * *` (fires at 02:00)
- BCTC-analyst: 4× daily (cadence from cowork-schedule.json — not checked in this audit)

Collision windows:
- **:00 of every 4th hour** (00:00, 04:00, 08:00, etc.): cowork-team (:00) + auditor Tier-2 (:00) fire simultaneously. Both can write orch-state.json (cowork reads signal_queue, auditor writes signal_queue rows and notebook commit). Commit-mutex serializes notebook commits, so the commit race is covered. However, orch-state.json writes (signal_queue appends) are NOT commit-mutex protected — they use atomic temp→rename but two processes doing temp→rename concurrently can still clobber (last writer wins, first writer's data lost).
- **00:00 specifically**: cowork-team (:00) + auditor Tier-2 (:00) + auditor Tier-3 at 02:00 (30 min gap — no overlap). 02:00: Tier-3 alone.
- **:30 of every even hour**: auditor Tier-1 (:30) + possible cowork-team (:30) — both running concurrently. Auditor Tier-1 only reads (runtime ping → post_agent_signal MCP call), does NOT write orch-state.json directly. No conflict here.

**Primary collision: :00 every 4h between cowork-team and auditor Tier-2.** Both write to orch-state.json `.signal_queue.rows[]` via atomic temp→rename. The file-system atomic rename (`rename(2)`) is POSIX-atomic on a single filesystem, so two concurrent writers doing `jq > tmp && mv tmp orch-state.json` will NOT corrupt the file (one rename wins, the other's write lands in the file). BUT: the losing writer has read a stale snapshot and its changes are overwritten → silent data loss for that writer's appended rows.

**This is the FU-ORCH-HEAD-CAS class bug applied to signal_queue.** The temp→rename idiom is atomic at the file level but NOT safe against concurrent read-modify-write sequences.

**Fix proposal:** Introduce a row-level append idiom instead of full-file replace for signal_queue writes: use `jq '. + {signal_queue: {rows: (.signal_queue.rows + [$new_row])}}' orch-state.json` with a retry-loop (read→modify→write→verify using file mtime). Alternatively, move signal_queue to a dedicated SQLite table (already exists as `signals.db` for the file-signal bus) — cowork and auditor insert rows into the DB rather than writing orch-state.json. This is the cleanest serialization boundary (SQLite WAL handles concurrent writes natively).

**Weekly zone-scan cadence** (dev-team cron README): Sunday 03:00–05:00 UTC, 9 agents × 15min stagger. At 03:00, dev-mcp-server fires + auditor Tier-3 at 02:00 (already done, no overlap). At 03:15–05:00: successive zone agents may overlap with auditor Tier-1 (:30). These are read-heavy; no concurrent orch-state write conflict.

---

## 6. WIP/Throughput Bottlenecks

### F-10 — WIP=2 binding constraint: BOTTLENECK

**Evidence read:** `docs/agents/dev-team/flow/main.md` § Invariants: "WIP ≤ 2". `docs/agents/pm/flow/main.md` L29: "WIP > 2 → hold and return PIPELINE: blocked | NEXT: po | WIP limit exceeded." `docs/data/orch/orch-state.json` `.head.wip_max: 2`.

The current orch-state has 10+ open sprints listed in `narrative.open_sprints[]`, with a full backlog. Each dev-team hourly tick runs one PO triage → selects up to WIP=2 tasks → executes them. With the 1h cron cadence and WIP=2, maximum throughput is 2 tasks per hour (assuming each task fits in one cron cycle).

For medium sprints (SPRINT-M) that involve ba→architect→pm→developer→qa chain, the actual wall-time per task is ~3-5h (multiple cron ticks). With WIP=2 and 5h tasks, effective throughput is ~0.4 tasks/h. The backlog in orch-state has ~30+ tasks visible across open sprints.

**Assessment:** WIP=2 is a deliberate host-resource constraint (16GB Mac, 8GB Docker cap per memory note). This is not a design flaw — it is the correct guard against host-panic. However, the system has no mechanism to detect when WIP=2 is consistently the binding constraint vs when the pipeline is naturally at WIP<2. Adding a telemetry metric (WIP utilization % over last N ticks) would make this observable.

**Fix proposal (non-blocking):** Add a WIP-utilization metric to system-auditor Tier-2 (count orch-state task_board IN_PROGRESS tasks vs wip_max over last 24h) and report in the WORK channel once per day. Not a liveness issue — low severity.

### F-11 — signal_queue drain window: BOTTLENECK (LOW)

**Evidence read:** `docs/agents/dev-team/flow/drain-signals.md` § 0a-D: drain only runs at dev-team Step 0a (hourly at :07). Cowork-team fires at */15 and may write signal_queue rows that will not be drained until the next :07 mark — up to 53 minutes (if written at :08). `docs/agents/cowork-team/flow/main.md` § Step 0a: also reads signal_queue but only for cowork-addressed rows, not po-addressed rows.

Signals addressed to `po` (from auditor, TNB, cowork agents) sit in the queue for up to 53 minutes before dev-team processes them. For high-urgency signals (CRITICAL infra findings from auditor), this means the PO triages them 53 min after detection at best.

**Assessment:** This is by design and was a known trade-off per the OSC sprint. The signal_queue is complementary to the file-based signal bus (docs/signals/*.json), which is also drained by dev-team hourly. No immediate fix needed, but the 53-min window should be documented as a known latency bound for urgent signals.

**Fix proposal (non-urgent):** For CRITICAL-severity auditor findings, emit BOTH a signal_queue row AND a file-based signal in docs/signals/ (which dev-team also drains). This gives two drain paths. Auditor Tier-1 (every 30 min) could use the file bus for critical findings; auditor Tier-2/3 can use signal_queue for normal findings.

---

## 7. Fail-Loud Dead-Ends

### F-12 — STOPped agent leaves task IN_PROGRESS: DEADLOCK-RISK

**Evidence read:** `docs/agents/developer/flow/main.md` L70-71: two STOP paths (depends_on not Done; knowledge load fail-loud). Neither path calls `task_release`. The sprint-task lock TTL=3600s means the task stays IN_PROGRESS in coordination.db for ≤1h. During this window, the pipeline head (orch-state.json .head) remains `status:"in_progress"` if the developer wrote it before failing (per agent-chaining-protocol.md § mandatory pipeline-state write).

The stale-head guard (`updated_at ≥ 24h → reset to idle`) only fires 24h later. If `.head.updated_at` is recent (developer wrote it in the same cycle before hitting the fail-loud STOP), the pipeline head will point to the stuck task for up to 24h, causing the dev-team cron to attempt pipeline-resume repeatedly — each attempt spawning the same agent, which hits the same fail-loud condition again (since the root cause — missing file, missing dependency — is not fixed between cron ticks).

This is a **bounded livelock**: the task never progresses (correct), but the dev-team cron spends a cron slot per hour for up to 24h attempting futile resumes. During each futile resume, the PO triage step may be skipped (JUMP TO execute instead of drain-signals).

**Fix proposal:** Three changes required:
1. Fail-loud STOP path in developer/qa/fixer flows MUST call `task_release(task_id)` before EXIT.
2. Fail-loud STOP path MUST write `.head.status = "idle"` (atomic §2.3) before EXIT, so the stale-head guard never fires.
3. dev-team pipeline-resume (Step 0b) should check: if the task identified in `.head.active_task_id` is in `status=BLOCKED` in the task_board → reset head to idle and route to Step 1 (PO triage) instead of spawning the same agent again.

---

## 8. Sequential Spawn Mandate

### F-13 — c44 gate not lifted: BOTTLENECK (LOW)

**Evidence read:** `docs/agents/dev-team/flow/execute-tier.md` L65: "Sequential mandate: Sequential dispatch remains MANDATORY until c44 verification (Phase 3 of the roadmap). After c44+c45 pass, Phase 4 relaxes this mandate." `docs/protocols/agent-chaining-protocol.md` § Parallel Isolation: "Sequential MANDATORY until c44 pass (Phase 3)."

No evidence in orch-state or recent commits that c44 or c45 have been verified or planned. The mandate is open-ended, meaning Phase 4 (parallel worktree spawns) is indefinitely deferred. This halves theoretical throughput (WIP=2 but all sequential = max 1 active dev at a time).

**Verdict: BOTTLENECK** but acknowledged design constraint. Low priority given host resource limits.

**Fix proposal (non-blocking):** Add a SPIKE task to the backlog: "verify c44 parallel-isolation proof — run two developer agents in worktrees on disjoint zones, confirm no shared-index race". Once c44 passes, Phase 4 can be activated. Track in orch-state open_sprints.

---

## Top-3 Fixes Ranked

### Rank 1 — F-12 + F-2: Fail-loud/STOP path does not release sprint-task lock or reset pipeline head

**Impact:** HIGH. Affects every developer/qa/fixer fail-loud cycle. Creates a 1h lock hold + up to 24h pipeline head livelock (10–24 futile cron cycles). Silently blocks PO triage during futile resume attempts.

**Concrete action for agent-father:**
- `docs/agents/developer/flow/main.md` § Pre-code checklist: after step 4 (depends_on STOP) and step 5 (knowledge fail-loud STOP), add: `call_tool(server="vn-market", tool="task_release", arguments={task_id:"task:"+task_id}); write orch-state.json .head {status:"idle", updated_at:<now>, updated_by:"developer"} atomically; EXIT`
- Same pattern in `docs/agents/qa/flow/main.md` and `docs/agents/fixer/flow/main.md` STOP paths.
- `docs/agents/dev-team/flow/main.md` § Step 0b: add a check: if `.head.active_task_id` task status = BLOCKED in task_board → reset head to idle, JUMP TO drain-signals.

### Rank 2 — F-4: Decision journal shared-file append breaks under Phase 4 parallel spawns

**Impact:** HIGH (latent, activated at Phase 4). Two parallel developer agents appending the same file = lost writes or git conflict. Already partially problematic with cowork agents also writing to the same date-keyed file.

**Concrete action for agent-father:**
- `docs/.claude/skills/decision-journal/SKILL.md` § Resolve Sprint ID: change journal path resolution to `JOURNAL_PATH="docs/agent-memory/decisions/sprint-${SPRINT_ID}-${AGENT_ID}.md"` (per-agent files).
- `docs/agents/agents-architect/handlers.md` § brief mention of dashboard drilldown: note that the ORCH-DASH-DECISION-DRILLDOWN feature must read `sprint-<id>-*.md` glob instead of a single file.
- Update all flow files that reference `sprint-<id>.md` to use the per-agent path.

### Rank 3 — F-9 + F-3: Concurrent orch-state.json signal_queue writes use atomic rename but lose data under concurrent read-modify-write

**Impact:** MEDIUM. Concurrent cowork-team and auditor Tier-2 writing at :00 every 4h can silently drop signal rows (last writer wins on rename). FU-ORCH-HEAD-CAS is the same class bug.

**Concrete action for agent-father:**
- Promote FU-ORCH-HEAD-CAS from narrative.backlogs to an active sprint task. Assign to dev-mcp-server.
- Add a retry-read-compare loop to signal_queue append: after jq modify → tmp write → sentinel verify, check if the file mtime changed since the initial read; if yes, re-read and re-apply the append, up to 3 retries. If still colliding after 3 retries, log WARN and skip (signal survives in memory for next cycle).
- Document the three concurrent writer classes (dev-team, cowork-team, auditor) explicitly in the signal-dashboard skill so future agent-father edits understand the contention surface.

---

## Known Recent Events — Factored

- **ORCH-DASH-DECISION-DRILLDOWN sprint in flight:** audit scope is flow dynamics, not schema; the per-agent journal file fix (F-4) must coordinate with the F1/F2/F3 join-key design. Signal this as a constraint to agent-father.
- **Decision-journal mandatory rule landed (aefc3dc1):** confirms F-4 and F-5 are live concerns now, not future-only.
- **Live sprint TASK-SCHEMA/DECISION-JOIN editing flows:** this audit is READ-ONLY; agent-father should sequence the F-4 fix AFTER the ORCH-DASH-DECISION-DRILLDOWN sprint closes (to avoid editing the same files concurrently).

---

## Appendix — Files Read

- `.claude/skills/dispatch/SKILL.md`
- `.claude/skills/commit-boundary/SKILL.md`
- `.claude/skills/commit-mutex/SKILL.md`
- `.claude/skills/task-lock/SKILL.md`
- `.claude/skills/decision-journal/SKILL.md`
- `.claude/skills/cowork-end-cycle/SKILL.md`
- `.claude/skills/signal-dashboard/SKILL.md`
- `.claude/commands/crons/cron-dev-team.md`
- `.claude/commands/crons/cron-system-auditor.md`
- `.claude/commands/crons/cron-cowork-team.md`
- `docs/agents/po/flow/main.md`
- `docs/agents/ba/flow/main.md`
- `docs/agents/architect/flow/main.md`
- `docs/agents/pm/flow/main.md`
- `docs/agents/developer/flow/main.md`
- `docs/agents/qa/flow/main.md`
- `docs/agents/fixer/flow/main.md`
- `docs/agents/dev-team/flow/main.md`
- `docs/agents/dev-team/flow/execute-tier.md`
- `docs/agents/dev-team/flow/drain-signals.md`
- `docs/agents/system-auditor/flow/main.md`
- `docs/agents/cowork-team/flow/main.md`
- `docs/protocols/agent-chaining-protocol.md`
- `docs/protocols/fail-loud-protocol.md`
- `docs/protocols/task-lock-protocol.md`
- `docs/data/orch/orch-state.json` (head + task_board sections)
- `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md`
- `docs/agent-memory/decisions/sprint-2026-06-06.md`
