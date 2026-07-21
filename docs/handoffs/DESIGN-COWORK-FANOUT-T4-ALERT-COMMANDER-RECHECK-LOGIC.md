---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC
type: TASK
size: M
priority: P1
zone: docs/agents/alert-commander/
depends_on: [DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION, DESIGN-COWORK-FANOUT-T3-ALERT-COMMANDER-SCHEDULE-TASK-GRANT]
blocks: [DESIGN-COWORK-FANOUT-T8-QA-TEST-STRATEGY]
order: tier2b-after-t2-t3
---

## TLDR

alert-commander's main.md must parse two new prompt parameters (`slot=<slot_id>` and `recheck=true`). cycle.md's Firing Gate (the point where it decides to exit silently with no MARKET write) must add a branch that, when the bus is genuinely empty AND co-dispatched producers are known to be in flight AND this is not already a recheck cycle, calls `schedule_task` to queue exactly one bounded recheck ~20min later. The recheck cycle is a completely ordinary alert-commander run — if the producer has posted by then, the existing Firing Gate fires normally; if not, it exits silently again with no further chaining.

## [PM] Planning Context

**Zone:** docs/agents/alert-commander/

**Root Cause (Brief §4.3):** The incident on 2026-07-21T16:00Z: dispatcher sent all four slots (news-scout, market-watcher-offhours, market-watcher-eod, alert-commander-critical) as one parallel wave. alert-commander ran ~16:10-16:15Z, read the bus (which was genuinely empty at that time), and exited silently per its own contract. market-watcher-offhours then posted price_anomaly signals at ~16:17Z (after alert-commander had already exited). The dispatch order alone made alert-commander blind to a real session with GAS −6.98%, BSR −6.49%, GEX −5.16% moves.

Solution (Brief §4.3): Parse the `slot=` parameter (already sent by dispatcher but currently discarded). In the Firing Gate's silent-exit branch, check if co-dispatched producer slots are known (via `$CYCLE_SNAPSHOT.won_slots` from T2) and if so, call schedule_task to queue one recheck. This is a real discriminator — it only fires when CO_PRODUCERS is non-empty (no co-dispatch = no recheck, zero added cost) and when IS_RECHECK != true (the recheck cycle is a leaf, no chaining).

**Acceptance Criteria:**
- [ ] main.md Step 0 or Step -1 parses prompt parameters into environment variables:
  - `$SLOT_ID`: extracted from prompt `slot=<slot_id>` parameter (e.g., "alert-commander-critical")
  - `$IS_RECHECK`: true only if prompt carries `recheck=true`, false/empty otherwise
  - `$ORIGIN_TICK`: echoed back from the scheduled prompt (e.g., "16:00")
  - (Same parsing pattern already used elsewhere in fleet for `period=` handling, e.g., digest-predict)
- [ ] cycle.md Firing Gate section (the "silent exit" branch, where today it says "EXIT silently — no MARKET write") adds logic:
  ```
  if [ -n "$CO_PRODUCERS" ] && [ "$IS_RECHECK" != "true" ]; then
    schedule_task(
      delay_seconds: $PRODUCER_SETTLE_WAIT_SECONDS (from T5 config),
      agent: "alert-commander",
      intent: "signal_bus_recheck",
      prompt: "run docs/agents/alert-commander/flow/main.md  slot=<SLOT_ID>  recheck=true  origin_tick=<ORIGIN_TICK>",
      deadline_at: now + WAIT + 900s (15min grace),
      dedup_key: "alert-recheck:<SLOT_ID>:<ORIGIN_TICK>",
      reason: "co-dispatched producer(s) in flight — DESIGN-COWORK-FANOUT bounded recheck"
    )
  fi
  ```
  where `CO_PRODUCERS` is derived from `$CYCLE_SNAPSHOT.won_slots` filtered by `parallel_group == "gatherers"`
- [ ] No special-cased evaluation logic in the recheck cycle itself — it runs as a completely ordinary alert-commander cycle. If producer has posted, Firing Gate fires normally; if not, it exits silently again with no further chaining.
- [ ] No double-fire risk: alert-commander's `alertCooldownMinutes: 0` and "Internal Cooldown Rules — never suppress" policy already mean it fires multiple independent alerts per day. The recheck evaluating a signal the first cycle never saw is exactly that normal case.
- [ ] Commit message includes: `AC: T4 — alert-commander recheck guard + slot parameter parsing`

