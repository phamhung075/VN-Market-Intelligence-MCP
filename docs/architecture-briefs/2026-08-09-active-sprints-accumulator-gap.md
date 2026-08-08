# active_sprints[] accumulator gap — audit (developer, 2026-08-09)

**Disposition:** audit only. No code changes, no orch-state.json content changes beyond this
task's own board-row status flip (backlog→review). Feeds `TASK_RUNIDLE-2-REDESIGN` (predicate
redesign) and `TASK_RUNIDLE-3-STALENESS` (staleness guard), both `depends_on` this row.

**What this fixes:** unblocks the root-cause line behind
`FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR` — `_step5_idle_check()`'s predicate (d)
(`scripts/agents-flow/dev-team-tick-preflight.sh:380-382`) checks raw
`.task_board.active_sprints | length == 0`. `consecutive_run_idle` has read `0` in
`docs/data/dev-team-idle-widen-state.json` since RC-IDLE-LOOPS shipped 2026-07-04 — this
predicate has never once been true.

---

## 1. Executive summary

The closeout/eviction machinery for `active_sprints[]` **is real, tested, and has worked** — 20
sprints sit in `closed_sprints[]` today, evicted by a working pipeline (§3). The predicate is
still permanently unsatisfiable because of **two independent structural gaps**, not a missing
mechanism:

- **GAP-1 (steady-state flow):** removal requires a sprint's every nested task to reach terminal
  status; nothing caps concurrent sprint count on the open side. With ~6-8 sprints continuously
  in flight (ad hoc PO scripts open new ones as fast as old ones fully close, §2), the array
  essentially never transiently empties. Predicate (d) as written means "is any sprint anywhere
  in flight" — under normal operating tempo, that is nearly always true by construction.
- **GAP-2 (orphaned SPRINT-S shape):** 2 of the 8 live sprints use an alternate schema
  (`subtasks: [id,...]` string array, no nested `tasks[]` at all) whose closeout trigger — a
  reactive check inside PM's QA-Done handling — can structurally never fire for them, because
  there is no task inside them to complete. They have sat `ACTIVE` for 23 days and will stay that
  way indefinitely regardless of whether their real work ever gets dispatched.

A third finding (§3.3) is a **live but not-yet-triggered latent bug**: the two documented eviction
predicates disagree with each other, and the doc-only one is vacuously true for GAP-2's shape —
if it is ever executed literally it would wrongly archive both stale sprints as "done" despite
real undispatched work.

---

## 2. ADD side — every location that writes a NEW entry into `active_sprints[]`

There is **no single canonical "open sprint" flow**. `docs/agents/po/flow/sprint-kickoff.md`
(the one generic, reusable flow with "sprint" in its name) only appends to
`.sprint_goal.entries[]` and mints a `BA-*` backlog row — it never touches
`.task_board.active_sprints[]`. Every live sprint's `active_sprints[]` entry was instead created
by a bespoke, one-off `scripts/po-s*.jq` file (or, once, a direct hand-authored commit), each
invoked once by PO/PM and then never reused:

| Sprint | Producer |
|---|---|
| VN-MACRO-TOOLING | `scripts/po-vn-macro-tooling-sprint-open.jq` (`.task_board.active_sprints += [...]`) |
| OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 | `scripts/po-s135-ohlcv-wholerow-contam-lt1000-sprint-kickoff.jq` |
| SSOT-INTEGRITY-PERIMETER | commit `cf2f4f1bc` ("open SSOT-INTEGRITY-PERIMETER sprint") — hand-authored, no reusable script |
| BCTC-ANALYTICS-LAYER / AUDIT-FB-GATE-PROSE-HARDENING / BCTC-REFINE-STALL-RETRIGGER / SPRINT-CCATO-TRUTHGATE-MCP-NATIVE / SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE | same ad hoc pattern (pre-existing at audit time; each opened by its own one-off PO/pm-decompose write, no shared script found) |

Growth also happens **within** an existing sprint — new tasks appended to
`active_sprints[N].tasks[]` — via the same bespoke-script pattern, e.g.
`scripts/po-s111-fb-gate-currency-unit-english-word-mint.jq`,
`scripts/po-s122-ssot-perimeter-dod-harden.jq`, `scripts/po-s49-c1173-triage-accept.jq`,
`scripts/po-s28-c4-gate.jq`, `scripts/po-s48-board-write.jq`,
`scripts/po-s52-c1839b-done-rebaseline-57.jq`, `scripts/po-s56-batch234-done-deterministic-26.jq`
— one file per triage event, each with its own `.tasks += [...]` literal.

**Secondary finding (schema drift):** `docs/standards/task-schema.md` only specifies required
fields for **nested** `tasks[]` rows (`id`, `title`, `owner`, `status`, `zone`, `created_at`) — no
schema exists for the sprint **container** object itself. This is why the 8 live entries have 8
different key sets (confirmed live, see §4) — no writer is working against a shared contract.

