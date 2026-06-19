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