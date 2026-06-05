# Architecture Brief — Agent Decision Journal (Sprint Footprint)

**Date:** 2026-06-05  
**Author:** agents-architect  
**Status:** READY-FOR-AGENT-FATHER  
**Signal:** `docs/signals/agent-decision-journal-20260605T163102Z.json`

---

## 1. Problem Statement

Agents currently narrate reasoning on the terminal (inside their agent thread output). This conflates two concerns:

- **Status signal** — what the terminal/router needs to route the pipeline.
- **Decision rationale** — WHY a step was done, what was considered, why a change was made.

Result: terminal is noisy, rationale is lost after the session, and post-hoc audits require re-reading full agent thread transcripts. The user requires a durable, file-based decision trail — the "sprint footprint" — without polluting the terminal.

---

## 2. Scope

**Which agents write a journal:** ALL agents that execute task steps — that is, the full **dev-core** + **dev-zone** + **cowork** lanes as defined in `docs/agents/dev-team/flow/main.md § Team Boundary`. Excluded: thin dispatchers (dev-team, cowork-team flows) which do not execute task steps themselves.

**Triggering moment:** At the END of each step that makes a non-trivial decision (any step that involves a `why` — a choice between options, a change from an earlier plan, a tool call failure adaptation, a confidence judgment). Not every mechanical bootstrap sub-step (e.g. project-root resolution, notebook read) needs a journal entry.

---

## 3. File Placement — Decision

### Choice: Per-sprint footprint at `docs/agent-memory/decisions/<sprint-id>.md`

**Justification:**

| Option considered | Verdict |
|---|---|
| Per-task `docs/handoffs/TASK_NNN-decisions.md` | REJECTED: handoffs are role-to-role payload, not a rationale trail; adding a sibling file doubles handoff count; tree-map.md position table maps handoffs to role handoffs not decision logs |
| Per-sprint `docs/agent-memory/decisions/<sprint-id>.md` | CHOSEN — see below |
| Per-agent sessions `docs/agent-memory/sessions/<agent>/decisions.md` | REJECTED: per-agent scope loses cross-agent causal chain for a single task; sprint is the unit of coherence |

**Why per-sprint:**

The user said "sprint footprint" — the natural unit is the sprint (the set of tasks executed under one sprint goal). Multiple agents contribute steps to one sprint. A single file accumulates ALL agents' step-rationale for that sprint, giving the reader a single document to understand the full decision chain.

**Path convention:**

```
docs/agent-memory/decisions/sprint-<sprint-id>.md
```

Example: `docs/agent-memory/decisions/sprint-2026-06-05-agent-decision-journal.md`

Where `<sprint-id>` = the slug from `docs/data/orch/orch-state.json .sprint_goal.entries[0].id` (or the task_id prefix when no formal sprint goal). Agent-father must read `.sprint_goal.entries[0].id` at implementation time to determine the active convention; fallback = date-based slug from `date -u +%Y-%m-%d`.

**Tree-map.md placement:** `docs/agent-memory/decisions/` is a child of `docs/agent-memory/` — volatile, agent-written. Agent-father must add this directory and a tree-map.md entry under the `docs/agent-memory/` node in `docs/references/tree-map.md § Write Ownership`. Decision files are APPEND-only (multi-agent accumulator), written by all agents, never by main terminal.

**Location table:** Agent-father must add a row to `docs/policies/docs-organization-location-table.md`:

```
| Decision journal `sprint-*.md` | `docs/agent-memory/decisions/` | root, `docs/handoffs/` |
```

---

## 4. Entry Format (Template)

Each agent appends one or more `### STEP` blocks to the sprint footprint file. Format is FULL-tier (token-economy-aware — structured, no narrative padding, no filler).

```markdown
### STEP <step-id> · <agent-id> · <ISO-timestamp>

**what-done:** <one sentence — the concrete action taken>
**what-considered:** <bullet list of options/data points evaluated — 2-4 bullets max>
**why-decision:** <one sentence — the decisive reason the chosen option won>
**why-change:** <one sentence — why this differs from the prior plan, or "no change from plan">
```

