---
sprint: 1962
title: "Task-lock dispatcher-wrap — Phase 3.5 row-level plan"
phase: "Phase 3.5 (additive to Phase 3 self-claim)"
branch: "n/a — dispatcher .md edits only, no feature branch"
size: M
zone: .claude/
depends_on: [1962a]
blocks: [1962c_through_n, 1962d, 1962e]
---

## TLDR

Sprint 1962 Phase 3.5 adds outer (dispatcher-side) task_claim wrapper around each `Agent(subagent_type=...)` spawn. Seven spawn sites identified in architecture brief §1; each generates one commit per the c47 atomic-commit policy (one file per commit). Outer claim is held for duration of spawn call only, then released immediately — allows phase 3 inner self-claim to proceed fresh. No code changes, no MCP tools, no Docker rebuild; pure flow .md edits in `.claude/` zone.

---

## [PM] Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-21-task-lock-dispatcher-wrap.md`  
**PO Signal:** `docs/signals/po-1962-signoff.json`  
**Phase 3 Predecessor:** `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` (Phase 3 agent-side self-claim — Phase 3.5 is outer dispatcher wrap, additive only)

**Accept Criteria (1962b):**
- [ ] One decomposition row per spawn site (S1–S7, 7 total)
- [ ] Each row: file path, line(s), edit summary, owner agent, commit grouping, priority
- [ ] Grouped S2+S3+S4 in one commit per c47 split policy (same file → one commit for all three hunks)
- [ ] Dependencies explicit (S1–S7 can parallelize; no internal deps between spawn sites)
- [ ] Each row carries verification step: claim/release pair present, dispatcher identity correct, TTL=3600s
- [ ] Handoff emitted to `docs/signals/pm-1962b-plan-done.json` type=plan_complete

**Knowledge Needed:**
- `docs/protocols/task-lock-protocol.md` — claim grammar, TTL table, owner_agent semantics
- `docs/architecture-briefs/2026-05-21-task-lock-dispatcher-wrap.md` — spawn site inventory, Model 1 pattern
- `.claude/skills/task-lock/SKILL.md` — dispatcher-wrap runtime pattern

**Files to modify:** 7 flow/agent .md files (S1–S7)

**Files to create:** None (pure edits)

**Dependencies:** 1962a (architect brief DONE)

---

## Row-Level Decomposition: S1–S7

### S1: execute-tier.md — Tier-parallel fan-out

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-1 |
| **File** | `.claude/flows/dev-team/execute-tier.md` |
| **Lines** | 33–38 (context: tier-parallel spawn pattern) |
| **Edit Summary** | Add `task_claim` before each `Agent()` call in tier-parallel batch; add `task_release` after all spawns return. Pattern: for-loop over `(agent, task_id)` pairs, claim each, collect wins, spawn only wins, release all wins. |
| **Owner Agent** | agent-father (flow-definition edit) |
| **Commit Subject** | `chore(pm/1962c-1): dispatcher-wrap S1 execute-tier parallel fan-out` |
| **Commit Format** | Per `docs/policies/commit-convention.md` — chore(pm/task_id): description; AC trailer optional (PM boilerplate). No Task: trailer (PM housekeeping per convention §PM commits). |
| **Commit Grouping** | SOLO (different file) |
| **Priority** | HIGHEST (primary collision vector per brief §1) |
| **Zone** | `.claude/flows/dev-team/` |
| **Verification Steps** | (1) For each `Agent(specialist, task_id)` call in the parallel batch loop, verify `task_claim(task_id="task:" + task_id, owner_agent="dev-team", ...)` appears before it; (2) Verify `task_release(task_id="task:" + task_id)` appears after all spawns in batch complete; (3) Verify TTL=3600s used; (4) Verify dispatcher identity = "dev-team" in outer claim; (5) Syntax check: .md parses, no jinja2 errors |
| **AC for Agent-Father** | (1) Edits present and syntactically correct; (2) claim/release block follows Model 1 pattern from brief §2.1; (3) TTL=3600s confirmed; (4) Agent spawn syntax unchanged (pattern applied non-invasively); (5) No inner self-claim touched (Phase 3 preserved) |

