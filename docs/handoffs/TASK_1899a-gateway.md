# TASK 1899a-gateway — Gateway Wiring & Docker Compose

**Sprint:** 1899a | **Branch:** `task/1899a-gateway-wiring` | **Size:** M | **Zone:** multi (api-gateway + root)

---

## TLDR

Wire news-fetch into API gateway (3 file edits: index.ts, health_checker.ts, handlers.ts) + add service to docker-compose.yml. Update ops handoff port (5007 → 5008). Update ARCHITECTURE.md with service row.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §10: Gateway Routing Config Diff — 4 changes (serviceUrls, health_checker, DASHBOARD_SERVICES, env)
- §1: Port Assignment — corrected 5008 (was 5007 in ops handoff)
- §9: RAM Budget — 2 GB reserved, 2.5 GB limit

**Service Summary:**
- Port: 5008 (internal docker network)
- Healthcheck: GET /health → `{ status: "ok", service: "news-fetch", port: 5008 }`
- Database: market.db read-only (no writes)
- Startup: 30s grace period (Playwright image large)

**Files to Modify:**

| File | Location | Changes |
|------|----------|---------|
| `docker-compose.yml` | root | Add news-fetch service block (§10 spec) |
| `apps/api-gateway/src/index.ts` | serviceUrls | Add `news: 'http://news-fetch:5008'` |
| `apps/api-gateway/src/infrastructure/health_checker.ts` | buildServiceConfigs | Add news config (baseUrl, healthPath) |
| `apps/api-gateway/src/interface/handlers.ts` | DASHBOARD_SERVICES | Add `'news'` string to array |
| `docs/handoffs/ops-news-fetch-scaffold.md` | (existing) | Update port 5007 → 5008 |
| `docs/ARCHITECTURE.md` | Services table | Add news-fetch row (port 5008, TS/Bun, status ✅) |

**Dependencies:** Depends on 1899a-routes (HTTP service ready).

**Knowledge Needed:**
- Brief §10 (gateway config diff)
- Brief §8 (docker-compose env + healthcheck)
- Existing docker-compose.yml structure (compare with macro-indicators, alert-engine)

---

## Acceptance Criteria

- [ ] **docker-compose.yml updated**:
  - Add `news-fetch` service block after `alert-engine`:
    ```yaml
    news-fetch:
      build:
        context: apps/news-fetch
        dockerfile: Dockerfile
      ports:
        - "5008:5008"
      volumes:
        - market_data:/app/data:ro
      environment:
        - PORT=5008
        - DB_PATH=/app/data/market.db
        - DB_READONLY=true
      restart: unless-stopped
      healthcheck:
        test: ["CMD", "wget", "-qO-", "http://localhost:5008/health"]
        interval: 30s
        timeout: 10s
        retries: 3
        start_period: 30s
      deploy:
        resources:
          limits:
            memory: 2.5g
            cpus: '1.0'
          reservations:
            memory: 2g
            cpus: '0.5'
    ```

- [ ] **apps/api-gateway/src/index.ts updated**:
  - Locate `serviceUrls` object (top of file, environment block)
  - Add line: `news: process.env['NEWS_URL'] ?? 'http://news-fetch:5008',`
  - Verify spacing/alignment matches surrounding entries

- [ ] **apps/api-gateway/src/infrastructure/health_checker.ts updated**:
  - Locate `buildServiceConfigs()` function
  - Add news config entry:
    ```typescript
    news: {
      name: 'news',
      baseUrl: urls['news'] ?? 'http://news-fetch:5008',
      healthPath: '/health',
      timeoutMs: timeout,
    },
    ```

- [ ] **apps/api-gateway/src/interface/handlers.ts updated**:
  - Locate `DASHBOARD_SERVICES` const array
  - Add `'news'` string to array (alphabetically: after `'kinh-dich'`, before nothing or after `'stock'`)
  - Resulting array: `['mcp', 'pdf', 'rag', 'ta', 'macro', 'stock', 'kinh-dich', 'alert', 'news']` (order per brief)

- [ ] **docker-compose.yml api-gateway env updated**:
  - Locate api-gateway environment block
  - Add: `- NEWS_URL=http://news-fetch:5008`

- [ ] **docs/handoffs/ops-news-fetch-scaffold.md updated**:
  - Line 13: change `Port: 5007` → `Port: 5008`
  - Add note: `(Corrected per architect brief 2026-05-13 port assignment review)`

- [ ] **docs/ARCHITECTURE.md updated**:
  - Locate Services table (§ "Services (Phase 3 — Production)")
  - Add row: `| news-fetch | 5008 | TypeScript/Bun | ✅ Running |`
  - Keep rows alphabetically/logically ordered

- [ ] **Typescript compilation**:
  - `tsc --noEmit` in apps/api-gateway passes
  - No missing imports, type errors

- [ ] **docker-compose validation**:
  - `docker-compose config` passes (YAML valid, all refs resolve)
  - No service dependency cycles

- [ ] **Commit message**:
  - Format: `feat(1899a-gateway): wire news-fetch into gateway + docker-compose`
  - Trailers: `Task: 1899a-gateway`

---

## [Developer] Notes

**Service block template (copy-paste friendly):**
```yaml
news-fetch:
  build:
    context: apps/news-fetch
    dockerfile: Dockerfile
  ports:
    - "5008:5008"
  volumes:
    - market_data:/app/data:ro
  environment:
    - PORT=5008
    - DB_PATH=/app/data/market.db
    - DB_READONLY=true
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:5008/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
  deploy:
    resources:
      limits:
        memory: 2.5g
        cpus: '1.0'
      reservations:
        memory: 2g
        cpus: '0.5'
```

**Gateway index.ts pattern (from brief §10):**
```typescript
// In serviceUrls object:
news: process.env['NEWS_URL'] ?? 'http://news-fetch:5008',
```

**Health checker pattern:**
```typescript
// In buildServiceConfigs function:
news: {
  name: 'news',
  baseUrl: urls['news'] ?? 'http://news-fetch:5008',
  healthPath: '/health',
  timeoutMs: timeout,
},
```

**ARCHITECTURE.md pattern:**
```markdown
| news-fetch | 5008 | TypeScript/Bun | ✅ Running |
```

**Testing locally (after merge):**
```bash
docker-compose up -d news-fetch
sleep 5
docker-compose ps news-fetch  # Verify running
curl http://localhost:5008/health  # Verify healthcheck
docker-compose logs news-fetch  # Check startup logs
```

**Common pitfalls:**
- YAML indentation: use 2 spaces (not tabs)
- Port mapping: 5008:5008 (external:internal)
- Volume mount: read-only `:ro` suffix mandatory (db isolation rule)
- Healthcheck start_period: 30s (generous for Playwright image download)
- Gateway env var: NEWS_URL (uppercase, matches pattern)

---

## Zone Enforcement

**Zone:** multi
- docker-compose.yml (root)
- apps/api-gateway/ (3 files)
- docs/ (2 files: ops-news-fetch-scaffold.md, ARCHITECTURE.md)

**Single-writer rule:** Each zone has one owner. Gateway files are api-gateway concern (managed by developer). Root docker-compose is shared (managed by developer). Handoffs updated by PM (this task).

**Next task:** 1899a-cron (MCP scheduler integration)
