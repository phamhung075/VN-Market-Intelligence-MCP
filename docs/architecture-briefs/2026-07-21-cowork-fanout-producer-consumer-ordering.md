# Architecture Brief — cowork Fan-Out Producer/Consumer Ordering

**Date:** 2026-07-21T17:55:56Z
**Author:** architect
**Task:** DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING (P1, size M, zone `cross-service/`)
**Origin signal:** `docs/signals/processed/cowork-team-20260721T162324Z-fanout-ordering-and-siblingdedup-correction.json`
**Zone:** cross-service/ — `docs/agents/cowork-team/`, `docs/agents/alert-commander/`, `docs/agents/market-watcher/`, `.claude/skills/cycle-bootstrap/`, `docs/data/cowork-schedule.json`, one array literal in `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts`. Multi-zone → PM splits by row below (§9).
**Design only. Do not implement.**

---

## 0. Incident recap (verified, not re-derived)

16:00Z tick fan-out: `news-scout-offhours`, `market-watcher-offhours`, `market-watcher-eod`, `alert-commander-critical` — all four spawned in one parallel background block per `spawn-fanout.md`. `alert-commander-critical` ran ~16:10–16:15Z, read the bus with explicit `signal_type`-filtered calls, found it genuinely empty, and exited silently per its own contract (`cycle.md` Firing Gate). `market-watcher-offhours` posted `price_anomaly` 8680 (GAS −6.98%, 2.89σ) and 8681 (D2D −3.30%) at ~16:17Z — after alert-commander had already exited. Real market-facing drops (GAS −6.98%, BSR −6.49%, GEX −5.16%) went unalerted for the remainder of that 4h window. alert-commander's evidence was clean; dispatch order made it blind.

---

## 1. Brownfield findings

**F1 — `depends_on` already exists in the schedule schema and is honest about being non-enforced.** `docs/data/cowork-schedule.json` has a `depends_on` field on every slot, currently `null` for 19/21 slots and free-text for 2: `chef-eod.depends_on = "foreignFlowAlertJob:08:13:UTC — 24-min gate..."`, `fb-daily.depends_on = "chef-eod 08:45 UTC + 30min"`. Grep across `docs/agents/cowork-team/flow/*.md` and `scripts/agents-flow/*.js` confirms zero code reads this field — it is a documentation-only annotation, and the ordering it describes is achieved entirely by **cron offset** (fb-daily's cron sits 30 min after chef-eod's), not by dispatch-wave sequencing. This is real, working prior art for producer→consumer safety, but it only works because the two events are in *different* ticks. alert-commander-critical's problem is worse: its cron (`0 */4 * * *`) is **identical** to `news-scout-offhours`/`market-watcher-offhours`'s cron — same tick, not offset ticks. A schedule-offset alone cannot fix a same-tick collision without either delaying alert-commander by more than a producer's observed worst-case runtime (~17 min, see F2) or accepting a partial mitigation.

**F2 — Producer cycle duration is long relative to any cheap in-session wait.** The 16:00Z tick dispatch → market-watcher-offhours' actual post was ~17 minutes. A short (60–180s) synchronous re-read inside alert-commander's own cycle would not have caught this. A wait long enough to be reliably useful (15–20 min) blocking *inside* alert-commander's session is a real cost paid on every matched tick, most of which are quiet.

**F3 — `run_in_background=true` + parallel fan-out is a deliberate, load-bearing design choice (BGFAN-1), not an oversight.** `docs/protocols/agent-chaining-protocol.md` § Background Spawn Mandate explicitly distinguishes gated chains (dev-team po→ba→architect→pm→dev→qa: spawn, wait for completion notification, spawn next) from cowork agents ("independent of each other → genuinely parallel background fan-out is desired"). That assumption is now proven false for this one producer/consumer pair — but it is not false in general (most cowork agents genuinely are independent), so the fix should not force the dispatcher to block-and-wait for a spawned agent's full completion. Doing so would also risk the exact TTL-lapse failure class already recorded in memory (fire-time election lock TTL=600s in `leader-lock.md`; a multi-minute wait for producer completion risks the lock expiring mid-tick and being reclaimed by the next tick's election — `feedback_chain_mutex_ttl_lapse_during_long_hop_reclaim.md`).

