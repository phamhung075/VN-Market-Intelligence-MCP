# Architecture Brief — 1872a: SSOT Hardening (Post-Arch-SSOT-Merge)

**Sprint:** SPRINT-S-1872a
**Authored:** 2026-05-11
**Author:** Architect
**Trigger:** System-auditor cycle-27 + architect signal convergence on same overlapping files
**Status:** Ready for PM → Developer handoff

---

## 1. AC → File → Change Matrix

### AC1 — tree-map.md: add docs/architecture/ entries

**File:** `.claude/knowledge/tree-map.md`
**Line:** ~74 (currently: `docs/ARCHITECTURE.md` standalone leaf)

**Current (line 74):**
```
├── docs/ARCHITECTURE.md (system design: folder tree, data flow, VPS price proxy + BCTC PDF proxy)
```

**Replace with:**
```
├── docs/ARCHITECTURE.md (module boundaries + mcp.config.json section map — preserved reference)
│
├── docs/architecture/global.md (architecture SSOT: 9-service overview, Docker topology, two-team arch, data flow, conflict resolutions — maintained by Architect)
│   ├── docs/architecture/microservice/mcp-server.md (mcp-server DDD layers, scheduler pointer, tool surface index)
│   │   ├── docs/architecture/microservice/mcp-server/market-data.md
│   │   ├── docs/architecture/microservice/mcp-server/financial-reports.md
│   │   ├── docs/architecture/microservice/mcp-server/news-analysis.md
│   │   ├── docs/architecture/microservice/mcp-server/alerts.md
│   │   ├── docs/architecture/microservice/mcp-server/portfolio.md
│   │   ├── docs/architecture/microservice/mcp-server/briefings.md
│   │   ├── docs/architecture/microservice/mcp-server/macro.md
│   │   ├── docs/architecture/microservice/mcp-server/sector.md
│   │   ├── docs/architecture/microservice/mcp-server/kinhdich.md
│   │   ├── docs/architecture/microservice/mcp-server/system.md
│   │   ├── docs/architecture/microservice/mcp-server/analysis.md
│   │   └── docs/architecture/microservice/mcp-server/backtesting.md
│   ├── docs/architecture/microservice/api-gateway.md
│   ├── docs/architecture/microservice/stock-price.md
│   ├── docs/architecture/microservice/pdf-extractor.md
│   ├── docs/architecture/microservice/rag-service.md
│   ├── docs/architecture/microservice/technical-analysis.md
│   ├── docs/architecture/microservice/macro-indicators.md
│   ├── docs/architecture/microservice/kinh-dich-service.md
│   └── docs/architecture/microservice/alert-engine.md
```

**Write-ownership row to add to Write Ownership table:**
```
| `docs/architecture/global.md` | Architect | After service topology or conflict resolution change |
| `docs/architecture/microservice/<service>.md` | Architect | After service-level design change |
```

---

### AC2 — README.md:76: "112 MCP Tools" → pointer

**File:** `README.md`
**Line:** 76 (inside microservices table, mcp-server row)

**Current:**
```
| **mcp-server** | 3000 | Claude MCP gateway (112 tools) |
```

**Replace with:**
```
| **mcp-server** | 3000 | Claude MCP gateway (see `docs/data/project-stats.json` → `toolCount`) |
```

---

### AC3 — docs/ARCHITECTURE.md:78: "132 tools, 59 cron jobs" → pointer

**File:** `docs/ARCHITECTURE.md`
**Line:** 78

**Current:**
```
- **MCP Server**: 132 tools, 59 cron jobs, HTTP clients to 8 other services
```

**Replace with:**
```
- **MCP Server**: tool count → `docs/data/project-stats.json#toolCount`; scheduler count → `docs/data/project-stats.json#cronJobCount`; HTTP clients to all configured downstream services
```

---

### AC4 — docs/architecture/microservice/mcp-server.md:17: hardcoded '62' scheduler count → pointer

**File:** `docs/architecture/microservice/mcp-server.md`
**Line:** 17

**Current:**
```
| scheduler | `src/scheduler/` | 62 scheduler files, cron registration via jobs.ts |
```

**Replace with:**
```
| scheduler | `src/scheduler/` | scheduler files: see `docs/data/project-stats.json` → `schedulerFileCount`; cron registration via jobs.ts |
```

---

### AC5 — README.md: ## Architecture section — 2 new pointers

**File:** `README.md`
**Location:** After the ASCII diagram block (around line 19, after the closing ` ``` `) and after the microservices table (around line 101)

**Pointer (a) — after the ASCII arch diagram block, before "### Three Telegram Channels":**
```
Full architecture docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (module boundaries) and [`docs/architecture/global.md`](docs/architecture/global.md) (system SSOT).
```

**Pointer (b) — after microservices table (after line 101 `| **alert-engine** | 5006 | ...`):**
```
Per-service architecture docs: `docs/architecture/microservice/<service>.md`
```

---

### AC6 — Docker restart triplication → pointer to restart-policy.md

Three locations currently contain inline restart commands:

**Location A — README.md:63-70** (under "### Step 3: Start All 9 Microservices via Docker")

**Current (lines 63-70):**
```
**The only allowed restart method is docker-compose** (deterministic state, all 9 services restart in lockstep):

```bash
docker-compose down
docker-compose up -d
sleep 5
curl http://localhost:3000/health | jq .
```
```

**Replace with:**
```
**The only allowed restart method is docker-compose.** Full procedure and banned mechanisms: [`.claude/knowledge/restart-policy.md`](.claude/knowledge/restart-policy.md)
```

**Location B — README.md:84-86** (under "For development:" step 3)

