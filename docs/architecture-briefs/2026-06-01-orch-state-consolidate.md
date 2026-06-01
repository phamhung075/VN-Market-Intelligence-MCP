<!-- size-justification: 310L — operator-directed design brief (ORCH-STATE-CONSOLIDATE). Covers JSON schema recommendation, exact migration plan for every pipeline-state.json reader (file:line citations), markdown-generation ownership/cadence, and all 4 hard constraints. All content is load-bearing for PM → agent-father handoff. -->

# Architecture Brief — ORCH-STATE-CONSOLIDATE (JSON-SSOT Direction)

**Date:** 2026-06-01
**Author:** agents-architect
**Status:** DESIGN COMPLETE — handoff to PM / agent-father
**Operator decision:** JSON-first; markdown becomes generated view, never hand-authored.

---

## 0. Scope & Constraint Summary

This brief folds the operator's chosen direction into a concrete design.

Hard constraints (all preserved):
- **HC-1:** Frontend accesses orchestration state via `api-gateway:4000` only — no direct file reads, no new bypass.
- **HC-2:** Raw signal payloads (DASHBOARD rows with embedded shell-injection characters) are never exposed in HTTP responses.
- **HC-3:** No secret leakage via any new endpoint.
- **HC-4:** The `:07 RETURN write contract` (every dev-team agent writes `docs/pipeline-state.json` before returning) is preserved verbatim.

---

## 1. JSON Schema — Recommended Shape

### 1.1 Design decision: one JSON file per concern, under a single `docs/data/orch/` owner

Full absorption into one mega-document is rejected. Rationale:

- `pipeline-state.json` is **write-hot** (written by every agent at RETURN, ~hourly, requires CAS in pm/flow/main.md). Task board and signal queue change on different cadences.
- Merging write-hot and write-cold surfaces into one file creates a concurrent-write hazard across every reader — a direct regression on the `feedback_concurrent_commit_race` lesson.
- `tasksMdJanitorJob.ts` holds a typed `PipelineState` interface locked to the current field set. Absorbing task board and signals into the same file widens the migration surface unnecessarily.

**Chosen shape: 3 JSON files, shared parent directory `docs/data/orch/`, single logical owner (the dev-team pipeline).**

```
docs/data/orch/
  pipeline-state.json   ← existing file, MOVED (see §2 migration)
  task-board.json       ← replaces docs/TASKS.md as SSOT (new)
  signal-queue.json     ← replaces docs/signals/DASHBOARD.md as SSOT (new)
```

All three share a common envelope:
```jsonc
{
  "_schema": "v3",
  "_ssot": true,
  "_updated_at": "<ISO-8601 UTC>",
  "_updated_by": "<agent-id>",
  // ... concern-specific payload
}
```

`docs/TASKS.md` and `docs/signals/DASHBOARD.md` become **generated views** — written by
a renderer, never hand-edited. See §3.

---

### 1.2 `pipeline-state.json` (moved to `docs/data/orch/pipeline-state.json`)

Schema: **v2 as-is** — no field changes. This preserves the :07 write contract exactly.

```jsonc
{
  "_schema": "v2",              // bump to "v3" only when content changes, not on move
  "_maintained_by": "every agent at RETURN via agent-chaining-protocol",
  "head": {
    "status": "idle | in_progress | blocked | stale",
    "active_task_id": null,
    "next_agent": null,
    "next_action": "<≤20-word spawn prompt suffix>",
    "wip": 0,
    "wip_max": 2,
    "updated_at": "<ISO-8601 UTC>",
    "updated_by": "<agent-id>"
  },
  "dashboard_section_cache": { ... },   // unchanged
  "narrative": { ... },                 // unchanged
  "session_handoff_status": { ... }     // unchanged
}
```

No structural changes to v2. The only change is the **file path** (see §2).

---

### 1.3 `task-board.json` (new — replaces TASKS.md as machine SSOT)

```jsonc
{
  "_schema": "v1",
  "_ssot": true,
  "_updated_at": "<ISO-8601 UTC>",
  "_updated_by": "<agent-id>",
  "active_sprints": [
    {
      "id": "<sprint-id>",           // e.g. "TOOL-SURFACE-HYGIENE"
      "status": "active | paused | pending-gate",
      "tasks": [
        {
          "task_id": "<NNN[a-z]?>",  // e.g. "TSH-1"
          "title": "<≤60 chars>",
          "type": "sprint-task | backlog | on-demand",
          "owner": "<agent-id>",
          "depends": "<task_id | null>",
          "status": "TODO | IN_PROGRESS | DONE | BLOCKED | DEFERRED",
          "size": "XS | S | M | L | null"
        }
      ]
    }
  ],
  "backlog": [
    { "id": "<backlog-slug>", "summary": "<≤80 chars>", "priority": "high | normal | low" }
  ]
}
```

