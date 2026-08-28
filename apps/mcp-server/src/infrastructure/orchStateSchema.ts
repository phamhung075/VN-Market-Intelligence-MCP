/**
 * orchStateSchema.ts — Nested Zod SSOT schema for docs/data/orch/orch-state.json
 * size-justification: ~1878L — one Zod SSOT (§1-8: StatusEnum/Task/Sprint/
 *   SignalQueue/Head/Meta/TaskBoard/OrchState) plus 6 co-located write-time
 *   validation guards (§9-14) that scripts/orch-validate.mjs imports BY NAME
 *   from this exact file path. A physical split (even via re-export barrel)
 *   would break scripts/agents-flow/drain-signals.test.js's
 *   makeOrchRefHarness(), which raw-copies only this one path into an
 *   isolated sandbox (not dependency-aware) to run the real orch-validate.mjs
 *   end-to-end — the copied file's own import would dangle. Fixing that
 *   harness's copy list is a 1-line change but lives in scripts/, outside
 *   this agent's zone (apps/mcp-server/ only); flagged via decision journal
 *   (FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS) for a scripts/-owning
 *   agent to land alongside a coordinated split. Trimmed ~46L of duplicated/
 *   verbose narrative comments pre-header (870L→824L, zero logic/type/export
 *   changes) — the genuine reduction available without that split; this
 *   justification block itself accounted for the remaining delta to 839L.
 *   FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS AC-3 2026-08-01:
 *   added §13 checkDependsDivergence() (hard-fail write-time guard on the
 *   exact .depends/.depends_on divergence shape that starved 5 P0 rows for
 *   3 days) + §14 checkMissingDependencyReport()/collectHotDepStatusLaneIds()
 *   (non-fatal live-visibility report for the separate, PO-ratified
 *   cold-archive-resolves-MISSING class) — same one-file-per-guard
 *   co-location precedent as §9-12, same reason a split still cannot land
 *   yet (+235L).
 *   SYSREMAKE-P2-T2-SCHEMA-ADDITIONS 2026-08-08: added §1A
 *   (RawProbeSchema/VerificationSchema — must precede §2 TaskSchema, which
 *   references them at module-eval time, not §4/§5 as the source brief's
 *   prose literally said) + §8A (checkVerificationGate() write-time gate +
 *   the frozen 50-id RC_VERIF_GRANDFATHERED_IDS allowlist (51→50 2026-08-23,
 *   FIX-RCVERIF-GRANDFATHER-EXEMPTION-IGNORES-RETRACTION-VOID-MARKERS —
 *   removed FU-RAG-DEPLOY-MEMORY, never certified), re-derived live
 *   at implementation time, wider than the brief's own snapshot — see §8A
 *   header) — same one-file-per-guard co-location precedent, same physical-
 *   split blocker as §9-14 above (+217L).
 *   FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
 *   2026-08-22 (commits efcb45ad8/1897ef6a2): added §15
 *   classifySprintRegistryDanglingIds() (pure, read-only B1/B2/Q4-corrected
 *   classification of every sprint id referenced by task_board.*[].sprint or
 *   sprint_goal.entries[] against the strict known-id union) + §16
 *   checkSprintRegistryReferentialIntegrity() (delegates to §15, wires Stage
 *   1h of orch-validate.mjs) — same one-file-per-guard co-location precedent
 *   as §9-14/§8A above, same physical-split blocker (+458L: 369 insertions
 *   then 89 insertions/2 deletions — pushed this file from 1300L to its
 *   actual 1784L; this line was the stale declaration that armed
 *   UNBLOCK-FLEETPUSH-SIZELINT-ORCHSTATESCHEMA-NEW-OFFENDER-BLOCKS-ALL-PUSHES,
 *   a fleet-wide pre-push size-lint false-block — refreshed here, no code
 *   change).
 *   FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT 2026-08-28 (last of
 *   brief §9's 7 files, land 7/7): §8A checkVerificationGate() gains the
 *   behavior_predicate hard-reject (brief §5c) — DONE_VERIFIED P0/P1-equivalent
 *   apps/ rows minted at/after BEHAVIOR_PREDICATE_CUTOFF need a mint-time
 *   verification.behavior_predicate{cmd,expect}; grandfather-by-time (never
 *   by id-list), priority set ['P0','P1','high','HIGH'] (mixed-convention,
 *   AC-3). Same one-file-per-guard co-location precedent as §8A's original
 *   raw_probe gate; helper hasValidBehaviorPredicate() co-located in §8A
 *   (+50L).
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
// ddd-deviation-allow: business rule embedded in infrastructure/, no domain/
//   counterpart — StatusEnum/TERMINAL_SET (below), plus checkLaneCoherence()/
//   checkDependsDivergence()/checkVerificationGate()/
//   checkDecorativeSequencingFields() elsewhere in this file, encode genuine
//   domain invariants ("what is a valid Task/Sprint state") per
//   docs/policies/dev-standards.md § DDD Layer Rules ("Business rule / pure
//   calculation -> domain/"), yet this whole file lives under infrastructure/
//   and no domain/models or domain/services counterpart exists for
//   Task/Sprint/orch-coordination entities. Ratified document-as-deviation
//   (not relocate) — cheaper, lower-migration-risk on this hot-path,
//   load-bearing, ~1300L file with existing test coverage than extracting to
//   a new domain/services/orchestrationRules.ts; mirrors the existing
//   size-justification:/composition-root-logic-allow: exemption convention.
//   Finding: docs/architecture-briefs/2026-08-22-agent-fabric-ddd-debug-
//   logger-tool-optimization.md § Part 1 (Finding 1). Ratification: STEP
//   agent-father-S53, docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-
//   SLOT-CATCHUP-agent-father-3.md (2026-08-22).
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. STATUS ENUM — SINGLE SSOT (frozen 13-value set)
//
// Source: docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md §1.1
// ADD-1 READY-bootstrap: PO ratified option-a 2026-06-27T08:35:40Z
//   → READY added as 12th value (a ready[] lane exists, so READY is lane-coherent)
// ADD-2 RC-VERIF: docs/architecture-briefs/2026-07-17-sysremake-p2-rcverif-rcconverge.md §2.1
//   → DEGRADED added as 13th value (honest partial-verification state — a task whose
//     work is done but could not be independently re-verified; see § 8A gate below)
//
// TERMINAL_SET (used by sprint eviction predicate §2.1 of hardening brief):
//   DONE | DONE_VERIFIED | CANCELLED | DEFERRED | SKIPPED
//   DEGRADED is deliberately EXCLUDED (brief §2.3) — it needs a human/PO decision,
//   not silent cold-eviction.
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
  "DEGRADED",    // ADD-2: 13th value — RC-VERIF honest partial-verification state, 2026-07-17
]);

export type Status = z.infer<typeof StatusEnum>;

/**
 * Terminal statuses used by sprint eviction predicate (§2.1 of hardening brief).
 * DEGRADED is deliberately NOT a member (§2.3 of RC-VERIF brief) — see § 1A/§ 8A.
 */
export const TERMINAL_SET: ReadonlySet<Status> = new Set([
  "DONE",
  "DONE_VERIFIED",
  "CANCELLED",
  "DEFERRED",
  "SKIPPED",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// § 1A. RAW-PROBE / VERIFICATION (RC-VERIF)
//
// Task: SYSREMAKE-P2-T2-SCHEMA-ADDITIONS
// Source: docs/architecture-briefs/2026-07-17-sysremake-p2-rcverif-rcconverge.md §2.1
//
// Shape is the literal 4-field contract PO already applies by hand-convention
// (docs/agent-memory/notebooks/po.md 2026-07-17 VERIFY-FIX-DAILY-FF-VIEW-JOIN-
// ANCHOR-REALDATA close: `.verification.raw_probe{tool,args,live_value_observed,
// observed_at}`) — this schema formalizes an already-live convention, not a new
// invention. MUST be defined before § 2 TaskSchema (below) references it — module
// top-level `const`/`z.object()` evaluation is sequential, not hoisted like a
// `function` declaration, so a forward reference here would throw a TDZ
// ReferenceError at import time.
// ═══════════════════════════════════════════════════════════════════════════════

export const RawProbeSchema = z
  .object({
    tool: z.string().min(1),                 // e.g. "get_price_history", "sqlite3 <query>"
    args: z.union([z.string(), z.record(z.unknown())]),
    live_value_observed: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown())]),
    observed_at: z.string().min(1),           // ISO-8601 UTC
  })
  .passthrough(); // extra evidentiary fields (evidence_commit, verdict, ...) already seen live

export const VerificationSchema = z
  .object({
    raw_probe: RawProbeSchema.optional(),
    honest_gap_reason: z.string().min(1).optional(), // required conditionally for DEGRADED, see § 8A
  })
  .passthrough();