---

### S2: main.md line 122 — Pipeline resume

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-2 |
| **File** | `.claude/flows/dev-team/main.md` |
| **Lines** | 122 (+ context 115–130 for Step 0b — Pipeline Resume section) |
| **Edit Summary** | Read `activeTaskId` from `docs/pipeline-state.json` (already present in code). Add `task_claim(task_id="task:" + activeTaskId, owner_agent="dev-team", ttl_seconds=3600)` before `spawn nextAgent` call. If claim fails, log SKIP and fall through to Step 1. After spawn, call `task_release(task_id="task:" + activeTaskId)`. |
| **Owner Agent** | agent-father (flow-definition edit) |
| **Commit Subject** | `chore(pm/1962c-2+3+4): dispatcher-wrap S2/S3/S4 three main.md hunks` |
| **Commit Format** | Single commit (one file, three hunks, per c47 atomic policy) |
| **Commit Grouping** | **GROUPED with S3 + S4** (same file, three sequential edits to `.claude/flows/dev-team/main.md`) |
| **Priority** | HIGH (resume-from-state collision window) |
| **Zone** | `.claude/flows/dev-team/` |
| **Verification Steps** | (1) `activeTaskId` read from pipeline-state.json before claim call; (2) `task_claim` call present with `task_id="task:" + activeTaskId` and `owner_agent="dev-team"`; (3) Claim-fail path documented: log SKIP, fall through; (4) `task_release` call present after spawn; (5) TTL=3600s confirmed |
| **AC for Agent-Father** | (1) Claim/release pair surrounding spawn; (2) activeTaskId read correctly (no nil checks needed — pipeline-state guarantees); (3) Dispatcher identity="dev-team"; (4) TTL=3600s; (5) Diff shows 3-4 lines added (non-invasive) |

---

### S3: main.md line 134 — PO triage (synthetic task_id)

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-3 |
| **File** | `.claude/flows/dev-team/main.md` |
| **Lines** | 134 (+ context 128–145 for Step 1 — PO Triage section) |
| **Edit Summary** | Use synthetic task_id `task:po-triage-` + $(date -u +"%Y%m%d") (e.g., `task:po-triage-20260521`). Add `task_claim(task_id=triage_key, owner_agent="dev-team", ttl_seconds=1800)` before `Agent(po, ...)` spawn. If claim fails, log SKIP and jump to end. After spawn, call `task_release(task_id=triage_key)`. Note: TTL=1800s (30 min, shorter than 3600s — covers one triage cycle, allows retry within hour if crash). |
| **Owner Agent** | agent-father (flow-definition edit) |
| **Commit Subject** | `chore(pm/1962c-2+3+4): dispatcher-wrap S2/S3/S4 three main.md hunks` |
| **Commit Format** | Single commit (one file, three hunks, per c47 atomic policy) |
| **Commit Grouping** | **GROUPED with S2 + S4** (same file, three sequential edits) |
| **Priority** | MEDIUM (PO triage double-dispatch risk lower than tier-parallel or developer fan-out) |
| **Zone** | `.claude/flows/dev-team/` |
| **Verification Steps** | (1) Synthetic `triage_key = "task:po-triage-" + date_string` visible; (2) `task_claim(task_id=triage_key, owner_agent="dev-team", ttl_seconds=1800)` before spawn; (3) Claim-fail path: log SKIP, jump to end (not fall-through like S2); (4) `task_release` after spawn; (5) TTL=1800s confirmed (note: differs from S1/S2/S4/S5 which use 3600s) |
| **AC for Agent-Father** | (1) Synthetic key generation correct (date formatting); (2) Claim/release pair + TTL=1800s surrounding spawn; (3) Dispatcher identity="dev-team"; (4) Claim-fail exit path documented (JUMP to end, not fall-through); (5) Diff shows 5–6 lines added |

