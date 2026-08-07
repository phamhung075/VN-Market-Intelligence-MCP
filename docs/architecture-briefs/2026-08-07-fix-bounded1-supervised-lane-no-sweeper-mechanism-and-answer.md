# FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER — mechanism-and-answer (architect, 2026-08-07)

## 1. What this row still owed

The row's original diagnosis (2026-07-21) and its own fix (Supervised-Lane Sweep, SLS) shipped that
same day and has been running live for 2+ weeks. PO's `po_residual_measurement_20260728` re-opened
the row against a LIVE measurement of what SLS's own `AND` gate (`effective_supervised == true AND
effective_plan_only == true`) still leaves stranded, and posed two sub-questions without
pre-answering them. This brief answers both against **current** live data (2026-08-07), not the
2026-07-28 snapshot — a week of intervening shipped work (DRS, the PO manual-dispatch-sweep escape
hatch) already changed the shape of the residual.

## 2. Sub-question 2 (82-row non-dev-`next_agent` gap) — already substantially resolved, not re-solved here

PO's own numbers (48 `plan_only`-only + 32 `supervised`-only + 82 non-dev-`next_agent`-neither-flag
= 162 rows) predate two things that shipped in between:

- **Design-Router Sweep (DRS)**, `FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE`, shipped
  2026-07-30, PO-ratified. Auto-dispatches non-dev-`next_agent` rows (any flag combination except
  SLS's own `supervised && plan_only` BOTH-true territory) whose `next_agent` is on the ratified
  narrow allowlist `{architect, ba, pm, po, agents-architect}`.
- **PO Manual-Dispatch Sweep**, `FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH`, shipped
  2026-07-31. Mechanically (every PO tick, 1-per-tick, 4h bounded re-admission) surfaces the
  off-allowlist residual (`DRS-STRANDED-OFF-ALLOWLIST`) into PO's own `BATCH` — a human-gated
  mechanism, not manual hand-triage.
- The remaining off-allowlist concentration (agent-father-heavy) already has its own actively-owned
  tracking row, `FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION` (occurrence_count:2,
  PO re-measured 2026-08-06T18:57Z at 44 rows, 84% agent-father). Re-solving that here would violate
  prior-art discipline (`feedback_file_prior_art_check_before_minting_row`) — it is a distinct,
  already-tracked capacity question (1-row-per-tick pipe vs. mint rate), not this row's gate-design
  question.

Zone-routing's Step A2 (`docs/agents/po/flow/zone-routing.md`) already documents the mint-time
contract that would prevent this class from occurring at all (mint into `ready[]`, not `backlog[]`,
for a non-dev handler that must move) — a 1-line cross-reference was added there pointing at the
recovery net below, since no schema enforces that contract today and rows keep landing in `backlog[]`
anyway.

**Conclusion: nothing to ship for sub-question 2.** It is answered by pointing at what already
shipped, and the residual is someone else's already-open, correctly-scoped row.

## 3. Sub-question 1 (SLS `AND` vs `OR`, or flag-collapse) — this is the live gap, and the fix shipped

### 3.1 Verify PO's premise before trusting it (per this codebase's own standing discipline)

PO's question: "does SLS's second conjunct buy anything `BOUNDED-1` doesn't already exclude on its
own?" Read `is_bounded1_eligible` (`scripts/lib/devteam-eligibility.jq`) — `effective_supervised` and
`effective_plan_only` are two INDEPENDENT `AND`-clauses; either alone already excludes a row from
BOUNDED-1's unattended auto-pickup. **Confirmed: yes, the premise is correct** — a row carrying
exactly one flag is already excluded from unattended dispatch by BOUNDED-1 alone. SLS requiring BOTH
does not add safety BOUNDED-1 didn't already provide; it only narrows SLS's own destination set.

### 3.2 Why neither of PO's two proposed options is the right fix

- **SLS `AND` → `OR`:** rejected. The DRS ratification
  (`docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md` STEP po-4) already decided,
  for the immediately-adjacent predicate, that "auto-dispatching a `supervised:true` dev-role row to
  `developer` with zero PO/human gate would defeat the exact reason the `supervised` flag exists" and
  left that class explicitly PO-adjudicated, NOT folded into any auto-firing predicate. SLS's own
  dispatch is the SAME kind of zero-human-gate mechanical spawn (`Agent(...)` direct, bypassing
  zone-detect) — widening its gate to `OR` would silently re-open that already-ratified question
  through a different door.
- **Collapse `supervised`/`plan_only` into one field:** rejected. The two flags encode genuinely
  different things — `supervised` = "this dispatch needs deliberate/human-adjudicated routing";
  `plan_only` = "the work itself is planning/design, not code". BOUNDED-1, the Lane × Gate Coverage
  Matrix, DRS's own exclusion clause, and multiple live rows (e.g. `FIX-SPRINT-TASK-HEARTBEAT-LOCK`:
  `supervised:true, plan_only:false, next_agent:developer` — a real code fix needing supervision, not
  a plan) all key on the two flags independently. Collapsing would lose that distinction across a
  wide, already-shipped predicate surface for zero measured benefit — the actual defect isn't the
  two-flag shape, it's the missing destination for the lone-flag case (§3.3).

### 3.3 The actual gap, measured live, and its fix

Live census 2026-08-07 (`scripts/audits/bounded1-supervised-lane-report.sh`, SECONDARY section):
**83 `backlog[]`/`ready[]` rows carry exactly one of `supervised`/`plan_only`.** Of the `backlog[]`
subset, rows whose `next_agent` is non-dev + allowlisted are already DRS-eligible; non-dev +
off-allowlist are `DRS-STRANDED-OFF-ALLOWLIST` (already swept by the PO manual-dispatch mechanism).
**The genuinely uncovered residual: `backlog[]` rows with a dev-role or entirely absent `next_agent`
— 39 rows live**, reachable by NOTHING (not BOUNDED-1, not SLS, not DRS, not even the `ready[]`-only
`READY-XOR` class the manual-dispatch sweep already handles one lane over — nothing ever promotes a
lone-flag `backlog[]` row into `ready[]`).

**Fix shipped:** a new predicate, `is_backlog_xor_gap` (`scripts/lib/po-manual-dispatch-eligibility.jq`),
disjoint-by-construction from the existing `is_drs_stranded_off_allowlist` (dev-role-or-absent vs.
non-dev `next_agent`), folded into `docs/agents/po/flow/manual-dispatch-sweep.md` Step 1 as a THIRD
candidate class (`BACKLOG-XOR-GAP`) — same mechanism, same safety envelope, same 1-per-tick +
4h-bounded-re-admission discipline as the two classes that mechanism already sweeps. **This is not a
new gate and does not widen BOUNDED-1/SLS/DRS at all** — those three predicates are byte-unchanged.
It gives PO's existing human-gated sweep a destination for this specific class, satisfying both
constraints simultaneously: the "no unattended dispatch of a supervised dev-role row" policy stays
intact (a human still folds the row into `BATCH`), and the census gets a MECHANISM to drain it
instead of requiring anyone to notice a row by hand.

Lane × Gate Coverage Matrix (`docs/agents/dev-team/flow/main.md`) updated in place: the `backlog[]`
`F/T/F` and `T/F/F` rows (previously "RESIDUAL GAP, documented, out of scope for this task") now name
the mechanism. The `ready[]` `F/T/F`/`T/F/F` rows were ALSO found stale in the same pass — they still
read "out of scope" a full week after `READY-XOR-SUP-OR-PLANONLY` (shipped 2026-07-31) started
covering them — corrected to name the mechanism that already exists.

## 4. Verification (dry-run only, live board never touched)

- `scripts/audits/po-manual-dispatch-sweep-verify.sh`: 9 new fixture rows, positive+negative controls
  for the new predicate (dev-role hit, absent-`next_agent` hit, non-dev-allowlisted miss [would
  double-count into DRS], non-dev-off-allowlist miss [would double-count into
  `DRS-STRANDED-OFF-ALLOWLIST`], epic-wrapper miss, deps-unsatisfied miss, both-flags-true miss
  [SLS's own territory], no-flags miss [BOUNDED-1's own territory]) + one full Step-1-selection
  end-to-end replay. All green.
- `scripts/audits/bounded1-supervised-lane-report.sh`: new BACKLOG-XOR-GAP section, live count = 39,
  matches the manual `jq` census exactly. PRIMARY/SECONDARY/DRS/READY-XOR sections unaffected
  (byte-diffed before/after — no row moved between existing sections).
- End-to-end dry run against a scratch copy of the live board (`cp` + `ORCH_APPLY_LIVE_FILE_OVERRIDE`,
  never the live file): replayed Step 1's selection for a real live candidate
  (`TASK-COWORK-MUTEX-001`), applied Step 2's additive stamp write through `scripts/orch-apply.sh`
  unmodified — Zod + dup-key validation PASS, conservation check PASS (`task_total`/`signal_total`
  unchanged), `updated_at` stamped on exactly the one touched row, lane row-counts (`backlog`/`ready`/
  `in_progress`) identical before/after (confirms additive-only, no lane-move), `supervised`/
  `plan_only`/`status` unchanged on the stamped row. Live file hash confirmed unchanged before and
  after. Never run against the live board — that is PO's own next tick, same discipline the original
  SLS ship used.

## 5. New finding, flagged not fixed (separate from both sub-questions)

`bounded1-supervised-lane-report.sh`'s PRIMARY gate (the row's OWN original AC: every
`supervised && plan_only` row must have a resolved dispatch lane) currently **FAILS**: 4 backlog rows
(`FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-TO-PEER-FULLDOC-WRITE`,
`FIX-PUSH-DELIVERY-ERROR-RATE-ALERT`, `FIX-RAG-COMPACTION-DISK-AMPLIFICATION`,
`FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE`) were minted (2026-07-29) with BOTH `owner` and
`next_agent` null — SLS's own `resolved_dispatch_lane` would fall back to the generic `"developer"`
placeholder for these if SLS ever reached them, which is a real destination but not a deliberately
assigned one. This is a mint-time hygiene gap (same family as the Step A2 discipline note in §2), not
a gate-design defect, and is orthogonal to both sub-questions this row was scoped to answer — surfaced
here (and visible every time the acceptance instrument runs, since it is the reason the instrument
currently exits 1) rather than silently fixed by guessing an owner for 4 rows whose actual owner is
unknown. Recommend a follow-up row if PO wants it addressed; not minted unilaterally here (plan-only
architect authority does not extend to inventing an owner for unowned work).

## 6. Acceptance evidence going forward

The census PO asked to see reach 0 via mechanism: `scripts/audits/bounded1-supervised-lane-report.sh`
BACKLOG-XOR-GAP section, currently 39. It drains at the same bounded rate the mechanism's other two
classes already drain at (1 candidate/tick, subject to PO's own cadence) — no row was hand-moved to
produce this number, and none will be hand-moved to reduce it; the mechanism (`manual-dispatch-sweep.md`
Step 1/2/3, unchanged in its own write logic) is what drains it.
