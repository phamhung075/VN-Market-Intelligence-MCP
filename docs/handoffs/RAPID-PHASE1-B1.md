---
sprint: RAPID-DATA-LAYER
branch: task/RAPID-B1-persist-market-cap
size: S
zone: apps/mcp-server/
depends_on: []
blocks: ["FIX-B-2"]
---

## TLDR

Persist vnstock ratio summary `marketCap` field from in-memory vnstockBridge export into a persistent DB table. Currently only exported as a dead `VnstockRatioSummary.marketCap` property (never stored). This unblocks the new `get_market_cap` MCP tool and SKILL-1 rapid-market-cap-screen mandatory entry gate.

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] Schema migration: add `market_cap_bn` column to `vnstock_trading_stats` table (or create new `vnstock_ratio_summary` table if simpler) with non-null default 0
- [ ] syncVnstockData.ts: wire vnstockBridge.marketCap persist into the migration target column on each vnstock fetch
- [ ] At least 1 existing ticker in DB shows non-zero market_cap_bn after manual re-sync test
- [ ] Unit tests: 5+ tests covering happy path, zero market cap, null/missing vnstock ratio, migration idempotent
- [ ] TypeScript: tsc clean, no any types
- [ ] Code follows DDD pattern: domain/models (entity), infrastructure/db (schema + migration), application/usecases (syncVnstockData orchestration)

**Files to read first:**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — current `vnstock_trading_stats` schema definition (line 320+)
- `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts:82` — the dead `VnstockRatioSummary.marketCap` export
- `apps/mcp-server/src/application/usecases/syncVnstockData.ts` — the sync orchestrator that calls vnstockBridge
- `docs/policies/dev-standards.md` — DDD layer rules, TypeScript standards (no any, use unknown)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — add migration for `market_cap_bn` column (or new table)
- `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` — ensure marketCap is exported cleanly (already done; verify line 82)
- `apps/mcp-server/src/application/usecases/syncVnstockData.ts` — wire persist logic on vnstock fetch result
- `apps/mcp-server/src/__tests__/RAPID-B1-persist-market-cap.test.ts` — new test file (5+ tests per AC)

**Files to create:**
- `apps/mcp-server/src/__tests__/RAPID-B1-persist-market-cap.test.ts` — integration test: migrate schema, sync 1 ticker, verify DB column non-zero

**Dependencies:**
- None (P1 no-deps task)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (DDD, TypeScript, test template)
- `docs/standards/microservice-build-standard.md` § 5 (LEAN profile: G1–G6 mandatory, fence+sandbox/replay required, honest red/green)

---

## Scope Boundary

**NOT in this task:**
- Creating the new MCP tool `get_market_cap` (that is FIX-B-2, depends on this)
- Backfilling historical market cap for existing corpus (one-time after tool ships)
- Shares outstanding derivation (tool handles that; persist marketCap only here)

---

## Build Standard — Lean (apps/mcp-server already exists)

**Mandatory Gates (G1–G6):**
1. **Fence** (lint / architecture-fence) — schema migration + code in allowed zones only
2. **Sandbox** — unit tests with :memory: SQLite, zero DB credentials in env
3. **Replay** — migration idempotent, test runs twice on same DB (same result)
4. **Red/Green** — show one failing test BEFORE fix, then all passing
5. Honest artifact (test file persists, no false greens)
6. TypeScript clean (tsc)

**DoD verification command line (dev to run before commit):**
```bash
# Fence: grep schema migration + syncVnstockData edit both in apps/mcp-server
grep -r "market_cap_bn" apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts
grep -r "market_cap_bn" apps/mcp-server/src/application/usecases/syncVnstockData.ts

# Sandbox: run test with :memory: DB (setup.ts preload), no secrets env
cd apps/mcp-server && bun test __tests__/RAPID-B1-persist-market-cap.test.ts

# Red/Green: show one pre-fix failing test
echo "Pre-fix test:" && bun test __tests__/RAPID-B1-persist-market-cap.test.ts 2>&1 | grep "0 pass"
# Then fix, re-run
echo "Post-fix test:" && bun test __tests__/RAPID-B1-persist-market-cap.test.ts 2>&1 | grep "5 pass"

# TypeScript
tsc --noEmit

# Replay: migration-idempotent test (apply twice to :memory:)
bun test __tests__/RAPID-B1-persist-market-cap.test.ts --testNamePattern="idempotent"
```

---

## Handoff Notes

**Brief source:** docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-B (lines 193-202)

**Risk flags from brief:**
- vnstockBridge.ts:82 is a verified dead export (not used elsewhere) — safe to retrofit persist without breaking callers
- syncVnstockData currently fetches all tickers on startup; market cap is ONE field per fetch result (low cognitive load)
- Test with 1 ticker only (VNM or FPT); corpus re-sync happens post-FIX-B-2 tool ship

**Commit message template:**
```
feat(rapid-phase1/FIX-B-1): persist vnstock marketCap to vnstock_trading_stats.market_cap_bn

- Add market_cap_bn column migration to vnstock_trading_stats
- Wire vnstockBridge.marketCap persist in syncVnstockData.ts
- Test: verify schema idempotent, sync updates 1 ticker, column non-zero
- DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc)

Task: FIX-B-1 (RAPID-DATA-LAYER Phase 1, unblocks get_market_cap tool)
```
