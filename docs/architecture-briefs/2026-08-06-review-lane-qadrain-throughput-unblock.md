Architecture Brief — Review-Lane QA-Drain: Unblocking the Throughput Fix (Parts 2+3)

Date: 2026-08-06T09:1xZ
Task: FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN (P1, supervised, owner architect, age 25d — 3rd
manual-dispatch pick, first actual dispatch)
Mode: DESIGN — board-metadata edits only (depends_on/status/AC refinement on the 2
existing implementation rows); zero production code changed here (developer/agent-father's
job).
Author: architect

---

## 0. Do not re-derive — prior art read first, live-reverified, not trusted at face value

Two prior briefs already fully diagnosed and mostly designed this problem:

- `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` (agents-architect) —
  split the remedy into 3 parts: Part 1 (head-write-conditional, `FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL`),
  Part 2 (head-decoupled invocation site, `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED`),
  Part 3 (throughput cap, `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`).
- `docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md`
  (architect) — supplied Part 3's full implementation-ready design (§1: `QA_CAP=10` named
  constant, batch-claim N-oldest, BGFAN-1 fan-out spawn) and designed+shipped SECONDARY-Drain
  (§2, live since 2026-08-01, unrelated new mechanism for non-qa `next_agent` review rows).

**Live re-verification this tick** (2026-08-06T09:0xZ, `scripts/audits/devteam-review-lane-drain-report.sh 3`):
`review[]` = 269 total, PRIMARY (`status==REVIEW && next_agent=='qa'`) = 226, SECONDARY = 40,
`qa[]` = 1, `backlog[]` = 361, `ready[]` = 60, `in_progress[]` = 1. Growth since the 08-01
baseline (198 PRIMARY): +28 in 5 days ≈ 5.6/day net — slower than the 07-28→08-01 34/day spike
(SECONDARY-Drain likely absorbed some of that growth by routing non-qa rows out of the same
raw inflow), but still net GROWING, never draining. Age histogram of the 266 live `REVIEW`
rows: 26 at 0d, 4 at 1d, 44 at 5d, 42 at 6d, 37 at 7d, 25 at 8d, 37 at 12d, 38 at 13d, 4 at 14d
— i.e. two large clumps (12-14d and 5-8d) with almost no drain activity visible between them.
27 live rows carry `priority:"P0"`.

**Board status of the 3 parts, checked directly (not narrated):**

| Row | Scope | Status found live |
|---|---|---|
| `FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL` (Part 1) | conditional `.head` write in the claim script | **DONE_VERIFIED** (`qa_verified_at: 2026-08-01T01:06:46Z`) — confirmed via `git show --stat` on `commit:9fe706fa2`, still on `main` ancestry |
| `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED` (Part 2) | new head-decoupled invocation site, Session-Gate→Step-1 anchor | **BACKLOG**, `depends: [Part 1 (satisfied), FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION]` — never dispatched |
| `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` (Part 3) | `QA_CAP=10` batch-claim design (already written, 08-01 brief §1) | **BACKLOG**, no depends, `next_agent:"developer"` — design-complete, never dispatched |

Confirmed by direct grep of `docs/agents/dev-team/flow/main.md`: the live § Review-Lane
QA-Drain block is still the ORIGINAL single-claim (`qa[]<1`), still positioned AFTER
BOUNDED-1→SLS→RLC→DRS in the head-idle-only fall-through, still BEFORE the Session Gate. No
head-decoupled section exists anywhere in the file (only SECONDARY-Drain occupies the
Session-Gate→Step-1 anchor today). **Neither Part 2 nor Part 3 has shipped.** This is the
actual, current defect — not a re-diagnosis, a confirmation that 5 days of prior planning sat
un-actioned for the same "narrated pick, never dispatched" reason this row's own
`po_manual_dispatch_note` names.

---

## 1. Three NEW findings this cycle adds (none present in the two prior briefs)

