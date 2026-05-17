# Tran Ngoc Bau — Working Notebook

**Last updated:** 2026-05-17 (cycle 66) | Cycles completed: 66

---

## This session (cycle 66, 2026-05-17)

File-evidence audit (8 agent notebooks + handoff c65 + dashboard). MCP unavailable in Claude Code (12th consecutive cycle — structural gap). PO ACK c160 PRESENT — loop restored. System Overall: GOOD. All 6 live cowork agents operational post-1928a. Multiple blockers resolved (1929a, 1930a, 1930c, 1921b, 1922i). digest-predict still CRITICAL (7-day silence, 1907a, gateway-independent). BCTC Q1-2026 banking (7 tickers) still unconfirmed — first FA/report-analyzer live cycle needed. FA OCF bug (1930b) shipped c157 — unverified. Cowork scheduled-task MCP integration gap newly identified (alert-commander 20:28 UTC + qa-responder 13:49 UTC both BLOCKED in automated context). news-scout 14:19 UTC transient gateway issue (resolved by 14:48 UTC per qa-responder). 0 auto-cures.

**Status:** PARTIAL (file-evidence, MCP unavailable in Claude Code) | Direction: IMPROVING | Auto-cures: 0

---

## Patterns noticed

- **Cowork scheduled-task MCP gap (NEW)**: Both alert-commander (20:28 UTC) and qa-responder (13:49 UTC) report BLOCKED in automated scheduler context — "MCP connector not available in scheduled task runner." Live Cowork agent cycles work. Cron-triggered do not. Distinct from Docker/VPS outages. Sprint task needed.
- **news-scout 4-pillar behavioural improvement sustained (c66)**: #3297 (PLX) and #3298 (PDR) in 13:22 UTC cycle both use correct regime_adj (bearish×1.3, bullish×0.7 under TIGHTENING). The c65 improvement (#3288) is holding across multiple cycles. Track through c67 to confirm as durable.
- **digest-predict 1907a structure**: PO c160 confirms Claude Desktop IS running (launchctl). No crontab/plist trigger found. Problem is trigger/schedule, not gateway. User-level launchctl investigation required.
- **TNB Claude Code MCP**: 12th consecutive cycle without MCP in Claude Code context. File-evidence audit is the established fallback. Should be investigated at infrastructure level.

---

## Carry-over (next session)

- **digest-predict / 1907a** (CRITICAL): 7-day silence. User action: `launchctl list | grep digest` + check plist in ~/Library/LaunchAgents/.
- **BCTC Q1-2026 banking** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB — FA + report-analyzer get_bctc_full on Monday 02:00 UTC cycle.
- **FA OCF verification** (MEDIUM): Confirm get_cash_flow plausible post-1930b in next FA live session.
- **Cowork scheduler MCP gap** (MEDIUM): Alert-commander + qa-responder automated cycles BLOCKED. Sprint task needed.
- **news-scout 14:19 UTC transient** (LOW): Monitor 15:XX UTC alert-commander to confirm resolved or new episode.
- **1897b git HEAD.lock VirtioFS H4** (MEDIUM): F1 USER action pending.
- **TNB Claude Code MCP** (MEDIUM): 12th cycle. Infrastructure investigation needed.
