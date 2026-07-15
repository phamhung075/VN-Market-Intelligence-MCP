# cowork Step 0a drain marks `to:po` rows READ — starves dev-team's NEW-filtered drain

**Detected:** 2026-07-15T20:05Z by cowork-team dispatcher (tick 20:00Z), as a **near-miss** — the
instruction was read, recognized as unsafe, and NOT executed this tick.
**Status:** PLAN-ONLY — no fix attempted. Router/dispatcher does not implement.
**Severity: MED** — latent trap; destroys cross-team escalations when followed literally.

## The contradiction

Two flows both claim `to: po` rows, with incompatible status semantics:

| Flow | Line | Behavior |
|---|---|---|
| `docs/agents/cowork-team/flow/main.md` | 104–106 | "Find all cowork-addressed rows (`to` ∈ {**po**, tran-ngoc-bau, unified-agent, alert-commander}). Collect `status=NEW` rows → … route to matching agent slot at Step 5 **or log for PO**. **Mark each processed row `NEW → READ`**" |
| `docs/agents/dev-team/flow/drain-signals.md` | 22 | "Find rows where `to` matches `po` or any dev-team-addressed agent. **Collect `status=NEW` rows.**" |

Whichever runs first wins. cowork fires every 15 min; dev-team drains hourly at :07. **cowork
almost always wins the race.** A `to: po` row marked READ by cowork is invisible to dev-team's
NEW filter, sits at READ, and is cold-evicted after 24h by the mandatory PRUNE
(`signal-dashboard/SKILL.md` § PRUNE: status ∈ READ/RESOLVED/SUPERSEDED AND ts > 24h).

Net effect: **the cowork→dev-team escalation bridge is a no-op by construction**, for exactly the
rows cowork is told to write. `main.md:14` states the intended design — *"Cross-team work: write a
signal row … Dev-team drains the signal_queue at its next cycle."*

## Why cowork must not consume `to: po` rows at all

`main.md:12` — "NEVER spawn dev-team agents (po, ba, architect, pm, developer, qa, fixer, dev-*,
ops) from this dispatcher." The dispatcher **cannot act** on a po-addressed row. Step 0a's own
text concedes this with the "or log for PO" branch. Marking it READ therefore claims consumption
the dispatcher never performed — a false-ACK.

`po` appears in the `signal-dashboard` Receivers table (`po` ← tran-ngoc-bau, agents-architect,
system-auditor), which is presumably why it got copied into Step 0a's receiver set. But that table
describes who *receives*, not who *drains on po's behalf*.

## Evidence — near-miss this tick

At tick 20:00Z the drain found 2 NEW rows, both `to: po`, both filed by this dispatcher last tick:

- `cow-20260715T195340` (MED) — cycle-snapshot promotion dark
- `cow-20260715T195545` (**HIGH**) — CONFIRMED MARKET double-publish, ids 932+933

Following Step 0a literally would have marked both READ at 20:05Z. Instead they were left NEW.
**Verified consequence of leaving them NEW:** at 20:09Z `task_list_held({})` showed peer router
session `34a375e3` holding `intent:po:chef-marker-release-double-publish-confirmed` — i.e. the HIGH
row was picked up and po dispatched **because it was still NEW**. Had Step 0a been obeyed, that
dispatch would not have happened.

## Plausible historical loss (UNVERIFIED — do not treat as diagnosed)

`cowork-chefmarker-leak-2026-07-03T06:31:50Z` (`from: cowork-team/chef-verify`, `to: po`,
"chef.md leaks published:chef-intraday marker on silent exit") is at status `READ` in
`docs/data/orch/archive/2026-07.json` with **no `origin_signal_id` back-reference on any board
row**, hot or cold. Its `to: po` + cowork origin fit this bug's fingerprint exactly.

**Counter-evidence that must be checked before concluding:** (a) po's own drain also marks
`NEW → READ` (`drain-signals.md:51`), so READ is equally consistent with a legitimate po ACK;
(b) `FU-CHEF-MARKER-INFLOW` and `UC-CCA-P3` cover the marker-gate topic and may have absorbed it
without the optional back-reference (`triage-signals.md` explicitly permits omitting
`origin_signal_id`). Two sibling rows from 07-10 (`cowork-recurring-guaranteed-miss-*`) went READ
and **did** produce board rows — proving READ-without-loss is the common case.

So: fingerprint matches, but **not proven**. Worth checking, because if it IS this bug, the marker
defect it reported went untriaged for 12 days and is the same subsystem that double-published today.

## Suggested next step (po / dev-team triage)

Decide the single owner of `to: po` rows, then make the two flows agree. Cheapest option:

- Remove `po` from `main.md` Step 0a's receiver set (leave {tran-ngoc-bau, unified-agent,
  alert-commander} — the three the dispatcher can actually spawn), and state explicitly:
  *"`to: po` rows are cross-team — leave status NEW; dev-team's :07 drain owns them. NEVER mark
  a `to: po` row READ from this dispatcher."*

Same-pass check: any other flow that drains a receiver set it cannot act on has this bug shape.
Grep for receiver lists that include agents outside the draining flow's spawn boundary.