**Files to read first:**
- `docs/agents/alert-commander/flow/main.md:1-30` (Step -1 or Step 0, understand current structure, add parameter parsing)
- `docs/agents/alert-commander/flow/cycle.md:1-150` (Firing Gate section: locate silent-exit branch, understand when it fires, add recheck logic)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:88-116` (§4.3: full design, pseudocode, discriminators, no-double-fire rationale)
- `docs/data/cowork-schedule.json` (understand `producer_settle_wait_seconds` field that T5 adds — look up alert-commander-critical entry)
- `.claude/skills/cycle-bootstrap/SKILL.md:1-30` (understand how to read `$CYCLE_SNAPSHOT.won_slots` that T2 extracts)
- `docs/policies/alert-policy.md` (understand "Internal Cooldown Rules — never suppress", confirm no double-fire concern)

**Files to modify:**
- `docs/agents/alert-commander/flow/main.md:1-20` (add parameter parsing for slot=, recheck=, origin_tick=)
- `docs/agents/alert-commander/flow/cycle.md:80-120` (Firing Gate: add recheck guard branch when exiting silently with co-producers in flight)

**Files to create:** none (modify existing flows)

**Dependencies:** T2 (to read `$CYCLE_SNAPSHOT.won_slots`), T3 (to call `schedule_task` at runtime).

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§4.3, §4.4, entire design rationale)
- alert-commander flow structure (Firing Gate logic)
- mcp__gateway__call_tool pattern (call schedule_task through gateway)

**Why Tier 2b, after T2 and T3:** T4 depends on T2 (reads co-dispatch info) and T3 (can call schedule_task). T4 is blocked until both are complete.

---

## Implementation Notes

- Parameter parsing: same pattern used elsewhere. Example from digest-predict: `period=$(echo "$PROMPT" | grep -oP 'period=\K[^ ]+')`
- Schedule_task call: use the mcp__gateway__call_tool pattern (NEVER direct mcp__vn-market__ — see CLAUDE.md constraint on gateway). Signature: `mcp__gateway__call_tool(server="vn-market", tool="schedule_task", arguments={delay_seconds, agent, intent, prompt, deadline_at, dedup_key, reason, max_attempts})`
- `$PRODUCER_SETTLE_WAIT_SECONDS`: read from cowork-schedule.json at runtime (either embedded in a config file read or use the MCP tool `get_cowork_schedule` if it exists). Brief §4.4 shows it lives in `alert-commander-critical` and `alert-commander-market` entries as 1200.
- CO_PRODUCERS derivation: filter won_slots by parallel_group="gatherers". Example jq: `CO_PRODUCERS=$(echo "$CYCLE_SNAPSHOT" | jq '.won_slots | map(select(.parallel_group == "gatherers")) | length')`
- Dedup_key pattern: ensures one recheck per (slot, tick) pair, preventing runaway retries if schedule_task itself is called multiple times in the same cycle.
- Deadline (WAIT + 900s grace): allows the recheck cycle to complete and post its findings up to 15min after the wait expires. If it's delayed or slow, the deadline is forgiving; if it runs late, it's still valid and useful.

---

## Test Coverage (from Brief §7)

- **T-3:** alert-commander cycle: empty bus + `CO_PRODUCERS` non-empty + `IS_RECHECK` unset → exactly one `schedule_task` call, correct dedup_key/delay_seconds/prompt
- **T-4:** alert-commander cycle: empty bus + `CO_PRODUCERS` empty (no co-dispatch this tick) → zero `schedule_task` calls (regression: common quiet case must stay cost-free)
- **T-5:** alert-commander cycle: `IS_RECHECK == true` + still-empty bus → zero further schedule_task calls (bounding — no chain)
- **T-6:** alert-commander cycle: recheck fires and the producer HAS posted by then → normal Firing Gate evaluates and fires MARKET as usual, no special-cased path
- QA will validate all four in tier-4 T8 test suite.

---

## Tier Sequencing

- **Tier 2b:** After T2 (needs won_slots) and T3 (needs schedule_task permission)
- **Blocks:** T8 (QA test suite) depends on this implementation being complete
