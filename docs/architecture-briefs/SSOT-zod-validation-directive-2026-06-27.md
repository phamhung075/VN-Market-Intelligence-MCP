# DESIGN DIRECTIVE — Typed SSOT Schema + Dual-Point Enforcement + Auto-Fix Errors

**Status:** MANDATE (user-directed 2026-06-27). Supersedes the bash-jq-gate implementation strategy for sprint `SSOT-INTEGRITY-PERIMETER`.
**For:** architect (author the hardening brief against THIS) → dev-mcp-server + developer (implement) → qa.
**Realizes roadmap ranks:** 1 (all-lane coverage), 3 (dup-key + structural), 4 (referential integrity), 12 (TS types + RED 1837a) — as ONE typed artifact. Also closes ADD-1 (READY bootstrap) + ADD-2 (lane↔status coherence) from the audit handoff.

## Why this replaces "more bash jq gates"
The current gate (`scripts/orch-state-validate.sh`) is false-green: G-5/G-3/G-4 scan only 3 of 9 lanes (proven), no dup-key detection, and the dominant ~290/tick jq-patch writer bypasses it. Extending bash jq lane-by-lane re-creates the same fragility (every new lane must be remembered). A **nested Zod schema validates every lane by construction** — you cannot add a lane to the schema without it being validated. `zod` is already a dependency in `apps/mcp-server` with mature adoption; `apps/mcp-server/src/infrastructure/orchStateStore.ts` is the server write path; `z.infer` regenerates the TS types that rank-12 was going to hand-sync.

## Step 1 — MODEL FIRST: `apps/mcp-server/src/infrastructure/orchStateSchema.ts`
Single source of truth for the SSOT shape. Sketch:
```ts
export const StatusEnum = z.enum([
  "BACKLOG","TODO","IN_PROGRESS","REVIEW","QA","DONE",
  "DONE_VERIFIED","BLOCKED","DEFERRED","CANCELLED","SKIPPED",
]);                                  // ← THE one enum (bash gate + server stop hardcoding their own)

export const TaskSchema = z.object({
  id: z.string().min(1),
  status: StatusEnum,
  owner_agent: z.string().optional(),
  next_agent: z.string().optional(),
  detail_ref: z.string().optional(),
  verify_note: z.string().optional(),
  // …the 10 hot fields per brief 2026-06-27 §3.2; everything else lives in cold detail_ref
}).strict();                         // ← .strict() rejects unknown keys → catches dup/legacy-metadata drift

const Lane = z.array(TaskSchema);
export const SprintSchema = z.object({
  id: z.string().min(1),             // ← G-4 (no null sprint id), now typed
  goal: z.string().optional(),
  tasks: z.array(TaskSchema),
}).strict();

export const TaskBoardSchema = z.object({
  active_sprints: z.array(SprintSchema),
  backlog: Lane, done: Lane, review: Lane, qa: Lane,
  ready: Lane, in_progress: Lane, done_verified: Lane,
  closed_sprints: z.array(SprintSchema),
  head: z.object({ status: z.string() }).passthrough(),  // deprecated stub; passthrough-but-flagged
}).strict();                         // ← ALL 9 lanes present → 3-of-9 false-green is structurally impossible

export const OrchStateSchema = z.object({
  head: HeadSchema, task_board: TaskBoardSchema,
  signal_queue: SignalQueueSchema, decision_journal: DecisionJournalSchema,
  sprint_goal: SprintGoalSchema, /* … */
}).strict();

export type OrchState = z.infer<typeof OrchStateSchema>;   // ← deletes hand-maintained types (rank 12)
```

