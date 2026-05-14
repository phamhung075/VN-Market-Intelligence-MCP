# Data + Equipment Improvement Proposal — 2026-05-14

**Author:** tran-ngoc-bau (cycle 50)
**Methodology ref:** `docs/standards/tnb-methodology.md` (foundational philosophy + Layers 1-9)
**Based on:** notebook cycles 46-49 + live agent notebooks (alert-commander, news-scout, financial-analyst, unified-agent, digest-predict) + architecture briefs 2026-05-13/14

---

## A. Live Server Snapshot

### MCP Gateway (zenmidi.com/mcp)

**Status: BLOCKED — 5th consecutive cycle (c46 through c50).**

`mcp__claude_ai_gateway__call_tool` is not a registered tool function in this Claude Code cowork session scope. Live `list_servers` / `search_tools` / `call_tool` calls cannot be issued from within TNB's cowork thread. This is the SPIKE_C86_MCP_REG blocker documented since c46 — a Desktop config gap requiring user action (not a server-down condition).

Per the `bootstrap.md` error-boundary: "If MCP gateway call fails → send BUG one-line error → EXIT (audit from stale files produces hallucinated findings)." However, the mission for this cycle explicitly authorises notebook-evidence mode for the proposal when the gateway is blocked. All findings below are grounded in live agent notebooks (written by agents that DO have MCP access in their sessions), not in TNB's own live probes.

**Inference from agent notebook timestamps (all dated 2026-05-14):**
- `project-stats.json` (`_lastRefreshedBy: "ops 1890a-deploy 2026-05-14"`) → MCP server at `localhost:3000` health=200 as of 04:26 UTC.
- alert-commander notebook: `log_agent_work id=801` at 07:05 UTC → signal bus accepting writes.
- news-scout notebook: chain_catalyst signals #3126 through #3147 fired in sequence → news pipeline active.
- financial-analyst notebook: 23:05 UTC 2026-05-13 entry present → 23:00 cron ran.

**Registered tool count:** 139 tools (per `project-stats.json` post 1890a deploy).

**Tool count by server (inferred from INDEX.md + all-tools.md baseline):**

| Server | Tools |
|--------|-------|
| vn-market (mcp-server:3000) | 139 |
| news-fetch (port 5008) | Not yet scaffolded |
| forensic-analysis (port 5007) | Not yet deployed |
| technical-analysis | In docker-compose, operational |

### Channel Activity — Last 24h (from notebook evidence)

| Channel | Volume | Notes |
|---------|--------|-------|
| MARKET | ~0 msgs auditable | MCP session blocked — cannot read. Inference: FPT + GAS alerts on 2026-05-13 09:01 UTC cycle (c46 breakthrough — 2 CRITICAL fires). |
| WORK | ~3-5 msgs estimated | HEAD.lock escalation from unified-agent (c49). alert-commander dedup logs. |
| BUG | ~2 msgs estimated | VNM BCTC confidence=0 (unified-agent 06:00 UTC note). BCTC VAL-07 totalAssets positional drift (1908c in-flight). |

### Critical Blockers Still Open

| # | Blocker | Cycles open | Priority |
|---|---------|-------------|----------|
| MCP-B1 | TNB cowork session: MCP gateway not registered | 5 (c46-c50) | HIGH |
| BCTC-B2 | BCTC positional extraction: VAL-07 totalAssets drift (VNM, DIG, banking cohort risk) | 2 | HIGH |
| BCTC-B3 | 37/38 watchlist stocks: no Q1-2026 BCTC data | ongoing | HIGH |
| FA-B4 | financial-analyst: no 2026-05-14 session visible as of c49 07:15 UTC — BCTC banking deadline today | 1 | HIGH |
| DP-B5 | digest-predict: 4-day silence (last entry 2026-05-11 21:38 UTC) | 4 | HIGH |
| NS-B6 | news-scout: inter-cycle chain dedup absent (IEA/CPI theme: 3 signals in 3h, 2026-05-14) | 1 | MEDIUM |
| AC-B7 | FII pipeline: fii_type=UNKNOWN since 2026-05-13 (unified-agent 06:00 UTC) | 1 | MEDIUM |

---

## B. Data Gaps Observed (ranked by impact)

### B1. BCTC Operating Cash Flow (OCF) — Missing for 37/38 Watchlist Stocks

