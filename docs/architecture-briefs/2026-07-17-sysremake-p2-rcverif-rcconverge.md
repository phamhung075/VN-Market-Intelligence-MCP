# Architecture Brief — SYSREMAKE Phase-2, Leg 1: RC-VERIF + RC-CONVERGE

**Date:** 2026-07-17
**Author:** architect
**Status:** DESIGN COMPLETE — handoff to pm
**Board row:** `SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE` (backlog, supervised:true, next_agent:architect)
**Authorization:** RC-VERIF + RC-CONVERGE authorized 2026-07-14 (PO DECISION-3, session e417ef1f); route re-confirmed FULL 2026-07-15 (same session, user AskUserQuestion selection). This leg covers **RC-VERIF + RC-CONVERGE only**. RC-ORCHMONO / RC-GITSTATE / RC-CEREMONY are separately-authorized later legs — **not designed here** (§7 coordination notes only, per dispatch boundary).
**Parent diagnosis:** `docs/architecture-briefs/2026-07-04-systemic-remake.md` §2.1 (source of the RC-VERIF/RC-CONVERGE mandate — this brief does not re-litigate the diagnosis, only designs the fix).

---

## 0. TL;DR

Add ONE new field-shape (`verification: {raw_probe, honest_gap_reason}`) and ONE new enum value (`DEGRADED`) to `orchStateSchema.ts`, the file every orch-state validation point already imports. Enforce `verification.raw_probe` as a hard requirement for `DONE_VERIFIED` via the schema's **existing root `.superRefine()`** (not a new standalone function) — this is the one design choice that makes the gate un-droppable by any of the 4 live write paths. Grandfather the 33 currently-live `DONE_VERIFIED` rows that predate the gate via a frozen, closed ID allowlist (never backfilled — backfilling would itself be fabrication). RC-CONVERGE ships as a **separate sidecar ledger** (`docs/data/bug-class-convergence-ledger.json`), mirroring the `auditor-dedup-ledger.json` pattern that shipped one day before this brief — deliberately NOT inside `orch-state.json`, because stuffing more state into the hot file would directly undercut this same route's own RC-ORCHMONO/RC-GITSTATE legs.

---

## 1. Brownfield Map — Every Existing Validation Point (single-source proof)

This is the load-bearing brownfield finding: **`apps/mcp-server/src/infrastructure/orchStateSchema.ts` is already, in practice, the single point of truth for every live write path** — no new plumbing is needed to make a schema-level gate universal. Verified by reading each call site, not inferred:

| # | Validation point | File | Calls |
|---|---|---|---|
| 1 | CLI / `orch-apply.sh` Stage 1 | `scripts/orch-validate.mjs` | `import { OrchStateSchema, checkLaneCoherence, checkRefIntegrity, checkSprintGoalStatusCanonical } from '../apps/mcp-server/src/infrastructure/orchStateSchema.ts'` (line 55-60) — **imports the `.ts` file directly**, no transpile/duplication step (bun runs `.ts` natively). |
| 2 | Server-side atomic write | `apps/mcp-server/src/infrastructure/orchStateStore.ts::writeOrchStateAtomic()` | `import { OrchStateSchema } from "./orchStateSchema"` (line 31); calls `OrchStateSchema.safeParse(parsed)` directly (line 192) before any fs write. Used by `appendSignalQueueRow`, `writeHeadAtomic`, and (transitively) `improvementSignalWriter.ts::appendDashboardRow`. |
| 3 | Claude PreToolUse hook | `scripts/agents-flow/orch-state-hook-prewrite.mjs` | Shells out to `bun scripts/orch-validate.mjs` (i.e. path 1) — confirmed via `VALIDATOR_PATH` constant, no separate schema copy. |
| 4 | Bash shim (legacy call sites) | `scripts/orch-state-validate.sh` | Thin `exec` wrapper around `bun scripts/orch-validate.mjs` (i.e. path 1 again). |

**Conclusion:** any check placed inside `OrchStateSchema`'s root `.superRefine()` is automatically enforced by paths 1, 2, 3, 4 — zero duplication risk, because there is only one schema object in memory and every path imports it. This is why the design below adds the new logic **inside the existing root `.superRefine()` block** (same function that already does the `head.active_task_id` referential check) rather than as a new standalone export.

