---
sprint: RAPID-DATA-LAYER
branch: task/RAPID-A-get-company-profile-tool
size: S
zone: apps/mcp-server/
depends_on: []
blocks: ["FIX-I"]
---

## TLDR

New MCP tool `get_company_profile(code: string)` returning structured JSON with ownership structure and foreign holdings. Unblocks SKILL-4 ownership-governance-screen (free-float approximation, skin-in-the-game checks, foreign concentration). Consumes existing tables: `vnstock_shareholders`, `vnstock_officers`, `vnstock_trading_stats`.

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] New file `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` implementing `get_company_profile` handler
- [ ] Tool queries:
  - `vnstock_shareholders`: name, quantity, own_percent (ORDER BY own_percent DESC LIMIT 10)
  - `vnstock_officers`: name, position, own_percent, quantity
  - `vnstock_trading_stats`: current_holding_ratio (aggregate foreign %)
- [ ] Computes free_float_approx = 100 - sum(own_percent of top 10 holders, where non-free-float holders identified)
- [ ] Returns structured JSON: `{ code, shareholders: [{name, quantity, own_percent}], officers: [{name, position, own_percent, quantity}], foreign_holding_ratio, free_float_approx, data_as_of }` (no text output)
- [ ] Honest-null where data absent (e.g., data_as_of only if shareholders/trading_stats recently synced)
- [ ] Tool registered in mcp server factory (apps/mcp-server/src/interface/mcp/server.ts)
- [ ] Unit tests: 5+ tests (happy path FPT/VNM with populated shareholders, code not found, sparse officers, empty foreign %, zero own_percent edge case)
- [ ] TypeScript: tsc clean, no any types
- [ ] MCP output format: `{ content: [{ type: "text", text: JSON.stringify(...) }] }` per standards

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts:147` — reference for MCP tool structure (return format, error handling)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:330` — vnstock_officers schema (name, position, own_percent, quantity, code)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:345` — vnstock_shareholders schema (code, name, quantity, own_percent)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:320` — vnstock_trading_stats schema (current_holding_ratio column)
- `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` — query patterns for vnstock tables (if existing queries available, mirror style)
- `apps/mcp-server/src/interface/mcp/server.ts` — tool registration pattern (look for `server.tool("get_market_snapshot", ...`)
- `docs/policies/dev-standards.md` — MCP tool standards (always return exact format, financial numbers as percentage 0–100, no any)

**Files to create:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` — tool handler
- `apps/mcp-server/src/__tests__/RAPID-A-get-company-profile-tool.test.ts` — 5+ unit tests per AC

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/index.ts` — export new tool handler
- `apps/mcp-server/src/interface/mcp/server.ts` — register new tool in mcp factory

**Dependencies:**
- None (all source tables already populated by syncVnstockData)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (MCP tool format, TypeScript standards)
- `docs/standards/microservice-build-standard.md` § 5 (LEAN: fence/sandbox/replay/red-green)
- Architecture brief source: docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-A (lines 178–189)

---

## Scope Boundary

**NOT in this task:**
- Backfilling missing shareholder data for historical periods (tool returns current snapshot only)
- Officer history / CEO start date (separate task FIX-I — this task omits start_date intentionally)
- Foreign holder institutional breakdown (tool returns aggregate foreign % only; per-institution analysis out of scope)
- Computing ownership-change deltas (tool returns current structure once; trends are caller's responsibility)

---

## Build Standard — Lean

**Mandatory Gates (G1–G6):**
1. **Fence** — tool in interface zone only, queries DB via infrastructure layer (vnstockStore or direct db query pattern)
2. **Sandbox** — :memory: SQLite tests, zero API keys/DB credentials in env
3. **Replay** — test data inserted once, tool called twice on same DB (same result)
4. **Red/Green** — one failing test BEFORE fix, then all passing
5. Honest artifact (test file + tool code both live, no false greens)
6. TypeScript clean (tsc)

**DoD verification command line:**
```bash
# Fence: tool in interface/mcp/tools, queries via repository pattern
grep -n "class\|function get_company_profile" apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts
grep -n "server.tool.*get_company_profile" apps/mcp-server/src/interface/mcp/server.ts

# Sandbox: :memory: test, no DB credentials
cd apps/mcp-server && bun test __tests__/RAPID-A-get-company-profile-tool.test.ts

# Red/Green: show pre-fix failure
echo "Pre-fix:" && bun test __tests__/RAPID-A-get-company-profile-tool.test.ts 2>&1 | grep "0 pass"
# Fix, re-run
echo "Post-fix:" && bun test __tests__/RAPID-A-get-company-profile-tool.test.ts 2>&1 | grep "5 pass"

# Replay: call tool twice on same data
bun test __tests__/RAPID-A-get-company-profile-tool.test.ts --testNamePattern="replay"

# TypeScript
tsc --noEmit
```

---

## Handoff Notes

**Brief source:** docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-A (lines 178–189)

**Leverage:** Unblocks SKILL-4 ownership-governance-screen (free-float approximation, controlling-stake detection, skin-in-the-game checks). Enables partial live deployment of SKILL-4 in Phase 2 (ownership + insider, reward_fund flag deferred to FIX-F).

**Tool contract for agents:**
```
get_company_profile(code: string)
→ {
  code: string,
  shareholders: [{ name: string, quantity: number, own_percent: number }],
  officers: [{ name: string, position: string, own_percent: number, quantity: number }],
  foreign_holding_ratio: number | null,
  free_float_approx: number,
  data_as_of: string | null
}
```

**Error handling:**
- Code not found → return code + empty shareholders/officers arrays + null foreign_holding_ratio + 0 free_float (honest sparse data)
- No shareholders synced yet → return null data_as_of, empty shareholders array (no fake zeros)
- Officers table empty for code → return empty officers array (honest)
- Foreign % unavailable → return null foreign_holding_ratio (do not estimate)

**Free-float computation logic:**
- free_float_approx = 100 - sum(own_percent of top 10 shareholders) — simple approximation (assumes top 10 = non-free-float holders)
- If fewer than 10 shareholders exist, sum what exists
- Skill-4 will refine this with institutional-holder filtering; this tool provides raw data

**Commit message template:**
```
feat(rapid-phase2/FIX-A): new get_company_profile MCP tool (ownership + officers)

- New tool: apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts
- Returns { code, shareholders[], officers[], foreign_holding_ratio, free_float_approx, data_as_of }
- Queries vnstock_shareholders (top 10 by own_percent), vnstock_officers, vnstock_trading_stats.current_holding_ratio
- Computes free_float_approx = 100 - sum(top 10 own_percent)
- Test: 5+ tests (happy path FPT/VNM, code not found, sparse officers, zero foreign %, zero own_percent)
- Registered in mcp server factory
- DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc)

Task: FIX-A (RAPID-DATA-LAYER Phase 2, unblocks SKILL-4)
Depends-on: none
Blocks: FIX-I
```

---

## Live Integration (ops rebuild required)

After FIX-A ships and QA approves:
- ops runs: `docker compose build mcp-server && docker compose up -d mcp-server`
- Tool becomes available immediately (no migration, no cron restart)
- Router smoke test: `get_company_profile(code=FPT)` returns structured JSON with populated shareholders, officers, foreign_holding_ratio ≥ 0, free_float_approx ≥ 0
