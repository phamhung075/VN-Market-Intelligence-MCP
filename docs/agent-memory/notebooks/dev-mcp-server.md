# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1940a — PC1 legal_risk tool gap (2026-05-18, DONE → REVIEW)

**Root cause:** `get_legal_risk_signals` queried ONLY `alerts` table. News-scout posts `signal_type=legal_risk` to `agent_signals` via `post_agent_signal`. PC1 chairman arrest (#3318/#3343 conf=0.78) was in `agent_signals` — tool never read there. 3-cycle threshold (20:04, 21:03, 22:04 UTC 2026-05-17).

**Fix (interface layer only, DDD-clean):**
- Added `queryAgentSignalsTable()` in `legalRiskTools.ts`: queries `agent_signals WHERE signal_type='legal_risk' AND (stock_code=? OR stock_code IS NULL)` within look-back window.
- Graceful degradation if table absent (old test DBs).
- Both sources merged, sorted desc by date, capped at 100.
- Tool description updated to mention dual-source.

**Tests (7/7 GREEN):**
- TC1: legal_risk agent_signal for matching stock returned
- TC2: different stock NOT returned with stock filter
- TC3: both alerts + agent_signals merged
- TC4: null stock_code (broad signal) returned even with stock filter
- TC5: outside look-back window NOT returned
- TC6: wrong signal_type NOT returned
- TC7: PC1 chairman arrest payload surfaced

**Files modified:** `legalRiskTools.ts`
**Files created:** `1940a-pc1-legal-risk-agent-signals.test.ts` (7 tests)
**Commit:** `80873d1c`
**Type check:** 0 errors | **Tests:** 7+9+22+30 = 68 pass, 0 fail

Zone health: legalRiskTools.ts now dual-source (alerts+agent_signals); no schema changes; DDD interface-layer only | HEALTHY

---

### TNB Critic Gate — Sprint A + B (2026-05-17, DONE)

Sprint A: schema + tnbCriticScorer.ts (5 checks × 0.2, threshold 0.6). Sprint B: gate wire + retry. 49/49 tests GREEN. QA c143 APPROVED.

---

### Task 1930b — cashFlow OCF/NI ratio guard (2026-05-17, DONE)

OCF_NI_RATIO_PLAUSIBILITY_LIMIT=20. FPT (504×) + VCB (1.42e8×) suppressed. 7/7 tests GREEN.

---

### Task 1862c-F — SseSessionManager 404 + heartbeat eviction (2026-05-17, DONE)

5/5 tests GREEN. Commit `c52982af`.