**What's missing:** Raw Operating Cash Flow values from the cash flow statement (IS→OCF delta, not derived). Currently only Net Income is reliably extracted. `get_cash_flow` tool now exists (1890a deployed) but the underlying `cashFlowExtractor.ts` is 129 LOC vs 814 LOC for balanceSheetExtractor — likely incomplete for multi-layout PDFs.

**Frequency:** Quarterly (BCTC filing). Q1-2026 deadline was 2026-04-30 — now 14 days overdue for 37/38 stocks.

**Source-tier:** Tier 1 (SSC portal `congbothongtin.ssc.gov.vn` direct filing disclosure). The VPS pull pipeline exists; the gap is in extraction quality and coverage breadth.

**Báu layer weakened:** Layer 7 (G-step: "NI vs OCF compared AND ≥1 forensic gate"). Without OCF, the G-step is permanently skipped. Every financial-analyst BCTC opinion is an unverified NI number — the methodology epigraph explicitly calls accounting profit "an opinion" and OCF "the fact."

**Agents degraded:** financial-analyst (G-step skip, 5+ cycles), unified-agent (Pillar 3 EPS confidence capped), report-analyzer (forensic gate blocked).

**Proposed source:** SSC portal via existing VPS pipeline + improvement to `cashFlowExtractor.ts` to handle multi-layout PDFs (same fix family as 1908c for balanceSheetExtractor).

**Cost/feasibility:** Free public (SSC). Build effort M — requires expanding `cashFlowExtractor.ts` from 129 LOC to full parity with balanceSheetExtractor, including multi-page layout handling. Highest-ROI fix because it unblocks the entire forensic stack.

---

### B2. Foreign Institutional Flow (FII) — Pipeline Outage + No Historical Depth

**What's missing:** Real-time FII buy/sell by stock. Currently: `get_foreign_flow` routes through VPS proxy (HOSE/HNX push). Since 2026-05-13 `fii_type=UNKNOWN` (unified-agent, 06:00 UTC 2026-05-14) — the pipeline is paused. Additionally: only current-session flow is captured, not 30-day trend.

**Frequency:** Intraday (every 20 min during market hours).

**Source-tier:** Tier 2 (VPS proxy — HOSE/HNX data via intermediary). No Tier 1 direct HOSE feed.

**Báu layer weakened:** Layer 1.2 (FII carry threshold: FII_carry ↔ 0). Layer 4 Pillar 1 (Lượng tiền — where FII flow is the demand-side signal). Layer 5 state-transition audit (14 consecutive sessions of net sell = regime signal). When fii_type=UNKNOWN, unified-agent cannot declare carry regime.

**Agents degraded:** unified-agent (CARRY_REGIME stuck), alert-commander (chain_catalyst FII suppression logic degraded), news-scout (FII outflow amplification may double-count if pipeline has stale data).

**Proposed source (short term):** Diagnose and restore VPS proxy. Implement health-check ping in `get_vps_service_health` specifically for FII feed. **Proposed source (medium term):** Direct HOSE API for foreign flow data (Tier 1 if HOSE provides authenticated feed; currently no direct access confirmed).

**Cost/feasibility:** VPS restore = free, dev effort S. HOSE direct feed = unknown (may require commercial agreement). Build effort M for health-check + fallback.

---

### B3. US PMI Sub-Components — Manufacturing Sub-Indices Not Tracked

**What's missing:** ISM Manufacturing PMI sub-components (new orders, employment sub-index, prices paid, inventory, backlog). Currently `get_macro_snapshot` returns composite PMI only (TradingEconomics, Tier 2). Layer 2 of the methodology explicitly requires: "PMI with sub-components checked BEFORE consumer/services."

**Frequency:** Monthly (ISM releases first business day of each month).

**Source-tier:** ISM.org (Tier 1 — primary official survey publisher). FRED also carries the sub-series (Tier 1).

**Báu layer weakened:** Layer 2 (D-step audit). Every US macro call using composite PMI without sub-components is a D-step skip. New orders leading vs prices paid lagging is the core US manufacturing regime signal — composite PMI obscures the divergence.

**Agents degraded:** news-scout (D-step n/a for its role, but US macro chain analysis is weakened), unified-agent (Pillar 2 COC analysis lacks leading PMI sub-signal), financial-analyst (sector impact assessment for export-linked stocks like FPT degraded).

**Proposed source:** FRED public API (Tier 1) — series: `ISM/MAN_NHW` (new orders), `ISM/MAN_EMPV` (employment), `ISM/MAN_PPV` (prices paid). All freely accessible. No auth required. Existing `get_fed_liquidity_spread` already pulls from FRED — same infrastructure.

