# cowork tick 21:30Z executed TWICE — the P3 fire-election lock does not span the tick it guards

**Detected:** 2026-07-15T21:35Z by the cowork-team dispatcher, on itself, mid-tick.
**Status:** PLAN-ONLY. **Zero harm this instance** — the re-fired tick had no slots to re-spawn.
**Severity: MED** — confirmed re-execution; blast radius on a slot-bearing tick is *inferred, not
observed* (see § 4). Do not read this as "the dispatcher double-spawns agents." It did not, today.

## 1. What is CONFIRMED

Nominal tick `2026-07-15T21:30Z` ran to completion, then ran again ~5 min later.

| | pass 1 | pass 2 |
|---|---|---|
| preflight verdict | `WORK`, `drift_min: 0` | `WORK`, **`drift_min: 5`** |
| nominal tick | `2026-07-15T21:30Z` | **`2026-07-15T21:30Z`** (same) |
| `emit_pressure_state` | `21:31:51.555Z` | `21:37:29.484Z` |
| `tick_id` written | `2026-07-15T21:30:00Z` | **`2026-07-15T21:30:00Z`** (same) |
| P3 `task_release` | `{"ok":true,"released":1}` | **`{"ok":true,"released":1}`** |

**`released: 1` twice on the same key is the proof.** A release only reports `released: 1` if the
lock was actually held. So `cron:cowork:2026-07-15T21:30Z` was claimed → released → **re-claimed →
re-released**, for one nominal tick, by one session.

The election did not merely fail to dedup — it **affirmatively re-elected** a leader for a tick that
was already over.

## 2. Root cause — the guard is released when the work ends, so a re-entry redoes the work

`telemetry.md:79-93` releases `cron:cowork:<TICK>` at the end of Step 6, on every exit path. That is
correct *as a leader-lock* (it must not outlive the tick). But it means the lock's lifetime is
`[start of tick, end of tick]`, and a **re-fire of the same tick arrives after that window** — so it
finds the key free and wins.

There is no other per-tick guard. The dispatcher has **no re-fire suppression at all**.

`telemetry.md:92` is the tell — the flow already knows re-entry happens:

> `# ok=false acceptable: TTL=600s expired (long tick) or already released (re-entrant restart).`

It anticipates re-entrancy **only** as a reason the *release* might no-op. It never considers that a
re-entrant restart **re-acquires and re-executes**. The comment documents the symptom's cousin while
missing the symptom.

## 3. This is the THIRD guard in this dispatcher released before its work completes

Same one-line invariant violated three ways — *the guard that must span the work is dropped when the
work ends*:

| # | Guard | Released at | Consequence | Tracked |
|---|---|---|---|---|
| 1 | `published:<slot>:<key>` (chef marker) | post-publish | peer re-publishes → **MARKET dup 932+933** | `UC-CCA-P3` **P0** |
| 2 | `cowork-slot:<slot_id>` | right after spawn | does not span the agent's run | `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` P1 |
| 3 | **`cron:cowork:<TICK>`** | Step 6 (end of tick) | **same-tick re-fire re-elects and re-runs** | **nothing — this doc** |

Per `feedback_recurring_bug_escalation` (2+ → block), the *class* already qualified. This is the
third member, and the first one caught firing live rather than reconstructed after damage.

## 4. Blast radius — INFERRED, not observed. Read this carefully.

This instance was harmless: `slots: []`, `one_shots: []`. Nothing was re-spawned because there was
nothing to re-spawn. **That is luck of the timetable, not a working guard.**

What *would* happen on a slot-bearing tick is **not proven** and was not probed this tick. It rests
on two memory-backed but unverified-today premises:

- `feedback_cowork_matcher_legacy_no_lastfired_dedup` — in **legacy** mode the matcher does pure
  cron-match with **no `last_fired` dedup**. If true, a re-fire re-matches the same slots.