export type RawProbe = z.infer<typeof RawProbeSchema>;
export type Verification = z.infer<typeof VerificationSchema>;

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
    // ── RC-VERIF / RC-CONVERGE (§ 1A above) ──────────────────────────────────
    verification: VerificationSchema.optional(),  // RC-VERIF — required shape for DONE_VERIFIED/DEGRADED, see § 8A gate
    bug_class: z.string().optional(),             // RC-CONVERGE — recurrence-tracking slug (sidecar ledger, out of this task's scope)
  })
  // .passthrough() → .strict() PROMOTION TRIGGER (post-SHG-5, SSOT-W1-SERVER-ENFORCE
  // rank-4): once all active-sprint tasks are migrated to hot-field stubs and
  // checkRefIntegrity() shows zero unknown-key warnings on live data, switch to
  // .strict() and drop TaskSchema.status's `| string` escape hatch.
  // Cross-ref: docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md §1.3
  .passthrough();

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
  // .passthrough() → .strict() PROMOTION TRIGGER (post-SHG-5, SSOT-W1-SERVER-ENFORCE
  // rank-4): once active vs closed sprint key-sets converge on the same hot-field
  // subset (or split into ActiveSprintSchema / ClosedSprintSchema), switch to .strict().
  // Cross-ref: docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md §1.3
  .passthrough();

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
// superRefine — RC-VERIF completion gate (§ 8A below): DONE_VERIFIED requires
//   verification.raw_probe (unless grandfathered), DEGRADED requires
//   verification.honest_gap_reason. Extends this SAME superRefine (not a new
//   standalone export) so every one of the 4 live validation paths that import
//   OrchStateSchema inherits it automatically — see § 8A header for why.
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
    // FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (architect brief
    // 2026-07-25-devteam-idle-chain-rotation-durable-inbox.md §2.1) —
    // dispatcher-internal bookkeeping for the 5-consumer aged round-robin
    // (rotation.{bounded1,sls,rlc,qa_drain,step1_triage}.last_served_tick)
    // + the durable pending_triage_inbox[] handoff. Same precedent as
    // narrative/dashboard_section_cache/session_handoff_status below:
    // loosely typed, dispatcher-internal, not a user-facing/cross-agent
    // contract — doesn't need a fully enumerated shape.
    dev_team_idle_chain:     z.record(z.unknown()).optional(),
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

    // ── NEW: RC-VERIF completion gate (§ 8A) ─────────────────────────────────
    checkVerificationGate(data.task_board, ctx);
  });

