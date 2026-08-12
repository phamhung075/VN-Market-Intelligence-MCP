# cowork Step 5.3 Delivery-Proof Gate — Generalize Beyond Router-Latch Narration (plan_only)

**Task ID:** FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION
**Agent:** architect
**Date:** 2026-08-12
**Scope:** design/brief only (plan_only:true) — PM decomposes, developer + agent-father implement (split below).
**Prior art:** no earlier architect draft exists. The "2026-08-06T22:34:17Z stamp" referenced at
re-admission is PO's own decision-journal entry (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-5.md` STEP
po-S139) minting this row — read in full and incorporated below, not duplicated. This is the first
architect design pass.

---

## 0. SEQUENCING — READ FIRST, BINDING ON PM/DEVELOPER

Per PO's explicit instruction on this row and the escalation note on the sibling row, **this design must
not land in a shape that lets an unsound detector carry gate authority.** Concretely:

- The sibling `FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES` (P0,
  BACKLOG, developer) fixes `scripts/audits/detect-analysis-only-exit.sh`'s verdict logic (today: ALL of
  {notebook, commit, signal_queue} must read zero to DETECT — any one non-zero plane, even an unrelated
  one, PASSes a genuinely broken cycle). §2 below reuses that script for part of Arm 2. **The dev task
  that wires the script into Step 5.3 MUST carry `depends_on: ["FIX-ANALYSIS-ONLY-EXIT-DETECTOR-INVERSE-PARTIAL-MISSED-NOTEBOOK-WRITE-PASSES"]`
  and must not be dispatched before that row is DONE_VERIFIED.** Wiring today's script as-is would both
  (a) manufacture a false-green at gate authority (the exact risk PO named) and (b) spuriously BLOCK
  agents whose contract has no notebook at all (`refine_bctc_md` — see §2.2), since today's script
  hardcodes notebook/commit/signal_queue as always-mandatory with no per-agent subsetting knob.
- **Recommendation: ship Arm 2 in SHADOW MODE first** (compute + log + BUG-telegram the verdict, but do
  NOT exclude the slot from `WON_SLOTS`) for at least one full cadence cycle across all guaranteed slots,
  before flipping to enforcing mode. This is the standard mitigation for a fleet-wide gate validated on
  too small a sample (memory: `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`) and gives
  an empirical backstop independent of the sibling fix's own correctness proof.
- The two NEW native probe kinds this row adds (`published_marker`, `db_probe`, §2.3) do **not** depend on
  the sibling fix — they are new code, not a reuse of the flawed OR-verdict — and may be implemented/
  shadow-tested first if PM wants incremental delivery. The COMBINED, enforcing gate must wait on both.

---

## 1. Root cause (recap only — the row's own diagnosis is already correct and complete)

