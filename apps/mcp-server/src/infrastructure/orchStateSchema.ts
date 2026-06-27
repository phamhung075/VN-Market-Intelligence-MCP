/**
 * orchStateSchema.ts — Nested Zod SSOT schema for docs/data/orch/orch-state.json
 *
 * Sprint: SSOT-INTEGRITY-PERIMETER  Task: SSOT-W1-ZOD-SCHEMA-MODEL
 *
 * Design decisions:
 *   - StatusEnum is THE one enum; bash gate + orchStateStore stop hardcoding their own.
 *   - ALL 9 task-bearing lanes covered "by construction" via a shared Lane sub-schema:
 *       backlog, done, done_verified, in_progress, qa, ready, review  (flat Lane[])
 *       active_sprints[].tasks[], closed_sprints[].tasks[]            (nested in Sprint)
 *     Adding a lane without using Lane is a compile-time omission visible in TaskBoardSchema.
 *   - .strict() on OrchStateSchema and TaskBoardSchema catches the dominant corruption
 *     class: "jq nests whole doc into a lane" or "full-doc key added to task_board".
 *   - TaskSchema and SprintSchema use .passthrough() during the SHG migration period
 *     (hot-field task stubs not yet fully enforced — switch to .strict() post-SHG-5).
 *   - superRefine: head.active_task_id referential integrity (hard gate).
 *   - Lane-status coherence (ADD-2) exported as checkLaneCoherence() so the validator
 *     CLI can call it without blocking the schema parse during data migration.
 *   - File-ref integrity exported as checkRefIntegrity() with injected fs-resolver
 *     (keeps the pure schema unit-testable without touching the filesystem).
 *
 * Authority refs:
 *   - docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md § Step 1
 *   - docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md §1.1 §3.2
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. STATUS ENUM — SINGLE SSOT (frozen 12-value set)
//
// Source: docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md §1.1
// ADD-1 READY-bootstrap: PO ratified option-a 2026-06-27T08:35:40Z
//   → READY added as 12th value (a ready[] lane exists, so READY is lane-coherent)
//
// TERMINAL_SET (used by sprint eviction predicate §2.1 of hardening brief):
//   DONE | DONE_VERIFIED | CANCELLED | DEFERRED | SKIPPED
// ═══════════════════════════════════════════════════════════════════════════════

export const StatusEnum = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "QA",
  "DONE",
  "DONE_VERIFIED",
  "BLOCKED",
  "DEFERRED",
  "CANCELLED",
  "SKIPPED",
  "READY",       // ADD-1: 12th value — PO ratified option-a 2026-06-27
]);

export type Status = z.infer<typeof StatusEnum>;

/** Terminal statuses used by sprint eviction predicate (§2.1 of hardening brief). */
export const TERMINAL_SET: ReadonlySet<Status> = new Set([
  "DONE",
  "DONE_VERIFIED",
  "CANCELLED",
  "DEFERRED",
  "SKIPPED",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. TASK SCHEMA
//
// Uses .passthrough() during the SHG migration period.
// The .status field validates against StatusEnum — this is the primary corruption
// guard: any non-canonical spelling (PARKED, FOLDED, review, done_verified, etc.)
// is rejected even under .passthrough().
//
// Hot field set per §3.2 of hardening brief (the only fields expected post-SHG):
//   id, title, status, owner, zone, priority, size, type, depends, wave,
//   verify_note, detail_ref
// All other fields are legacy — moved to cold store by SHG migration.
// Switch to .strict() post-SHG-5 (task: SSOT-W1-SERVER-ENFORCE).
// ═══════════════════════════════════════════════════════════════════════════════

export const TaskSchema = z
  .object({
    // ── Required ──────────────────────────────────────────────────────────────
    id: z.string().min(1),
    status: StatusEnum,
    // ── Hot planning fields (§3.2 hot field set) ─────────────────────────────
    title: z.string().optional(),
    owner: z.string().optional(),
    zone: z.string().optional(),
    priority: z.string().optional(),
    size: z.string().optional(),
    type: z.string().optional(),
    depends: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    wave: z.union([z.string(), z.number(), z.null()]).optional(),
    verify_note: z.string().nullable().optional(),
    detail_ref: z.string().nullable().optional(),   // some tasks have detail_ref: null
    // ── Legacy routing / identity fields (present in hot file during migration) ─
    task_id: z.string().optional(),          // legacy alias for id
    owner_agent: z.string().optional(),
    next_agent: z.string().optional(),
    sprint: z.string().nullable().optional(),       // some tasks have sprint: null
    created_at: z.string().optional(),
    closed_at: z.string().optional(),
    note: z.string().optional(),
    notes: z.string().optional(),
    status_note: z.string().optional(),
  })
  .passthrough(); // ← switch to .strict() post-SHG-5

export type Task = z.infer<typeof TaskSchema>;

/**
 * Lane — shared array sub-schema reused for EVERY flat task-bearing lane.
 * "By construction": every flat lane in TaskBoardSchema MUST use this type.
 * You cannot add a lane without assigning it Lane — the omission is visible at
 * compile time and in the schema definition.
 */
export const Lane = z.array(TaskSchema);
export type TaskLane = z.infer<typeof Lane>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. SPRINT SCHEMA
//
// Uses .passthrough(): active_sprints and closed_sprints have different key sets
// (e.g., closed_sprints carry closed_at, task_count; active carry ranked_scope).
// The .tasks field is required and typed Lane — sprint tasks are validated.
// ═══════════════════════════════════════════════════════════════════════════════

export const SprintSchema = z
  .object({
    id: z.string().min(1),
    // status is optional because closed_sprint stubs in the hot file (ORCH-STATE-HOT-COLD-SPLIT)
    // are stored as lightweight stubs: {id, title, closed_at, task_count, detail_ref}
    // without status or tasks. Full sprint objects (in cold archive) always have status+tasks.
    status: z.string().optional(),
    // tasks is optional for hot-file closed_sprint stubs; defaults to [] for easier downstream use
    tasks: z.array(TaskSchema).optional().default([]),
    label: z.string().optional(),
    goal: z.string().optional(),
    opened_at: z.string().optional(),
    closed_at: z.string().optional(),
    priority: z.string().optional(),
  })
  .passthrough(); // allow variant sprint fields (ranked_scope, evidence, task_count, etc.)

export type Sprint = z.infer<typeof SprintSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. SIGNAL QUEUE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

export const SignalSeverityEnum = z.enum(["CRITICAL", "HIGH", "MED", "LOW", "INFO"]);
export type SignalSeverity = z.infer<typeof SignalSeverityEnum>;

export const SignalRowSchema = z
  .object({
    id: z.string(),
    summary: z.string(),
    // severity: z.string() — live data has legacy values "P1", "WARN", "MEDIUM" in addition
    // to the canonical 5. Validated as string; canonical enum enforced post-signal-cleanup.
    severity: z.string(),
    status: z.string(),
    ts: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    type: z.string().optional(),
    payload_ref: z.string().nullable().optional(),
  })
  .passthrough(); // signal rows have many audit/triage fields; validated structurally

export type SignalRow = z.infer<typeof SignalRowSchema>;

/** Archived signal row (compact form stored in signal_queue.archive[]) */
export const SignalArchiveEntrySchema = z
  .object({
    id: z.string(),
    ts: z.string().optional(),
    summary: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const SignalQueueSchema = z
  .object({
    _updated_at: z.string(),
    _updated_by: z.string(),
    rows: z.array(SignalRowSchema),
    archive: z.array(SignalArchiveEntrySchema).optional().default([]),
    last_triaged_at: z.string().optional(),
    last_triaged_by: z.string().optional(),
  })
  .strict(); // signal_queue keys are stable and fully enumerated above

export type SignalQueue = z.infer<typeof SignalQueueSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 5. HEAD SCHEMA (canonical top-level .head)
// ═══════════════════════════════════════════════════════════════════════════════

export const HeadSchema = z
  .object({
    status: z.string(),
    active_task_id: z.string().nullable().optional(),
    next_agent: z.string().nullable().optional(),
    next_action: z.string().optional(),
    updated_by: z.string().optional(),
    updated_at: z.string().optional(),
    note: z.string().optional(),
    // Legacy routing fields that may appear in some head states
    wip: z.number().optional(),
    wip_max: z.number().optional(),
  })
  .passthrough(); // head fields vary by pipeline state

export type Head = z.infer<typeof HeadSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 6. _meta SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

export const MetaSchema = z
  .object({
    schema: z.string(),           // e.g. "v4"
    ssot: z.boolean().optional(),
    updated_at: z.string().optional(),
    updated_by: z.string().optional(),
  })
  .strict(); // _meta keys are stable (4 fields only)

export type Meta = z.infer<typeof MetaSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 7. TASK BOARD SCHEMA
//
// .strict() — ALL 9 task-bearing lanes + known metadata keys enumerated.
// Any unexpected key (e.g., whole orch-state doc nested into task_board) is
// rejected immediately: orch-state root has _meta/decision_journal/narrative/
// sprint_goal/etc. — NONE of which appear in this enumeration.
//
// 9 TASK-BEARING LANES (ALL use the shared Lane type — "by construction"):
//   Flat:   backlog, done, done_verified, in_progress, qa, ready, review
//   Nested: active_sprints[].tasks[], closed_sprints[].tasks[]
// ═══════════════════════════════════════════════════════════════════════════════

/** Deprecated task_board.head stub (routing was moved to top-level .head in v4). */
const DeprecatedHeadStubSchema = z
  .object({ status: z.string() })
  .passthrough(); // may contain canonical_moved_to, deprecated_at, etc.

export const TaskBoardSchema = z
  .object({
    // ── 9 task-bearing lanes ────────────────────────────────────────────────
    // Flat lanes (all use Lane = z.array(TaskSchema) — "by construction"):
    backlog:       Lane,
    done:          Lane.optional().default([]),
    done_verified: Lane.optional().default([]),
    in_progress:   Lane.optional().default([]),
    qa:            Lane.optional().default([]),
    ready:         Lane.optional().default([]),
    review:        Lane.optional().default([]),
    // Sprint-nested lanes (tasks validated inside SprintSchema):
    active_sprints:  z.array(SprintSchema),
    closed_sprints:  z.array(SprintSchema).optional().default([]),
    // ── Deprecated stub ─────────────────────────────────────────────────────
    // G-7: task_board.head must remain a stub (routing fields must not be re-inflated here)
    head: DeprecatedHeadStubSchema.optional(),
    // ── Metadata ────────────────────────────────────────────────────────────
    _updated_at:     z.union([z.string(), z.number()]).optional(), // may be unix ts or ISO
    _updated_by:     z.string().optional(),
    last_triaged_at: z.string().optional(),
    last_triaged_by: z.string().optional(),
    // ── Legacy / transitional keys ──────────────────────────────────────────
    archive:               Lane.optional(),  // old completed tasks (pre-done[] migration)
    _closed_signals_20260614: z.record(z.unknown()).optional(), // one-off archival (2026-06-14)
  })
  .strict(); // ← catches full-doc overwrites and unknown structural keys

export type TaskBoard = z.infer<typeof TaskBoardSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 8. ORCH STATE SCHEMA (root)
//
// .strict() — all 10 known root keys enumerated.
// superRefine — head.active_task_id referential integrity:
//   if non-null, the ID must resolve to a task in task_board.
// ═══════════════════════════════════════════════════════════════════════════════

/** Collect all task IDs (id + legacy task_id) across all lanes. */
function collectAllTaskIds(tb: z.infer<typeof TaskBoardSchema>): Set<string> {
  const ids = new Set<string>();

  const add = (tasks: TaskLane | undefined) => {
    if (!tasks) return;
    for (const t of tasks) {
      const raw = t as Record<string, unknown>;
      if (typeof raw["id"] === "string" && raw["id"]) ids.add(raw["id"]);
      if (typeof raw["task_id"] === "string" && raw["task_id"]) ids.add(raw["task_id"]);
    }
  };

  add(tb.backlog);
  add(tb.done);
  add(tb.done_verified);
  add(tb.in_progress);
  add(tb.qa);
  add(tb.ready);
  add(tb.review);
  add(tb.archive);

  for (const sprint of tb.active_sprints) {
    add(sprint.tasks);
  }
  for (const sprint of (tb.closed_sprints ?? [])) {
    add(sprint.tasks);
  }

  return ids;
}

export const OrchStateSchema = z
  .object({
    _meta:                   MetaSchema.optional(),
    // ── Legacy v3-style root-level metadata (optional; present in older snapshots
    //    and in the OrchState TypeScript interface in orchStateStore.ts) ──────────
    _schema:                 z.string().optional(),
    _ssot:                   z.boolean().optional(),
    _updated_at:             z.string().optional(),
    _updated_by:             z.string().optional(),
    // ─────────────────────────────────────────────────────────────────────────────
    dashboard_section_cache: z.record(z.unknown()).optional(),
    decision_journal:        z.array(z.record(z.unknown())).optional(),
    head:                    HeadSchema,
    last_tick:               z.string().optional(),
    narrative:               z.record(z.unknown()).optional(),
    session_handoff_status:  z.record(z.unknown()).optional(),
    signal_queue:            SignalQueueSchema,
    sprint_goal:             z.record(z.unknown()).optional(),
    task_board:              TaskBoardSchema,
  })
  .strict() // ← rejects unknown root keys (e.g., accidentally injected _schema, extra sections)
  .superRefine((data, ctx) => {
    // ── Referential integrity: head.active_task_id ──────────────────────────
    // If set, the task ID must resolve to at least one task in task_board.
    // null / undefined = no active task — allowed.
    const activeId = data.head.active_task_id;
    if (activeId != null && typeof activeId === "string" && activeId.length > 0) {
      const allIds = collectAllTaskIds(data.task_board);
      if (!allIds.has(activeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["head", "active_task_id"],
          message:
            `head.active_task_id "${activeId}" does not resolve to any task in task_board. ` +
            `fix: ensure the task is present in backlog/in_progress/ready/active_sprints or set to null.`,
        });
      }
    }
  });

export type OrchState = z.infer<typeof OrchStateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 9. LANE-STATUS COHERENCE (ADD-2)
//
// Exported as a standalone function so the validator CLI can call it without
// the schema parse blocking on coherence violations during the SHG data-migration
// period (backlog[] still contains REVIEW/IN_PROGRESS/DONE stragglers pre-SHG-2).
//
// Once SHG-2 (status enum migration) and SHG-4 (sprint eviction) are confirmed
// complete, promote this to a superRefine on OrchStateSchema.
//
// Source: SSOT-zod-validation-directive-2026-06-27.md ADD-2
//   backlog      → {BACKLOG}
//   review       → {REVIEW}
//   qa           → {QA}
//   done         → {DONE, DONE_VERIFIED}
//   done_verified→ {DONE_VERIFIED}
//   ready        → {READY, TODO}
//   in_progress  → {IN_PROGRESS}
// ═══════════════════════════════════════════════════════════════════════════════

export interface LaneCoherenceIssue {
  lane: string;
  taskId: string;
  status: string;
  allowedStatuses: string[];
  /** Auto-fix hint for the writing agent. */
  fix: string;
}

/** ADD-2 lane → allowed status set mapping. */
export const LANE_ALLOWED_STATUSES: Readonly<Record<string, ReadonlySet<string>>> = {
  backlog:       new Set(["BACKLOG"]),
  review:        new Set(["REVIEW"]),
  qa:            new Set(["QA"]),
  done:          new Set(["DONE", "DONE_VERIFIED"]),
  done_verified: new Set(["DONE_VERIFIED"]),
  ready:         new Set(["READY", "TODO"]),
  in_progress:   new Set(["IN_PROGRESS"]),
};

/**
 * Check lane↔status coherence across all 7 flat task-bearing lanes (ADD-2).
 * Returns an array of issues (empty = fully coherent).
 *
 * Called by:
 *   - scripts/orch-validate.mjs (Stage-1 coherence pass)
 *   - orchStateStore.ts (post-SHG-5 — once the schema strict() is promoted)
 */
export function checkLaneCoherence(data: OrchState): LaneCoherenceIssue[] {
  const issues: LaneCoherenceIssue[] = [];
  const tb = data.task_board;

  for (const [lane, allowed] of Object.entries(LANE_ALLOWED_STATUSES)) {
    const tasks = (tb as Record<string, unknown>)[lane];
    if (!Array.isArray(tasks)) continue;

    for (const task of tasks) {
      if (task == null || typeof task !== "object") continue;
      const t = task as { id?: string; status?: string };
      const status = t.status ?? "";
      const taskId = t.id ?? "(no-id)";

      if (!allowed.has(status)) {
        issues.push({
          lane,
          taskId,
          status,
          allowedStatuses: Array.from(allowed),
          fix:
            `Move task "${taskId}" to the correct lane OR relabel its status to one of: ` +
            Array.from(allowed).join(", "),
        });
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 10. REFERENTIAL INTEGRITY — FILE RESOLVER (rank-4)
//
// Validates that detail_ref and signal_queue.rows[].payload_ref point to
// existing files. Uses an injected fs-resolver so the pure schema stays
// unit-testable without real filesystem access.
//
// Called by scripts/orch-validate.mjs (Stage-1, after main parse passes).
// ═══════════════════════════════════════════════════════════════════════════════

export interface RefIntegrityIssue {
  path: string;
  ref: string;
  message: string;
  fix: string;
}

/** Injected file-existence resolver (production: existsSync; test: mock). */
export type FileResolver = (absolutePath: string) => boolean;

/**
 * Check referential integrity of file references in orch-state:
 *   - signal_queue.rows[].payload_ref (non-null)
 *   - task_board.*[].detail_ref (non-null, all flat lanes + sprint tasks)
 *
 * @param data         Parsed OrchState
 * @param fileExists   Injected resolver — given an absolute path, returns true if the file exists
 * @param projectRoot  Absolute path to the project root (prefix for relative refs)
 */
export function checkRefIntegrity(
  data: OrchState,
  fileExists: FileResolver,
  projectRoot: string,
): RefIntegrityIssue[] {
  const issues: RefIntegrityIssue[] = [];

  const checkRef = (ref: string | null | undefined, path: string) => {
    if (ref == null || ref === "") return;
    // Strip fragment (#task-id) before checking file existence
    const filePart = ref.includes("#") ? ref.split("#")[0]! : ref;
    const absPath = filePart.startsWith("/") ? filePart : `${projectRoot}/${filePart}`;
    if (!fileExists(absPath)) {
      issues.push({
        path,
        ref,
        message: `file "${filePart}" does not exist`,
        fix: `correct ref to an existing file under ${projectRoot}/`,
      });
    }
  };

  // signal_queue.rows[].payload_ref
  const rows = data.signal_queue.rows ?? [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown> | undefined;
    if (!row) continue;
    const pRef = row["payload_ref"];
    if (typeof pRef === "string") {
      checkRef(pRef, `signal_queue.rows[${i}].payload_ref`);
    }
  }

  // task_board detail_ref — flat lanes
  const flatLanes = ["backlog", "done", "done_verified", "in_progress", "qa", "ready", "review", "archive"] as const;
  const tb = data.task_board as Record<string, unknown>;
  for (const lane of flatLanes) {
    const tasks = tb[lane];
    if (!Array.isArray(tasks)) continue;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i] as Record<string, unknown> | undefined;
      if (!t) continue;
      const dRef = t["detail_ref"];
      if (typeof dRef === "string") {
        checkRef(dRef, `task_board.${lane}[${i}].detail_ref`);
      }
    }
  }

  // task_board detail_ref — sprint tasks
  for (const sprintArr of [data.task_board.active_sprints, data.task_board.closed_sprints ?? []]) {
    for (let si = 0; si < sprintArr.length; si++) {
      const sprint = sprintArr[si];
      if (!sprint) continue;
      const sprintTasks = sprint.tasks ?? [];
      for (let ti = 0; ti < sprintTasks.length; ti++) {
        const t = sprintTasks[ti] as Record<string, unknown> | undefined;
        if (!t) continue;
        const dRef = t["detail_ref"];
        if (typeof dRef === "string") {
          checkRef(dRef, `task_board.active_sprints[${si}].tasks[${ti}].detail_ref`);
        }
      }
    }
  }

  return issues;
}
