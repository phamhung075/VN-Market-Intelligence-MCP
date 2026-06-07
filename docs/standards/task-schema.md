# Canonical Task Schema — docs/data/orch/orch-state.json

**Version:** 1.0  
**Effective:** 2026-06-06  
**Authority:** TypeScript interface `apps/mcp-server/src/infrastructure/orchStateStore.ts:OrchStateTaskBoardTask`

---

## Task Row Fields

Every task in `.task_board.active_sprints[].tasks[]` and `.task_board.done[]` MUST conform to this schema.

### Canonical Fields (Mandatory)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | **Canonical task ID.** Unique within the sprint. Examples: `AF-ORCH-F1A-F4`, `BAL-0`, `BCTC-HIST-SEED`. |
| `title` | `string` | Human-readable task title. No markdown. ~100–200 chars. |
| `owner` | `string` | Agent ID responsible for the task. Examples: `dev-mcp-server`, `dev-frontend`, `qa`, `agents-architect`. |
| `status` | `enum` | Closed set: `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`, `BLOCKED`, `CANCELLED`, `DEFERRED`. No freeform variants allowed. |
| `zone` | `string` | File path or subsystem owning the task. Examples: `apps/mcp-server/src/interface/mcp/`, `docs/agents/`. Used for zone isolation in parallel dispatch. |
| `created_at` | `string` | ISO 8601 timestamp (UTC). Task creation time. Fallback rule: `created_at // closed_at // "unknown"`. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | `string` | **Legacy optional only.** Deprecated in favor of `id`. Read-path only; never write. Coalesce rule: prefer `id`, fallback `task_id`. |
| `type` | `string` | Task classification. Examples: `FIX`, `SPIKE`, `SPRINT-S`, `QA`, `FEATURE`. Informational; does not affect status enum. |
| `size` | `string` | T-shirt size. `XS`, `S`, `M`, `L`, `XL`. Informational. |
| `priority` | `string` | Risk or importance. `high`, `medium`, `low`. Informational. |
| `status_note` | `string` | Free-form context about the task's current state. Max ~500 chars. Examples of content: "pending rebuild", "blocked on F1B migration", "live-verified on 2026-06-02T12:11Z". |
| `closed_at` | `string` | ISO 8601 timestamp. When the task transitioned to a terminal status (`DONE`, `CANCELLED`, `DEFERRED`). |
| `sprint` | `string` | Sprint ID the task belongs to. May be inferred from container sprint if omitted. Example: `BCTC-ANALYTICS-LAYER`. |
| `depends` | `array[string]` | Task IDs this task depends on. Empty array if no dependencies. |
| `note` | `string` | Detailed task notes. Max ~1000 chars. Implementation guidance, rationale, or historical context. |
| `files` | `array[string]` | File paths touched by the task's implementation. Example: `["apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts", "apps/frontend/app/routes/dashboard.orchestration.tsx"]`. |
| `commit` | `string` | Git commit hash(es) delivering the task. Space-separated list if multiple commits. Example: `9093f385` or `b7329f54 c1a2b3d4`. |

---

## Closed Status Enum

The `status` field MUST be one of these 7 values. NO freeform variants (e.g., `DONE-LIVE-VERIFIED`, `DONE-PENDING-QA`) are allowed in the canonical schema — migration will normalize these to the nearest enum value and move the detail to `status_note`.

| Status | Meaning | Typical Next Action |
|--------|---------|-------------------|
| `TODO` | Task not started. | Assign or wait for dependencies. |
| `IN_PROGRESS` | Active work underway. | Continue execution; update status_note with blockers. |
| `REVIEW` | Awaiting review/QA/merge. | Reviewer→approve or request changes. |
| `DONE` | Task complete and verified. | Merge handoff to done[]; close sprint. |
| `BLOCKED` | Cannot proceed; escalated. | Unblock dependency or escalate. |
| `CANCELLED` | Task no longer needed. | Archive; move to done[]. |
| `DEFERRED` | Intentionally postponed. | Re-prioritize in future sprint; move to done[] or backlog. |

---

## Normalization Rules (F1B Migration)

When migrating freeform status strings to the canonical enum:

1. **String → Enum Mapping:**
   - `DONE*` (any variant: `DONE-LIVE-VERIFIED`, `DONE-PENDING-QA`, etc.) → `DONE`
   - `RESOLVED*`, `SUPERSEDED`, `SHIPPED` → `DONE`
   - `IN_PROGRESS*` → `IN_PROGRESS`
   - `REVIEW*`, `READY_FOR_REVIEW` → `REVIEW`
   - `BLOCKED*` → `BLOCKED`
   - `CANCELLED*` → `CANCELLED`
   - `DEFERRED`, `POSTPONED`, `FUTURE` → `DEFERRED`
   - Unknown variants → `TODO` (conservative fallback)

