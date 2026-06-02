---
name: commit-boundary
description: "Three-rule explicit-stage discipline for maintenance-lane agents (pm, agents-architect, agent-father). SSOT for commit boundary enforcement. Absorbs FU-ARCHITECT-MUTEX-BINDING + FU-AGENT-FATHER-ORCH-SCOPE."
version: "2026-06-02"
---

# Commit Boundary Discipline

Apply these THREE RULES in order before every `git commit`. No exceptions.

## RULE 1 — EXPLICIT STAGE ONLY

```bash
# CORRECT: name each file explicitly
git add docs/agent-memory/notebooks/<agent>.md docs/architecture-briefs/<file>.md

# FORBIDDEN
git add -A        # sweeps everything modified — silently includes other agents' files
git add .         # same risk
git add docs/     # directory sweep — includes open-sprint files, notebooks, orch-state
```

Rationale: other agents in the same session modify notebooks, analysis-briefs, and
orch-state.json concurrently. A directory sweep silently bundles their work into your commit.

## RULE 2 — ZONE SELF-CHECK (before git commit)

```bash
git diff --cached --name-only
# verify EVERY staged file is within your declared zone (table below)
# if any file is outside zone:
git restore --staged <intruder-file>
# log the exclusion in your notebook/session log before proceeding
# NEVER commit a file that belongs to another agent's zone
```

**Per-agent declared zones:**

| Agent | Allowed zone | Excluded (examples) |
|---|---|---|
| agents-architect | `docs/architecture-briefs/` · `docs/signals/` · `docs/agent-memory/notebooks/agents-architect.md` | `docs/data/orch/orch-state.json` · `apps/` · other agents' notebooks |
| agent-father | `docs/agents/` · `docs/agent-memory/` (any notebook) · `.claude/skills/` · `.claude/agents/` | `docs/data/orch/orch-state.json` · `apps/` · `docs/data/system-map.json` |
| pm | `docs/data/orch/orch-state.json` (task board + sprint sections) · `docs/agent-memory/notebooks/pm.md` | `docs/architecture-briefs/` · `apps/` · other agents' notebooks |

## RULE 3 — RAW SELF-VERIFY (after git commit)

```bash
git show --name-only HEAD
# verify ONLY your intended files appear
# if unexpected files appear:
git reset --soft HEAD~1   # undo commit (keeps changes staged)
# then: git restore --staged <intruder-file> and re-commit
```

---

## Commit-Mutex Gap — R-HANDOFF Protocol

**pm** (has MCP gateway binding): MUST claim commit-mutex before every commit:
```
task_claim(task_kind="commit-mutex", task_id="pm-commit-<slug>",
  owner_agent="pm", ttl_seconds=120)
→ apply RULE 1-3
→ task_release_or_expire after git show --name-only self-verify passes
```

**agents-architect + agent-father** (no gateway binding — mutex physically unreachable):

- Solo operation (orch-state.head.wip ≤ 1 OR agent's task is the only active dev activity):
  → commit directly, applying RULE 1-3. No extra signaling needed.

- Contention risk (orch-state.head.wip = 2 AND a dev-team task is concurrently active):
  → write signal row to orch-state.signal_queue:
    `{type: "commit-handoff-request", from: "<agent>", to: "router",
      summary: "staging <N files>; request mutex window"}`
  → WAIT for router ack: `{type: "commit-handoff-ack", from: "router", to: "<agent>"}`
  → commit (RULE 1-3 still applies), then signal:
    `{type: "commit-handoff-release", from: "<agent>", to: "router"}`
