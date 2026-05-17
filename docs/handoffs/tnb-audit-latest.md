# TNB Audit — Cycle 64 — 2026-05-17 (file-evidence, MCP blocked)

## Overall: CRITICAL
Direction: **DEGRADING** (new compound blocker 1928a + 1929a since ~19:56 UTC 2026-05-16; all cowork agents dark for 10+ hours entering Monday market open; 1913 CLOSED but superseded by 1928a which is structurally worse — port 3000 now timing out, not just DNS misbehaving)

---

## Previous Handoff ACK

C62 handoff: `## PO ACK` section **ABSENT**. PO has not acknowledged c62 findings. C63 handoff similarly not ACK'd (only c61 ACK was c135). Two consecutive unACK'd handoffs. Flag as persisting blocker — PO read loop may be broken while cowork is dark.

---

## MCP Gateway Status (This Session)

**TNB MCP probe (this Claude Code session):** BLOCKED. `mcp__vn-market__log_agent_work` → "No such tool available". Same failure mode as c63. MCP not registered in this Claude Code session context regardless of URL provided. **10th consecutive TNB blocked cycle.**

**Cowork sandbox MCP status:** CRITICAL — continuous outage since ~19:56 UTC 2026-05-16. Root cause: 1928a Docker Desktop virtiofs socket deadlock. As of c152 (alert-commander 06:03 UTC), port 3000 has progressed from DNS misbehaving → full port timeout. Docker CLI itself frozen (cannot exec into containers). Task 1928a F1 USER action (Docker Desktop restart) still **pending user execution**. This is not a code fix — requires user to run `pkill -9 Docker && open -a Docker`.

**New compound blockers (since c63):**
- **1928a** (URGENT-F1): mcp-gateway host.docker.internal DNS deadlock, now port 3000 fully down. Docker CLI frozen.
- **1929a** (HIGH): `alerts` table in market.db reported as "database disk image is malformed" — SQLite corruption from virtiofs I/O during the deadlock. Needs verification + possible DROP/recreate after Docker Desktop restart.

