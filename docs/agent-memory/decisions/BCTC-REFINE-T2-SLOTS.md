# Decision Journal: BCTC-REFINE-T2-SLOTS

**task-id:** BCTC-REFINE-T2-SLOTS

**timestamp:** 2026-06-27T00:00:00Z

**executor:** ops

## Summary

Added two new daily refine-bctc cowork slots to double drain throughput for BCTC analysis backlog.

## New Slots

### refine-bctc-slot-3
- **slot_id:** refine-bctc-slot-3
- **cron:** 0 11 * * * (11:00 UTC)
- **utc_description:** 11:00 UTC daily (18:00 ICT — off-market, 2h after VN close)
- **vn_description:** 18:00 VN (GMT+7) daily
- **agent:** refine_bctc_md
- **parallel_group:** bctc-refine
- **policy_id:** bctc-offmarket
- **enabled:** true
- **dish_type:** bctc_refine

### refine-bctc-slot-4
- **slot_id:** refine-bctc-slot-4
- **cron:** 30 16 * * * (16:30 UTC)
- **utc_description:** 16:30 UTC daily (23:30 ICT — off-market, deep night VN)
- **vn_description:** 23:30 VN (GMT+7) daily
- **agent:** refine_bctc_md
- **parallel_group:** bctc-refine
- **policy_id:** bctc-offmarket
- **enabled:** true
- **dish_type:** bctc_refine

## Verification

- Both slots mirror the exact JSON structure of refine-bctc-slot-1 and slot-2
- Both are outside OFF-HOSE window (02:00-08:59 UTC)
- No collision with bctc-analyst slots (15:00, 18:00, 21:00, 00:00 UTC)
- No collision with chef-evening (19:45 UTC)
- No collision with tnb-audit (20:13 UTC)
- No collision with digest-daily (17:30 UTC)
- Commit: 19764c0e
- File: docs/data/cowork-schedule.json

## Impact

Doubles drain throughput from 2 daily slots to 4 daily slots, addressing BCTC-REFINE-STALL-RETRIGGER backlog.