`spawn-fanout.md` Step 5.3 is the one exogenous, load-bearing observer in the system (its own comment,
lines 247-251: a spawn's self-report is a vacuous reader-is-writer check). Its predicate is a 6-string
positive match on ONE narration shape (`OFFFLOW_MARKERS`, the router-dispatch-protocol vocabulary). Two
RAW-verified 2026-08-06 misses (refine_bctc_md PARTIAL_EXIT, system-auditor "next actions for the LLM")
contained none of those 6 strings and passed clean. A third occurrence found later the same week
(occurrence 3, system-auditor c57) produced a **fully first-person confabulated completion report with no
marker at all** — proving marker-matching is not extensible into a durable fix; only a check that never
reads the spawn's own text can close the class. Occurrence 7 (2026-08-12, chef-morning) adds one more hard
constraint: the synthesis JSON landed while the notebook did not — a **single-artifact** proof (e.g.
"any file changed") would have falsely PASSed that cycle. The gate must be a **conjunction over every
artifact a slot's contract declares**, never a disjunction.

## 2. Design — Two-Arm gate in `spawn-fanout.md` Step 5.3

### 2.1 Arm 1 (cheap, advisory only — NOT load-bearing)

Extend `OFFFLOW_MARKERS` with the additional shapes actually observed this week: a `STATUS:` token not
in the slot agent's own RETURN enum (e.g. `PARTIAL_EXIT`), and the literal phrases `"next actions (for
the LLM"` / `"would require"` / `"would normally follow"`. Keep this arm purely as a **fast, cheap
early classifier** for telemetry/triage readability (it lets a human immediately see "router-latch" vs
"other narration" vs "artifact-delta failure" in the BUG telegram) — it must never be the sole reason a
slot is excluded from `WON_SLOTS`, and it must never be treated as proof of a PASS either (occurrence 3
proves absence-of-marker is not evidence of a real completion). Arm 2 alone decides the gate.

### 2.2 Arm 2 (load-bearing) — per-slot artifact-delta CONJUNCTION check

Runs unconditionally for every slot in the batch (regardless of Arm 1's verdict), immediately after Arm 1,
using the SAME window Arm 1 already has available: `since_ts` = this batch's dispatch time (Step 5.2),
`until_ts` = now (right after the inter-batch wait resolves) — bounded, not open-ended, per the
cross-cycle-aliasing lesson already on record in the sibling row's own evidence section.

For each slot, read its new `delivery_proof` declaration (schema in §3) from `cowork-schedule.json` and
evaluate **every** declared proof requirement; ALL must pass (conjunction, never OR):

- **Kinds that map 1:1 onto `detect-analysis-only-exit.sh`'s 5 native planes** (`notebook`, `commit`,
  `signal_queue`, `ledger`, `extra_file`): invoke the script once per slot with `--agent-id <slot.agent_id>
  --since-ts <since_ts> --until-ts <until_ts>` plus whichever of `--notebook-path` / `--dedup-ledger-file
  ""` / `--extra-artifact` the slot's declaration needs, **and the caller-supplied mandatory-plane subset
  the sibling fix's AC-1/AC-2 will add** (exact CLI knob name is that row's own implementation decision —
  this design only specifies the CONTRACT: Step 5.3 supplies the subset, the script never infers it from
  the artifact under test). `rc=1` (DETECTED) on any slot whose declared subset is non-empty → that slot
  fails Arm 2.
- **Two NEW kinds this row's own implementation must add** (the script has no equivalent today):
  - `published_marker` — probe `task_list_held(task_kind="cowork-slot")`, prefix-match
    `published:<slot_id>:` within the window, same read `TASK-COWORK-CATCHUP-6` (FR-7) already specifies
    for `last-fired.md`'s reconciler. **Reuse that exact read/logic, do not reimplement a second copy** —
    see §4 for how this composes with FR-7 without conflict.
  - `db_probe` — a caller-declared MCP tool name + before/after comparison (e.g. `refine_bctc_md` slots:
    `get_bctc_pending_refine`/`get_bctc_refined` row-count delta for the specific report the slot was
    working). This is why a purely file/git-based detector can never fully cover this row's own
    occurrence 1: `refine_bctc_md` has **no notebook file at all**
    (`docs/agent-memory/notebooks/refine_bctc_md.md` does not exist — confirmed by directory listing) and
    its only durable artifact is a DB write reachable through an MCP tool, not `git log`.
- **Do not hand-roll this inline** in the flow doc — `last-fired.md`'s own header already documents two
  separate silent-corruption incidents from ad-hoc inline schedule-mutation logic (a clobbering `jq`
  needle and a zsh word-splitting bug). Same lesson applies here: implement as a small script of record,
  `scripts/agents-flow/cowork-delivery-proof-probe.sh`, callable per-slot, returning a single verdict +
  which declared kind(s) failed.

**On Arm 2 FAIL** (once out of shadow mode): same treatment Step 5.3 already applies to a router-latch
hit — log, `send_telegram(channel="bug")`, add to `errors[]` with a new error code
`delivery_proof_gate_failed` (kept distinct from `offflow_router_latch_detected` so telemetry still shows
which arm caught it), and remove the slot from `WON_SLOTS` before it reaches Step 5b. Conservative
under-suppress (retries next due tick) — identical posture to the existing AC-P1-7-3/AC-P1-7-4 contract.

## 3. `cowork-schedule.json` schema addition — `delivery_proof`

