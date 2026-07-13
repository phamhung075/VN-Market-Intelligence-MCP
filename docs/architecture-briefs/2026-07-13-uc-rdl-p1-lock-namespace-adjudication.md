# UC-RDL-P1 — Lock Namespace Adjudication: `intent:` vs `task:` vs `sprint-task:`

**Task:** UC-RDL-P1 (P0, ULTRACODE-AUDIT-FIXALL) — "Align router outer-wrap lock namespace to the
live `task:` prefix." Source: `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#router-dispatch-locking-P1`
(already CONFIRMED there; this brief re-verifies against current live state, disentangles a
conflation in the fresh mint's framing, and produces the executable design + AC).

**Verdict:** REAL_DRIFT — but narrower than the mint's framing. Two claims must be separated:

| Claim | Verdict |
|---|---|
| `intent:<agent>:<intent-key>` (task_kind=`intent`) has "drifted" from `task:<task_id>` and should be aligned/merged | **FALSE POSITIVE — REJECT.** These are two intentionally distinct lock kinds. Merging them would break the router's per-agent-intent mutex for dispatches that have no board row. |
| `.claude/skills/dispatch-claim/SKILL.md` + `.claude/skills/task-lock/SKILL.md` document the sprint-task chain-mutex prefix as `sprint-task:<task_id>`, while 100% of live flows and the server itself use `task:<task_id>` | **REAL, CONFIRMED drift.** Doc-only fix, zero runtime risk. This is the actual CRITICAL bug the audit found. |

---

## STEP 1 — Adjudication evidence

### A. `intent:` vs `task:` — intentional two-tier design (not drift)

The mint's framing (`CLAUDE.md` Phase B literally shows `task_id="intent:<agent>:<intent-key>"`,
`task_kind="intent"`) is accurate as a *quote*, but conflates it with a *different* section of the
same skill file — `dispatch-claim/SKILL.md` §"Sprint-Task Outer Wrap" (lines 267–283), which uses a
**separate** prefix `sprint-task:<task_id>` for a **separate** purpose. `intent:` and `task:` were
never the same lock and were never supposed to collide:

1. **Server-side enum proves 7 distinct kinds, not 2 confused ones.** `coordinationTools.ts:90`
   (`task_claim`) and `:227` (`task_list_held`): `z.enum(["cowork-slot", "sprint-task",
   "dashboard-row", "commit-mutex", "intent", "orphan-signal", "session-presence"])`. The tool's own
   top-level description (`coordinationTools.ts:74-79`): *"sprint-task (orch-state.json .task_board
   rows) ... intent (router pre-claim gate — CLAUDE.md step 2.5 dispatch-claim SKILL)"* — two
   different kinds, described in the same sentence as different things, by the code that actually
   executes the lock.
2. **Format guidance is explicit and already correct.** `coordinationTools.ts:86-87` `task_id`
   describe(): *"Format per §1: cowork-slot:<slot_id>:<nominal_tick>, task:<task_id>,
   dash:<recipient>:<row_id>"* — the server documents `task:<task_id>` (not `sprint-task:`) as
   canonical for the row-mutex, and separately recognizes `intent:` via `task_kind=intent`.
3. **The reaper's own reconciliation code treats `intent:` as a legitimately different,
   board-row-less category — by design, not by accident.** `tasksMdJanitorJob.ts:198-206`
   `KNOWN_LEGIT_PREFIXES` (used by `isKnownLegitPattern()`, wired from `system-auditor/handlers.md`
   §Step R-1b) explicitly whitelists `"intent:"` alongside `"cron:"`, `"po-triage-"`,
   `"esc-datacov:"`, `"commit-mutex"` — locks that are *"board-row-less OR held concurrently with
   any active task BY DESIGN"*. If `intent:` were meant to collapse into `task:<task_id>` this
   allowlist entry would be redundant/wrong; its presence is proof the system was built assuming
   the two never correspond 1:1.
4. **Semantic scope differs.** `intent:<agent>:<intent-key>` keys on an *(agent, intent-key)* pair
   that need not be a task_board row at all — `dispatch-claim/SKILL.md:61-67` gives live examples
   `intent:cowork-team:digest-daily`, `intent:qa:bctc-regression-suite` — neither is a board row ID.
   `task:<task_id>` keys on a specific `.task_board` row and MUST match the inner self-claim key the
   spawned specialist (developer/qa/ba/agent-father/po) uses, so the outer wrap and inner self-claim
   contend on the identical string.
5. **Empirical confirmation from THIS dispatch.** The dev-team dispatcher that spawned this
   architect cycle for board row `UC-RDL-P1` held lock `task:UC-RDL-P1` — **not**
   `intent:architect:UC-RDL-P1`. This is dev-team's own sprint-task outer wrap (the
   `execute-tier.md` / `O-S1..O-S7` family per `docs/architecture-briefs/2026-05-21-task-id-format-audit.md`),
   a different dispatcher layer than the main-terminal CLAUDE.md Phase B `intent:` gate. It already,
   correctly, uses `task:` — no change needed, no conflation to fix.