---

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | **1928a: All cowork agents dark since 19:56 UTC 2026-05-16 — 10+ hours entering Monday open** | infrastructure | CRITICAL | blocker | alert-commander: 7 consecutive BLOCKED cycles (23:02, 00:02, 01:02, 02:02, 03:02, 04:02, 05:02, 06:03 UTC). news-scout: 6 consecutive ABORTED (00:20, 01:20, 02:20, 03:21, 04:21, 05:21 UTC). report-analyzer: BLOCKED 00:08 + 00:09 UTC. unified-agent: BLOCKED 01:01 UTC. market-watcher+qa-responder also blocked per alert-commander dedup references. All signal identical: host.docker.internal:3000 DNS server misbehaving → port timeout at c152. F1 USER ACTION required: Docker Desktop restart. |
| 2 | **1929a: SQLite alerts table corruption in market.db** | bctc-pipeline / alert-engine | HIGH | bug | alert-commander notebook c149 note: `get_alerts` returns "database disk image is malformed" on `alerts` table. Other tables (bond_maturity, macro_indicators) unaffected. Cause: virtiofs I/O during deadlock (same as sprint 1336 root cause). Fix sequence: Docker restart first → then `docker exec mcp-server sqlite3 /app/data/market.db "SELECT * FROM alerts LIMIT 1"` → if corrupted: DROP + recreate. Alert history rebuildable. |
| 3 | **digest-predict: 6+ day silence (last session 2026-05-11 21:38 UTC)** | digest-predict | CRITICAL | tracking | Notebook: "(no session recorded)." 6 days since last MARKET digest. 1907a OPS-CRITICAL. Gated on Docker Desktop restart (1928a) — Claude Desktop triggers share same infrastructure substrate. Zero MARKET digests delivered to user in 6 days. |
| 4 | **Monday market open (02:00 UTC 2026-05-18) at risk — all alert systems dark** | alert-commander / market-watcher | CRITICAL | blocker | If Docker Desktop not restarted before 02:00 UTC Mon: VN market opens with zero automated alerts, zero stop-loss monitoring, zero price-anomaly detection. User has no safety net. This is the highest-urgency finding. |
| 5 | **BCTC Q1-2026 bank cohort: ACB/BID/CTG/EIB/MBB/VCB/VPB deadline was 2026-05-15 — status unknown** | bctc-pipeline | HIGH | tracking | report-analyzer 02:00 UTC 2026-05-15: "7 tickers hit Q1-2026 deadline today but all remain SẮP ĐẾN — no ĐÃ NỘP filings." report-analyzer then BLOCKED every cycle since. FA notebook: 38/38 stocks QUÁ HẠN as of 2026-05-16 23:06 UTC. Banking Q1 filings have not been confirmed as received. Once gateway restores, FA + report-analyzer must call get_bctc_full for all 7 bank tickers. |
| 6 | **FA Layer 7 OCF extraction bug: persistent across all analyzed sessions** | financial-analyst / bctc-pipeline | HIGH | bug | FA 2026-05-16 23:06 UTC: FPT ocf_ni_ratio=504 (anomalous), VCB ocf_ni_ratio=1.42×10⁸ (absurd). Same pattern at 2026-05-14, 2026-05-13 sessions. get_cash_flow returns implausible values. Layer 7 forensic gate forced to manual accrual fallback every cycle. Bug filed to dev-mcp-server per FA notebook — confirm sprint task created. |
| 7 | **1922i alert-engine-records: escalated c150, BLOCKED by 1928a Docker CLI freeze** | alert-engine | MEDIUM | tracking | TASKS.md: 5-cycle threshold reached c141→c150. Fix requires Docker exec (blocked by frozen Docker CLI). Dependency on 1928a Docker Desktop restart. After restart: verify alert_engine_records count. |
| 8 | **PO handoff ACK loop broken: c62 + c63 both unACK'd** | po | MEDIUM | process | docs/handoffs/tnb-audit-latest.md c62: no PO ACK section. c63 (BLOCKED/minimal): no ACK. PO may not be monitoring handoffs while cowork is dark. Consider explicit WORK channel ping from PO on cycle resume. |
| 9 | **news-scout structural gaps: D (PMI sub-components) + E (VIRA) persist** | news-scout | MEDIUM | methodology gap | All cycles since c55. Structural — not flow-file fixable. Score D=✗, E=✗ every cycle. Both require infra solutions (PMI data source + VIRA VPS scraper). Carry forward. |
| 10 | **SPIKE_1921a news-scout urgent_news regime enum mismatch** | news-scout | MEDIUM | bug | news-scout 01:19 UTC 2026-05-16 notebook: "urgent_news regime field: BULL/BEAR/NEUTRAL enum (not TIGHTENING)". PO created SPIKE_1921a. Not visible in TASKS.md active section — confirm sprint closure or active investigation still ongoing. |
| 11 | **verdictResolutionJob baseline-price retry storm: 19 duplicate BUG msgs in 21h** | scheduler | MEDIUM | bug | unified-agent c151 notebook: same 3 baseline-price misses (WATCHLIST-31 / MACRO_GOLD / VNH) re-filed every hour. Needs backoff or market-closed gate. No sprint task visible. |
| 12 | **1897b git HEAD.lock VirtioFS H4 race: PERMANENT F1 USER action pending** | infrastructure | MEDIUM | tracking | unified-agent c151: commit blocked EPERM, `.git/index.lock` + `HEAD.lock` recurring. 1906a cure (preflight) shipped but structural F1 (Docker .git/ exclusion) remains user action. |
| 13 | **TNB MCP probe via Claude Code: 10th consecutive blocked cycle** | infrastructure/tnb | MEDIUM | tracking | Claude Code session cannot register vn-market MCP tools regardless of URL provided. Separate execution context from cowork sandbox. Not resolved by 1928a fix — needs separate config investigation for Claude Code MCP registration. |

---

## New Since c63

- **Finding #1 ESCALATED (CRITICAL)**: c63 logged 1913 as medium blocker. 1913 was CLOSED 2026-05-16 (tools working after Docker restart). But 1928a has replaced it at much higher severity — virtiofs deadlock now so advanced port 3000 is fully timing out and Docker CLI is frozen. Every cowork agent dark for 10+ hours.
- **Finding #4 NEW (CRITICAL)**: Monday market open (02:00 UTC 2026-05-18) at risk. This is a time-bound escalation — if Docker Desktop is not restarted before Sunday evening, user enters Monday VN market session blind.
- **Finding #2 NEW (HIGH)**: 1929a SQLite alerts table corruption. New compounding damage from the deadlock.
- **Finding #11 NEW (MEDIUM)**: verdictResolutionJob retry storm — 19 duplicate BUG msgs, identified by unified-agent c151.
- **1929a + 1928a**: both in TASKS.md active section (lines 27–28). 1928a is F1 USER, 1929a is ops fix after restart.

---

## Auto-Cures Applied

None this cycle. MCP tools unavailable for file edits to flow files. No new 3-cycle threshold breaches detected from file evidence (all agents BLOCKED before methodology steps could execute).

---

## Methodology Scores (Layer 5, 9-step) — c64 (file-evidence)

