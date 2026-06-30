# PM Decision Journal — TASK-MACRO-COMMODITY-DELTA

**Date:** 2026-06-24T00:00:00Z  
**Agent:** pm  
**Task ID:** TASK-MACRO-COMMODITY-DELTA  
**Sprint:** S2-DATA-HONESTY

---

## Decision Summary

Promoted TASK-MACRO-COMMODITY-DELTA from backlog → TODO in ready lane. Assigned owner `dev-macro-indicators`. Handoff created at `docs/handoffs/TASK-MACRO-COMMODITY-DELTA.md` per PM flow requirements.

**Board mutation:**
- **Before:** ready=[FIX-MACRO-SNAPSHOT-DELTAS-NULL], in_progress=[FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION], review=[ARCH-SHIP-WAVE-REAUDIT], qa=[]
- **After:** ready=[FIX-MACRO-SNAPSHOT-DELTAS-NULL, TASK-MACRO-COMMODITY-DELTA], in_progress=[FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION], review=[ARCH-SHIP-WAVE-REAUDIT], qa=[]

**WIP capacity check:**
- in_progress=1 (FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, status DECOMPOSED — parent that was atomized, no longer actively held by a developer)
- review=1 (ARCH-SHIP-WAVE-REAUDIT, status PARKED)
- WIP total = 2 (at capacity ceiling, compliant with WIP ≤ 2 rule)
- TASK-MACRO-COMMODITY-DELTA ready to dispatch (developer picks up from ready lane)

---

## Context & Rationale

**Input:** Architect design complete (docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md § [Architect] section). All design questions Q1-Q4 resolved:
- Q1 (lookback boundary): 18h rolling window confirmed
- Q2 (SBV-override conflict): same-source-only (suppress usdVnd delta when SBV fires)
- Q3 (prevFetchedAt precision): raw `*string` ISO8601 UTC in DTO
- Q4 (table ownership): safe-degrade sufficient (no own write path needed)

**Atomization rationale:** Single task, single zone (apps/macro-indicators/), single team (dev-macro-indicators), 7 files within single service, no shared SSOT touched, no file conflicts, no inter-team dependencies. Size M (~4h estimate: domain port, infra adapter+tests, app layer+tests, composition root, test updates).

**Design frozen:** No deviations from architect's technical design (§ Technical Design § File Map). All risks (RISK-1..5) documented in handoff. All test cases (T-HIST-1..7, T-DELTA-1..7) specified.

---

## What Was Considered

**Single vs multi-task split:** Architect output did not atomize further (all 7 files within same zone, single 4h effort, no wait-dependency). Splitting would create false granularity and intra-sprint waiting. Single task is correct per PM rule: "single file/fn group | clear AC | ~2h agent work" — this is single zone (apps/macro-indicators/).

**Ownership assignment:** dev-macro-indicators is the only team with Go macro-service ownership. Unambiguous. No PO negotiation needed.

**WIP capacity:** Current active WIP = 2 (in_progress + review lanes). TASK-MACRO-COMMODITY-DELTA is ready to be picked up, compliant with WIP ≤ 2 policy. Next developer to finish a task will pick this up from ready lane.

**Handoff completeness:** All sections per flow template (§ PM Planning Context, § Acceptance Criteria, § Files to read/create/modify, § Dependencies, § Knowledge needed, § DoD checklist, § Resources, § Implementation Detail from Architect). BA spec and Architect design fully inlined for developer reference.

---

## Why This Change

Only path: architect design is complete and ratified. PM's job is to atomize and board-update (per PM role statement: "Never implement directly. Always delegate."). No blocker; WIP capacity available; design frozen. Promotion to ready → developer picks up from queue.

---

## Verification Gates (none required at promotion, dev-time verification below)

**AC-1..AC-7 (developer verifies during coding, live gates not build-green):**
- AC-1: delta non-null on live tool call (oilUsdDelta, goldUsdDelta)
- AC-2: direction is one of up/down/flat (not unknown)
- AC-3: null returned when no prior > 18h old (honesty)
- AC-4: prevFetchedAt matches commodity_prices_history.fetched_at
- AC-5: fixture-current (oilLive=false) blocks delta computation
- AC-6: table-absent safe-degrade (no 500, no panic)
- AC-7: is_estimate flag precision (true for >36h old prior)

**RISK verification:**
- RISK-1 (RFC3339Nano): test T-HIST-7 confirms ms-precision parse
- RISK-2 (FetchedAt type): prevFetchedAt uses `*string` not `*time.Time`
- RISK-3 (fixture-current gate): test T-DELTA-2 confirms nil/unknown when live=false
- RISK-4 (SBV usdVnd): test T-DELTA-3 confirms delta nil when override fires
- RISK-5 (COMMODITY_LIVE_MODE): history port independent, safe-degrade covers it

---

## Key PM Decisions

1. **No renegotiation with architect:** Design locked, questions resolved, no changes to FR-1..6 or design-questions Q1..4. PM accepted as-written.
2. **Single task promotion:** No further atomization. Single zone, single team, 7 files = one 4h task. Correct granularity.
3. **Owner assignment:** dev-macro-indicators unambiguous. No SSOT file touched (no multi-zone conflict). Only route.
4. **Handoff template completeness:** All PM planning sections filled per flow. Developer has full context: BA spec, architect design, brownfield confirmation (Go 1.24, modernc.org/sqlite, DDD fences), test patterns, risk flags.
5. **Live verification gates:** AC-1..AC-7 + RISK verification gates listed in handoff; developer responsible for DoD checklist (not green build — live named-vol DB queries required for AC-1..4, AC-6).
6. **Follow-on:** Once dev-macro-indicators completes this task and ops rebuilds macro-indicators service, the implemented deltas will be live. No separate backfill or migration. Service reads from commodity_prices_history (already populated by commodityTrackerRefreshJob).

---

## Decision Confidence

**High.** Architect design is complete, all open questions resolved, WIP capacity available, atomization is clear, handoff is complete. Only path forward is dev implementation.