**Conclusion A:** merging/aligning `intent:` to `task:` would be actively harmful — it would defeat
the router's ability to mutex a non-task-row dispatch (e.g. two peer sessions both trying to fire
`digest-daily`) and would break the reaper's board-row-less allowlist. **Reject this half of the
finding as written.**

### B. `sprint-task:` vs `task:` — real, already-independently-verified drift

This is the part the 2026-07-12 ultracode audit actually substantiated (`router-dispatch-locking-I1`
/ `-P1`, both CONFIRMED). Re-verified here against current disk state (all citations re-read, not
trusted from the brief alone):

- `.claude/skills/dispatch-claim/SKILL.md:39` — Canonical Namespace table, row "Sprint task (outer
  dispatcher)" → prefix `sprint-task:<task-id>`.
- `.claude/skills/dispatch-claim/SKILL.md:269-283` — §"Sprint-Task Outer Wrap": `task_id:
  "sprint-task:<task_id>"`, closing rule *"Align on `sprint-task:` prefix everywhere. Mismatch = two
  independent locks = no protection."*
- `.claude/skills/task-lock/SKILL.md:29` — Quick Reference: `task_id: "<kind>:<id>", // e.g.
  "sprint-task:TASK_1974"`.
- **Against this**, every live flow file that actually claims/releases/heartbeats the sprint-task
  chain mutex uses `"task:" + task_id` (re-grepped this cycle, zero exceptions):
  `docs/agents/dev-team/flow/main.md:575,595`, `docs/agents/dev-team/flow/execute-tier.md:43,64`,
  `docs/agents/developer/flow/main.md:69,93`, `docs/agents/developer/flow/microservice-main.md:92`,
  `docs/agents/developer/init.md:33,45`, `docs/agents/pm/flow/main.md:125,133`,
  `docs/agents/pm/init.md:126,139`, `docs/agents/ba/init.md:114,127`,
  `docs/agents/qa/flow/main.md:21,164`, `docs/agents/agent-father/flow/edit-apply.md:8,53,74`,
  `docs/agents/po/flow/sprint-kickoff.md:43`, `docs/agents/po/flow/sprint-signoff.md:28,42`,
  `docs/protocols/fail-loud-protocol.md:67` (STOP-RELEASE). A repo-wide grep for a `task_id`
  assignment using `sprint-task:` as a *value* (as opposed to the `task_kind` field, which correctly
  stays `"sprint-task"`) returns **zero** hits outside the two SKILL.md files and prose quoting them.
- **Server confirms `task:` is canonical, not `sprint-task:`** — see §A.2 above
  (`coordinationTools.ts:87`). `tasksMdJanitorJob.ts:185-189` `bareTaskId()`: *"Strip the `task:`
  prefix from a lock's task_id, matching the bare id used in orch-state.json .task_board entries"*
  — production reconciliation code hardcodes `task:` as the strip prefix. `system-auditor/handlers.md:46`
  independently normalizes the same way: `bare_task_id = held.task_id.startsWith("task:") ? ...`.
- **Why this is a real mutex-defeat, not cosmetic:** the SKILL's own stated rule — *"the outer claim
  key MUST match the inner self-claim key... Mismatch = two independent locks = no protection"*
  (dispatch-claim:282-283) — is self-refuting given its own example. A dispatcher that followed the
  SKILL literally would claim `sprint-task:<id>`; the spawned agent's inner self-claim (per every
  live flow file) claims `task:<id>`. Two different strings, two independent SQLite rows, zero
  mutual exclusion — exactly the failure the doc warns against, caused by the doc itself.
- **Provenance:** `dispatch-claim/SKILL.md:491-493` records *"LIFTED TO ROUTER SCOPE... rebinds from
  agent-scope `sprint-task:` to router-scope `intent:` namespace"* — a **06-28 brief intent that was
  never implemented** for the per-row chain mutex. The fleet kept using `task:` throughout; only the
  SKILL text was left mid-migration, pointing at a prefix (`sprint-task:`) neither the old nor the
  new live convention actually uses.

**Conclusion B:** confirmed drift, doc-only, zero runtime risk (nothing live uses `sprint-task:` as
an actual `task_id` value to migrate away from — the string appears in exactly 0 executable call
sites).

---

## STEP 2 — Design (Conclusion B only)

### Canonical namespace (post-fix — unchanged from what's already live)

| Scope | `task_id` prefix | `task_kind` | Status |
|---|---|---|---|
| Router user-intent dispatch (no board row) | `intent:<agent>:<intent-key>` | `intent` | Already correct — no change |
| Cron tick fire-election | `cron:<flow-slug>:<tick>` | `cowork-slot` / `sprint-task` (per existing table) | Already correct — no change |
| **Sprint-task chain mutex (outer dispatcher wrap AND inner agent self-claim)** | **`task:<task_id>`** | `sprint-task` | **Doc says `sprint-task:` — must be corrected to `task:`** |
| Published artifact dedup | `published:<kind>:<period-key>` | `cowork-slot` | Already correct — no change |
| Session presence | `session-presence:<session-uuid>` | `session-presence` | Already correct — no change |

