---
sprint: BACKLOG
branch: task/runidle-1-audit-active-sprints
size: S
zone: cross-service/dev-flow/
depends_on: []
blocks: [TASK_RUNIDLE-2-REDESIGN, TASK_RUNIDLE-3-STALENESS]
---

## TLDR
Audit the codebase to understand how active_sprints[] accumulates entries and identify what structure is missing to close sprints when their work completes. Document findings to unblock redesign of the idle-check predicate.

## [PM] Planning Context
- **Zone:** cross-service/dev-flow/ (analysis/architecture)
- **Acceptance Criteria:**
  - [ ] Grep or search for every location that writes to `.task_board.active_sprints[]` (adds new sprint, appends task)
  - [ ] Document the production writer(s) and their contracts
  - [ ] Map where sprints SHOULD transition to DONE or closed (look at po/sprint-signoff.md flow)
  - [ ] Audit current state: list all 8 active sprints with id, status, updated_at, task count, and age calculation
  - [ ] Identify specifically which sprints are stale (updated_at > 7 days) and which are childless (zero dispatchable tasks)
  - [ ] Determine what is missing: sprint closeout logic, a scheduled pruner, or a gating rule in signoff
  - [ ] Write comprehensive findings in `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md` with recommendations
- **Files to read first:**
  - `docs/agents/po/flow/sprint-signoff.md` (line ~200-250, sprint status transitions)
  - `docs/policies/dev-standards.md` (sprint lifecycle section if present)
  - `docs/agents/dev-team/flow/main.md` (sprint initialization and closeout)
  - `docs/data/orch/orch-state.json` (current board state, look at `.task_board.active_sprints[]`)
- **Files to create:**
  - `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md` — audit findings and recommendations
- **Files to modify:**
  - None (audit only, no code changes)
- **Dependencies:**
  - None — this is the prerequisite for tasks 2 and 3
- **Knowledge needed:**
  - `docs/ARCHITECTURE.md` (overall sprint/task lifecycle)
  - `docs/standards/task-schema.md` (active_sprints structure and required fields)
  - Standing rule on sprint lifecycle per memory/previous sprints (check docs/agent-memory/ for notes)

## What This Task is Fixing
RC-IDLE-LOOPS shipped 2026-07-04 with a check that active_sprints be empty before allowing the idle gate to fire. That predicate has never been true, so the guard is dead. Root cause: sprints are added but never closed, creating a permanent floor. This audit identifies what is missing so we can fix it properly.

## Background
The dev-team idle-tick guard requires 4 predicates to be true to emit RUN-IDLE. Predicate (d) is "active_sprints == 0", which has never been true live. All 8 sprints are status=ACTIVE, two are stale (2026-07-17, >3 weeks), and none have been closed. There is no automatic producer that closes sprints when work finishes.

## Related Rows (for reference)
- FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR (parent task, backlog)
- SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (instance 9 — related dead-gate class)
- FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE (related dangling-sprint issue)

## [QA] Review Record — 2026-08-09T00:00:00Z — CHANGES_REQUESTED

