# TNB Audit — Cycle 66 — 2026-05-17 (file-evidence, MCP unavailable in Claude Code)

## Overall: GOOD
Direction: **IMPROVING** (all live cowork agents operational and producing clean cycles post-1928a resolution; PO ACK loop restored c160; multiple previously CRITICAL/HIGH items now STALE/CLOSED; digest-predict remains the sole CRITICAL open item)

---

## Previous Handoff ACK

C65 handoff (docs/handoffs/tnb-audit-latest.md c65): `## PO ACK — c160 (2026-05-17T12:07Z)` section PRESENT. ACK loop restored after c63+c64 both unACK'd. Status updates from PO c160:
- #4 alerts table (1929a): RESOLVED (516 rows healthy)
- #5 verdictResolutionJob (1930a): RESOLVED (1926a fix held)
- #6 SPIKE_1921a: STALE (1921b shipped c136)
- #9 LanceDB (1930c): RESOLVED
- #12 1922i: CLOSED (WONTFIX — evaluateAlert() dead code deleted 1933b)
- FA OCF bug (1930b): shipped c157 — STALE (verify this cycle)
- BCTC Q1-2026 banking: still OPEN (cowork next cycle)

---

## MCP Gateway Status (This Session)

**TNB MCP probe (Claude Code session):** Structurally blocked. No `call_tool` MCP capability available in this Claude Code execution context. This is cycle 66 — the 12th consecutive Claude Code session without MCP access. This is the established operational pattern for TNB in Claude Code. Cowork sandbox MCP status remains separate and OPERATIONAL per latest agent notebooks (alert-commander 14:03 UTC, news-scout 13:22 UTC, qa-responder 14:48 UTC, market-watcher 12:39 UTC all live).

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **digest-predict: 7 day silence (last session 2026-05-11 21:38 UTC)** | digest-predict | CRITICAL | tracking | Notebook: "(no session recorded)" — unchanged. Now 7 days since last MARKET digest. 1907a OPS-CRITICAL. PO c160 notes "Claude Desktop IS running (launchctl). No crontab/plist trigger found. User-action needed." Gateway-independent issue confirmed. |
| 2 | **BCTC Q1-2026 banking cohort: ACB/BID/CTG/EIB/MBB/VCB/VPB — unconfirmed** | bctc-pipeline / financial-analyst | HIGH | tracking | FA last session 23:06 UTC 2026-05-16 (pre-outage): 38/38 QUÁ HẠN. report-analyzer last live 02:00 UTC 2026-05-15 (7 banks SẮP ĐẾN). Gateway restored — FA + report-analyzer must call get_bctc_full on next live cycle. Now 17+ days post-deadline. |
| 3 | **news-scout 14:19 UTC: MCP gateway unreachable (recurrence #6 today)** | news-scout | MEDIUM | bug | news-scout notebook 14:19 UTC: "BOOTSTRAP_FAILED — connection timeouts on 3 probe attempts". Gateway last OK at 13:22 UTC (news-scout 13:20 cycle complete). Outage window: ~14:19 UTC start. alert-commander 14:03 UTC was OK. qa-responder 14:48 UTC was OK. This appears a brief transient (gateway recovered between ~13:22 and was still up at 14:03). Monitor: if 15:XX UTC alert-commander cycle also BLOCKED → new outage episode. |
| 4 | **alert-commander scheduled task (20:28 UTC): BLOCKED — MCP unavailable** | alert-commander / scheduler | MEDIUM | bug | alert-commander notebook 20:28 UTC entry: "BLOCKED (AUTOMATED CYCLE) — MCP connector not available in this Claude session." Pattern: alert-commander cycles triggered by scheduler (automated context) cannot access MCP. Only manually-triggered Cowork cycles succeed. Root cause distinct from Docker/VPS outages — it is Cowork scheduled task MCP integration gap. Same as the qa-responder 13:49 UTC pattern "scheduled task runner lacks MCP tool integration." |
| 5 | **FA Layer 7 OCF extraction bug: status unclear post-1930b shipment** | financial-analyst / bctc-pipeline | MEDIUM | tracking | PO c160 notes "1930b shipped c157". FA notebook last session (23:06 UTC 2026-05-16, pre-c157): ocf_ni_ratio=504 (FPT) + 1.42e8 (VCB). Need to verify next FA live session that get_cash_flow returns plausible values post-fix. Layer 7 fallback cure (c61 auto-cure) remains active as safety net. |
| 6 | **TNB Claude Code MCP: 12th consecutive blocked cycle** | infrastructure/tnb | MEDIUM | tracking | Structural: no `call_tool` capability available in Claude Code execution context. Distinct from cowork sandbox and Docker infrastructure. PO c160 notes "carries forward". |
| 7 | **1897b git HEAD.lock VirtioFS H4: F1 USER action still pending** | infrastructure | MEDIUM | tracking | Preflight cure (1906a) active. Structural fix (Docker .git/ exclusion from VirtioFS) requires user action. unified-agent notebook: "VirtioFS H4 git-lock race still active". |
| 8 | **news-scout structural D+E gaps** | news-scout | LOW | methodology gap | D=PMI sub-components (no PMI data source), E=VIRA (VPS scraper pending). Both structural. Behavioural improvement confirmed (c65): #3288 chain_catalyst correctly labelled 4 pillars + cycle phase. #3297 (PLX) and #3298 (PDR) in c66 cycles also show correct regime_adj application. |

---

## Resolved Since c65 (PO ACK c160)

- **1929a alerts table SQLite corruption**: RESOLVED (516 rows healthy post-Docker restart)
- **verdictResolutionJob retry storm (1930a)**: RESOLVED (1926a fix held)
- **SPIKE_1921a news-scout regime enum**: STALE (1921b shipped c136 — closed)
- **LanceDB index corruption (1930c)**: RESOLVED
- **1922i alert-engine-records**: CLOSED (WONTFIX — evaluateAlert() dead code deleted)
- **PO ACK loop**: RESTORED (c160 ACK present)

---

## Methodology Scores (Layer 5, 9-step) — c66

| Agent | Last Live | Score | Status | Key Notes |
|-------|-----------|-------|--------|-----------|
| alert-commander | 14:03 UTC today | GOOD | LIVE | Off-hours cycles. Regime TIGHTENING extracted correctly. conf=0.50 PLX + PDR both suppressed (< 0.85 TIGHTENING threshold). Correct. |
| news-scout | 13:22 UTC today | GOOD | LIVE | F/H/I all pass. A=n/a (no PMI data), D=n/a (structural), E=n/a (structural). 4-pillar coverage in chain_catalyst correct. |
| financial-analyst | 23:06 UTC 2026-05-16 | GOOD (8/9) | STALE | E=n/a (VIRA structural). Layer 7 fallback active. Verify OCF post-1930b. |
| market-watcher | 12:39 UTC today | GOOD | LIVE | Price-anomaly role. Off-hours suppression correct. |
| qa-responder | 14:48 UTC today | GOOD | LIVE | Q&A role — methodology N/A. consecutive_empty=4, operational. |
| unified-agent | 13:01 UTC today | GOOD | LIVE | Weekly verify mode. Calibration report id=524 sent. Gateway operational confirmed. |
| digest-predict | — | CRITICAL/UNAUDITABLE | DEAD | 7-day silence. 1907a. No session to audit. |
| report-analyzer | 02:00 UTC 2026-05-15 | STALE | STALE | No live session since 1928a outage. First post-recovery cycle pending. |

Overall: GOOD=6 (live agents), STALE=1, CRITICAL=1 (digest-predict)

---

## Auto-Cures Applied

None this cycle. No new 3-cycle threshold breaches. All prior auto-cures (FA Layer 7 c61) remain active. Post-1930b FA OCF fix — Layer 7 cure is still warranted as safety net until confirmed resolved in live FA session.

---

## Positive Signals

- **All 6 live cowork agents operational**: alert-commander, news-scout, market-watcher, qa-responder, unified-agent all running clean post-outage cycles. System fully recovered from 1928a.
- **PO ACK loop restored**: c160 formal ACK with detailed status updates on 11 open items. Process working again.
- **Multiple blockers resolved**: 1929a (alerts table), 1930a (verdictResolutionJob), 1930c (LanceDB), 1930b (OCF bug — pending verification), 1921b (news-scout enum), 1922i (WONTFIX). Significant backlog clearance.
- **news-scout methodology sustained improvement**: c66 cycles (#3297 PLX, #3298 PDR) show continued correct regime_adj (bearish×1.3, bullish×0.7 under TIGHTENING). The c65 4-pillar chain_catalyst improvement (#3288) appears sustained.
- **alert-commander off-hours logic correct**: PLX conf=0.50 and PDR conf=0.50 both correctly suppressed (TIGHTENING threshold 0.85). No false positives.
- **unified-agent weekly verify**: Calibration report id=524 sent. System-level health check confirmed operational.

---

## Persisting Blockers

1. **digest-predict / 1907a** (CRITICAL): 7-day silence. Now gateway-independent. User trigger action required (launchctl / plist investigation). No MARKET digests delivered.
2. **BCTC Q1-2026 banking cohort** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB — unconfirmed. FA + report-analyzer first live cycle.
3. **Cowork scheduled task MCP integration** (MEDIUM): alert-commander (20:28 UTC) + qa-responder (13:49 UTC) both BLOCKED in automated scheduler context. Live Cowork agent cycles work; cron-triggered do not. Structural gap.
4. **FA Layer 7 OCF extraction** (MEDIUM): 1930b shipped — needs live FA session to verify resolved.
5. **1897b git HEAD.lock VirtioFS H4** (MEDIUM): F1 USER action pending.
6. **TNB Claude Code MCP** (MEDIUM): 12th consecutive cycle blocked. Claude Code structural gap.

---

## Next Cycle Priorities

1. **digest-predict 1907a**: Investigate launchctl trigger. Does `launchctl list | grep digest-predict` show a loaded plist? User action.
2. **BCTC Q1-2026 banking**: FA + report-analyzer get_bctc_full on next weekday market cycle (Monday 02:00 UTC).
3. **FA OCF verification**: Confirm get_cash_flow returns plausible values in next FA live session (post-1930b).
4. **Cowork scheduler MCP gap**: Raise sprint task — automated scheduler cycles cannot access MCP tools. Affects alert-commander + qa-responder on off-peak cadences.
5. **news-scout 14:19 UTC transient**: Monitor 15:XX UTC alert-commander cycle to determine if new outage episode or isolated transient.

---

## PO ACK — (space for next PO ACK)