**What the frontend endpoint surfaces** (`GET /api/orchestration/tasks`): sprint id/status,
task id/status/title/owner — no raw payload, no agent-internal notes.

---

### 1.4 `signal-queue.json` (new — replaces DASHBOARD.md as machine SSOT)

```jsonc
{
  "_schema": "v1",
  "_ssot": true,
  "_updated_at": "<ISO-8601 UTC>",
  "_updated_by": "<agent-id>",
  "rows": [
    {
      "id": "<signal-id>",
      "ts": "<ISO-8601 UTC>",
      "from": "<agent-id>",
      "to": "<agent-id>",
      "type": "audit-handoff | bug-escalation | dispatcher-incident | system_issue | ...",
      "summary": "<≤120 chars — NO raw payload>",
      "severity": "CRITICAL | HIGH | MED | LOW | INFO",
      "status": "NEW | READ | RESOLVED | PARTIAL",
      "payload_ref": "<path-to-handoff-file or null>"   // pointer, never inline payload
    }
  ]
}
```

`payload_ref` is a pointer to a handoff file path — never an inline payload blob.
HC-2 is enforced structurally: the raw DASHBOARD payload cells are absent from this schema.

**Queryable with jq:** `jq '.rows[] | select(.status=="NEW")' docs/data/orch/signal-queue.json`
**Dashboard-friendly:** all fields are flat, typed, and bounded-length.

---

## 2. Migration — `pipeline-state.json` Readers

This is the highest-risk section. All current readers must be updated atomically.

### 2.1 Reader inventory (file:line)

| Reader | File | Lines | Read type |
|---|---|---|---|
| Schema test | `apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts` | L16–19 | `PIPELINE_STATE_PATH = resolve(import.meta.dir, "../../../../docs/pipeline-state.json")` |
| Janitor job (R-2 step) | `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` | L309 | `const pipelinePath = resolve(projectRoot, "docs", "pipeline-state.json")` |
| Dev-team drain | `docs/agents/dev-team/flow/drain-signals.md` | §Step 4 | writes `dashboard_section_cache` field |
| Dev-team main flow | `docs/agents/dev-team/flow/main.md` | L151–185 | Step 0b — head-only read for routing |
| PM flow CAS guard | `docs/agents/pm/flow/main.md` | L119–133 | fresh read before DASHBOARD write |
| PO tools | `docs/agents/tools/package/po.md` | L110 | "Check pipeline-state.json status" |
| System-auditor D4 | `docs/agents/system-auditor/audit-dimensions.md` | L52–53, L86, L98, L103 | D4-R2 cross-check + DN-W2 mtime |
| System-auditor handlers | `docs/agents/system-auditor/handlers.md` | L31–46, L122 | R-2 cross-check logic |
| Alert-commander dispatch log | `docs/agents/alert-commander/flow/stage-dispatch-log.md` | L53 | `jq -r '.currentSprint // "idle"' docs/pipeline-state.json` |
| TNB handoff | `docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md` | L88 | negative rule — "Do NOT write" |
| Project-root skill | `.claude/skills/project-root/SKILL.md` | L19 | path reference |
| Signal-dashboard skill | `.claude/skills/signal-dashboard/dashboard-protocol.md` | L42 | `dashboard_section_cache` read |
| Agent-chaining-protocol | `docs/protocols/agent-chaining-protocol.md` | L42–47, L73, L94, L127, L156 | write contract + shared-SSOT list |
| Execute-tier isolation | `docs/agents/dev-team/flow/execute-tier.md` | L69 | shared-SSOT list |

### 2.2 Migration strategy: rename-with-shim

**Strategy: move the file; update the path in all readers. Do NOT restructure the file contents.**

Rationale: the v2 schema is already correct and load-bearing. A content restructure would
require coordinating all readers simultaneously across code and agent files. A path rename
is a one-pass search-and-replace.

**Step M-1 — Create new directory and move file:**
```bash
mkdir -p docs/data/orch/
git mv docs/pipeline-state.json docs/data/orch/pipeline-state.json
```

**Step M-2 — Update code readers (dev-mcp-server task):**