---

## 3. REMOVE side — the mechanisms that exist and DO work

### 3.1 PM reactive status flip (does NOT remove the row)

`docs/agents/pm/flow/main.md` § 5 Monitor: "All of a sprint's `active_sprints[].tasks[]` reach
terminal status → **Sprint closeout** (UC-DTL-P9)" → runs `scripts/pm-closeout-head-idle.jq`
(atomic, via `orch-apply.sh`). This sets the sprint's `.status = "DONE"` **in place** — its own
header comment is explicit: *"Do NOT move the row to `closed_sprints[]` ... This transform never
removes a row or shrinks `task_total`."* Removal is deliberately deferred to §3.2.

**Trigger is reactive, not a sweep.** The closeout check lives as a sub-bullet under "QA Done +
journal present → update status DONE" in PM's § 5 Monitor — it only runs as a side-effect of PM
processing a QA-Done event for a task **inside that same sprint**, in the same PM cycle. Nothing
periodically re-examines all 8 `active_sprints[]` for "did this just become fully terminal via
some other path" (e.g. a task CANCELLED/DEFERRED directly by po triage, not via QA).

### 3.2 Actual array removal — two documented paths, two DIFFERENT predicates

- **`docs/agents/pm/flow/task-archive.md` § Sprint Eviction** (prose+inline jq, agent-executed):
  `select([.tasks[]?.status] | all(. as $s | $T | index($s) != null))` where
  `$T = ["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]` — keyed on the **nested**
  `tasks[]` all being terminal. Only runs when task-archive.md itself is entered, i.e. on
  HSC-3 terminal-lane bloat (`done[] > 10 OR done_verified[] > 0`) — an unrelated trigger
  condition, not "a sprint just closed."
- **`scripts/orch-cold-evict.sh`** (the canonical, actually-executed script — lines 116-127,
  499-505): keyed on the sprint's **own top-level `.status`** field being in
  `TERMINAL_SPRINT_STATUSES` (`DONE,DONE_VERIFIED,CANCELLED,DEFERRED,SKIPPED`) or prefixed
  `BCTC-`. Invoked from 3 sites: PM's HSC-6 per-task-DONE hook, `task-archive.md` Step 4, **and**
  `dev-team-tick-preflight.sh` § Step 5.5 automatically every tick (dry-run-gated: only runs a
  real eviction when `orch-cold-evict.sh --dry-run` reports the hot file would shrink).

**Evidence this works:** `closed_sprints[]` holds 20 entries today (e.g. `FLEET-HOST-SAFETY`,
`MCP-SURFACE-GAPS`, `ENV-ISOLATION`, `OHLCV-UNIT-CONTAM`, `ORCH-STATE-HOT-COLD-SPLIT`), landed by
real commits (`a7d3f3ab3` UC-DTL-P9, `dff7ee9e3` BA-IND-P1-MOMENTUM-FRONTEND closeout,
`9ae034fc7` ORCH-STATE-HOT-COLD-SPLIT signoff, `545a225b5` OHLCV-UNIT-CONTAM close). The
mechanism is not dead — it has fired 20 times. It only fires per-sprint, on full completion.

### 3.3 Latent bug (not yet triggered live) — predicate drift + vacuous truth

