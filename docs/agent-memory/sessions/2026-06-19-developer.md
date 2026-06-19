### Task: Task 1300b: Memory Update Tools
- **Finding**: Agents need update_memory tool
- **Fix**: Implemented append_session_record
- **Status**: Ready for QA

---

## 2026-06-19 · dev-mcp-server · FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC

**Agent:** dev-mcp-server | **Task:** FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC (P2, S)

### Problem
`get_insider_signals` Zod schema had `outstandingShares: z.number()` (required). Callers in `eod.md` and `stage-analyze.md` call `get_insider_signals(code="{TICKER}")` with no `outstandingShares` → Zod-reject every cycle. Doc claimed "auto-fetch from BCTC if omitted" — no such code path exists anywhere on disk.

### Recon findings
- `leadershipTools.ts` L110: `outstandingShares: z.number()` — no `.optional()`
- `leadershipSignal.ts`: zero shares-lookup logic; `pctOfOutstanding(vol, 0) = 0` → below `MIN_PCT_THRESHOLD (0.1%)` → honest skip
- `marketCapTools.ts`: has `shares_outstanding_approx` as interface-layer approximation (market_cap/close), not a BCTC canonical shares source, not wirable as infrastructure auto-fetch without new infrastructure layer
- No real Option A source exists on disk

### Decision: Option B
Make `outstandingShares` optional, default 0. When 0, all pct-based signals suppressed (honest skip). Mass-insider-buy detection is volume-count-only — not affected by shares value. Doc reconciled to match reality.

### Files changed
- `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts` — optional field, handler resolves `?? 0`, Zod `.optional()`, description corrected
- `docs/agents/tools/list/get_insider_signals.md` — parameters table corrected, data sources updated, usage examples added
- `apps/mcp-server/src/__tests__/251-mcp-tools.test.ts` — 3 new tests covering code-only invocation (previously Zod-rejected)

### Gate evidence
- `bun tsc --noEmit`: exit 0 (clean)
- `bun test src/__tests__/251-mcp-tools.test.ts`: 16 pass / 0 fail
- `bun test` (full suite): 13330 pass / 0 fail (exit 0; post-run Bun JIT panic is known non-test issue)
- Tool count: 166 (unchanged)
- Scheduler count: 3 (unchanged)

### Doc match
`get_insider_signals.md` now correctly states: `outstandingShares` is optional (No), default 0, no auto-fetch. Schema and doc are in sync.

---

## 2026-06-19 · dev-mcp-server · FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT

**Agent:** dev-mcp-server | **Task:** FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (P1/HIGH, S)

### Problem
`get_agent_signals` had `agent: z.string()` (required) but three live flow callers legitimately omit it — news-scout ×2 (sender-history / all-producers mode) and market-watcher ×1 (all-producers). In sender-history mode `getSignals()` L877 overrides `agent` with `fromAgent` as the SQL bind; in all-producers mode `agent` is never touched. Schema was a lie: required a parameter it ignored.

### Decision: Direction A (per architect brief)
Make `agent` optional, add Path-C inbox guard that returns user-readable error when both `agent` and `from_agent` are absent.

### Files changed
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — `agent: z.string().optional()`, updated describe text; Path-C guard (inbox mode without agent → error); `args.agent ?? ""` on both `getSignals` call and `formatSignalLines` call
- `docs/agents/tools/list/get_agent_signals.md` — param table Required→Conditional; Use Cases note updated
- `docs/agents/tools/package/news-scout.md` — param caption updated
- `docs/agents/tools/package/alert-commander.md` — param caption updated
- `docs/agents/tools/package/tran-ngoc-bau.md` — param caption updated
- `apps/mcp-server/src/__tests__/FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts` — NEW: 5 ACs all GREEN

### Gate evidence
- `bun tsc --noEmit`: exit 0 (clean)
- `bun test src/__tests__/FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts`: 5 pass / 0 fail
- `bun test` (full suite): 13335 pass / 0 fail (exit 0; post-run Bun JIT panic is known non-test issue)
- Tool count: 166 (unchanged — schema-only change, no new tools)
- Scheduler count: unchanged

### AC pass/fail
- AC-1 PASS: inbox without agent → "Error: `agent` is required when using inbox mode"
- AC-2 PASS: sender-history from_agent="news-scout", no agent → signals returned, no error
- AC-3 PASS: all-producers from_agent=null, no agent → signals from all producers returned
- AC-4 PASS: inbox with agent="alert-commander" → backward-compat preserved
- AC-5 PASS: Zod safeParse accepts agent-omitted calls

### Doc match
Schema `agent: z.string().optional()` matches `get_agent_signals.md` Conditional requirement. Package docs for news-scout, alert-commander, tran-ngoc-bau updated.