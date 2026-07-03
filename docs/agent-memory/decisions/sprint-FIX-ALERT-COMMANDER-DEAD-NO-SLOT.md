---
task_id: FIX-ALERT-COMMANDER-DEAD-NO-SLOT
severity: HIGH
component: cowork-team/alert-commander
date: 2026-07-03
decision_owner: cowork-refactory-expert
---

# Decision Journal: FIX-ALERT-COMMANDER-DEAD-NO-SLOT

## Problem Statement
alert-commander is declared a "scheduled" cowork agent (docs/agents/cowork-team/flow/main.md:9) but has ZERO slots in docs/data/cowork-schedule.json. It has not run since approximately 2026-05-25. This breaks the CRITICAL-always override mechanism (legal_risk, verified_chain, crisis_velocity) that is supposed to surface market-moving legal/regulatory events in real-time. Example: PNJ prosecution event (legal_risk conf0.95) routed to alert-commander 3× on 2026-07-03 → surfaced nothing because agent was dead.

## Root Cause
- Incomplete slot definition when alert-commander was added to scheduled agents
- No detection mechanism to alert on missing slots for scheduled agents
- Intended cadence not documented in cowork-schedule.json metadata

## Decision: RESURRECT with dual-slot model

### Slot 1: alert-commander-market
**Purpose:** Catch position-danger and watchlist-opportunity events during market hours.
**Cron:** `*/15 2-8 * * 1-5` (every 15 min, 02:00-08:59 UTC Mon-Fri = 09:00-15:59 VN market hours)
**Cadence:** 15 minutes
**Guaranteed:** false (event-driven, silent exit if no condition fires)
**Policy:** alert-commander-market
**Rationale:** Alert-policy.md:50 specifies `*/15 2-8 * * 1-5` as the evaluation window for position-danger and watchlist-opportunity. Base gates are all-condition (AND logic), so silent exits are normal and correct.

### Slot 2: alert-commander-critical
**Purpose:** Catch CRITICAL-always events (legal_risk, verified_chain, crisis_velocity) 24/7 including off-hours.
**Cron:** `0 */4 * * *` (every 4 hours, 00:00/04:00/08:00/12:00/16:00/20:00 UTC)
**Cadence:** 240 minutes (4 hours)
**Guaranteed:** false (event-driven)
**Policy:** alert-commander-critical
**Rationale:** PNJ prosecution (legal_risk, verified_chain) fired off-hours (22:50 UTC = 05:50 VN next day, before market open). Cycle.md:17 specifies CRITICAL events always fire regardless of time-of-day gate. Every-4-hours cadence matches pattern of news-scout-offhours and market-watcher-offhours, providing 24/7 coverage with reasonable spacing.

## System-Map Update
Line 1312 in docs/data/system-map.json currently says:
```
"alert-commander": "Event-only — position-danger (3-condition) or watchlist-opportunity (4-condition) ONLY. ≤140 chars. Silent exit otherwise."
```

Updated to reflect CRITICAL-always override:
```
"alert-commander": "Event-only — position-danger (3-condition), watchlist-opportunity (4-condition), or verified_chain/legal_risk/crisis_velocity (CRITICAL always, no conditions). ≤140 chars. Silent exit if none fire."
```

## Verification
- cowork-schedule.json valid JSON after edits
- Both new slots appear in `jq '.slots[]|select(.slot_id|test("alert"))'` query
- system-map.json accurately reflects alert-commander's CRITICAL-always scope
- last_fired sentinel set to 2026-05-25T00:00:00Z (past date, triggers on next matching tick)

## Affected Files
- docs/data/cowork-schedule.json (add 2 slots)
- docs/data/system-map.json (update sender_rules text for alert-commander)
- docs/agent-memory/decisions/sprint-FIX-ALERT-COMMANDER-DEAD-NO-SLOT.md (this file)
