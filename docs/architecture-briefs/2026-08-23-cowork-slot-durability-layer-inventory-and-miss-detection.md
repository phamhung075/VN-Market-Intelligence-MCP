# Cowork Slot Durability — Layer Inventory, `last_fired` Truth, and Miss Detection

**Date:** 2026-08-23T09:40Z · **Author:** architect · **Type:** FIX, P1
**Row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY` (`task_board.ready[]`, zone `cross-service/`)
**Paired row:** `FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE` → brief `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md`. That row is the *trigger*; this one is the *amplifier*.
**Supersedes (partially):** `docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md` §2.1/§2.3 — see §4.
**PLAN-ONLY.** No file outside `docs/architecture-briefs/` is touched by this brief.

---

## 1. PO's question (b) answered empirically — and the answer is neither of the two options offered

PO wrote: *"Either the RemoteTriggers are not firing these, or firing them does not update `last_fired`. Architect must resolve WHICH before designing on top of the guaranteed/non-guaranteed split at all."*

The answer is **neither option, and a third mechanism dominates**. Live inventory of the three durability layers:

| Layer | Mechanism | Scope | Status measured 2026-08-23 |
|---|---|---|---|
| **A** | 12 cloud RemoteTriggers | 12 guaranteed/hourly slots | **RETIRED 2026-06-22.** `cowork-schedule.json._notes.layer_a_deletion_gate`: *"RemoteTrigger Layer A is retired per STANDING `feedback_no_remote_trigger_all_local` … the mechanism itself is retired, not merely paused."* Live count of slots with `trigger_status:"active"` = **0** (5 `superseded`, 5 `deleted`, 11 absent). |
| **B** | `*/15 * * * *` CronCreate dispatcher | all 21 enabled slots | Session-scoped. Evaporates on CLI exit. |
| **C** | launchd `com.vn-market.cowork-guaranteed-slot-firer`, `StartInterval=900` | the 8 `guaranteed:true` slots | **Loaded and working.** `launchctl list` → present, last exit `0`; symlinked into `~/Library/LaunchAgents/`. Log shows 4 real fires on 2026-08-22. |

So **Layer A does not exist**, and has not for two months. This matters beyond bookkeeping: `.claude/skills/cron-cowork-team/SKILL.md`'s *"Why this skill exists"* paragraph still asserts *"The 12 RemoteTriggers (sprint 1957a stopgap) provide persistence for the 12 guaranteed/hourly slots"*, and that sentence was **quoted verbatim into the P0 row's own `status_note`** as the explanation for why nobody noticed the 8 h outage. A two-month-stale doc is actively manufacturing wrong incident diagnoses. Doc-fix is required, not optional (§6 item 5).

## 2. `last_fired` under-reports — 4 of 8 guaranteed slots ran later than the SSOT says

Layer C **is** firing. Cross-referencing its log against the schedule:

| slot | last Layer-C fire | `last_fired` in schedule | verdict |
|---|---|---|---|
| chef-eod | 2026-08-18T08:51Z | 2026-08-13T08:55Z | **ran, not recorded** |
| digest-sunday | 2026-08-09T13:47Z | 2026-07-19T13:49Z | **ran, not recorded** |
| fb-daily | 2026-08-14T09:18Z | 2026-08-13T09:25Z | **ran, not recorded** |
| fb-weekend | **2026-08-22T13:29Z** | 2026-08-08T13:24Z | **ran YESTERDAY, not recorded** |
| chef-morning | 2026-08-14T05:27Z | 2026-08-14T05:22Z | recorded |
| chef-evening | 2026-08-22T19:47Z | 2026-08-22T19:52Z | recorded |
| digest-daily | 2026-08-22T17:35Z | 2026-08-22T17:37Z | recorded |
| tnb-audit | 2026-08-22T20:21Z | 2026-08-22T20:23Z | recorded |

**`fb-weekend` is not 14.8 days stale — it ran yesterday.** Part of PO's staleness table is an *observability* artifact, not an execution failure.

**Mechanism:** `last_fired` is written by `cowork-tick-postflight.sh` §(a) → `cowork-write-last-fired.js`, which is part of the **Layer B** post-tick path. Layer C (`cowork-guaranteed-slot-firer.sh`) invokes `claude -p '<trigger_prompt>'` and never calls postflight. Slots whose *own flow* happens to write `last_fired` (`chef.md`, `digest-predict/flow/main.md`) get recorded; slots whose flow does not (`fb-market-poster`) do not.

This is the highest-leverage fix in the row, because **every downstream decision reads this field**: the boundary-dedup suppressor (`cowork-match-slots.js:129`), the catch-up predicate, and any miss detector we build. Acting on it while it is wrong for half the guaranteed set poisons everything else.

## 3. Root cause of the 11 stale slots — host sleep, and neither layer catches up

`pmset -g log`:

- `2026-08-18 14:00:29 +0200  Entering Sleep state … 347672 secs` → **96.5 h continuous Standby, 2026-08-18T12:00Z → 2026-08-22T12:35Z.**
- 2026-08-16 → 2026-08-18: near-continuous 1-hour Maintenance-Sleep cycles with only 10–30 s DarkWake between them.

The Layer C log has **zero entries** between 2026-08-18T08:51Z and 2026-08-22T13:29Z — the gap matches the sleep window exactly, on both edges. Inferred from that measurement: a LaunchAgent `StartInterval` job does not run while the host sleeps, and on wake the missed intervals are **coalesced into one fire, not replayed**. The firer then asks the matcher *"what is due right now"* (±2 min window) and gets `[]`.

**So Layer C is not host-durable. It is awake-durable.** During a sleep window, Layers B and C are down *simultaneously*, and neither has any catch-up. Every slot whose scheduled minute fell inside the window is lost permanently and silently.

**This is why `guaranteed` predicts nothing.** Staleness tracks *hour of day*:

- **10 fresh slots** all fire in UTC 17:30–00:10 (= 19:30–02:10 CEST, the operator's habitual awake window). Sole exception: `refine-bctc-slot-1` at 09:00Z, fresh only because it fired this morning at 09:03Z — the tick that surfaced this row.
- **11 stale slots** all fire in UTC 01:30–16:35.

By `guaranteed`: 3 of 8 guaranteed are fresh, 5 stale; 7 of 13 non-guaranteed fresh, 6 stale. **PO's suspicion is confirmed — the guaranteed/non-guaranteed split is not load-bearing.** The load-bearing variable is *whether the host was awake and/or a session was up at the scheduled minute*. Memory `project_host_suspension_causes_multiday_cron_silence_backlog_flush` (confirmed 2×) and `project_vacation_shutdown_resilience_gap_20260822` are the same class; this is their mechanism.

## 4. Finishing Step 4.55 recovers **nothing** — measured, not argued

PO's correction (A) said finishing the specced catch-up misses the cited case because `catchup_raw` is scoped to `guaranteed:true` (`cowork-catchup-predicate.js:209 — if (!sl.guaranteed) continue;`). Confirmed. But the real result is stronger. Live run of the matcher at 2026-08-23T09:2xZ:

```
catchup_raw: 8 records — catchup_eligible=true: 0
  chef-morning   false  rolled_past_vn_date        sched 2026-08-21T05:15Z
  chef-eod       false  rolled_past_vn_date        sched 2026-08-21T08:45Z
  chef-evening   false  rolled_past_vn_date        sched 2026-08-22T19:45Z
  digest-sunday  false  rolled_past_vn_date        sched 2026-08-16T13:47Z
  digest-daily   false  rolled_past_vn_date        sched 2026-08-22T17:30Z
  tnb-audit      false  freshness_window_exceeded  sched 2026-08-22T20:13Z
  fb-daily       false  rolled_past_vn_date        sched 2026-08-21T09:15Z
  fb-weekend     false  freshness_window_exceeded  sched 2026-08-22T13:13Z