| File | Old path | New path |
|---|---|---|
| `1837a-pipeline-state.test.ts:L16` | `"../../../../docs/pipeline-state.json"` | `"../../../../docs/data/orch/pipeline-state.json"` |
| `tasksMdJanitorJob.ts:L309` | `resolve(projectRoot, "docs", "pipeline-state.json")` | `resolve(projectRoot, "docs", "data", "orch", "pipeline-state.json")` |

**Step M-3 — Update agent/skill/protocol files (agent-father task):**

All occurrences of `docs/pipeline-state.json` in the agent/skill/flow files listed in §2.1
become `docs/data/orch/pipeline-state.json`. This includes:
- `docs/protocols/agent-chaining-protocol.md` (5 occurrences, including the PIPELINE_STATE_WRITE template)
- `docs/agents/dev-team/flow/main.md` (4 occurrences in Step 0b)
- `docs/agents/dev-team/flow/drain-signals.md` (Step 4 reference)
- `docs/agents/pm/flow/main.md` (L119–133, 4 occurrences)
- `docs/agents/po/flow/` or tools package reference (L110)
- `docs/agents/system-auditor/audit-dimensions.md` (all D4/DN refs)
- `docs/agents/system-auditor/handlers.md` (all R-2/R-122 refs)
- `docs/agents/alert-commander/flow/stage-dispatch-log.md` (L53 jq path)
- `docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md` (L88 negative rule)
- `.claude/skills/project-root/SKILL.md` (L19 path reference)
- `.claude/skills/signal-dashboard/dashboard-protocol.md` (L42)
- `docs/agents/dev-team/flow/execute-tier.md` (L69)

**Step M-4 — Update docker-compose.yml volume mounts (ops task):**

The existing brief (2026-06-01-dashboard-state-sync.md §3) noted that
`docs/pipeline-state.json` is NOT currently mounted in the mcp-server container.
After the rename, the future ops mount target must be:
```yaml
- ./docs/data/orch/pipeline-state.json:/app/docs/data/orch/pipeline-state.json:ro
```
(This mount is part of the dashboard-state-sync sprint, not a blocker for the rename.)

**Step M-5 — Update file-size-caps.json if a cap is added for orch/ files.**
Current `file-size-caps.json` has no cap on `docs/pipeline-state.json` (data JSON is
explicitly excluded from governance). No change needed to caps.

**Atomicity rule:** M-1 + M-2 + M-3 must land in ONE commit. A split commit leaves the
schema test broken between commits. M-4 and M-5 can be separate commits (non-breaking).

---

## 3. Markdown Generation — Who, When, and the Human Workflow Change

### 3.1 Who renders

Two separate renderers — one per generated file:

| Generated file | Renderer | Trigger |
|---|---|---|
| `docs/TASKS.md` | PO agent (existing write step) | At every PO TASKS.md write, emit JSON-first to `docs/data/orch/task-board.json`, then render Markdown from JSON |
| `docs/signals/DASHBOARD.md` | signal-dashboard SKILL (§WRITE step) | At every SKILL §WRITE call, emit JSON-first to `docs/data/orch/signal-queue.json`, then render Markdown from JSON |

Both renderers follow **JSON-first, Markdown-second**: write the JSON atomically, then
regenerate the Markdown. If Markdown render fails, the JSON is still correct (safe fallback).

### 3.2 When (cadence)

- `task-board.json` is updated whenever PO writes TASKS.md — typically at sprint start,
  task close, or backlog triage. Cadence: several times per day.
- `signal-queue.json` is updated whenever any agent appends a DASHBOARD row via the
  signal-dashboard SKILL §WRITE step. Cadence: roughly every agent cycle (hourly).
- Both are **event-driven**, not cron-driven. No separate :07 janitor is needed for these.

### 3.3 The human workflow change — honest cost assessment

**This is a real workflow change with real costs. Both must be stated clearly.**

**Before:** Humans and agents hand-edit `docs/TASKS.md` and `docs/signals/DASHBOARD.md`
directly using a text editor or file write. The files are the canonical source.

**After:** Neither file may be hand-edited. They are generated from JSON.
- To add a task: edit `docs/data/orch/task-board.json` (or use a form/agent command that
  writes to the JSON — a proper "PO BATCH" write goes to JSON, renderer regenerates Markdown).
- To update a signal row: the signal-dashboard SKILL writes JSON-first; manual status
  updates (e.g., READ → RESOLVED) must go through a dedicated skill invocation or a
  direct JSON edit followed by a renderer pass — NOT a Markdown edit.

**Costs:**
1. **Operator friction.** The operator currently reads DASHBOARD.md directly for a quick
   status scan. That reading experience is unchanged (Markdown view still exists, still
   readable). The write path changes: the operator cannot hand-fix a status cell in the
   Markdown — they must know to edit the JSON or call the SKILL.
