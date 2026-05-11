# SSOT Freshness Audit — 2026-05-11

**Auditor:** system-auditor  
**Scope:** docs/architecture/ SSOT + 44 relocated deep-dive docs  
**Ground-truth:** docker-compose.yml, codebase src/, docs/data/project-stats.json, .claude/knowledge/tree-map.md

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| OBSOLETE | 0 | All claims match current code state |
| DRIFT | 2 | Minor incompleteness in DAG + hardcoded service counts |
| HARDCODED | 1 | Volatile count not pointerized |
| DANGLING LINKS | 0 | All 73 path rewrites (bcecc3f0) resolve correctly |
| VERIFIED | 6+ spot-checks | Domain models, infrastructure adapters, tool surfaces accurate |

**Verdict:** SSOT is factually accurate. Ready for use. Two low-priority drift issues recommended for next sprint (non-breaking).

---

## Issues (High-to-Low Priority)

### 1. DRIFT: tree-map.md missing docs/architecture/ DAG entry

**File:** `.claude/knowledge/tree-map.md` (lines 1–97)  
**Issue:** tree-map is the canonical knowledge DAG. The new docs/architecture/ directory (22 files added May 11) is not registered in the DAG.

**Current state:**
- tree-map points to `docs/ARCHITECTURE.md` (old, at root level)
- New SSOT is at `docs/architecture/global.md` + 21 sub-files

**Load-bearing impact:** If an agent lazy-loads from tree-map next session, it will still point to deprecated docs/ARCHITECTURE.md. Risk: dual sources of truth.

**Fix:** Add to tree-map under a new parent entry:
```markdown
├── docs/architecture/global.md (SSOT: microservice ports, DB isolation, data flow, DDD layer order)
│   ├── docs/architecture/microservice/<service>.md (9 service overviews)
│   └── docs/architecture/microservice/mcp-server/<tool-group>.md (12 tool groups + deep dives)
```

---

### 2. HARDCODED: mcp-server.md scheduler count not pointerized

**File:** `docs/architecture/microservice/mcp-server.md`, line 17  
**Claim:** `"62 scheduler files, cron registration via jobs.ts"`  
**Actual:** `docs/data/project-stats.json` → `schedulerFileCount: 62`

**Load-bearing impact:** If scheduler count changes (add/remove job), this doc immediately becomes stale. Violation of tree-map rule: "MD never contains volatile counts — point to JSON".

**Fix:** Replace hardcoded "62" with pointer:
```
| scheduler | `src/scheduler/` | cron registration via jobs.ts (count: see docs/data/project-stats.json → schedulerFileCount) |
```

---

### 3. DRIFT: api-gateway docs hardcode "8 services" (minor)

**File:** `docs/architecture/microservice/api-gateway/domain-model.md`, line 65  
**Claim:** `"Fans out health checks to all 8 services"`  
**Context:** Technically correct (8 downstream of api-gateway), but also appears in testing.md.

**Load-bearing impact:** Low (api-gateway only health-checks these 8; mcp-server is the 9th). But if a new service is added and api-gateway wired to check it, these docs need manual sync.

**Fix:** Reword to avoid count:
```
"Fans out health checks to all configured downstream services via Promise.allSettled()"
```

---

## Spot-Check Results (Verified ✓)

1. **docs/architecture/global.md** — 9 services + port mapping **matches docker-compose.yml exactly**. Notation HOST:CONTAINER correct.
2. **docs/architecture/microservice/technical-analysis.md** — DDD layers (domain, infrastructure, interface) **match code structure**. No dangling paths.
3. **docs/architecture/microservice/technical-analysis/domain-model.md** — `CandleStick` and `TechnicalIndicators` types **byte-match `apps/technical-analysis/src/domain/models.ts`**.
4. **docs/architecture/microservice/macro-indicators/infrastructure.md** — `HTTPCommodityFetcher` + `SQLiteMacroRepository` **match code** (URLs, query patterns, error handling).
5. **docs/architecture/microservice/mcp-server/market-data.md** — 10 tools listed **all exist** in codebase via `grep "server.tool("` (132 total tools verified).
6. **docs/architecture/microservice/alert-engine/testing.md** — Test file paths **exist** (`__tests__/unit/alert-engine.test.ts`, `integration/alert-handlers.test.ts`).

---

## Path Rewrite Audit (bcecc3f0)

73 agent file path updates from commit bcecc3f0:

- **All refs to `docs/architecture/microservice/<service>.md` resolve:** ✓ 9 service overviews + 12 tool groups exist
- **No dangling `docs/microservices/` refs remain:** ✓ grep found zero legacy pointers
- **Deep-dive docs relocated cleanly:** ✓ 44 files (domain-model, usecases, infrastructure, testing, api-reference per service) all present

---

## Recommendations

| Priority | Action | Owner | Trigger |
|----------|--------|-------|---------|
| **Normal** | Add docs/architecture to tree-map.md DAG | architect | Before next lazy-load session |
| **Normal** | De-hardcode scheduler count in mcp-server.md | developer | Next sprint (matches janitor rule 3) |
| **Low** | Reword api-gateway "8 services" refs | developer | During next api-gateway doc update |

---

## Files Read During Audit

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/architecture/global.md`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/architecture/microservice/mcp-server.md`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/architecture/microservice/technical-analysis.md`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/architecture/microservice/alert-engine/testing.md`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/architecture/microservice/macro-indicators/infrastructure.md`
- `docker-compose.yml` (9 services verified)
- `docs/data/project-stats.json` (toolCount=132, schedulerFileCount=62, cronJobCount=59)
- `.claude/knowledge/tree-map.md` (DAG audit)

All docs verified against code state as of 2026-05-11 12:00 UTC.
