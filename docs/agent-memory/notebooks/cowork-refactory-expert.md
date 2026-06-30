# Cowork Refactory Expert — Notebook

**Last updated:** 2026-06-30T17:45:00Z | **Sprint:** FB-POSTER-LAUNCHD-FIRER

## Current session (FIX-FB-WEEKEND-DEDUP-GATE)

**Task:** FIX-FB-WEEKEND-DEDUP-GATE — Add period-keyed publish-once dedup gate to FB weekend sub-flows.

**What was done:**
1. Added STEP 0a dedup gate to `docs/agents/fb-market-poster/flow/weekly-recap.md` — claims period-keyed task with `published:fb-weekend:<PERIOD_SAT>` (Saturday-date key; both Sat/Sun share it).
2. Added identical STEP 0a dedup gate to `docs/agents/fb-market-poster/flow/weekly-prediction.md` — same period key scheme.
3. Updated `docs/agents/fb-market-poster/flow/main.md`:
   - Fixed stale time: 13:07 UTC → 13:13 UTC (both slots)
   - Clarified Weekend note: period-keyed gate now EXISTS (was previously claimed but unimplemented)
4. Updated board row: FIX-FB-WEEKEND-DEDUP-GATE status BACKLOG → REVIEW (via orch-apply.sh)

**Key design decision — PERIOD KEY SCHEME:**
- Namespace: `published:fb-weekend:<PERIOD_SAT>` (mirrors daily `published:fb-daily:<VN-DATE>`)
- Period key: Saturday date of the weekend (YYYY-MM-DD)
- Both Saturday and Sunday of the same weekend use the SAME Saturday key
- Derivation in each sub-flow: if VN_DOW==0 (Sunday), PERIOD_SAT = VN_DATE - 1 day; else PERIOD_SAT = VN_DATE
- Result: both weekend firers (launchd OR cowork */15) hitting the same weekend will get claimed:true on first fire, claimed:false on second → no double-post across Sat/Sun

**Why PERIOD_SAT (Saturday-date key) vs ISO week or date-range:**
- Simplest to compute in bash (no complex date arithmetic for week numbers)
- Consistent with daily scheme namespace and kind/ttl (both cowork-slot, ttl=100800)
- PERIOD_SAT naturally partitions weekends (each weekend gets a unique key; different weekends don't collide)
- Both sub-flows can derive the same key independently without coordination

**Placement strategy — STEP 0a at top of BOTH sub-flows:**
- Moved gate BEFORE MODE ROUTER would reach it (MODE ROUTER is in main.md; gate runs in sub-flows at STEP 0a before any other work)
- No modification to main.md MODE ROUTER logic (cleaner: sub-flows are responsible for their own dedup)
- Ensures gate runs regardless of which sub-flow is invoked (Saturday or Sunday)

**Blocking status:** FIX-FB-WEEKEND-DEDUP-GATE is a hard prerequisite for FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP (weekend double-post guard demonstration); fb-daily firer can ship independently (daily dedup already exists in main.md STEP 0a).

## Last session summary

None prior to this session.

## Known patterns / preferences

- Period-keyed dedup for weekend slots requires same-key strategy across Sat/Sun to prevent within-week double-post.
- Cowork flow .md rewrites (non-dev-team) route via cowork-refactory-expert to avoid po-S109 dead-route collision.
