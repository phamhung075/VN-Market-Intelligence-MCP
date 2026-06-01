# Architecture Brief — Orchestration State Consolidation

**Date:** 2026-06-01
**Author:** agents-architect
**Status:** DESIGN — awaiting operator greenlight
**Supersedes/amends:** `docs/architecture-briefs/2026-06-01-dashboard-state-sync.md` §7 and §10
**Cross-link:** The prior brief proposed two NEW machine-JSON twins (`docs/data/tasks-state.json`,
`docs/data/signals-state.json`) on top of three existing surfaces — making five overlapping
orchestration-state files. This brief responds to the operator pushback: "think merge all to
more clearer and dynamic." The sections below resolve that question with a firm recommendation.

---

## 1. Inventory — Five Surfaces, Precisely

### Surface 1 — `docs/pipeline-state.json`

**Format:** Machine JSON (v2 schema, `_schema: "v2"`)

**Who writes it:**
- Every dev-team pipeline agent (developer, qa, fixer, pm, architect, ba, po) at RETURN —
  mandated by `docs/protocols/agent-chaining-protocol.md:42`. This is the agent-chaining
  protocol RETURN write. Non-negotiable contract across the entire fleet.
- `scripts/agents-flow/cowork-tick-autosilent.sh:55` writes a minimal commit to it.
- `docs/agents/dev-team/flow/drain-signals.md:56` writes `dashboard_section_cache` into it
  after DASHBOARD.md drain (dev-team only).

**Who reads it (file:line evidence):**
- `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:309` — reads
  `head.activeTaskId` (AC-4 cross-check, runs in container via host-side bun test; NOT
  via docker volume mount — see §1.5 schema gap below)
- `apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts:18` — schema test that reads
  the file directly from host using a relative `../../../../` path
- `docs/agents/dev-team/flow/main.md:151` — reads ONLY the `head` block for routing at
  cycle start (~150 tokens per the comment)
- `docs/agents/dev-team/flow/drain-signals.md:56` — reads+writes `dashboard_section_cache`
- `docs/agents/pm/flow/main.md:119` — CAS guard before any DASHBOARD write (reads fresh
  each time, never cached)
- `docs/agents/system-auditor/handlers.md:42` — R-2 cross-check (`activeTaskId` vs held lock)
- `docs/agents/system-auditor/audit-dimensions.md:98` — DN-W2 mtime detection
- `docs/agents/alert-commander/flow/stage-dispatch-log.md:53` — reads
  `.currentSprint // "idle"` (v1 field — likely broken on v2 schema, see §1.5)
- `.claude/skills/signal-dashboard/dashboard-protocol.md:42` — reads
  `dashboard_section_cache` from it
- `.claude/skills/task-lock/SKILL.md:60` — reads before treating `task_claim` false as
  peer-session collision
- `.claude/skills/dispatch/SKILL.md:97` — routing guard (main terminal never writes it)

**Load-bearing fields (v2):** `head.status`, `head.active_task_id`, `head.next_agent`,
`head.updated_at`, `head.updated_by`, `dashboard_section_cache.*`, `narrative.*`

**Schema gap (CRITICAL, discovered during this audit):**
The 1837a schema test (`1837a-pipeline-state.test.ts:44`) expects legacy v1 root fields:
`status`, `currentSprint`, `activeTaskId`, `nextAgent`, `nextPrompt`, `updatedAt`,
`updatedBy`. The current file is v2 — ALL of these have moved under `head.*` (with
snake_case rename: `active_task_id` not `activeTaskId`). The test is failing silently
against the live file. The janitorJob reads `ps.activeTaskId` (camelCase) which is also
absent at root in v2. **This is a latent bug in the existing code — independent of any
consolidation work — and must be fixed regardless of which option is chosen.**

**Mounted in container:** NO. Not in `docker-compose.yml` volumes (confirmed grep). The
mcp-server container does NOT have access to `docs/pipeline-state.json` at runtime.

---

### Surface 2 — `docs/TASKS.md`

**Format:** Human-authored Markdown. Sprint boards, backlog, closed sprints. Currently 78L
(≤80-line cap tracked in `docs/data/file-size-caps.json`).

