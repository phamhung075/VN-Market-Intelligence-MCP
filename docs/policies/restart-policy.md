# Server Restart Policy

**Load when:** deploy, restart, infrastructure changes, code deploy, post-merge verification.

Server restart rules and allowed mechanisms for the 9-service microservices architecture.

---

## Only Allowed Restart Command

```bash
cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5
```

**No exceptions.** All 9 microservices restart in lockstep.

**Banned mechanisms:** `bun --hot`, `bun --watch`, `nodemon`, `pm2`, `forever`, `node --watch`, any hot/live/fast reload — ALL FORBIDDEN in containers.

Manual launchctl commands — DEPRECATED (old monolithic server was decommissioned 2026-04-25).

---

## Why Docker-Compose Only

→ see `./restart-policy-rationale.md`

---

## Microservices Architecture (Phase 3 — Current)

9 Docker services + Shared SQLite database:

```
MCP Server (port 3000)          TypeScript/Bun
├─ API Gateway (port 4000)      Go
├─ Stock Price (port 5000)      TypeScript/Bun
├─ PDF Extractor (port 5001)    Python/FastAPI
├─ RAG Service (port 5002)      Python/FastAPI
├─ Technical Analysis (port 5003) TypeScript/Bun
├─ Macro Indicators (port 5004) TypeScript/Bun
├─ Kinh Dich Service (port 5005) TypeScript/Bun
└─ Alert Engine (port 5006)     TypeScript/Bun

Shared Database: /data/market.db (SQLite)
VPS Data Pipeline: Vinahost VPS → zenmidi.com → docker-compose services
```

---

## How to Apply a Code Change

1. Edit code in `apps/mcp-server/src/` (or relevant service directory)
2. Run tests: `cd apps/mcp-server && bun test` — must pass
3. TypeScript check: `bun tsc --noEmit` — must pass
4. Commit + push to main
5. Restart all services (command above)
6. Verify response: `{"status":"ok","tools":<N>,"jobs":<M>}` — current counts in `docs/data/project-stats.json`

---

## QA Validation After Code Merge

1. `docker-compose ps` — all 9 services showing "Up ... (healthy)"
2. `curl -s http://localhost:3000/health` — returns `{"status":"ok","tools":<N>,"jobs":<M>}`
3. `docker-compose logs mcp-server --tail 30` — no crash, no startup errors
4. `sqlite3 /path/to/data/market.db "SELECT COUNT(*) FROM market_prices WHERE updated_at > datetime('now', '-5 minutes');"` — recent data ingestion ✓

If health endpoint fails or tool count drops → diagnose from logs before marking sprint done.

---

## Docker-Compose Health Checks & Troubleshooting

→ see `./restart-policy-verification.md`

→ see `./restart-policy-troubleshooting.md`

---

**Migration:** Old launchctl system (2026-04-25) is deprecated. All code migrated to Docker.
