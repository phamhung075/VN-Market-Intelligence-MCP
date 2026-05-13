## Task Report macro-external-allsettled-timeout
date: 2026-05-13
outcome: APPROVED

changed: [
  apps/macro-indicators/__tests__/unit/fetch-external-macro.test.ts (new, 381 lines),
  apps/macro-indicators/__tests__/unit/scrapers/investing-economic-calendar.test.ts (updated, envelope shape migration),
  apps/macro-indicators/src/application/fetch-external-macro.ts (rewritten, 209 lines),
  apps/macro-indicators/src/interface/handlers.ts (updated, HTTP 200/502 split)
]
tests: 85 pass / 0 fail | tsc: 37 errors (all pre-existing global.fetch preconnect Bun Mock<> typing gap — identical to main baseline) | ddd: PASS | security: PASS

### DDD Note
Previous DDD violation (qa notebook 2026-05-13 signal-1: DEFAULT_SYMBOLS/DEFAULT_CNBC_SYMBOLS imported from infrastructure/scrapers/) is FIXED on this branch. Both constants now live in apps/macro-indicators/src/domain/defaults.ts. Zero infra imports in application layer confirmed.

### Contract Verification
- All 6 sources return via withTimeout wrapper — no source can block others: PASS
- Per-source envelope shape { status, data?, error?, latencyMs }: PASS (fetch-external-macro.ts:60-65)
- Aggregate envelope { sources, fetchedAt, summary: { ok, failed, totalLatencyMs } }: PASS (fetch-external-macro.ts:82-86)
- Handler returns 502 only when summary.ok === 0: PASS (handlers.ts:41-44)
- execute() never throws: PASS (11 tests covering all-ok, one-fail, one-timeout, all-fail)

### Smoke Test
curl POST localhost:5004/macro/external → HTTP 200 in 8.0s
envelope: ok=1 (calendar), failed=5 (4 scrapers timeout geo-blocked + FRED 500s)
summary.ok >= 1 → HTTP 200: PASS

### Follow-up Signal
docs/signals/qa-bug-macro-scrapers-slow-2026-05-13T11-05-10Z.json
4 scrapers timing out at 8s — likely geo-blocking from non-VN Docker host.
Non-blocking. Routed to ops for VPS proxy verification + developer for budget review.

### Merge Status
Merge SHA: 1c6a7a01 (--no-ff). Branch task/macro-external-allsettled-timeout deleted locally. Remote branch did not exist. Pushed to origin/main.