**Who writes it:**
- PO at sprint planning, mid-sprint updates, sprint closure
- PM at task decomposition
- dev-team dispatcher (inline, rare) for follow-up annotations

**Who reads it (file:line evidence):**
- `docs/agents/dev-team/flow/main.md:44` — reads at cycle start for task context
- `docs/agents/dev-team/flow/main.md:188` — session-gate: if TASKS.md empty AND no
  reports → idle
- `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:308,372` — reads and parses
  Markdown table rows (R-3 cross-check, AC-2/AC-3); the parser greps for `|` pipe-table
  rows containing task_id + owner + status
- `scripts/smoke-tasks-md-janitor.ts:246` — smoke test verifies janitor reads TASKS.md
- `docs/agents/cowork-team/flow/main.md:532` — `grep -cE` counts OPEN/IN_PROGRESS rows
  for pressure-state emitter
- `.claude/agents/system-auditor.md` — D4 probe reads TASKS.md to detect corruption
- `.claude/agents/pm.md`, `docs/agents/pm/flow/main.md` — reads for sprint context

**Load-bearing:** Sprint-block structure, `|task_id|owner|status|` table rows (machine-
parsed by janitorJob). The free-form sprint narrative is human-canonical; the pipe-table
rows are the machine-readable subset.

**Mounted in container:** NO. Not in `docker-compose.yml` volumes.

---

### Surface 3 — `docs/signals/DASHBOARD.md`

**Format:** Human-authored Markdown with per-agent pipe-table sections. Currently ~80
rows across 8+ sections. The PRUNE protocol (`docs/signals/DASHBOARD.md` is pruned by
`drain-signals.md` Step 0a-D after draining) keeps it from unbounded growth.

**Who writes it:**
- Any agent dropping a signal row — via `.claude/skills/signal-dashboard/SKILL.md`
  (WRITE protocol)
- dev-team drain writes status changes (NEW→READ/RESOLVED) and prunes
- cowork-team Step 0a drains its own section

**Who reads it (file:line evidence):**
- `docs/agents/dev-team/flow/drain-signals.md:16,18` — reads per SKILL §READ (section-
  only delta-read using `dashboard_section_cache` from pipeline-state.json)
- `docs/agents/cowork-team/flow/main.md:28,30` — same §READ protocol
- `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:310,214` — reads AND writes:
  R-5 appends `system_issue` rows to `## po` section via `appendDashboardRow()`
- `scripts/smoke-tasks-md-janitor.ts:330` — smoke test verifies janitor reads/writes it
- `.claude/agents/system-auditor.md` — Tier-1/2 audit emits DASHBOARD rows

**Load-bearing:** `## <agent>` section headers (reader sections), `| id | ts | from | type
| summary | status | payload |` table columns, `status` field (NEW/READ/RESOLVED drives
drain logic), `_Updated:` header (mtime signal for delta-read skip). The entire
cross-team signal handoff protocol depends on this structure.

**INJECTION RISK (documented, must be preserved):** Raw `payload` cells contain shell-
injection characters. Any endpoint that parses this file must strip payload fields.
Incident `feedback_signal_payload_shell_injection` is the architectural constraint here.

**Mounted in container:** NO. Not in `docker-compose.yml` volumes.

---

### Surface 4 — `docs/data/tasks-state.json` (proposed in prior brief §7)

**Status: DOES NOT EXIST YET.** This was proposed as a machine twin for TASKS.md.
It has zero consumers because it was never implemented. Including it in this inventory
only to close the loop on why the operator's pushback is correct: adding it would have
created a fifth surface with zero proven value.

---

### Surface 5 — `docs/data/signals-state.json` (proposed in prior brief §7)

**Status: DOES NOT EXIST YET.** Same situation as Surface 4 — proposed twin for
DASHBOARD.md, never built, zero consumers.

---

## 2. The Merge Question — CAN and SHOULD These Merge?

### What is actually the problem?

The operator's "merge into clearer and dynamic" request is not asking us to literally fold
five text files into one file. The real design tension is:

