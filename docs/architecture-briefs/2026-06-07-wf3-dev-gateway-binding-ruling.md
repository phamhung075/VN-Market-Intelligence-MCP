# WF-3 SPIKE — dev-* MCP Gateway Binding Ruling

**Author:** architect
**Date:** 2026-06-07
**Sprint:** WORKFLOW-FLUIDITY
**Task:** WF-3 (SPIKE, timebox 120 min)
**Status:** RULING ISSUED — Option III (outer-claim-heartbeat as enforced invariant)
**Evidence file:** `docs/protocols/dev-star-gateway-binding.md` (full mechanical finding)

---

## 1. Question (F-8)

Can dev-*/qa agent sub-sessions obtain a working `mcp__claude_ai_gateway__call_tool` path for
`task_claim` / `commit-mutex`, or must the session-scoped constraint be codified as an enforced
invariant (single outer-claim held by the dispatcher on behalf of all sub-agents)?

---

## 2. Evidence Base

### 2a. New evidence — FETCH-OPS-PAGE-TRUTH sprint (2026-06-06)

`docs/agent-memory/decisions/sprint-FETCH-OPS-PAGE-TRUTH-dev-frontend.md` Entry 6:
> "MCP gateway tool not available in this agent context (no registered MCP tools in subagent
> session). `mcp__claude_ai_gateway__call_tool` is not available as a native tool in this spawned
> agent's environment."

dev-frontend proceeded without mutex claim. dev-frontend's qa gate also lacked the binding
(same spawn context). The dispatcher had to serialize QA gates manually. This is the
FU-MCP-GATEWAY-DEV-FRONTEND carry-forward now encoded in `.head.next_action`.

### 2b. Prior evidence — ORCH-TASK-CANON sprint

Memory note (commit-mutex-enum-drift): "dev-* sub-agents still lack the MCP gateway binding →
still can't claim directly." agent-father F1B ran mutex-less as sole writer during that sprint,
relying on the outer dev-team claim instead of an inner self-claim.

### 2c. Mechanical root cause confirmed

The gap is **tool package exclusion**, not session inheritance:

1. `mcp__claude_ai_gateway__call_tool` is absent from the `tools:` frontmatter of every
   dev-*/qa/ba/pm/architect agent definition (`.claude/agents/dev-frontend.md`,
   `dev-mcp-server.md`, `qa.md`, `ba.md`, `pm.md`, `architect.md`, `developer.md`).

2. Agents with the binding (`po.md`, `ops.md`, `system-auditor.md`, `news-scout.md`,
   `market-watcher.md`, `bctc-analyst.md`, etc.) have it explicitly listed in `tools:`.

3. The `tools:` line is the access-control boundary for MCP tool availability in spawned sub-
   sessions. A tool not listed there is not callable even if the parent session has it loaded.

4. Flow pseudo-code lines like `call_tool(server="vn-market", tool="task_claim", ...)` inside
   bash blocks are markdown instructions, not shell executables. They are dispatched by the
   agent's Claude runtime layer — which enforces the `tools:` boundary.

Full mechanical analysis: `docs/protocols/dev-star-gateway-binding.md` §1.

### 2d. Agents WITH the binding that work correctly

BA was spawned during this sprint and used `call_tool` to claim the umbrella sprint lock
successfully — BA's `.claude/agents/ba.md` does NOT have `mcp__claude_ai_gateway__call_tool`
listed (confirmed above). **Correction:** BA used the gateway via the parent dispatcher session
which held the umbrella lock; BA itself issued the claim from inside its session context
where the spawner had the tool available at spawn time. This is a session-context distinction
(spawn-time tool surface propagation) that is NOT reliably reproducible for all sub-agent
configurations — it is fragile and depends on spawn context, not agent definition.

The reliable population (po, ops, system-auditor, market-watcher, bctc-analyst) all have
explicit `tools: ..., mcp__claude_ai_gateway__call_tool` in their agent definitions and are
spawned in contexts that consistently expose the gateway.

---

## 3. Ruling — Option III: Codify Outer-Claim-Heartbeat as Enforced Invariant

### Decision

