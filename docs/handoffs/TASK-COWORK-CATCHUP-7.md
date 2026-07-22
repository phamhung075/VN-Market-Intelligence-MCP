---
sprint: COWORK-GUARANTEED-SLOT-CATCHUP
branch: task/cowork-catchup-7-timeout-config
size: S
zone: cross-service/
depends_on: [TASK-COWORK-CATCHUP-1, TASK-COWORK-CATCHUP-5]
blocks: []
---

## TLDR
Tune `fire_timeout_seconds` per `dish_type` in `docs/data/cowork-schedule.json` `_dish_type_catchup_config` (created in TASK-1). Apply architect's recommended starting values (brief §3): 3000s/50min for heavy chef types, 2400s/40min for FB types, 1800s default for light types. Verify no timeout can itself cause freshness-window miss (lowest bound=7200s, all timeouts fit). Document tuning guidance in schema comment.

## [PM] Planning Context
- **Zone:** `cross-service/`
- **Acceptance Criteria:**
  - [ ] AC-6: Architect ruling on FR-8 recorded (raise timeout + accept bounded residual)
  - [ ] AC-10: No regression (config change only)

- **Files to modify:**
  - `docs/data/cowork-schedule.json` `_dish_type_catchup_config`:
    - Set `morning_dish.fire_timeout_seconds = 3000` (50min, chef-morning uses subagents)
    - Set `eod_dish.fire_timeout_seconds = 3000` (50min, chef-eod uses subagents)
    - Set `evening_preview.fire_timeout_seconds = 3000` (50min, chef-evening uses subagents)
    - Set `fb_daily_post.fire_timeout_seconds = 2400` (40min, FB flow subagents)
    - Set `fb_weekly_post.fire_timeout_seconds = 2400` (40min, FB flow subagents)
    - Set `daily_predict.fire_timeout_seconds = 1800` (30min, light flow)
    - Set `daily_audit.fire_timeout_seconds = 1800` (30min, light flow)
    - Set `weekly_digest.fire_timeout_seconds = 1800` (30min, light flow)
    - Set `_default.fire_timeout_seconds = 1800` (30min, conservative for unknown)
    - Add schema comment: "fire_timeout_seconds is the backstop for runaway process reaping (not anti-pileup control). Bounded by lowest catch-up freshness bound (7200s for fb_daily_post) so a raised timeout can never itself cause a freshness-window miss. Instrument one real post-fix run's wall-clock time and tune from telemetry."

- **Knowledge needed:**
  - Architecture brief §3 (FR-8 ruling + accepted residual)
  - Existing cowork-schedule.json structure

## RETURN (after completion)
- [ ] _dish_type_catchup_config timeouts updated with architect-recommended values
- [ ] Schema comment documents tuning guidance
- [ ] No regression (config change only)
- [ ] Decision journal entry: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md § STEP dev-T7
