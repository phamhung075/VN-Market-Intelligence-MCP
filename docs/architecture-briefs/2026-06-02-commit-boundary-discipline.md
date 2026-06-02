<!-- size-justification: 152L — commit-boundary design; 3 symptom clusters + 2 fix sub-specs (boundary discipline + mutex gap) are operationally coupled; cannot split without breaking the cross-reference between enforcement mechanism and per-agent wiring -->

# Commit Boundary Discipline — Maintenance-Lane Agents

**Status:** DESIGN COMPLETE — agent-father implementation pending
**Task:** PM-COMMIT-BOUNDARY-1974
**Authored:** 2026-06-02
**Author:** agents-architect
**Supersedes:** FU-ARCHITECT-MUTEX-BINDING · FU-AGENT-FATHER-ORCH-SCOPE

---

## 1. Symptoms (3 instances, same class)

| # | Agent | Commit | Defect |
|---|---|---|---|
| S-1 (3rd recurrence) | pm | 0a60fa1d | 26 files committed including 17 architecture-briefs not part of the task — over-broad `git add -A` pattern |
| S-2 | agents-architect | 04828f67, 7d8951c7 | Committed without claiming commit-mutex (no MCP gateway binding → mutex physically unreachable) |
| S-3 | agent-father | (staged) | Staged router-owned orch-state.json — outside agent-father's docs/agents/ zone |

---

## 2. Root Cause (Class)

**Maintenance-lane agents (pm, agents-architect, agent-father) commit outside their intended file boundary or without mutex coordination because:**

(a) **No explicit-stage discipline is encoded in their flows.** All three agents reach `git commit` via freeform Bash; none of their init.md / flow files contain a rule prohibiting `git add -A` or mandating `git show --name-only` self-verification. The constraint exists only in the router's CLAUDE.md (which is not read by sub-agents).

(b) **The commit-mutex is an MCP tool (`task_claim(task_kind="commit-mutex")`) that requires the gateway binding.** agents-architect and agent-father have Read/Edit/Write/Bash only — no MCP access. pm has gateway access but no documented flow step enforcing mutex claim before commit. The mutex therefore has a structural dead zone for exactly the agents most likely to collide with dev-team commits.

(c) **File-zone scope is undeclared.** agents-architect knows it writes to `docs/architecture-briefs/` + `docs/signals/` (stated in init.md `boundary_rules`) but that rule is not mechanically enforced at commit time. pm has no declared zone. agent-father spans `docs/agents/` + `docs/` but has no exclusion for router-owned orch-state.json or apps/ zones.

---

## 3. Fix Design

### Fix A — Explicit-Stage Discipline (all maintenance agents)

A shared three-rule commit discipline, encoded in a new skill file **`.claude/skills/commit-boundary/SKILL.md`** (~60L) and referenced from each agent's init.md. The skill is the SSOT; init.md only holds a pointer.

**Three rules (applied in order before every commit):**

```
RULE 1 — EXPLICIT STAGE ONLY
  Use: git add <path1> <path2> ... (name each file)
  NEVER: git add -A  |  git add .  |  git add docs/  (glob or directory sweeps)
  Rationale: directory/glob sweeps silently include unrelated modified files
    (open sprints, notebooks, analysis-briefs edited by other agents this session)

RULE 2 — ZONE SELF-CHECK (before git commit)
  Run: git diff --cached --name-only
  Verify: every staged file is within your declared zone (see per-agent table below)
  If any file is outside zone → unstage it (git restore --staged <file>) and log the
    exclusion in your notebook/session log before proceeding
  NEVER commit a file that belongs to another agent's zone

RULE 3 — RAW SELF-VERIFY (after git commit)
  Run: git show --name-only HEAD
  Verify: only your intended files appear
  If unexpected files appear → git reset --soft HEAD~1, unstage intruders, re-commit
```

**Per-agent declared zones:**

| Agent | Allowed zone (explicit) | Excluded (examples) |
|---|---|---|
| agents-architect | `docs/architecture-briefs/` · `docs/signals/` · `docs/agent-memory/notebooks/agents-architect.md` | `docs/data/orch/orch-state.json` · `apps/` · other agents' notebooks |
| agent-father | `docs/agents/` · `docs/agent-memory/` (any notebook) · `docs/architecture-briefs/` (read-only, no write) · `.claude/skills/` · `.claude/agents/` | `docs/data/orch/orch-state.json` · `apps/` · `docs/data/system-map.json` |
| pm | `docs/data/orch/orch-state.json` (task board + sprint sections) · `docs/agent-memory/notebooks/pm.md` | `docs/architecture-briefs/` · `apps/` · other agents' notebooks |

### Fix B — Commit-Mutex Gap (agents without gateway binding)

**Recommendation: Router-mediated commit handoff (Option R-HANDOFF)**

Rationale for choosing R-HANDOFF over alternatives:
- Adding gateway binding to agents-architect/agent-father would widen the tool surface and introduce tool-call overhead for a workflow that is already safe under low-WIP (WIP≤2 + fixed-sequence per task dispatch).
- A pre-commit boundary check (git hook) would be repo-global and affect all agents — heavier, harder to test.
- R-HANDOFF is the minimal addition: for concurrent-risk scenarios, the agent signals the router; router claims mutex, acks, agent commits, router releases.