---

### S4: main.md lines 150–151 — UNBLOCK/CLEAN spawn

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-4 |
| **File** | `.claude/flows/dev-team/main.md` |
| **Lines** | 150–151 (+ context 145–160 for Step 2 — Planning matrix table) |
| **Edit Summary** | UNBLOCK row spawns `{route_to}` with known `batch_id` from PO RETURN. CLEAN row spawns `qa` with branch list. Add `task_claim(task_id="task:" + batch_id, owner_agent="dev-team", ttl_seconds=3600)` before each spawn; add `task_release` after. If claim fails on UNBLOCK, log SKIP and skip that agent. If claim fails on CLEAN, log SKIP and skip QA spawn. Table may need expansion if width insufficient — agent-father may convert to instruction block. |
| **Owner Agent** | agent-father (flow-definition edit) |
| **Commit Subject** | `chore(pm/1962c-2+3+4): dispatcher-wrap S2/S3/S4 three main.md hunks` |
| **Commit Format** | Single commit (one file, three hunks, per c47 atomic policy) |
| **Commit Grouping** | **GROUPED with S2 + S3** (same file, three sequential edits) |
| **Priority** | HIGH (qa CLEAN explicitly flagged in gap report c221) |
| **Zone** | `.claude/flows/dev-team/` |
| **Verification Steps** | (1) `batch_id` available from PO RETURN block (no new state needed); (2) `task_claim(task_id="task:" + batch_id, owner_agent="dev-team", ttl_seconds=3600)` before each UNBLOCK and CLEAN spawn; (3) Claim-fail path: log SKIP for that spawn (skip agent, continue to next); (4) `task_release` after spawn; (5) TTL=3600s confirmed |
| **AC for Agent-Father** | (1) Two claim/release pairs (one for UNBLOCK, one for CLEAN); (2) Both use batch_id from PO RETURN; (3) Dispatcher identity="dev-team"; (4) TTL=3600s both; (5) Table structure preserved or migrated to instruction block (non-breaking change) |

---

### S5: developer.md line 37 — Developer multi-zone fan-out

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-5 |
| **File** | `.claude/agents/developer.md` |
| **Lines** | 37 (+ context 30–45 for `parallel_dispatch.spawn_pattern` section) |
| **Edit Summary** | Developer agent fans out to dev-* specialists when task is multi-zone. For each `Agent(dev-*, taskX)` in the spawn_pattern, add `task_claim(task_id="task:" + taskX, owner_agent="developer", ttl_seconds=3600)` before spawn; collect claim results; spawn only wins; add `task_release` for each win after spawns return. Dispatcher identity = "developer" (not "dev-team" — this is agent-level dispatch, not router-level). |
| **Owner Agent** | agent-father (agent-definition edit) |
| **Commit Subject** | `chore(pm/1962c-5): dispatcher-wrap S5 developer multi-zone fan-out` |
| **Commit Format** | Per `docs/policies/commit-convention.md` — chore(pm/task_id): description; no Task: trailer (PM boilerplate). |
| **Commit Grouping** | SOLO (different file) |
| **Priority** | HIGH (agent-defn-level fan-out; runs whenever developer picks multi-zone work) |
| **Zone** | `.claude/agents/` |
| **Verification Steps** | (1) For each `Agent(dev-*, taskX)` in spawn_pattern, verify `task_claim(task_id="task:" + taskX, owner_agent="developer", ...)` precedes it; (2) Verify collector loop processes claim results; (3) Verify spawn issued only for wins; (4) Verify `task_release` per win after all spawns return; (5) TTL=3600s confirmed; (6) Dispatcher identity="developer" (NOT "dev-team"); (7) Syntax check: .md parses, no jinja2 errors |
| **AC for Agent-Father** | (1) Claim/release wrapping each spawn in pattern; (2) Model 1 pattern from brief §2.2 (for-loop, collector, spawn wins, release wins); (3) Dispatcher identity="developer"; (4) TTL=3600s; (5) No inner self-claim touched; (6) Diff shows ~8–10 lines added (parallel-dispatch loop + release block) |