2. **Move detail to status_note:** The original freeform status string is preserved in `status_note`. Example:
   - **Before:** `"status": "DONE-LIVE-VERIFIED"`
   - **After:** `"status": "DONE", "status_note": "DONE-LIVE-VERIFIED 2026-06-02T12:11Z by router raw-verify"`

3. **Timestamp inference:**
   - If `created_at` is missing, use `closed_at` (for done[] rows).
   - If both missing, set to `"unknown"`.

---

## Write Rules (mandatory)

- Write `id`, **never** `task_id`. The `task_id` field is legacy read-only; no new code may emit it.
- `_updated_at` and `created_at` MUST be set via real `date -u +"%Y-%m-%dT%H:%M:%SZ"` output. Never hand-type timestamps.

---

## Banned Fields

The following fields are NEVER written to a canonical task row:

- `desc` — use `title` instead
- `label` — use `title` instead
- `summary` — use `title` instead
- `resolvedId` — use `id` instead
- `resolved_id` — use `id` instead

Any row containing a banned field MUST be flagged and corrected before merge.

---

## Invariants

1. **No duplicate IDs:** A task ID MUST NOT appear in both `done[]` and any `active_sprints[].tasks[]` simultaneously. PM enforces this during sprint closure.

2. **No missing mandatory fields:** Every row in `.task_board.active_sprints[].tasks[]` and `.task_board.done[]` MUST have `id`, `title`, `owner`, `status`, `zone`, `created_at`.

3. **Valid status enum:** The `status` field is validated against the closed 7-value enum at write time (TypeScript compile-time check; jq-migration-time check; serve-time JSON schema validation).

4. **Zone isolation:** Tasks in the same parallel dispatch MUST NOT touch the same file. `zone` field is used to detect conflicts.

---

## Examples

### Canonical Row (DONE)
```json
{
  "id": "AF-ORCH-F1A-F4",
  "title": "Flows + SKILL + journal rewrite + task-schema.md",
  "owner": "agent-father",
  "type": "SPRINT-S",
  "status": "DONE",
  "zone": "docs/agents/ + .claude/skills/",
  "created_at": "2026-06-06T20:30:00Z",
  "closed_at": "2026-06-06T21:15:00Z",
  "priority": "high",
  "size": "M",
  "sprint": "ORCH-TASK-CANON",
  "status_note": "Merged flows/SKILL/journal 10-file refactor; sprint-2026-06-06.md rewritten to canonical block shape; decision-journal SKILL per-agent path implemented.",
  "depends": [],
  "files": ["docs/standards/task-schema.md", ".claude/skills/decision-journal/SKILL.md", "docs/agents/po/flow/sprint-kickoff.md"],
  "commit": "a1b2c3d4",
  "note": "F1a+F4 merged per architect ruling D-2. No TypeScript changes."
}
```

### Canonical Row (IN_PROGRESS)
```json
{
  "id": "F2-MCP",
  "title": "orchStateStore types + orchestrationHandler done[] + journalStore glob + REBUILD",
  "owner": "dev-mcp-server",
  "type": "SPRINT-S",
  "status": "IN_PROGRESS",
  "zone": "apps/mcp-server/src/",
  "created_at": "2026-06-06T20:45:00Z",
  "priority": "high",
  "size": "L",
  "sprint": "ORCH-TASK-CANON",
  "status_note": "TypeScript rename in progress; depends on F1B migration live-verified.",
  "depends": ["AF-ORCH-F1B"],
  "files": ["apps/mcp-server/src/infrastructure/orchStateStore.ts", "apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts", "apps/mcp-server/src/infrastructure/journalStore.ts"],
  "note": "See TASK_002.md handoff for full acceptance criteria."
}
```

---

## TypeScript Interface (Source of Truth)

See `apps/mcp-server/src/infrastructure/orchStateStore.ts:OrchStateTaskBoardTask` for the machine-authoritative schema definition.

```ts
export interface OrchStateTaskBoardTask {
  // Canonical (mandatory)
  id: string;
  title: string;
  owner: string;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED" | "CANCELLED" | "DEFERRED";
  zone: string;
  created_at: string;

  // Legacy (optional, read-only)
  task_id?: string;

  // Optional
  type?: string;
  size?: string;
  priority?: string;
  status_note?: string;
  closed_at?: string;
  sprint?: string;
  depends?: string[];
  note?: string;
  files?: string[];
  commit?: string;
}
```

---

## Related Documents

- **Architect brief:** `docs/handoffs/ORCH-TASK-CANON-ARCH.md` (design decisions D-4, D-5, D-6)
- **Migration rules:** `docs/handoffs/ORCH-TASK-CANON-ARCH.md` § Test Strategy (F1B assertions)
- **PM dispatch pattern:** `docs/agents/pm/init.md` § parallel_dispatch