The two predicates in §3.2 disagree (nested-tasks-all-terminal vs. sprint's-own-status-terminal).
For a sprint whose `.tasks[]` key is **absent** (GAP-2, §5.2), `[.tasks[]?.status]` evaluates to
`[]`, and `[] | all(...)` in jq is **vacuously true**. If `task-archive.md`'s own inline snippet
is ever executed literally (as opposed to relying solely on `orch-cold-evict.sh`'s canonical
status-based check — a precedent this codebase has already flagged elsewhere, see
`dev-team-tick-preflight.sh` Step 5.5's own comment: *"that doc section is now the SSOT spec, not
the runtime path"*), it would silently archive `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE` and
`SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE` as "evictable" **right now**, discarding two
`ACTIVE`/`supervised:true` sprints with real, undispatched work purely because their task list is
empty rather than complete. This has not fired live (both sprints are still present, still
`ACTIVE`) — flagging for whoever redesigns/reconciles this in Task 2/3, not fixing here.

---

## 4. Live audit — all 8 `active_sprints[]`, measured 2026-08-09

| id | status | updated_at (or opened_at) | age | tasks[] | task statuses | dispatchable | stale (>7d) | childless |
|---|---|---|---|---|---|---|---|---|
| BCTC-ANALYTICS-LAYER | ACTIVE | opened_at 2026-06-02 (no `updated_at` field) | 68d since open | 35 | 19 DONE, 13 DONE_VERIFIED, 1 DEFERRED, 2 TODO | 2 | n/a (no updated_at) | no |
| VN-MACRO-TOOLING | ACTIVE | opened_at 2026-06-14 (no `updated_at` field) | 56d since open | 20 | 13 DONE, 6 DONE_VERIFIED, 1 BLOCKED | **0** | n/a (no updated_at) | **borderline — 0 dispatchable, 1 BLOCKED remnant** |
| AUDIT-FB-GATE-PROSE-HARDENING | ACTIVE | opened_at 2026-06-21 (no `updated_at` field) | 49d since open | 4 | 1 DONE_VERIFIED, 3 BACKLOG | 3 | n/a | no |
| SSOT-INTEGRITY-PERIMETER | ACTIVE | opened_at 2026-06-27T16:50Z (no `updated_at` field) | 43d since open | 6 | 2 DONE, 3 DONE_VERIFIED, 1 TODO | 1 | n/a | no |
| BCTC-REFINE-STALL-RETRIGGER | ACTIVE | opened_at 2026-06-27 (no `updated_at` field) | 43d since open | 9 | 4 DONE, 3 CANCELLED, 1 DEFERRED, 1 BACKLOG | 1 | n/a | no |
| OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 | ACTIVE | opened_at 2026-06-30T20:20Z (no `updated_at` field) | 40d since open | 3 | 1 DONE_VERIFIED, 2 TODO | 2 | n/a | no |
| SPRINT-CCATO-TRUTHGATE-MCP-NATIVE | ACTIVE | `updated_at: "2026-07-17T04:53:14ZZ"` (malformed — double `Z`) | **23d** | **absent** (uses `subtasks: [8 ids]` instead) | none tracked | **0** | **yes** | **yes** |
| SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE | ACTIVE | `updated_at: "2026-07-17T12:00:00Z"` | **23d** | **absent** (no `subtasks` either — bare pointer row) | none tracked | **0** | **yes** | **yes** |

Notes:
- **Schema drift confirmed live:** each row has a distinct key set (7-17 keys); only 2 of 8 carry
  `updated_at` at all, and one of those two is malformed ISO-8601 (`...14ZZ` — trailing double
  `Z`, same defect class as `feedback_bsd_date_3n_literal_corrupts_iso8601` /
  `feedback_hand_typed_iso_timestamps_drift_into_the_future`). Any staleness computation (Task 3)
  that does raw date parsing without defensively stripping trailing non-digit characters will
  throw or silently misparse on this field.
- **Dangling subtasks confirmed:** all 8 of `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE`'s named
  `subtasks[]` IDs (`CCATO-MCP-T1-DOMAIN-ENGINE` … `T8-DOD-HARNESS`) were searched across every
  flat lane (`backlog/ready/in_progress/review/qa/done/done_verified/blocked`) — **zero matches
  anywhere on the board.** The sprint's real work has never been minted as dispatchable rows; it
  exists only as a string-array pointer inside a stale sprint object. This is the direct cause of
  GAP-2 (§5.2) — not merely "unstarted work," but work with no board-visible existence at all.
- **VN-MACRO-TOOLING is a 3rd near-miss "childless" case,** distinct from the other two: it has 0
  dispatchable tasks (13 DONE + 6 DONE_VERIFIED + 1 BLOCKED), but it isn't stale by the >7-day
  test because it has no `updated_at` at all — its `opened_at` is 56 days old. Whether a `BLOCKED`
  remnant should count toward "childless" is a design decision Task 2 needs to make explicitly
  (see §6).

---

## 5. Root cause — two structural gaps

### 5.1 GAP-1 — steady-state flow gap (applies to the 6 "normal-shaped" sprints)

Predicate (d) demands the literal empty set. Removal only happens after **every** nested task in
a sprint reaches a terminal state — no partial credit — and nothing on the ADD side (§2) caps how
many sprints can be concurrently open. In observed steady-state operation this project runs 6-8
sprints in flight continuously; new ones open (via the ad hoc scripts in §2) at a pace that keeps
the array populated. None of the 6 real-task sprints audited above are within one task of fully
closing except SSOT-INTEGRITY-PERIMETER (5/6 done) and OHLCV (1/3 done) — the array's true
floor under this operating tempo is well above zero, not "eventually zero given enough time."

### 5.2 GAP-2 — orphaned SPRINT-S shape gap (the 2 stale sprints specifically)

`SPRINT-CCATO-TRUTHGATE-MCP-NATIVE` and `SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE` are "supervised
design-first" (`SPRINT-S`) rows that track work via a flat `subtasks: [id,...]` array instead of
nested `tasks[]` objects — and (§4) those subtask IDs were never minted as real board rows at all.
Consequence: the ONLY closeout trigger that exists (§3.1, PM's reactive QA-Done-coupled check)
requires a task inside `active_sprints[].tasks[]` to reach DONE. These two sprints have zero
tasks tracked in that array, so **no event in the system will ever cause PM to re-examine their
closeout eligibility** — not "closure is slow," closure is structurally unreachable for this
shape via the documented mechanism. They will stay `ACTIVE` indefinitely regardless of whether
CCATO-MCP-T1..T8 or the SYSREMAKE-P2 route work ever gets dispatched or finished.

---

## 6. Relationship to related board rows (per PO guardrail — checked, not skipped)

**`SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP` (READY, developer-owned) — NOT a duplicate.**
Its own scope is explicit: *"Do NOT fix instances 1 and 2; they have owners... output is the
inventory plus a per-gate severity call. Fixes are separate rows so each can be verified
independently."* Predicate (d) is a genuine 3rd instance of the taxonomy class that SPIKE would
catalog (a count-threshold gate whose input has a permanent floor at/above the threshold) — the
row `FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR`'s own `status_note` already flags
this explicitly. But the SPIKE is inventory-only by design; this decomposition
(`TASK_RUNIDLE-1..5`) is exactly the kind of separate fix row its scope defers to. No blocking
dependency either direction — safe to proceed independently. Recommend (non-blocking): when the
SPIKE is eventually run, it should cite this brief as its 3rd confirmed instance instead of
re-discovering it.

**`FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE` (REVIEW, po-owned,
plan_only) — related but distinct, not a duplicate.** That row is the **opposite direction**:
sprint IDs referenced by task rows / `sprint_goal.entries[]` that have **no** `active_sprints[]`
or `closed_sprints[]` object at all (currently 14 dangling ids, e.g.
`SYSTEMIC-REMAKE-P1`, `FU-ORCH-HOT-SUB150`). This brief's subject is the mirror problem: objects
that DO exist in `active_sprints[]` and never leave. Both are registry-integrity gaps in the same
general area but require different fixes; no overlap in scope, safe to land independently.

---

## 7. Recommendations for Task 2 (predicate redesign)

Do not redefine predicate (d) as a smarter array-length check alone — it needs to stop counting
work that cannot be dispatched this tick. Recommended direction (matches PO's own decomposition
hint (i) already on the parent row):

> Redefine (d) as **"active_sprints with at least one task actually dispatchable this tick"**
> (status in `{READY, TODO, BACKLOG}` at minimum — Task 2 should explicitly decide whether
> `BLOCKED` counts as dispatchable or not; VN-MACRO-TOOLING §4 is the concrete test case for that
> decision) rather than raw `length`.

This directly resolves both gaps without needing to also land the removal-mechanism fixes first:
- GAP-1 sprints with genuine live work (SSOT-INTEGRITY-PERIMETER's 1 TODO, etc.) correctly keep
  blocking idle; sprints that are fully terminal but not yet evicted (a real possible future
  state) correctly stop blocking.
- GAP-2's two childless sprints have zero dispatchable nested tasks today — they would
  immediately stop blocking idle under this redefinition, without requiring their deeper
  subtask-registration defect (§5.2) to be fixed first (that remains a separate, real defect for
  whoever owns SPRINT-S kickoff design — out of this line's scope, flagging only).

A new `dev-team-tick-preflight.test.sh` case should assert exactly the scenario PO already named:
*"active_sprints non-empty but every member stale/childless → still RUN-IDLE."*

## 8. Recommendations for Task 3 (staleness guard)

- Add a periodic sweep (not reactive) flagging `active_sprints[]` entries with age
  (`now - updated_at`, falling back to `opened_at` when `updated_at` is absent — 6 of 8 live rows
  need that fallback) `> 7 days` **and** zero dispatchable tasks, for PO/PM review (close or
  re-engage). Both currently-stale sprints (§4) qualify today.
- Fix the malformed `"2026-07-17T04:53:14ZZ"` timestamp as a small standalone data-hygiene item
  (or make the age computation defensively strip trailing non-digit characters before parsing) —
  otherwise the staleness guard itself will misbehave on the exact row it exists to catch.
- Consider whether a periodic sweep should also directly evaluate PM's §3.1 closeout condition
  (not just wait for a reactive QA-Done trigger) — GAP-2's root fix (making subtasks real,
  dispatchable board rows) is out of scope here, but a periodic sweep would at least surface these
  two sprints for human/PO attention instead of leaving them silently `ACTIVE` forever.

---

## Compliance note (PO guardrail 1)

This audit did not mint a new `active_sprints[]` entry, `sprint_goal.entries[]` entry, or any new
sprint-scoped board object for its own work — doing so would increment the exact counter this fix
line exists to unblock. This task's own bookkeeping is the pre-existing flat `backlog[]` row
`TASK_RUNIDLE-1-AUDIT` (minted by pm's decomposition), moved to `review[]` on completion per the
standard developer-flow lane transition — no sprint-container write of any kind.