**Constraints:**
- Each STEP block: hard cap 12 lines (6 field lines + blank separator + heading = ~10L).
- `step-id`: `<agent-id>-S<N>` where N increments per agent per sprint (e.g. `developer-S1`, `qa-S2`). Not globally unique across agents — prefix with agent-id handles that.
- `ISO-timestamp`: `date -u +"%Y-%m-%dT%H:%M:%SZ"` at moment of writing the entry.
- `what-considered`: if only one option was live, write `only option: <reason it was the only viable path>`.
- `why-change`: mandatory field. "no change from plan" is a valid value and keeps the field parseable.

---

## 5. Append vs Overwrite — Size Cap — Prune Policy

**Semantics:** APPEND-only. A sprint footprint is a multi-agent accumulator. Never overwrite — each new `### STEP` block is appended.

**File header (written once by the FIRST agent to write to a new sprint file):**

```markdown
# Decision Journal — Sprint <sprint-id>

**Sprint goal:** <one-line from orch-state.json .sprint_goal.entries[0].description>
**Started:** <ISO-timestamp>
**Agents:** <accumulates automatically — no explicit list needed>

---
```

**Size cap:** 600L per sprint footprint file. This is deliberately larger than the notebook cap (200L) because a footprint accumulates entries from multiple agents across an entire sprint — a typical sprint with 5 agents, 4 steps each = 20 entries × ~10L = 200L body + header = ~220L; cap at 600L provides 2.5× headroom for larger sprints.

**Prune policy:** NO prune within a sprint. Footprints are NEVER pruned mid-sprint. When a sprint closes (orch-state task_board sprint archived), the footprint file is moved to `docs/archive/decisions/sprint-<sprint-id>.md` by the pm agent as part of sprint-close (same moment orch-state sprint is archived). This keeps `docs/agent-memory/decisions/` lean (only active sprint files).

**If 600L cap is hit before sprint close:** append a `### CAP-REACHED` sentinel entry and stop writing. New entries for that sprint are silently dropped (cap-breach is an ops concern, not a flow blocker).

---

## 6. Rule Wording — Terminal vs Journal

### The Rule (exact wording for injection):

> **DECISION JOURNAL RULE:** Reasoning and decision rationale MUST be written to the sprint footprint file (`docs/agent-memory/decisions/sprint-<sprint-id>.md`), NOT narrated on the terminal. Terminal output is STATUS-ONLY: RETURN block + caveman status lines. Any "why I chose X", "I considered Y", "I changed from Z to W" reasoning goes to the journal file exclusively.

### Where to inject this rule:

**Option A (chosen): Shared skill** — create `.claude/skills/decision-journal/SKILL.md` as the SSOT for the write protocol. Every agent flow that uses `cowork-end-cycle` or has an explicit Step-N already chains this skill.

**Injection points (agent-father implements ALL of these):**

| File | Injection | Where |
|---|---|---|
| `.claude/skills/cowork-end-cycle/SKILL.md` | Add Step 0 (before session log): "Decision journal flush → skill: `.claude/skills/decision-journal/SKILL.md`" | Before existing Step 1 |
| `docs/agents/developer/flow/main.md` | After each major step block, add: "→ journal entry: skill `.claude/skills/decision-journal/SKILL.md` § Write Entry" | Per-step insertion |
| `docs/agents/developer/flow/microservice-main.md` | Same as above | Per-step insertion |
| `docs/agents/qa/flow/main.md` | Same pattern | Per-step insertion |
| `docs/agents/architect/flow/main.md` | Same pattern | Per-step insertion |
| `docs/agents/agent-father/flow/edit-apply.md` | Same pattern | Per-step insertion |
| `.claude/skills/dispatch/SKILL.md` § Non-Negotiables | Add: "Terminal = status-only (RETURN + caveman). All reasoning → decision journal." | End of Non-Negotiables section |

**Why a shared skill (not per-agent injection):** The write protocol (path resolution, header init, append, cap check) is mechanical and identical across all agents. DRY — one SKILL.md, not 20 copies of the write procedure.