---

### S6: ba.md line 118 — BA architect fan-out

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-6 |
| **File** | `.claude/agents/ba.md` |
| **Lines** | 118 (+ context 110–130 for `parallel_dispatch.spawn_pattern` section) |
| **Edit Summary** | BA agent spawns multiple architect instances in parallel (e.g., `Agent(architect, REQ_NNN)` + `Agent(architect, REQ_MMM)`). For each architect spawn, add `task_claim(task_id="task:" + req_id, owner_agent="ba", ttl_seconds=3600)` before spawn; collect results; spawn only wins; add `task_release` for each win after. Dispatcher identity = "ba". |
| **Owner Agent** | agent-father (agent-definition edit) |
| **Commit Subject** | `chore(pm/1962c-6): dispatcher-wrap S6 ba architect fan-out` |
| **Commit Format** | Per convention — chore(pm/task_id): description; no Task: trailer (PM boilerplate). |
| **Commit Grouping** | SOLO (different file) |
| **Priority** | MEDIUM (BA parallel architect spawn; lower volume than dev or pm fan-out) |
| **Zone** | `.claude/agents/` |
| **Verification Steps** | (1) For each `Agent(architect, REQ_NNN)` in spawn_pattern, verify `task_claim(task_id="task:" + req_id, owner_agent="ba", ...)` precedes it; (2) Verify collector loop; (3) Verify spawn wins only; (4) Verify `task_release` per win; (5) TTL=3600s confirmed; (6) Dispatcher identity="ba"; (7) Syntax valid |
| **AC for Agent-Father** | (1) Claim/release wrapping each architect spawn; (2) Model 1 pattern (for-loop, collector, spawn wins, release); (3) Dispatcher identity="ba"; (4) TTL=3600s; (5) No inner self-claim touched; (6) Diff shows ~8–10 lines added |

---

### S7: pm.md line 124 — PM dev-* fan-out

| Field | Value |
|-------|-------|
| **Task ID** | 1962c-7 |
| **File** | `.claude/agents/pm.md` |
| **Lines** | 124 (+ context 115–135 for `parallel_dispatch.spawn_pattern` section) |
| **Edit Summary** | PM is the primary planner that fans out to dev-* specialists. For each `Agent(dev-*, TASK_NNN)` in the spawn_pattern, add `task_claim(task_id="task:" + task_id, owner_agent="pm", ttl_seconds=3600)` before spawn; collect results; spawn only wins; add `task_release` for each win after all spawns return. Dispatcher identity = "pm". This is the **HIGHEST priority** site per brief §1 — gap report specifically calls out dev-alert-engine FIX + dev-mcp-server FIX dispatch doubles. |
| **Owner Agent** | agent-father (agent-definition edit) |
| **Commit Subject** | `chore(pm/1962c-7): dispatcher-wrap S7 pm dev-specialist fan-out` |
| **Commit Format** | Per convention — chore(pm/task_id): description; no Task: trailer (PM boilerplate). |
| **Commit Grouping** | SOLO (different file) |
| **Priority** | HIGHEST (PM primary planner; gap report names this site as source of dev-alert-engine FIX + dev-mcp-server FIX double-dispatch) |
| **Zone** | `.claude/agents/` |
| **Verification Steps** | (1) For each `Agent(dev-*, TASK_NNN)` in spawn_pattern, verify `task_claim(task_id="task:" + task_id, owner_agent="pm", ...)` precedes it; (2) Verify collector loop processes claim results; (3) Verify spawn issued only for wins (claim=true); (4) Verify `task_release` per win after all spawns complete; (5) TTL=3600s confirmed; (6) Dispatcher identity="pm"; (7) Syntax valid; (8) No regression in multi-zone task parallelism (model 1 pattern preserves parallelism post-claim-filter) |
| **AC for Agent-Father** | (1) Claim/release wrapping each dev-* spawn in pattern; (2) Model 1 pattern (for-loop, collector, spawn wins, release wins); (3) Dispatcher identity="pm"; (4) TTL=3600s; (5) No inner self-claim touched; (6) WIP enforcer still works (note: WIP limits are per-zone; no cross-zone impact); (7) Diff shows ~10–12 lines added (largest fan-out, may have 3–4 dev-* agents per task batch) |

