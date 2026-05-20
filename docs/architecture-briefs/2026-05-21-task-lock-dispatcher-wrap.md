# Architecture Brief — Task-Lock Dispatcher-Wrap (Phase 3.5)

**Date:** 2026-05-21
**Sprint:** 1962 (task 1962a)
**Author:** architect
**Status:** READY FOR IMPLEMENTATION
**Predecessor brief:** `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` (Phase 3 agent-self heartbeat design — do not duplicate; extend only)
**Protocol contract:** `docs/protocols/task-lock-protocol.md` § Claim Grammar (no protocol amendments needed — composition of consecutive same-task_id claims is already idempotent per § Claim Grammar)
**PO signal:** `docs/signals/po-1962-signoff.json`
**Zone:** `.claude/` (multi-flow .md edits only — no code, no MCP changes)
**Next step:** PM plan (1962b) → agent-father wiring (1962c-N) → QA smoke (1962d) → docs (1962e)

---

## §0 — Scope and Goal

Phase 3 (Sprint 1960c, SHIPPED 2026-05-20) wired agent-self heartbeat (Model 2) into 8 dev-team flow files. Each agent claims its own `task:<task_id>` lock on entry and releases on completion. This eliminated single-session stale-crash collisions.

Gap (Sprint 1962 trigger): the dispatcher itself does NOT hold an outer claim around `Agent(subagent_type=...)` spawn calls. In a multi-Claude-window environment, two routers can both read the same `task_id` from a stale signal, both pass the "no active lock" check (lock is not yet held by either), and both issue concurrent `Agent()` spawns. The second agent's inner self-claim fails correctly — but the parallel `Agent()` call already burned a session slot and initial token budget before the inner claim resolved.

Phase 3.5 adds **Model 1 (dispatcher-wrap)**: the dispatcher holds an outer claim around each `Agent()` spawn call, releasing immediately after the spawn returns (success or failure). This is ADDITIVE — it does not replace Model 2 heartbeat, which remains in place for crash recovery during long-running sprint-task execution.

Out of scope: Phase 4 tooling, new MCP tools, protocol file amendments, retroactive claim of in-flight agents.

---

## §1 — Spawn Site Inventory (Brownfield Verification)

PO identified 7 spawn sites in `po-1962-signoff.json § identified_spawn_sites`. Architect verified each against the live `.md` files as of 2026-05-21.

### S1 — `execute-tier.md` lines 33–35 (WRAP — HIGHEST priority)

```
.claude/flows/dev-team/execute-tier.md
```

Lines 33–35 contain the primary fan-out pattern:

```
→ Agent(dev-stock-price, taskA) + Agent(dev-alert-engine, taskB)
→ Agent(qa, taskA) + Agent(qa, taskB)
→ Agent(fixer, taskA) + Agent(fixer, taskB)
```

**Status: PRESENT.** This is the primary collision vector: tier-parallel multi-agent spawn with no outer claim. Two routers processing the same signal batch will both reach this tier simultaneously.

**Wrap decision: WRAP.** Each parallel `Agent()` call in a tier must be preceded by a dispatcher `task_claim`. See §2 for the wrapping pattern.

---

### S2 — `main.md` line 122 — Pipeline Resume (WRAP — HIGH priority)

```
.claude/flows/dev-team/main.md
```

Line 122:
```
`in_progress` AND `nextAgent` AND `updatedAt < 24h` → spawn `nextAgent` immediately. JUMP TO `execute`.
```

**Status: PRESENT.** `nextAgent` is read from `docs/pipeline-state.json` and spawned immediately with no claim guard. Two routers reading the same `in_progress` pipeline state will both resume.

**Wrap decision: WRAP.** Claim `task:<activeTaskId>` before spawning `nextAgent`. The `task_id` is known from `pipeline-state.json.activeTaskId`. If claim fails, the second router logs SKIP and falls through to Step 1.

---