**Cost/feasibility:** Free (FRED). Build effort S — extend existing FRED fetcher in `carryTools.ts` or add new macro tool `get_ism_subcomponents`. Cron: monthly, first business day.

---

### B4. EFFR–IORB Spread — Tool Exists but Not in Agent Packages

**What's missing:** `get_fed_liquidity_spread` is built and registered (Tier 1 — FRED) but does NOT appear in any agent tool package (`financial-analyst.md`, `news-scout.md`, `unified-agent.md`, `alert-commander.md`). Layer 2 explicitly requires "Fed liquidity claims reference EFFR–IORB spread."

**Frequency:** Daily (FRED updates each business day).

**Source-tier:** Tier 1 (FRED — official Federal Reserve data).

**Báu layer weakened:** Layer 2 (D-step). EFFR–IORB spread is the real Fed plumbing signal (reserve scarcity / QT velocity) — the headline rate is a lagging policy label, not the liquidity signal. Every Fed call that doesn't reference the spread is a D-step partial.

**Agents degraded:** unified-agent (COC pillar relies on headline Fed rate only), news-scout (US monetary chain impact uses headline rate as proxy), financial-analyst (cost-of-capital discount rate uses assumed SBV rate, not US plumbing signal).

**Proposed fix:** Add `get_fed_liquidity_spread` to the tool packages of unified-agent, news-scout, and financial-analyst. This is a flow/package file edit — zero build work, zero cost. Unblocks D-step for free.

**Cost/feasibility:** Zero build. Package file edits only (flow docs). Effort XS. Highest leverage per token of work.

---

### B5. VIRA Data — No Live Fetcher, VPS Scraper Pending

**What's missing:** VIRA (`vira.org.vn`) survey data — Vietnam's primary monthly business confidence and manufacturing/services survey. Layer 3 (E-step) designates VIRA as the primary VN source. Currently every E-step audit notes "VIRA-absence noted while VPS scraper is pending."

**Frequency:** Monthly.