**Why NOT in the notebook-write skill:** Notebook is per-agent cross-cycle memory. Journal is per-sprint cross-agent decision trail. Different granularity, different retention, different readers. Keep them separate.

---

## 7. Boundary with Existing Mechanisms

| Mechanism | Purpose | Content | Retention | Writer |
|---|---|---|---|---|
| `docs/agent-memory/notebooks/<id>.md` | Cross-cycle per-agent memory | What this agent learned, carry-overs, open items | Rolling 3 sections, ≤200L | That agent only |
| `docs/handoffs/TASK_NNN.md` | Role-to-role task payload | Problem statement, AC, implementation record, QA result | Indefinite (per task) | Multiple roles, one section each |
| `docs/data/orch/orch-state.json .task_board` | Sprint orchestration state | Task status, pipeline head, signal queue | Volatile, archived at sprint close | po/pm/dev-team only |
| `docs/agent-memory/decisions/sprint-<id>.md` | Decision rationale trail | WHY each step, what was considered, why change | Sprint lifetime → archived at close | ALL task-executing agents |

**Boundary rule (to inject into every relevant flow):**

> - Journal = WHY (decision trail, per step, during sprint)
> - Notebook = WHAT WAS LEARNED (cross-cycle memory, per agent)
> - Handoff = WHAT TO DO / WHAT WAS DONE (role payload, per task)
> - No duplication: a handoff `[Developer] Implementation Record` says WHAT was built; the journal says WHY the implementation approach was chosen.

---

## 8. Skill Spec — `decision-journal` SKILL.md

Agent-father must create `.claude/skills/decision-journal/SKILL.md` with the following sections:

### § Resolve Sprint ID

```bash
SPRINT_ID=$(jq -r '.sprint_goal.entries[0].id // empty' docs/data/orch/orch-state.json 2>/dev/null)
[ -z "$SPRINT_ID" ] && SPRINT_ID=$(date -u +"%Y-%m-%d")
JOURNAL_PATH="docs/agent-memory/decisions/sprint-${SPRINT_ID}.md"
```

### § Init File (if not exists)

```bash
if [ ! -f "$JOURNAL_PATH" ]; then
  SPRINT_DESC=$(jq -r '.sprint_goal.entries[0].description // "no goal set"' docs/data/orch/orch-state.json 2>/dev/null)
  # Write header — one time only
  # (agent uses Write tool with the header template defined in §4 above)
fi
```

### § Write Entry

Agent composes the STEP block in memory (12L max), then appends to `$JOURNAL_PATH` using Edit tool (append pattern: `old_string="\n---\n"` at EOF, `new_string="\n---\n\n### STEP..."`) or Write with full content (read + append + write).

### § Cap Check

```bash
LINES=$(wc -l < "$JOURNAL_PATH" | tr -d ' ')
[ "$LINES" -gt 600 ] && echo "### CAP-REACHED · $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$JOURNAL_PATH" && exit 0
```

### § Commit Rule

Decision journal entries are NOT committed individually. They accumulate during the sprint and are committed as part of the agent's end-of-cycle notebook commit — one atomic commit: `git add docs/agent-memory/decisions/sprint-<id>.md docs/agent-memory/notebooks/<id>.md`. This avoids commit noise.

---

## 9. Concrete Worked Example

File: `docs/agent-memory/decisions/sprint-2026-06-05-bctc-analytics-layer.md`