Verified against LIVE `docs/data/orch/orch-state.json` (not trusted from the brief's prose). Most of
the audit holds byte-exact: `closed_sprints[]`=20 (all 4 cited commits real, subjects match); all 8
`active_sprints[]` rows' status/task-status-breakdown/dispatchable-counts/key-counts(7-17)/malformed
`...14ZZ` timestamp (§4 table, `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md:127-136`)
independently reproduced exactly; GAP-1 framing (§5.1), the latent predicate-drift bug (§3.3), and the
SPIKE/dangling-ids dedup reasoning (§6) all check out against live board state.

**Blocking issue — GAP-2 "dangling subtasks" claim is factually wrong for both named sprints:**

- `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md:136` — table row for
  `SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE` marks `tasks[]` column "**absent** (no `subtasks` either —
  bare pointer row)", `dispatchable` **0**, `childless` **yes**. Live: `.task_board.active_sprints[]`
  select id==SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE` DOES carry `subtasks: [...]` with 9 entries
  (T1-T9), and ALL 9 exist as real board rows: `T1`/`T2` = `done_verified[]` (T1 closed
  2026-08-08T18:43:08Z, commit `ad6e422e9`, one day before this brief's claimed audit date), `T3`-`T9`
  (7 rows) = `ready[]` status READY — dispatchable right now.
- `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md:145-150` — "Dangling
  subtasks confirmed: all 8 of SPRINT-CCATO-TRUTHGATE-MCP-NATIVE's named `subtasks[]` IDs ... zero
  matches anywhere on the board." False: 5 of 8 (`CCATO-MCP-T3/T5/T6/T7/T8`) exist as real `ready[]`
  READY rows (only `T1/T2/T4` are actually not-found/dangling). This is a pre-existing, already
  board-documented fact — `docs/data/orch/orch-state.json:9178` (po's 2026-08-06T11:29Z malformed-
  timestamp finding) already names all 5 as live `ready[]`/P0/`next_agent=dev-mcp-server` rows, 3
  days before this brief's "measured 2026-08-09" audit date.
- Consequence: §5.2 (`:171-181`)'s causal claim ("zero tasks tracked... no event will ever cause PM
  to re-examine... work with no board-visible existence at all") and §7-8's recommendations built on
  "GAP-2's two childless sprints have zero dispatchable nested tasks" (`:224-227`) and "both currently-
  stale sprints qualify today" (`:237`) materially overstate GAP-2's severity — SYSREMAKE-P2 in
  particular has 7 live dispatchable tasks and active work landing as recently as yesterday, so it is
  not "childless" and its own reactive closeout may in fact progress via its flat-lane rows even
  without a redesign (the real gap is narrower: PM's `active_sprints[].tasks[]` reactive scan doesn't
  resolve `subtasks[]` pointers into the flat lanes, not "the work was never minted").

**Fix requested:** re-measure §4's `tasks[]`/`dispatchable`/`childless` columns and §4 Notes'
"dangling subtasks confirmed" claim for both GAP-2 sprints against live `ready[]`/`done_verified[]`
(resolving each `subtasks[]` id to its actual board lane, not asserting non-existence), and correct
§5.2/§7/§8's downstream narrative and recommendations accordingly before TASK_RUNIDLE-2/3 dispatch.

verdict: CHANGES_REQUESTED
round: 1

## [Developer] Round-1 Fix Record — 2026-08-09T00:00:00Z

Direct-commit correction per router instruction (own row, not a fixer handoff — round < 2 stays
with the row's own developer, no separate fixer spawn needed since the fix is confined to this
task's own deliverable doc).

- **Issue fixed:** `docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md`'s GAP-2
  "dangling subtasks confirmed" claim (§4 Notes, `:145-150` in the reviewed revision) — re-resolved
  all 17 `subtasks[]` ids (9 `SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE` + 8
  `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE`) individually against live `docs/data/orch/orch-state.json`
  `ready[]`/`done_verified[]`, per QA's explicit instruction not to re-assert "zero matches"
  without checking each one.
- **Findings (matches QA's own re-check exactly):** SYSREMAKE-P2's 9/9 subtasks resolve to real
  board rows (T1/T2 `done_verified[]`, closed 2026-08-08T18:43:08Z/19:01:23Z, commit `ad6e422e9`;
  T3-T9 `ready[]` status READY, dispatchable) — 7 dispatchable, not childless. CCATO's subtasks are
  5/8 dispatchable `ready[]` rows (T3/T5/T6/T7/T8, P0, `next_agent=dev-mcp-server` — already
  board-documented by po's 2026-08-06T11:29Z finding, `docs/data/orch/orch-state.json:9137`/
  `:13119`), only T1/T2/T4 (3/8) genuinely not found on any lane.
- **Sections corrected:** §1 (exec summary GAP-2 bullet — added corrected-count pointer), §4
  (table `tasks[]`/`dispatchable`/`childless` columns for both GAP-2 rows; replaced "dangling
  subtasks confirmed" Notes bullet with per-id resolution; added a new Notes bullet on container
  `updated_at` being decoupled from child-task activity for SPRINT-S shape), §5.2 (GAP-2 causal
  narrative — closeout-blindness via PM's reactive `.tasks[]`-only check remains real, but "no
  board-visible existence at all" was false for the majority of both sprints' work), §7 (Task 2
  predicate redesign — added the requirement that `subtasks[]` must resolve to flat-lane status
  or the new predicate reproduces the exact §3.3 false-negative on these two sprints; corrected
  "GAP-2's two childless sprints ... would immediately stop blocking idle" to "will correctly
  continue to block idle under a correct implementation"), §8 (Task 3 staleness guard — corrected
  "both currently-stale sprints qualify today" to "neither qualifies once dispatchable counting is
  correct"; added a recommendation that age computation for SPRINT-S shape should also consider the
  freshest resolved-subtask `updated_at`, not the container field alone).
- **Sections NOT touched (QA-confirmed accurate, not re-litigated):** §2 (ADD side), §3 (REMOVE
  side + §3.3 latent bug), §5.1 (GAP-1), §6 (related-rows dedup), and §4's 6 non-GAP-2 table rows.
- **Verification:** re-ran the per-id jq resolution live against `docs/data/orch/orch-state.json`
  this cycle for all 17 ids — output matches QA's cited findings exactly (same lanes, same
  statuses, same dates, same commit shas). Doc-only correction; no `apps/` code touched, `bun
  test`/`tsc` structurally N/A.
- **Guardrails re-confirmed:** no new `active_sprints[]`/`sprint_goal.entries[]` entry minted for
  this correction work (same PO guardrail 1 as round 0).
- **Board:** `TASK_RUNIDLE-1-AUDIT` moved back to `review[]`, `next_agent=qa` via `orch-apply.sh` —
  not self-approved past QA.