### S3 — `main.md` line 134 — Step 1 PO Triage (WRAP — MEDIUM priority)

```
.claude/flows/dev-team/main.md
```

Line 134:
```
→ Spawn `po` with: `pendingSignals[]`, ...
```

**Status: PRESENT.** PO triage spawn has no outer claim. PO is the sprint planner; double-dispatch here produces two conflicting sprint plans.

**Wrap decision: WRAP.** Use a synthetic task_id derived from the signal batch (e.g., the first signal's `id` or a hash of `pendingSignals[0].id`). If no signals and triage is driven by TASKS.md state, use `task:po-triage-<ISO_date_YYYYMMDD>` as a session-scoped dedup key with TTL=1800s. See §2.3 for the pattern.

---

### S4 — `main.md` lines 150–151 — UNBLOCK / CLEAN spawn (WRAP — HIGH priority)

```
.claude/flows/dev-team/main.md
```

Lines 150–151:
```
| UNBLOCK | spawn `{route_to}` | `send_telegram(work, "Unblocked: [brief]")` → EXIT |
| CLEAN   | spawn `qa` with branch list | qa flow handles cleanup → EXIT |
```

**Status: PRESENT.** UNBLOCK and CLEAN spawns are in the planning matrix table. Both carry a known task or batch id at this point in the flow (PO RETURN block includes `id` field per return schema).

**Wrap decision: WRAP.** Use `task:<batch_id>` from PO return as the outer claim key before spawning `{route_to}` or `qa`. TTL=3600s (sprint-task).

---

### S5 — `developer.md` line 37 — Developer multi-zone fan-out (WRAP — HIGH priority)

```
.claude/agents/developer.md
```

Line 37 (spawn_pattern section):
```
→ Agent(dev-frontend, taskA) + Agent(dev-stock-price, taskB) + Agent(dev-api-gateway, taskC)
```

**Status: PRESENT.** Developer agent fan-out to dev-* specialists. This fires whenever developer picks up a multi-zone task batch. Because developer itself is spawned by the dispatcher, two parallel developer instances can both fan-out to the same set of specialists.

**Wrap decision: WRAP.** Before each `Agent(dev-*, taskX)` call in the `spawn_pattern`, claim `task:<taskX_id>` with `owner_agent: "developer"` (the dispatcher identity at this level). See §4 for owner identity rules.

---

### S6 — `ba.md` line 118 — BA parallel architect fan-out (WRAP — MEDIUM priority)

```
.claude/agents/ba.md
```

Line 118 (spawn_pattern section):
```
→ Agent(architect, REQ_NNN) + Agent(architect, REQ_MMM)
```

**Status: PRESENT.** BA spawns multiple architect instances in parallel. Two BA sessions processing the same sprint goal batch will both fan-out to architect.

**Wrap decision: WRAP.** Before each `Agent(architect, REQ_NNN)` call, claim `task:<REQ_NNN_id>` with `owner_agent: "ba"`. TTL=3600s.

---

### S7 — `pm.md` line 124 — PM parallel dev-* fan-out (WRAP — HIGHEST priority)

```
.claude/agents/pm.md
```

Line 124 (spawn_pattern section):
```
→ Agent(dev-frontend, TASK_101) + Agent(dev-stock-price, TASK_102) + Agent(dev-api-gateway, TASK_103)
```

**Status: PRESENT.** PM is the primary planner that fans out to multiple dev-* agents. This is the highest-risk site: `dev-alert-engine FIX` and `dev-mcp-server FIX` dispatch mentioned in the gap report originate here.

**Wrap decision: WRAP.** Before each `Agent(dev-*, TASK_NNN)` call, claim `task:<TASK_NNN_id>` with `owner_agent: "pm"`. TTL=3600s.

---

### Excluded Sites (Confirmed)

- **`docs/signals/DASHBOARD.md` drain** (`drain-signals.md` Step 0a-D): already wrapped with `dashboard-row` task_claim/task_release in Phase 2. Leave untouched.
- **`cowork-team/main.md` Step 4.6**: already wrapped with `cowork-slot` task_claim in Phase 2. Leave untouched.
- **`ops/main.md`**: confirmed no `Agent()` fan-out — uses `docker-compose`, `bash`, and `ssh` commands directly. No wrap needed.

### Summary Table

| Site | File | Line | Kind | Wrap? | Priority |
|------|------|------|------|-------|----------|
| S1 | `execute-tier.md` | 33–35 | sprint-task | YES | HIGHEST |
| S2 | `main.md` (resume) | 122 | sprint-task | YES | HIGH |
| S3 | `main.md` (po triage) | 134 | sprint-task | YES | MEDIUM |
| S4 | `main.md` (UNBLOCK/CLEAN) | 150–151 | sprint-task | YES | HIGH |
| S5 | `developer.md` | 37 | sprint-task | YES | HIGH |
| S6 | `ba.md` | 118 | sprint-task | YES | MEDIUM |
| S7 | `pm.md` | 124 | sprint-task | YES | HIGHEST |
| — | `drain-signals.md` | — | dashboard-row | SKIP (done) | — |
| — | `cowork-team/main.md` | — | cowork-slot | SKIP (done) | — |
| — | `ops/main.md` | — | n/a | SKIP (no Agent fan-out) | — |

All 7 PO-identified sprint-task spawn sites verified present. No additional sites found beyond those listed by PO.

---

## §2 — Model 1 Dispatcher-Wrap Design

### §2.1 — Core Pattern

The dispatcher holds a `task_claim` (Model 1: caller holds, no heartbeat needed) around each `Agent()` spawn call. The claim is held only for the duration of the spawn itself — not for the duration of the spawned agent's execution (that is covered by the agent's own Model 2 self-claim + heartbeat from Phase 3).

