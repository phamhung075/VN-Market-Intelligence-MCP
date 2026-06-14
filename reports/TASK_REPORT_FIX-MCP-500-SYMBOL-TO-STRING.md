# Task Report: FIX-MCP-500-SYMBOL-TO-STRING — WebStandard Transport Fix

date: 2026-06-14
qa-cycle: 267
outcome: APPROVED
priority: P0 / goal-critical

## Fix Commit
- impl: `e69b354f` — `fix(mcp-server/FIX-MCP-500-SYMBOL-TO-STRING): replace StreamableHTTPServerTransport with WebStandardStreamableHTTPServerTransport`
- ops: `2e83ebd0` — rebuild --no-cache + force-recreate mcp-server
- image: `4ca133414266d748c3bb3f58cfebbfd2e8fa8d01d6bb4e4dcabe320be41f91fe` (created 2026-06-14T10:49:08Z)

## Changed Files
- `apps/mcp-server/src/interface/mcp/server.ts` — transport swap + Node↔Web adapters (~100 lines net insertion, 5 deletions)

## Root Cause
`StreamableHTTPServerTransport` (SDK 1.29.0) bridged through `@hono/node-server` which defines 13 Symbol-keyed prototype properties on its fake Request object. Under Bun 1.3.13 JIT corruption (triggered after ~80 min of heavy `ohlcvBackfill` processing), accessing those Symbol keys attempts Symbol→string coercion and throws `TypeError: Cannot convert a symbol to a string` on EVERY `/mcp` request. This downed the entire cowork fleet (all 6 agents).

## Fix Strategy
Switch to `WebStandardStreamableHTTPServerTransport` which accepts a native Web Standard Request and returns a native Response — no `@hono/node-server` bridge, no Symbol-keyed property access. Added `incomingToWebRequest()` + `pipeWebResponseToNode()` to bridge Node.js `IncomingMessage`/`ServerResponse` to/from Web Standard APIs. Deps UNCHANGED (sdk:1.29.0 remains pinned) — the fix removes the corrupting CODE PATH, not the deps.

## Test Results

- TypeScript: `bun run tsc --noEmit` → **0 errors** (exit 0)
- Full suite: `bun test` → **12,942 tests / 1,083 files / exit 0** (Bun C++ OOM at end is pre-existing Bun v1.3.13 runtime bug, not code defect; confirmed identical pattern cycles 265/prior)
- New failures: **0** (pre-existing 53 in _deprecated/ unchanged)

## DDD Compliance: PASS

`server.ts` is `interface/` layer. Imports from `infrastructure/` (config, logger, db, notifiers, telemetry) — permitted interface→infra imports. No domain→infra violations. New adapter code is pure TypeScript, no domain imports.

## Security: PASS

- `incomingToWebRequest()`: uses `Object.entries(req.headers)` — only string-keyed enumerable properties copied; Symbol keys are NOT yielded by Object.entries. No injection surface.
- `pipeWebResponseToNode()`: chunk streaming with `reader.releaseLock()` in `finally` block — no stream leak. `res.end()` always called.
- No `process.env` in fix code (policy: `Bun.env` only).
- No hardcoded secrets, no SQL, no shell interpolation.
- CORS headers: safe `res.setHeader` usage, unchanged from prior.
- Per-request cleanup: `reqTransport.close() + reqMcp.close()` in `finally` block.
- No unbounded buffering: request body streamed via `Readable.toWeb()`.

## Genericity: PASS (transport-layer, all 157 tools covered)

- grep for ticker hardcodes in adapter code: 0 hits.
- Fix is at `/mcp` endpoint handler level — executes before any tool handler.
- Applies uniformly to ALL 157 tools / ALL tickers / ALL agents.
- No per-ticker or per-tool special-casing.

## Live Verification (independent, QA-own calls)

| Check | Result |
|---|---|
| `GET /health` | `{"status":"ok","toolCount":157,"uptime":574s}` |
| POST `/mcp` initialize | `event: message` → `protocolVersion: 2024-11-05` valid MCP response |
| `get_market_snapshot {}` | VN-Index 1,791.65 / -0.39% — valid, no 500 |
| `get_market_snapshot {codes:[VCB,FPT]}` | VCB 61,600 VND Vol 3,152,300 / FPT 73,500 VND Vol 5,688,200 |
| Docker logs scan | 0 "symbol to a string" errors |
| Peer containers | All 13 peers Up (ops-confirmed; no collateral) |

## Non-Blocking Notes

- `server.ts.bak` is git-tracked (created 2026-05-20, pre-dates this sprint). Not compiled, not on any code path. Recommend `git rm apps/mcp-server/src/interface/mcp/server.ts.bak` post-sprint cleanup.

## Verdict

**APPROVED — done_verified**

QA agent: qa | cycle: 267 | date: 2026-06-14
DJ: `docs/agent-memory/decisions/sprint-FIX-MCP-500-SYMBOL-TO-STRING-qa.md`
