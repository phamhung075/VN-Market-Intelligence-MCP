# Handoff — Task 1940a: PC1 legal_risk tool gap

**Task:** 1940a-pc1-legal-risk-tool-gap
**Branch:** task/1940a-pc1-legal-risk-tool-gap
**Zone:** apps/mcp-server/
**Priority:** HIGH | FIX
**Status:** REVIEW

---

## [Architect] Brownfield Findings

Not applicable — FIX type, dispatched directly by PO.

Root cause identified by dev-mcp-server:
- `get_legal_risk_signals` queried ONLY the `alerts` table (write path: alert-commander).
- News-scout posts `legal_risk` signals to `agent_signals` table via `post_agent_signal`.
- PC1 chairman arrest signals (#3318 conf=legal, #3343 conf=0.78) were in `agent_signals` — tool never read there.
- This gap persisted for ≥3 alert-commander cycles (20:04, 21:03, 22:04 UTC 2026-05-17).

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/tools/sector/legalRiskTools.ts` — added `queryAgentSignalsTable()` that queries `agent_signals WHERE signal_type='legal_risk'`; merged both sources; updated tool description; added graceful degradation if table absent.
- **Files created:**
  - `apps/mcp-server/src/__tests__/1940a-pc1-legal-risk-agent-signals.test.ts` — 7 tests (TC1–TC7)
- **Git commits:** 80873d1c
- **Type check:** clean ✓ (0 errors)
- **Service tests:**
  - 1940a suite: 7/7 GREEN
  - 245 suite (existing): 9/9 GREEN
  - 240 suite (legal risk domain): 22/22 GREEN
  - signal-integration (244+250): 30/30 GREEN
- **Docs updated:** NONE (interface-only change)
- **Graphify:** skipped (no docs impacted)

### Acceptance Criteria

- AC-1: `get_legal_risk_signals("PC1")` with a PC1 `legal_risk` entry in `agent_signals` → returns result containing "PC1" (TC1 ✓, TC7 ✓)
- AC-2: Stock filter correctly excludes other-stock agent_signals entries (TC2 ✓)
- AC-3: Both `alerts` and `agent_signals` rows merged when both exist (TC3 ✓)
- AC-4: Null stock_code (broad signal) returned even with stock filter set (TC4 ✓)
- AC-5: Entries outside look-back window excluded (TC5 ✓)
- AC-6: Wrong signal_type excluded (TC6 ✓)

---

## QA Instructions

1. Checkout `task/1940a-pc1-legal-risk-tool-gap`
2. `cd apps/mcp-server && bun test src/__tests__/1940a-pc1-legal-risk-agent-signals.test.ts` → 7/7 GREEN
3. `bun test src/__tests__/245-mcp-tools-039.test.ts` → 9/9 GREEN (no regression)
4. `bun tsc --noEmit` → 0 errors
5. Merge to main if all pass.
