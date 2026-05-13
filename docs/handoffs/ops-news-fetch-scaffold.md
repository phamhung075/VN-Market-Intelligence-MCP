# Ops → Dev-Team: news-fetch Service Scaffold Request

**Date**: 2026-05-13
**From**: ops agent
**Status**: AWAITING SCAFFOLD

## Finding
Infrastructure scan found NO `news-fetch` service in `docker-compose.yml` (current services: mcp-server, pdf-extractor, rag-service, technical-analysis, macro-indicators, stock-price, api-gateway, kinh-dich-service, alert-engine).

## Action Needed
Scaffold a new `news-fetch` service in `docker-compose.yml` with:
- Base: Bun/TypeScript (same as macro-indicators)
- Port: 5008 (corrected per architect brief 2026-05-13 port assignment review; 5007 was wrong)
- Memory: ≥2GB (for Reuters + Bloomberg headless Playwright/Botasaurus)
- Database: market.db (read-only)
- Healthcheck: same pattern as macro-indicators

## Next Step
Once scaffolded, ops will:
1. Verify docker-compose config
2. Bring up the container
3. Run smoke tests
4. Confirm container stats <80% under steady load

## Context
Main-server just added 6 lightweight international macro scrapers. Reuters + Bloomberg (heavy headless sources) require ≥2GB to run Playwright stealth + Botasaurus. news-fetch will host these adapters.

---
**Blocking**: ops-mainserver-fetch cycle awaits this scaffold before proceeding to container sizing.