### 1a. Part 2's own dependency chain is circularly deadlocked by the exact defect it fixes

`FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED.depends` names
`FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`, which itself `depends_on`
`TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES`. Live-checked: `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES`
sits in `.task_board.review[]`, `status:"REVIEW"`, `next_agent:"qa"`, `updated_at:2026-07-29T06:12:51Z`
— **8 days stale, itself one of the 226 PRIMARY rows this very fix exists to drain.** Part 2
cannot ship until its transitive dependency clears the review lane, and the review lane cannot
clear until Part 2 ships. This is a real circular deadlock, not a metaphorical one.

The 07-29 brief's own §4c already flagged this dependency as "a coordination safeguard, not a
strict technical necessity" (added only to avoid a byte-range collision with a wholesale
`main.md` §496-686 rewrite that `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` was going to
perform). Two independent facts now make that safeguard obsolete rather than merely
optional: (1) `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` itself hasn't started — it is still
`BACKLOG` 8 days later, so there is no concurrent rewrite in flight to protect against; (2)
`FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN` already shipped an unrelated section at the
IDENTICAL Session-Gate→Step-1 anchor point on 2026-08-01 with zero coordination against that
same rotation task and zero incident since — empirical proof the anchor point is stable
without the dependency.

**Decision: drop `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` from Part 2's `depends`.** Keep
the Part-1 reference (already `DONE_VERIFIED`, harmless, preserves the audit trail).

### 1b. Part 2's own illustrative code (07-29 brief §4b) is now stale relative to Part 3's design

Part 3's 08-01 design (brief §1a) rewrites the EXISTING (idle-tick) QA-Drain claim call to
batch-claim up to `QA_CAP=10` rows and fan out `N` `qa` spawns. Part 2's 07-29 illustrative
code for the NEW (busy-tick) invocation site was drafted before Part 3 existed and still shows
the OLD single-claim (`qa[]<1`) shape. Implementing Part 2 verbatim as illustrated would ship
TWO invocation sites with different batching behavior — 10-wide on idle ticks, 1-wide on busy
ticks — for no reason connected to any actual constraint. **Decision: Part 2's new section
must reuse the SAME `QA_CAP`/`TAKE_BUDGET`/batch-claim/BGFAN-1-fan-out shape Part 3 designs,
not the older single-claim illustration.** Because both edits land in the same file
(`docs/agents/dev-team/flow/main.md`) under the same owner (agent-father, see §1c), this is
naturally achieved by implementing them as one coordinated pair of edits, not two
independently-drafted ones.

### 1c. Part 3, as currently scoped, is a mixed-zone task assigned to a single non-owning agent

