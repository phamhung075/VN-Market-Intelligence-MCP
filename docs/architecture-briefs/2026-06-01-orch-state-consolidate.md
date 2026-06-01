<!-- size-justification: 420L — operator-directed design brief (ORCH-STATE-CONSOLIDATE v2). Covers: TASKS.md+DASHBOARD.md full deletion decision with complete reader inventory (file:line citations for every process that reads either file), single-file vs N-file concurrency analysis, exact write protocol, migration plan for all readers, and all hard constraints. All content is load-bearing for PM → agent-father handoff. -->

# Architecture Brief — ORCH-STATE-CONSOLIDATE v2 (Full Deletion + Single JSON SSOT)

**Date:** 2026-06-01
**Author:** agents-architect
**Status:** DESIGN COMPLETE v2 — operator refinement incorporated — handoff to PM / agent-father
**Operator direction v2:** TASKS.md and DASHBOARD.md deleted entirely. ONE single JSON SSOT file.

---

## 0. Scope & Constraint Summary

Hard constraints (all preserved):
- **HC-1:** Frontend accesses orchestration state via `api-gateway:4000` only — no direct file reads.
- **HC-2:** Raw signal payloads never exposed in HTTP responses.
- **HC-3:** No secret leakage via any new endpoint.
- **HC-4:** The `:07 RETURN write contract` (every dev-team agent writes pipeline-state before returning) is preserved verbatim. Schema must not break `tasksMdJanitorJob.ts` + `1837a-pipeline-state.test.ts` without an atomic same-commit migration.

**v2 changes from v1:**
1. TASKS.md and DASHBOARD.md are **deleted**, not kept as generated views.
2. The three JSON files (pipeline-state / task-board / signal-queue) are **merged into one** `docs/data/orch/orch-state.json`.

---

## 1. CHANGE 1 — Full Deletion of TASKS.md and DASHBOARD.md

### 1.1 Complete Reader Inventory

Before deletion is safe, every process that reads either file as input must be identified and re-pointed.

#### TASKS.md readers

