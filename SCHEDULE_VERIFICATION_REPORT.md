# Schedule Verification Report
Generated: 2026-05-04

**Purpose**: Verify no duplicate/overlapping jobs on same schedule.  
**Status**: ✅ No critical overlaps detected

---

## Schedule Matrix (UTC)

| Time | Agent | Frequency | Action |
|------|-------|-----------|--------|
| **00:30** | 08-Prediction Synthesizer | Weekly (Mon) | OK |
| **01:00** | 01-News Scout | Every 15 min | Market hours only |
| **01:00** | 02-BCTC Collector | Daily | OK - non-overlapping |
| **01:00** | 04-Market Watcher | Every 15 min | Market hours only |
| **02:00** | Unified Coordinator | Daily (checkpoint 1) | OK |
| **02:00** | 03-Report Analyzer | Daily | OK - same time ALLOWED (different function) |
| **02:00–08:30** | 01-News Scout | Every 15 min | MARKET HOURS (continuous) |
| **02:00–08:30** | 04-Market Watcher | Every 15 min | MARKET HOURS (concurrent with News Scout) |
| **02:00–08:30** | 05-Alert Commander | Every 15 min | MARKET HOURS (concurrent, OK) |
| **03:30** | Unified Coordinator | Daily (checkpoint 2) | OK |
| **04:30** | Unified Coordinator | Daily (checkpoint 3) | OK |
| **06:00** | Unified Coordinator | Daily (checkpoint 4) | OK |
| **07:30** | Unified Coordinator | Daily (checkpoint 5) | OK |
| **08:30** | Unified Coordinator | Daily (checkpoint 6) | OK |
| **09:00** | (Off-hours agents start) | Every 4h (News Scout) / Every 2h (Alert) | OK |
| **13:00** | 02-BCTC Collector | Daily | OK |
| **14:00** | 03-Report Analyzer | Daily | OK |
| **15:30** | 06-Digest Writer | Daily | OK |
| **16:00** | 06-Digest Writer | Weekly (Sunday) | OK |
| **20:00** | Unified Coordinator | Daily (evening) | OK |
| **Every 12 min** | 07-QA Responder | Reactive | Triggered by signal, no fixed schedule |

---

## Overlap Analysis

### ✅ CONCURRENT (SAME TIME, ALLOWED)

**02:00–08:30 UTC (Market Hours)**
- 01-News Scout (every 15 min) 
- 04-Market Watcher (every 15 min)
- 05-Alert Commander (every 15 min)

**Reason**: These are complementary:
- News Scout: gathering raw intelligence
- Market Watcher: analyzing price action
- Alert Commander: synthesizing into alerts

**Overlap is INTENTIONAL** — agents in different layers.

---

### ⚠️ NEAR OVERLAP (SAME TIME, DIFFERENT FUNCTION)

**02:00 UTC**
- Unified Coordinator (checkpoint)
- Report Analyzer (daily cycle)

**Status**: ACCEPTABLE — serve different purposes:
- Unified Coordinator: quality review + coordination
- Report Analyzer: BCTC financial deep-dive

No resource conflict.

---

### ✅ NO DUPLICATES

| Potential Duplicate | Status |
|-------------------|--------|
| Two agents doing news analysis | ❌ No (News Scout only) |
| Two agents doing price monitoring | ❌ No (Market Watcher only) |
| Two BCTC collectors | ❌ No (one agent) |
| Two alert dispatchers | ❌ No (Alert Commander only) |
| Two digest writers | ❌ No (one agent) |

---

## Schedule Distribution (Load Balancing)

### High-Frequency Agents (Market Hours)
- **News Scout**: 02:00–08:30 every 15 min = ~27 runs/day (market hours)
- **Market Watcher**: 02:00–08:30 every 15 min = ~27 runs/day (market hours)  
- **Alert Commander**: 02:00–08:30 every 15 min = ~27 runs/day (market hours)

**Load**: 81 agent-runs during market hours (distributed across 6.5 hours = ~12 runs/hour) ✅ BALANCED

### Mid-Frequency Agents
- **Unified Coordinator**: 8x daily + 1 weekly = ~9 runs/week ✅
- **BCTC Collector**: 2x daily = 14 runs/week ✅
- **Report Analyzer**: 2x daily = 14 runs/week ✅
- **Digest Writer**: 1 daily + 1 weekly + monthly + quarterly = ~40 runs/year ✅

### Off-Hours (Reduced Load)
- News Scout: every 4h (6 runs/day vs 27 in market hours)
- Market Watcher: every 4h (6 runs/day vs 27 in market hours)
- Alert Commander: every 2h (12 runs/day vs 27 in market hours)

**Result**: ✅ Off-hours frequency is ~25% of market-hours — prevents alert fatigue

---

## Reactive Agents (No Schedule Conflict)

| Agent | Trigger | Notes |
|-------|---------|-------|
| QA Responder (07) | `askQueueCheck` cron signal every 12 min | Asynchronous, no overlap risk |

---

## Verdict

✅ **NO DUPLICATE JOBS**  
✅ **NO CONFLICTING SCHEDULES**  
✅ **INTENTIONAL CONCURRENT AGENTS** (News Scout + Market Watcher + Alert Commander during market hours)  
✅ **LOAD BALANCED** across day/off-hours  

---

## Model Selection: Claude Haiku

When you set up each agent in Cowork, **always select "Claude Haiku"** as the model:

| Agent | Model | Reason |
|-------|-------|--------|
| 01-News Scout | **Claude Haiku** | News processing, low-complexity tasks |
| 02-BCTC Collector | **Claude Haiku** | Data tracking, straightforward logic |
| 03-Report Analyzer | **Claude Haiku** | Financial analysis (structured BCTC data) |
| 04-Market Watcher | **Claude Haiku** | Price monitoring, pattern detection |
| 05-Alert Commander | **Claude Haiku** | Alert synthesis, routing decisions |
| 06-Digest Writer | **Claude Haiku** | Summaries (complex, but structured templates) |
| 07-QA Responder | **Claude Haiku** | Q&A handling, fact lookup |
| 08-Prediction Synthesizer | **Claude Haiku** | Claims synthesis (structured output) |
| Unified Coordinator | **Claude Haiku** | Coordination, quality review (reasoning-heavy, but short cycles) |

**Cost optimization**: Haiku + frequent small runs = lower token usage than Opus/Sonnet + fewer larger runs.

---

## Configuration Checklist

- [ ] All 9 agents created in Cowork
- [ ] All agents set to **Claude Haiku** model
- [ ] All schedules match COWORK_AGENT_SCHEDULES.md
- [ ] No two agents running the exact same job
- [ ] Verify in Cowork: each agent has unique purpose
- [ ] Test: run one agent, verify execution and WORK channel notification