Per the standing PO artifact-class ruling (`po_routing_ruling_20260721`, cited on
`TE-T08`/`UC-ASL-P6` and multiple other rows): any row whose deliverable is agent-instruction
prose under `docs/agents/**` (init/flow/knowledge/tools-package) routes to **agent-father**,
never to `developer` — `agent-father`'s own `commit_zone.allowed` is
`["docs/agents/", "docs/agent-memory/", ".claude/skills/", ".claude/agents/"]`
(`docs/agents/agent-father/init.md:62-63`); `developer` carries no such grant and its own
`init.md` frames its job as zone-dispatch + code outside `dev-*` zones, never flow-doc
authorship. `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP.files` currently lists BOTH
`scripts/devteam-review-claim-qa-drain.jq` (developer's zone — plain executable script) AND
`docs/agents/dev-team/flow/main.md` (agent-father's zone), assigned solely to
`next_agent:"developer"`. Dispatched as-is, this either (a) has `developer` incorrectly write
a flow-doc edit outside its own commit zone, or (b) `developer` ships only the `.jq` half and
the `main.md` wiring silently never lands — a half-shipped state where the new
`--argjson take_budget` parameter exists but nothing ever calls it, and the batch cap stays
`<1` in production regardless of the script's own capability.

**Decision: split Part 3.** `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` narrows to the `.jq`-only
half (developer, unchanged owner) with a backward-compatible default
(`($take_budget // 1)` inside the script) so it is safe to ship standalone before the
`main.md` wiring lands. The `main.md` wiring half (the `QA_CAP=10`/`TAKE_BUDGET` rewrite of
the EXISTING § Review-Lane QA-Drain block) is folded into `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED`
(agent-father, already the correct zone owner, already touching the same file at a nearby
anchor for the NEW section) — this is the same coordinated pair described in §1b, now also
zone-correct.

---

## 2. Fourth finding: pure age-ordering starves same-day P0 rows behind a 13-14 day P2/P3 wall

PO's dispatch framing explicitly asked whether "age-based prioritization improvements beyond
the existing oldest-first ordering" are needed. Answer: **yes, live-demonstrated, not
theoretical.** `scripts/devteam-review-claim-qa-drain.jq`'s selection is `sort_by(.age)` with
NO priority term at all — the one lane in the entire idle-fallthrough chain that ignores
`priority_rank` (BOUNDED-1/RLC/DRS all use `priority_rank, FIFO` — `scripts/lib/devteam-eligibility.jq:121-128`
already defines it, already `include`-d by every sibling promote/claim script). Live query of
the 27 P0 rows in `review[]`, sorted by age: **7 entered `review[]` TODAY (age=0d)** —
`CCATO-MCP-T2-CLAIM-MAP-LOADER`, `CCATO-MCP-T4-SIGNAL-WRITER`,
`FIX-BCTC-FULL-SERVING-EMPTY-NEWEST-PERIOD-HEAD-OF-LINE`,
`FIX-CI-SIZELINT-BCTC-1345B-PARSE-VALIDATOR-PAIR`,
`FIX-CI-TASKCLAIM-PO-FLOW-OWNER-SESSION-PAYDOWN`,
`FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL`,
`FIX-OPS-DEPLOY-SELFREPORT-FABRICATED-FUTURE-TIMESTAMP-NONEXISTENT-IMAGE`,
`FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR` — while `FIX-DRAIN-TEST-HARNESS-ORCH-HELPER-COPY-LIST`
(also P0) sits at 14d. Under pure age-order, all 7 of today's P0s queue BEHIND the ~226-row
FIFO wall (oldest 14d) before ever reaching the front — a fresh, urgent fix waits days for QA
sign-off purely because hundreds of `FACTORY-*` mechanical-cleanup rows (verified: the
oldest-end of the queue is dominated by P2/P3 `FACTORY-*` renames/dead-code-deletes) happened
to arrive earlier.

**Decision: change the claim script's candidate sort from `sort_by(.age)` to
`sort_by([priority_rank, .age])`**, reusing the existing shared def (no new priority
vocabulary, no new file) — same convention as RLC/DRS/BOUNDED-1, applied to the one lane that
was still an outlier. Batching (§1b/`QA_CAP=10`) keeps this cheap: within one 10-wide batch, a
same-day P0 no longer waits behind a 13-day-old P3 unless P0/P1 volume alone already exceeds
the cap on a given tick (a legitimate saturation state, not a starvation bug). Folded into
Part 3's (`.jq`-only) scope alongside the `take_budget` batching change — one script edit, two
AC items, not a second row.

---

## 3. Unified action plan (final, ready-to-dispatch)

**`FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` (developer, `scripts/devteam-review-claim-qa-drain.jq`
+ `scripts/lib/devteam-eligibility.jq` only):**
1. Accept `--argjson take_budget <int>` (default `// 1` if the caller omits it — backward-safe
   for any future/other caller).
2. Change candidate sort from `sort_by(.age)` to `sort_by([priority_rank, .age])` (import
   `priority_rank` from the already-`include`-d `devteam-eligibility.jq`; no new predicate
   file).
3. Take `$candidates[0:$take]` where `$take = [$take_budget, ($candidates|length)] | min`;
   append the whole batch to `.task_board.qa` with identical `claimed_at`/`claimed_by` stamps
   (batch-correlation idiom, per 08-01 brief §1a); remove all their indices from
   `.task_board.review` in the same filter pass. `.head` write unchanged shape (still
   conditional per Part 1, still narrates only the batch's oldest/highest-priority row,
   cosmetic only).
4. Extend `scripts/audits/devteam-dispatch-gate-satisfiability.sh`'s existing QA-Drain fixture
   with a priority-ordering positive control (seed a same-day P0 behind an older P2/P3, assert
   it is claimed first within the same batch).

**`FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED` (agent-father,
`docs/agents/dev-team/flow/main.md` only — absorbs former Part 3's `main.md` half):**
1. Drop `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` from `depends` (§1a) — keep the
   `DONE_VERIFIED` Part-1 reference only. Do NOT re-introduce a `depends_on` on that row;
   restate in this brief that the byte-range-collision concern the original dependency
   protected against is empirically closed (§1a).
2. Rewrite the EXISTING § Review-Lane QA-Drain block (idle-tick site) to the `QA_CAP=10` /
   `TAKE_BUDGET` batch shape (08-01 brief §1a verbatim).
3. Insert the NEW head-decoupled section at the Session-Gate→Step-1 anchor (07-29 brief
   §4a/§4b placement — zero byte overlap with `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`,
   independently reconfirmed live this cycle: that row is still untouched `BACKLOG`), using
   the SAME `QA_CAP`/`TAKE_BUDGET`/batch shape as step 2 (§1b) — never the stale single-claim
   illustration from the 07-29 brief.
4. Both sites correlate their spawned batch via `claimed_at`/`claimed_by` (07-29 brief §3's
   idiom, already proven, never via `.head.next_action`).
5. Regression coverage per 07-29 brief §6 (negative control: busy `.head` byte-identical;
   positive control: idle `.head` written) — both already apply unchanged to the batch shape.

**Sequencing:** no strict ordering between the two rows is required (the `.jq` script's
`take_budget // 1` default keeps it safely callable by the OLD `main.md` invocation while
agent-father's edit is still in flight) but shipping them in the same window is strongly
recommended — the `.jq` batch/priority logic has no observable effect in production until
`main.md` actually calls it with `QA_CAP=10`.

**Why not fold everything into one row:** zones differ (developer vs agent-father — an
Zone-Detect/BOUNDED-1 constraint, not a preference) and `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`
was already `DONE`-adjacent in design (08-01 brief) — reusing the existing 2-row split (with
the scope correction in §1c) avoids re-minting board history for no reason.

---

## 4. `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`'s own status (this row)

Genuinely `BLOCKED`, not merely unpicked: the sole remaining action IS the two rows above
shipping. Machine-readable `depends_on` set to both (per
`FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE`'s standing rule — prose-only sequencing
notes get blind-promoted). DoD unchanged from `po_triage_20260728`: `review[]` PRIMARY count
must trend DOWN (not just non-increasing) across 5 consecutive dev-team ticks post-deploy,
drained row ids named, via `scripts/audits/devteam-review-lane-drain-report.sh` — re-verify
once both children are `DONE_VERIFIED`.

## 5. Dedup check

Not a duplicate of either prior brief — this brief supersedes neither, it unblocks both by
(a) removing a since-proven-obsolete dependency, (b) reconciling a shape drift between two
designs written 3 days apart by different sessions, (c) correcting a zone-routing error that
would have caused a silent partial-ship, and (d) adding a priority-ordering requirement
neither prior brief evaluated. Grepped `docs/architecture-briefs/` for
`QADRAIN|THROUGHPUT|priority_rank.*review` — no other row/brief covers the circular-dependency
or zone-split findings.