> The dashboard at localhost:3001 needs to show live orchestration state. Three state
> surfaces (pipeline-state.json, TASKS.md, DASHBOARD.md) exist but none are reachable
> from the container. The prior brief proposed adding TWO MORE surfaces to solve the
> container-reachability problem. The operator correctly identified this as adding
> complexity, not reducing it.

The question is: **what is the minimum, non-duplicated machine-readable projection that
a new API endpoint can serve?**

### Hard constraints on merging

1. **TASKS.md and DASHBOARD.md are human-authored by design.** Both files are written by
   humans (operator, PO) and agents using natural language. Any "merge" that destroys
   their human-readability is a regression. The 80-line cap on TASKS.md is a governance
   constraint, not a machine schema. These CANNOT become pure machine files.

2. **pipeline-state.json is the agent-chaining RETURN write.** Every dev-team agent at
   RETURN writes exactly this file. That contract is documented in
   `docs/protocols/agent-chaining-protocol.md:42`. The write target cannot be renamed or
   moved without updating 22+ agent flows. A merge that destroys this write point breaks
   the entire dev-team pipeline.

3. **The tasksMdJanitorJob and 1837a test are production code** that read
   `docs/pipeline-state.json` directly by relative host path. Any renaming of this file
   breaks those readers immediately.

4. **DASHBOARD.md's section-based structure IS the cross-team handoff protocol.** Its
   `## <agent>` sections drive drain routing. This structure cannot be collapsed without
   redesigning the signal bus.

### Option A — One unified JSON SSOT with Markdown rendered from it

**Verdict: REJECTED for this system.**

Rationale: TASKS.md is hand-authored with high-context prose (sprint narrative, follow-up
chains, human decisions). It is not a schema-driven document — it is a living document
that humans edit collaboratively with agents. Generating it from a JSON SSOT would require
a template engine, a render agent, and a human-edit → JSON → Markdown round-trip that
does not exist and would be expensive to build. The format is intentionally loose so that
PO can write rich sprint descriptions without a schema. This approach would require a
medium-large sprint (template engine + render agent + migration of 78L of prose) to
achieve the same result as Option C below.

DASHBOARD.md has the same problem: the payload cells contain free-form multi-sentence
summaries with backticks, nested refs, and unicode. Generating them from a strict JSON
schema would require sanitization and would lose expressiveness.

### Option B — Keep Markdown human-canonical, derive ONE machine projection (not two)

**Verdict: RECOMMENDED.** This is what the operator's "clearer and more dynamic" request
actually asks for.

The insight is: **there are not five surfaces — there are three surfaces and one already-
machine-readable file.** The two "proposed twins" from the prior brief never existed and
should not be created. Instead:

| Role | File | Stays? | Change? |
|---|---|---|---|
| Human task board | `docs/TASKS.md` | Yes | No |
| Human signal inbox | `docs/signals/DASHBOARD.md` | Yes | No |
| Machine pipeline head (already JSON) | `docs/pipeline-state.json` | Yes | Schema fix (§4) |
| Machine projection for dashboard | ONE new `docs/data/orch-state.json` | NEW (replaces 2 proposed twins) | Written by existing writers |

`docs/data/orch-state.json` is a SINGLE lightweight machine projection that combines:
- The pipeline head (sourced from `pipeline-state.json` — no re-parsing)
- A task-board summary (sourced by PO when writing TASKS.md — same "twin" idea but ONE file not two)
- A signal-board summary (sourced by signal-dashboard SKILL when writing DASHBOARD.md — same concept)

Three surfaces → one machine projection. The endpoint reads `orch-state.json` only.
No TASKS.md parsing in an HTTP handler. No DASHBOARD.md parsing in an HTTP handler.
Injection-safe by construction (the writer strips raw payloads, the endpoint reads the
pre-stripped JSON).

### Option C — Status quo + minimal (pipeline-state only)

**Verdict: VALID fallback, not the recommended path.**

Pipeline-state.json is already pure JSON and already has the most important signal
(what the pipeline is doing right now, WIP, next_agent). Surfacing only it requires
zero new file writes. The dashboard would show pipeline health but not task board or
signals. This is Phase 1 of any phased approach.