```

**Zero eligible.** The predicate's two refusal rules — `rolled_past_vn_date` and `catchup_max_lateness_minutes` (60–1440 min per `_dish_type_catchup_config`) — bound catch-up to *within the same VN calendar day*. The measured outage is **4 days**. A fully-wired Step 4.55 would today catch up **zero slots, including zero guaranteed slots**.

`docs/agents/cowork-team/flow/catchup-check.md` does not exist; the Step 4.55 consumer was never built. **Do not schedule "wire Step 4.55" as the fix.** It is not a fix for this failure at all.

And the refusal is *correct on its merits*: you genuinely cannot publish Friday's morning dish on Sunday. Which reframes the row.

## 5. Reframe — "how do we catch up" is the wrong question

For a 4-day outage the honest answer for most dish types is *"you can't"*. Two separable questions replace it:

**Q1 — prevention.** Options considered:

- **C-1 `pmset repeat wakeorpoweron`** covering the union of scheduled minutes. Host configuration (ops), not a repo change; cheap and reversible. Partial: does not survive lid-closed-in-a-bag or power-off. **Recommended as a cheap adjunct, not as the fix.**
- **C-2 move generation to the Vinahost VPS.** Re-read the 2026-07-07 brief §3 rejection: no LLM runtime, no Anthropic credential, no flow-doc tree on that box, and shipping an API key to an internet-facing host is a security-surface increase. **Still correct. Not reopened.**
- **C-3 accept that a laptop-hosted scheduler misses windows, and make every miss *detected* within one cycle.** **Recommended.** Today a miss is indistinguishable from a no-op — that is what turned a 4-day sleep into a 34.8-day `digest-sunday` gap nobody noticed. Detection is the deliverable; on-time execution on a laptop is not achievable and pretending otherwise is what produced this row.

**Q2 — per-dish-type disposition.** Whether a late run is *valid* is a property of the dish, and it is currently decided by accident, via a 1440-minute constant. Make it explicit (§6 item 3).

This satisfies the row's own `verification_gate`, which already anticipates the honest answer: *"…either caught up **or explicitly declared out of scope with a reason**."*

## 6. Design — five changes, in dependency order

| # | Change | Why | Owner | Files |
|---|---|---|---|---|
| **1** | **Layer C writes `last_fired`.** After a `claude -p` invocation returns exit 0, call `node scripts/agents-flow/cowork-write-last-fired.js <slot_id>`. | Fixes §2. Highest leverage, smallest diff. **Pure reuse** — the writer already exists, takes slot ids as argv, and is *monotonic forward-only with a parse-back guard* (`last-fired.md`), so a double-write from both the flow and the firer is safe by construction, with zero coordination. | `developer` | `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` + `.test.sh` |
| **2** | **Miss detector, not a catch-up engine.** Per slot, compute expected fire count over a window from the cron expression, compare to actual, file **one** signal row per slot per window carrying the count. | Fixes §3/§5-Q1-C-3. **Reuses `cowork-match-slots.js`'s existing `cronMatches()`** — no new cron parser. Depends on #1: acting on today's `last_fired` would report 4 false misses. | `developer` | new `scripts/agents-flow/cowork-missed-fire-audit.js` + `.test.js` |
| **3** | **Make disposition explicit.** Add `on_miss: "catchup" \| "skip_and_record"` per dish type in `_dish_type_catchup_config`, instead of letting the 1440-minute bound decide by accident. | Turns §4's implicit refusal into a declared, reviewable policy. | `agent-father` (schedule is `_maintained_by: agent-father via architect brief only`) | `docs/data/cowork-schedule.json` |
| **4** | **Narrow, justified widening of `catchup_raw`.** Replace `if (!sl.guaranteed) continue;` with a check on a new slot field `catchup_scope: true`, defaulting to today's `guaranteed` value so day-1 behaviour is unchanged. Then set it `true` for `refine-bctc-*` and `bctc-analyst-*`. | Those are data-refinement jobs with **no publish-date semantics** — a late run is a *correct* run, so `rolled_past_vn_date` should not apply to them. This is the principled widening, **not** a blanket removal of line 209. Also covers the row's originating symptom, `refine-bctc-slot-1`. | `developer` + `agent-father` | `scripts/agents-flow/cowork-catchup-predicate.js`; `docs/data/cowork-schedule.json` |
| **5** | **Doc-truth fixes.** (a) `cron-cowork-team/SKILL.md` "Why this skill exists" — Layer A is retired; Layer C is the session-independent layer and it is *awake*-scoped. (b) `match-slots.md:40` — `catchup_raw` scope + the fact that Step 4.55 is not merely unwired but would recover nothing as specced. (c) Close out the 2026-07-07 brief §5 item 5, which ordered this same runbook fix and was never done. | §1's stale sentence is already propagating wrong diagnoses into live incident rows. | `agent-father` | `.claude/skills/cron-cowork-team/SKILL.md`, `docs/agents/cowork-team/flow/match-slots.md`, `docs/protocols/cowork-master-cron-runbook.md` |
| **6** | **Ops adjunct:** `pmset repeat wakeorpoweron` over the union of guaranteed-slot minutes. | §5-Q1-C-1. Cheap, reversible, partial. | `ops` | none (host state) |

**Deliberately NOT in scope:** extending Layer C to the sub-hourly market slots (`news-scout-market`, `market-watcher-market`, `alert-commander-market`). The 2026-07-07 brief §3.5 kept those Layer-B-only on purpose, and that is still right — a headless `claude -p` every 15 min through market hours is a cost and pile-up risk with no matching benefit. Change #4's `catchup_scope` field is the opt-in mechanism if that is ever revisited; it does not reopen it now.

**Sequencing:** #1 → #2 (detector needs truthful `last_fired`). #3, #4, #5, #6 are independent of each other and of #1/#2.

## 7. Verification gate

Row gate: *"a replay of the 2026-08-23T09:00Z schedule snapshot shows every one of the 11 stale slots either caught up or explicitly declared out of scope with a reason."*

Satisfied by a **per-slot disposition table** produced against the frozen 09:00Z snapshot, one row per stale slot, each landing in exactly one bucket:

- **`recorded-late`** — ran under Layer C but `last_fired` was not written; fixed by #1. Expect: chef-eod, digest-sunday, fb-daily, fb-weekend.
- **`genuinely-missed / no-catchup-possible`** — publish-date-bound dish, host asleep at the scheduled minute; declared `on_miss: skip_and_record` by #3, and detected by #2 going forward. Expect: chef-morning, chef-intraday, news-scout-sentiment, market-watcher-eod, alert-commander-market.
- **`catchup-eligible under the widened scope`** — no publish-date semantics; covered by #4. Expect: bctc-analyst-slot-1, refine-bctc-slot-4, and the originating refine-bctc-slot-1.

Additional assertions:

- **AC-1** — after #1, a Layer-C fire of a slot whose flow does not self-write (use `fb-weekend`) updates `last_fired`; monotonicity holds under a simulated double-write from flow + firer.
- **AC-2** — after #2, replaying the 08-18→08-22 sleep window produces exactly one signal row per affected slot with the correct missed-fire count, and **zero** rows for the 10 fresh slots.
- **AC-3** — after #4, the live matcher's `catchup_raw` contains the `refine-bctc-*` / `bctc-analyst-*` slots with `catchup_eligible:true` when late, while every publish-date-bound slot still refuses. `catchup_raw` must **not** become uniformly non-empty — that would mean #4 removed the guard instead of narrowing it.
- **AC-4** — `grep` finds no surviving claim that RemoteTriggers provide persistence, in any of the three files in #5.

## 8. Risk flags

- **R1 — measure before you fix.** #2 built on today's `last_fired` reports 4 false misses immediately. The #1→#2 order is not stylistic.
- **R2 — `on_miss: catchup` must not resurrect stale publishes.** Every guaranteed-slot flow already has a published-marker `task_claim` gate (FR-P2-7); #3/#4 must not add a second, competing dedup. Reuse the existing gate.
- **R3 — alarm volume.** #2 on the 08-18→08-22 window would file ~11 slots × several days of rows. Bound it: one row per `(slot_id, window)`, not per missed occurrence, and cap the look-back.
- **R4 — `pmset repeat` (#6) is host state, invisible to the repo.** If it is the only mitigation and it silently un-sets, we are back here. It is an adjunct to #2, never a substitute; #2 is what detects #6 having failed.
- **R5 — #4 widens a predicate that currently returns zero-eligible on every path.** That means it is effectively untested in the `true` direction in production. #4's tests must cover the eligible branch end-to-end, not just the refusal branches.
- **R6 — the launchd firer is not self-verifying.** The 2026-07-07 brief §3.8 ordered a Tier-1 probe assertion that `com.vn-market.cowork-guaranteed-slot-firer` is loaded; it is loaded *today*, but the 2026-07-01→07-04 silent-unload precedent is on record. Out of scope for this row — flag to PO as a candidate row rather than folding it in.

**BUILD-STANDARD:** not-applicable (BUG-FIX / MAINTENANCE, in-zone, no new primitives).
**Zone:** `cross-service/` — `scripts/agents-flow/` (developer), `docs/data/cowork-schedule.json` + `docs/agents/cowork-team/flow/` + `.claude/skills/` (agent-father), host state (ops). PM splits by owner.

## RETURN

```
DONE: Technical design complete — PO's question (b) resolved empirically (Layer A retired 2 months ago; Layer C alive but awake-scoped; host slept 96.5h), guaranteed/non-guaranteed split disproved as the discriminator, Step 4.55 measured to recover zero slots
ZONE: cross-service/ (multi-owner: developer + agent-father + ops)
NEXT: pm | split by owner — developer (#1 last_fired write-back, #2 miss detector, #4 predicate scope), agent-father (#3 on_miss policy, #5 doc-truth), ops (#6 pmset adjunct); #1 before #2
BRIEF: docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md
PIPELINE: continue
```