```
// Before each Agent(specialist, task_id) call:

outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:<task_id>",          // same key as agent's inner self-claim
  task_kind:   "sprint-task",
  owner_agent: "<dispatcher_identity>",   // see §4 for identity rules
  ttl_seconds: 3600,                      // matches sprint-task TTL
  payload:     '{"site":"<S1..S7>","spawning":"<specialist_agent>"}'
})

if not outer_claim.claimed:
  log "[<dispatcher>] SKIP task:<task_id> — held by " + outer_claim.current_holder.owner_agent
  send_telegram(channel="work", "[<dispatcher>] SKIP collision task:<task_id> — held by " + outer_claim.current_holder.owner_session[0:8])
  → skip this Agent() call entirely; continue to next task in batch

// Claim succeeded — spawn immediately
Agent(<specialist>, task_id)

// Spawn returned (success OR failure) — release outer claim
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:<task_id>" })
// ok=false is acceptable (TTL expired or inner self-claim already released it)
```

**Key property:** the outer claim is released as soon as the `Agent()` call returns, regardless of outcome. The spawned agent's inner Model 2 self-claim (Phase 3) then governs the lock for the duration of that agent's execution.

### §2.2 — Parallel Fan-out Claim Sequencing

For sites that spawn multiple agents in one message (S1, S5, S6, S7), the claim pattern applies per-Agent call:

```
// For a batch: Agent(devA, task1) + Agent(devB, task2) + Agent(devC, task3)
// Execute as:

for each (agent, task_id) in batch:
  outer_claim = task_claim(task_id: "task:<task_id>", owner_agent: "<dispatcher>", ...)

  if not outer_claim.claimed:
    remove (agent, task_id) from spawn batch
    log + send_telegram SKIP

// Spawn only the tasks that passed the claim check, in one parallel message:
→ Agent(devA, task1) + Agent(devC, task3)  // task2 skipped

// After all spawns return:
for each (agent, task_id) in spawned_batch:
  task_release(task_id: "task:<task_id>")
```

This preserves the parallel spawn pattern while ensuring no two dispatchers race to spawn the same task.