**Counter-example that proves the risk is real (pre-existing, NOT introduced by this leg):** `checkLaneCoherence()` and `checkRefIntegrity()` are exported *separately* from `OrchStateSchema` and are called explicitly only by `orch-validate.mjs` (path 1/3/4) — `orchStateStore.ts::writeOrchStateAtomic()` (path 2) does **not** call either of them (its own comment at line 186-190 says so explicitly: "checkRefIntegrity is deliberately excluded here"). Today this gap is inert because no server-side writer (`appendSignalQueueRow`, `writeHeadAtomic`) ever touches `task_board` status or `detail_ref`. **Flagged for the record, not fixed here** (out of this leg's scope) — if a future server-side writer ever sets `task_board` status directly, lane-coherence/ref-integrity would silently not apply to it. RC-VERIF's own gate avoids repeating this mistake by living in the shared `.superRefine()`, not a side-called function.

---

## 2. RC-VERIF Design

### 2.1 Schema additions (`apps/mcp-server/src/infrastructure/orchStateSchema.ts`)

New sub-schemas, added after `SignalRowSchema` (§4) and before `HeadSchema` (§5):

```ts
// ═══ § RAW-PROBE / VERIFICATION (RC-VERIF) ═══════════════════════════════
// Shape is the literal 4-field contract PO already applies by hand-convention
// (docs/agent-memory/notebooks/po.md 2026-07-17 VERIFY-FIX-DAILY-FF-VIEW-JOIN-
// ANCHOR-REALDATA close: `.verification.raw_probe{tool,args,live_value_observed,
// observed_at}`) — this schema formalizes an already-live convention, not a
// new invention.
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
    honest_gap_reason: z.string().min(1).optional(), // required conditionally for DEGRADED, see superRefine
  })
  .passthrough();

export type RawProbe = z.infer<typeof RawProbeSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
```

`TaskSchema` (§2) gains two additive optional fields (schema-safe under existing `.passthrough()`, but made explicit now because both are load-bearing for gates, not decoration — same rationale that already justifies every other named-not-passthrough-only field in that schema):

```ts
export const TaskSchema = z.object({
  // ...existing fields unchanged...
  verification: VerificationSchema.optional(),  // RC-VERIF
  bug_class: z.string().optional(),             // RC-CONVERGE (§3)
}).passthrough();
```

`StatusEnum` gains one new terminal-adjacent value, appended (never inserted/reordered — matches the existing `READY` precedent comment "ADD-1: 12th value"):

```ts
export const StatusEnum = z.enum([
  "BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "QA", "DONE", "DONE_VERIFIED",
  "BLOCKED", "DEFERRED", "CANCELLED", "SKIPPED", "READY",
  "DEGRADED", // ADD-2: 13th value — RC-VERIF honest partial-verification state, 2026-07-17
]);
```

`TERMINAL_SET` is **deliberately unchanged** — see §2.3.

### 2.2 The gate itself — extend the existing root `.superRefine()`

Do **not** add a new standalone `checkVerificationGate()` export called only by the CLI (that would repeat the exact drift class flagged in §1's counter-example). Extend the *existing* `.superRefine()` block on `OrchStateSchema` so path 2 (`orchStateStore.ts`) inherits it automatically:

```ts
export const OrchStateSchema = z.object({ /* ...unchanged... */ })
  .strict()
  .superRefine((data, ctx) => {
    // ── existing: head.active_task_id referential integrity ──────────────
    // (unchanged, see current code)

    // ── NEW: RC-VERIF completion gate ─────────────────────────────────────
    checkVerificationGate(data.task_board, ctx);
  });

/** Frozen, closed set — see §2.4 for how this list was derived and why it
 * must NEVER grow. Grep-verified 33 ids at brief-authoring time (2026-07-17);
 * developer re-runs the jq command in §2.4 immediately before implementation
 * to catch any additional rows that closed in the interim. */