2. **Agent migration scope.** Every agent that currently reads `docs/TASKS.md` for task
   discovery (dev-team Step 0b/Step 1, system-auditor D4, janitor R-3) has been
   reading the Markdown. After consolidation, they should read `task-board.json` instead
   (simpler: jq-queryable, no Markdown table parser needed). The `parseTasksMd` function
   in `tasksMdJanitorJob.ts:L102` becomes vestigial once the janitor reads JSON.
3. **Bootstrap period risk.** Until all agent writes go through JSON-first renderers,
   both files can exist in temporarily inconsistent states. Must enforce: old Markdown
   writes are gated out before enabling read-from-JSON. Do NOT run both paths simultaneously.

**Mitigation:** Run a one-sprint hardening period where JSON is written alongside Markdown
(JSON written first; Markdown still written as before) before flipping readers to the JSON.
This surfaces any renderer gap without breaking agent operations.

---

## 4. Hard Constraint Compliance Check

| Constraint | How satisfied |
|---|---|
| HC-1: frontend → api-gateway only | Unchanged. `GET /api/orchestration/*` endpoints in mcp-server are reached via api-gateway `/api/*` catch-all, exactly as in the prior brief. |
| HC-2: no raw signal payloads in HTTP | `signal-queue.json` schema excludes payload blobs; only `summary` (≤120 chars) and `payload_ref` (path pointer) are stored. HTTP endpoint reads only from this JSON. DASHBOARD.md raw cells never parsed in HTTP handler. |
| HC-3: no secret leakage | `docs/data/orch/` contains only structural orchestration state (task IDs, statuses, summaries). No `.env` keys, no Telegram channel IDs, no VPS credentials. Volume mount scope: `docs/data/orch/` only. |
| HC-4: :07 RETURN write contract | Preserved verbatim. The only change is the file path (`docs/data/orch/pipeline-state.json`). The write template in `agent-chaining-protocol.md § PIPELINE_STATE_WRITE` is updated to the new path as part of M-3. Schema v2 fields unchanged. |

---

## 5. Task Batch for PM

### OSC-1 — Create `docs/data/orch/` and define schemas (agent-father)

```
zone: docs/ (agent-father only — no code)
action:
  - Create docs/data/orch/ directory
  - Define docs/data/orch/task-board.json (schema v1, empty initial state)
  - Define docs/data/orch/signal-queue.json (schema v1, empty initial state)
  - DO NOT move pipeline-state.json yet (wait for OSC-2)
ac:
  - OSC-1-AC1: jq . on both new files exits 0
  - OSC-1-AC2: Both files have _schema, _ssot, _updated_at, _updated_by fields
sequencing: FIRST — must land before OSC-2
```

### OSC-2 — Migrate `pipeline-state.json` path (atomic: code + agent files)

```
zone: apps/mcp-server/ + docs/ (dev-mcp-server + agent-father — coordinated)
action:
  - git mv docs/pipeline-state.json docs/data/orch/pipeline-state.json
  - Update 1837a-pipeline-state.test.ts:L16 (new resolve path)
  - Update tasksMdJanitorJob.ts:L309 (new resolve path)
  - Update all 13 agent/skill/flow file references (§2.3 list — agent-father)
  - One atomic commit covering all changes
ac:
  - OSC-2-AC1: bun test 1837a-pipeline-state exits 0 (file found at new path)
  - OSC-2-AC2: grep -r "docs/pipeline-state.json" (old path) → 0 matches in repo
  - OSC-2-AC3: git mv shows R100 rename, no new file creation
sequencing: After OSC-1. Code + agent files must commit together — no split commit.
risk: HIGHEST. Serialize. Run bun test before committing.
```

### OSC-3 — Add JSON-first renderer to signal-dashboard SKILL (agent-father)

```
zone: .claude/skills/signal-dashboard/ (agent-father only)
action:
  - In SKILL.md §WRITE: before appending DASHBOARD.md row, write/update the
    corresponding row in docs/data/orch/signal-queue.json (JSON-first invariant)
  - Renderer: append row to signal-queue.json `rows[]` array; update _updated_at/_updated_by
  - Do NOT change DASHBOARD.md write logic yet (hardening period — run both paths)
ac:
  - OSC-3-AC1: After a signal-dashboard §WRITE call, signal-queue.json contains the
               new row with correct fields; jq . exits 0
  - OSC-3-AC2: DASHBOARD.md still updated as before (no regression)
sequencing: After OSC-1. Independent of OSC-2.
```