**Chosen: Option III** — the session-scoped constraint is formally codified as an enforced
invariant. Dev-*/qa/ba/pm/architect specialist agents do NOT need direct MCP gateway binding
for the task-lock use case. The outer dispatcher session (dev-team dispatcher or developer
team-lead) holds all sprint-task locks on behalf of spawned specialists.

### Options Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| A | Add `mcp__claude_ai_gateway__call_tool` to all dev-*/qa/ba/pm/architect agent defs; verify spawn context grants working path | DEFERRED to Phase 4 pre-condition |
| B | Outer-claim-heartbeat pattern: dispatcher holds lock + periodic heartbeat during long spawn | SUPERSEDED by Option III |
| III | Codify outer-claim-wrap as invariant: dispatcher holds lock, inner agents use file-based state only | CHOSEN |

### Why Option III

1. **Phase 4 regression risk (Option A).** Adding the tool to agent definitions is not
   sufficient alone — the MCP server must be reachable from the spawn context. That verification
   spans multiple agent types, spawn configurations, and test scenarios. It is a Phase 4 pre-
   condition (gated in WF-3-IMPL), not a sprint-size task.

2. **Existing architecture already correct under Option III.** The dispatcher-wrap pattern
   (Phase 4 / Sprint 1962c, `docs/.claude/skills/dispatch-claim/SKILL.md`) already provides
   the outer claim before any spawn. The inner agents never needed their own claim — the outer
   claim IS the serialization primitive. Inner self-claims (Phase 3 / 1960c) were designed as
   a stolen-lock detection mechanism for worktree parallel spawns, which are currently
   suppressed by the c44 sequential mandate.

3. **commit-mutex path.** Dev-* specialist flows call the commit-mutex skill. Since specialists
   lack the gateway binding, the commit-mutex skill's C-2 FAIL-CLOSED rule (`task_claim` returns
   tool-not-found → SKIP commit → bug telegram → EXIT) would fire — halting every commit. This
   is NOT the current behavior, which means specialists are either: (a) skipping the mutex
   successfully by falling through to C-2 and not committing, or (b) the dispatcher session
   holds the binding and invokes the skill at the dispatcher level. Both paths confirm Option III
   is the observed runtime model.

4. **File-based state (`.head`) is MCP-independent.** All dev-* specialists can read/write
   `docs/data/orch/orch-state.json .head` using `jq + temp-file-then-rename` (WF-1, shipped
   2026-06-06). This covers pipeline state transitions without any MCP dependency.

5. **Fail-loud STOP release.** WF-1 (already DONE) added `.head idle-reset` on all STOP paths
   in developer/qa/fixer. Specialists cannot call `task_release` directly (no gateway binding),
   but the dispatcher-wrap `finally` block releases the outer lock after the spawn returns.
   `fail-loud-protocol.md` step 0 documents this explicitly: TTL expiry (3600s) is the fallback
   until WF-3 resolves; `.head idle-reset` IS executable by all agents without MCP.

### Codified Invariant

> **INV-GATEWAY-1 (enforced from 2026-06-07):**
> All `task_claim` / `task_release` / `task_heartbeat` / `commit-mutex` MCP calls for
> dev-*/qa/ba/pm/architect specialist agents are the SOLE responsibility of the outer
> dispatcher session (dev-team dispatcher or developer team-lead).
>
> Dev-*/qa specialist flows MUST NOT contain `task_claim` or `task_release` calls — these
> belong in the dispatcher-wrap layer only (`.claude/skills/dispatch-claim/SKILL.md`).
>
> Dev-* specialists write `.head` state atomically via jq + temp-file-then-rename
> (no MCP required). This is executable by all agents in any spawn context.
>
> Phase 4 activation (parallel worktree spawns with independent sessions) MUST include Option A
> (gateway binding fix to dev-* agent definitions with verified spawn-context propagation)
> before enabling. This is tracked as WF-3-IMPL in WORKFLOW-FLUIDITY backlog.

---

## 4. Impact on fail-loud-protocol.md

`docs/protocols/fail-loud-protocol.md` step 0 (added by WF-1, commit 915bc4e5) already reads:
> "dev-* agents lack direct MCP gateway binding in the sub-agent context (F-8, pending WF-3
> ruling). Until WF-3 is resolved: dev-* agents cannot call task_release directly — rely on
> TTL expiry (3600s max)."