---

## 3. Dynamic Requirement — How the Merged Model Stays Fresh

### Current cadence

State only moves at hourly `:07` cron ticks (dev-team) or cowork 15-min ticks. There is
no sub-minute write cadence on any of these files. SSE/websocket is not warranted.

### Who updates `orch-state.json` and when

The writer is the SAME agent that already writes the source file:

| Source event | Trigger | Writer |
|---|---|---|
| Any dev-team agent RETURN | After writing pipeline-state.json | The RETURN writer atomically updates `orch-state.json.head` with a copy of `pipeline-state.json`'s `head` block |
| PO updates TASKS.md | After the TASKS.md write | PO writes `orch-state.json.tasks` (open sprint list, ≤10 items, no prose) |
| Any agent emits a DASHBOARD row | Inside signal-dashboard SKILL §WRITE | The WRITE step appends `orch-state.json.signals` with {id, agent, severity, summary (no payload), ts, status} |

**CRITICAL ORDERING CONSTRAINT:** The orch-state.json WRITE must happen as an atomic
postfix to the existing write, not as a separate agent cycle. If PO writes TASKS.md and
then fails before writing orch-state.json, the projection is stale — but the human source
is canonical and the staleness will be shown honestly (see below).

### Staleness display (never silently-OK)

The `orch-state.json` file MUST embed `_updated_at` per section:
```json
{
  "_schema": "v1",
  "pipeline": { ..., "_updated_at": "2026-06-01T20:07Z" },
  "tasks":    { ..., "_updated_at": "2026-06-01T19:07Z" },
  "signals":  { ..., "_updated_at": "2026-06-01T20:07Z" }
}
```

The frontend reuses `classifyStaleBadge` from `apps/frontend/app/domain/formatters/
stale-badge.ts` with per-section thresholds:
- `pipeline._updated_at` > 70 min → STALE amber banner (missed one :07 tick)
- `tasks._updated_at` > 4h → STALE amber (task board moves slowly)
- `signals._updated_at` > 70 min → STALE amber

**A section that has never been written shows a "NO DATA" gray banner, not a false green.**
The initial state of `orch-state.json` (before first write) must have
`_updated_at: null` per section, which `classifyStaleBadge` must map to NO-DATA.

---

## 4. Schema Gap Fix — Pre-requisite to Everything

The 1837a test currently fails against the live v2 file. The janitorJob reads
`ps.activeTaskId` (camelCase, root) which does not exist in v2 (`head.active_task_id`).
The alert-commander flow reads `.currentSprint` (root, absent in v2).

**This fix is NOT optional and NOT blocked on the consolidation decision.** It must be done
first regardless. It is a dev-mcp-server + agent-father task:

1. Fix `1837a-pipeline-state.test.ts` to read `head.status`, `head.active_task_id`,
   `head.updated_at` instead of legacy root fields.
2. Fix `tasksMdJanitorJob.ts:332` to read `ps.head?.active_task_id ?? ps.activeTaskId`
   (v2-first with v1 fallback for graceful migration).
3. Fix `alert-commander/flow/stage-dispatch-log.md:53` to read
   `.head.status // "idle"` instead of `.currentSprint // "idle"`.
4. Fix `smoke-task-lock-phase3.ts:450-452` which checks for `status`, `nextAgent`,
   `updatedAt` at root — update to `head.status`, `head.next_agent`, `head.updated_at`.

These are all in-place fixes, no file rename, no schema change.

---

## 5. Hard Constraints — Preservation Checklist