```markdown
# Decision Journal — Sprint 2026-06-05-bctc-analytics-layer

**Sprint goal:** Fix BAL-1 ratio column serve path + publish gate
**Started:** 2026-06-05T08:00:00Z

---

### STEP architect-S1 · agents-architect · 2026-06-05T08:12:00Z

**what-done:** Chose recompute-on-read (Option R) over one-shot backfill (Option B) for ratio columns.
**what-considered:**
- Option B: one-shot backfill — fast to ship, fixes corpus immediately
- Option R: recompute-on-read in serve path — zero stale class, more expensive per request
- PUB-6 bounds check does not catch near-zero stale values (VNM roe=2.75e-10 passes |roe|>300 guard)
**why-decision:** PUB-6 bounds check is insufficient backstop → backfill creates false-safe illusion; recompute-on-read eliminates the stale class permanently.
**why-change:** Prior plan was Option B (fast path); changed after discovering PUB-6 guard gap.

---

### STEP developer-S1 · dev-mcp-server · 2026-06-05T09:34:00Z

**what-done:** Inline-recomputed 5 ratios (roe/roa/eps/net_debt_to_ebitda/current_ratio) in get_bctc_full handler from base scalars, mutating latestRow before checkPublishability.
**what-considered:**
- Mutate in-place before serialize: simple, no schema change
- Add computed_ratios envelope: clean but requires consumer migration
- only option for timing: in-place mutation — schema change would block QA gate
**why-decision:** In-place mutation requires zero consumer migration and lands in one file.
**why-change:** No change from architect brief Option R spec.

---

### STEP qa-S1 · qa · 2026-06-05T10:15:00Z

**what-done:** Verified live serve value via get_bctc_full for VNM — roe returned 0.273 (27.3%), not 2.75e-10.
**what-considered:**
- Badge-green test alone insufficient (prior false-green lesson)
- Raw live serve call via gateway required
**why-decision:** Raw serve value matches expected 27.3% — recompute-on-read confirmed live.
**why-change:** Added gateway raw-verify step (not in original QA plan) after recalling feedback_router_verify_raw_not_badges lesson.
```

---

## 10. Implementation Instructions for Agent-Father

**Files to create:**

1. `.claude/skills/decision-journal/SKILL.md` — per §8 above (estimated ~80L).
2. `docs/agent-memory/decisions/` directory — create a `.gitkeep` so git tracks it.

**Files to edit:**

3. `.claude/skills/cowork-end-cycle/SKILL.md` — prepend Step 0: decision journal flush.
4. `docs/agents/developer/flow/main.md` — inject `→ journal: skill decision-journal § Write Entry` after Steps that carry a decision (Step 0b pre-code, Step 3 implementation, Step 4 test run if failure adaptation).
5. `docs/agents/developer/flow/microservice-main.md` — same pattern as main.md.
6. `docs/references/tree-map.md` — add `docs/agent-memory/decisions/` node under `docs/agent-memory/` in the tree; add Write Ownership row: `docs/agent-memory/decisions/sprint-*.md | All task-executing agents | Per step, accumulated during sprint`.
7. `docs/policies/docs-organization-location-table.md` — add row per §3 above.

**Files NOT to edit (boundary):**

- `docs/agent-memory/notebooks/*.md` — no change; notebook SSOT stays as-is.
- `docs/handoffs/TASK_NNN.md` template — no change; handoffs stay role-payload only.
- `docs/data/orch/orch-state.json` — no change.
- Per-agent qa/architect/agent-father flow files — inject journal step only if those flows have explicit decision-bearing steps; do NOT add to mechanical bootstrap flows.

**Sequencing:**

1. Create skill + directory first.
2. Edit tree-map.md + location table (SSOT first).
3. Edit cowork-end-cycle (fleet-wide effect via shared skill).
4. Edit developer flow files (dev-core lane).
5. QA: dry-run on one agent (dev-mcp-server) — verify journal file created, 12L cap respected, no terminal narration added.

---

## 11. Open Questions (agent-father resolves, no need to escalate)

- **Q1:** Which flows currently extend `microservice-main.md` vs `main.md`? Agent-father should check both files and apply injection to both — they are siblings.
- **Q2:** The per-qa/architect flows are not enumerated here. Agent-father should apply the same inject-at-decision-bearing-step rule to any flow file that contains multi-option decisions (not just status/bootstrap steps).
- **Q3:** `docs/agent-memory/decisions/` directory must exist before any agent tries to write. Agent-father creates the `.gitkeep` and commits it with the skill creation commit.

No operator greenlight required — this is a cross-cutting output protocol change, no schema change, no MCP tool change.