## Step 2 — VALIDATION per property, parent + child
Native nested validation handles parent→child→field recursively (each issue carries a `.path`). Cross-field invariants via `.superRefine()`:
- **Lane↔status coherence (ADD-2):** map each lane to its allowed statuses — `backlog⇒{BACKLOG}`, `review⇒{REVIEW}`, `qa⇒{QA}`, `done⇒{DONE,DONE_VERIFIED}`, `done_verified⇒{DONE_VERIFIED}`, `ready⇒{READY,TODO}`, `in_progress⇒{IN_PROGRESS}`. Emit one precise issue per mismatch. (Relabel the 5 existing `backlog[]` REVIEW tasks as part of data true-up.)
- **ADD-1 (READY bootstrap) — DECIDE IN THE BRIEF:** either (a) add `READY` as the 12th enum value (recommended — a `ready[]` lane exists, so a READY status is lane-coherent), or (b) mandate ready-lane⇒TODO and relabel `ARCH-SSOT-INTEGRITY-PERIMETER`. The schema MUST encode whichever is chosen so the all-lane gate does not strand the sprint's own kickoff task.
- **Referential integrity (rank 4):** `detail_ref` and `signal_queue.rows[].payload_ref` resolve to existing files (superRefine with an injected fs-resolver so the pure schema stays testable). Fixes the 6 dangling `docs/signals/…` payload_ref.
- **Caps:** `narrative` ≤30 entries, `decision_journal` `_cap` + single canonical `ts` field, `sprint_goal` prune-on-close — encodable as refines or left to Wave-2 lifecycle tasks (architect's call on phasing).

## Step 3 — TWO-STAGE VALIDATOR CLI: `scripts/orch-validate.mjs`
Imports the compiled schema. Stages:
1. **Stage 0 (raw text, pre-parse):** duplicate-JSON-key scan on raw bytes — Zod operates on the post-`JSON.parse` object where dup keys are already collapsed, so this MUST precede parse. (Tokenizing scan or a dup-key-aware parse lib.) Closes the `feedback_ssot_duplicate_key` clobber class.
2. **Stage 1:** `OrchStateSchema.safeParse(JSON.parse(text))`.
Exit non-zero on any failure; print the auto-fix error contract (below) to stderr.

## Dual-point enforcement (covers ALL writers — this is the completeness requirement)
A Claude Code hook ONLY sees Claude-tool calls; it is blind to writes inside the mcp-server process. So enforce at BOTH points with the ONE schema:
- **Point 1 — Claude Code hook** (`.claude/settings.local.json`, extend the existing PreToolUse/PostToolUse blocks):
  - `PreToolUse` matcher `Write|Edit` whose `file_path` ends `orch-state.json` → validate the new content inline → on fail emit `permissionDecision:"deny"` (or exit 2) with the structured reason.
  - `Bash` writes/renames into orch-state.json → require routing through `scripts/orch-apply.sh` (rank 2 wrapper, which calls the validator before rename); `PostToolUse` `Bash` re-validates live orch-state.json as a backstop (atomic rename means a bad write is a complete-but-invalid doc, loudly flagged for fix-forward).
- **Point 2 — server** (`orchStateStore.ts` write path): `OrchStateSchema.parse(next)` before the atomic write; throw on fail. Covers `task_claim`/`task_release`/`coordinationTools`/scheduler jobs.
- **Shim:** `scripts/orch-state-validate.sh` → thin wrapper calling `orch-validate.mjs` (existing callers unchanged). Reconcile RED `1837a-pipeline-state.test.ts` + `1980-f2-canon-schema.test.ts` against the one schema.

## Auto-fix error contract (the crux — make failures agent-actionable)
Every failure prints, per issue: `path`, `problem`, `expected`, and a `fix:` hint. Hint mapper keyed by Zod `issue.code` + lane. Example:
```
ORCH-STATE VALIDATION FAILED (2 issues) — fix and retry:
[1] task_board.review[0].status: "PARKED" is not a valid status.
    expected: BACKLOG|TODO|IN_PROGRESS|REVIEW|QA|DONE|DONE_VERIFIED|BLOCKED|DEFERRED|CANCELLED|SKIPPED
    fix: use an enum value; put the "PARKED" qualifier in verify_note.
[2] signal_queue.rows[4].payload_ref: file docs/signals/db-integrity-history.json does not exist.
    fix: correct to docs/data/db-integrity-history.json
```
The PreToolUse `deny` reason → fed back to the writing agent → it self-corrects and retries. This is the AI-autofix loop the directive mandates.

## Acceptance (QA)
1. Inject a non-enum status into EACH of the 9 lanes on a scratch copy → validator fails for every lane (regression fixture proving the 3-of-9 gap is closed).
2. Duplicate JSON key in raw text → Stage-0 rejects.
3. Unknown/legacy key under a `.strict()` object → rejected.
4. Dangling `detail_ref`/`payload_ref` → referential issue with corrected-path hint.
5. Agent-loop test: a Write of bad orch-state via the hook returns the structured reason and is blocked (not written).
6. `task_claim` writing a bad status server-side → `orchStateStore` throws (proves Point-2 coverage).
7. `z.infer` types compile; RED `1837a` reconciled green; full mcp-server test suite green.