| Constraint | How the recommended design preserves it |
|---|---|
| pipeline-state.json RETURN write contract | Unchanged. Agents still write pipeline-state.json. The new orch-state.json write is an additive postfix, not a replacement. |
| api-gateway-only rule (frontend never calls microservice ports directly) | Unchanged. Frontend → api-gateway:4000 → mcp-server:3000 → reads orch-state.json |
| No docs/ bind-mount into frontend | Unchanged. orch-state.json is in docs/data/ and is volume-mounted exactly like daily-dashboard.json (already mounted at line 21 of docker-compose.yml pattern) |
| No TASKS.md/DASHBOARD.md parsing in HTTP handler | Enforced by design. The endpoint reads ONLY orch-state.json (pre-stripped JSON). It never touches TASKS.md or DASHBOARD.md. |
| Signal payload injection prevention | Enforced at write time: the signal-dashboard SKILL §WRITE strips payload fields before writing to orch-state.json.signals. The endpoint never sees raw payloads. |
| tasksMdJanitorJob reads pipeline-state.json | Unchanged (plus the schema fix from §4). The janitor never reads orch-state.json. |
| 1837a schema test | Fixed as part of §4 schema gap fix. |
| agent-chaining-protocol RETURN write | Unchanged. pipeline-state.json is still the RETURN target. orch-state.json is an additional postfix write, not a substitute. |
| cowork agents must NOT write pipeline-state.json | Unchanged. The agent-chaining-protocol prohibition still holds. Cowork agents write DASHBOARD.md; the signal-dashboard SKILL handles the orch-state.json.signals update as part of the same WRITE call. |

---

## 6. Proposed `docs/data/orch-state.json` Schema

```json
{
  "_schema": "v1",
  "_maintained_by": "pipeline-state RETURN writers + PO TASKS.md write + signal-dashboard SKILL WRITE",
  "pipeline": {
    "_updated_at": null,
    "status": "idle",
    "active_task_id": null,
    "next_agent": null,
    "wip": 0,
    "wip_max": 2
  },
  "tasks": {
    "_updated_at": null,
    "open_sprints": [],
    "backlogs_summary": "",
    "item_count": 0
  },
  "signals": {
    "_updated_at": null,
    "rows": []
  }
}
```

`signals.rows` shape per entry: `{id, from_agent, severity, summary, status, ts}` —
NO `payload` field. Summary is ≤120 chars (truncated by SKILL WRITE if longer).

This schema is intentionally minimal. The dashboard shows state at a glance; drill-down
goes to the human-canonical files (TASKS.md, DASHBOARD.md) not to this JSON.

**Volume mount:** Add exactly one new line to docker-compose.yml:
```yaml
- ./docs/data/orch-state.json:/app/docs/data/orch-state.json
```
This follows the exact same pattern as the five existing `docs/data/*.json` mounts
at lines 17–21 of the current docker-compose.yml.

---

## 7. Migration Risks

| Risk | Severity | Mitigation |
|---|---|---|
| 1837a test already failing against v2 (schema gap) | HIGH (latent bug, silent fail) | Fix in §4 before any other work. Prove by running `bun test 1837a` and confirming GREEN. |
| orch-state.json does not exist on first container start | MEDIUM | mcp-server endpoint must gracefully handle missing file (return HTTP 200 with all `_updated_at: null` and a NO-DATA flag, not 500). Seeding an empty template file in the repo removes this risk. |
| Agent writes pipeline-state.json but forgets orch-state.json postfix | MEDIUM | The orch-state.json write is not a new invariant from scratch — it is a postfix to the already-mandatory pipeline-state RETURN write. agent-father implements it in the agent-chaining-protocol.md RETURN section. Tests: CI smoke that checks `pipeline._updated_at` matches `pipeline-state.json head.updated_at` within 30s. |
| PO forgets to write orch-state.json after TASKS.md update | LOW | The staleness badge will make this visible within 4h. False-green is impossible because `_updated_at` timestamps age honestly. The tasks section shows STALE but pipeline section stays current — human-readable divergence. |
| signal-dashboard SKILL WRITE change breaks existing DASHBOARD write contract | LOW | The SKILL WRITE change is additive (no existing line removed; one `writeOrchState` call appended). If `orch-state.json` write fails, SKILL logs but does NOT fail the DASHBOARD write (orch-state is a projection, not the source). |
| alert-commander reads `.currentSprint` from pipeline-state v1 fields | MEDIUM (already broken on v2) | Fix in §4. Not introduced by this brief. |

---

## 8. Zones and Sequencing

**Mandatory ordering: SCHEMA-FIX before WRITER before ENDPOINT before FRONTEND.**

