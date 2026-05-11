# Session Summary — 2026-04-24

## Objective
Design a microservices architecture for VN Market Intelligence, maintaining single interface (MCP server) while splitting services for reusability across projects (weather, personal helper, Kinh Dich apps).

---

## Deliverables Created

### 1. **MICROSERVICES_DDD.md** (Main Architecture Guide)
**Location**: `/MICROSERVICES_DDD.md`

Complete guide with full working examples:
- **DDD file structure** (domain/application/infrastructure/interface) for all services
- **PDF Extractor (Python)** — 7-layer example with all 7 files + tests
- **RAG Service (Python)** — vector search + temporal decay example
- **Technical Analysis (TypeScript)** — stateless computation example
- **Unit test examples** — AsyncMock strategy for mocking all ports
- **Integration test examples** — real SQLite, mocked HTTP clients
- **Shared types contract** — inter-service JSON schema

### 2. **project_microservices_architecture.md** (Decision Record)
**Location**: `/memory/project_microservices_architecture.md`

Comprehensive architecture decision memo:
- **Language choice per service** (Python for PDF/RAG, TS for logic-heavy)
- **Monorepo structure** (pnpm workspaces, docker-compose)
- **Phased roadmap** (Phase 0: refactor → Phase 3: scheduler integration)
- **Invariants** (single SQLite, DDD everywhere, one interface)
- **Local dev workflow** (docker-compose up, test all)

### 3. **reference_ddd_microservices.md** (Quick Reference)
**Location**: `/memory/reference_ddd_microservices.md`

Quick lookup for DDD pattern:
- Testing strategy by layer
- Ports pattern (injection)
- Shared types approach
- When to use / when NOT to use

### 4. **Updated MEMORY.md**
Added pointers to both new memory files for future session context.

---

## Key Decisions Made

### Language Split
| Service | Language | Reason |
|---------|----------|--------|
| PDF Extractor | Python | pdfplumber + Tesseract ONNX (local, no cloud) |
| RAG Service | Python | sentence-transformers + LanceDB vector search |
| Technical Analysis | TypeScript | Stateless TA math, reuse existing logic |
| Macro Indicators | TypeScript | Simple commodity/SBV fetch + scoring |
| Kinh Dich | TypeScript | Hexagrams already in TS, reuse 1.5K lines |
| Alert Engine | TypeScript | Business logic + Telegram SDK integration |
| MCP Server | TypeScript/Bun | Orchestrator, calls all services via HTTP |

### Architecture Pattern
- **Monorepo** (single git, multiple apps) with `pnpm` workspaces
- **DDD layers** (domain/app/infra/interface) applied uniformly across Python + TypeScript
- **Shared DB** (single SQLite `/data/market.db`, all services connect)
- **Shared types** (`packages/shared-types`) for inter-service contracts
- **Single interface** (MCP server on port 3000 = gateway to Claude)

### Testability Strategy
- **Unit tests**: Mock all ports (dependency injection) → test domain logic only
- **Integration tests**: Real SQLite, mock HTTP clients → test use case + repository
- **E2E tests**: Full docker-compose → test service + MCP integration

---

## Reuse Opportunities

**PDF Extractor** reusable for:
- Weather PDFs
- Utility bills
- Insurance documents
- Personal financial statements

**RAG Service** reusable for:
- Personal diary search + temporal decay
- Weather event correlation
- Project documentation retrieval

**Kinh Dich Service** reusable for:
- Personal activity planning
- Weather prediction
- Daily reflection app

**Technical Analysis** reusable for:
- Crypto / forex analysis
- Commodities trading

---

## Next Steps (Not Started)

### Phase 0: Refactor Monolith → Monorepo (Week 1)
- Move `src/` → `apps/mcp-server/src/`
- Create `packages/{shared-types,shared-db,shared-config}`
- Root `package.json` + `pnpm-workspace.yaml`
- `docker-compose.yml` with all 7 services

### Phase 1: Extract PDF + RAG (Weeks 2–4)
- `apps/pdf-extractor/` with FastAPI + full tests
- `apps/rag-service/` with LanceDB + full tests
- Update MCP server to call services via HTTP

### Phase 2: Extract TS Services (Weeks 5–6)
- `apps/technical-analysis/`
- `apps/macro-indicators/`
- `apps/kinh-dich-service/`
- `apps/alert-engine/`

### Phase 3: Scheduler + VPS Integration (Week 7)
- Refactor cron jobs to dispatch to services in parallel
- Stock price aggregator stays in monolith

---

## How to Use This Context

### For Next Session:
1. Read `project_microservices_architecture.md` (2 min) — understand language split + roadmap
2. Read `MICROSERVICES_DDD.md` (10 min) — see how to write services
3. Start Phase 0 (refactor) or Phase 1 (extract)

### For Implementation (Phase 0):
- Copy PDF Extractor example from MICROSERVICES_DDD.md as template
- Follow same DDD structure for Technical Analysis, etc.
- Run `pnpm install && docker-compose up --build`

### For Code Reviews:
- Check that domain/ has zero infrastructure imports
- Verify all ports are injected via constructor
- Ensure __tests__ mirror domain structure

---

## Files Created

| File | Purpose | Type |
|------|---------|------|
| `/MICROSERVICES_DDD.md` | Full working examples + DDD guide | Docs |
| `/memory/project_microservices_architecture.md` | Architecture decision + roadmap | Memory |
| `/memory/reference_ddd_microservices.md` | Quick DDD reference | Memory |
| `/memory/MEMORY.md` (updated) | Pointers to new files | Index |
| `/SESSION_SUMMARY_20260424.md` | This file | Summary |

---

## Architectural Principles (Codified)

✅ **Reusability**: Each service has zero VN-market coupling. PDF extractor = generic.

✅ **Testability**: All ports injected → full coverage with mocks possible.

✅ **Single interface**: MCP server = gateway. Claude doesn't care about internal services.

✅ **Local-first**: No cloud. SQLite + ONNX + systemd. Vinahost VPS for geo-blocked fetch only.

✅ **Language flexibility**: Python for ML/I/O, TypeScript for logic. No forcing one language.

✅ **Future-proof**: Extractable to separate machines/Kubernetes without refactoring domain logic.

---

## Questions for Next Session

1. **Start with Phase 0 or Phase 1?** (Refactor monolith first, or extract PDF immediately?)
2. **FastAPI or Flask for Python services?** (FastAPI recommended; built-in async)
3. **Message queue for writes?** (SQLite has lock; BullMQ if contention becomes issue)
4. **Deploy strategy after extraction?** (Keep on same machine, or Kubernetes later?)

---

**Session Date**: 2026-04-24
**Status**: Analysis + Design Complete. Ready for Phase 0 implementation.