- `cowork-slot:<slot_id>` tokens are released right after spawn (guard #2 above), so they would not
  block a re-spawn either.

**If both hold**, a re-fire on a slot-bearing tick re-spawns every agent in it. **Neither was
re-verified today — someone must probe before acting on that claim.** Cheapest check: force a
re-fire on a tick with a slot in a sandbox, or read the matcher's legacy branch for a `last_fired`
comparison.

Note the interaction that makes this worse than it looks: **guard #3 fails exactly when ticks run
long** (long tick → busy REPL → deferred/duplicate delivery), and **long ticks are also what pushes
`pressure-state` past its staleness threshold → `legacy` mode → the mode with no `last_fired`
dedup.** The condition that triggers the re-fire is the same condition that removes the only
remaining backstop. That coupling is the actual hazard, and it is why this is worth a row despite
today's zero damage.

## 5. This CORRECTS the P1 row's premise — the material finding for triage

`FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` (P1) is titled:

> router intent PRE-CLAIM and the cowork slot dispatcher share NO task_id namespace, so task_claim
> is a no-op mutex across paths; **a peer router session** double-dispatches a cowork slot agent…

Its proposed fix — unify the namespaces, or have the router probe `cowork-slot:<slot_id>` — is
scoped entirely to **two paths, two sessions**.

**This instance has no peer and no router.** One session, one path, re-entering its own tick.
**Unifying the namespaces would not have prevented it**, because both passes were the *same*
session claiming the *same* key at *different times* — a namespace merge changes nothing about a
key that was legitimately released in between.

So the P1 row, if fixed as written, closes one of at least two independent double-dispatch enablers
while reading as though it closed the problem. Same trap as the 933 correction: *dedup would not
have prevented the false claim*. Do not let the louder, better-documented enabler (peer namespace)
absorb the quieter one (self re-fire).

**Suggested:** widen the P1 row's scope, or mint a sibling: *"a re-fire of the same nominal tick
must be suppressed"* — the only guard that survives a release is a **tombstone keyed by tick**
(`last_fired`/`tick_id` ≥ nominal tick ⇒ SUPPRESS), never a lock. Precedent: this is exactly the
`published⇒TOMBSTONE, never release` invariant already established for the chef marker.

Cheapest concrete fix: the preflight already computes the nominal tick and already reads
`pressure-state.json`. **`pressure_state.tick_id == nominal_tick` ⇒ this tick already ran ⇒
SILENT.** One comparison, in the script, before the election. It would have caught this instance.
(Caveat for the implementer: `emit` happens at Step 6, so a tick that dies *before* Step 6 would not
be tombstoned and would correctly re-run — which is the desired behavior, not a bug.)

## 6. Why the cron delivered twice — UNPROVEN, do not diagnose from this

The 21:30 cron fired at 21:30 (handled, drift 0) and again at ~21:35 (drift 5). Between them, this
session ran a long dispatcher pass and a `/compact`.

Plausible: crons fire only when the REPL is idle; the pass + compact spanned the boundary, and a
queued/deferred firing was delivered once the REPL went idle. **This is a hypothesis.** I cannot see
the scheduler's queue and did not verify it. It is recorded as the observation it is, not the cause.

The finding in § 1–5 **does not depend on the mechanism** — whatever caused the second delivery, the
dispatcher had no defense against it, and that is the defect.

## 7. Side observation — `stale_warning` is non-deterministic w.r.t. the inputs I control

Last tick I filed an observation that `emit_pressure_state`'s **argument shape** appeared to drive
`stale_warning` (flow-specified args → `true`; argless → `false`), possibly linked to the dead
cycle-snapshot promotion. **That hypothesis is now weakened and should not be carried:**

| emit | args | `cycle_snapshot_promoted` | `stale_warning` |
|---|---|---|---|
| 21:06 | flow-specified | false | **true** |
| 21:31 | flow-specified | false | **false** |
| 21:37 | flow-specified (same, same `tick_id`) | false | **false** |

Three emits, identical arg shape, identical `promoted:false` — 1 `true`, 2 `false`. Neither
arg-shape nor promotion explains it. An age-of-previous-emit rule also fails: at 21:31 the previous
emit was 24.9 min old (> the 20-min threshold) yet it returned `false`.

**I have no mechanism and am not proposing one.** Recording it only to retract my own prior
hypothesis before it propagates as a diagnosis. It was filed as unverified last tick, which is the
only reason it is retractable now rather than already embedded somewhere as fact.

## 8. Dispatcher actions taken

- Ran Step 6.0 `emit_pressure_state` (mandatory on WORK path; idempotent on `tick_id`) and released
  the re-acquired P3 lock — **did not leave the lock held**.
- Did **NOT** re-execute the tick's body: no drain of the 2 `to: po` rows (left `NEW` — proven
  correct, `2026-07-15-cowork-step0a-drain-starves-devteam.md`), no spawns (none matched anyway).
- Did **NOT** mint a board row, spawn `po`, or spawn `agent-father` (`cowork-team/flow/main.md:12,16`).
- Filed one signal row to `po`. **Marginal cost zero:** the SILENT gate is `NEW count > 0`, not
  per-row — rows `cow-20260715T212837/212838` already hold it open until po's `:07` drain, so a
  third row adds no additional wasted ticks. There was no reason to withhold the finding.