**Current:**
```
3. Restart all services: `docker-compose down && docker-compose up -d && sleep 5`
```

**Replace with:**
```
3. Restart all services: see `.claude/knowledge/restart-policy.md`
```

**Location C — docs/ARCHITECTURE.md:53**

**Current:**
```
**Restart:** `docker-compose down && docker-compose up -d` (all 9 services restart in lockstep)
```

**Replace with:**
```
**Restart:** see `.claude/knowledge/restart-policy.md` (SSOT — docker-compose only, 9 services)
```

Note: `docs/architecture/global.md` already correctly points to `restart-policy.md` (line 65). No change needed there.

---

### AC7 — api-gateway/domain-model.md: "all 8 services" → "all configured downstream services"

**File:** `docs/architecture/microservice/api-gateway/domain-model.md`
**Line:** 65

**Current:**
```
1. Fans out health checks to all 8 services via `Promise.allSettled()`
```

**Replace with:**
```
1. Fans out health checks to all configured downstream services via `Promise.allSettled()`
```

---

### AC8 — Grep verification (no hardcoded counts remain)

See Section 4 (Verification Commands) for exact one-liners.

---

## 2. Dependency Map — File Overlap

| File | ACs touching it | Must be single-author edit |
|------|----------------|---------------------------|
| `README.md` | AC2, AC5, AC6 | YES — 3 ACs, same file |
| `docs/ARCHITECTURE.md` | AC3, AC6 | YES — 2 ACs, same file |
| `.claude/knowledge/tree-map.md` | AC1 | No overlap |
| `docs/architecture/microservice/mcp-server.md` | AC4 | No overlap |
| `docs/architecture/microservice/api-gateway/domain-model.md` | AC7 | No overlap |

**Sequencing recommendation:**
1. `README.md` — do all 3 ACs (AC2 + AC5 + AC6) in one atomic edit pass
2. `docs/ARCHITECTURE.md` — do both ACs (AC3 + AC6) in one atomic edit pass
3. `tree-map.md`, `mcp-server.md`, `domain-model.md` — can run in parallel

---

## 3. Architecture-Update Flag per AC

| AC | Architecture update required? | Reason |
|----|------------------------------|--------|
| AC1 | YES | tree-map.md is the canonical DAG — adding new nodes changes the knowledge graph |
| AC2 | No | README pointer replacement only |
| AC3 | No | ARCHITECTURE.md text replacement only |
| AC4 | No | microservice doc pointer replacement only |
| AC5 | No | README pointer additions only |
| AC6 | No | pointer replacements; restart-policy.md is already SSOT |
| AC7 | No | domain-model.md wording fix only |
| AC8 | No | verification step; no file changes |

---

## 4. Verification Commands (AC8)

After all edits, run these to confirm zero hardcoded counts remain in the 3 named files:

```bash
# Check README.md
grep -n "112\|113\|132\|59 cron\|62 scheduler\|[0-9]* tools\|[0-9]* cron jobs" \
  /path/to/README.md

# Check docs/ARCHITECTURE.md
grep -n "132 tools\|59 cron\|112 tools\|62 scheduler" \
  /path/to/docs/ARCHITECTURE.md

# Check docs/architecture/microservice/mcp-server.md
grep -n "62 scheduler\|132 tools\|112 tools\|59 cron" \
  /path/to/docs/architecture/microservice/mcp-server.md
```

**Expected output:** zero matches in all 3 files.

Broad sweep across all architecture docs:
```bash
grep -rn "[0-9]\+ tools\|[0-9]\+ cron jobs\|[0-9]\+ scheduler" \
  docs/architecture/ docs/ARCHITECTURE.md README.md
```

---

## 5. PM Handoff — Task List

### Subtask IDs + Routing

| ID | AC(s) | File(s) | Agent | Notes |
|----|-------|---------|-------|-------|
| 1872a-1 | AC1 | `.claude/knowledge/tree-map.md` | developer | Add `docs/architecture/global.md` subtree + write-ownership rows |
| 1872a-2 | AC2 + AC5 + AC6 | `README.md` | developer | Single atomic edit — 3 ACs, same file; use exact snippets from Section 1 |
| 1872a-3 | AC3 + AC6 | `docs/ARCHITECTURE.md` | developer | Single atomic edit — 2 ACs, same file |
| 1872a-4 | AC4 | `docs/architecture/microservice/mcp-server.md` | developer | One-line replacement, line 17 |
| 1872a-5 | AC7 | `docs/architecture/microservice/api-gateway/domain-model.md` | developer | One-line wording fix, line 65 |
| 1872a-6 | AC8 | — (read-only grep) | developer | Run verification commands in Section 4 after 1872a-1 through 1872a-5 done; report findings |

### Execution Order

```
1872a-1 (tree-map)        ─┐
1872a-4 (mcp-server.md)   ─┤ parallel
1872a-5 (domain-model.md) ─┘
         ↓
1872a-2 (README — 3 ACs atomic)
1872a-3 (ARCHITECTURE.md — 2 ACs atomic)
         ↓
1872a-6 (AC8 grep verification)
```

### PR Target

Single PR. All edits are doc-only. No code logic, no test changes, no schema changes.

### Sprint Size

SPRINT-S (5 file edits + 1 grep verification). All individual edits are 1-3 line replacements. No migration steps. Forward-only.

---

## 6. Risk Flags

**None for production.** This sprint is doc-only (no code, no schema, no config changes).

Minor editorial risk: README.md is touched by 3 ACs — if developer splits into separate commits without reading this brief, they may introduce merge conflicts. PM must assign 1872a-2 as a single atomic task.