**F4 — `last_fired` is stamped at spawn time, not completion time.** `last-fired.md` Step 5b writes `last_fired` immediately after the dispatcher's `Agent()` call returns successfully — i.e. after the background spawn *starts*, long before the spawned agent finishes its multi-minute cycle and posts anything ("AC-P1-7-1: last_fired written after successful spawn"). This matters: it means alert-commander **cannot** reliably reconstruct "was a producer co-dispatched this tick" by re-invoking `scripts/agents-flow/cowork-match-slots.js` itself a few minutes into its own cycle — by then `isSuppressedByBoundaryDedup()` will already exclude the producer slot (its `last_fired` is already ≥ the nominal tick boundary), even though the producer's actual work is still in flight. Any design that has the consumer "self-derive" co-dispatch after the fact is silently defeated by this timing. The information must be captured **at dispatch time** and handed to the consumer, not recomputed later.

**F5 — The dispatcher already has the exact data needed, and a channel that already reaches every spawned cowork agent.** `docs/data/cowork-schedule.json` slots already carry `parallel_group` (`"gatherers"` = news-scout/market-watcher, `"alerts"` = alert-commander) — a field already read by `pressure-cadence.md` for an unrelated purpose (chef guaranteed/non-guaranteed split), confirming it is live schema, not dead. `tick-snapshot.md` Step 4.7 writes `docs/data/cycle-snapshot-<HH:MM>.json` **after** slot-claim (Step 4.6, where `WON_SLOTS` is finalized) and **before** spawn (Step 5) — so at write time the dispatcher already knows the final `WON_SLOTS` for this tick, before any `last_fired` mutation. Every cowork agent (alert-commander included — see `cycle-bootstrap/SKILL.md` frontmatter list) already reads this exact file every cycle via the shared `.claude/skills/cycle-bootstrap/SKILL.md` Step -1 (7-min freshness window, safe fall-through-to-direct-call on miss — the "never block on a missing snapshot" convention already exists and needs no new failure-handling design).