---

## Commit Grouping Summary (c47 Policy)

**c47 Atomic Commit Policy:** One file per commit, except when multiple edits to the same file are logically inseparable (e.g., same feature, same review scope). PM groups edits **by file, not by feature**.

| Commit | Files | Spawn Sites | Subject |
|--------|-------|-------------|---------|
| 1962c-1 | `execute-tier.md` | S1 | `chore(pm/1962c-1): dispatcher-wrap S1 execute-tier parallel fan-out` |
| 1962c-2+3+4 | `dev-team/main.md` | S2, S3, S4 | `chore(pm/1962c-2+3+4): dispatcher-wrap S2/S3/S4 three main.md hunks` |
| 1962c-5 | `developer.md` | S5 | `chore(pm/1962c-5): dispatcher-wrap S5 developer multi-zone fan-out` |
| 1962c-6 | `ba.md` | S6 | `chore(pm/1962c-6): dispatcher-wrap S6 ba architect fan-out` |
| 1962c-7 | `pm.md` | S7 | `chore(pm/1962c-7): dispatcher-wrap S7 pm dev-specialist fan-out` |

**Rationale for S2+S3+S4 grouping:** All three edits touch `.claude/flows/dev-team/main.md`. They are sequential additions to different steps (0b, 1, 2) in the same flow. One review + one commit per c47 principle.

---

## Sequencing and Dependencies

**No internal dependencies between S1–S7.** All spawn sites are in different files (except S2/S3/S4 grouped). Commits can be merged in any order post-1962a.

**Suggested merge order (no hard constraint):**
1. S1 (execute-tier.md) — primary collision vector, highest priority
2. S2+S3+S4 (main.md) — grouped commit covering three steps
3. S7 (pm.md) — highest-risk agent-level fan-out (gap report trigger)
4. S5 (developer.md) — agent-level fan-out, second highest risk
5. S6 (ba.md) — agent-level fan-out, lower volume
6. 1962d (qa smoke) — dependency: 1962c-1 through 1962c-7 merged
7. 1962e (docs) — dependency: 1962d PASS

---

## Verification Narrative

### Claim/Release Pair Verification

For each spawn site, agent-father MUST verify:

1. **Claim precedes spawn:** `task_claim(...)` call appears immediately before or within a for-loop guarding `Agent(...)` calls.
2. **Claim uses correct task_id:** For S1–S7, `task_id="task:" + <task_id_variable>`. For S3 (PO triage), synthetic `"task:po-triage-<YYYYMMDD>"`.
3. **Dispatcher identity correct:** 
   - S1 (`execute-tier.md`): `owner_agent="dev-team"`
   - S2–S4 (`dev-team/main.md`): `owner_agent="dev-team"`
   - S5 (`developer.md`): `owner_agent="developer"` ← Different from router (intentional — agent-level dispatch)
   - S6 (`ba.md`): `owner_agent="ba"`
   - S7 (`pm.md`): `owner_agent="pm"`
4. **TTL correct:** 
   - S1, S2, S4, S5, S6, S7: `ttl_seconds=3600`
   - S3: `ttl_seconds=1800` ← Different TTL (shorter, covers one triage cycle)
5. **Release follows spawn:** `task_release(task_id="task:" + <task_id>)` call issued after all spawns in batch return (or in a post-spawn error handler).
6. **Claim-fail path:** If `task_claim` returns `claimed=false`, code logs SKIP (Telegram optional) and does NOT spawn `Agent()`. Correct pattern: check claim result before spawn, skip task if claim failed, continue to next task in batch.

