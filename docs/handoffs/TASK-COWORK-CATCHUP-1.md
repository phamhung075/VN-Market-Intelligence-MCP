---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-1-domain-module
size: M
zone: scripts/agents-flow/
depends_on: []
blocks: [TASK-COWORK-CATCHUP-2, TASK-COWORK-CATCHUP-3, TASK-COWORK-CATCHUP-4, TASK-COWORK-CATCHUP-5]
---

## TLDR
Create the pure domain module `cowork-catchup-predicate.js` (FR-1) with catch-up-due predicate functions and per-dish-type config skeleton (FR-2). This is the foundation module that all 3 callers (dispatcher, tick-preflight.sh, firer.sh) will depend on. Unit test the predicate module for AC-1/AC-2/AC-3 scenarios.

## [PM] Planning Context
- **Zone:** `scripts/agents-flow/` (pure domain, zero I/O)
- **Key Design:** FR-1 predicate must be pure, ctx-injectable (nowUnix parameter for testing), and NOT call task_list_held (that's infrastructure-layer in FR-3). Mirrors existing `cadence-policy.js` sibling pattern.
- **Acceptance Criteria:**
  - [ ] AC-1: Unit test proves catch-up predicate returns due=true for 07-22-shaped scenario (chef-eod/fb-daily missed windows, within freshness bound, same VN-date)
  - [ ] AC-2: Unit test proves predicate returns due=false + miss-reason="rolled_past_vn_date" when VN-date has rolled past the missed slot's scheduled date
  - [ ] AC-3: Unit test proves per-dish-type freshness bound rejects catch-up once elapsed-since-scheduled exceeds max-lateness, same VN-date
  - [ ] AC-10: tsc passes clean on new module

- **Files to create:**
  - `scripts/agents-flow/cowork-catchup-predicate.js` — three exports:
    - `computeCatchupCandidates(schedule, nowUnix, ctx, { field, dowMatch })` — returns array of {slot_id, dish_type, agent, flow_path, trigger_prompt, guaranteed, scheduled_utc_time, scheduled_key_part, expected_publish_task_id, catchup_eligible, reason}
    - `mostRecentCronFireBefore(cron, nowUnix, { field, dowMatch })` — bounded 8-day lookback, reuses field()/dowMatch() from cowork-match-slots.js export
    - `toVnDateString(unixSeconds)` — Asia/Ho_Chi_Minh YYYY-MM-DD
  - `scripts/agents-flow/cowork-catchup-predicate.test.js` — plain-assert test harness, mirrors cowork-match-slots.test.js conventions

- **Files to modify:**
  - `docs/data/cowork-schedule.json` — add new top-level object:
    ```json
    "_dish_type_catchup_config": {
      "_default": {
        "catchup_max_lateness_minutes": 60,
        "fire_timeout_seconds": 1800
      },
      "morning_dish": {"catchup_max_lateness_minutes": 180, "fire_timeout_seconds": 3000},
      "eod_dish": {"catchup_max_lateness_minutes": 180, "fire_timeout_seconds": 3000},
      "evening_preview": {"catchup_max_lateness_minutes": 360, "fire_timeout_seconds": 3000},
      "daily_predict": {"catchup_max_lateness_minutes": 360, "fire_timeout_seconds": 1800},
      "daily_audit": {"catchup_max_lateness_minutes": 360, "fire_timeout_seconds": 1800},
      "weekly_digest": {"catchup_max_lateness_minutes": 1440, "fire_timeout_seconds": 1800},
      "fb_daily_post": {"catchup_max_lateness_minutes": 120, "fire_timeout_seconds": 2400},
      "fb_weekly_post": {"catchup_max_lateness_minutes": 120, "fire_timeout_seconds": 2400}
    }
    ```
  - Per-slot fields added to `.slots[]`:
    - `"publish_date_basis": "vn_date" | "utc_date" | "iso_week_period" | "vn_date_saturday_anchor"`
    - Values per architect brief §1 brownfield findings:
      - chef-morning/eod/evening, fb-daily = "vn_date"
      - fb-weekend = "vn_date_saturday_anchor"
      - digest-sunday, tran-ngoc-bau = "iso_week_period"
      - digest-daily = "utc_date" (NOT vn_date — mirror existing behavior, don't correct)

- **Knowledge needed:** 
  - Architecture brief §2.1 (domain module design)
  - `docs/standards/dev-standards.md` § DDD golden rule (domain has zero I/O imports)
  - Existing `cowork-match-slots.js:45-83` snap-boundary logic (understand field()/dowMatch() seams)
  - `cadence-policy.js` (sibling-module pattern to mirror)
  - Test pattern in `cowork-match-slots.test.js`

- **Risk flags:**
  - Per-slot `publish_date_basis` must be re-grep-verified against live flow code at implementation time (brief §1 brownfield finding accurate at 2026-07-22 22:06Z, but flows could have drifted)
  - `digest-daily` UTC-date basis is pre-existing quirk, mirrored not corrected in this sprint (changing it risks duplicate-post at VN/UTC day-boundary)

## RETURN (after completion)
- [ ] `cowork-catchup-predicate.js` created with 3 exports, ctx-injectable for testing
- [ ] `cowork-catchup-predicate.test.js` covers AC-1/AC-2/AC-3 scenarios
- [ ] `docs/data/cowork-schedule.json` updated with `_dish_type_catchup_config` + per-slot `publish_date_basis` fields
- [ ] All existing tests stay green (NFR-2)
- [ ] Decision journal entry: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md` § STEP dev-T1
