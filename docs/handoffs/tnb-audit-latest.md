# TNB Audit — Cycle 65 — 2026-05-17 (file-evidence, MCP Claude Code session blocked)

## Overall: NEEDS_ATTENTION
Direction: **IMPROVING** (1928a outage resolved; cowork agents recovered 08:02–10:39 UTC; news-scout + alert-commander + market-watcher all live; methodology scores GOOD for all live agents; digest-predict still critical; OCF extraction bug persists; verdictResolutionJob storm continues)

---

## Previous Handoff ACK

C64 handoff (docs/handoffs/tnb-audit-latest.md c64): `## PO ACK` section **ABSENT**. PO c156 notebook references "TNB c64 follow-ups — re-evaluate priority once Docker up" but no formal ACK written. Two consecutive unACK'd handoffs (c63 + c64). Flagged as persisting process gap. Findings from c64 remain valid and are carried forward below.

---

## MCP Gateway Status (This Session)

**TNB MCP probe (Claude Code session):** BLOCKED. `mcp__vn-market__*` tools not registered in this Claude Code session context. Same 10-cycle pattern as prior sessions — separate from cowork sandbox infrastructure.

**Cowork sandbox MCP status:** RESTORED. Evidence:
- alert-commander: success at 10:02 UTC (log_agent_work id=939, 9 tool calls)
- news-scout: success at 09:21 UTC (chain_catalyst #3288 fired)
- market-watcher: success at 10:39 UTC (38 stocks monitored, 0 anomalies)

1928a Docker Desktop virtiofs deadlock RESOLVED. Outage window: 2026-05-16 19:40 UTC → 2026-05-17 08:02 UTC (~12h). Root cause: Docker Desktop virtiofs socket deadlock (3rd occurrence in 3 weeks per pattern log).

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **digest-predict: 6+ day silence (last session 2026-05-11 21:38 UTC)** | digest-predict | CRITICAL | tracking | Notebook: "(no session recorded)." 6 days since last MARKET digest. 1907a OPS-CRITICAL. No MARKET digests delivered to user in 6 days. PO c156 carry-over flags "1907a digest-predict CRITICAL OPS — observe." |
| 2 | **FA Layer 7 OCF extraction bug: persistent — every live session for 5+ cycles** | financial-analyst / bctc-pipeline | HIGH | bug | FA 2026-05-16 23:06 UTC: FPT ocf_ni_ratio=504 (anomalous), VCB ocf_ni_ratio=1.42e8 (absurd). Same pattern at 2026-05-14, 2026-05-13, 2026-05-12 sessions. Layer 7 fallback cure active (c61 auto-cure confirmed exercised). Dev fix still needed for get_cash_flow. Task 1930b queued per PO c156. |
| 3 | **BCTC Q1-2026 bank cohort: ACB/BID/CTG/EIB/MBB/VCB/VPB — status still unknown post-restart** | bctc-pipeline | HIGH | tracking | Deadline was 2026-05-15. report-analyzer last live 02:00 UTC 2026-05-15 — all 7 showed SẮP ĐẾN. FA notebook: 38/38 watchlist QUÁ HẠN as of 2026-05-16 23:06. Now that gateway is restored, FA + report-analyzer must call get_bctc_full for all 7 bank tickers on first post-restart cycle. |
| 4 | **1929a SQLite alerts table corruption in market.db** | bctc-pipeline / alert-engine | HIGH | bug | alert-commander c149 noted "database disk image is malformed" on alerts table. Verification not yet confirmed post-Docker restart. Action: `docker exec mcp-server sqlite3 /app/data/market.db "SELECT * FROM alerts LIMIT 1"` — if corrupted: DROP + recreate. Task 1929a in TASKS.md per PO c156 (blocked track pending Docker restart). |
| 5 | **verdictResolutionJob baseline-price retry storm: 19 dup BUG msgs in 21h** | scheduler | MEDIUM | bug | unified-agent c151 (last live daily review): same 3 baseline-price misses (WATCHLIST-31 / MACRO_GOLD / VNH) re-filed every hour. Needs backoff or market-closed gate. PO c156 references 1930a as blocked track. |
| 6 | **SPIKE_1921a news-scout urgent_news regime enum mismatch** | news-scout | MEDIUM | bug | news-scout 01:19 UTC 2026-05-16: "urgent_news regime field: BULL/BEAR/NEUTRAL enum (not TIGHTENING)". PO created SPIKE_1921a. Not visible in TASKS.md active section per c64 — confirm sprint closure or active investigation. |
| 7 | **PO handoff ACK loop broken: c63 + c64 both unACK'd** | po | MEDIUM | process | docs/handoffs/tnb-audit-latest.md c64: no PO ACK section. c63: no ACK. PO c156 carry-over mentions "TNB c64 follow-ups" without formal ACK. Two consecutive unACK'd handoffs. Consider adding ACK step to PO flow. |
| 8 | **news-scout structural gaps: D (PMI sub-components) + E (VIRA) persist** | news-scout | MEDIUM | methodology gap | Structural across all cycles. Score D=✗, E=✗ every cycle. Both require infra solutions (PMI data source + VIRA VPS scraper). Partially mitigated: news-scout now correctly applies COC headwind caveat and 4-pillar coverage in chain_catalyst metadata (#3288). |
| 9 | **LanceDB index corruption: news-scout search_similar_context broken** | news-scout / rag-service | MEDIUM | bug | All 3-4 search calls per cycle returning "invalid magic 'LENC'" or empty. BUG filed by news-scout. Task 1930c per PO c156 (blocked track). Needs index rebuild post-Docker-restart. |
| 10 | **1897b git HEAD.lock VirtioFS H4 race: permanent F1 USER action still pending** | infrastructure | MEDIUM | tracking | 1906a preflight cure shipped. Structural F1 (Docker .git/ exclusion from VirtioFS) remains user action. unified-agent commit blocked EPERM in last live cycle. |
| 11 | **TNB MCP probe via Claude Code: 11th consecutive blocked cycle** | infrastructure/tnb | MEDIUM | tracking | Claude Code session cannot register vn-market MCP tools regardless of URL. Separate execution context from cowork sandbox. Not resolved by 1928a fix. Needs Claude Code MCP config investigation. |
| 12 | **1922i alert-engine-records: 5-cycle threshold, blocked by 1928a** | alert-engine | MEDIUM | tracking | Docker restart unblocked Docker CLI. Verify alert_engine_records count now that gateway is live. |

---

## New Since c64

- **1928a RESOLVED (CRITICAL → closed):** Docker Desktop restart completed. All cowork agents recovered. alert-commander, news-scout, market-watcher all running clean cycles as of 08:02–10:39 UTC.
- **Finding #1 DOWNGRADED (CRITICAL):** digest-predict silence remains CRITICAL but is now isolated — not masked by infrastructure outage. It requires its own investigation (1907a) separate from 1928a.
- **Finding #3 ACTIONABLE NOW:** BCTC Q1-2026 banking cohort can now be checked — gateway is live.
- **Finding #4 ACTIONABLE NOW:** 1929a alerts table verification can now be executed.
- **news-scout methodology IMPROVEMENT:** #3288 cycle correctly included 4-pillar coverage (M2/COC/EPS/POL all addressed) and cycle phase (recovery/equity). First time this has been observed post-TIGHTENING shift. Positive signal.
- **alert-commander post-outage behavior GOOD:** Clean slate after outage, regime thresholds applied correctly, 0 inappropriate MARKET fires.

---

## Auto-Cures Applied

None this cycle. No new 3-cycle threshold breaches detected. All agents were blocked by infrastructure during the outage window — methodology errors cannot be distinguished from infrastructure errors during BLOCKED cycles. The one applicable auto-cure (FA Layer 7 c61) is confirmed active and exercised.

---

## Methodology Scores (Layer 5, 9-step) — c65

| Agent | Score | Status | Key Gaps |
|-------|-------|--------|----------|
| alert-commander (10:02 UTC today) | GOOD — applicable steps all pass | LIVE | Off-hours cycle — most steps N/A. Regime thresholds correct. |
| news-scout (09:21 UTC today) | GOOD — 5/6 applicable | LIVE | A=✗(PMI data gap), D=✗(PMI structural), E=✗(VIRA structural). F/H now correctly applied. |
| financial-analyst (23:06 UTC 2026-05-16) | GOOD — 8/9 | STALE (last live pre-outage) | E=✗(VIRA structural). All other steps pass. Layer 7 cure active. |
| market-watcher (10:39 UTC today) | GOOD | LIVE | Price anomaly role — most methodology steps N/A. |
| unified-agent (01:01 UTC today — BLOCKED) | STALE | BLOCKED | Last live cycle clean per c64. |
| digest-predict | CRITICAL/UNAUDITABLE | CRITICAL | 6+ day silence. 1907a. |
| report-analyzer (02:00 UTC 2026-05-15) | STALE | STALE | No live session since outage began. |
| qa-responder | STALE | RECOVERED (per notebook 07:50 UTC was last BLOCKED; gateway now up) | Methodology N/A (Q&A role, no investment thesis). |

Overall: GOOD=4 (live agents), STALE=3, CRITICAL=1 (digest-predict)

---

## Positive Signals

- **1928a RESOLVED:** All cowork agents recovered. alert-commander + news-scout + market-watcher all running clean cycles post-restart.
- **news-scout #3288 methodology improvement:** 4-pillar coverage (M2/COC/EPS/POL) + cycle phase (recovery/equity tier) explicitly included in chain_catalyst signal for first time post-TIGHTENING shift. A=✗ and D=✗ are structural (no PMI data), not behavioural gaps.
- **alert-commander TIGHTENING suppression working correctly:** Dragon Capital "3 cú hích" raw score 8.0 → adj_score 5.6 (×0.7 TIGHTENING) correctly suppressed. Regime logic applied without gap.
- **FA Layer 7 auto-cure (c61) CONFIRMED EXERCISED:** Both FPT and VCB triggered the fallback path in every live FA session. Cure is live, working, preventing silent Layer 7 bypass.
- **Market-watcher post-recovery:** 38 stocks monitored, 0 false positives, regime NEUTRAL correctly applied.
- **PO productive during outage:** Frontend zone (1931a + 1932a shipped), 1862c-F dispatched, 1930b queued. System remained productive during 12h gateway outage via gateway-independent work streams.

---

## Persisting Blockers

1. **digest-predict / 1907a** (CRITICAL): 6+ day silence. Zero MARKET digests. Now gateway-independent issue.
2. **FA Layer 7 OCF extraction bug** (HIGH): get_cash_flow returns implausible values every session. Manual fallback active. Dev fix needed (1930b queued).
3. **BCTC Q1-2026 banking cohort** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 status unconfirmed. Verify on next FA/report-analyzer cycle.
4. **1929a alerts table SQLite corruption** (HIGH): Needs verification + DROP/recreate if malformed.
5. **verdictResolutionJob retry storm** (MEDIUM): 19 dup BUG msgs/21h. Sprint task 1930a blocked pending Docker-restart confirmation.
6. **SPIKE_1921a news-scout regime enum** (MEDIUM): Status unknown.
7. **LanceDB index corruption** (MEDIUM): news-scout RAG broken. 1930c blocked track.
8. **1897b git HEAD.lock VirtioFS H4** (MEDIUM): F1 USER action pending.
9. **TNB MCP via Claude Code** (MEDIUM): 11th consecutive blocked cycle. Needs Claude Code MCP config fix — separate from 1928a.
10. **PO ACK loop** (MEDIUM): c63 + c64 handoffs unACK'd. Process gap.
11. **1922i alert-engine-records** (MEDIUM): Verify count now that Docker CLI is unfrozen.

---

## Next Cycle Priorities

1. **BCTC Q1-2026 banking** — FA + report-analyzer: get_bctc_full for ACB/BID/CTG/EIB/MBB/VCB/VPB. Gateway now live.
2. **1929a alerts table verification** — docker exec + SELECT query. Fix if corrupted.
3. **1930b (get_cash_flow fix)** — 1862c-F code landed? If yes, queue 1930b.
4. **digest-predict (1907a)** — Confirm Claude Desktop trigger is firing post-1928a restart.
5. **1922i alert-engine-records** — Verify count now that Docker CLI is accessible.
6. **SPIKE_1921a closure** — Confirm status in TASKS.md.
7. **TNB Claude Code MCP config** — Investigate why Claude Code session cannot register vn-market tools.

---
