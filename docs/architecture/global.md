# Architecture — Global SSOT

**Maintained by:** Architect
**Last updated:** 2026-05-11
**Counts:** never hardcoded here — see `docs/data/project-stats.json`

---

## System Overview

VN Market Intelligence MCP is a real-time Vietnamese stock market intelligence platform (HOSE/HNX/UPCOM). It is a pnpm monorepo running 9 Docker microservices. The single public interface is an MCP server at `zenmidi.com:3000`.

All tool/cron/agent counts live in `docs/data/project-stats.json`. Do not read counts from this file — point there.

---

## Monorepo Structure

```
vn-market-intelligence/         ← pnpm workspace root
├── apps/
│   ├── mcp-server/             ← TypeScript/Bun — MCP gateway (port 3000)
│   ├── api-gateway/            ← TypeScript/Bun — routing layer (port 4000)
│   ├── stock-price/            ← TypeScript/Bun — price aggregation (port 5010:5000)
│   ├── pdf-extractor/          ← Python/FastAPI — PDF parsing (port 5001)
│   ├── rag-service/            ← Python/FastAPI — embeddings + semantic search (port 5002)
│   ├── technical-analysis/     ← TypeScript/Bun — TA indicators (port 5003)
│   ├── macro-indicators/       ← TypeScript/Bun — macro snapshot (port 5004)
│   ├── kinh-dich-service/      ← TypeScript/Bun — hexagram readings (port 5005)
│   └── alert-engine/           ← TypeScript/Bun — signal evaluation (port 5006)
├── docker-compose.yml          ← All 9 services + shared /data volume
├── packages/
│   ├── shared-types/           ← Inter-service TypeScript contracts
│   ├── shared-db/              ← SQLite schema
│   └── shared-config/          ← mcp.config.json loader
└── vps-scripts/                ← 7 systemd services on Vinahost VPS Vietnam
```

---

## Service Port Map

| Service | External Port | Internal Port | Language | Status |
|---------|--------------|---------------|----------|--------|
| mcp-server | 3000 | 3000 | TypeScript/Bun | Running |
| api-gateway | 4000 | 4000 | TypeScript/Bun | Running |
| stock-price | 5010 | 5000 | TypeScript/Bun | Running |
| pdf-extractor | 5001 | 5001 | Python/FastAPI | Running |
| rag-service | 5002 | 5002 | Python/FastAPI | Running |
| technical-analysis | 5003 | 5003 | TypeScript/Bun | Running |
| macro-indicators | 5004 | 5004 | TypeScript/Bun | Running |
| kinh-dich-service | 5005 | 5005 | TypeScript/Bun | Running |
| alert-engine | 5006 | 5006 | TypeScript/Bun | Running |

Port notation in Docker Compose: `HOST:CONTAINER` (e.g. `5010:5000` means host 5010 maps to container 5000).

Detailed specs per service: `docs/architecture/microservice/<service>.md`

---

## Docker Compose Topology

All 9 services share a single `docker-compose.yml`. They communicate via Docker internal network (service names as hostnames). A shared named volume (`/data`) carries the SQLite databases and LanceDB vector store.

Restart command (operator-only): see `.claude/knowledge/restart-policy.md` — that is the SSOT.
Dev agents do NOT call docker-compose directly.

---

## Database Isolation (Single-Writer Rule)

| Database | Write owner | Readers |
|----------|-------------|---------|
| `market.db` | mcp-server | technical-analysis, macro-indicators, kinh-dich-service (readonly:true) |
| `alert_engine.db` | alert-engine | — (results POST back to mcp-server) |
| `stock_price.db` | stock-price | — (results POST to mcp-server /api/push-prices) |
| `pdf_extractor.db` | pdf-extractor | isolated |
| `rag_service.db` | rag-service | isolated |

**Invariant:** no service writes to another service's database. All cross-service data flows through HTTP.

---

## Two-Team Architecture

Full design: `docs/AI_TEAM_DESIGN.md`

| Team | Members | Runtime | Data access |
|------|---------|---------|-------------|
| Analysis (Cowork) | news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, unified-coordinator, qa-responder | Claude.ai cowork sessions (SSE) | MCP gateway exclusively via `call_tool(server="vn-market", ...)` |
| Dev (CLI cron) | developer, fixer, ops, pm, po, qa, architect, ba, + support agents | CLI cron (`cron-jobs.md`) | Direct file system + MCP gateway |

Agent roster: `.claude/knowledge/agent-roster.md`
Tool patterns: `.claude/knowledge/mcp-tools.md`
Cron schedule: `.claude/knowledge/cron-jobs.md`

---

## MCP Gateway — Single Interface Rule

**All external tool calls go through mcp-server.** No agent imports domain code directly. Call signature:

```
call_tool(server: "vn-market", tool: "<tool_name>", arguments: {...})
```

Tool registry: `.claude/knowledge/mcp-tools.md` → `docs/data/tool-registry.json`

---

## Data Flow

