### Task: Task 1300b: Memory Update Tools
- **Finding**: Agents need update_memory tool
- **Fix**: Implemented append_session_record
- **Status**: Ready for QA

### Task: FIX-MCP-500-SYMBOL-TO-STRING (P0)
- **Root cause**: `StreamableHTTPServerTransport` (@modelcontextprotocol/sdk 1.29.0) bridges Node.js HTTP through `@hono/node-server`, which defines 13 Symbol-keyed prototype properties. Under Bun 1.3.13 JIT corruption (~80min after `ohlcvBackfill` startup processing 1608 tickers), Symbol→string coercion throws `TypeError: Cannot convert a symbol to a string` on every `/mcp` request.
- **Fix**: `apps/mcp-server/src/interface/mcp/server.ts` — replaced `StreamableHTTPServerTransport` with `WebStandardStreamableHTTPServerTransport` (native Web Standard Request/Response, no hono). Added `incomingToWebRequest()` + `pipeWebResponseToNode()` adapter helpers using `Readable.toWeb()`.
- **Commits**: `e69b354f` (fix), `6bd079ec` (orch-state), `c084af40` (notebook)
- **Verification**: tsc 0 errors; bun test 12847 pass, 0 new failures; local /vn-market/mcp + /vn-market/sse + /health all 200.
- **Status**: REVIEW — next_agent: ops (rebuild --no-cache mcp-server + force-recreate required for live proof)