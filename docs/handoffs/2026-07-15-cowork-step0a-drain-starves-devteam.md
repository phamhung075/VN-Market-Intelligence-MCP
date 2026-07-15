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

## SECOND SYMPTOM — the same defect also deadlocks the SILENT gate (added 2026-07-15T20:35Z, tick 20:30Z)

The receiver set is **duplicated in a third place**, and that copy gates the dispatcher's
silent-exit:

`scripts/agents-flow/cowork-tick-preflight.sh:245`

```bash
signal_count=$(jq '[.signal_queue.rows[]? | select(.status=="NEW" and (.to as $t |
  ["po","tran-ngoc-bau","unified-agent","alert-commander"] | index($t) != null))] | length' "$ORCH_STATE_PATH")
```

Identical list to `main.md:104`, `po` included. It feeds the Step 7 SILENT gate
(`slots empty AND one_shots empty AND signal_queue NEW == 0`).

**The coupling:** a `to: po` row makes `signal_count > 0` ⇒ verdict `WORK` ⇒ a full LLM dispatcher
pass, every 15 min, for as long as the row stays NEW. The dispatcher then finds nothing it may act
on (it cannot spawn `po` — `main.md:12`). The dispatcher **cannot clear the condition itself**
without marking the row READ — precisely the action that starves dev-team. It must wait for the
peer team's drain.

<!-- CORRECTION 2026-07-15T20:41Z (same tick, before commit): an earlier draft of this section
     called this a "deadlock" and said the loop runs "forever" / that the two requirements are
     "mutually exclusive by construction". That was an overclaim, and it is refuted by the
     evidence below — po's drain also marks the rows READ, which clears the gate. The condition is
     BOUNDED by the peer team's drain cadence, not permanent. Corrected rather than deleted so the
     reasoning error stays visible. -->

**Bound:** cleared by dev-team/po's drain (hourly, :07). Observed this batch: rows filed 20:11Z and
20:17Z were READ by 20:39Z (~22–28 min). Worst case ≈ 4 wasted dispatcher passes per escalation
batch. Real waste, but self-limiting — **not** a deadlock.

**Evidence — this tick (20:30Z), first pure-waste instance:**

```json
{"verdict":"WORK","tick":"2026-07-15T20:30Z","drift_min":3,
 "slots":[],"one_shots":[],"new_signals":3,
 "detail":"election lock held — continue at main.md Step 4.2 …"}
```

`slots: []`, `one_shots: []` — the **only** reason this tick was not SILENT is the 3 NEW `to: po`
rows this dispatcher itself filed and correctly declined to drain. Ticks 20:00Z and 20:15Z were
also WORK but had genuine slot work, so they cost nothing extra; 20:30Z is the first tick whose
entire cost is this bug. Every subsequent tick is pure waste until dev-team's :07 drain clears them
(~4 wasted passes/hour while any `to: po` row is open).

Note the perverse incentive: the cheapest way to silence the dispatcher is to suppress the
findings. That tradeoff must not be taken — but it is the one the current design offers.

## OUTCOME — the refusal is now PROVEN correct, not merely argued (added 2026-07-15T20:41Z)

The near-miss above is no longer hypothetical in either direction. All three `to: po` rows this
dispatcher left NEW were **drained and triaged by po**, exactly as `main.md:14` designs:

```
4ff41cb0c chore(po/triage): triage 3 cowork to:po signals — dedup 1->RESOLVED, mint 2 PLAN-ONLY backlog rows
```

| Row | Status now | po's disposition |
|---|---|---|
| `cow-20260715T195340` | **RESOLVED** | deduped against existing coverage |
| `cow-20260715T201118` (this bug) | **READ** | minted a PLAN-ONLY backlog row |
| `cow-20260715T201730` (alert-commander boundary) | **READ** | minted a PLAN-ONLY backlog row |

Plus the earlier `cow-20260715T195545` → CRITICAL, drove `UC-CCA-P3` P0 (`c43fdf76a`).

**This closes the argument.** Had Step 0a been obeyed at 20:05Z, every one of these rows would have
been READ before po ever looked, invisible to its NEW filter, and cold-evicted at 24h — including
the CRITICAL double-publish escalation. Four findings, zero triaged. Instead: 1 deduped, 2 minted,
1 escalated to P0.

It also settles the **safety of the proposed fix**: removing `po` from the receiver set costs
nothing, because po's own drain demonstrably collects these rows unaided. Step 0a's claim on them
was never load-bearing — it was purely destructive.

Corollary for the § SECOND SYMPTOM bound: po's drain is what clears the SILENT gate, which is why
the WORK loop is self-limiting rather than permanent.

## Suggested next step (po / dev-team triage)

Decide the single owner of `to: po` rows, then make **all three** copies agree. Cheapest option:

- Remove `po` from the receiver set in **both** sites — `main.md:104` (Step 0a) **and**
  `cowork-tick-preflight.sh:245` (SILENT gate) — leaving {tran-ngoc-bau, unified-agent,
  alert-commander}, the three the dispatcher can actually spawn. Fixing only `main.md` leaves the
  15-min WORK loop burning; fixing only the script re-arms the starvation. State explicitly:
  *"`to: po` rows are cross-team — leave status NEW; dev-team's :07 drain owns them. NEVER mark
  a `to: po` row READ from this dispatcher, and never count one toward the SILENT gate."*
- The list is hardcoded in ≥2 places and drifted into a third meaning (spawn-boundary vs
  silent-gate). It should be one SSOT entry (`docs/data/system-map.json` per CLAUDE.md § System
  Data — Never Hardcode), read by both sites. This is the `code-janitor` hardcode-duplication
  class, and it is *why* the bug has two faces.

Same-pass check: any other flow that drains a receiver set it cannot act on has this bug shape.
Grep for receiver lists that include agents outside the draining flow's spawn boundary.
