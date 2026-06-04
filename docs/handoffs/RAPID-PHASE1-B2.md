---
sprint: RAPID-DATA-LAYER
branch: task/RAPID-B2-get-market-cap-tool
size: S
zone: apps/mcp-server/
depends_on: ["FIX-B-1"]
blocks: ["FIX-C"]
---

## TLDR

New MCP tool `get_market_cap(code: string)` returning structured JSON: `{ code, market_cap_billion, shares_outstanding_approx, fetched_at }`. Unblocks SKILL-1 rapid-market-cap-screen (mandatory entry gate per arch brief §8). Consumes persisted `market_cap_bn` from FIX-B-1.

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] New file `apps/mcp-server/src/interface/mcp/tools/market-data/marketCapTools.ts` implementing `get_market_cap` handler
- [ ] Tool queries vnstock_trading_stats.market_cap_bn (or vnstock_ratio_summary table per FIX-B-1 schema choice)
- [ ] Returns structured JSON not text: `{ code, market_cap_billion, shares_outstanding_approx, fetched_at }` where shares_outstanding_approx = safe-divide(market_cap_billion / daily_close_price, null on division-by-zero)
- [ ] Tool registered in mcp server factory (apps/mcp-server/src/interface/mcp/server.ts)
- [ ] Unit tests: 5+ tests (happy path FPT/VNM, missing market_cap field, zero market_cap, zero/missing price for shares calc, sparse data)
- [ ] Honest sparse-data handling: returns null shares_outstanding_approx if price missing; returns null market_cap_billion if unfetched (no fake zeros)
- [ ] TypeScript: tsc clean, no any types
- [ ] MCP output format: `{ content: [{ type: "text", text: JSON.stringify(...) }] }` per standards

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts:147` — reference for MCP tool structure (return format, error handling)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — vnstock_trading_stats schema (line 320+) to understand market_cap_bn column added by FIX-B-1
- `apps/mcp-server/src/interface/mcp/server.ts` — tool registration pattern (look for `server.tool("get_market_snapshot", ...`)
- `docs/policies/dev-standards.md` — MCP tool standards (always return exact format, financial numbers in million VND, no any)

**Files to create:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketCapTools.ts` — tool handler
- `apps/mcp-server/src/__tests__/RAPID-B2-get-market-cap-tool.test.ts` — 5+ unit tests per AC

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/server.ts` — register new tool in mcp factory

**Dependencies:**
- FIX-B-1 (market_cap_bn column must be persisted before tool can query it)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (MCP tool format, financial numbers in million VND, TypeScript standards)
- `docs/standards/microservice-build-standard.md` § 5 (LEAN: fence/sandbox/replay/red-green)

---

## Scope Boundary

**NOT in this task:**
- Backfilling market cap for existing corpus (post-tool-ship, separate task)
- Multi-ticker batch queries (tool takes single `code` param; batch is caller's responsibility)
- Caching market cap (tool always queries live from DB)

---

## Build Standard — Lean

**Mandatory Gates (G1–G6):**
1. **Fence** — tool in interface zone only, queries DB via infrastructure layer
2. **Sandbox** — :memory: SQLite tests, zero API keys/DB credentials in env
3. **Replay** — test data inserted once, tool called twice on same DB (same result)
4. **Red/Green** — one failing test BEFORE fix, then all passing
5. Honest artifact (test file + tool code both live, no false greens)
6. TypeScript clean (tsc)

**DoD verification command line:**
```bash
# Fence: tool in interface/mcp/tools, queries via repository pattern
grep -n "class\|function get_market_cap" apps/mcp-server/src/interface/mcp/tools/market-data/marketCapTools.ts
grep -n "server.tool.*get_market_cap" apps/mcp-server/src/interface/mcp/server.ts

# Sandbox: :memory: test, no DB credentials
cd apps/mcp-server && bun test __tests__/RAPID-B2-get-market-cap-tool.test.ts

# Red/Green: show pre-fix failure
echo "Pre-fix:" && bun test __tests__/RAPID-B2-get-market-cap-tool.test.ts 2>&1 | grep "0 pass"
# Fix, re-run
echo "Post-fix:" && bun test __tests__/RAPID-B2-get-market-cap-tool.test.ts 2>&1 | grep "5 pass"

# Replay: call tool twice on same data
bun test __tests__/RAPID-B2-get-market-cap-tool.test.ts --testNamePattern="replay"

# TypeScript
tsc --noEmit
```

---

## Handoff Notes

**Brief source:** docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-B (lines 193-202)

**Leverage:** Unblocks SKILL-1 rapid-market-cap-screen size gate (primary mandatory blocker per arch brief §8 go-live table). NO other skill can go live until FIX-B ships.

**Tool contract for agents:**
```
get_market_cap(code: string)
→ { code: string, market_cap_billion: number | null, shares_outstanding_approx: number | null, fetched_at: string }
```

**Error handling:**
- Code not found → return null market_cap_billion (honest)
- Price unavailable → return null shares_outstanding_approx (honest, no fake zeros)
- Both present → compute shares_outstanding_approx = market_cap_billion / current_price (from daily_ohlcv latest close)

**Commit message template:**
```
feat(rapid-phase1/FIX-B-2): new get_market_cap MCP tool (structured JSON, no text)

- New tool: apps/mcp-server/src/interface/mcp/tools/market-data/marketCapTools.ts
- Returns { code, market_cap_billion, shares_outstanding_approx, fetched_at }
- Queries vnstock_trading_stats.market_cap_bn (persisted by FIX-B-1)
- Computes shares_outstanding_approx via safe-divide(market_cap/price)
- Test: 5+ tests (happy path, missing/zero market_cap, price unavailable)
- Registered in mcp server factory
- DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc)

Task: FIX-B-2 (RAPID-DATA-LAYER Phase 1, unblocks SKILL-1)
Depends-on: FIX-B-1
Blocks: FIX-C
```

---

## Live Integration (ops rebuild required)

After FIX-B-2 ships and QA approves:
- ops runs: `docker compose build mcp-server && docker compose up -d mcp-server`
- Tool becomes available immediately (no migration, no cron restart)
- Router smoke test: `get_market_cap(code=VNM)` returns structured JSON with non-zero market_cap_billion
