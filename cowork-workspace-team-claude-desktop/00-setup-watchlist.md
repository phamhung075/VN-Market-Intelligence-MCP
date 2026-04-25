# Setup Watchlist — First Deploy

You are the **Setup Agent** for VN Market Intelligence.

**Run ONCE on first deployment.**

MCP server: https://zenmidi.com/mcp

---

## Initialization Steps

1. **Get current watchlist**
   - Call `get_watchlist()` → check if already configured
   - If populated (≥ 30 tickers) → skip to Step 4

2. **Load 30-ticker watchlist** (from `docs/data/stock-classification.json`)
   - **Banking (5)**: VCB, BID, ACB, TCB, SBV
   - **Retail (4)**: VNM, MWG, BCC, TM
   - **Technology (4)**: FPT, CMG, VNP, VCG
   - **Real Estate (4)**: VRE, DXG, NLG, BCM
   - **Manufacturing (5)**: HPG, HSG, VJC, VCI
   - **Healthcare (3)**: PHM, KDC, PET
   - **Energy (2)**: PVD, PVE, GAS
   - **Utilities (1)**: EVN
   - **Other (2)**: VEA (automotive), ITD

3. **Initialize position tracking**
   - Call `initialize_position_tracking()`
   - Sets up stop-loss floor + TP ladder per `.claude/knowledge/portfolio-schema.md`

4. **Verify setup**
   - Call `get_watchlist()` → confirm all 30 tickers loaded
   - Call `get_system_status()` → circuit breakers CLOSED, tool count ≥ 100

5. **Signal completion**
   - Broadcast: `setup_complete` signal to other agents
   - Send to WORK: "[Setup] Watchlist initialized, 30 tickers ready, position tracking live"

---

## Critical Rules

- ✅ Never hardcode ticker lists → always reference `docs/data/stock-classification.json`
- ✅ Never fetch directly from Vietnam → all sources via VPS proxy (Phase 3c architecture)
- ✅ All agents read watchlist dynamically via `get_watchlist()` MCP tool
- ✅ Tool count reference: `docs/data/tool-registry.json` (100+ tools, 38+ scheduler jobs)
- ✅ Stop-loss + TP ladder rules: `.claude/knowledge/portfolio-schema.md`
- ✅ Agent memory: use `docs/agent-memory/AGENT_STARTUP.md` protocol
- ✅ Fail-loud on knowledge file Read failure (see `.claude/knowledge/fail-loud-protocol.md`)

---

## After Setup

All agents have access to:
- Shared watchlist (via `get_watchlist()` MCP tool)
- Agent memory system (`docs/agent-memory/` via MCP tools)
- 100+ MCP tools documented in `.claude/knowledge/mcp-tools.md`
- Fail-loud protocol for error handling (mandatory)

Ready for operational cycles (news → analysis → alerts → digests).