### Dispatcher Identity Correctness

Per brief §4: outer claim uses **dispatcher identity**, not spawned agent identity. This allows the same `task_id` to be claimed twice (outer by dispatcher, inner by agent) in the normal path without false collision.

- **Router-level dispatchers** (dev-team): use `owner_agent="dev-team"`
- **Agent-level dispatchers** (developer, ba, pm): use own `owner_agent` value (not the spawned agent's identity)

Example for S7:
```
// Outer (dispatcher-side, in pm.md):
task_claim(task_id="task:TASK_101", owner_agent="pm", ...)  ← owner = "pm", not "dev-stock-price"

Agent(dev-stock-price, TASK_101)

task_release(task_id="task:TASK_101")

// Inner (agent-side, in dev-stock-price.md, Phase 3):
[no change in 1962c-N — Phase 3 self-claim already present]
task_claim(task_id="task:TASK_101", owner_agent="dev-stock-price", ...)  ← owner = "dev-stock-price"
```

After outer release, inner self-claim fires with different `owner_agent` value → no false collision, both claims can coexist briefly during transition (per brief Case A §3).

---

## Observation Window and Remove Decision

Per brief §5 and PO signoff § 1962a must_cover item 8:

- **Inner self-claim (Phase 3) stays AS-IS** during 1962c-N agent-father wiring.
- **Remove-after-observation policy:** Only after 1962d smoke PASS can PO decide to remove or no-op inner self-claim in a future micro-sprint. That decision is **deferred**, not in 1962.
- **Rationale:** Keeping inner self-claim provides crash recovery; removing it would require 8 more flow-file edits (Phase 3 was 10 commits, remove-all would be another 8–10), doubling the change surface for this sprint.

---

## Files Affected Summary

| File | Edits | Priority | Owner |
|------|-------|----------|-------|
| `.claude/flows/dev-team/execute-tier.md` | S1 (1 commit) | HIGHEST | agent-father |
| `.claude/flows/dev-team/main.md` | S2, S3, S4 (1 commit, 3 hunks) | HIGH, MEDIUM, HIGH | agent-father |
| `.claude/agents/developer.md` | S5 (1 commit) | HIGH | agent-father |
| `.claude/agents/ba.md` | S6 (1 commit) | MEDIUM | agent-father |
| `.claude/agents/pm.md` | S7 (1 commit) | HIGHEST | agent-father |

**Zone:** All edits in `.claude/` (flow/agent definitions, no code, no config).  
**No Docker rebuild needed:** All changes are `.md` text files.  
**No MCP tool changes:** Phase 1 4-tool surface (claim, heartbeat, list, release) already live.  
**No protocol amendment:** task-lock-protocol.md claim grammar already covers dispatcher-wrap per brief §2.

---

## Handoff to 1962c–N (Agent-Father)

Agent-father picks up this plan and executes 5 commits (or 1 grouped + 4 solo, depending on merge strategy) across the 5 files. Each commit follows conventional-commit format with dispatcher-wrap pattern from brief §2 (Model 1). Verification steps embedded above per row; AC trailers documented in commit subjects.

After all 5 commits merged to main, 1962d (qa smoke) starts and validates the dispatcher-wrap collision-prevention logic via live test (two parallel dispatches with same task_id → one claimed=true, one SKIP).

---

## Acceptance Criteria (1962b — This Handoff)

- [x] Row-level plan created (7 spawn sites S1–S7)
- [x] Each row carries: task_id, file, lines, edit summary, owner, commit subject, grouping, priority, zone
- [x] Verification steps documented per row (claim/release pair, dispatcher identity, TTL)
- [x] Grouped S2+S3+S4 in one commit per c47 policy
- [x] Dependencies explicit (none between S1–S7, all depend on 1962a DONE)
- [x] Handoff emitted to `docs/signals/pm-1962b-plan-done.json`
