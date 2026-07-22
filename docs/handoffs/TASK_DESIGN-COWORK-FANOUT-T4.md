---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC
size: M
zone: docs/agents/alert-commander/
depends_on: [DESIGN-COWORK-FANOUT-T2, DESIGN-COWORK-FANOUT-T3, DESIGN-COWORK-FANOUT-T5]
blocks: [DESIGN-COWORK-FANOUT-T8]
---

## TLDR
Implement the bounded, asynchronous recheck mechanism in alert-commander: (1) parse invocation prompt for `slot=<slot_id>`, `recheck=true`, `origin_tick=<tick>` parameters in `main.md`; (2) in `cycle.md` Firing Gate section, when position-danger/watchlist-opportunity/CRITICAL-always all miss AND co-dispatched producers exist AND NOT a recheck cycle: schedule a one-shot alert-commander retry in 1200s (configurable from `cowork-schedule.json`). The recheck is a completely ordinary alert-commander cycle; if producer has posted by then, normal Firing Gate fires; if not, it exits silently with no further chaining.

## [PM] Planning Context

**Zone:** `docs/agents/alert-commander/`

**Acceptance Criteria:**
- [ ] `docs/agents/alert-commander/flow/main.md` Step 1 now parses spawn prompt for three parameters: `$SLOT_ID`, `$IS_RECHECK` (flag), `$ORIGIN_TICK` (nominal tick)
- [ ] `docs/agents/alert-commander/flow/cycle.md` Firing Gate adds a discriminating branch:
  - Fires **only when** no position-danger / watchlist-opportunity / CRITICAL-always fired AND `$CYCLE_SNAPSHOT.won_slots` is non-empty AND `$IS_RECHECK != true`
  - Reads `producer_settle_wait_seconds` from `docs/data/cowork-schedule.json` schedule for this slot
  - Calls `schedule_task(delay_seconds, agent="alert-commander", intent="signal_bus_recheck", prompt="...", dedup_key, reason, deadline_at, max_attempts=1)`
  - Prompt includes full invocation: `run docs/agents/alert-commander/flow/main.md  slot=<SLOT_ID>  recheck=true  origin_tick=<TICK>`
- [ ] Recheck cycle is a leaf (no further chaining): when `IS_RECHECK == true`, no new recheckse are scheduled
- [ ] Dedup key ensures exactly one recheck per slot/tick combination: `alert-recheck:<SLOT_ID>:<TICK>`
- [ ] AC T-3 test passes: empty bus + `CO_PRODUCERS` non-empty + `IS_RECHECK` unset → exactly one `schedule_task` call, correct params
- [ ] AC T-4 regression test passes: empty bus + no co-dispatch this tick → zero `schedule_task` calls (common case must stay cost-free)
- [ ] AC T-5 test passes: `IS_RECHECK == true` + still-empty bus → zero further `schedule_task` calls (no chain)
- [ ] AC T-6 test passes: recheck fires and producer HAS posted → normal Firing Gate evaluates, fires MARKET as usual

**Rationale:**
- Implements brief § 4.3: bounded, asynchronous recheck, not blocking wait or unconditional two-phase fan-out
- Fixes the 2026-07-21 incident root cause: when a co-dispatched producer (market-watcher-offhours/eod) posts signals slowly (~17min), alert-commander no longer silently misses them (detection latency shrinks from ~4h to ~20min)
- Design principle: keeps parallel fan-out untouched (BGFAN-1), pays zero per-tick cost for quiet ticks, discriminator ensures only real producer/consumer pairs trigger recheck
- Single recheck per tick (dedup + leaf bounding) prevents chain accumulation

**Files to read first:**
- `docs/agents/alert-commander/flow/main.md` (Step 1 structure, existing prompt parsing)
- `docs/agents/alert-commander/flow/cycle.md` (Firing Gate section — where to add recheck branch)
- `docs/data/cowork-schedule.json` (verify alert-commander-critical / alert-commander-market entries, `producer_settle_wait_seconds` field from T5)
- `.claude/skills/cycle-bootstrap/SKILL.md` (to understand `$CYCLE_SNAPSHOT` access from T2)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § 4.3 (design detail, pseudocode, test strategy)

**Files to modify:**
- `docs/agents/alert-commander/flow/main.md` (Step 1: add prompt parameter parsing)
- `docs/agents/alert-commander/flow/cycle.md` (Firing Gate: add recheck scheduling branch with CO_PRODUCERS guard)

**Files to create:**
- None

**Dependencies:**
- Depends on T2 (needs `$CYCLE_SNAPSHOT.won_slots` available from cycle-bootstrap)
- Depends on T3 (needs `schedule_task` granted to alert_commander)
- Depends on T5 (needs `producer_settle_wait_seconds` config in schedule)
- Blocks T8 (QA gate: T-3 through T-6 tests verify this)

**Knowledge needed:**
- alert-commander flow structure (main.md / cycle.md separation)
- Existing prompt-parameter patterns in this fleet (e.g., `digest-predict`'s `period=` handling)
- Brief § 4.3 (pseudocode, CO_PRODUCERS logic, dedup scheme)
- `docs/data/cowork-schedule.json` structure (reading config values in flow)
- Brief § 2 § F2 (why synchronous wait doesn't work; this is async alternative)