**Source-tier:** Tier 1 (VIRA is Vietnam's official business survey body).

**Báu layer weakened:** Layer 3 (E-step). Without VIRA, VN macro calls use IMF/ADB/WB or TradingEconomics as primary — these are Tier 2 or secondary sources, not primary. The methodology explicitly says: "VIRA cited (or VIRA-absence noted)." The absence notation is acceptable as a carry, but a live scraper converts E-step from carry to full pass.

**Agents degraded:** All agents making VN macro claims default to TradingEconomics (Tier 2). unified-agent Pillar 1 M2 and Pillar 4 POL are weakest because they depend on VN-side macro data.

**Proposed source:** VPS scraper to `vira.org.vn` survey releases (HTML/PDF monthly). Vinahost VPS already hosts 5 geo-blocked scrapers — add VIRA as scraper #6.

**Cost/feasibility:** Free (public data). Build effort M — HTML scraper + PDF extraction if surveys are PDF-first. Adds to VPS load (low, monthly frequency).

---

### B6. SBV Direct Rate Feed — Currently via Vietcombank XML Proxy

**What's missing:** Direct SBV refinancing rate + OMO net injection data from `sbv.gov.vn`. Currently `get_macro_snapshot` reads from Vietcombank XML proxy (Tier 2) because SBV web portal is down per `REQ_1881a.md`. SBV rate = Pillar 2 anchor for VN cost-of-capital.

**Frequency:** OMO: daily. Refinancing rate: per SBV announcement.

**Source-tier:** Tier 1 (SBV is the State Bank of Vietnam — primary monetary authority).

**Báu layer weakened:** Layer 3 (E-step), Layer 4 Pillar 2 (Chi phí vốn). When VCB XML proxy is the source, the COC pillar is Tier 2, not Tier 1. For interest-rate-sensitive stocks (banking, real estate, utilities) this is a material gap.

**Proposed source:** Investigate SBV's `sbv.gov.vn` current status — if a stable endpoint or RSS exists for OMO + rate announcements, implement direct fetch. If not, formalize VCB XML proxy as the documented fallback and flag Tier 2 in `source_tier` (1881a already specifies this — execution is the gap).

**Cost/feasibility:** Free if SBV endpoint reachable. Build effort S if endpoint found. Otherwise documentation-only (confirm VCB fallback is correct in `source_tier` field per 1881a).

---

## C. Tool Equipment Gaps (ranked by impact)

### C1. `get_ocf_vs_ni` — Operating Cash Flow vs Net Income Forensic Gate

**Tool name + signature:**
```
get_ocf_vs_ni(code: string, period_year: number, period_quarter: number)
→ { source_tier: 2, ocf: number, ni: number, accrual_ratio: number,
    ocf_ni_flag: "HEALTHY"|"WARNING"|"ALERT", m_score: number | null }
```

**Agent package:** financial-analyst (Layer 7 G-step), report-analyzer (forensic gate).

**Data unlocked:** Accruals = (NI - OCF) / avg assets. M-Score Beneish (8-variable or 5-variable simplified). F-Score Piotroski. These are the three forensic gates specified in audit-methodology.md. Currently all three are permanently skipped because no tool exposes OCF at the signal level.

**Build effort:** M — requires `cashFlowExtractor.ts` expansion (see B1) as prerequisite, then a new tool handler wrapping `ratioComputer.ts` output.

**Dependency:** B1 (OCF extraction quality).

---

### C2. `get_ism_subcomponents` — US PMI Sub-Indices via FRED

**Tool name + signature:**
```
get_ism_subcomponents()
→ { source_tier: 1, new_orders: number, employment: number,
    prices_paid: number, backlog: number, fetchedAt: string,
    regime_signal: "EXPANDING"|"CONTRACTING"|"MIXED" }
```

**Agent package:** news-scout (D-step chain analysis), unified-agent (Pillar 2 COC US-side), financial-analyst (sector-impact US manufacturing).

**Data unlocked:** True D-step compliance. Allows "new orders leading vs prices paid lagging" divergence detection — the signal that composite PMI obscures. Critical for TIGHTENING vs NEUTRAL regime disambiguation when composite PMI is near 50.

**Build effort:** S — FRED already accessed by `getFedLiquiditySpreadTool.ts`. Extend or add parallel fetcher for ISM sub-series. Monthly cron, ~100 LOC.

**Dependency:** None (FRED already integrated).

---

### C3. `get_fed_liquidity_spread` — Add to Agent Packages (Zero Build)

**Tool name:** Already exists. Gap is package registration only.

**Agent packages to update:** `financial-analyst.md`, `news-scout.md`, `unified-agent.md`.

**Data unlocked:** D-step compliance for all three agents. EFFR–IORB spread < 10 bps = reserve scarcity / QT accelerating. This is the leading indicator of Fed plumbing stress — not visible in headline rate.

**Build effort:** XS — three package file edits. No code change. Can ship this cycle if auto-cure trigger is met (3 cycles of D-step evidence required; currently monitoring).

**Dependency:** None.

---

### C4. `get_bctc_ocf` — Cash Flow Statement Extractor (standalone read tool)

**Tool name + signature:**
```
get_bctc_ocf(code: string, period_year: number, period_quarter: number)
→ { source_tier: 1, ocf_operating: number, ocf_investing: number,
    ocf_financing: number, confidence: number, extraction_method: string }
```

**Agent package:** financial-analyst, report-analyzer.

**Data unlocked:** Enables G-step without needing C1 `get_ocf_vs_ni` first. A minimal OCF reader that surfaces raw cash flow statement figures from the existing `cashFlowExtractor.ts` (129 LOC) even before M-Score is implemented. Immediate unblock for Layer 7 G-step.

**Build effort:** S — `cashFlowExtractor.ts` already exists; this is a new tool handler wiring the extractor output to the MCP interface. ~50 LOC handler. The harder work is expanding the extractor for multi-layout PDFs (see B1).

**Dependency:** B1 (extraction quality). Handler can ship first; extraction quality follows.

---

### C5. `get_vira_data` — Vietnam Business Confidence Survey

**Tool name + signature:**
```
get_vira_data(period: "latest" | string)
→ { source_tier: 1, manufacturing_pmi: number, services_pmi: number,
    business_confidence: number, period: string, source: "vira.org.vn" }
```

**Agent package:** unified-agent (E-step, Pillar 1 M2 VN-side), news-scout (VN macro chain).

**Data unlocked:** E-step full compliance (currently always "VIRA-absence noted"). Replaces TradingEconomics (Tier 2) as VN PMI primary source with VIRA (Tier 1). Changes Pillar 1 M2 analysis from secondary-source confidence to primary-source confidence.

**Build effort:** M — VPS scraper to `vira.org.vn`, monthly cron, PDF or HTML parsing.

**Dependency:** B5 (VPS scraper build).

---

### C6. `get_insider_signals` Schema Fix — Remove `outstandingShares` Required Param

**What's missing:** `get_insider_signals` currently requires `outstandingShares` as a call parameter. Financial-analyst and report-analyzer both skip insider signal checks every cycle because they don't have this value at call time. Insider signals (SSC portal = Tier 1) are permanently dark.

**Fix:** Make `outstandingShares` optional; derive it from the `stocks` table if not provided. This is a schema fix, not a new tool.

**Agent package:** financial-analyst, report-analyzer, unified-agent.

**Data unlocked:** Insider transaction data (Tier 1 SSC source). VCI fund liquidation, IMP insider sell — currently logged as "non-watchlist" or skipped. A working insider tool would catch these automatically.

**Build effort:** S — modify tool handler to fetch `outstandingShares` from DB when not provided. ~20 LOC.

**Dependency:** None.

---

### C7. Inter-Cycle Dedup Guard for news-scout — Flow Edit (pending 3rd cycle)

**Not a new tool — a flow file edit.**

news-scout fires the same macro theme (IEA oil + US CPI) as `chain_catalyst` on consecutive cycles within a 3h window: signals #3136 (03:23), #3141 (05:22), #3145 (06:22) all on 2026-05-14. The flow has no inter-cycle dedup check. Agent self-noted the issue at cycle 06:22. This is cycle 1 of evidence — auto-cure trigger requires 3.

**Target file:** `.claude/flows/news-scout/cycle.md`
**Change:** After Step 1 (regime extract), add: "Before firing chain_catalyst: query `get_agent_signals(type=chain_catalyst, since=3h)` — if same macro theme already on bus, suppress and log."

**Build effort:** XS — flow edit only. No code. Will trigger at cycle 3 of evidence (c51 or c52).

---

## D. Top-3 Priorities

### Priority 1 — BCTC OCF Extraction + `get_bctc_ocf` Tool (B1 + C4)

**Impact:** Unblocks Layer 7 G-step for financial-analyst permanently. Currently the G-step (NI vs OCF comparison) is skipped EVERY cycle for EVERY stock. This means every BCTC-based investment opinion in the system is unverified accounting profit without the forensic gate. With the BCTC Q1-2026 banking cohort (ACB, BID, CTG, EIB, MBB, VCB, VPB) filing today, the window for forensic-gated analysis of the most critical EPS event of the quarter is NOW.

The `cashFlowExtractor.ts` exists (129 LOC) but is thin. Expanding it to handle multi-layout PDFs (same fix as 1908c for balanceSheetExtractor) + wiring a `get_bctc_ocf` tool handler is the smallest path to G-step compliance. The 1908c fix for totalAssets positional drift is in-flight and will reparse VNM/DIG — the same multi-layout fix logic applies to cash flow pages.

**Downstream unblock:** Enables C1 (`get_ocf_vs_ni` + M-Score) as the next layer.

---

### Priority 2 — `get_ism_subcomponents` via FRED (B3 + C2)

**Impact:** Unblocks D-step compliance for news-scout, unified-agent, and financial-analyst simultaneously. FRED infrastructure already exists (`get_fed_liquidity_spread` uses FRED). Adding ISM sub-series is an S-effort extension that converts the single highest-frequency methodology gap (D-step: "PMI sub-components before consumer") from a permanent carry to a live check.

In the current TIGHTENING regime, the divergence between ISM new orders (leading) and prices paid (lagging) is exactly the signal that determines whether Fed is done tightening or not. Composite PMI near 50 (NEUTRAL/TIGHTENING boundary) hides this divergence. The sub-components would resolve the regime split observed across cycles 46-49 (TIGHTENING vs NEUTRAL disagreement between agents).

---

### Priority 3 — `get_fed_liquidity_spread` Package Registration (B4 + C3)

**Impact:** Zero build cost. The tool exists, FRED connection is live, Tier 1 source. Adding it to three agent packages (financial-analyst, news-scout, unified-agent) is three file edits. Immediately delivers D-step EFFR-IORB spread check to all agents making Fed liquidity claims. This is the highest leverage-per-effort item in the entire proposal.

**Caveat:** Auto-cure rule requires 3 cycles of evidence before flow/package edits. D-step has been a carry gap for 3+ cycles across financial-analyst (inferred from B/G/H skip history). Cross-referencing: c44 notes "Layer 7 [SKIP] get_cash_flow tool not found" and "get_investment_clock_phase not in package" — the same package-gap pattern. If D-step is now confirmed as a 3-cycle carry, Priority 3 can auto-cure in this cycle.

---

### The ONE Bottleneck

**BCTC extraction quality and OCF coverage is the single bottleneck that, if fixed, unblocks the most downstream agents.**

Reason: The entire forensic stack (G-step, M-Score, F-Score, accruals, BTN tricks) and the financial-analyst agent's credibility both depend on having accurate, complete BCTC figures — especially OCF. The positional drift bug (1908c) and the OCF extractor thinness (B1) are two faces of the same root gap: the PDF extraction layer cannot reliably pull all financial statement sections for complex multi-layout Vietnamese BCTC PDFs. Fix the extraction layer and Priority 1 + C1 + C4 + the forensic-analysis microservice (Sprints 1885/1886) all become executable in sequence. Without it, the forensic gate is permanently dark regardless of how many tools are registered.

---

## E. Bottom-Up Philosophy Alignment

The foundational philosophy: "Muốn hiểu một cổ phiếu, cuối cùng vẫn phải hiểu doanh nghiệp phía sau nó. Họ bán gì, kiếm tiền ra sao, khách hàng là ai, hệ thống vận hành có tốt không, và ban lãnh đạo có đủ năng lực lẫn đạo đức để chèo lái con thuyền hay không."

### Priority 1 — BCTC OCF + `get_bctc_ocf`

**Business understanding it enables:**
- **"Kiếm tiền ra sao" (makes money how):** OCF vs NI comparison is the direct test of whether reported earnings are real cash generation or accounting construction. A company with NI > 0 and OCF < 0 is not actually making money — it is consuming cash. Without OCF, we cannot answer "how does this business actually make money." For banking stocks (VCB, ACB, BID, etc.) where net interest income flows through complex accrual accounting, the OCF signal is the closest proxy to real cash generation.
- **"Ban lãnh đạo có đủ năng lực lẫn đạo đức" (management capability + ethics):** M-Score and F-Score detect earnings manipulation and financial deterioration respectively. These are direct tests of management ethics and capability. A management team that inflates NI while OCF deteriorates is a red flag on both dimensions.

### Priority 2 — `get_ism_subcomponents` (FRED)

**Business understanding it enables:**
- **"Khách hàng là ai" (who are the customers):** For export-linked VN companies (FPT's US client base, HPG's steel exports, GAS's industrial customers), the US manufacturing cycle IS the customer demand signal. ISM new orders = US manufacturers' pipeline for Vietnamese-exported inputs and services. A divergence (new orders contracting while composite PMI is 50) means US customer demand is weakening even if the headline looks stable. This directly informs "are FPT's US tech clients still buying?"
- **"Hệ thống vận hành có tốt không" (are operations good):** ISM prices paid maps to input cost pressure for VN manufacturers (HPG steel inputs, GAS energy costs). Knowing whether US supplier prices are rising or falling tells us about the operating cost trajectory for energy/commodity-linked VN businesses.

### Priority 3 — `get_fed_liquidity_spread` Package Registration

**Business understanding it enables:**
- **"Chi phí vốn" (cost of capital) at the business level:** EFFR-IORB spread below 10 bps signals that bank reserves are becoming scarce — the precursor to a liquidity squeeze that forces banks to tighten lending. For VN banking stocks (VCB, ACB, MBB), the transmission is: US reserve scarcity → USD funding cost rise → VND interbank tightening → SBV forced to defend → credit growth slows → bank NIM compression. Understanding this chain is exactly "understanding how the business makes money" for a Vietnamese commercial bank — their spread income depends on this entire chain.

---

## F. MCP Gateway Escalation (BUG)

Since `send_telegram(channel="bug")` is blocked (MCP not registered in TNB session), this section serves as the BUG escalation record.

**BUG: TNB cowork session — MCP gateway not registered for 5th consecutive cycle (c46-c50)**

- Symptom: `mcp__claude_ai_gateway__call_tool` not available as a tool in TNB's Claude Code cowork session.
- Impact: TNB cannot probe live MARKET channel, cannot issue `send_telegram`, cannot call `get_macro_snapshot` for live REGIME extraction, cannot cross-validate price claims with `get_market_snapshot`.
- Current workaround: Notebook-evidence audit mode (acceptable for quality audit; NOT acceptable for cross-validation mission steps 2+5).
- Required action: User must add MCP gateway to TNB's cowork Desktop configuration. SPIKE_C86_MCP_REG is the tracking task — verify it is unblocked.
- Severity: HIGH — 5 consecutive cycles of degraded TNB audit capability.

---

*Cycle 50 | 2026-05-14 | tran-ngoc-bau*
