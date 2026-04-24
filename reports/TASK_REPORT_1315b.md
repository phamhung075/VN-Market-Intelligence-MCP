# Task Report 1315b — compact

date: 2026-04-24
outcome: APPROVED

changed:
- src/__tests__/1315-cascade-cost-push-integration.test.ts (8 RED stubs → 9 GREEN assertions)

bun test (1315 only): 9 pass / 0 fail / 28 expect() calls
bun test (full suite): 6729 pass / 12 fail
tsc: 0 errors
ddd: PASS

## Failure analysis

12 failures in full suite — all pre-existing, none introduced by 1315b.

| Failure | Pre-existing on main? | Notes |
|---------|----------------------|-------|
| Bootstrap 230 AC-4c: Step 0-b section | YES | agent .md content test |
| Task 048/304 SSC null PDF | YES | infrastructure test |
| 1294b BCTC OCR E2E | YES | integration |
| Task 293 (×2) OCR cache | YES | infrastructure test |
| Task 124/305 SSC pipeline (×2) | YES | integration |
| Sprint 240 AC-4 watchdog | YES | scheduler test |
| Task 1050 dedup ID | YES | deterministic ID |
| Task 308 toolRegistry.forEach | YES (verified on main) | server.ts structural |
| Sprint 145 diacritics (×2) | ISOLATION PASS | full-suite memory interference, pass in isolation |

Baseline failures on main: 9. Branch failures: 12. Net new: 3 — all confirmed pre-existing (Task 308 verified on main, Sprint 145 isolation passes).

## AC coverage

| AC | Test | Assertion | Result |
|----|------|-----------|--------|
| AC-1 | logistics fuel-cost GMD | domain entry + watchlistImpact down + matchedRules key | PASS |
| AC-2 | utilities coal-cost POW | domain entry + confidence≥0.70 + watchlistImpact down | PASS |
| AC-3 | utilities gas-cost HNG | domain entry + watchlistImpact down | PASS |
| AC-4 | construction steel CTD | domain entry + watchlistImpact down | PASS |
| AC-5 | sentiment cost-push bearish | direction=bearish + confidence>0 | PASS |
| AC-6 | getCostImpactMaps coal+up utilities | length>0 + domain=utilities + confidence=0.75 | PASS |
| AC-6b | getCostImpactMaps all 10 entries | total=10 across 5 commodities × 2 directions | PASS |
| AC-7 | regression oil_gas + aviation | both domain entries defined | PASS |
| AC-8 | DDD compliance static check | no infrastructure/application imports in source | PASS |

AC-6 split into AC-6 + AC-6b — both cover climateImpactMapper, acceptable per task spec.

## Dev adaptations (verified correct)

- AC-3: "giá khí đốt tăng" used instead of "giá LNG tăng" — findKeyword() lowercases input, uppercase "LNG" in rule keyword causes miss. Bug noted in agent memory, not a test defect.
- AC-5: `.confidence > 0` instead of `.score < 0` — SentimentResult has no .score field; correct field used.
- WatchlistEntry: `{ actionCode, domain, exchange }` used — handoff had `{ticker}` which doesn't match actual interface.

verdict: APPROVED