**R-HANDOFF Protocol (for agents-architect + agent-father):**

Under normal operation (solo task, no concurrent dev-team commit expected):
→ agents-architect and agent-father commit directly, applying Fix A RULE 1-3.
  "Solo" = orch-state.head.wip ≤ 1 OR agent's own task is the only active dev activity.

Under contention risk (orch-state.head.wip = 2 AND a dev-team task is concurrently active):
→ Agent writes a signal row to orch-state.signal_queue:
  `{type: "commit-handoff-request", from: "<agent>", to: "router", payload_ref: null,
    summary: "staging <N files>; request mutex window"}`
→ Agent WAITS (does not commit) until router signals back:
  `{type: "commit-handoff-ack", from: "router", to: "<agent>"}`
→ Agent commits (Fix A RULE 1-3 still applies), then signals:
  `{type: "commit-handoff-release", from: "<agent>", to: "router"}`

Under solo operation (the common case for this project): no extra signaling needed.
R-HANDOFF overhead is zero except in the rare WIP=2 + dev-team concurrent case.

**pm (has gateway binding but no enforced flow step):**
→ pm MUST claim commit-mutex before every commit using:
  `task_claim(task_kind="commit-mutex", task_id="pm-commit-<slug>", owner_agent="pm", ttl_seconds=120)`
  → release after `git show --name-only` self-verify passes.
  This step must be inserted in pm's flow (pm/flow/main.md or equivalent) as a mandatory pre-commit gate.

---

## 4. Agent-Father Implementation Spec

### Files to create

1. **`.claude/skills/commit-boundary/SKILL.md`** — new skill (~60L) containing the three rules + per-agent zone table (§3 Fix A verbatim). Add frontmatter `name: commit-boundary` + `description`.

### Files to edit

2. **`docs/agents/agents-architect/init.md`** — add to `knowledge.always_load[]`:
   ```yaml
   - path: .claude/skills/commit-boundary/SKILL.md
     fail_loud: true
   ```
   Add to `boundary_rules` section: `commit_discipline: "SSOT → .claude/skills/commit-boundary/SKILL.md"`.

3. **`docs/agents/agents-architect/handlers.md`** § Brief-Commit Invariant Step 3 — replace the current `git add` example with:
   ```bash
   # RULE 1: explicit stage only
   git add docs/agent-memory/notebooks/agents-architect.md docs/architecture-briefs/<file>.md
   # RULE 2: zone self-check
   git diff --cached --name-only
   # verify all paths are within docs/architecture-briefs/ or docs/agent-memory/notebooks/agents-architect.md
   git commit -m "..."
   # RULE 3: raw self-verify
   git show --name-only HEAD
   ```

4. **`docs/agents/agent-father/init.md`** (or equivalent) — add `commit-boundary` to `knowledge.always_load[]` (same pattern as #2). Add zone declaration to `boundary_rules`.

5. **`docs/agents/pm/init.md`** (or equivalent) — add `commit-boundary` to `knowledge.always_load[]`. Add explicit commit-mutex claim step to pm's pre-commit checklist in its flow.

6. **`docs/agents/pm/flow/main.md`** (or equivalent commit flow section) — insert mandatory pre-commit step:
   ```
   ## Pre-commit gate (mandatory before every git commit)
   1. Claim commit-mutex: task_claim(task_kind="commit-mutex", task_id="pm-commit-<slug>",
        owner_agent="pm", ttl_seconds=120)
   2. Apply commit-boundary RULE 1-3 (skill: .claude/skills/commit-boundary/SKILL.md)
   3. Release: task_release_or_expire after git show --name-only self-verify passes
   ```

### Sequencing

Step 1 (create skill) must land before steps 2-6 (all reference it).
Steps 2-6 can land in a single follow-on commit.

### Size caps

- `.claude/skills/commit-boundary/SKILL.md`: ≤80L (skill cap)
- Init.md edits: additive only (1-3 lines each); stay within existing file caps

---

## 5. Verification

After implementation, agent-father verifies:
- `.claude/skills/commit-boundary/SKILL.md` exists and lint-parses (valid YAML frontmatter + markdown body)
- agents-architect init.md `always_load` contains the skill path
- handlers.md § Brief-Commit Invariant Step 3 shows `git diff --cached --name-only` before commit and `git show --name-only` after
- pm flow contains mutex-claim step before commit
- agent-father init.md has zone declaration and skill pointer

---

## 6. Open Items (absorbed from backlog)

- **FU-ARCHITECT-MUTEX-BINDING** — resolved by R-HANDOFF (§3 Fix B); architect gets mutex window via router signal, not gateway binding. CLOSED.
- **FU-AGENT-FATHER-ORCH-SCOPE** — resolved by zone table (agent-father zone excludes orch-state.json; Fix A RULE 2 will catch staged orch-state.json files). CLOSED.