| Reader | File | Line(s) | Read type | Migration |
|---|---|---|---|---|
| Janitor R-3 owner/status cross-check | `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` | L308, L366–413 | `readFile(tasksMdPath)` → `parseTaskRows()` | Replace with `jq .task_board.tasks[]` read from `orch-state.json` (§1.3) |
| Janitor R-4 concurrent-commit detection | `tasksMdJanitorJob.ts` | L421 | `git log -- docs/TASKS.md` | Replace with `git log -- docs/data/orch/orch-state.json`; concurrent-write alarm remains valid on the unified file |
| Daily dashboard task counts | `apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts` | L495–497 | `fs.readFileSync(tasksPath)` → `parseTaskCounts()` | Replace `parseTaskCounts()` with a jq count of `orch-state.json .task_board` tasks by status |
| Daily dashboard test fixture | `apps/mcp-server/src/__tests__/1854a-daily-dashboard-job.test.ts` | L47–113 | inline `TASKS_MD` string → `parseTaskCounts()` | Replace test fixture + function with JSON-based count; same assertions |
| System-auditor D4 TASKS.md cross-check | `docs/agents/system-auditor/audit-dimensions.md` | L41–69, L86–128 | agent reads markdown | Re-point to `orch-state.json` `.task_board.tasks[]` (jq); D4-R3/R4 logic unchanged, only input path changes |
| System-auditor handlers R-3 | `docs/agents/system-auditor/handlers.md` | L48–121 | agent reads markdown | Same: re-point all `docs/TASKS.md` refs to `orch-state.json` |
| PM flow — gate + planning + status update | `docs/agents/pm/flow/main.md` | L39–88 | agent reads/writes markdown | All PM writes go to `orch-state.json` `.task_board`; wc-l gate becomes `jq '.task_board.tasks | length'` check |
| PM flow — task-archive sub-flow | `docs/agents/pm/flow/task-archive.md` | L3–45 | agent reads/writes markdown | Archive logic operates on `orch-state.json`; archived tasks move to `.task_board.archive[]`; `docs/TASKS_ARCHIVE.md` also deleted |
| PM init.md | `docs/agents/pm/init.md` | L7, L12, L17, L32, L83, L96–97 | capability declarations | Agent-father: replace all `docs/TASKS.md` references with `docs/data/orch/orch-state.json` |
| PO flow — sprint signoff | `docs/agents/po/flow/sprint-signoff.md` | L18, L43 | agent reads/writes | Re-point to `orch-state.json` |
| PO flow — channel-audit | `docs/agents/po/flow/channel-audit.md` | L52–95 | agent reads/writes | Re-point grep to jq query |
| PO flow — triage-signals | `docs/agents/po/flow/triage-signals.md` | L14, L18 | agent reads/writes | Re-point `docs/TASKS.md` scans to jq on `orch-state.json` |
| PO flow — triage-tnb | `docs/agents/po/flow/triage-tnb.md` | L11 | agent reads | Re-point |
| PO flow — telegram-reports | `docs/agents/po/flow/telegram-reports.md` | L74–91 | agent reads/writes | Re-point grep to jq |
| PO flow — main | `docs/agents/po/flow/main.md` | L9, L20, L69, L90, L98 | agent reads | Re-point |
| PO flow — market-group | `docs/agents/po/flow/market-group.md` | L12 | agent reads | Re-point |
| PO init.md | `docs/agents/po/init.md` | L89–90 | capability declarations | Agent-father: replace references |
| Developer flow — main | `docs/agents/developer/flow/main.md` | L49, L138 | agent reads/writes status | Re-point to `orch-state.json` task status update |
| Developer flow — microservice-main | `docs/agents/developer/flow/microservice-main.md` | L51, L152 | agent reads/writes status | Re-point |
| Developer init.md | `docs/agents/developer/init.md` | L27 | SSOT reference | Re-point |
| Fixer flow — main | `docs/agents/fixer/flow/main.md` | L12, L25, L92 | agent reads/writes status | Re-point |
| Anomaly-task-bridge skill | `.claude/skills/anomaly-task-bridge/SKILL.md` | L29–30, L47, L71–81, L97–98 | READS DASHBOARD.md + TASKS.md | Re-point DASHBOARD read to `orch-state.json .signal_queue.rows`; TASKS.md dedup check to `orch-state.json .task_board.tasks[]` |
| Signal-dashboard skill | `.claude/skills/signal-dashboard/SKILL.md` | All §WRITE/§READ/§PRUNE steps | writes DASHBOARD.md | Entire skill re-targets `orch-state.json .signal_queue`; §WRITE appends to `.signal_queue.rows[]`; §READ uses jq delta; §PRUNE archives resolved rows |
| Signal-dashboard dashboard-protocol | `.claude/skills/signal-dashboard/dashboard-protocol.md` | L40–103 | reads/writes DASHBOARD.md | Full re-target to `orch-state.json` |
| Commit skill | `.claude/skills/commit/SKILL.md` | L21, L39 | references TASKS.md path | Update references to `orch-state.json` |
| Dispatch skill | `.claude/skills/dispatch/SKILL.md` | L66–97 | references TASKS.md as handoff target | Update references |
| Cron-detect-loop skill | `.claude/skills/cron-detect-loop/SKILL.md` | L25 | references TASKS.md BACKLOG | Re-point |
| Doc-heal-system skill | `.claude/skills/doc-heal-system/SKILL.md` | L33 | `TASKS.md ≤80` cap check | Remove cap (TASKS.md gone); no replacement needed |
| Doc-heal-system phases | `.claude/skills/doc-heal-system/phases.md` | L67 | `TASKS.md` cap + archive trigger | Remove |
| Doc-heal-system reference | `.claude/skills/doc-heal-system/reference.md` | L44 | `wc -l TASKS.md` | Remove |
| Token-economy skill | `.claude/skills/token-economy/SKILL.md` | L39 | "Done row = LITE" | Update to reference `orch-state.json` done tasks |
| Token-economy policies | `.claude/skills/token-economy/policies.md` | L7 | "docs/TASKS.md entries" | Update reference |
| Project-root skill | `.claude/skills/project-root/SKILL.md` | L20 | path reference | Update to `orch-state.json` path |
| Anti-hallucination skill | `.claude/skills/anti-hallucination/SKILL.md` | L70 | `NO docs/TASKS.md` rule | Update: `NO docs/TASKS.md` → valid, add `docs/data/orch/orch-state.json` as allowed |
| Agent-chaining-protocol | `docs/protocols/agent-chaining-protocol.md` | L73, L127 | SSOT list | Replace `docs/TASKS.md` with `docs/data/orch/orch-state.json` |
| Execute-tier flow | `docs/agents/dev-team/flow/execute-tier.md` | L69 | shared-SSOT list | Replace `TASKS.md` with `orch-state.json` |
| Docker deployment runbook | `docs/protocols/docker-deployment-runbook.md` | L125 | ops instruction | Replace |
| Cowork master cron runbook | `docs/protocols/cowork-master-cron-runbook.md` | L214 | task reference | Replace |
| Smart-compact protocol | `docs/protocols/smart-compact-protocol-offload.md` | L26, L52 | pm reference | Replace |
| Dev standards policy | `docs/policies/dev-standards.md` | L87 | SSOT list | Replace |
| Docs-org-enforcement policy | `docs/policies/docs-organization-enforcement.md` | L57, L77 | file registry + exclusion | Remove `TASKS.md` entry; no replacement (file deleted) |
| Docs-org-location-table | `docs/policies/docs-organization-location-table.md` | L12 | location table | Remove row; add `orch-state.json` row |
| PM bundle reference | `docs/references/bundles/bundle-pm.md` | L21 | cap reference | Update |
| Agent roster | `docs/references/agent-roster.md` | L30 | PM description | Update |
| Workflow map | `docs/references/workflow-map.md` | L93, L131 | flow table | Update |
| Workflow map cycles | `docs/references/workflow-map-cycles.md` | L77 | cycle reference | Update |
| Agent spawn template | `docs/references/agent-spawn-template.md` | L68, L76, L108 | spawn examples | Update |
| Agent notebook protocol | `docs/protocols/agent-notebook-protocol.md` | L45 | decision pointer | Update |