### OSC-4 — Add JSON-first renderer to PO TASKS.md write (agent-father)

```
zone: docs/agents/po/flow/ (agent-father only)
action:
  - In PO's TASKS.md write step: before writing TASKS.md, write/update task-board.json
    from the same data (JSON-first invariant)
  - Hardening period: TASKS.md still written as before
ac:
  - OSC-4-AC1: After a PO TASKS.md update, task-board.json reflects the same sprint/task state
  - OSC-4-AC2: TASKS.md unchanged (no regression)
sequencing: After OSC-1. Independent of OSC-2/3.
```

### OSC-5 — Flip readers to JSON (after hardening period) — DEFERRED

```
NOT scheduled in this sprint. Conditions to release gate:
  - OSC-3 + OSC-4 proven in ≥3 consecutive PO/signal writes (human-verified JSON correctness)
  - parseTasksMd in tasksMdJanitorJob.ts can be replaced with jq read of task-board.json
  - system-auditor D4 R-3 step reads task-board.json instead of TASKS.md
  - TASKS.md and DASHBOARD.md become truly read-only generated output
  - Operator acknowledged: hand-editing those files is no longer valid after this gate
Gate owner: PO. Release only after explicit PO sprint sign-off.
```

### OSC-6 — Docker-compose volume mount update (ops)

```
zone: docker-compose.yml (ops)
action:
  - Change the future pipeline-state.json mount target (for dashboard-state-sync sprint)
    from ./docs/pipeline-state.json to ./docs/data/orch/pipeline-state.json
  - Add mounts for task-board.json and signal-queue.json when dashboard-state-sync sprint runs
sequencing: After OSC-2 lands. Blocking only for dashboard-state-sync sprint, not OSC-1/3/4.
```

---

## 6. Sequencing Diagram

```
OSC-1 (create orch/)
  ├─→ OSC-2 (migrate pipeline-state path) — code + agent-files atomic
  ├─→ OSC-3 (signal-queue JSON renderer) — independent
  └─→ OSC-4 (task-board JSON renderer) — independent

OSC-2 + OSC-3 + OSC-4 all done → hardening period (≥3 live writes each)
  └─→ OSC-5 (flip readers) — deferred, PO-gated

OSC-2 done → OSC-6 (volume mount) — ops, non-blocking
```

---

## 7. Risk Flags

**RISK-1 (HIGHEST — split-commit breaks test):** OSC-2 must be ONE atomic commit across
code files and agent/protocol files. Any split leaves `1837a-pipeline-state.test.ts`
pointing at the old path while the file is at the new path → test fails → container
rebuild fails. Mitigation: dev-mcp-server and agent-father coordinate on the same commit.
In practice: agent-father does the agent-file replacements, dev-mcp-server does the code
replacements, one committer assembles both changesets before committing.

**RISK-2 (HIGH — parallel-write during migration window):** Between OSC-2 landing and
all agent sessions reloading, a concurrent agent may write `docs/pipeline-state.json`
(old path). New file at old path = phantom file, test passes but janitor reads wrong location.
Mitigation: run OSC-2 off-peak (after market close, no active agent sessions); verify
`ls docs/pipeline-state.json` returns ENOENT after migration.

**RISK-3 (MED — renderer false-green):** OSC-3/4 renderers that write JSON silently may
produce invalid JSON on edge-case payload (e.g., summary with unescaped quotes from DASHBOARD).
Mitigation: renderer must `jq . < signal-queue.json > /dev/null || ERROR` as a post-write
guard (fail-loud-protocol). Do NOT treat write-success as JSON-valid.

**RISK-4 (MED — operator workflow confusion):** Operator habit of hand-editing TASKS.md
or DASHBOARD.md will silently overwrite generated content on the next renderer run.
Mitigation: add a generated-file header comment to both files:
`<!-- GENERATED FILE — edit docs/data/orch/task-board.json instead — changes here will be overwritten -->`.
Do this in OSC-4/OSC-3 before the hardening period begins, not at OSC-5.

**RISK-5 (LOW — caps governance):** `docs/data/orch/*.json` are data JSON files.
`file-size-caps.json` explicitly excludes "Code and data JSON" from governance. No cap
entry needed. Signal-queue.json can grow unboundedly — add a pruning policy (max 200 rows,
archive RESOLVED+READ rows > 7 days) to the signal-dashboard SKILL in OSC-3.

---

_Brief owner: agents-architect. Implementation: route OSC-1/3/4/5 to agent-father; OSC-2 to dev-mcp-server + agent-father; OSC-6 to ops._
