---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T5-COWORK-SCHEDULE-CONFIG
size: S
zone: docs/data/
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T4]
---

## TLDR
Extend `docs/data/cowork-schedule.json` to add two fields on the `alert-commander-critical` and `alert-commander-market` slot entries: `producer_settle_wait_seconds` (1200s/20min, tunable config, not hardcoded) and `depends_on` annotation (doc-only, no code reads it; just documents the producer/consumer relationship and timing constraint).

## [PM] Planning Context

**Zone:** `docs/data/` (configuration only, no code change)

**Acceptance Criteria:**
- [ ] `docs/data/cowork-schedule.json` entries for `alert-commander-critical` and `alert-commander-market` (both `parallel_group: "alerts"`) now have:
  - `producer_settle_wait_seconds: 1200` (20 minutes, with margin over observed worst case 17min from 2026-07-21 incident)
  - `depends_on: "gatherers @ same cron tick (...) — producer signals may post up to ~20min after this slot's dispatch; see producer_settle_wait_seconds + DESIGN-COWORK-FANOUT..."`
- [ ] No other changes to schedule structure (backward-compatible addition)
- [ ] Value chosen per brief § 4.4 rationale: 1200s is a starting point to tune from telemetry, not asserted as precisely correct

**Rationale:**
- Implements brief § 4.4: "Schedule data — config, not hardcoded literal"
- Grounds the 20-min bounded recheck window in queryable config (not magic numbers in flow files or test fixtures)
- `depends_on` is doc-only annotation (like the existing entries `chef-eod.depends_on` and `fb-daily.depends_on`), confirming this is real prior art for producer→consumer scheduling constraints
- Allows future tuning: if actual producer settlement time drifts, adjust 1200 in schedule, not in 3+ flow files

**Files to read first:**
- `docs/data/cowork-schedule.json` (current structure, existing `depends_on` entries for chef-eod / fb-daily as prior art)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § 4.4 (design rationale, 1200s value justification)

**Files to modify:**
- `docs/data/cowork-schedule.json` (add two fields to `alert-commander-critical` and `alert-commander-market` entries)

**Files to create:**
- None

**Dependencies:**
- None (independent of T1-T4, T6)
- Blocks T4 (T4 reads `producer_settle_wait_seconds` from schedule)
- Docs/annotation only; does not block T3

**Knowledge needed:**
- JSON structure of `docs/data/cowork-schedule.json`
- Brief § 4.4 (rationale, 1200s value, prior art from chef-eod/fb-daily)