**F6 — `schedule_task` already exists, is public, and already routes to cowork agents.** `apps/mcp-server/src/interface/mcp/tools/system/scheduledTaskTools.ts` (#169, DEFERRED-TASK-SCHEDULER-MVP) is a public MCP tool: `schedule_task(fire_at|delay_seconds, agent, intent, prompt, deadline_at?, dedup_key?, reason, max_attempts=1)`. For `team=="COWORK"` targets it is swept and spawned by `cowork-team` Step 0b.3's existing one-shot sweeper — already wired, already tested infrastructure, zero new tool needed. **Gap found:** `alert_commander`'s `SKILL_MANIFEST` entry in `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:115-139` does not include `schedule_task` (only `dev_team` and `unified_coordinator` currently do) — a real, concrete prerequisite for this design, not optional (§4, §9 T3). `docs/agents/tools/package/alert-commander.md` mirrors the same gap.

**F7 — Root cause of the R3 fold-in is upstream of match-slots.md, in market-watcher's own dispatcher.** `docs/agents/market-watcher/flow/main.md` Step 2 selects sub-flow **purely from current wall-clock time** (`market`/`prepost`/`EOD ±5min`/`offhours` windows) and never reads the `slot=<slot_id>` parameter the dispatcher already passes in its spawn prompt (`"run <flow_path> slot=<slot_id>"` — confirmed present in `spawn-fanout.md:120` and totally unparsed by both `market-watcher/flow/main.md` and `alert-commander/flow/main.md` today). The incident's `market-watcher-eod` slot fired late (~16:08–16:13Z, outside its own 15:55–16:05 EOD window) and, because main.md re-derives mode from the clock rather than the slot identity it was given, it silently fell through to `cycle.md`/`offhours` instead of `eod.md` — the same sub-flow `market-watcher-offhours` was concurrently running. This is worse than duplicate compute: `eod.md`'s output (`docs/analysis-briefs/{TICKER}.md` ledger entries + `docs/signals/price_anomaly_<ts>.json`, which "Chef (unified-agent) reads... at 08:37 UTC EOD dish") can go **entirely missing** for the day whenever the EOD slot drifts past its ±5min window, independent of whether a collision with the offhours slot happens at all. `match-slots.md` Step 4b (R3) correctly *detected* the resulting agent-collision (WARN) — it cannot fix the misrouting because the dispatch layer has no visibility into which trading-day close market-watcher is about to process; that is domain knowledge that belongs inside market-watcher's own flow, not the generic scheduler (DDD layer boundary — see §6).

**F8 — market-watcher already has a working content-level dedup guard for the case it does cover.** `cycle.md` Step 4 "[AutoCure 2026-05-14 TNB c47] Off-hours duplicate guard" already suppresses re-emitting a `price_anomaly` signal for an unchanged closing price within the same calendar session. That guard is scoped to `mode=offhours` cycles specifically — it is the right *kind* of fix (content-keyed, not slot-keyed) but it cannot help the case where the EOD slot's own distinct deliverable (ledger + signal file) never runs at all, because that case never reaches `cycle.md`'s c47 check in the first place when it *should* have routed to `eod.md`.

**F9 — `unified-agent/flow/main.md` uses the identical wall-clock-only dispatch pattern.** Not in scope to fix here (out of the row's boundary), but flagged: the same root-cause class (dispatcher passes `slot=`, receiving flow ignores it and re-derives from ambient clock state) may recur wherever a `main.md` re-derives mode from time instead of from the `slot=` it was given. Worth a follow-up sweep, not chased here.

---

## 2. Options evaluated

| # | Option | What it costs |
|---|---|---|
| (a) | Producer-wave then consumer-wave — two-phase fan-out | Requires the dispatcher to **block on producer completion** before spawning consumers. Directly contradicts BGFAN-1's explicit "cowork agents are independent → genuinely parallel background fan-out is desired" design intent (F3) — not because that intent was wrong in general, but because it would now be wrong for every tick, to fix one producer/consumer pair. A multi-minute wait (F2: ~17 min observed) inside the dispatcher's own session risks the fire-election lock's 600s TTL lapsing mid-tick (a failure class already documented elsewhere in this fleet) and delays every *unrelated* independent slot matched the same tick behind the wait. Also does not eliminate the race, only shrinks it — a producer that's simply slow (host load, more tickers) can still outlast any fixed wave-boundary. |
| (b) | Consumer re-reads after a bounded wait | Cheapest to implement, zero blast radius on the shared parallel dispatch contract — but a **synchronous** in-session wait sized to catch F2's 17-min worst case is itself expensive per-tick, paid mostly on quiet ticks. A synchronous wait is also unimplementable literally as "sleep": a spawned cowork agent's session extending 15-20 min every 4h (or every 15 min for `alert-commander-market`, if applied uniformly) is real session-time cost, not just latency. |
| (c) | Accept the race and document it | Zero implementation cost. But the row is explicitly market-facing (real >5% drops missed this session) — "accept" converts a fixable ~20min blind window into an up-to-4h one (next `alert-commander-critical` tick) or worse for CRITICAL-always signal types (`verified_chain`/`legal_risk`/`crisis_velocity`), which exist specifically to *not* wait for a scheduled tick. Poor fit for the severity stated in the row. |

**Chosen: a bounded, asynchronous variant of (b), implemented as a scheduled recheck rather than a blocking wait.** Not literally any of the three as PO worded them — PO invited a better option if one existed (F5/F6 make one available that wasn't visible without the brownfield read). It keeps the parallel fan-out entirely unchanged (no cost from (a)), pays no per-tick session-time cost for the common quiet case (no cost from (b)-as-written), and does not leave the actual failure mode undefended (unlike (c)).

---

## 3. What is traded away (stated plainly, per the row's ask)

- **Detection latency shrinks from ~4h worst case to a bounded ~20 min worst case. It does not go to zero.** The market can still move in that window before an alert posts. This converts "silently blind until next tick" into "detects late, not instantly" — it is not real-time consumer/producer consistency.
- **A single tick's outcome now has two possible verdicts, not one.** A co-dispatched alert-commander cycle that finds nothing can mean either "nothing happened" or "producer hadn't posted yet, recheck queued." Anyone reading telemetry/notebooks for that tick must know to also check the recheck cycle's outcome ~20 min later, not just the first cycle's. This is genuine complexity added to the mental model of "did alert-commander see this."
- **New failure surface, bounded and already-precedented.** The recheck itself depends on the cowork-team `*/15` dispatcher loop being alive at recheck time (`schedule_task`'s own documented AC-9 caveat — "one-shots fire only while the loop is live"). If the loop is down for that ~20 min window, the recheck silently doesn't fire and the system reverts exactly to today's behavior for that one tick — same failure class as today, smaller probability window, not eliminated. This is not new risk introduced by the design; it inherits an already-documented, already-monitored property of `schedule_task` itself.
- **What is NOT traded away:** the parallel, fire-and-forget nature of `spawn-fanout.md` is untouched. No slot's dispatch latency changes. No existing slot's prompt template changes shape (see §4.1 — the addition is additive/empty-string-safe). BGFAN-1 stays true for every other producer/independent pair in the schedule.

---

## 4. Design — Producer/Consumer ordering guard

### 4.1 Capture `won_slots` at dispatch time, not after the fact (fixes F4)

`docs/agents/cowork-team/flow/tick-snapshot.md` Step 4.7 (jq assembly, already has `WON_SLOTS` in scope from the preceding Step 4.6) adds one field to the snapshot it already writes:

```json
{
  "tick": "16:00",
  "created_at": "...",
  "market_context": {...},
  "macro_snapshot": [...],
  "won_slots": [
    { "slot_id": "news-scout-offhours",     "agent": "news-scout",     "parallel_group": "gatherers" },
    { "slot_id": "market-watcher-offhours", "agent": "market-watcher", "parallel_group": "gatherers" },
    { "slot_id": "market-watcher-eod",      "agent": "market-watcher", "parallel_group": "gatherers" },
    { "slot_id": "alert-commander-critical","agent": "alert-commander","parallel_group": "alerts" }
  ]
}
```

No new MCP call — pure local jq over data already resident in the dispatcher's own step. On write failure, the existing non-fatal fallback (`docs/agent-memory/notebooks` note: "Fallback: if this step fails, agents fall back to direct get_cycle_bootstrap") already applies; `won_slots` degrades to "unknown" exactly like `market_context` would on a miss — no new error-handling design needed.

### 4.2 Surface `won_slots` through the already-shared bootstrap skill (fixes F5)

`.claude/skills/cycle-bootstrap/SKILL.md` Step -1 (tick-snapshot check — already read by every cowork agent including alert-commander per the skill's own frontmatter) extracts one additional field alongside `market_context`/`macro_snapshot`: `$CYCLE_SNAPSHOT.won_slots`. On a snapshot MISS (absent/stale/malformed — already-documented fallback path, "never block on a missing snapshot"), `won_slots` is simply unavailable this cycle — same degradation posture as the two fields already handled this way. This generalizes the mechanism to any future producer/consumer pair without per-pair plumbing in `spawn-fanout.md`.

### 4.3 alert-commander: parse its own invocation, derive `CO_PRODUCERS`, gate the recheck

`docs/agents/alert-commander/flow/main.md` currently ignores the `slot=<slot_id>` parameter entirely (confirmed — F7). Add parsing of its own invocation prompt into `$SLOT_ID`, `$IS_RECHECK` (true only if prompt carries `recheck=true`), `$ORIGIN_TICK` (echoed back from the scheduled prompt). This is the same convention already used elsewhere in this fleet for prompt-carried parameters (`slot=` itself, `digest-predict`'s `period=` handling) — no new mechanism invented.

In `cycle.md`'s Firing Gate section, add a branch that runs **only** when neither position-danger nor watchlist-opportunity nor CRITICAL-always fired this cycle (i.e. exactly the point where today's flow says "EXIT silently — no MARKET write"):

```
CO_PRODUCERS = [s for s in ($CYCLE_SNAPSHOT.won_slots // []) if s.parallel_group == "gatherers"]

if CO_PRODUCERS is non-empty AND IS_RECHECK != true:
  WAIT_SECONDS = <alert-commander's own slot entry in cowork-schedule.json>.producer_settle_wait_seconds  # §4.4
  call_tool(server="vn-market", tool="schedule_task", arguments={
    delay_seconds: WAIT_SECONDS,
    agent: "alert-commander",
    intent: "signal_bus_recheck",
    prompt: "run docs/agents/alert-commander/flow/main.md  slot=" + SLOT_ID + "  recheck=true  origin_tick=" + NOMINAL_TICK,
    deadline_at: now_epoch + WAIT_SECONDS + 900,   # 15-min grace beyond the wait itself
    dedup_key: "alert-recheck:" + SLOT_ID + ":" + NOMINAL_TICK,
    reason: "co-dispatched producer(s) " + CO_PRODUCERS.map(s=>s.slot_id).join(",") + " in flight at silent-exit — DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING bounded recheck"
  })
  log "[alert-commander] recheck scheduled — co-dispatched producers in flight: " + CO_PRODUCERS.map(s=>s.slot_id)

# Then proceed with today's unchanged silent-exit — no MARKET write this cycle either way.
```

**This is a real discriminator, not an unconditional trigger** (the theme running through today's session): it does NOT fire when `CO_PRODUCERS` is empty (no co-dispatched producer this tick — the common case, zero added cost), and it does NOT fire when `IS_RECHECK == true` (the recheck cycle itself is a leaf — bounds the mechanism to exactly one extra spawn per qualifying tick, never a poll loop; `max_attempts` stays at its default of 1). When the recheck cycle runs, it is a completely ordinary alert-commander cycle — no special-cased evaluation logic. If the producer has posted by then, the existing Firing Gate fires normally; if not, it exits silently again with no further chaining.

No new dedup concern beyond what already exists: `alertCooldownMinutes: 0` and the "Internal Cooldown Rules — never suppress" policy (`docs/policies/alert-policy.md`) mean alert-commander is already built to fire multiple independent alerts per day; the recheck evaluating a signal the first cycle never saw is exactly that normal case, not a double-fire risk. (The daily `published:<slot_id>:<date>` marker pattern in `spawn-fanout.md` is scoped to single-canonical-daily-artifact agents — digest-predict, fb-market-poster, tran-ngoc-bau — and does not apply to alert-commander's event model; no interaction.)

### 4.4 Schedule data — config, not a hardcoded literal

`docs/data/cowork-schedule.json`, on `alert-commander-critical` and `alert-commander-market` (both `parallel_group: "alerts"`):

```json
"producer_settle_wait_seconds": 1200,
"depends_on": "gatherers @ same cron tick (news-scout-offhours, market-watcher-offhours) — producer signals may post up to ~20min after this slot's own dispatch (observed 2026-07-21: 17min); see producer_settle_wait_seconds + DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING bounded recheck"
```

1200s (20 min) is chosen with margin over the one measured worst case (17 min) — a starting point to tune from telemetry, not asserted as precisely correct; matches this fleet's standing "no hardcoded stats" convention by living in schedule data (queryable, adjustable) rather than as a magic number duplicated across flow docs.

### 4.5 Tool grant prerequisite (fixes F6 gap — blocking, not optional)

`apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` `SKILL_MANIFEST.alert_commander` array (currently lines 115-139) needs `"schedule_task"` added — it is not there today. Mirror in `docs/SKILL_MANIFEST.md` (per the file's own header comment: "mirrors docs/SKILL_MANIFEST.md JSON block") and in `docs/agents/tools/package/alert-commander.md` § Inter-Agent Communication. An existing test, `apps/mcp-server/src/__tests__/1872b-alert-commander-skill-manifest.test.ts`, is the exact prior-art pattern for a companion test asserting `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn (§7).

---

## 5. Design — R3 fold-in (root cause, not the warn/block dial)

**Do not flip `match-slots.md` Step 4b from WARN to BLOCK.** Two reasons: (1) the comment already on that line — "Intentional multi-slot fires... expected per brief §5 R3" — documents a real, deliberate case (an agent legitimately running two genuinely-different dish types in the same tick) that an unconditional block would break; (2) the dispatch layer has no way to distinguish that legitimate case from the incident's case without leaking market-domain knowledge ("which trading day's close is this") into the generic scheduler — a DDD layer violation (interface/dispatch layer encoding domain semantics that belong in market-watcher's own flow).

**Root-cause fix instead (F7): make `market-watcher/flow/main.md` route by the `slot=` it was already given, falling back to the wall-clock table only when no slot is present.**

```
if SLOT_ID == "market-watcher-eod":       → docs/agents/market-watcher/flow/eod.md              (always — regardless of drift)
elif SLOT_ID == "market-watcher-offhours": → docs/agents/market-watcher/flow/cycle.md mode=offhours (always)
elif SLOT_ID is empty/unrecognized:        → existing wall-clock window table, unchanged           (ad-hoc/manual invocation — the only case that table should still govern)
```

This is the same class of fix as §4.3 — the dispatcher already sends slot identity in its spawn prompt; the receiving flow was silently discarding it and re-deriving from ambient state (clock) that can be stale relative to when the slot was actually *supposed* to run. Once this lands: a late-firing `market-watcher-eod` always reaches `eod.md` (its distinct ledger + signal-file deliverable that Chef's 08:37 UTC dish depends on is never silently skipped again — a materially larger fix than "no more duplicate compute"), and Step 4b's WARN becomes accurate telemetry of two *intentionally* different sub-flows colliding in one tick rather than a symptom of one of them losing its own identity. `cycle.md`'s existing c47 off-hours duplicate guard (F8, content-keyed on stock_code+move_pct) remains the correct final defense for any residual overlap in what each sub-flow actually emits.

**Residual, flagged not fixed:** Step 4b still cannot detect a future authoring mistake where two *different* slot_ids for the same agent are configured to route to the *same* sub-flow/mode (a schedule-config error, not a dispatch-timing one) — that would need a schedule-authoring lint, out of this row's scope.

---

## 6. DDD / layer notes

Everything in this design is orchestration/process layer (`docs/agents/*/flow/*.md`, `.claude/skills/*/SKILL.md`, `docs/data/cowork-schedule.json`) plus one array-literal grant in `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (interface/mcp layer, already the correct home for skill-manifest tool grants — no domain/application code touched). No new services, no DB schema change, no new MCP tool. `BUILD-STANDARD: not-applicable` (bug-fix/hardening class per architect Standard Detection matrix — `apps/mcp-server/` already exists, no new primitives).

The R3 fix specifically enforces the DDD boundary already implicit in the codebase: market-domain routing decisions (which trading-day close a cycle represents) stay inside market-watcher's own flow; the generic dispatcher (`cowork-team`) stays a pure scheduler that only needs to know slot_id/agent/cron, never dataset semantics.

---

## 7. Test strategy

| # | Test | Type |
|---|---|---|
| T-1 | `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn | unit — mirrors `1872b-alert-commander-skill-manifest.test.ts` pattern |
| T-2 | Fixture `cycle-snapshot-HH:MM.json` with `won_slots` containing a `parallel_group:"gatherers"` entry → `cycle-bootstrap/SKILL.md` Step -1 extraction yields non-empty `$CYCLE_SNAPSHOT.won_slots` | flow-fixture walkthrough |
| T-3 | alert-commander cycle: empty bus + `CO_PRODUCERS` non-empty + `IS_RECHECK` unset → exactly one `schedule_task` call, correct `dedup_key`/`delay_seconds`/`prompt` | flow-fixture walkthrough |
| T-4 | alert-commander cycle: empty bus + `CO_PRODUCERS` empty (no co-dispatch this tick) → zero `schedule_task` calls (regression: today's cost-free common case must stay cost-free) | flow-fixture walkthrough |
| T-5 | alert-commander cycle: `IS_RECHECK == true` + still-empty bus → zero further `schedule_task` calls (bounding — no chain) | flow-fixture walkthrough |
| T-6 | alert-commander cycle: recheck fires and the producer HAS posted by then → normal Firing Gate evaluates and fires MARKET as usual, no special-cased path | flow-fixture walkthrough |
| T-7 | market-watcher: `slot=market-watcher-eod` invoked at a wall-clock time far outside the historical ±5min window → routes to `eod.md`, not `cycle.md` (regression for F7/the incident's exact failure) | flow-fixture walkthrough |
| T-8 | market-watcher: no `slot=` param (manual/ad-hoc invocation) → existing wall-clock table governs unchanged (backward-compat) | flow-fixture walkthrough |
| T-9 | `cowork-match-slots.js`/`match-slots.md` Step 4b unchanged — existing collision-warn behavior for two legitimately different dish_types in one tick still WARNs, still does not block | regression, no code change expected |

---

## 8. Interaction with the digest-daily signal (`cowork-team-20260721T174200Z-digestdaily-flowpath-bypasses-dedup-gate.json`)

Read for context per the row's instruction. **Orthogonal — this design neither fixes nor worsens it.** That signal is about *which field* (`flow_path` vs `trigger_prompt`) populates the spawned agent's flow-file target for the `digest-daily` slot specifically (`digest-predict`, `parallel_group: "digest"` — not `"gatherers"` or `"alerts"`, untouched by §4/§5's logic on either axis). This design only appends a `co_producers`-equivalent (via §4.2's shared snapshot field, not a `spawn-fanout.md` prompt-string edit — see §4.1/4.2, the prompt template at `spawn-fanout.md:120` is **not** touched by this design at all) and does not change which flow-file field is used for any slot. One proximity note for whoever picks up the digest-daily fix: `spawn-fanout.md` Step 5's per-slot prompt construction (the same region that signal's fix would touch) is untouched by this brief — no edit-order dependency, just naming it so a future editor isn't surprised to find this brief referencing the same file region without overlapping it.

---

## 9. PM decomposition

| Row | Zone | Depends on | Summary |
|---|---|---|---|
| T1 | `docs/agents/cowork-team/` | — | `tick-snapshot.md` Step 4.7: add `won_slots` to the snapshot JSON (§4.1) |
| T2 | `.claude/skills/cycle-bootstrap/` | T1 | Step -1: extract `won_slots` from snapshot into `$CYCLE_SNAPSHOT` (§4.2) |
| T3 | `apps/mcp-server/src/interface/mcp/bootstrap/` + `docs/SKILL_MANIFEST.md` + `docs/agents/tools/package/alert-commander.md` | — | Grant `schedule_task` to `alert_commander` SKILL_MANIFEST + companion test T-1 (§4.5). **Touches `apps/mcp-server/`** — sequence after today's live qa full-suite run per the row's constraints; independent of T1/T2/T4/T5, can proceed in parallel once that lock clears. |
| T4 | `docs/agents/alert-commander/` | T2, T3 | `main.md` prompt parsing (`slot=`/`recheck=`/`origin_tick=`) + `cycle.md` Firing Gate producer-race guard + `schedule_task` call (§4.3) |
| T5 | `docs/data/` | — | `cowork-schedule.json`: `producer_settle_wait_seconds` + `depends_on` annotation on both `alerts`-group slots (§4.4) |
| T6 | `docs/agents/market-watcher/` | — | `main.md` Step 2: explicit `slot=` routing for `market-watcher-eod`/`market-watcher-offhours`, wall-clock table as no-slot fallback only (§5). Independent of T1-T5 — can ship separately/first. |
| T7 (optional, low-priority, doc-only) | `docs/agents/cowork-team/` | T6 | `match-slots.md` Step 4b: one clarifying comment on why WARN-only remains correct post-T6 (§5) |
| T8 | qa | T1-T6 | Execute test strategy §7 |

T6/T7 (R3 fold-in) has no dependency on T1-T5 (producer/consumer ordering) and can be sequenced independently if PM wants to parallelize across two developers.

---

## Scan clean: true ✓