### §2.3 — PO Triage task_id (S3)

PO triage (S3) does not operate on an existing `task_id` — it creates the sprint plan. Use a date-scoped synthetic key to prevent double-triage:

```
triage_key = "task:po-triage-" + $(date -u +"%Y%m%d")
// e.g. "task:po-triage-20260521"

outer_claim = task_claim(task_id: triage_key, task_kind: "sprint-task",
                          owner_agent: "dev-team", ttl_seconds: 1800)

if not outer_claim.claimed:
  log "[dev-team] SKIP PO triage — already running in peer session"
  → JUMP TO end

Agent(po, pendingSignals + inputs...)

task_release(task_id: triage_key)
```

TTL=1800s (30 min) — short enough to retry within the hour if PO triage crashes, long enough to cover a full triage cycle.

### §2.4 — Pipeline Resume task_id (S2)

Pipeline resume reads `activeTaskId` from `docs/pipeline-state.json`. Use that directly:

```
bare_task_id = pipeline_state.activeTaskId  // e.g. "1962b"
resume_key = "task:" + bare_task_id

outer_claim = task_claim(task_id: resume_key, task_kind: "sprint-task",
                          owner_agent: "dev-team", ttl_seconds: 3600)

if not outer_claim.claimed:
  // Peer session already resumed — apply migration-check from task-lock SKILL.md
  // (stale-lock-takeover path applies here)
  JUMP TO end

Agent(nextAgent, context...)

task_release(task_id: resume_key)
```

---

## §3 — task_id Matching: Outer and Inner Claims on Same Key

The outer dispatcher claim and the agent's inner self-claim BOTH use `task:<task_id>` as the key. This is intentional. Here is how the three-case resolution works:

### Case A — Single-router path (expected steady state)

1. Dispatcher claims `task:1962b` (outer, `owner_agent: "pm"`, TTL=3600s). `claimed=true`.
2. Dispatcher spawns `Agent(dev-stock-price, 1962b)`. Spawn returns.
3. Dispatcher releases `task:1962b`. Lock row deleted.
4. Agent starts, calls inner self-claim `task:1962b` (`owner_agent: "dev-stock-price"`, TTL=3600s). `claimed=true` (row was deleted, no conflict).
5. Agent runs, heartbeats every 5 min, releases on completion.

No collision. Outer claim and inner claim use the same key but at different points in time (serial).

### Case B — Two-router race (collision scenario — outer wrap fires)

1. Router A claims `task:1962b` (outer). `claimed=true`.
2. Router B attempts same claim. `claimed=false`. Router B logs SKIP and does NOT spawn. **Race resolved at the dispatcher level.**
3. Router A spawns `Agent(dev-stock-price, 1962b)`.
4. Router A releases outer claim.
5. Agent inner self-claim proceeds normally (Case A §3).

The second agent never fires. Zero wasted sessions.

### Case C — Outer claim released but agent inner claim not yet acquired (transition window)

After step 4 (outer release) and before the agent's inner self-claim in step 4 of Case A, there is a narrow window where no lock is held. A third router could claim `task:1962b` and spawn a second agent.

**Assessment:** This window is negligible in practice. The inner self-claim fires at the first step of the agent's flow (before any file reads or code work), typically within 1–2 seconds of agent startup. The 15-minute cron tick interval between dev-team invocations means a third router would need to appear within that 1–2 second window. If it does occur, the second agent's inner self-claim will fail (`claimed=false`) and exit with SKIP collision telegram — Phase 3 Model 2 handles this correctly.

**No additional mechanism needed for Case C.**

---

## §4 — Owner-Agent Identity Rule

The outer claim uses the **dispatcher's identity** as `owner_agent`, not the spawned agent's identity. The inner self-claim (Phase 3, unchanged) uses the **spawned agent's identity**.