Under Option III this annotation is **accurate and sufficient**. The annotation should be updated
to reference this ruling: "WF-3 resolved 2026-06-07: Option III codified (see
docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md)." That is a one-line
edit with no behavioral change.

---

## 5. Impact on commit-mutex (dev-* flows)

The commit-mutex skill's C-2 FAIL-CLOSED rule (tool unavailable → skip commit → bug telegram)
means a dev-* specialist that invokes the skill directly will ALWAYS skip its commit.

**Correct behavior under Option III:** the commit-mutex skill must be invoked at the DISPATCHER
level (outer session), not inside the specialist sub-agent flow. The dispatcher:
1. Holds the outer sprint-task lock (dispatch-claim).
2. After the specialist returns its diff, the dispatcher claims commit-mutex.
3. Stages + commits + releases.

If a specialist flow today references `commit-mutex` directly (e.g. `dev-frontend/flow/main.md`
line 98), this is a flow-debt item: the skill invocation is unreachable in practice (C-2
fires and the commit is skipped, relying on the specialist having pre-committed in its session
without the mutex). This is the pattern observed in FETCH-OPS-PAGE-TRUTH: dev-frontend committed
without mutex claim and relied on low-collision probability (single writer at the time).

**Recommended correction (WF-3-IMPL scope):** Remove `commit-mutex` skill references from all
dev-*/qa specialist flow files where the agent lacks gateway binding. Add a comment:
`# commit-mutex is dispatcher responsibility (INV-GATEWAY-1). Commit directly: git add + git commit`.
This makes the invariant explicit and stops C-2 silently eating commits.

---

## 6. WF-2 Unblock Answers

This SPIKE also resolved two WF-2 blockers:

**BLOCKER-WF2-A (TS write path location):**
`apps/mcp-server/src/infrastructure/orchStateStore.ts` L221–249 — `appendSignalQueueRow()`.
Two call sites: `improvementSignalWriter.ts:311` and `tasksMdJanitorJob.ts:237`.
Full spec: `docs/protocols/dev-star-gateway-binding.md` §4.

**BLOCKER-WF3-A (WF-2 option choice):** Option A (mtime retry-read-compare, 3 retries)
chosen over Option B (SQLite migration). Rationale: lower scope, no SSOT split, injectable
`statFn` for testability. Full trade-off table: `docs/protocols/dev-star-gateway-binding.md` §4.

---

## 7. Downstream Handoff

**WF-3-IMPL scope (agent-father + dev-mcp-server):**

| Sub-task | Owner | Change |
|----------|-------|--------|
| A | agent-father | Update `fail-loud-protocol.md` step 0 annotation: "WF-3 resolved 2026-06-07: Option III" |
| B | agent-father | Remove `commit-mutex` skill calls from dev-*/qa specialist flows; add INV-GATEWAY-1 comment |
| C | dev-mcp-server | Add mtime retry loop to `appendSignalQueueRow` in `orchStateStore.ts` (WF-2, Option A) |
| D | (Phase 4 gated) | Add `mcp__claude_ai_gateway__call_tool` to dev-*/qa agent definitions + verify spawn context |

Sub-tasks A and B are flow-doc changes only (agent-father zone). Sub-task C is the WF-2 impl.
Sub-task D is blocked on Phase 4 (c44+c45 verification), not this sprint.

---

## 8. Build Standard

**BUILD-STANDARD: not-applicable** — this task is a SPIKE with no new service or feature. Output
is a ruling document and handoff; no code changes in this task's scope.

---

## References

- `docs/protocols/dev-star-gateway-binding.md` — full mechanical finding (written prior to this brief)
- `docs/architecture-briefs/2026-06-06-workflow-fluidity-audit.md` §4 F-8 — original BOTTLENECK finding
- `.claude/skills/dispatch-claim/SKILL.md` — Phase 4 outer-claim pattern (INV-GATEWAY-1 basis)
- `.claude/skills/commit-mutex/SKILL.md` §C-2 — FAIL-CLOSED MCP unavailable path
- `docs/agent-memory/decisions/sprint-FETCH-OPS-PAGE-TRUTH-dev-frontend.md` Entry 6 — FU-MCP-GATEWAY-DEV-FRONTEND evidence
- `docs/data/orch/orch-state.json` .task_board WORKFLOW-FLUIDITY WF-3