`task_kind` stays `"sprint-task"` — **id-prefix and kind are different axes.** The kind name legitimately
says what *category* of thing is locked; the prefix is the *string format* of the lock key. Do not
rename the enum value.

### Files to change (both doc-only; zero code, zero schema, zero migration)

1. **`.claude/skills/dispatch-claim/SKILL.md`**
   - Line 39 (Canonical Namespace table): `sprint-task:<task-id>` → `task:<task-id>` (leave
     `task_kind` column = `sprint-task` unchanged).
   - Lines 269-283 (§"Sprint-Task Outer Wrap"): replace `task_id: "sprint-task:<task_id>"` with
     `task_id: "task:<task_id>"`; reword the closing rule from *"Align on `sprint-task:` prefix
     everywhere"* to **"Align on the `task:` id-prefix everywhere; `task_kind` stays `sprint-task` —
     id-prefix and kind are different axes."**
   - Line 492 (historical provenance prose, "LIFTED TO ROUTER SCOPE... rebinds... to router-scope
     `intent:` namespace") — leave as-is; it is a historical changelog entry about the 06-28 brief's
     *intent*, not a live instruction, and rewriting history is out of scope.
2. **`.claude/skills/task-lock/SKILL.md`**
   - Line 29-30 (Quick Reference example): `task_id: "<kind>:<id>", // e.g. "sprint-task:TASK_1974"`
     → `task_id: "task:<id>", // e.g. "task:TASK_1974"` (keep the `task_kind` field's own example
     value `"sprint-task"` on line 30 unchanged — that's the kind, correctly named).

No other file needs to change. `CLAUDE.md` §PRE-CLAIM Phase B already correctly documents `intent:`
(Conclusion A — no drift there). Every flow `.md`, `fail-loud-protocol.md`, and all server code
(`coordinationTools.ts`, `tasksMdJanitorJob.ts`) already use `task:` and require no edits.

### Blast radius / risk

- **Runtime risk: none.** This is a documentation-only correction that brings two SKILL files into
  agreement with behavior that is already universal in the live fleet and the server. No running
  lock, no in-flight claim, no TTL, no `owner_client_session` changes.
- **In-flight lock migration: not applicable.** Verified (§B) that zero live call sites construct a
  `task_id` value with the `sprint-task:` prefix — there is nothing to migrate. Any future dispatcher
  built by copy-pasting the (currently wrong) SKILL text is the risk this fix closes, not a risk it
  introduces.
- **Coordination note:** `orch-state.json` line ~6498 flags a related, larger backlog item (collapse
  router preflight Phase A/A.5/B into a single server-side `dispatch_preflight` tool) that explicitly
  says *"Coordinate with UC-RDL-P1 (lock-prefix) landing first."* This fix should merge before that
  consolidation starts, so the consolidated tool is built against the corrected namespace, not the
  drifted one.

### Acceptance Criteria

- AC1: `.claude/skills/dispatch-claim/SKILL.md:39` Canonical Namespace table row "Sprint task (outer
  dispatcher)" reads `task:<task-id>` (not `sprint-task:<task-id>`); `task_kind` column unchanged
  (`sprint-task`).
- AC2: `.claude/skills/dispatch-claim/SKILL.md` §"Sprint-Task Outer Wrap" code block's `task_id`
  value reads `"task:" + task_id` (or `"task:<task_id>"` in prose form); closing rule reworded per
  above (id-prefix vs kind distinguished explicitly).
- AC3: `.claude/skills/task-lock/SKILL.md:29-30` Quick Reference example reads `task_id: "task:<id>"`
  with inline example `"task:TASK_1974"`; `task_kind` line's example value stays `"sprint-task"`.
- AC4: Regression grep — `grep -rn 'task_id.*"sprint-task:' .claude/ docs/` returns zero hits after
  the change (confirms no other doc site was missed).
- AC5: `CLAUDE.md` §PRE-CLAIM Phase B (`intent:<agent>:<intent-key>`, `task_kind="intent"`) is
  explicitly left UNCHANGED — a reviewer diff that touches CLAUDE.md's intent: pattern fails this AC
  (guards against re-introducing Conclusion A's rejected merge).
- AC6: No `apps/mcp-server/**` file is touched (this is a pure doc fix; any PR touching server code
  is out of scope and should be split/rejected).

### Owner — READY_FOR_DEV

**`agent-father`** — sole historical and current committer of both `.claude/skills/dispatch-claim/SKILL.md`
and `.claude/skills/task-lock/SKILL.md` (commits `14bb634a9`, `44c1e60ab`, `fa950e086`, `c004a0ce9`,
`03fb2cc14`, `c44a295d7`, `dc2d80e96`, etc. — all `chore(agent-father/...)` or `feat(.../TASK_19xx)`
against these exact two files). This is a skill-doc lifecycle edit, not application code — routes to
`agent-father`'s "edit" sub-flow, not `dev-mcp-server` or generic `developer`. No zone/BUILD-STANDARD
applies (doc correction, no new primitives — `BUILD-STANDARD: not-applicable`).

---

## Journal

Full reasoning trail → `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-architect.md`
(task_id: UC-RDL-P1).