| Site | Dispatcher (outer `owner_agent`) | Spawned agent (inner `owner_agent`) |
|------|----------------------------------|--------------------------------------|
| S1 (`execute-tier.md`) | `"dev-team"` | `"dev-stock-price"`, `"qa"`, `"fixer"`, etc. |
| S2 (`main.md` resume) | `"dev-team"` | value of `nextAgent` field |
| S3 (`main.md` po triage) | `"dev-team"` | `"po"` |
| S4 (`main.md` UNBLOCK/CLEAN) | `"dev-team"` | `{route_to}` or `"qa"` |
| S5 (`developer.md`) | `"developer"` | `"dev-frontend"`, `"dev-stock-price"`, etc. |
| S6 (`ba.md`) | `"ba"` | `"architect"` |
| S7 (`pm.md`) | `"pm"` | `"dev-frontend"`, `"dev-alert-engine"`, etc. |

**Rationale:** Using different `owner_agent` values for outer and inner claims is what permits the same `task_id` to be claimed twice in the normal (non-collision) path without triggering a false collision. The `current_holder` check in `task_claim` matches on `(task_id, owner_session)` — outer claim is released before inner claim fires, so they never co-exist. If by some timing they did co-exist (extremely rare), the inner claim would receive `claimed=false` with `current_holder.owner_agent = "dev-team"`, which the agent recognises as an outer-dispatcher hold (not a peer collision) and retries after a 2-second back-off.

Agent-father may optionally implement a short retry (1×2s) in the inner self-claim when `current_holder.owner_agent` matches a known dispatcher identity list (`["dev-team", "developer", "ba", "pm"]`). This is optional — not required for correctness, only for ergonomics.

---

## §5 — Inner Self-Claim Disposition: No-Op vs Remove

**Decision: KEEP inner self-claim AS-IS — it becomes logically idempotent in the normal path.**

Justification:

1. **Crash recovery coverage.** The inner self-claim (Model 2) combined with heartbeat provides crash recovery: if the dispatcher crashes after outer release but before inner claim, TTL expiry is the fallback. If the inner self-claim were removed, a crashed dispatcher with no outer claim in flight and no inner claim means the task_id is permanently "available" — a second cron tick could re-dispatch before the first agent's work is complete.

2. **Phase stability.** Phase 3 wired the inner self-claim across 8 flow files (10 commits). Removing it would require 8 more edits in the same sprint, doubling the change surface for 1962c-N. PO signoff § scope_decision explicitly states: "AUGMENT existing Phase 3 self-claim — do NOT remove agent-side claims."

3. **Idempotency in the normal path.** In Case A (§3), the inner self-claim fires after outer release — the task_id row is deleted, so the inner claim succeeds fresh. The inner claim is not a no-op in timing, but it is semantically idempotent with respect to collision prevention: the outer wrap already filtered duplicate dispatches.

4. **Remove-after-observation policy.** Per PO signoff § 1962a must_cover item 8: "remove or no-op self-claim ONLY after one full cycle observation." After 1962d smoke PASS, agent-father can evaluate removing inner self-claim for sprint-task agents in a future micro-sprint. That decision is deferred to PO after 1962d evidence.

**Implementation note for agent-father:** Do NOT touch inner self-claim in 1962c-N. Changes are outer-dispatcher-side only.

---

## §6 — Failure Modes

| Mode | Symptom | Response |
|------|---------|----------|
| **F-DW1: outer claim fails (peer collision)** | `task_claim` returns `claimed=false` before spawn | Log SKIP + WORK telegram. Do NOT spawn Agent(). Continue to next task in batch. |
| **F-DW2: spawn returns error** | `Agent()` call throws or returns error status | Immediately call `task_release(task_id)`. Log BUG. Do NOT retry in same cycle — let next cron tick retry. |
| **F-DW3: spawn hangs / no return** | Agent() call does not return within expected window | TTL expiry (3600s) is the recovery path. Outer claim expires naturally. No manual cleanup needed. Next cron tick retries. |
| **F-DW4: task_release fails after spawn** | `task_release` returns `ok=false` | Acceptable — lock already expired or agent's inner claim superseded it. Log at DEBUG only. No action. |
| **F-DW5: coordination.db unavailable** | `task_claim` returns `db_unavailable` error | Treat as `claimed=true` (degrade gracefully, no lock). Log BUG telegram once per session. Proceed with spawn as Phase 1 fallback (F3 mode per protocol §Failure Modes). |
| **F-DW6: dispatcher crashes between claim and spawn** | No spawn issued, outer claim held, TTL not expired | TTL expiry (3600s) frees the lock. Second cron tick re-dispatches normally. Duplicate work risk = zero (agent never started). |