Every slot gets an **explicit** declaration in the same commit that ships Arm 2 — allowlist-only, never a
silent opt-out default (memory: `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`). A slot
missing `delivery_proof` entirely must FAIL LOUD at Step 5.3 (refuse to gate it AND flag the schedule as
defective — mirror the existing `trigger_prompt`/`flow_path` mismatch refusal already in Step 5.2), never
silently fall back to "no gate applied." A slot with genuinely no viable proof artifact gets an explicit
opt-out with a reason, not an absent field:

```jsonc
// example: guaranteed Telegram-publishing slot (chef-morning)
"delivery_proof": [
  { "kind": "notebook" },
  { "kind": "published_marker" }
]

// example: refine_bctc_md — no notebook, DB-plane artifact only
"delivery_proof": [
  { "kind": "db_probe", "tool": "get_bctc_pending_refine", "compare": "pending_row_absent_or_row_updated" }
]

// example: a slot with no currently viable proof artifact — explicit, visible, reasoned
"delivery_proof": [
  { "opt_out": true, "reason": "<concrete reason, not a placeholder>" }
]
```

23 slots exist as of this writing (`jq '.slots | length' docs/data/cowork-schedule.json`) spanning 9 agent
families; PM/developer must produce a real declaration for each, not copy one shape onto all 23 — the
whole point of occurrence 7 is that a wrong single-plane guess (e.g. declaring only `notebook` for a slot
whose real contract also requires a signal row) reintroduces the disjunction bug this row exists to close.
Test coverage (`scripts/agents-flow/cowork-schedule-consistency.test.js`, already the static config-time
test for this file): extend with a check that every `enabled:true` slot has either a non-empty typed
`delivery_proof` array or an explicit `opt_out` entry — fail loud otherwise, same pattern as the existing
`trigger_prompt`/`flow_path` consistency test.

**Ownership note for PM:** `cowork-schedule.json`'s own `_maintained_by` field states this file is
"agent-father (via architect brief only)". Route the schema/data sub-task (the `delivery_proof` field
across all 23 slots) to **agent-father**, guided by this brief, per that existing stamp — do not route it
to developer by default just because the row's zone is `cross-service/`. `spawn-fanout.md` Step 5.3 logic
and `last-fired.md`'s one-line comment (§4) follow normal zone routing → developer.

## 4. `last-fired.md` — zero logic change, one comment generalization

No rewrite of Step 5b's write mechanism. `AC-P1-7-4`'s existing note already establishes the pattern this
design needs: *"a slot Step 5.3 flags as off-flow-router-latch-detected is already removed from
`WON_SLOTS` before this step runs."* Generalize that one sentence to cover either arm
(`off-flow-router-latch OR delivery-proof-gate-failed`) — Step 5b, whatever its write semantics are today
(unconditional post-spawn stamp) or become tomorrow (`TASK-COWORK-CATCHUP-6`/FR-7's reconciler), only ever
sees the already-filtered `WON_SLOTS`. This is the entire mechanism by which this design composes with
FR-7 without a write-authority conflict — see §5.

## 5. Reconciliation with the CATCHUP epic and the PO-consolidated rows — explicit ruling requested

**This is NOT a reopening of any PO-consolidated row.** Confirmed by id: the 4-5 rows PO's
`po_consolidation_ruling_20260728` protects (`FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY`,
`FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION`, `SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE`,
`FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE`) are all distinct ids from this row, and my own prior cycle's
notebook entry (2026-08-11T16:59Z, this same file) independently re-confirms that ruling's scope is
"reopening any of the 6 consolidated rows," not "touching any file under `docs/agents/cowork-team/flow/`."
This design operates **one layer upstream** of `last-fired.md`'s write mechanism — it gates entry into
`WON_SLOTS`, before Step 5b runs at all — rather than rewriting Step 5b's write semantics the way FR-7
(`TASK-COWORK-CATCHUP-6`, still BACKLOG, blocked on `TASK-COWORK-CATCHUP-3`) does. Recommendation: **PM
should NOT wait for the `BA-COWORK-GUARANTEED-SLOT-CATCHUP` epic to close before decomposing this row** —
it is functionally independent of the epic's own owned surface.

Functional overlap to flag for PO, not resolve here (architect does not own epic-scope trims): once Arm 2
covers the `published_marker` kind for every `guaranteed:true` slot, FR-7's problem statement (last_fired
bumped on dispatch-success, not delivery) is **prevented going forward** for those slots without any
change to Step 5b at all. FR-7 remains independently valuable for two things Arm 2 does not do: (a)
retroactive backfill/healing of `last_fired` values already wrong from before this gate existed, and (b)
covering the residual window Step 5.3 itself already documents as unguarded — a slot still in-flight after
a batch-wait timeout is carried to "the normal next-tick due-check," untouched by either arm this tick.
Recommend PO/PM jointly decide, once Arm 2 ships, whether `TASK-COWORK-CATCHUP-6`'s scope should narrow to
pure-backfill — but do not block dispatch of either row on that decision; they can land in either order
with zero code conflict (different steps, different write authority, per §4).

