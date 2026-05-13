# dev-api-gateway — Notebook

Zone: `apps/api-gateway/` | Stack: TS/Bun | DB: none

## Working Memory

**Last task:** 1899a-gateway (2026-05-13) — Sprint c80

**Status:** DONE

**What changed:**
- Wired news-fetch (port 5008) into gateway: serviceUrls, buildServiceConfigs, DASHBOARD_SERVICES
- docker-compose.yml: new news-fetch service block (2.5g limit, 2g reservation, 30s start_period); NEWS_URL added to api-gateway env
- Corrected ops-news-fetch-scaffold.md port 5007 → 5008
- Updated ARCHITECTURE.md services table + monorepo tree (9→10 services)
- Fixed 3 tests hardcoding count=8 → 9 and old service names list

**Test suite:** 40 pass / 0 fail | tsc: 0 errors

**Pattern note:** When adding a new service to gateway, 4 touch points: index.ts serviceUrls, health_checker.ts buildServiceConfigs, handlers.ts DASHBOARD_SERVICES, docker-compose.yml (service block + api-gateway env). Tests in static-service-registry.test.ts and aggregate-health-usecase.test.ts hardcode service count — update them each time.

**Next:** QA on branch task/1899a-gateway-wiring