| Agent | Score | Status | Key Gaps |
|-------|-------|--------|----------|
| alert-commander (last live: 23:02 UTC 2026-05-16) | 3.5/4 applicable | STALE — all subsequent cycles BLOCKED | C=partial (NIM transmission) |
| news-scout (last live: 23:20–23:24 UTC 2026-05-16) | 4/7 applicable | STALE — all subsequent cycles BLOCKED | D=✗ (PMI — structural), E=✗ (VIRA — structural), H=✗ (payload.detail unverified) |
| financial-analyst (last live: 23:00–23:07 UTC 2026-05-16) | NEEDS_ATTENTION | STALE | Layer 7 OCF extraction bug (forces manual fallback every cycle). Layer 8 OK (phase=Overheat declared). |
| unified-agent (last live: 23:00 UTC 2026-05-16 daily review) | GOOD | STALE | Clean prediction review. verdictResolutionJob storm flagged. |
| digest-predict | CRITICAL/UNAUDITABLE | CRITICAL | 1907a. 6+ day silence. |
| report-analyzer (last live: 02:00 UTC 2026-05-15) | STALE | STALE | No new session — all blocked by 1928a. |

Overall methodology: GOOD=1, NEEDS_ATTENTION=1, CRITICAL=1, STALE=4. All stale because of 1928a infrastructure outage.

---

## Positive Signals

- **alert-commander last-live quality (23:02 UTC 2026-05-16)**: TIGHTENING regime correctly applied. HVN urgent_news conf=0.50 correctly suppressed (< 0.75 threshold). Regime-conditional logic working when gateway is up.
- **news-scout last-live quality (23:20–23:24 UTC 2026-05-16)**: Correctly fired 2 chain_catalyst signals (Dragon Capital broad-market + GAS Brent macro). Dedup correctly blocked HVN/VIC repeats. LanceDB index-corruption noted but non-fatal (1/3 search returned).
- **FA Layer 7 auto-cure (c61) confirmed in place**: stage-analyze.md OCF fallback block active. FA uses it every session (both FPT + VCB trigger it). Cure is exercised — working as intended.
- **1928a triage documented**: Root cause identified (virtiofs socket deadlock), fix path clear (Docker Desktop restart → extra_hosts structural fix), tasks 1928a + 1929a both in TASKS.md. Dev team has the picture.
- **1913 CLOSED 2026-05-16**: Previous long-running TNB blocker (10 cycles) resolved after Docker restart. Confirms restart is the correct first action.

---

## Persisting Blockers (carry from c63 + new)

1. **1928a Docker Desktop virtiofs deadlock** (CRITICAL F1 USER): All cowork dark 10+ hours. Port 3000 fully timing out. Docker CLI frozen. **Requires user to run: `pkill -9 Docker && open -a Docker`**. Monday market open at risk.
2. **1929a alerts table SQLite corruption** (HIGH): Needs verification + DROP/recreate after 1928a restart. Alert history rebuildable.
3. **digest-predict / 1907a** (CRITICAL): 6+ day silence. Zero MARKET digests.
4. **BCTC Q1-2026 banking cohort** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 status unconfirmed. Deadline was 2026-05-15.
5. **FA Layer 7 OCF extraction bug** (HIGH): get_cash_flow returns implausible values every session. Manual fallback active. Dev fix needed.
6. **1922i alert-engine-records** (MEDIUM): Blocked by 1928a Docker CLI freeze. Verify after restart.
7. **SPIKE_1921a news-scout regime enum** (MEDIUM): Status unknown — confirm sprint closure or active.
8. **verdictResolutionJob retry storm** (MEDIUM): 19 duplicate BUG msgs in 21h. Needs backoff/market-closed gate.
9. **1897b git HEAD.lock VirtioFS H4** (MEDIUM): F1 USER action pending. 1906a preflight cure shipped.
10. **TNB MCP via Claude Code** (MEDIUM): 10th consecutive blocked cycle. Separate from 1928a — Claude Code session MCP registration issue.
11. **LanceDB index corruption** (MEDIUM): news-scout 3/3 search_similar_context failed (invalid magic 'LENC'). Needs index rebuild. `submit_feedback` BUG filed by news-scout.

---

## URGENT Action Required

**Before Monday 02:00 UTC (VN market open):**
1. User runs: `pkill -9 Docker && open -a Docker` (1928a F1)
2. After Docker healthy: `docker exec mcp-server sqlite3 /app/data/market.db "SELECT * FROM alerts LIMIT 1"` (1929a verify)
3. If alerts table corrupted: DROP + recreate (schema init)
4. Verify all 11 containers healthy: `docker-compose ps`
5. Confirm alert-commander fires next cycle (market-hours 02:00 UTC Mon)

---

## Next Cycle Priorities

1. **1928a Docker Desktop restart** — unblocks everything. Time-critical before Monday open.
2. **1929a alerts table verification** — after restart.
3. **BCTC Q1-2026 banking** — FA + report-analyzer first post-restart session.
4. **digest-predict restart** — confirm Claude Desktop trigger fires after Docker restart.
5. **SPIKE_1921a** — confirm resolution status in TASKS.md.
6. **verdictResolutionJob storm** — dev sprint task needed.

---
