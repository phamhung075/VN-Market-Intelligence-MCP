## Task Report 1900b-worldbank
date: 2026-05-13
outcome: APPROVED

changed:
- apps/macro-indicators/src/infrastructure/scrapers/world-bank-macro.ts — sleepMs removed, fetchVnMacroBatch rewritten as Promise.all fan-out
- apps/macro-indicators/__tests__/unit/scrapers/world-bank-macro.test.ts — +3 new parallel batch tests (all-ok, one-fail-isolated, concurrent timing)
- docs/architecture/microservice/macro-indicators/infrastructure.md — updated
- docs/architecture/microservice/macro-indicators/testing.md — updated

tests: 93 pass / 0 fail / 12 skip (105 total) | tsc: 22 errors (pre-existing Bun mock preconnect gap, same baseline as main) | ddd: PASS | security: PASS

bonus: fetch-external-macro.ts worldBank: 8_000ms budget confirmed. WB now lands ~2-3s, well under budget.

commits on main: 9d58a2d1 + 1370b8c1 (cherry-picked from task/worldbank-parallelize-fetch-vn-macro-batch)

verdict: APPROVED