const RC_VERIF_GRANDFATHERED_IDS: ReadonlySet<string> = new Set([
  /* developer: paste the jq output here at implementation time */
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

/** Iterates ALL 9 task-bearing lanes ("by construction", same lane set as
 * collectAllTaskIds) — NOT just task_board.backlog as the parent brief's
 * prose loosely said. DONE_VERIFIED is lane-coherent in done[]/done_verified[]/
 * active_sprints[].tasks[]/closed_sprints[].tasks[] too (LANE_ALLOWED_STATUSES),
 * so limiting the check to backlog[] would leave 3+ lanes unguarded — a
 * deliberate widening beyond the brief's prose, justified by the existing
 * lane-coherence map it must stay consistent with. */
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
```

`orch-validate.mjs`'s `STATUS_ENUM_DISPLAY` constant (line 69-70, a hand-typed copy used only for the CLI's error-message display text — display-only, not a second enforcement point) needs its 13-value update appended too, purely cosmetic.

### 2.3 Why `DEGRADED` stays OUT of `TERMINAL_SET`

`TERMINAL_SET = {DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED}` drives two live consumers: `orch-cold-evict.sh`'s eviction predicate and `checkSprintGoalStatusCanonical()`'s terminal-alias map. Adding `DEGRADED` to it would make degraded rows silently sweepable to cold storage — exactly the "absence-of-alert defeats trust" anti-pattern (`F8-TRUST-EQUALS-SILENCE`) the parent brief names. A `DEGRADED` row is an **honest admission that needs a human/PO decision**, not a finished item — it must stay visible in the hot file until PO adjudicates it. **Decision: `DEGRADED` is excluded from `TERMINAL_SET`.** Consequence (verified, zero code changes needed elsewhere):

- `orch-cold-evict.sh` (lines 82/96 — its own **hardcoded bash-literal copy** of `TERMINAL_SET`, `"DONE,DONE_VERIFIED,CANCELLED,DEFERRED,SKIPPED"`, commented as an SSOT-pointer but NOT an import since bash cannot import `.ts`) needs **zero edit** — `DEGRADED` never matches its terminal-status scan by construction. (This hardcoded-bash-copy is itself a pre-existing predicate-drift risk, flagged for RC-ORCHMONO's owner in §7 — not this leg's job.)
- `docs/agents/pm/flow/task-archive.md` line 43 (`TERMINAL='["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]'`) — same reasoning, **zero edit needed**.
- `devteam-backlog-promote-bounded1.jq` line 580 filters `status == "BACKLOG" or status == "TODO"` explicitly — `DEGRADED` rows are structurally invisible to BOUNDED-1 auto-drain (never picked up without PO looking at them first). **Zero edit needed.**

### 2.4 Lane coherence for `DEGRADED`

`DEGRADED` is added to exactly two of the seven `LANE_ALLOWED_STATUSES` entries:

```ts
review: new Set(["REVIEW", "BLOCKED", "DEGRADED"]),
qa:     new Set(["QA", "DEGRADED"]),
```

**Considered and rejected:** mirroring `BLOCKED`'s full 3-lane spread (`backlog`, `review`, `in_progress`) — `BLOCKED` means "waiting on an external dependency before work can start/continue"; `DEGRADED` means "work was attempted, tests may be green, but the live artifact could not be independently re-verified" — a **post-work** state, structurally closer to where `REVIEW`/`QA` already sit. Allowing `DEGRADED` in `backlog`/`in_progress` would let an agent declare it before even attempting the fix, defeating the intent (RC-VERIF exists to stop premature-DONE, not to give agents an earlier off-ramp).

### 2.5 Migration / grandfather strategy — the single most important decision in this leg

**Live evidence gathered before designing (not assumed):**

```
$ jq '.task_board.done_verified | length' orch-state.json          → 0
$ jq '[.task_board.done[] | select(.status=="DONE_VERIFIED")] | length'  → 0
$ jq '[.task_board.active_sprints[].tasks[]? | select(.status=="DONE_VERIFIED")] | length'  → 24
$ jq '[.task_board.closed_sprints[].tasks[]? | select(.status=="DONE_VERIFIED")] | length'  → 9
$ jq '[... select(.status=="DONE_VERIFIED" and .verification.raw_probe != null)] | length'  → 0 (both lanes)
```

**33 live rows are currently `DONE_VERIFIED` with zero `verification.raw_probe`.** (Sample ids: `BAL-1a-DEV`, `SSOT-W1-HOOK-ENFORCE`, `CONTAM-10-WRITER-H`, `HSC-1`..`HSC-7`, `TASK-501-MOMENTUM-API-HANDLER`, ...). A naive unconditional gate (`status===DONE_VERIFIED ⇒ raw_probe required`) validates the **full document on every write**, not a diff — so it would reject every single future write of the hot file until all 33 rows carry `raw_probe`, immediately bricking the file.

**Two options considered:**

1. **Backfill-then-hard-fail** (the pattern `checkLaneCoherence` itself used: warn-only during migration, flip to hard-fail once live violations hit 0). **Rejected.** Backfilling `raw_probe` on 33 already-completed historical rows means an agent must retroactively invent `{tool, args, live_value_observed, observed_at}` for work finished days-to-weeks ago — that is literally fabricating the exact evidence class RC-VERIF exists to prevent. Self-defeating.
2. **Frozen, closed grandfather-ID allowlist** (`RC_VERIF_GRANDFATHERED_IDS` in §2.2). **Chosen.** The allowlist is generated ONCE, at implementation time, via:
   ```bash
   jq -r '
     ([.task_board.active_sprints[].tasks[]?, .task_board.closed_sprints[].tasks[]?]
       | .[] | select(.status=="DONE_VERIFIED" and (.verification.raw_probe // null | not)) | .id)
   ' docs/data/orch/orch-state.json
   ```
   embedded as a literal `Set` constant with a comment forbidding future additions. New rows can **never** enter it — the gate applies unconditionally to any id not already in the frozen set. As grandfathered rows get cold-evicted (`orch-cold-evict.sh`, out of scope here but already live for `done_verified[]`/terminal `active_sprints`/`closed_sprints`) they leave `OrchStateSchema`'s purview entirely (cold archive files are never Zod-validated) — the allowlist becomes silently inert over time with zero maintenance burden, and can be deleted outright once `RC_VERIF_GRANDFATHERED_IDS ∩ (current hot-file ids) = ∅` (a one-line PM-decomposable housekeeping task, non-blocking).

**Scope note:** the grandfather list only needs to cover the **hot file's current contents** (33 ids) — not the full historical archive (`docs/data/orch/archive/*.json`), because those files are never validated by `OrchStateSchema` in the first place.

### 2.6 3-point governance update (per `docs/standards/task-schema.md` §Invariants-3's own description of how status-enum changes must land)

`docs/standards/task-schema.md` (v1.0, 2026-06-06) is **already stale independent of this change** — it documents a 7-value enum (`TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED, CANCELLED, DEFERRED`) while the live `StatusEnum` has had 12 values since 2026-06-27 (`BACKLOG, QA, DONE_VERIFIED, SKIPPED, READY` are all undocumented there already). This is a pre-existing drift this leg does not need to fully repair, but the doc's own §Invariants-3 names the exact 3-point contract that must be honored when the enum changes again:

1. **TS compile-time check** → `StatusEnum` in `orchStateSchema.ts` (§2.1) — the single source; `orchStateStore.ts`'s `Status` type already derives from it (`export type Status = z.infer<typeof StatusEnum>`), so `OrchStateTaskBoardTask.status: Status` picks up `DEGRADED` with zero additional edits.
2. **jq-migration mapping** → not applicable — this is a purely additive enum value (no rename/alias), so no migration script is needed (unlike the historical F1B freeform→canonical migration this doc describes).
3. **JSON-schema (serve-time) validation** → `OrchStateSchema` itself IS this point (§2.1/§2.2).

PM should fold "update `task-schema.md`'s status table to the current 12+1=13-value live enum" into the decomposition (§9, T7) — a doc-only fix, correctly owned by developer or agent-father (not architect, per this agent's `not_my_job` boundary), and worth doing now since the file is already being read as this change's own governance reference.

### 2.7 Flow-doc wiring (explicitly NOT designed here — listed only)

The parent brief (§2.1(d)/(f)) assigns `docs/agents/qa/flow/main.md`, `docs/agents/fixer/flow/main.md` (RETURN step, currently "tests pass, tsc clean" with zero `DONE_VERIFIED`/raw_probe language), `docs/agents/pm/flow/task-archive.md`, `docs/agents/po/flow/sprint-signoff.md` (verified via grep: currently zero mentions of `verification`/`raw_probe` — PO's own recent `DONE_VERIFIED` close of `VERIFY-FIX-DAILY-FF-VIEW-JOIN-ANCHOR-REALDATA` applied the `.verification.raw_probe` shape from **memory convention only**, not a documented flow-doc mandate), and `docs/agents/fixer/init.md` (`knowledge.always_load` decision-journal gap) to **agent-father**, not architect or developer. This brief does not touch flow-doc prose. §9 lists these as PM-decomposed agent-father tasks, per the parent brief's own §5 ownership table.

---

## 3. RC-CONVERGE Design

### 3.1 What it replaces

`docs/data/project-stats.json`'s `recurringBugEscalationFlag`/`escalationReason` fields — confirmed **zero readers** (`grep -rln "recurringBugEscalationFlag"` across `.ts`/`.md`/`.sh` → zero, re-confirmed at brief-authoring time) and already quarantined (`TASK_P1-DRIFT-QUARANTINE-FREEZE-FLAG`, Phase-1, `_maintained_by: "DEPRECATED — see RC-CONVERGE machine-owned freeze flag (Phase 2)"`). This leg is that field's real replacement.

### 3.2 Rejected alternative: fold convergence state into `orch-state.json`

Considered adding a `.convergence_ledger` top-level section to `OrchStateSchema` (gains orch-apply.sh's Zod+conservation+CAS protection for free). **Rejected** — `orch-state.json` is currently 844,325 bytes (measured live), already 57×/day rewrite frequency per the parent brief's `F5-HOTFILE-CHURN-ORCH-STATE` finding, and the SAME parent route's later legs (RC-ORCHMONO's ~600KB hot ceiling, RC-GITSTATE's "get derived counters out of the git tree") exist specifically to shrink and de-churn this file. Adding a new frequently-mutated section to it would work directly against this route's own later goals. Also would require widening `OrchStateSchema`'s `.strict()` root-key enumeration for a section unrelated to task/signal coordination.

### 3.3 Chosen design: sidecar ledger, mirroring `auditor-dedup-ledger.json`

`docs/data/bug-class-convergence-ledger.json` — flat map, same shape family as the ledger `emit-audit-signal.sh` shipped one day before this brief (`UC-ASL-P2`, 2026-07-16):

```json
{
  "<bug_class-slug>": {
    "count": 2,
    "window_days": 30,
    "first_seen": "2026-07-01T00:00:00Z",
    "last_seen": "2026-07-16T22:07:00Z",
    "occurrences": ["<signal_id_or_report_id_or_task_id>", "..."],
    "freeze_ref": "<live backlog task id>|null",
    "escalated_at": "2026-07-16T22:10:00Z|null",
    "lifted_at": null
  }
}
```

`bug_class` is a **human-authored, stable, normalized slug** (e.g. `bctc-reconcile-exhausted-storm`, `orphan-alertid-uuid-mismatch`) — matching the still-live `docs/data/code-janitor-known-findings.json` convention of readable structured `fingerprint` strings, deliberately **not** an opaque hash. The parent brief explicitly warns against opaque labels ("never a hardcoded label like the '1954c' string that caused a false-positive REFUTED finding") — a readable slug is auditable by a human glancing at the ledger; a hash is not.

**Implementation: `scripts/bug-class-recurrence-check.sh`**, mirroring `emit-audit-signal.sh`'s `_ledger_read()` / `_ledger_write()` (tmp+mv same-directory atomic rename) / `_ledger_prune_and_lookup()` verbatim pattern, with two parameter changes:
- Window: 30 days (not 7) — per parent brief §2.1(e) "recurrence ≥ 2 in a rolling 30 days."
- Trigger: **count-based recurrence escalation**, not severity-rank escalation-bypass. On `count >= 2` within the window → return `ESCALATE` verdict to the caller (PO), who then sets `freeze_ref` to the chosen live backlog task id.

**Explicitly NOT routed through `orch-apply.sh`** (same "Hard Constraint 3" rationale `emit-audit-signal.sh` already documents at its own ledger-write comment) — this is a separate sidecar file, not `orch-state.json`.

**Caller contract:** PO/router invokes this at triage time (`docs/agents/po/flow/triage-signals.md` — not edited by this brief, PM-decomposed per §9) whenever a new bug-shaped signal/report is being triaged, supplying a `bug_class` slug it derives from the recurring pattern. Recurrence is tracked **across surfaces** (backlog rows via the new `TaskSchema.bug_class` field, memory/decision-journal mentions, `git log --grep`) — the ledger is the aggregation point; PO decides the slug regardless of which surface triggered the check, matching how PO already does this manually today (live precedent: the 2026-07-16T22:07Z `po-decisions.md` entry escalating the 3rd `RECONCILE-EXHAUSTED` duplicate from `priority: high` to `P0` by prose pattern-matching across ticks — RC-CONVERGE makes that judgment machine-assisted instead of relying on PO noticing the pattern by memory).

### 3.4 Auto-lift wiring (closes "one-shot reset, no re-trigger")

When a task reaches `DONE_VERIFIED` (proven via §2's `raw_probe` gate — **not self-report**), the write site (`docs/agents/pm/flow/task-archive.md` or `docs/agents/po/flow/sprint-signoff.md` — wherever the `DONE_VERIFIED` transition is actually committed, same site §2.7 already flags for agent-father wiring) additionally checks: does this task's `id` match any ledger entry's `freeze_ref`? If yes:
- `freeze_ref: null`, stamp `lifted_at`
- `count: 0` (re-armed), **keep** `first_seen`/`occurrences` history (do not delete the entry)
- A **new** 30-day window starts counting from the next occurrence — if the same `bug_class` recurs a 3rd time post-lift, the count-based check escalates again automatically. This is the specific gap the parent brief names ("closes one-shot reset, no re-trigger") — the dead `recurringBugEscalationFlag` this replaces had no re-arm mechanism at all (it was never read, so it never had *any* mechanism, live or dead).

This wiring is a flow-doc contract (what field to read/write, when), not new schema — §9 assigns it to agent-father alongside §2.7's items, consistent with the parent brief's own ownership table.

---

## 4. StatusEnum Consumer Ripple Audit (verified, not assumed)

| Consumer | File | DEGRADED impact | Change needed |
|---|---|---|---|
| Cold eviction (bash-literal `TERMINAL_SET` copy) | `scripts/orch-cold-evict.sh:82,96` | Never matches (excluded from `TERMINAL_SET`, §2.3) | None |
| Sprint terminal-status archive | `docs/agents/pm/flow/task-archive.md:39,43` | Same | None |
| BOUNDED-1 promote filter | `scripts/devteam-backlog-promote-bounded1.jq:580` | Filters `status=="BACKLOG"\|"TODO"` explicitly — `DEGRADED` structurally excluded | None |
| BOUNDED-1 claim filter | `scripts/devteam-backlog-claim-bounded1.jq` | Selects by `promoted_by` stamp, not status | None |
| Lane coherence map | `orchStateSchema.ts::LANE_ALLOWED_STATUSES` | New value must be added to `review`/`qa` | §2.4 (this leg) |
| `sprint_goal` terminal-alias canonicalization | `orchStateSchema.ts::SPRINT_GOAL_TERMINAL_ALIASES` | Deliberately excluded (DEGRADED is not a terminal alias target) | None |
| Task-count summary (`countTasksFromTaskBoard`) | `orchStateStore.ts:442-464` | Falls into the `else` bucket (counted as "backlog"), same as `TODO`/`BLOCKED`/`DEFERRED` today | None — soft-miscount risk, cosmetic, flagged not fixed (frontend/dashboard count display is out of this leg's zone) |
| `orch-validate.mjs` display constant | `STATUS_ENUM_DISPLAY` | Cosmetic error-text only | 1-line append (§2.2) |
| PO triage dedup scan | `docs/agents/po/flow/triage-signals.md:18-19` (`status ∈ TODO/IN_PROGRESS/REVIEW/BLOCKED`) | `DEGRADED` rows currently invisible to PO's own dedup scan | Flagged for agent-father flow-doc wiring (§9, not this leg's schema work) |

---

## 5. Risk Flags

1. **Must-fix (addressed above):** naive unconditional gate would brick the live file on the very next write (§2.5) — resolved via frozen grandfather allowlist.
2. **Must-fix (addressed above):** standalone-function gate placement would repeat the lane-coherence/ref-integrity drift class (§1 counter-example, §2.2) — resolved by extending the existing root `.superRefine()`.
3. **Soft, flagged not fixed:** `orch-cold-evict.sh`'s `TERMINAL_SET`/`TERMINAL_TASK_STATUSES`/`TERMINAL_SPRINT_STATUSES` are hand-typed bash-literal copies of the TS `TERMINAL_SET`, not an import (bash cannot import `.ts`). Currently harmless (DEGRADED correctly excluded by construction) but a latent drift risk for **any future** TERMINAL_SET change — worth a follow-up note for whoever owns RC-ORCHMONO (that leg already touches this exact file).
4. **Soft, flagged not fixed:** `countTasksFromTaskBoard()` mis-buckets `DEGRADED` as "backlog" in dashboard summary counts (§4) — cosmetic, no data corruption, frontend/dashboard consumer out of zone for this leg.
5. **Naming collision (cosmetic only, zero code-path overlap):** `"DEGRADED"` is already a literal value of an unrelated type, `DetectionClass` in `apps/mcp-server/src/domain/services/degradationRules.ts` (self-improve signal-accuracy detection — a completely different domain: whether a *trading signal type*'s accuracy has degraded, not whether a *task row* was independently verified). Different type, different file, zero shared code path — noted so a future reader doesn't conflate the two "DEGRADED"s.
6. **Security/DDD:** none — this leg adds Zod refinements and one sidecar JSON file; no new network surface, no new secrets, no cross-service calls.

---

## 6. Test Strategy

Following the existing convention in `apps/mcp-server/src/infrastructure/__tests__/orchStateSchema.test.ts` (continues the `M1..M4`/`E1..E2` naming already in use — see file for precedent):

- **V1 — Fabrication-rejection (the exact test the parent diagnosis asked for):** a candidate with a non-grandfathered id, `status: "DONE_VERIFIED"`, no `verification` field → `safeParse` fails, issue path `[..., "verification", "raw_probe"]`.
- **V2 — Malformed raw_probe rejected:** `verification.raw_probe` present but missing `observed_at` → fails.
- **V3 — Valid raw_probe accepted:** all 4 fields present, non-grandfathered id → `safeParse` succeeds.
- **V4 — Grandfathered id exempted:** id in `RC_VERIF_GRANDFATHERED_IDS`, `status: "DONE_VERIFIED"`, no `verification` → `safeParse` succeeds (regression guard — proves the 33 live rows keep parsing).
- **V5 — All-lane coverage:** same fabrication-rejection case injected into each of backlog/done/done_verified/in_progress/qa/ready/review/active_sprints.tasks/closed_sprints.tasks (mirrors the existing `QA-1` "9 of 9 lanes" test) — proves the widened-beyond-prose scope (§2.2) actually holds for all 9 lanes, not just `backlog`.
- **D1 — DEGRADED enum accepted; honest_gap_reason required:** `status: "DEGRADED"` without `verification.honest_gap_reason` → fails; with it → passes.
- **D2 — DEGRADED lane coherence:** `DEGRADED` valid in `review[]`/`qa[]`, rejected (coherence issue, not schema fail) in `backlog[]`/`in_progress[]`/`done[]`.
- **T1 — TERMINAL_SET regression:** `DEGRADED` is NOT a member of `TERMINAL_SET` (extends the existing `TERMINAL_SET: sprint eviction predicate values` describe block).
- **CLI acceptance (`scripts/test-orch-validate-ac.mjs`):** add AC-5 mirroring AC-1..AC-4's existing pattern — pipe a fabricated `DONE_VERIFIED` candidate through the real `orch-apply.sh` end-to-end (not just the unit-level Zod parse) and assert exit 1 + live file byte-unchanged, per the parent brief's own literal acceptance criterion #1.
- **Server-path parity (new, proves §1's single-source claim structurally, not just by code inspection):** a test that calls `writeOrchStateAtomic()` (path 2) directly with a fabricated `DONE_VERIFIED` candidate and asserts it throws the SAME schema error `orch-validate.mjs` (path 1) would produce — this is the regression test that would have caught the pre-existing lane-coherence/ref-integrity gap in §1 had it existed earlier.
- **RC-CONVERGE (`scripts/bug-class-recurrence-check.test.sh`, mirrors `emit-audit-signal.test.sh`):** seed 2 occurrences of the same `bug_class` within 30 days → `ESCALATE` verdict; mark the referenced task `DONE_VERIFIED` via the §2 gate → ledger `freeze_ref` clears + `count` resets to 0 in the same tick; seed a 3rd post-lift occurrence → escalates again (proves re-arm, not one-shot).

---

## 7. Coordination Notes for Later Legs (NOT designed here — pointers only)

- **RC-ORCHMONO:** owns `orch-cold-evict.sh` and `orch-apply.sh`'s proposed ~600KB hot-ceiling gate. `orch-state.json` is currently **844,325 bytes** (measured live at brief-authoring time) — well above that proposed ceiling, corroborating the parent brief's own urgency for that leg. §5 risk #3 (hardcoded bash `TERMINAL_SET` copy) is this leg's file — worth folding in as a 1-line drift-closing note when that leg's own TECH doc is authored, not a blocker for it.
- **TE-T15** (cold-evict terminal/wrapper task_board bloat) — per the board row's own note, this OVERLAPS RC-ORCHMONO's territory and stays sequenced AFTER/WITHIN it; this leg (RC-VERIF/RC-CONVERGE) does not touch `orch-cold-evict.sh` at all, so there is no collision with this leg's deliverables.
- **RC-GITSTATE:** owns `tool-usage-stats.json`/`coverage-state.json` gitignore migration and per-ticker stamping fixes. The new `docs/data/bug-class-convergence-ledger.json` sidecar (§3.3) is a **new git-tracked file** this leg introduces — flagged so RC-GITSTATE's owner is aware of one more candidate file in that inventory (it is NOT pure-derived/regenerable like `tool-usage-stats.json`, so it should likely stay tracked, but the call belongs to that leg's owner, not this brief).
- **RC-CEREMONY:** no overlap — that leg touches `dev-team-tick-preflight.sh`/`cowork-tick-preflight.sh`/`auditor-tier1-probe.sh` SF-1 re-entrancy, none of which this leg touches.

---

## 8. Standard Detection

Classification: **BUG-FIX / REFACTOR (in-zone, no new primitives)** — extends an existing schema/validator choke point and adds one sidecar ledger file mirroring an already-shipped pattern (`auditor-dedup-ledger.json`). No new service, no new microservice.
**BUILD-STANDARD: not-applicable** (per the architect flow's own Standard Detection matrix — this is a bug-fix/hardening class, not a new-service or new-feature class).

---

## 9. Task Decomposition for PM (dependency-ordered, zone-mapped)

Zone: **multi** — `apps/mcp-server/` (schema/tests) + `scripts/` (validator display text, new ledger script, CLI AC test) + `docs/agents/{qa,fixer,pm,po}/` (flow-doc wiring, agent-father-owned) + `docs/standards/` (doc sync). Per zone-detect skill Tier-2: "files span >1 zone → route to `developer` (generic)" for the code items; flow-doc items route to `agent-father` per the parent brief's own §5 ownership table (verified live: it explicitly assigns "fixer/qa flow wiring + pm.md/architect.md re-encoding" to agent-father, not developer).

| ID | Task | Owner | Zone | Depends on | Notes |
|---|---|---|---|---|---|
| **T1** | Run the grandfather-id jq query (§2.5) against the LIVE hot file at implementation time (re-derive, do not trust this brief's snapshot count) | developer | `apps/mcp-server/` | — | Must run immediately before T2, not days later — the set can grow between brief-authoring and implementation. |
| **T2** | Add `RawProbeSchema`/`VerificationSchema`, `TaskSchema.verification`/`.bug_class` fields, `StatusEnum` 13th value `DEGRADED`, `LANE_ALLOWED_STATUSES` review/qa entries, extend root `.superRefine()` with `checkVerificationGate()` + `RC_VERIF_GRANDFATHERED_IDS` (§2.1-§2.4) | developer | `apps/mcp-server/` | T1 | Core schema change. |
| **T3** | Unit tests V1-V5, D1-D2, T1 (§6) in `orchStateSchema.test.ts` | developer | `apps/mcp-server/` | T2 | Follow existing `M1..M4`/`E1..E2` naming convention in the same file. |
| **T4** | `orch-validate.mjs` `STATUS_ENUM_DISPLAY` cosmetic update + `test-orch-validate-ac.mjs` AC-5 (§6) | developer | `scripts/` | T2 | |
| **T5** | Server-path parity test (`writeOrchStateAtomic()` fabrication-rejection, §6) | developer | `apps/mcp-server/` | T2 | Proves §1's single-source claim structurally. |
| **T6** | `scripts/bug-class-recurrence-check.sh` + `bug-class-recurrence-check.test.sh` (§3.3, mirrors `emit-audit-signal.sh`'s ledger helpers verbatim, 30-day window, count-based escalation) | developer | `scripts/` | — (independent of T1-T5; RC-CONVERGE is schema-independent of RC-VERIF's Zod work except for reading the `bug_class`/`DONE_VERIFIED` fields T2 adds) | |
| **T7** | `docs/standards/task-schema.md` status table sync (7→13 values) + document the `verification`/`bug_class` fields (§2.6) | developer or agent-father (PM's call) | `docs/standards/` | T2 | Doc-only, pre-existing drift, opportunistic fix while the file is the governance reference for this exact change. |
| **T8** | Flow-doc wiring: `docs/agents/qa/flow/main.md`, `docs/agents/fixer/flow/main.md` RETURN step, `docs/agents/fixer/init.md` knowledge-load, `docs/agents/pm/flow/task-archive.md`, `docs/agents/po/flow/sprint-signoff.md`, `docs/agents/po/flow/triage-signals.md` (dedup scan + DEGRADED visibility, §4) — attach `verification.raw_probe` before writing `DONE_VERIFIED`; DEGRADED-with-honest_gap_reason as sanctioned exit; auto-lift wiring (§3.4); re-encode `pm.md`/`architect.md` convergence section referencing the new mechanism instead of the dead `recurringBugEscalationFlag` prose | agent-father | `docs/agents/` | T2, T6 | Per parent brief §5 ownership table — thin flow-doc/persona edits only, explicitly not architect/developer territory. |
| **T9** | QA gate: run T3/T5/T6 test suites + `bun scripts/test-orch-validate-ac.mjs` (AC-1..AC-5) + `bash scripts/test/orch-apply-wrapper-tests.sh` (regression: existing wrapper contract untouched) | qa | cross-service | T1-T8 | Standard merge gate, RAW-verify not badges. |

**Sequencing:** T1→T2 is strictly serial (grandfather list must exist before the gate does). T3/T4/T5 can run in parallel once T2 lands (all consume the same schema, touch different files). T6 is independent and can start immediately (does not depend on T2's superRefine — RC-CONVERGE's ledger script only needs the `bug_class` field, which is a trivial additive schema field, not the gate logic). T7 can run any time after T2. T8 depends on both T2 (needs the final field/enum shapes) and T6 (needs the ledger script's CLI contract for the auto-lift wiring). T9 gates the whole leg.
