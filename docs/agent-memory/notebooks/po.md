# PO Notebook

## 2026-06-01T17:23Z — TRIAGE operator-bug → opened TSH-6 (FIX) + TSH-7 (backlog)

**Operator-reported product defect:** `get_market_snapshot` always shows misleading "Kinh Dịch: Chưa đủ dữ liệu để tính quẻ". Router raw-diagnosed (NOT relayed): kinh-dich-service:5005 not deployed (docker ps = only mcp-server + mcp-gateway, host-panic constraint / A-01-EXPECTED-SET) → fetch connection-refused → bare `catch {}` swallows → emits fallback that FALSELY implies data shortage. 3 sites: marketTools.ts appendMarketHexagram(62-69)/appendStockHexagram(72-80) + analysis.ts appendStockHexagramHttp(63-78). I confirmed docker ps + grep'd the 3 sites raw myself.

**Verdict: Approach C-omit. FIX-class, NO new architect cycle.** Rationale: the architect ALREADY ruled the SAME dead-:5005 dep for the standalone tool (TSH-1, ARCH-DECIDE-1 FR-1=1b DEREGISTER in `…/2026-05-31-tool-surface-hygiene.md`): "absent is safer than lying"; wire :5005 later as feature sprint KINH-DICH-MARKET, "not squeezed into a hygiene sprint." That precedent governs the embedded path too.
- (A) deploy :5005 — REJECTED (host-memory panic + intended-runtime).
- (B) inline revert — REJECTED (re-introduces the P1-F G5 domain→infra violation; ARCH-DECIDE-1 already pre-decided against).
- (C) honest-omit — CHOSEN. On connection-refused/non-200 → OMIT block entirely + logger.warn (kills silent-swallow `feedback_silent_swallow_serial_bugs`); on genuine 200-insufficient-data → keep honest VN line. Plain VN (`feedback_market_report_plain_vietnamese`).

**Opened:** TSH-6 under TOOL-SURFACE-HYGIENE (dev-mcp-server, MEDIUM, operator-reported). Handoff `docs/handoffs/TSH-6-kinhdich-honest-omit.md`. 5 ACs incl. live gateway raw-verify (not badge, RISK-2 / `feedback_router_verify_raw_not_badges`). Ops REBUILD required. Can batch rebuild with TSH-2/3/4/TSH-4 (same marketTools.ts).
**Opened (backlog):** TSH-7 — secondary UX, default get_market_snapshot to watchlist when no `codes`. SPRINT-S, NOT gating. GOTCHA: watchlist NOT inline in system-map.json (only `_ssot` pointers) — tickers live in SQLite `watchlist` table. Needs BA spec.

**Routing:** PM → dev-mcp-server → ops rebuild → qa live raw-verify → PO sign-off.

**Carry-over / queued ahead/alongside:**
- TSH-1 (dev-mcp-server) SHIPS FIRST in this sprint — deregister get_market_hexagram tool; getMarketHexagram export stays LIVE (still used by appendMarketHexagram) so TSH-6 safe.
- ENV-ISOLATION-P2 schedulable — SERIALIZE EI-P2-2 mcp-server rebuild vs all TOOL-SURFACE-HYGIENE rebuilds (same zone, never parallel).
- HIGH backlog ahead: VPS-DEPLOY-PLACEHOLDER-GUARD (T1 ops-recon HARD GATE) · NB-PRUNE-FIX.