```
External data sources (VPS-proxied for geo-blocked VN sources)
  │
  ├─ Stock prices (VPS push → POST /api/push-prices, 60s market hours)
  ├─ BCTC PDFs (VPS push → POST /api/push-bctc-pdf, 6h cadence)
  ├─ News 10 sources (VPS push → POST /api/push-news, 15min cycle, ~226 items)
  ├─ SBV FX rates (VPS push → 30min cadence)
  ├─ Foreign flow (VPS push → POST /api/push-prices, 60s market hours)
  ├─ Polymarket predictions (direct REST, 30min)
  └─ Yahoo Finance commodities (direct)
       │
       ▼
  mcp-server (3000)
  ├─ Fetcher layer (rate limiter + circuit breaker)
  ├─ Parser layer (newsNormalizer, parseBctcReport)
  ├─ Domain layer (cascadeEngine, signalDetector, alertGenerator)
  ├─ Infrastructure layer (SQLite market.db + LanceDB)
  │
  ├─ HTTP → stock-price (5000) — price aggregation
  ├─ HTTP → technical-analysis (5003) — RSI/MACD/BB
  ├─ HTTP → macro-indicators (5004) — SBV FX + macro
  ├─ HTTP → kinh-dich-service (5005) — hexagram readings
  ├─ HTTP → alert-engine (5006) — signal evaluation
  ├─ HTTP → pdf-extractor (5001) — BCTC OCR
  └─ HTTP → rag-service (5002) — semantic search
       │
       ▼
  Telegram (3 channels: market, work, bug)
  Cowork agents (MCP SSE at zenmidi.com:3000)
```

---

## VPS Proxy Architecture (Geo-block Workaround)

MCP server runs in France. All VN stock APIs, SSC BCTC portal, news sources, SBV FX rates, and foreign flow data are geo-blocked from France. Vinahost VPS Vietnam (`$VINAHOST_IP`) bridges the gap via PUSH pattern.

**Invariant:** VPS liveness is owned by systemd on Vinahost host. MCP server NEVER SSHes into VPS at runtime. MCP only observes DB staleness.

| VPS Service | Data Type | Cadence | Push endpoint |
|------------|-----------|---------|---------------|
| `vn-price-fetch.service` | Stock prices | 60s (market hours Mon-Fri 02:00-08:59 UTC) | POST /api/push-prices |
| `vn-bctc-fetch.service` | BCTC PDFs | 6h | POST /api/push-bctc-pdf |
| `vn-news-fetch.service` | 10 news sources | 15min | POST /api/push-news |
| `vn-sbv-fetch.service` | SBV FX rates | 30min | (internal) |
| `vn-foreign-flow.service` | Foreign buy/sell | 60s (market hours) | POST /api/push-prices |

Full VPS operations: `.claude/knowledge/vps-setup.md`
BCTC pipeline diagnostics: `.claude/knowledge/bctc-extraction-runbook.md`

---

## DDD Layer Order (mcp-server)

```
domain ← application ← interface ← scheduler
```

Cross-layer rule: imports flow inward only. `domain/` never imports `infrastructure/`.
Repository pattern: interfaces in `domain/repositories/`, SQLite implementations in `infrastructure/db/repositories/`.

Full DDD standards: `.claude/knowledge/dev-standards.md`

---

## Module Boundaries (mcp-server)

12 modules, each owning its `tools/`, `scheduler/`, and `domain/services/` subfolder:

`market-data` | `financial-reports` | `news-analysis` | `alerts` | `portfolio` | `briefings` | `macro` | `sector` | `kinhdich` | `system` | `analysis` | `backtesting`

Full module boundary table: `docs/ARCHITECTURE.md` § Module Boundaries (preserved as reference until deprecated).

---

## Schema Decomposition

`schema.ts` (~248 lines) is the sole public DB API: exports `getDb`, `initDatabase`, `closeDb`. Backed by 8 domain slice files. All 38+ callers import only from `schema.ts`.

Slice files: `schema-market-data.ts`, `schema-financial-reports.ts`, `schema-news.ts`, `schema-alerts.ts`, `schema-portfolio.ts`, `schema-briefings.ts`, `schema-macro.ts`, `schema-system.ts`

---

## Conflict Resolutions (from 2026-05-11 audit)

| Conflict | Resolution |
|----------|-----------|
| Tool count drift (README claims 112, ARCHITECTURE claims 132) | SSOT is `docs/data/project-stats.json`. This file never hardcodes counts. |
| Port notation (→ vs :) | Canonical notation: `HOST:CONTAINER` (Docker Compose standard). |
| Docker restart command duplicated in 3 places | SSOT: `.claude/knowledge/restart-policy.md`. All other docs point there. |
| Microservices list duplicated in 3 places | SSOT: this file (global.md). Others should link here. |
| BCTC pipeline description duplicated | SSOT: this file + `docs/ARCHITECTURE.md` § BCTC. Runbook covers diagnostics only. |

---

## Key Configuration

`mcp.config.json` controls: server port, data paths, embedding model, Telegram tokens, market hours, scheduler cron expressions, alert thresholds, adaptive threshold tuning, RAG decay, fetcher URLs, rate limits.

Full section map: `docs/ARCHITECTURE.md` § mcp.config.json Sections (preserved as reference).

---

## Tests

Run from `apps/mcp-server/`: `bun test`
Run from root: `pnpm test`
Current baseline: see `docs/data/project-stats.json` → `testBaseline`
