## Task Report 1901a — investing-calendar FlareSolverr adapter
date: 2026-05-13
outcome: APPROVED (cherry-pick — branch contamination resolved)

## Branch Contamination Finding
Branch `task/investing-calendar-flaresolverr-adapter` had 7 commits unique to it, only 1 in scope:
- `5464b4c0` feat — FlareSolverr adapter (IN SCOPE)
- `42968429` chore — docker-compose FlareSolverr container (IN SCOPE, companion infra)
- `f77bc3aa` merge — contaminated merge that dropped feature files (EXCLUDED)
- `c99df155` ops notebook (EXCLUDED)
- `0a335b72` pm 1899a decompose (EXCLUDED — already on main as `ef21a754`)
- `2c847d8c` worldBank docs (EXCLUDED — already on main as `1370b8c1`)
- `7a12913f` worldBank fix (EXCLUDED — already on main as `9d58a2d1`)

Critical defect: merge commit `f77bc3aa` (5464b4c0 + c99df155) dropped all 3 flaresolverr deliverable files from HEAD:
- `apps/macro-indicators/src/infrastructure/scrapers/flaresolverr_helper.py` MISSING
- `apps/macro-indicators/__tests__/unit/scrapers/flaresolverr-helper.test.ts` MISSING
- `docs/mainserver-crawl-techniques/flaresolverr-bypass.md` MISSING

Recovery: cherry-pick of `5464b4c0` + `42968429` onto main directly.

## Files Changed (cherry-picked)
- `apps/macro-indicators/src/infrastructure/scrapers/flaresolverr_helper.py` NEW (281 lines)
- `apps/macro-indicators/src/infrastructure/scrapers/investing_calendar_fetch.py` REWRITTEN
- `apps/macro-indicators/src/infrastructure/scrapers/investing-economic-calendar.ts` TOUCHED
- `apps/macro-indicators/__tests__/unit/scrapers/flaresolverr-helper.test.ts` NEW (+10 tests)
- `docs/mainserver-crawl-techniques/flaresolverr-bypass.md` NEW
- `docker-compose.yml` — FlareSolverr container block (port 8191 internal, 512MB limit)

## Test Results
- flaresolverr-helper suite: 10 pass / 0 fail (all 10 required green)
- Full macro-indicators suite: 103 pass / 0 fail / 12 skip (115 total)
- Note: dev claimed 105 — actual baseline is 103 (consistent with prior cycles; skip count unchanged)
- TypeScript: 0 production errors | 22 pre-existing test-only Bun Mock<> `preconnect` typing gap

## DDD Compliance: PASS
- `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` = 0 hits
- `grep -rn "from.*infrastructure" apps/macro-indicators/src/domain/` = 0 hits
- New helper correctly placed in infrastructure layer

## Security: PASS
- `cf_clearance` cookie: logged domain + TTL only — raw value never printed
- CLI smoke output: `{k: "[REDACTED]" for k in cookies}` — explicit redaction
- `investing_calendar_fetch.py` result dict: `status/data/fetched_at` only — no cookie values
- No `process.env` in any new file (Python uses argparse/imports, TS uses no env vars)
- No hardcoded credentials or API keys

## Docker-compose
- Adds `flaresolverr` service (ghcr.io/flaresolverr/flaresolverr:latest, port 8191 internal)
- Direct dependency for feature — flagged per checklist, approved as companion infra commit

## Merge Details
- Cherry-pick commits: `5395f966` (feat) + `5ee72b46` (infra/docker)
- Pushed to origin/main
- Branch deleted locally + remote
- Signal moved: `docs/signals/processed/dev-mainserver-crawls-flaresolverr-adapter-2026-05-13T14-09-54Z.json`

## Smoke (post-merge)
Container at port 5004 predates this code — calendar source will remain failed/timeout until ops rebuilds macro-indicators image. Expected behavior; not a blocker.