export type OrchState = z.infer<typeof OrchStateSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 8A. RC-VERIF COMPLETION GATE (write-time, hard fail — extends § 8's superRefine)
// Task: SYSREMAKE-P2-T2-SCHEMA-ADDITIONS
// Source: docs/architecture-briefs/2026-07-17-sysremake-p2-rcverif-rcconverge.md §2.2/§2.5
//
// Placed AFTER OrchStateSchema (not before) is safe: `checkVerificationGate` is a
// `function` declaration (hoisted across the whole module) and is only ever
// INVOKED later, inside the superRefine callback, by which time module
// evaluation has already run top-to-bottom and RC_VERIF_GRANDFATHERED_IDS below
// is initialized — no TDZ risk (unlike § 1A's RawProbeSchema/VerificationSchema,
// which TaskSchema's `z.object()` call evaluates IMMEDIATELY at import time and
// therefore had to be defined earlier in the file, before § 2).
//
// GATE: any row with status DONE_VERIFIED must carry a valid
// verification.raw_probe{tool,args,live_value_observed,observed_at} — UNLESS its
// id is in the frozen RC_VERIF_GRANDFATHERED_IDS allowlist below (pre-existing
// rows that predate this gate; backfilling raw_probe on already-completed work
// would itself be fabrication — see brief §2.5). Any row with status DEGRADED
// must carry verification.honest_gap_reason.
// ADDITION (FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT, brief §5c,
// 2026-08-28 — land 7/7 of brief §9's files): P0/P1-equivalent apps/ rows minted
// at/after BEHAVIOR_PREDICATE_CUTOFF must ALSO carry a mint-time
// verification.behavior_predicate{cmd,expect} — the literal enforcement of "a
// row may not reach DONE_VERIFIED on diff-reading alone" for the population
// where it matters (apps/ rows ship inside rebuilt Docker images). Grandfathered
// BY TIME (created_at/declared_at < cutoff), never by id-list — every pre-cutoff
// row predates behavior_predicate as a mint-time field (AC-4 no-wedge mandate).
//
// RC_VERIF_GRANDFATHERED_IDS is FROZEN and CLOSED — it must NEVER grow. Derived
// ONCE, live, immediately before this implementation (SYSREMAKE-P2-T1-GRANDFATHER-
// JQ-QUERY, 2026-08-08T18:xx Z), by re-running the brief's §2.4 jq query — WIDENED
// beyond the brief's original active_sprints/closed_sprints-only scope to all 9
// task-bearing lanes (matching checkVerificationGate's own scan below), because
// live data confirmed 18 additional non-compliant DONE_VERIFIED rows had
// accumulated in the flat done[]/done_verified[] lanes since the brief was
// authored (2026-07-17) — the post-SHG hot/cold split moved rows there that the
// brief's snapshot never saw. Using the brief's narrower query verbatim would
// have bricked the live hot file on the very next write (the exact must-fix risk
// the brief itself names in §2.5) — re-derived per T1's own mandate ("re-derive,
// do not trust this brief's snapshot count"), not the brief's literal query text:
//   jq -r '([.task_board.backlog[]?, .task_board.done[]?, .task_board.done_verified[]?,
//     .task_board.in_progress[]?, .task_board.qa[]?, .task_board.ready[]?, .task_board.review[]?,
//     .task_board.active_sprints[].tasks[]?, .task_board.closed_sprints[].tasks[]?]
//     | .[] | select(.status=="DONE_VERIFIED" and (.verification.raw_probe // null | not)) | .id)'
//     docs/data/orch/orch-state.json | sort -u
// New rows can NEVER enter this set — the gate applies unconditionally to any id
// not already listed. As grandfathered rows get cold-evicted, they leave this
// schema's purview entirely and the list becomes silently inert (§2.5).
//
// AMENDMENT (FIX-RCVERIF-GRANDFATHER-EXEMPTION-IGNORES-RETRACTION-VOID-MARKERS,
// 2026-08-23): "FROZEN and CLOSED — must NEVER grow" governs additions, not
// mistaken entries. QA proved live that "FU-RAG-DEPLOY-MEMORY" (a still-`QA`-
// lane, never-certified P0 with an active blocked chain) was wrongly present —
// the exemption is meant only for genuinely pre-existing *certified* rows that
// predate this gate, and a row that has never been certified has nothing
// legitimate to grandfather. Removed below (allowlist count 51→50). Do NOT
// blindly re-add it on a future re-derivation of this list without re-checking
// that the row has since been legitimately certified.
// ═══════════════════════════════════════════════════════════════════════════════

const RC_VERIF_GRANDFATHERED_IDS: ReadonlySet<string> = new Set([
  "BAL-1a-BACKFILL-IMPL",
  "BAL-1a-DEV",
  "BAL-1a-QA",
  "BAL-1b-DEV",
  "BAL-1d-DEV",
  "BAL-1f",
  "BCTC-HIST-SEED",
  "CONTAM-10-WRITER-H",
  "FACTORY-STOCK-vndirect-mapper-tests",
  "FACTORY-TECHANALYSIS-dedup-calculator",
  "FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT",
  "FIX-CI-SIZELINT-MACROTOOLS-HUMANIZE-618L",
  "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2",
  "FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT",
  "FIX-DE-3",
  "FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION",
  "FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN",
  "FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED",
  "FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP",
  "FIX-FB-GATE-SECTOR-NAME-VALIDATOR",
  "FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL",
  "FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER",
  "FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM",
  "FU-BACKFILL-DE-SYNC",
  "FU-BCTC-TOOL-PARAMS",
  "FU-DE-321-VAY-GUARD",
  "FU-DE-SERVE-HONEST",
  // "FU-RAG-DEPLOY-MEMORY" REMOVED 2026-08-23 — see AMENDMENT note in the § 8A
  // block comment above (task FIX-RCVERIF-GRANDFATHER-EXEMPTION-IGNORES-
  // RETRACTION-VOID-MARKERS). Never-certified, still-QA-lane row; do not re-add.
  "HSC-1",
  "HSC-2",
  "HSC-3",
  "HSC-4",
  "HSC-5",
  "HSC-6",
  "HSC-7",
  "OPS-REBUILD-MCP-SERVER-OPENSSH",
  "RLI-FORENSICS-CLEANUP",
  "SSOT-W1-HOOK-ENFORCE",
  "SSOT-W1-ORCH-APPLY-WRAPPER",
  "SSOT-W1-SERVER-ENFORCE",
  "TASK-501-MOMENTUM-API-HANDLER",
  "TASK-502-MOMENTUM-FRONTEND",
  "TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES",
  "TE-T11",
  "TE-T12",
  "VMT-7-REGISTER",
  "VMT-7a-TRADE-BALANCE-HANDLER",
  "VMT-7b-BOP-HANDLER",
  "VMT-7c-MACRO-INDICATORS-HANDLER",
  "VMT-7d-CPI-COMPONENTS-HANDLER",
  "VMT-7e-LIQUIDITY-STATE-HANDLER",
]);

function hasValidRawProbe(v: unknown): boolean {
  const parsed = VerificationSchema.safeParse(v);
  if (!parsed.success || !parsed.data.raw_probe) return false;
  const p = parsed.data.raw_probe;
  return Boolean(p.tool) && p.args !== undefined && p.live_value_observed !== undefined && Boolean(p.observed_at);
}

function hasHonestGapReason(v: unknown): boolean {
  const parsed = VerificationSchema.safeParse(v);
  return parsed.success && Boolean(parsed.data.honest_gap_reason);
}

// ── Behavior-predicate gate constants (FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT,
// brief §5c) ────────────────────────────────────────────────────────────────────
// BEHAVIOR_PREDICATE_CUTOFF: exact commit-landing timestamp of the mint-side
// capability (docs/agents/po/flow/main.md commit ee158a9ea, 2026-08-26T19:58:30Z)
// minus 36s — deliberately conservative so mint-side is never behind enforcement
// (AC-4). Rows minted BEFORE this cutoff are grandfathered BY TIME (AC-6), never
// by id-list: every P0/P1 apps/ row already on the board predates behavior_predicate
// as a mint-time field and cannot fix it by doing the work right.
// BEHAVIOR_PREDICATE_PRIORITIES: live board measures 317xP1/61xP0/82x'high'/
// 1x'HIGH' (2026-08-26) — match the full P0/P1-equivalent set, never a bare
// === 'P0' || === 'P1' string check (AC-3).
const BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z";
const BEHAVIOR_PREDICATE_PRIORITIES: ReadonlySet<string> = new Set(["P0", "P1", "high", "HIGH"]);

/**
 * Valid mint-time behavioral predicate: verification.behavior_predicate{cmd,expect}
 * with a non-empty cmd and an expect that is defined (brief §5c). Mirrors the
 * hasValidRawProbe/hasHonestGapReason pattern — safeParse()s VerificationSchema
 * (which .passthrough()s, so behavior_predicate is schema-legal today with zero
 * migration) and reads the nested field.
 */
function hasValidBehaviorPredicate(v: unknown): boolean {
  const parsed = VerificationSchema.safeParse(v);
  if (!parsed.success) return false;
  const bp = (parsed.data as { behavior_predicate?: { cmd?: unknown; expect?: unknown } }).behavior_predicate;
  return Boolean(bp?.cmd) && bp?.expect !== undefined;
}

/**
 * Iterates ALL 9 task-bearing lanes ("by construction", same lane set as
 * collectAllTaskIds) — DONE_VERIFIED/DEGRADED can appear in any of them per
 * LANE_ALLOWED_STATUSES, so limiting the check to backlog[] alone would leave
 * lanes unguarded.
 */
function checkVerificationGate(tb: z.infer<typeof TaskBoardSchema>, ctx: z.RefinementCtx): void {
  const flatLanes = ["backlog", "done", "done_verified", "in_progress", "qa", "ready", "review"] as const;

  const checkOne = (row: Record<string, unknown>, path: (string | number)[]) => {
    const id = String(row["id"] ?? row["task_id"] ?? "(no-id)");
    if (row["status"] === "DONE_VERIFIED" && !RC_VERIF_GRANDFATHERED_IDS.has(id)) {
      if (!hasValidRawProbe(row["verification"])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "verification", "raw_probe"],
          message:
            `task "${id}" set to DONE_VERIFIED without verification.raw_probe{tool,args,` +
            `live_value_observed,observed_at}. fix: attach a live independent re-probe, ` +
            `or set status to DONE pending verification.`,
        });
      }
      // ── Behavior-predicate hard-reject (FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT,
      // brief §5c) — the literal enforcement of "a row may not reach DONE_VERIFIED on
      // diff-reading alone" for the population where it matters: P0/P1-equivalent apps/
      // rows minted at/after BEHAVIOR_PREDICATE_CUTOFF must carry a mint-time
      // verification.behavior_predicate{cmd,expect}. Grandfathered by TIME (created_at
      // < cutoff), never by id-list; grandfather-list exemption mirrors the raw_probe gate.
      const mintedAt = String(row["created_at"] ?? row["declared_at"] ?? "");
      if (
        String(row["zone"] ?? "").startsWith("apps/") &&
        BEHAVIOR_PREDICATE_PRIORITIES.has(String(row["priority"] ?? "")) &&
        mintedAt >= BEHAVIOR_PREDICATE_CUTOFF &&
        !hasValidBehaviorPredicate(row["verification"])
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "verification", "behavior_predicate"],
          message:
            `task "${id}" (P0/P1 apps/, minted ${mintedAt}) set to DONE_VERIFIED without ` +
            `verification.behavior_predicate{cmd,expect}. fix: PO/BA re-author the predicate ` +
            `at mint (docs/agents/po/flow/main.md), or set status to DONE pending verification.`,
        });
      }
    }
    if (row["status"] === "DEGRADED" && !hasHonestGapReason(row["verification"])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "verification", "honest_gap_reason"],
        message:
          `task "${id}" set to DEGRADED without verification.honest_gap_reason. ` +
          `fix: state why the live artifact could not be independently verified.`,
      });
    }
  };

  for (const lane of flatLanes) {
    const tasks = (tb as Record<string, unknown>)[lane];
    if (!Array.isArray(tasks)) continue;
    tasks.forEach((t, i) => checkOne(t as Record<string, unknown>, ["task_board", lane, i]));
  }
  [tb.active_sprints, tb.closed_sprints ?? []].forEach((sprintArr, si0) => {
    const sprintKey = si0 === 0 ? "active_sprints" : "closed_sprints";
    sprintArr.forEach((sprint, si) => {
      (sprint.tasks ?? []).forEach((t, i) =>
        checkOne(t as Record<string, unknown>, ["task_board", sprintKey, si, "tasks", i]),
      );
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 9. LANE-STATUS COHERENCE (ADD-2)
// Standalone function (not a superRefine) so the validator CLI can call it
// without the schema parse blocking on coherence violations during the SHG
// data-migration period (backlog[] still has pre-SHG-2 REVIEW/IN_PROGRESS/
// DONE stragglers). Promote to a superRefine once SHG-2 + SHG-4 land.
// Source: SSOT-zod-validation-directive-2026-06-27.md ADD-2. Extended by D2.5
// (PO-ratified 2026-07-10T18:41Z, commit aa1901c72): BLOCKED is an orthogonal
// sub-state of backlog/review/in_progress (needs blocked_reason/verify_note);
// qa/done/done_verified/ready unchanged.
//   backlog→{BACKLOG,BLOCKED}  review→{REVIEW,BLOCKED}  qa→{QA}
//   done→{DONE,DONE_VERIFIED}  done_verified→{DONE_VERIFIED}
//   ready→{READY,TODO}  in_progress→{IN_PROGRESS,BLOCKED}
// ═══════════════════════════════════════════════════════════════════════════════

export interface LaneCoherenceIssue {
  lane: string;
  taskId: string;
  status: string;
  allowedStatuses: string[];
  /** Auto-fix hint for the writing agent. */
  fix: string;
}

/**
 * ADD-2 lane → allowed status set mapping.
 * RC-VERIF (2026-07-17 brief §2.4): DEGRADED added to exactly review/qa — a
 * post-work state ("attempted, tests may be green, but not independently
 * re-verified"), structurally closer to REVIEW/QA than backlog/in_progress
 * (which would let an agent declare it before even attempting the fix).
 */
export const LANE_ALLOWED_STATUSES: Readonly<Record<string, ReadonlySet<string>>> = {
  backlog:       new Set(["BACKLOG", "BLOCKED"]),
  review:        new Set(["REVIEW", "BLOCKED", "DEGRADED"]),
  qa:            new Set(["QA", "DEGRADED"]),
  done:          new Set(["DONE", "DONE_VERIFIED"]),
  done_verified: new Set(["DONE_VERIFIED"]),
  ready:         new Set(["READY", "TODO"]),
  in_progress:   new Set(["IN_PROGRESS", "BLOCKED"]),
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

// ═══════════════════════════════════════════════════════════════════════════════
// § 11. SPRINT-GOAL TERMINAL-STATUS CANONICALIZATION (write-time drift guard)
// Task: FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT
//
// .sprint_goal.entries[] is NOT schema-enforced (only z.record(z.unknown()) at §8;
// full typing is backlogged SSOT-W2-SPRINT-GOAL-PRUNE). This guard closes ONE
// recurring drift class without waiting for that full schema: sprint sign-off
// paths write non-canonical terminal-status synonyms/case-variants (CLOSED,
// COMPLETE, done, ...) that orch-cold-evict.sh's TERMINAL_SET predicate never
// matches, so the entry is stranded and .sprint_goal.entries grows unbounded
// (26 seen, cap 15; feedback_coldevict_complete_status_drift).
//
// SPRINT_GOAL_TERMINAL_ALIASES: uppercase(raw status) -> canonical TERMINAL_SET
// token; a violation is "uppercases to a mapped alias but isn't already
// byte-identical to it" — narrow "close but not canonical" check, not a full
// enum. Non-terminal tokens (OPEN, ACTIVE, PLANNING, ...) are untouched by
// design (closing a sprint is a PO editorial act).
//
// Called by scripts/orch-validate.mjs (Stage 1d, hard fail) and (rides next
// rebuild) orchStateStore.ts's write path. Keep in lock-step with the
// identical alias map in scripts/fix-sprint-goal-status-drift-evict-
// normalize.jq (one-time AC-1 normalizer) — both must recognize the same shapes.
// ═══════════════════════════════════════════════════════════════════════════════

export const SPRINT_GOAL_TERMINAL_ALIASES: Readonly<Record<string, Status>> = {
  DONE: "DONE",
  CLOSED: "DONE",
  COMPLETE: "DONE",
  COMPLETED: "DONE",
  DONE_VERIFIED: "DONE_VERIFIED",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
  DEFERRED: "DEFERRED",
  SKIPPED: "SKIPPED",
};

export interface SprintGoalStatusIssue {
  sprintId: string;
  index: number;
  status: string;
  canonical: Status;
  fix: string;
}

/**
 * Check `.sprint_goal.entries[].status` for non-canonical terminal-status
 * drift (synonyms/case-variants of the TERMINAL_SET tokens). Returns an array
 * of issues (empty = fully canonical, or no sprint_goal/entries present).
 *
 * Deliberately accepts a loosely-typed `doc` (not `OrchState`) because
 * `.sprint_goal` is currently `z.record(z.unknown())` in OrchStateSchema — this
 * lets the same function validate throwaway fixture objects and raw
 * `JSON.parse` output identically (no schema coupling required).
 */
export function checkSprintGoalStatusCanonical(
  doc: Record<string, unknown>,
): SprintGoalStatusIssue[] {
  const issues: SprintGoalStatusIssue[] = [];
  const sprintGoal = doc["sprint_goal"];
  if (sprintGoal == null || typeof sprintGoal !== "object") return issues;
  const entries = (sprintGoal as Record<string, unknown>)["entries"];
  if (!Array.isArray(entries)) return issues;

  entries.forEach((entry, index) => {
    if (entry == null || typeof entry !== "object") return;
    const e = entry as Record<string, unknown>;
    const status = e["status"];
    if (typeof status !== "string" || status.length === 0) return;
    const sprintId = typeof e["sprint_id"] === "string" ? (e["sprint_id"] as string) : "(no-sprint_id)";
    const canonical = SPRINT_GOAL_TERMINAL_ALIASES[status.toUpperCase()];
    if (canonical != null && status !== canonical) {
      issues.push({
        sprintId,
        index,
        status,
        canonical,
        fix:
          `sprint_goal.entries[${index}] (sprint_id="${sprintId}").status: "${status}" is a ` +
          `non-canonical terminal-status token — write "${canonical}" instead (matches ` +
          `TERMINAL_SET so scripts/orch-cold-evict.sh can evict it).`,
      });
    }
  });

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 12. DECORATIVE SEQUENCING FIELD GUARD (blocks / co_edit)
// Task: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE
//
// ROOT CAUSE: `blocks`/`co_edit` read as sequencing/atomic-ship constraints on
// a task_board row but are WRITE-ONLY (grep-confirmed zero consumers across
// scripts/lib/*.jq, scripts/devteam-*.jq, scripts/orch-*.mjs/.sh,
// scripts/agents-flow/*.sh). `effective_depends_on()` in
// scripts/lib/devteam-eligibility.jq only reads a row's own
// depends_on/depends/blocked_by — never a reverse `blocks` edge from another
// row, and `co_edit` has no forward-field equivalent at all. An author
// writing `blocks: ["X"]` creates zero enforcement with no way to tell from
// the board alone (PO's own guard on FU-BACKFILL-REAL-FILENAMES was silently
// non-binding — the live proof).
//
// GUARD SEMANTICS (write-time; wired as Stage 1e in scripts/orch-validate.mjs):
//   blocks: absent/empty → OK. Not an array of non-empty strings → HARD-FAIL.
//     Names an id absent from task_board → HARD-FAIL (unverifiable). Names a
//     real row that does NOT carry the source id back in its own
//     depends_on/depends/blocked_by → HARD-FAIL (the reverse-only-edge trap:
//     `blocks` alone binds nothing until the TARGET row adds the real forward
//     edge; once it does, `blocks` is truthful documentation of an edge
//     devteam-eligibility.jq actually reads).
//   co_edit: absent/empty → OK. Any non-empty value → HARD-FAIL,
//     unconditionally — no forward-field equivalent exists anywhere in the
//     schema, so it can never be validated as bound. Encode atomic-ship
//     intent as prose plus a one-directional `depends_on` edge instead.
//
// One-time data migration: scripts/fix-orchstate-blocks-coedit-decorative-normalize.jq
// Called by scripts/orch-validate.mjs (Stage 1e, after Stage 1d, hard fail).
// ═══════════════════════════════════════════════════════════════════════════════

/** null → [], bare string → [string], array → as-is (mirrors scripts/lib/devteam-eligibility.jq's as_dep_array). */
function toIdArray(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return v.length > 0 ? [v] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [];
}

/** Union of a row's own depends_on/depends/blocked_by — the ONLY fields effective_depends_on() actually reads. */
function forwardEdgeIds(row: Record<string, unknown>): string[] {
  return [
    ...toIdArray(row["depends_on"]),
    ...toIdArray(row["depends"]),
    ...toIdArray(row["blocked_by"]),
  ];
}

/** id -> row object, across all 9 task-bearing lanes (flat + sprint-nested, active + closed). First occurrence wins on a duplicate id. */
function collectTasksById(tb: z.infer<typeof TaskBoardSchema>): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();

  const add = (tasks: TaskLane | undefined) => {
    if (!tasks) return;
    for (const t of tasks) {
      const raw = t as Record<string, unknown>;
      if (typeof raw["id"] === "string" && raw["id"] && !byId.has(raw["id"])) {
        byId.set(raw["id"], raw);
      }
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
  for (const sprint of tb.active_sprints) add(sprint.tasks);
  for (const sprint of (tb.closed_sprints ?? [])) add(sprint.tasks);

  return byId;
}

export interface DecorativeFieldIssue {
  path: string;
  taskId: string;
  field: "blocks" | "co_edit";
  message: string;
  fix: string;
}

/**
 * Check every task_board row (all 9 lane shapes) for a reverse-only `blocks`
 * edge or any non-empty `co_edit` value — see § 12 header for full semantics.
 * Returns an array of issues (empty = fully compliant).
 */
export function checkDecorativeSequencingFields(data: OrchState): DecorativeFieldIssue[] {
  const issues: DecorativeFieldIssue[] = [];
  const tb = data.task_board;
  const byId = collectTasksById(tb);

  const visitRow = (row: Record<string, unknown>, path: string) => {
    const taskId = typeof row["id"] === "string" ? (row["id"] as string) : "(no-id)";

    // ── blocks ──────────────────────────────────────────────────────────
    if (Object.prototype.hasOwnProperty.call(row, "blocks") && row["blocks"] != null) {
      const blocksVal = row["blocks"];
      const isValidArray =
        Array.isArray(blocksVal) && blocksVal.every((x) => typeof x === "string" && x.length > 0);

      if (!isValidArray) {
        issues.push({
          path,
          taskId,
          field: "blocks",
          message: `"blocks" is not an array of non-empty task-id strings (got ${JSON.stringify(blocksVal)}).`,
          fix:
            `"blocks" is read by nothing in this repo (grep-confirmed) — move free-form text to a ` +
            `dated annotation key (e.g. "po_<topic>_<date>") and either remove "blocks" or replace it ` +
            `with an array of real task ids.`,
        });
      } else if ((blocksVal as string[]).length > 0) {
        for (const targetId of blocksVal as string[]) {
          const target = byId.get(targetId);
          if (!target) {
            issues.push({
              path,
              taskId,
              field: "blocks",
              message: `"blocks" names target id "${targetId}" which does not resolve to any task_board row.`,
              fix: `fix the id typo, or remove "${targetId}" from "blocks" — an unresolvable id can never be verified as bound.`,
            });
            continue;
          }
          if (!forwardEdgeIds(target).includes(taskId)) {
            issues.push({
              path,
              taskId,
              field: "blocks",
              message:
                `"blocks" names "${targetId}", but "${targetId}" does not carry "${taskId}" in its own ` +
                `depends_on/depends/blocked_by — this is a REVERSE-ONLY edge and binds nothing ` +
                `(scripts/lib/devteam-eligibility.jq's effective_depends_on never traverses "blocks").`,
              fix: `add "${taskId}" to task "${targetId}"'s "depends_on" (or "blocked_by") array, or remove "blocks" from "${taskId}".`,
            });
          }
        }
      }
    }

    // ── co_edit ─────────────────────────────────────────────────────────
    if (Object.prototype.hasOwnProperty.call(row, "co_edit") && row["co_edit"] != null) {
      const coEditVal = row["co_edit"];
      const isEmptyArray = Array.isArray(coEditVal) && coEditVal.length === 0;
      if (!isEmptyArray) {
        issues.push({
          path,
          taskId,
          field: "co_edit",
          message:
            `"co_edit" is read by nothing anywhere in this repo (grep-confirmed, no path/extension ` +
            `restriction) and has no forward-field equivalent, so it can never be validated as bound.`,
          fix:
            `remove "co_edit" and encode the atomic-ship intent as prose plus a one-directional ` +
            `"depends_on" edge that at least serialises the two rows.`,
        });
      }
    }
  };

  const visitLane = (tasks: TaskLane | undefined, laneLabel: string) => {
    if (!tasks) return;
    tasks.forEach((t, i) => visitRow(t as Record<string, unknown>, `task_board.${laneLabel}[${i}]`));
  };

  visitLane(tb.backlog, "backlog");
  visitLane(tb.done, "done");
  visitLane(tb.done_verified, "done_verified");
  visitLane(tb.in_progress, "in_progress");
  visitLane(tb.qa, "qa");
  visitLane(tb.ready, "ready");
  visitLane(tb.review, "review");
  visitLane(tb.archive, "archive");
  tb.active_sprints.forEach((sprint, si) =>
    visitLane(sprint.tasks, `active_sprints[${si}].tasks`),
  );
  (tb.closed_sprints ?? []).forEach((sprint, si) =>
    visitLane(sprint.tasks, `closed_sprints[${si}].tasks`),
  );

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 13. .depends / .depends_on DIVERGENCE GUARD (write-time, hard fail)
// Task: FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS AC-3
//
// ROOT CAUSE this closes: scripts/lib/devteam-eligibility.jq's
// effective_depends_on() (line ~188) is a CONCATENATION —
// `(.depends_on|as_dep_array) + (.depends|as_dep_array) + (.blocked_by|as_dep_array)`.
// Editing exactly one of those fields can only GROW the effective dependency
// set a picker resolves, never shrink it. Commit 2833b71bf (2026-07-29)
// deleted duplicate rows S1-SCHEMA-SELECTION / P1B-STAMP and wrote the
// corrected reference set into `.depends_on` on 3 rows, but never touched
// the legacy `.depends` field those same rows still carried — the deleted
// ids stayed resident there and the union kept resurrecting them.
// deps_satisfied() maps an unresolvable id to "MISSING" and requires ALL
// deps DONE_VERIFIED (fail-CLOSED) — so those 3 rows, plus 2 more that
// depended on them, were permanently un-dispatchable for 3 days (2026-07-29
// to 2026-08-01) before being caught (5 P0 rows total).
//
// This guard closes the class at write time: a row that carries BOTH
// `.depends` and `.depends_on` where `.depends` names an id NOT present in
// `.depends_on` is rejected — the author must reconcile both fields to the
// same set (or clear the stale one) instead of leaving a silently
// resurrectable orphan behind.
//
// Deliberately scoped to `.depends` vs `.depends_on` ONLY (not
// `.blocked_by`, which the AC does not implicate) — widening the check
// beyond the exact incident shape is an unverified generalization this
// task does not make (feedback_gate_widening_recommendation_requires_
// actuator_dry_run).
//
// HARD-FAIL (like Stage 1c/1e siblings): live-verified 0 violations across
// all 9 task-bearing lanes on 2026-08-01 (post AC-1 cleanup on the 3
// incident rows), so flipping this on cannot break any live row today.
//
// Called by scripts/orch-validate.mjs (Stage 1f, after Stage 1e, hard fail).
// ═══════════════════════════════════════════════════════════════════════════════

export interface DependsDivergenceIssue {
  path: string;
  taskId: string;
  depends: unknown;
  dependsOn: unknown;
  extraIds: string[];
  message: string;
  fix: string;
}

/**
 * Check every task_board row (all 9 lane shapes) for a `.depends` value that
 * names an id absent from `.depends_on` while BOTH fields are present — the
 * exact shape of the FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS incident. Returns
 * an array of issues (empty = fully reconciled, or one/both fields absent).
 */
export function checkDependsDivergence(data: OrchState): DependsDivergenceIssue[] {
  const issues: DependsDivergenceIssue[] = [];
  const tb = data.task_board;

  const visitRow = (row: Record<string, unknown>, path: string) => {
    const dependsRaw = row["depends"];
    const dependsOnRaw = row["depends_on"];
    // Only compare when BOTH fields are present — a row carrying only one
    // of the two is not a "divergence" (nothing to reconcile against).
    if (dependsRaw == null || dependsOnRaw == null) return;

    const dependsIds = toIdArray(dependsRaw);
    const dependsOnIds = new Set(toIdArray(dependsOnRaw));
    const extraIds = dependsIds.filter((id) => !dependsOnIds.has(id));
    if (extraIds.length === 0) return;

    const taskId = typeof row["id"] === "string" ? (row["id"] as string) : "(no-id)";
    issues.push({
      path,
      taskId,
      depends: dependsRaw,
      dependsOn: dependsOnRaw,
      extraIds,
      message:
        `"depends" names ${JSON.stringify(extraIds)} which "depends_on" does not carry. ` +
        `scripts/lib/devteam-eligibility.jq's effective_depends_on() UNIONS both fields — a ` +
        `stale/deleted id left in "depends" alone is silently resurrected forever and can ` +
        `fail-close deps_satisfied() permanently (the FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS ` +
        `incident, 2026-07-29 to 2026-08-01, starved 5 P0 rows for 3 days).`,
      fix:
        `reconcile "depends" and "depends_on" to the same id set — either add ${JSON.stringify(extraIds)} ` +
        `to "depends_on" (if still a real, live dependency) or remove ${JSON.stringify(extraIds)} from ` +
        `"depends" (if stale/deleted).`,
    });
  };

  const visitLane = (tasks: TaskLane | undefined, laneLabel: string) => {
    if (!tasks) return;
    tasks.forEach((t, i) => visitRow(t as Record<string, unknown>, `task_board.${laneLabel}[${i}]`));
  };

  visitLane(tb.backlog, "backlog");
  visitLane(tb.done, "done");
  visitLane(tb.done_verified, "done_verified");
  visitLane(tb.in_progress, "in_progress");
  visitLane(tb.qa, "qa");
  visitLane(tb.ready, "ready");
  visitLane(tb.review, "review");
  visitLane(tb.archive, "archive");
  tb.active_sprints.forEach((sprint, si) =>
    visitLane(sprint.tasks, `active_sprints[${si}].tasks`),
  );
  (tb.closed_sprints ?? []).forEach((sprint, si) =>
    visitLane(sprint.tasks, `closed_sprints[${si}].tasks`),
  );

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 14. MISSING-DEPENDENCY REPORT (non-fatal, write-time visibility only)
// Task: FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS AC-3
//
// Reports (does NOT hard-fail) rows whose effective dependency set
// (depends_on ∪ depends ∪ blocked_by, mirroring effective_depends_on() in
// scripts/lib/devteam-eligibility.jq) names an id that resolves to MISSING
// in BOTH the hot board's 7 flat lanes (the same lane set dep_status_map()
// scans: backlog/ready/in_progress/qa/review/done/done_verified) and the
// cold archive (docs/data/orch/archive/YYYY-MM.json .done_tasks[]).
//
// Deliberately NOT a hard-fail: FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-
// RESOLVES-MISSING (review[], P1 at the time this was written) explicitly
// ratifies this as "a separate, smaller class" of genuine unknowns/
// free-text deps (typos, prose left in a dependency field, ids that
// predate the board entirely) — NOT every instance is a bug, and
// deps_satisfied() already treats MISSING as UNSATISFIED-but-not-fatal by
// design (do not "fix" this by making it satisfied — see that row's own
// negative-control ACs). This report exists purely so a human/PO can see
// the live count without re-running a bespoke jq one-liner each time.
//
// SCOPE — flat lanes (backlog/done/done_verified/in_progress/qa/ready/
// review/archive) + closed_sprints[].tasks[]. Deliberately EXCLUDES
// active_sprints[].tasks[]: dep_status_map() never scans into
// active_sprints/closed_sprints when building its id->status map (only the
// 7 flat lanes + cold archive), so EVERY intra-sprint dependency edge (a
// live sprint task naming a sibling task in the SAME still-open sprint) is
// trivially "MISSING" by construction regardless of whether that sibling
// actually finished — that is normal in-flight WIP sequencing, not a
// signal of this task's root-cause class, and live-measured at ~47 rows
// (vs. 8 in the included scope below) — including it would swamp genuine
// signal with structural noise. closed_sprints IS included because a
// CLOSED sprint's dependency graph is settled/frozen — any residual
// MISSING dep there will never resolve on its own and is a legitimate
// one-time cleanup candidate, the same class as the flat lanes.
//
// Live-verified 2026-08-01: 8 rows in scope (4 backlog, 4 closed_sprints),
// all genuine unknowns/free-text (e.g. "user-escalation-vps-restart", ids
// with a trailing " — explanation" clause appended) or historical
// sprint-internal ids — none is the resurrected-stale-board-id shape
// Stage 1f (§13 above) targets. This report must not regress that count to
// a hard-fail — see scripts/orch-validate.mjs Stage 1g.
//
// Called by scripts/orch-validate.mjs (Stage 1g, after Stage 1f, REPORT
// ONLY — never exit(2) on these issues).
// ═══════════════════════════════════════════════════════════════════════════════

export interface MissingDependencyReportIssue {
  path: string;
  taskId: string;
  missingIds: string[];
}

/**
 * Hot-lane id set mirroring dep_status_map()'s own 7-lane scan
 * (scripts/lib/devteam-eligibility.jq) — the id space a dependency can
 * resolve against WITHOUT falling back to the cold archive.
 */
export function collectHotDepStatusLaneIds(tb: z.infer<typeof TaskBoardSchema>): Set<string> {
  const ids = new Set<string>();
  const add = (tasks: TaskLane | undefined) => {
    if (!tasks) return;
    for (const t of tasks) {
      const raw = t as Record<string, unknown>;
      if (typeof raw["id"] === "string" && raw["id"]) ids.add(raw["id"]);
    }
  };
  add(tb.backlog);
  add(tb.ready);
  add(tb.in_progress);
  add(tb.qa);
  add(tb.review);
  add(tb.done);
  add(tb.done_verified);
  return ids;
}

/**
 * Report rows (flat lanes + closed_sprints[].tasks[] — see § 14 header for
 * why active_sprints is excluded) whose effective dependency set names an
 * id absent from `resolvedIds` (the caller-injected union of hot-lane ids
 * ∪ cold-archive done_tasks ids — kept as an injected parameter, mirroring
 * checkRefIntegrity's FileResolver pattern, so this stays unit-testable
 * without real filesystem access). Never hard-fails — REPORT ONLY.
 */
export function checkMissingDependencyReport(
  data: OrchState,
  resolvedIds: Set<string>,
): MissingDependencyReportIssue[] {
  const issues: MissingDependencyReportIssue[] = [];
  const tb = data.task_board;

  const visitRow = (row: Record<string, unknown>, path: string) => {
    const effIds = forwardEdgeIds(row); // depends_on ∪ depends ∪ blocked_by
    if (effIds.length === 0) return;
    const taskId = typeof row["id"] === "string" ? (row["id"] as string) : "(no-id)";
    const missingIds = effIds.filter((id) => !resolvedIds.has(id));
    if (missingIds.length > 0) {
      issues.push({ path, taskId, missingIds });
    }
  };

  const visitLane = (tasks: TaskLane | undefined, laneLabel: string) => {
    if (!tasks) return;
    tasks.forEach((t, i) => visitRow(t as Record<string, unknown>, `task_board.${laneLabel}[${i}]`));
  };

  visitLane(tb.backlog, "backlog");
  visitLane(tb.done, "done");
  visitLane(tb.done_verified, "done_verified");
  visitLane(tb.in_progress, "in_progress");
  visitLane(tb.qa, "qa");
  visitLane(tb.ready, "ready");
  visitLane(tb.review, "review");
  visitLane(tb.archive, "archive");
  (tb.closed_sprints ?? []).forEach((sprint, si) =>
    visitLane(sprint.tasks, `closed_sprints[${si}].tasks`),
  );
  // active_sprints[] deliberately excluded — see § 14 header.

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 15. SPRINT-REGISTRY DANGLING-ID CLASSIFICATION (reconciliation, read-only)
// Task: FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
//
// CLASSIFICATION ONLY. This function and every caller of it are read-only — no
// orch-state.json write happens here or in its CLI wrapper
// (scripts/audits/verify-sprint-registry-referential-integrity.mjs). Per the
// board row's supervision note (po_goahead_20260822T201220Z): the actual
// dangling-id/active-sprint reconciliation write to the LIVE file requires a
// separate PO sign-off pass on this function's regenerated output first.
//
// Encodes the design brief's §11 amendment (docs/architecture-briefs/
// 2026-08-08-fix-sprint-registry-dangling-ids-reconciliation-design.md) AS
// CORRECTED by the board row's po_review_note (2026-08-22 PO re-ratification,
// 3 BINDING corrections B1/B2/B3 + Q4 ruling) — those corrections supersede
// §11.3/§11.4/§11.7/§11.8 wherever they conflict:
//
//   B1 — STEP 0 (a dangling id that is itself a real task id elsewhere → the
//        id is not a sprint, RELABEL every referencing row to that task's own
//        `.sprint`) is GUARDED: (a) an existing `sprint_goal.entries[]` entry
//        for the id is authoritative evidence it WAS minted as a sprint id —
//        STEP 0 must not relabel it (falls to the ordinary branch table
//        instead); (b) a self-referential row (row.id === row.sprint === the
//        dangling id) is a 1-hop RELABEL cycle — STRIP, never relabel. The
//        collision set itself is derived by walking the real task-id universe
//        every call (hot ∪ injected cold), never a hardcoded name list.
//   B2 — the branch table checks TERMINALITY before LANE: a goal status
//        terminal (TERMINAL_SET, canonicalized) with every referencing row
//        also terminal-status is FINISHED, checked BEFORE the non-backlog-lane
//        LIVE check. The old order let a lone DONE_VERIFIED row register a
//        FINISHED sprint into active_sprints[] — which
//        scripts/agents-flow/decision-journal-archive.sh then pins as
//        permanently un-archivable (PROCESS_IDS = CLOSED_IDS − ACTIVE_IDS).
//   Q4 — sprint_goal liveness is a CLOSED liveness-asserting-token set (the
//        exact literal "active") union the CLOSED TERMINAL_SET; every other
//        token (PLANNING, OPEN, any future vocabulary) is non-asserting and
//        falls through to the task-lane signal, then to PRE_SPRINT_LABEL
//        (exempt) by default — the catch-all sits on the INERT side, so an
//        unknown token can only under-classify (exempt, no write), never
//        fabricate a live sprint. `sprint_goal.entries[].status` is NEVER
//        data-normalized by this function (OPEN is sanctioned vocabulary per
//        § 11's own SPRINT_GOAL_TERMINAL_ALIASES comment, not drift).
//   "BACKLOG" sentinel — the lane name reused as a "no sprint assigned"
//        literal (12+ live refs) is NEVER a real sprint id — checked BEFORE
//        STEP 0 and the branch table, so it can never accidentally resolve
//        LIVE via an incidental non-backlog-lane reference.
//
// §11.2's A1 correction is encoded via the CALLER contract, not inside this
// function: the strict known-id union this function treats as "resolved" is
// active_sprints[].id (hot) ∪ closed_sprints[].id (hot) ∪ opts.coldClosedSprintIds
// (cold archive closed_sprints[].id / closed_sprint_goals sprint ids) — it
// deliberately EXCLUDES any `.done_tasks[].sprint` provenance-tag union (the
// weak signal §2.3/§11.2 demote to "candidate, never sole justification for
// resolved"). `opts.coldDoneTasks` is accepted ONLY for STEP 0's task-id-
// universe / own-`.sprint` resolution (§11.3 A2) and the AC-4-adjacent
// "have I ever heard of this id at all" bookkeeping — never as a source of
// "known sprint id".
//
// DI pattern mirrors § 14's checkMissingDependencyReport(data, resolvedIds):
// cold-archive reads happen in the CLI caller (fs access), this function stays
// pure/FS-free and unit-testable against synthetic fixtures.
// ═══════════════════════════════════════════════════════════════════════════════

/** A task row (hot or cold) whose own `.sprint` names a dangling id. */
export interface SprintRegistryTaskRef {
  path: string;
  taskId: string;
  lane: string;
  status: string;
}

/** Cold-archive `done_tasks[]` entry — id + its own `.sprint` (or null). Never a "known sprint id" source (§11.2 A1) — used only for STEP 0 resolution. */
export interface ColdArchiveDoneTaskRef {
  id: string;
  sprint: string | null;
}

export type SprintRegistryClassificationKind =
  | "LIVE"
  | "FINISHED"
  | "RELABEL"
  | "NEVER_WAS"
  | "PRE_SPRINT_LABEL";

export type SprintRegistryAction =
  | "LIVE_REGISTER_ACTIVE"
  | "FINISHED_REGISTER_CLOSED"
  | "RELABEL"
  | "STRIP"
  | "PRE_SPRINT_LABEL_EXEMPT";

export interface SprintRegistryClassificationRow {
  id: string;
  goalStatus: string | null;
  taskRefs: SprintRegistryTaskRef[];
  classification: SprintRegistryClassificationKind;
  action: SprintRegistryAction;
  detail: string;
  relabelTarget?: string;
}

export interface SprintRegistryClassificationResult {
  strictDanglingCount: number;
  rows: SprintRegistryClassificationRow[];
}

const SPRINT_REGISTRY_BACKLOG_SENTINEL = "BACKLOG";

/**
 * Liveness-asserting token set (Q4 ruling) — deliberately ONLY the exact
 * literal "active". Every other `sprint_goal.entries[].status` value
 * (PLANNING, OPEN, DEGRADED-adjacent future tokens, ...) is non-asserting.
 */
export const SPRINT_GOAL_LIVENESS_TOKENS: ReadonlySet<string> = new Set(["active"]);

/**
 * NEVER-WAS-by-shape: a dangling id shaped like a bare task-number reference
 * (e.g. "TASK-17") rather than a topic-slug sprint name. Derived by regex
 * (script, never a named list — same B1(c) discipline applied uniformly),
 * only consulted for ids that would otherwise land in PRE_SPRINT_LABEL
 * (backlog-only/no-goal-or-non-asserting-goal) — ratified disposition for
 * this shape is the board row's po_ruling_q3 (STRIP).
 */
const SPRINT_REGISTRY_BARE_TASK_NUMBER_SHAPE = /^TASK[-_]\d+$/;

function sprintGoalStatusIsTerminal(status: string): boolean {
  return SPRINT_GOAL_TERMINAL_ALIASES[status.toUpperCase()] != null;
}

/** Plane-1 walk: task_board.*[].sprint across all 8 flat lanes + both nested sprint-task locations (AC-3). */
export function collectSprintRegistryPlane1Refs(
  tb: z.infer<typeof TaskBoardSchema>,
): Map<string, SprintRegistryTaskRef[]> {
  const refs = new Map<string, SprintRegistryTaskRef[]>();
  const push = (sprintId: string, ref: SprintRegistryTaskRef) => {
    const arr = refs.get(sprintId) ?? [];
    arr.push(ref);
    refs.set(sprintId, arr);
  };

  const visitLane = (tasks: TaskLane | undefined, laneLabel: string) => {
    if (!tasks) return;
    tasks.forEach((t, i) => {
      const raw = t as Record<string, unknown>;
      const sprint = raw["sprint"];
      if (typeof sprint === "string" && sprint.length > 0) {
        push(sprint, {
          path: `task_board.${laneLabel}[${i}]`,
          taskId: typeof raw["id"] === "string" ? (raw["id"] as string) : "(no-id)",
          lane: laneLabel,
          status: typeof raw["status"] === "string" ? (raw["status"] as string) : "(no-status)",
        });
      }
    });
  };

  visitLane(tb.backlog, "backlog");
  visitLane(tb.ready, "ready");
  visitLane(tb.in_progress, "in_progress");
  visitLane(tb.qa, "qa");
  visitLane(tb.review, "review");
  visitLane(tb.done, "done");
  visitLane(tb.done_verified, "done_verified");
  visitLane(tb.archive, "archive");
  tb.active_sprints.forEach((sprint, si) => visitLane(sprint.tasks, `active_sprints[${si}].tasks`));
  (tb.closed_sprints ?? []).forEach((sprint, si) => visitLane(sprint.tasks, `closed_sprints[${si}].tasks`));

  return refs;
}

/** Plane-2 walk: `.sprint_goal.entries[].sprint_id` -> `.status` (loosely-typed field, mirrors § 11's own access pattern). */
export function collectSprintRegistryGoalEntries(doc: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  const sprintGoal = doc["sprint_goal"];
  if (sprintGoal == null || typeof sprintGoal !== "object") return out;
  const entries = (sprintGoal as Record<string, unknown>)["entries"];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (entry == null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const sprintId = e["sprint_id"];
    const status = e["status"];
    if (typeof sprintId === "string" && sprintId.length > 0 && typeof status === "string") {
      out.set(sprintId, status);
    }
  }
  return out;
}

/** Every hot task id (+ legacy task_id alias) -> that row's own `.sprint` (or null). Used for STEP 0 resolution only. */
function collectHotTaskOwnSprint(tb: z.infer<typeof TaskBoardSchema>): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const visitLane = (tasks: TaskLane | undefined) => {
    if (!tasks) return;
    for (const t of tasks) {
      const raw = t as Record<string, unknown>;
      const sprint = typeof raw["sprint"] === "string" ? (raw["sprint"] as string) : null;
      if (typeof raw["id"] === "string" && raw["id"]) out.set(raw["id"] as string, sprint);
      if (typeof raw["task_id"] === "string" && raw["task_id"]) out.set(raw["task_id"] as string, sprint);
    }
  };
  visitLane(tb.backlog);
  visitLane(tb.done);
  visitLane(tb.done_verified);
  visitLane(tb.in_progress);
  visitLane(tb.qa);
  visitLane(tb.ready);
  visitLane(tb.review);
  visitLane(tb.archive);
  for (const sprint of tb.active_sprints) visitLane(sprint.tasks);
  for (const sprint of tb.closed_sprints ?? []) visitLane(sprint.tasks);
  return out;
}

/**
 * Classify every referenced sprint id that fails to resolve against the
 * strict known-id union (§11.2 A1 — hot active/closed ∪ caller-injected cold
 * closed ids, `.done_tasks[].sprint` EXCLUDED) into a proposed action.
 * Pure/FS-free — see § 15 header for the DI contract.
 */
export function classifySprintRegistryDanglingIds(
  data: OrchState,
  opts: {
    coldClosedSprintIds: Set<string>;
    coldDoneTasks: ColdArchiveDoneTaskRef[];
  },
): SprintRegistryClassificationResult {
  const tb = data.task_board;
  const doc = data as unknown as Record<string, unknown>;

  const knownStrict = new Set<string>(opts.coldClosedSprintIds);
  for (const s of tb.active_sprints) knownStrict.add(s.id);
  for (const s of tb.closed_sprints ?? []) knownStrict.add(s.id);

  const plane1 = collectSprintRegistryPlane1Refs(tb);
  const plane2 = collectSprintRegistryGoalEntries(doc);

  const hotOwnSprint = collectHotTaskOwnSprint(tb);
  const coldOwnSprint = new Map<string, string | null>(
    opts.coldDoneTasks.map((t) => [t.id, t.sprint]),
  );
  // Task-id universe used ONLY for STEP 0 — hot takes precedence on conflict.
  const taskIdOwnSprint = new Map<string, string | null>([...coldOwnSprint, ...hotOwnSprint]);

  const allReferencedIds = new Set<string>([...plane1.keys(), ...plane2.keys()]);
  const danglingIds = [...allReferencedIds].filter((id) => !knownStrict.has(id)).sort();

  const rows: SprintRegistryClassificationRow[] = danglingIds.map((id) => {
    const taskRefs = plane1.get(id) ?? [];
    const goalStatus = plane2.get(id) ?? null;
    const hasSprintGoalEntry = plane2.has(id);

    // Special-case, evaluated before STEP 0 — "BACKLOG" lane-name-as-sentinel
    // anti-pattern is NEVER a real sprint id regardless of what lane/status
    // signals it happens to accumulate (PO ruling Q3 extension).
    if (id === SPRINT_REGISTRY_BACKLOG_SENTINEL) {
      return {
        id,
        goalStatus,
        taskRefs,
        classification: "NEVER_WAS",
        action: "STRIP",
        detail: `"${SPRINT_REGISTRY_BACKLOG_SENTINEL}" is the lane name reused as a "no sprint assigned" sentinel, never a real sprint id — strip .sprint on every referencing row (never write the literal back).`,
      };
    }

    // STEP 0 (A2, guarded per B1): id is itself a real task id somewhere in
    // the known task-id universe (hot ∪ injected cold done_tasks).
    if (taskIdOwnSprint.has(id) && !hasSprintGoalEntry) {
      const ownSprint = taskIdOwnSprint.get(id) ?? null;
      if (ownSprint === id) {
        // B1(b): self-referential row — a 1-hop RELABEL cycle. STRIP.
        return {
          id,
          goalStatus,
          taskRefs,
          classification: "NEVER_WAS",
          action: "STRIP",
          detail: `${id} is itself a task row whose own .sprint equals its own id — a 1-hop RELABEL cycle. STRIP, never relabel (PO ruling B1(b)).`,
        };
      }
      if (ownSprint) {
        return {
          id,
          goalStatus,
          taskRefs,
          classification: "RELABEL",
          action: "RELABEL",
          detail: `${id} is itself a task id (not a sprint) whose own .sprint is "${ownSprint}" — relabel every row carrying .sprint === "${id}" to "${ownSprint}" (PO ruling A2 / §11.3 STEP 0).`,
          relabelTarget: ownSprint,
        };
      }
      // ownSprint is null (task row has no .sprint of its own) — nothing to
      // relabel to; fall through to the ordinary branch table below.
    }
    // guarded (hasSprintGoalEntry true) or no resolvable ownSprint — B1(a):
    // fall through to the ordinary branch table.

    const goalIsLive = goalStatus != null && SPRINT_GOAL_LIVENESS_TOKENS.has(goalStatus);
    const goalIsTerminal = goalStatus != null && sprintGoalStatusIsTerminal(goalStatus);
    const allRefsTerminal = taskRefs.length > 0 && taskRefs.every((r) => TERMINAL_SET.has(r.status as Status));
    const anyNonBacklogNonTerminal = taskRefs.some(
      (r) => r.lane !== "backlog" && !TERMINAL_SET.has(r.status as Status),
    );

    // Branch 1 — exact "active" literal (Q4).
    if (goalIsLive) {
      return {
        id,
        goalStatus,
        taskRefs,
        classification: "LIVE",
        action: "LIVE_REGISTER_ACTIVE",
        detail: `sprint_goal status is exactly "active" — register active_sprints[] (branch 1).`,
      };
    }

    // Branch 2 (B2: terminality BEFORE lane) — goal terminal AND every
    // referencing row (if any) is terminal-status.
    if (goalIsTerminal && (taskRefs.length === 0 || allRefsTerminal)) {
      return {
        id,
        goalStatus,
        taskRefs,
        classification: "FINISHED",
        action: "FINISHED_REGISTER_CLOSED",
        detail: `sprint_goal status "${goalStatus}" is terminal and every referencing row is terminal-status — register closed_sprints[] (branch 2, B2-corrected order).`,
      };
    }

    // Branch 3 (was branch 2 pre-B2) — any non-backlog lane row that is
    // itself non-terminal-status.
    if (anyNonBacklogNonTerminal) {
      return {
        id,
        goalStatus,
        taskRefs,
        classification: "LIVE",
        action: "LIVE_REGISTER_ACTIVE",
        detail: `at least one referencing row sits in a non-backlog lane with non-terminal status — register active_sprints[] (branch 3).`,
      };
    }

    // Branch 4 (default, absorbs Q4's old branch 5) — referencing rows only
    // in backlog[] (or none at all) AND goal status is absent or
    // non-asserting (PLANNING, OPEN, any future token).
    if (SPRINT_REGISTRY_BARE_TASK_NUMBER_SHAPE.test(id)) {
      return {
        id,
        goalStatus,
        taskRefs,
        classification: "NEVER_WAS",
        action: "STRIP",
        detail: `${id} is shaped like a bare task-number reference, not a topic-slug sprint name, and resolves nowhere as a real sprint — strip .sprint (PO ruling Q3).`,
      };
    }
    return {
      id,
      goalStatus,
      taskRefs,
      classification: "PRE_SPRINT_LABEL",
      action: "PRE_SPRINT_LABEL_EXEMPT",
      detail: `referencing rows exist only in backlog[] (or none at all) and sprint_goal status is absent or non-asserting — pre-sprint label, exempt (branch 4; PO owns sprint-kickoff authority).`,
    };
  });

  return { strictDanglingCount: rows.length, rows };
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 16. STAGE 1h — SPRINT-REGISTRY REFERENTIAL-INTEGRITY GUARD (warn-mode validator)
// Task: FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE, §3/§4 of
// the design brief, corrected per §11.8 step 5 ("Stage 1h validator ships in warn
// mode (§3), using the A1-corrected known-id union (§11.2) and the A2/A3-corrected
// branch table (§11.4) for its exemption logic").
//
// IMPLEMENTATION NOTE — this literally DELEGATES to § 15's
// classifySprintRegistryDanglingIds() rather than re-deriving a second, narrower
// exemption predicate. An earlier draft of this function re-implemented §3's
// original (pre-amendment) exemption text verbatim ("backlog[]-only AND no
// sprint_goal entry at all") — that is STRICTER than the corrected branch-4
// PRE_SPRINT_LABEL rule (which also exempts a PLANNING/OPEN/other non-asserting
// goal-entry, not only a wholly-absent one) and, live-measured against the real
// file, wrongly flagged 4 genuinely-exempt ids (CHORE-COMMIT-OVERHEAD,
// FRESHNESS-AUTO-REMEDIATE, PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP,
// PREDICTION-CLAIMS-DAILY-CADENCE) as permanent violations — which would have
// made the `reject`-mode arming gate (§11.8 step 6/7, "violations==0") literally
// unreachable forever, the exact fabricate-a-phantom-sprint failure mode Q2's
// ruling exists to prevent. Delegating makes Stage 1h's "violations" and
// scripts/audits/verify-sprint-registry-referential-integrity.mjs's
// "counted_violations" the SAME number by construction — one predicate, not two
// (B3) — so they can never silently drift apart again.
//
// KNOWN-ID UNION / STEP-0 TASK-ID RESOLUTION: identical DI contract to § 15 —
// opts.coldClosedSprintIds (strict, done_tasks[].sprint excluded per A1) and
// opts.coldDoneTasks (STEP-0 task-id-universe resolution only, never a "known
// sprint id" source). Cold-archive fs reads happen in the CLI caller.
//
// Disposition (ORCH_SPRINT_REGISTRY_MODE, default "warn", read by the CLI caller —
// this function itself never exits/throws, it only reports): warn = print + one
// aggregated docs/signals/ entry, exit 0; reject = process.exit(2). Mirrors
// GIT_NOTEBOOK_IMMUTABILITY_MODE's warn-first disposition. Do not flip the default
// to reject until a corpus replay (scripts/audits/verify-sprint-registry-referential-
// integrity.mjs) reads violations==0 against the live file (brief §3 arming gate).
// ═══════════════════════════════════════════════════════════════════════════════

export interface SprintRegistryIntegrityViolation {
  id: string;
  classification: SprintRegistryClassificationKind;
  planes: Array<"task_board" | "sprint_goal">;
  taskRefs: SprintRegistryTaskRef[];
  goalStatus: string | null;
  detail: string;
}

export interface SprintRegistryIntegrityResult {
  violations: SprintRegistryIntegrityViolation[];
}

/**
 * Stage 1h gate: every § 15 classification row whose disposition is NOT
 * PRE_SPRINT_LABEL (i.e. LIVE/FINISHED/RELABEL/NEVER_WAS — anything that
 * needs a real reconciliation action) is a counted violation. Pure/FS-free —
 * cold-archive resolution happens in the CLI caller, mirroring § 15's DI
 * contract exactly.
 */
export function checkSprintRegistryReferentialIntegrity(
  data: OrchState,
  opts: {
    coldClosedSprintIds: Set<string>;
    coldDoneTasks: ColdArchiveDoneTaskRef[];
  },
): SprintRegistryIntegrityResult {
  const doc = data as unknown as Record<string, unknown>;
  const plane2 = collectSprintRegistryGoalEntries(doc);
  const classification = classifySprintRegistryDanglingIds(data, opts);

  const violations: SprintRegistryIntegrityViolation[] = classification.rows
    .filter((row) => row.classification !== "PRE_SPRINT_LABEL")
    .map((row) => {
      const planes: Array<"task_board" | "sprint_goal"> = [];
      if (row.taskRefs.length > 0) planes.push("task_board");
      if (plane2.has(row.id)) planes.push("sprint_goal");
      return {
        id: row.id,
        classification: row.classification,
        planes,
        taskRefs: row.taskRefs,
        goalStatus: row.goalStatus,
        detail: row.detail,
      };
    });

  return { violations };
}
