---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T5-COWORK-SCHEDULE-CONFIG
type: TASK
size: S
zone: docs/data/
priority: P1
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC]
order: tier1b-parallel
---

## TLDR

cowork-schedule.json currently documents producer/consumer dependencies using `depends_on` free-text annotations, but the wait time for a recheck is hard-coded in alert-commander. Extract the wait time into a queryable config field `producer_settle_wait_seconds` on alert slots, starting with a conservative 1200s (20min) based on observed worst-case ~17min producer runtime. Document the rationale and make it tunable for future refinement.

## [PM] Planning Context

**Zone:** docs/data/

**Root Cause (Brief §4.4, §F2):** A bounded asynchronous recheck (T4) needs to know how long to wait before re-reading the signal bus. The observed worst case for market-watcher to post price_anomaly signals after dispatch was ~17 minutes. Hard-coding the wait time in T4 (alert-commander code) violates the principle of config-not-code. The wait should live in cowork-schedule.json (already the SSOT for all slot-level configuration), be queryable at runtime, and be tunable without code redeploy.

**Acceptance Criteria:**
- [ ] cowork-schedule.json entries for `alert-commander-critical` and `alert-commander-market` (both `parallel_group: "alerts"`) gain two new fields:
  - `producer_settle_wait_seconds`: 1200 (20 minutes, measured worst case + margin)
  - `depends_on`: narrative annotation (can be multi-line string) describing which producer slots may be co-dispatched and why the wait is needed
- [ ] Example from brief §4.4:
  ```json
  "producer_settle_wait_seconds": 1200,
  "depends_on": "gatherers @ same cron tick (news-scout-offhours, market-watcher-offhours) — producer signals may post up to ~20min after this slot's own dispatch (observed 2026-07-21: 17min); see producer_settle_wait_seconds + DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING bounded recheck"
  ```
- [ ] Schema validation (if any) must allow the new fields and treat them as optional/queryable
- [ ] Commit message includes: `AC: T5 — cowork-schedule.json producer_settle_wait_seconds config`

**Files to read first:**
- `docs/data/cowork-schedule.json` (full structure, current F1 entry with depends_on, understand schema)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:119-127` (§4.4: design, example JSON, rationale)
- `docs/agents/cowork-team/flow/last-fired.md:1-20` (understand the tick boundary and multi-minute producer runtime)

**Files to modify:**
- `docs/data/cowork-schedule.json`: find `alert-commander-critical` and `alert-commander-market` entries, add two fields each

**Files to create:** none

**Dependencies:** none initially — but T4 (alert-commander) will read this config at runtime.

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§4.4)
- cowork-schedule.json schema (understand field requirements if any)

**Why parallel with T6:** T5 is independent of the market-watcher slot routing fix (T6). Both can start immediately. T5 must complete before T4 (alert-commander) can run (T4 reads this config).

---

## Implementation Notes

- 1200 seconds (20 minutes) is a starting point, not asserted as precisely correct. It is chosen with margin over the one measured worst case (17 min on 2026-07-21T16:00Z tick).
- The field name `producer_settle_wait_seconds` is a query-friendly name that T4's code will use: `$SCHEDULE_ENTRY.producer_settle_wait_seconds`.
- The `depends_on` field already exists in the schema (F1 in brief: currently used by chef-eod and fb-daily, currently free-text/documentation-only). Extend the same pattern.
- Future tuning: if observing that the wait time is often exceeded (recheck still finds nothing) or frequently wasted (producer always ready early), update this value in cowork-schedule.json. No code change to T4 required.

---

## Backward Compatibility

- The new fields are additions to schedule entries. Existing code that ignores them is unaffected.
- Only T4 (alert-commander) will read `producer_settle_wait_seconds` at schedule_task call time.
- No impact on existing slot firing, cron schedules, or dispatcher logic.

---

## Tier Sequencing

- **Tier 1b:** Parallel with T6 (both can start immediately)
- **Blocks:** T4 (alert-commander recheck logic) depends on this for runtime config