Any reader built against a broken schema or a file that doesn't yet exist returns wrong
data. Phase the work strictly:

| Phase | Zone | Tasks | Gate |
|---|---|---|---|
| 0 — Schema fix (FIRST, unblocked) | dev-mcp-server (test) + agent-father (flow fix) | Fix 1837a test + janitorJob v2 read + smoke-task-lock + alert-commander flow | bun test 1837a GREEN + smoke pass |
| 1 — SSOT file seed | agent-father (docs/data) | Create `docs/data/orch-state.json` with null template; commit | File exists, valid JSON |
| 2 — Writer implementation | agent-father (agent-chaining-protocol.md + signal-dashboard SKILL) | Add orch-state.json pipeline postfix to RETURN section; add orch-state.json.signals postfix to SKILL §WRITE; add orch-state.json.tasks to PO TASKS.md write step | orch-state.json populated after one :07 tick (verifiable via git log) |
| 3 — Volume mount | ops | Add one line to docker-compose.yml; rebuild mcp-server | File visible in container |
| 4 — Endpoint | dev-mcp-server | `GET /api/orchestration/state` → reads `/app/docs/data/orch-state.json`; returns as-is with HTTP 200 (no parsing, no enrichment); stale flag computed server-side from `_updated_at` fields | Endpoint returns 200 with valid JSON; stale badges fire correctly |
| 5 — Frontend | dev-frontend | ONE new route `/dashboard/orchestration` using ONE api call `GET /api/orchestration/state`; 3 cards (pipeline / tasks / signals) each with stale badge from `classifyStaleBadge` | Route renders; stale badge shows amber when file not updated within threshold |
| 6 — QA + ops rebuild | qa + ops | Live verify all 3 cards show real data; stale badge fires if file not updated; NO-DATA shows on null `_updated_at` sections | QA APPROVED + ops rebuild |

**Rough task count:** 10–14 atomic tasks (fewer than the 14–18 in the prior brief because
one endpoint + one file replaces two proposed files + three proposed endpoints).

---

## 9. How This Is "Clearer AND More Dynamic"

**Clearer:** Five surfaces → three canonical files + one machine projection. No new
authoring burden. The operator sees ONE JSON endpoint and ONE dashboard route, not
three separate `/api/orchestration/pipeline`, `/api/orchestration/tasks`,
`/api/orchestration/signals`. Drill-down to the authoritative human files is a git/link
action, not a separate dashboard tab.

**More dynamic:** The pipeline head section updates every :07 cron tick (same as today —
no regression). The signals section updates on every DASHBOARD write (more frequent than
hourly — any agent signal appears within the same cycle). The tasks section updates on PO
writes (session-cadence). All three sections carry independent `_updated_at` timestamps
and show STALE banners when stale — the operator sees exactly which part of the
orchestration state is live and which is behind.

**No silently-OK:** Every section has a staleness timestamp. A null `_updated_at` renders
as NO-DATA (gray), not a green check. An old `_updated_at` renders as STALE (amber). The
stale-badge formatter already exists in the frontend codebase — reuse, do not re-implement.

---

## 10. The ONE Decision the Operator Must Make

> **OPTION B is recommended** (keep Markdown human-canonical, derive ONE `docs/data/
> orch-state.json` projection). This replaces the two proposed twins from the prior brief.

**The operator must decide:**

> **Accept Option B (one projection, recommended)?** → agent-father implements Phases 0–6
> above.
>
> Or: **Accept Option C (pipeline-state only, minimal)?** → Phase 0 (schema fix, mandatory
> regardless) + Phase 3 (volume mount) + Phase 4 (one endpoint, pipeline head only) +
> Phase 5 (one card). Smaller scope, no task/signal cards.

**Signal to drop after greenlight:** agent-father, implement
`docs/architecture-briefs/2026-06-01-orch-state-consolidation.md`, starting with Phase 0
schema fix (unblocked, zero decision dependency).

Status = DESIGN — awaiting operator greenlight. Do NOT route to PO for sprint commitment
until one of the two options above is selected.

---

_Brief owner: agents-architect. Implementation: agent-father (after operator greenlight)._