#### DASHBOARD.md readers

| Reader | File | Line(s) | Read type | Migration |
|---|---|---|---|---|
| ImprovementSignalWriter | `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` | L30, L252–261 | `DASHBOARD_PATH` constant; `appendDashboardRow()` | Re-point `DASHBOARD_PATH` to `orch-state.json`; `appendDashboardRow()` → JSON array append |
| ImprovementSignalWriter test | `apps/mcp-server/src/__tests__/1948d-improvement-signal-writer.test.ts` | L187, L324 | tmpDir DASHBOARD.md fixture | Update test fixture to use `orch-state.json` JSON structure |
| tasksMdJanitorJob DASHBOARD write | `tasksMdJanitorJob.ts` | L210–259, L443, L464 | `appendDashboardRow()` | Re-point to JSON append helper |
| CoordinationTools doc string | `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | L71 | doc string only — NOT a file read | Update string; no behavior change |
| System-auditor tool-package | `docs/agents/tools/package/system-auditor.md` | L11–12, L139–140 | capability declaration | Re-point to `orch-state.json` |
| Anomaly-task-bridge skill | `.claude/skills/anomaly-task-bridge/SKILL.md` | L4–5, L29–30, L71, L81, L97 | READS DASHBOARD.md | (already listed above) |
| Signal-dashboard skill + protocol | (already listed above) | — | — | — |
| Dev-team drain-signals | `docs/agents/dev-team/flow/drain-signals.md` | L6, L16–62 | reads + writes DASHBOARD.md | Re-point to `orch-state.json .signal_queue` |
| Dev-team main flow | `docs/agents/dev-team/flow/main.md` | L18, L62 | reads + writes DASHBOARD.md | Re-point |
| Dev-team post-cycle | `docs/agents/dev-team/flow/post-cycle.md` | L20 | writes DASHBOARD.md | Re-point |
| PM flow — DASHBOARD write guard | `docs/agents/pm/flow/main.md` | L117–133 | reads pipeline-state, writes DASHBOARD.md | Guard logic unchanged; write target → `orch-state.json .signal_queue` |
| PO triage-signals | `docs/agents/po/flow/triage-signals.md` | L14, L18 | writes DASHBOARD.md rows | Re-point to `orch-state.json .signal_queue` |
| System audit runbook | `docs/protocols/system-audit-runbook.md` | L147 | DASHBOARD reference | Update |
| Cowork master cron runbook | `docs/protocols/cowork-master-cron-runbook.md` | L215 | DASHBOARD reference | Update |
| Dispatch skill | `.claude/skills/dispatch/SKILL.md` | L93 | DASHBOARD reference | Update |

#### No-blocker verdict

Every reader above has a clean migration path: replace file path + Markdown parser with jq query on `orch-state.json`. No reader requires TASKS.md or DASHBOARD.md to exist as a Markdown file for functional reasons. **Deletion is safe after migration.**

### 1.2 What gets deleted

```
docs/TASKS.md                    — deleted (replaced by orch-state.json .task_board)
docs/TASKS_ARCHIVE.md            — deleted (replaced by .task_board.archive[])
docs/signals/DASHBOARD.md        — deleted (replaced by orch-state.json .signal_queue)
docs/signals/DASHBOARD_ARCHIVE.md — deleted (replaced by .signal_queue.archive[])
docs/SPRINT_GOAL.md              — deleted (replaced by orch-state.json .sprint_goal) [OSC-1 operator extension]
```

The PM TASKS.md write steps (creation, status update, archive) and the signal-dashboard SKILL write steps are the **writers** — they are replaced by JSON writes to `orch-state.json` in-place. This confirms deletion is safe: once writers are migrated, the files are never regenerated.

---

### 1.3 SPRINT_GOAL.md readers — OSC-2 migration inventory

OSC-1 operator scope extension: `docs/SPRINT_GOAL.md` joins the consolidation. All readers below must be re-pointed to `orch-state.json .sprint_goal.entries[]` (jq) in OSC-2.

| Reader | File | Line(s) | Read type | Migration | Clean? |
|---|---|---|---|---|---|
| SPRINT_GOAL.md regression test | `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts` | L15–16, L24–25 | `readFileSync(join(ROOT, "docs/SPRINT_GOAL.md"))` + header-regex check | Replace `readFileSync` path + regex with `jq '.sprint_goal.entries[0].sprint_id'` assertion on `orch-state.json`; update the ">= 1338" check to verify the first active sprint_id; second test already `it.skip` (comment says no Retrospective section) — verify skip still valid | CLEAN — no behavioral dependency, path update + regex swap |
| PO init.md — capability declaration | `docs/agents/po/init.md` | L30, L89, L90 | capability declarations | Replace `docs/SPRINT_GOAL.md` refs with `docs/data/orch/orch-state.json .sprint_goal` | CLEAN |
| PO flow — sprint-kickoff | `docs/agents/po/flow/sprint-kickoff.md` | L15, L49, L50 | agent writes SPRINT_GOAL.md | Re-point write target to `orch-state.json .sprint_goal.entries[]`; append/upsert pattern per §2.3 atomic write | CLEAN |
| PO flow — sprint-signoff | `docs/agents/po/flow/sprint-signoff.md` | L18 | agent reads/writes | Re-point `docs/SPRINT_GOAL.md` (mark sprint Done) to update `orch-state.json .sprint_goal.entries[].status` | CLEAN |
| PO flow — main | `docs/agents/po/flow/main.md` | L12 | agent reads | Re-point vision source to `orch-state.json .sprint_goal` | CLEAN |
| BA init.md | `docs/agents/ba/init.md` | L91 | capability declaration input | Re-point `docs/SPRINT_GOAL.md` → `docs/data/orch/orch-state.json` | CLEAN |
| BA flow — main | `docs/agents/ba/flow/main.md` | L6, L21, L36 | agent reads vision | Re-point | CLEAN |
| Architect init.md | `docs/agents/architect/init.md` | L95 | capability declaration input | Re-point | CLEAN |
| System-auditor flow | `docs/agents/system-auditor/flow/main.md` | L313 | enforces ≤30 lines cap | Remove cap check (file deleted); no replacement (`.sprint_goal.entries[]` count replaces line-length cap: enforce `entries[] count ≤ 15` or remove entirely) | CLEAN — remove the cap enforcement step for SPRINT_GOAL.md |
| System-auditor init.md | `docs/agents/system-auditor/init.md` | L13 | capability declaration | Remove `SPRINT_GOAL.md` from cap-enforcement list | CLEAN |
| Claude-manager-helper flow | `docs/agents/claude-manager-helper/flow/main.md` | L41, L83, L84 | GROUP_ROOT member; cap check ≤30 | Remove from GROUP_ROOT; remove `SPRINT_GOAL.md > 30` cap check | CLEAN |
| Claude-manager-helper init.md | `docs/agents/claude-manager-helper/init.md` | L35 | Sprint file size caps list | Remove `docs/SPRINT_GOAL.md <30` entry | CLEAN |
| Doc-heal-system SKILL | `.claude/skills/doc-heal-system/SKILL.md` | L33 | Size cap table entry `SPRINT_GOAL.md ≤30` | Remove row; no replacement | CLEAN |
| Doc-heal-system phases | `.claude/skills/doc-heal-system/phases.md` | L52, L68 | Pointer to SPRINT_GOAL.md + cap | Remove both rows | CLEAN |
| Doc-heal-system reference | `.claude/skills/doc-heal-system/reference.md` | L44 | `wc -l … docs/SPRINT_GOAL.md` | Remove from wc command | CLEAN |
| Dispatch skill | `.claude/skills/dispatch/SKILL.md` | L66 | references `docs/SPRINT_GOAL.md` as PO output | Re-point to `orch-state.json .sprint_goal` | CLEAN |
| Docs-org-enforcement policy | `docs/policies/docs-organization-enforcement.md` | L15, L55, L75 | file registry + exclusion rule + find-exclusion | Remove `SPRINT_GOAL.md` from registry; add `orch-state.json .sprint_goal` entry | CLEAN |
| Docs-org-location-table | `docs/policies/docs-organization-location-table.md` | L11 | location table row | Remove row; add `sprint_goal section` pointer row to orch-state.json | CLEAN |
| Agent-notebook protocol | `docs/protocols/agent-notebook-protocol.md` | L45 | "→ docs/TASKS.md / SPRINT_GOAL.md" pointer | Re-point to `orch-state.json` | CLEAN |

**No-blocker verdict:** All 19 reader sites have clean migration paths. The test at `1338-sprint-goal-retrospective.test.ts` is the only code reader — it does a simple `readFileSync` + regex check with no behavioral side effects; the migration is a path swap + assertion rewrite with no functional risk. `docs/SPRINT_GOAL.md` deletion is safe after all writers/readers migrated in OSC-2.

---

## 2. CHANGE 2 — Single JSON SSOT: Concurrency Analysis

### 2.1 Honest concurrency audit

The v1 brief rejected merging into one file citing a "concurrent-write hazard." This section re-evaluates that claim honestly under WIP<=2 + commit-mutex + atomic-write discipline.

**Write cadences per section:**

| Section | Writers | Cadence | Concurrent? |
|---|---|---|---|
| `.head` (pipeline-state) | dev-team pipeline agents (developer, qa, fixer, pm, architect, ba, po) | At agent RETURN — sequential, serialized through `commit-mutex` | Never concurrent: commit-mutex enforces one git commit at a time across ALL agents |
| `.task_board` | PM agent only | At sprint planning, tier completion, task status update | Single writer per session; PM is spawned sequentially by dev-team dispatch |
| `.signal_queue` | signal-dashboard SKILL callers (any agent) | At any agent cycle — but serialized through `dashboard-row` task_claim lock | `task_claim(task_kind: "dashboard-row")` serializes concurrent SKILL calls |

**Real concurrency at :07 RETURN under WIP=2:**

WIP_MAX=2 means at most 2 developer agents run in parallel. BUT: both write pipeline-state at RETURN, and the commit-mutex (`task_claim(task_kind: "commit-mutex")`) serializes those git commits. The file-write itself is done by whichever agent holds the mutex — the second agent waits, then writes fresh. This is sequential file access, not concurrent.

TASKS.md writes (PM) and pipeline-state writes (developer/qa/fixer at RETURN) are in **different pipeline phases**: TASKS.md is updated during planning (Step 2) or after tier completion (Step 3), not during developer execution. A developer at RETURN writing pipeline-state and a PM updating task status would both require the commit-mutex — they serialize naturally.

**Conclusion:** Under the existing WIP<=2 + commit-mutex + `dashboard-row` lock discipline, the REAL number of simultaneous writers to any section is **1 at a time**. The "concurrent-write hazard" cited in v1 was overstated. The only genuine risk is a **code-level race** if two processes (e.g., the daily cron job and an agent) both do read-modify-write without atomic discipline.

### 2.2 Single-file verdict: SAFE — with atomic-write protocol

A single merged JSON file `docs/data/orch/orch-state.json` is safe because:

1. **Commit-mutex serializes all git commits.** Two agents cannot commit simultaneously.
2. **task_claim(dashboard-row) serializes signal queue appends.** Any caller of signal-dashboard §WRITE holds the lock.
3. **PM is single-writer for task_board** within the dev-team pipeline (sequential dispatch).
4. **The only unguarded risk** is a cron job (e.g., `tasksMdJanitorJob`) doing a direct file read-modify-write at the same instant an agent is writing. This is mitigated by the **atomic temp-file-then-rename write protocol** (§2.3).

**Honoring the operator's preference: ONE file.**

### 2.3 Atomic write protocol (mandatory for all writers)

Every writer of `orch-state.json` MUST use atomic temp-file-then-rename:

```bash
# Read current state
CURRENT=$(cat docs/data/orch/orch-state.json)