## 6. Cron-spawned coverage (item D) — explicitly OUT of this row's scope, relayed verbatim

`spawn-fanout.md` never runs for cron-spawned agents (`system-auditor` tiers foremost) — Step 5.3 cannot
be extended to cover them by construction; there is no spawn call to observe. Per the row's own
instruction, this finding is relayed to `FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED` (READY,
next_agent=pm): whatever exogenous observer that row designs must trigger on the **absence of an expected
cycle artifact for a schedule-derived DUE tick**, never on the presence of an orphaned marker — that row's
own already-written §3a stale-marker sweep (`docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md`)
is confirmed structurally blind to a spawn that died before `$MARKERS_FILE` was ever created (occurrence 2
of this row, RAW-verified: no marker file exists on disk for the 2026-08-06T09:52Z tick at all). The
typed, conjunction-based `delivery_proof` schema designed in §3 is directly reusable for a future
cron-schedule equivalent — noted for that row's own architect pass, not mandated here.

## 7. Files (for PM to route)

- `docs/agents/cowork-team/flow/spawn-fanout.md` — Step 5.3 two-arm rewrite (§2). **Zone:** `cross-service/`
  → developer.
- `docs/data/cowork-schedule.json` — `delivery_proof` field, all 23 slots (§3). **Route to agent-father**
  per its own `_maintained_by` stamp, guided by this brief.
- `docs/agents/cowork-team/flow/last-fired.md` — one-sentence AC-P1-7-4 generalization (§4). Zone:
  `cross-service/` → developer, same commit/task as the Step 5.3 change (they are one logical unit).
- NEW `scripts/agents-flow/cowork-delivery-proof-probe.sh` — Arm 2's per-slot script of record (§2.2),
  never hand-rolled inline in the flow doc.
- Extend `scripts/agents-flow/cowork-schedule-consistency.test.js` — `delivery_proof` presence/shape
  static check (§3).
- New regression fixture for `cowork-delivery-proof-probe.sh` against disposable scratch repos (never the
  live repo), mirroring `detect-analysis-only-exit.test.sh`'s own pattern: positive control (all declared
  planes real → PASS), RED-1 (one declared plane missing, others real → FAIL, guards the conjunction),
  opt-out control (declared `opt_out:true` → always PASS/skip, never gates).

## 8. DDD / zone / BUILD-STANDARD

Zone: `cross-service/` (agent flow docs + schedule config + one new script — no `apps/**` touch).
`BUILD-STANDARD: not-applicable` (bug-fix/gate-hardening on an existing agent, no new service/feature
primitive). `plan_only:true` preserved — PM decomposes into a developer task (Step 5.3 + last-fired.md
comment, `depends_on` the sibling detector fix per §0) and an agent-father task (`delivery_proof` schema
per §3), sequenced/shadow-moded per §0.

## 9. Explicitly out of scope / do not do (mirrors the row's own list — confirming compliance)

No new in-flow "confirm you made N tool calls" self-check (vacuous reader-is-writer, already rejected on
this row). No fleet-wide agent-father sweep of all `docs/agents/*/flow/main.md` files. No edits to
`.claude/agents/*.md`.