**DO NOT retroactively claim in-flight agents.** If `task_claim` returns `claimed=false` with a `current_holder` that appears to be a live agent (recent heartbeat), do not attempt force-takeover. The existing agent is working. Accept SKIP and move to next task. Force-takeover tooling is deferred to Phase 4.

---

## §7 — Migration Order and Rollout

Per PO signoff § 1962a must_cover item 8 and § hard_constraints_carried:

1. **One commit per spawn site.** Each of S1–S7 is one `.md` file edit, one conventional-commit. PM (1962b) will define exact commit subject templates with Sprint:/Task:/AC: trailers.
2. **Pure dispatcher .md edits.** No code changes, no MCP tool changes, no `docs/protocols/` changes. Zone is `.claude/` only.
3. **Agent-side self-claim stays AS-IS.** Phase 3 edits are not touched in 1962c-N.
4. **Sequencing:** Sites can be edited in any order (different files, no shared state). PM may parallelize S1+S2 if no conflict, but each is still one commit.
5. **Observation window before removing inner self-claim:** One full cron cycle after 1962d smoke PASS. PO decides in 1962e or later sprint.
6. **No Docker rebuild required.** All changes are `.md` flow files — no TypeScript, no container image change. The existing container (image digest sha256:598b94c7) remains current.

---

## §8 — Test Strategy (for QA 1962d)

The QA smoke test must validate the dispatcher-wrap collision prevention without requiring actual multi-terminal infrastructure. Recommended approach:

**Scenario T1 — double-dispatch simulation:**
1. Call `task_claim(task_id="task:test-1962d", owner_agent="dev-team", ...)` — verify `claimed=true`.
2. Immediately call `task_claim(task_id="task:test-1962d", owner_agent="dev-team", ...)` again — verify `claimed=false`.
3. Verify SKIP telegram emitted by second caller.
4. Call `task_release(task_id="task:test-1962d")`.
5. Call `task_claim` again — verify `claimed=true` (lock freed).

**Scenario T2 — outer release allows inner self-claim:**
1. Dispatcher claims `task:test-1962d` (outer, `owner_agent="dev-team"`).
2. Dispatcher releases `task:test-1962d`.
3. Agent claims `task:test-1962d` (inner, `owner_agent="dev-stock-price"`). Verify `claimed=true`.

**Scenario T3 — cross-owner-agent same task_id:**
1. `task_claim(task_id="task:test-1962d", owner_agent="pm", ...)` — `claimed=true`.
2. `task_claim(task_id="task:test-1962d", owner_agent="dev-stock-price", ...)` — `claimed=false` (collision regardless of different owner_agent — lock is keyed on task_id only).
3. Release + verify.

These 3 scenarios map directly to 1962d AC. PM (1962b) should encode AC: trailers for each.

---

## §9 — DDD Layer Assignment

All changes in Sprint 1962 are `.md` flow/agent definition files — they live in the interface layer of the system (agent orchestration instructions). No domain, application, or infrastructure code is touched.

| Layer | Impact |
|-------|--------|
| Domain | None |
| Application | None |
| Infrastructure | None (coordination.db schema unchanged) |
| Interface / Orchestration | 7 `.md` files modified (S1–S7 spawn sites) |

---

## §10 — Risk Flags