# Apply mutation (e.g., update head, append signal row, update task status)
UPDATED=$(echo "$CURRENT" | jq '...')

# Write atomically
TMP=$(mktemp docs/data/orch/.orch-state-tmp-XXXXXX.json)
echo "$UPDATED" > "$TMP"
mv "$TMP" docs/data/orch/orch-state.json   # atomic on POSIX filesystems
```

For TypeScript code writers (`tasksMdJanitorJob.ts`, `improvementSignalWriter.ts`, `dailyDashboardJob.ts`):
```typescript
import { writeFileSync, renameSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function writeOrchStateAtomic(path: string, data: object): void {
  const tmp = path + ".tmp." + Date.now();
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, path);  // atomic on POSIX
}
```

After every write: `jq . docs/data/orch/orch-state.json > /dev/null || ERROR` (fail-loud-protocol).

---

## 3. Unified Schema — `docs/data/orch/orch-state.json`

One file. Three named sections. Common envelope.

```jsonc
{
  "_schema": "v3",
  "_ssot": true,
  "_updated_at": "<ISO-8601 UTC>",
  "_updated_by": "<agent-id>",

  "head": {
    // ← UNCHANGED from current pipeline-state.json v2 schema
    // All :07 RETURN writers write ONLY this section
    "status": "idle | in_progress | blocked | stale",
    "active_task_id": null,
    "next_agent": null,
    "next_action": "<≤20-word spawn prompt suffix>",
    "wip": 0,
    "wip_max": 2,
    "updated_at": "<ISO-8601 UTC>",
    "updated_by": "<agent-id>"
  },

  "dashboard_section_cache": { ... },   // ← from current pipeline-state.json v2, unchanged
  "narrative": { ... },                 // ← from current pipeline-state.json v2, unchanged
  "session_handoff_status": { ... },    // ← from current pipeline-state.json v2, unchanged

  "task_board": {
    "_updated_at": "<ISO-8601 UTC>",
    "_updated_by": "<agent-id>",
    "active_sprints": [
      {
        "id": "<sprint-id>",
        "status": "active | paused | pending-gate",
        "tasks": [
          {
            "task_id": "<NNN[a-z]?>",
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
      { "id": "<slug>", "summary": "<≤80 chars>", "priority": "high | normal | low" }
    ],
    "archive": [
      // tasks moved here when Done sprint is closed — replaces TASKS_ARCHIVE.md
      { "task_id": "...", "title": "...", "closed_at": "<ISO>" }
    ]
  },

  "signal_queue": {
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
        "payload_ref": "<path-to-handoff-file or null>"
      }
    ],
    "archive": [
      // rows older than 7 days with status RESOLVED|READ → pruned here
    ]
  }
}
```

**Section write ownership:**
- `head` + `dashboard_section_cache` + `narrative` + `session_handoff_status`: dev-team pipeline agents (RETURN step)
- `task_board`: PM agent (planning/status steps)
- `signal_queue.rows`: signal-dashboard SKILL callers, improvementSignalWriter, tasksMdJanitorJob

**Cross-section write rule:** Any agent that updates its owned section reads the full file, modifies only its section, writes atomically (§2.3). Never overwrite a sibling section.

---

## 4. Migration Plan

### 4.1 Code migrations (dev-mcp-server)

| File | Change | Detail |
|---|---|---|
| `1837a-pipeline-state.test.ts:L16` | Path update | `"../../../../docs/pipeline-state.json"` → `"../../../../docs/data/orch/orch-state.json"` |
| `tasksMdJanitorJob.ts:L308–310` | Path + parser | `tasksMdPath` → `orchStatePath`; replace `parseTaskRows(readFile(tasksMdPath))` with `jq .task_board.tasks[]` parse; replace `appendDashboardRow(dashboardPath,...)` with JSON array append helper using atomic write |
| `tasksMdJanitorJob.ts:L421` | Git log path | `-- docs/TASKS.md` → `-- docs/data/orch/orch-state.json` |
| `dailyDashboardJob.ts:L495` | Path + parser | `tasksPath` → `orchStatePath`; replace `parseTaskCounts(fs.readFileSync(...))` with JSON count of `task_board.tasks[]` by status |
| `1854a-daily-dashboard-job.test.ts:L47–113` | Test fixture | Replace inline `TASKS_MD` markdown fixture with JSON `task_board` fixture; update `parseTaskCounts` → `countTasksFromJson` |
| `improvementSignalWriter.ts:L30` | Path constant | `DASHBOARD_PATH` → `ORCH_STATE_PATH = resolve(REPO_ROOT, "docs/data/orch/orch-state.json")` |
| `improvementSignalWriter.ts:L252–261` | Writer | `appendDashboardRow()` → `appendSignalQueueRow()` using atomic write |
| `1948d-improvement-signal-writer.test.ts:L187, L324` | Test fixture | `DASHBOARD.md` tmpfile → `orch-state.json` tmpfile with JSON structure |

**AC for code migrations:**
- `bun test 1837a-pipeline-state` exits 0 with file at new path
- `bun test 1854a-daily-dashboard` exits 0 with JSON-based fixture
- `bun test 1948d-improvement-signal-writer` exits 0 with JSON fixture
- `grep -r "docs/pipeline-state.json\|docs/TASKS.md\|docs/signals/DASHBOARD.md" apps/` → 0 functional hits (doc-string-only OK)

### 4.2 Agent/skill/protocol migrations (agent-father)

All occurrences of `docs/pipeline-state.json` → `docs/data/orch/orch-state.json` (§2.1 reader list).
All occurrences of `docs/TASKS.md` → `docs/data/orch/orch-state.json .task_board` (§1.1 reader list).
All occurrences of `docs/signals/DASHBOARD.md` → `docs/data/orch/orch-state.json .signal_queue` (§1.1 reader list).

Signal-dashboard SKILL (both `SKILL.md` and `dashboard-protocol.md`) requires a full rewrite of §WRITE/§READ/§PRUNE to operate on JSON. This is the highest-effort agent-father task.

### 4.3 File system changes

```bash
# Create directory
mkdir -p docs/data/orch/

# Migrate pipeline-state.json content into orch-state.json (expand schema to v3)
# agent-father writes the initial orch-state.json by merging current pipeline-state.json
# with empty task_board{} and signal_queue{} sections

# Delete old files (after all writers migrated)
git rm docs/pipeline-state.json
git rm docs/TASKS.md docs/TASKS_ARCHIVE.md 2>/dev/null || true
git rm docs/signals/DASHBOARD.md docs/signals/DASHBOARD_ARCHIVE.md 2>/dev/null || true
git rm docs/SPRINT_GOAL.md 2>/dev/null || true  # OSC-1 operator extension — sprint_goal now in orch-state.json .sprint_goal
```

**Atomicity rule:** The initial `orch-state.json` creation + `pipeline-state.json` deletion + ALL code path updates MUST land in ONE commit. Any split leaves `1837a-pipeline-state.test.ts` broken.

---

## 5. Hard Constraint Compliance Check

| Constraint | How satisfied |
|---|---|
| HC-1: frontend → api-gateway only | Unchanged. `GET /api/orchestration/*` routes serve data from `orch-state.json` via api-gateway. No direct file reads from frontend. |
| HC-2: no raw signal payloads in HTTP | `signal_queue.rows[].summary` is ≤120 chars; `payload_ref` is a path pointer. HTTP endpoint reads only these fields. Raw payload cells absent from schema. |
| HC-3: no secret leakage | `docs/data/orch/` contains structural orchestration state only. Volume mount scope: `docs/data/orch/` only. |
| HC-4: :07 RETURN write contract | Preserved. Writers update only the `head` / `dashboard_section_cache` / `narrative` / `session_handoff_status` sections. The write template in `agent-chaining-protocol.md § PIPELINE_STATE_WRITE` is updated to the new path. Schema v2 fields for these sections are unchanged (schema version bumps to v3 at the envelope level only). `tasksMdJanitorJob.ts` reads `task_board` section (new path, new parser) — same-commit migration required. |

---

## 6. Task Batch for PM

### OSC-1 — Create `orch-state.json` with migrated pipeline-state content (agent-father)

```
zone: docs/ (agent-father only)
action:
  - mkdir -p docs/data/orch/
  - Write docs/data/orch/orch-state.json by merging current docs/pipeline-state.json
    content + empty task_board{} + empty signal_queue{} sections; _schema: "v3"
  - Populate task_board from current docs/TASKS.md content (manual migration of open tasks)
  - Populate signal_queue from current docs/signals/DASHBOARD.md rows (manual migration of NEW rows)
  - DO NOT delete old files yet (wait for OSC-2 atomic migration)
ac:
  - OSC-1-AC1: jq . orch-state.json exits 0
  - OSC-1-AC2: orch-state.json has all 4 top-level sections (head/task_board/signal_queue/narrative)
  - OSC-1-AC3: head fields match current pipeline-state.json head block exactly
sequencing: FIRST
```

### OSC-2 — Atomic code + agent + file migration (dev-mcp-server + agent-father)

```
zone: apps/mcp-server/ + docs/ (coordinated, ONE commit)
action:
  - Update all code readers (§4.1 table — 8 file changes)
  - Update all agent/skill/protocol files (§4.2 — agent-father)
  - git rm docs/pipeline-state.json docs/TASKS.md docs/TASKS_ARCHIVE.md
    docs/signals/DASHBOARD.md docs/signals/DASHBOARD_ARCHIVE.md
    docs/SPRINT_GOAL.md  # OSC-1 operator extension — 6th markdown file retired
  - Commit atomically: ALL changes in one commit
  - Also migrate all §1.3 SPRINT_GOAL.md readers (19 sites) per the reader-migration table in §1.3
  - 1338-sprint-goal-retrospective.test.ts: replace readFileSync path → orch-state.json; update assertion to jq .sprint_goal.entries[0].sprint_id
ac:
  - OSC-2-AC1: bun test 1837a-pipeline-state exits 0
  - OSC-2-AC2: bun test 1854a-daily-dashboard exits 0
  - OSC-2-AC3: bun test 1948d-improvement-signal-writer exits 0
  - OSC-2-AC3b: bun test 1338-sprint-goal-retrospective exits 0 (new AC — operator extension)
  - OSC-2-AC4: grep -r "docs/pipeline-state.json" . → 0 matches
  - OSC-2-AC5: grep -r '"docs/TASKS.md"' . → 0 functional matches
  - OSC-2-AC6: grep -r '"docs/signals/DASHBOARD.md"' . → 0 functional matches
  - OSC-2-AC6b: grep -r '"docs/SPRINT_GOAL.md"' . → 0 functional matches (new AC — operator extension)
  - OSC-2-AC7: ls docs/pipeline-state.json docs/TASKS.md docs/signals/DASHBOARD.md docs/SPRINT_GOAL.md → all ENOENT
sequencing: After OSC-1. HIGHEST RISK — serialize, run all tests before committing.
risk: HIGHEST. Split commit leaves test suite broken and pipeline write-wedged.
```

### OSC-3 — Rewrite signal-dashboard SKILL (agent-father)

```
zone: .claude/skills/signal-dashboard/ (agent-father only)
action:
  - Rewrite SKILL.md §WRITE: append to orch-state.json .signal_queue.rows[] (atomic write)
  - Rewrite SKILL.md §READ: two-phase delta-read on orch-state.json (jq .signal_queue._updated_at + rows[])
  - Rewrite SKILL.md §PRUNE: archive rows older than 7d with status RESOLVED|READ
  - Rewrite dashboard-protocol.md to target orch-state.json
ac:
  - OSC-3-AC1: After a §WRITE call, orch-state.json .signal_queue.rows contains the new row; jq exits 0
  - OSC-3-AC2: §READ returns only NEW rows for the requesting agent
sequencing: Parallel with OSC-2 (same commit window).
```

### OSC-4 — Docker-compose volume mount update (ops)

```
zone: docker-compose.yml (ops)
action:
  - Change pipeline-state.json mount target to: ./docs/data/orch/orch-state.json:/app/docs/data/orch/orch-state.json:rw
    (rw because cron jobs write signal_queue rows)
sequencing: After OSC-2 lands. Non-blocking for agent operations.
```

---

## 7. Sequencing Diagram

```
OSC-1 (create orch-state.json, migrate content)
  └─→ OSC-2 (atomic: delete old files + update all code + all agent files) — ONE commit
        ├─ OSC-3 (rewrite signal-dashboard SKILL) — same window as OSC-2
        └─→ OSC-4 (volume mount) — ops, non-blocking
```

---

## 8. Risk Flags

**RISK-1 (HIGHEST — split commit breaks test + pipeline):** OSC-2 must be ONE atomic commit. Any split leaves `1837a-pipeline-state.test.ts` pointing at the old path and agents writing to the deleted `docs/pipeline-state.json`. Mitigation: agent-father does agent-file replacements, dev-mcp-server does code replacements, one committer assembles both changesets.

**RISK-2 (HIGH — phantom write during migration window):** Between OSC-1 (orch-state.json created) and OSC-2 (pipeline-state.json deleted), a concurrent agent may write both files. Mitigation: run OSC-2 immediately after OSC-1 in the same session, no agent cycles between them.

**RISK-3 (HIGH — signal-dashboard SKILL is used by many agents):** OSC-3 rewrites the §WRITE protocol. Any agent holding an old session and calling §WRITE after OSC-2 will write to the now-deleted DASHBOARD.md. Mitigation: OSC-3 lands in the same commit window as OSC-2; alert active agent sessions to reload.

**RISK-4 (MED — cross-section overwrite):** A writer that reads the full orch-state.json, modifies one section, and writes back can accidentally overwrite sibling sections modified by another writer between its read and write. Mitigation: enforce the atomic-write protocol (§2.3) + single-writer-per-section discipline. The commit-mutex prevents simultaneous commits; the `dashboard-row` lock prevents simultaneous signal_queue appends.

**RISK-5 (MED — JSON corruption on partial write):** A crash mid-write to orch-state.json can produce invalid JSON if not using temp-then-rename. Mitigation: §2.3 protocol mandatory; add `jq . orch-state.json > /dev/null || ERROR` post-write guard everywhere.

**RISK-6 (LOW — caps governance):** `docs/data/orch/orch-state.json` is a data JSON file, excluded from the `file-size-caps.json` governance. Signal queue can grow unboundedly — add pruning policy (max 200 rows, archive RESOLVED+READ > 7 days) to signal-dashboard SKILL §PRUNE in OSC-3.

---

## 9. Greenlight Decision Needed

**ONE remaining decision for operator:**

> **The `tasksMdJanitorJob.ts` R-3 step currently cross-checks task status in TASKS.md against the task_locks SQLite table.** After migration, this cross-check reads `orch-state.json .task_board.tasks[]` instead. The functional check is preserved.
>
> However, the D4-R4 concurrent-commit detection currently git-logs `docs/TASKS.md`. After migration, it git-logs `docs/data/orch/orch-state.json`. The alarm threshold (two commits within 30s) becomes a write-frequency alarm on the unified file — which will fire more often since `orch-state.json` is written by more agents.
>
> **Decision needed:** Should the D4-R4 concurrent-commit alarm be:
> - (A) Kept as-is on `orch-state.json` with the same 30s window — will generate more noise but catches actual race conditions on the unified file. **Default: operator takes no action, brief proceeds with (A).**
> - (B) Relaxed (60s window) or scoped to only detect simultaneous `head`-section writes — quieter but less sensitive.
>
> If no response: proceed with **(A)**.

---

_Brief owner: agents-architect. Implementation routing: OSC-1/3 → agent-father; OSC-2 → dev-mcp-server + agent-father (coordinated); OSC-4 → ops._