| Risk | Severity | Mitigation |
|------|----------|------------|
| **R1: outer claim held too long** | LOW | Outer claim is released immediately after `Agent()` returns. TTL=3600s is a fallback, not the intended hold duration. |
| **R2: transition window between outer release and inner claim (Case C §3)** | LOW | Window is <2 seconds. Cron tick interval is 15 minutes. Risk is statistically negligible. No action needed. |
| **R3: agent-father edits wrong layer** | MEDIUM | agent-father MUST edit only the `spawn_pattern` / `dispatch` sections of each `.md` file. Inner self-claim blocks (Pre-code checklist, flow steps) are NOT touched. |
| **R4: ttl_seconds mismatch** | LOW | Outer claim TTL must be ≤ inner claim TTL (both 3600s for sprint-task). Enforced by using the same TTL table from `docs/protocols/task-lock-protocol.md`. |
| **R5: retroactive claim of in-flight agents** | HIGH (if violated) | Explicitly forbidden per PO signoff and §6 F-DW1. If `claimed=false` on resume, SKIP — do not attempt force-release. |
| **R6: removing inner self-claim prematurely** | HIGH (if violated) | Inner self-claim stays AS-IS in 1962c-N. Only removed after 1962d observation window, in future sprint, on PO decision. |

---

## §11 — File-Path Matrix (Per Spawn Site)

| Site | File | Section to edit | Edit summary |
|------|------|-----------------|--------------|
| S1 | `.claude/flows/dev-team/execute-tier.md` | `## Per-Tier Parallel Spawn` (around lines 32–38) | Add `task_claim` before each `Agent()` in the parallel batch loop; add `task_release` after all spawns return |
| S2 | `.claude/flows/dev-team/main.md` | `## Step 0b — Pipeline Resume` (line 122) | Add `task_claim(task_id: "task:" + activeTaskId)` before `spawn nextAgent`; add `task_release` after |
| S3 | `.claude/flows/dev-team/main.md` | `## Step 1 — PO Triage` (line 134) | Add `task_claim(task_id: "task:po-triage-<date>")` before `Spawn po`; add `task_release` after |
| S4 | `.claude/flows/dev-team/main.md` | `## Step 2 — Planning` table rows UNBLOCK/CLEAN (lines 150–151) | Add inline claim/release note to UNBLOCK and CLEAN rows; expand to instruction block if table width insufficient |
| S5 | `.claude/agents/developer.md` | `parallel_dispatch.spawn_pattern` (line 37) | Add `task_claim` / `task_release` wrapping each `Agent()` in pattern |
| S6 | `.claude/agents/ba.md` | `parallel_dispatch.spawn_pattern` (line 118) | Add `task_claim` / `task_release` wrapping each `Agent(architect, ...)` in pattern |
| S7 | `.claude/agents/pm.md` | `parallel_dispatch.spawn_pattern` (line 124) | Add `task_claim` / `task_release` wrapping each `Agent(dev-*, ...)` in pattern |

**Note:** S2, S3, and S4 all land in `main.md`. PM (1962b) may choose to group them into one commit (one file, three hunks) to maintain c47 atomicity policy (one file per commit — three edits to the same file = one commit). PM decides in 1962b row plan.

---

## §12 — Scan Clean

- **Verified:** All 7 spawn sites present at stated line numbers (±2 lines for context).
- **Excluded:** ops/main.md confirmed Agent()-free. drain-signals.md and cowork-team/main.md confirmed already wrapped.
- **No duplicate interfaces proposed:** outer claim reuses the same 4 MCP tools (Phase 1 surface). No new tools, no new DB tables, no new protocol documents.
- **DDD violation:** None. All edits are `.md` orchestration layer.
- **Security:** No new credentials, no new external calls, no new data surfaces.
- **Memory/perf:** task_claim is a single SQLite write (<5ms). Claim+release pair per Agent() spawn adds negligible latency to dispatcher overhead.
- **Scan clean:** true
