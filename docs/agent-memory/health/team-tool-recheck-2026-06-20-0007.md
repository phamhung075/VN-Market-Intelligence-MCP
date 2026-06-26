# Team MCP Tool Health Recheck — 2026-06-20T00:07Z

**Probe window:** 2026-06-19T23:50Z – 2026-06-20T00:07Z
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — **REACHABLE** ✅
**Probed tools:** 20 read-only calls across all cowork/dev agent dependencies
**Prior report:** `team-tool-recheck-2026-06-19-2207.md`
**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-20-0007.md`
**Server uptime at probe:** ~5h 3m (restarted ~19:04 UTC June 19)

---

## STEP 3c — RE-PROBE VERIFICATION TABLE

Each prior finding re-probed fresh this cycle before carry-forward decision.

| Prior Finding | Re-probe command | Result |
|---|---|---|
| BUG-2 (ISM no_data) | NOT re-probed this cycle | UNCERTAIN — insufficient data to confirm or deny; carried as uncertain |
| BUG-3 (BCTC VPS) | `get_vps_service_health` + `get_vps_proxy_health` + `get_sla_status` | `vn-bctc-fetch: unhealthy, 0ms response, uptime 3d 5h 57m` · `bctc STALE, last push 2026-06-16 18:02:24` · SLA breach `4523 min / 936 min threshold = CRITICAL` — **WORSENING** (+121 min vs 22:07Z) |
| BUG-4 (SBV zero-value) | `get_system_status` errors | `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` — recurring every 30 min; vn-sbv-fetch service restarted (59m uptime at 00:07Z), **ONGOING** |
| ISSUE-1 (Reuters RSS) | `get_system_status` source health | `Reuters RSS | Ngưng | Chưa bao giờ | 51 ⚠` — was 33 at 22:07Z, now 51 in 2h (+18 failures) — **ONGOING** |
| ISSUE-2 (Trading Economics ×2) | `get_system_status` source health | Both TE entries `Ngưng | Chưa bao giờ | 51 ⚠` — same delta as Reuters — **ONGOING** |
| ISSUE-3 (intel-cycle overlap) | `get_system_status` recent errors | Not directly re-observed in this probe window (off-peak hour); UNCERTAIN |
| ISSUE-6 (vnstock slow) | `get_cron_health` | `vnstockTradingStatsRefresh: 85.7% success, avg 649220ms` — **UNCHANGED** |
| NEW-3 (system-map watchlist drift) | Not re-probed | IMPROVE — carry forward |
| NEW-4 (digest W25 old key) | Not re-probed | IMPROVE — carry forward; Sunday June 22 risk still present |
| NEW this cycle: HNX/UPCOM price loop | `get_system_status` recent errors | `[hnx] all UPCOM price sources failed` and `[hnx] all HNX price sources failed` — 10 errors in 5-min window as of 00:04Z. CB shows 0 failures (CB not tripping) — **NEW** |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUGs

| # | Tool / Component | Class | Evidence (this cycle — 00:07Z) | Caller Count | Suggested Fix |
|---|-----------------|-------|-------------------------------|-------------|---------------|
| BUG-3 | BCTC VPS pipeline (`vn-bctc-fetch`) | BUG | Re-probe 00:03Z: `vn-bctc-fetch: unhealthy, 0ms response, uptime 3d 5h 57m`. `get_vps_proxy_health`: `bctc STALE, last push 2026-06-16 18:02:24, 0 items in 24h`. `get_sla_status`: bctc breach **4523 min / 936 min threshold = CRITICAL** (was 4402 at 22:07Z — worsening at ~1 min/min). `get_system_status`: BCTC data `75.4h old ("Rất cũ")`. 10 watchlist tickers `QUÁ HẠN` in earnings calendar. NOT in `get_recent_fixes`. | 2 flows: `bctc-analyst` Q1-2026 queue blocked; `refine_bctc_md` pending queue stale. `get_bctc_full` returns stale data for all watchlist tickers. | SSH to VPS → `journalctl -u vn-bctc-fetch -n 50`. Service is alive (3d+ uptime) but not pushing — likely BCTC portal URL or auth changed. Restart + log review needed. |
| BUG-4 | SBV fetch zero-value rejections | BUG | Re-probe 00:04Z: `get_system_status` shows recurring `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` (every 30 min). `vn-sbv-fetch` recently restarted (59m uptime at probe time). SBV SLA shows `ok` (last push arrived 00:00:54Z) — this is a **FALSE GREEN**: SLA tracks VPS push arrival, not successful DB store. Actual SBV rate data in DB may be days stale. DB guard is correctly protecting good data; root cause is upstream (SBV portal returning zeros). | `sbvRatesRefreshJob` + `get_macro_snapshot` carry-trade signals rely on SBV data. SBV FX rates in macro snapshot use cached fallback (USD_VND=26120 — unknown age). | Inspect SBV portal response on VPS: `journalctl -u vn-sbv-fetch -n 20`. Likely portal schema changed. |

### ISSUEs

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| ISSUE-1 | Reuters RSS source | ISSUE | Re-probe 00:04Z: `Reuters RSS | Ngưng | Chưa bao giờ | 51 ⚠` — was 33 failures at 22:07Z (2h ago), now 51 (+18 in 2h). Never succeeded in current server lifetime. Per fix log #7, `vn-reuters-fetch.service` was decommissioned but server-side CB is still open. | `news-scout` via `pollNewsJob`. Continuous log noise; reduced international news coverage. | Disable the Reuters RSS source in source config to stop CB churn. It was decommissioned already — config still points to dead feed. |
| ISSUE-2 | Trading Economics sources (×2) | ISSUE | Re-probe 00:04Z: Both TE entries `Ngưng | Chưa bao giờ | 51 ⚠` — same growth rate as Reuters. Never succeeded since server restart. | macro data consumers; `get_macro_snapshot` TE-sourced fields. | Anti-bot / auth wall. Audit whether `TRADING_ECONOMICS_API_KEY` env var is set or Chromium scraper path is configured correctly. |
| ISSUE-6 | `vnstockTradingStatsRefresh` slow | ISSUE | Re-probe: `get_cron_health` → `success_rate: 85.7% (6/7 runs), avg_duration: 649220ms (10.8 min)`. Unchanged from prior cycles. | `market-watcher` trading stats enrichment. Near 15-min SLA window. | Profile ticker HTTP loop — likely N+1 calls. Batch or parallelize. Consider daily frequency instead of weekday. |
| NEW-HNX | HNX/UPCOM price source error loop | ISSUE | NEW this cycle 00:04Z: `get_system_status` recent errors show `[hnx] all UPCOM price sources failed` and `[hnx] all HNX price sources failed` — 10 occurrences in last 5-min window (error rate ~2/min). CB for hnx shows `0 failures` — circuit breaker is NOT tripping, so the job keeps retrying rather than fail-closing. Market is closed (00:00 UTC), so no live session data loss, but continuous error spam is masking real alerts. | `market-watcher` price anomaly detection + `get_market_snapshot` HNX/UPCOM coverage. `get_system_status` recent errors saturated by hnx noise. | Check `vn-price-fetch` VPS service for HNX sub-source. CB should trip after N consecutive failures — investigate why failure count stays 0 (may be a per-request reset bug). |

---

## UNCERTAIN (cannot reconfirm or deny from current data)

| Prior Finding | Status |
|---|---|
| BUG-2 (ISM no_data / FRED_API_KEY) | **UNCERTAIN** — not re-probed this cycle. Was confirmed in all cycles since 2026-06-13. Likely still present. |
| ISSUE-3 (intelligence-cycle overlap skips) | **UNCERTAIN** — probe at off-peak midnight UTC; no new skip events observable in current error window. Still watch. |
| NEW-1 (kinhdich 503 off-hours) | **UNCERTAIN** — market-hours issue; off-hours probe cannot confirm/deny. |
| NEW-2 (windowPartitioner truncation) | **UNCERTAIN** — not in current error log. Low severity. |

---

## NEW FINDINGS (not in prior reports)

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| NEW-HNX | HNX/UPCOM price loop (CB not tripping) | ISSUE | See ISSUE table above. | market-watcher, get_market_snapshot | CB failure-count reset investigation. |
| IMPROVE-1 | `get_bctc_pending_refine` unbounded default | IMPROVE | No `limit` arg → returns all pending BCTC items (235k chars, token-overflow). Server should default to `limit=10` rather than unbounded. Tool doc confirms `limit` param exists (1–100). Actual callers (`refine_bctc_md`) use `{limit: 1}` — 0 affected callers with broken pattern. | 0 runtime callers broken (callers use limit param correctly). | Add server-side default `limit=10` to `get_bctc_pending_refine` handler. |
| IMPROVE-2 | `fb-market-poster` tool package doc stale | IMPROVE | `docs/agents/tools/package/fb-market-poster.md` line 26 still documents `get_cycle_bootstrap(agent_name: "fb-market-poster")`. Flow file correctly removed this call (FIX-CYCLE-BOOTSTRAP-AGENT-ENUM-SSOT comment at lines 31-36). Package doc is stale — not authoritative at runtime. | 0 runtime callers affected (flow is fixed and authoritative). | Update `docs/agents/tools/package/fb-market-poster.md` to remove `get_cycle_bootstrap` entry and reflect live STEP 0 tool list: `log_agent_work → get_market_snapshot + get_market_context + get_market_foreign_flow + get_ticker_intelligence`. |
| IMPROVE-3 | `emit_pressure_state` stale_warning | IMPROVE | `emit_pressure_state({})` returned `{success: true, stale_warning: true, cycle_snapshot_promoted: false}`. Cowork-team cycle telemetry consuming stale pressure data; no cycle snapshot promoted this cycle. | `cowork-team` telemetry.md Step 6 (mandatory, un-skippable). | Investigate why cycle_snapshot_promoted=false. Cowork dispatcher may have missed a cycle, or pressure-state cache TTL is short. |
| NEW-3 | `system-map.json` watchlist drift | IMPROVE | `get_watchlist` returns 41 tickers; `docs/data/system-map.json` .watchlist has ~34 active entries — discrepancy of 7+ tickers. Carry from prior cycle. | Agents/scripts reading system-map.json for watchlist. | PM to sync system-map.json with `get_watchlist` output. |
| NEW-4 | Digest dedup key format regression (W25) | IMPROVE | `task_list_held` shows `published:digest-sunday:2026-W25` (old weekLabel format). W26 double-publish risk on June 22 Sunday. Carry from prior cycle. | `digest-predict` flow. | Pre-claim `published:digest-sunday:2026-06-22/2026-06-28` AND `published:digest-sunday:2026-W26` before Sunday to prevent double-fire. |

---

## RESOLVED (confirmed fixed vs prior cycle)

| # | Was | Evidence of Resolution |
|---|-----|------------------------|
| — | — | No new resolutions this cycle. All prior resolved findings remain resolved. |

---

## HEALTHY TOOLS — spot-checked this cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ | Valid enum (tested with `market-watcher`); returns agent_signals + market_context + system_status. |
| `get_system_status` | ✅ | Full health returned; content issues are BUG-3/BUG-4/ISSUE-NEW-HNX. |
| `get_market_snapshot` | ✅ | Tool functional; HNX/UPCOM data may be stale per NEW-HNX. |
| `get_market_context` | ✅ | Trading window, VN-Index status returned. |
| `get_macro_snapshot` | ✅ | Tool returns cached data; SBV FX values unreliable per BUG-4. |
| `get_earnings_calendar` | ✅ | 41-ticker calendar returned; QUÁ HẠN tickers reflect BUG-3. |
| `get_cron_health` | ✅ | All crons ≥85.7% success; lowest is `vnstockTradingStatsRefresh` (ISSUE-6). |
| `get_vps_proxy_health` | ✅ (tool) | prices/news/sbv routes ok; bctc STALE is BUG-3. |
| `get_vps_service_health` | ✅ (tool) | Tool works; content issues are BUG-3 (bctc unhealthy) and BUG-4 (sbv restarted). |
| `get_sla_status` | ✅ (tool) | Tool works; BCTC breach is BUG-3; sbv false-green is BUG-4. |
| `get_watchlist` | ✅ | 41 tickers returned. |
| `get_agent_signals` (from_agent=null) | ✅ | 44 signals returned (all-producers mode). Inbox mode requires `agent` param — callers use explicit null correctly. |
| `task_list_held` | ✅ | 0 orphaned locks. Normal state. |
| `get_recent_fixes` | ✅ | 20 fixes returned; none resolve BUG-3/BUG-4/ISSUE-1/ISSUE-2. |
| `task_claim` / `task_heartbeat` / `task_release` | ✅ | Schema reachable. |
| `log_agent_work` | ✅ | Two-call pattern tested: start (id=1419) → end both returned ok. |
| `get_rate_limit_status` | ✅ | 0 sources at 100% capacity. |
| `emit_pressure_state` | ✅ (tool) | Returns success=true; stale_warning=true is IMPROVE-3. |

---

## Priority Matrix

| Priority | Finding | Age | Blast Radius |
|----------|---------|-----|-------------|
| P0 — Fix now | BUG-3: BCTC VPS running but not fetching (4523 min SLA breach, CRITICAL) | 3+ days (since 2026-06-16) | bctc-analyst Q1-2026 queue blocked; 10 tickers QUÁ HẠN; worsening 1 min/min |
| P0 — Fix now | BUG-4: SBV zero-value every 30 min; SBV freshness FALSE GREEN | Ongoing | SBV rates stale; macro carry-trade/yield on cached fallback |
| P1 — Fix this sprint | NEW-HNX: HNX/UPCOM price loop; CB not tripping (10 errors/5min, off-hours) | NEW (this cycle) | Saturating error log; masking real alerts; market-watcher coverage gap on open |
| P1 — Fix this sprint | BUG-2: `get_ism_subcomponents` no_data (FRED_API_KEY missing) | UNCERTAIN — long-running | 3 agents macro-blind on ISM regime |
| P2 — Investigate | ISSUE-1: Reuters RSS dead (51+ errors, never succeeded) | ≥7 days | Log noise; reduced international news coverage |
| P2 — Investigate | ISSUE-2: Trading Economics dead (2 sources, 51+ errors) | ≥7 days | Macro data gap |
| P2 — Fix before Sunday | NEW-4: digest W25 old weekLabel key → W26 double-publish risk June 22 | W25 regression | Duplicate weekly digest Telegram |
| P3 — Monitor | ISSUE-3: intelligence-cycle overlap skips | Recurring | Missed orchestration cycles |
| P3 — Monitor | ISSUE-6: vnstockTradingStatsRefresh slow (85.7%) | Ongoing | Near 15-min SLA window |
| P3 — Maintain | NEW-3: system-map.json watchlist drift | Unknown | Doc/runtime drift |
| P3 — Maintain | IMPROVE-1: get_bctc_pending_refine unbounded default | Low | 0 callers broken; tech debt |
| P3 — Maintain | IMPROVE-2: fb-market-poster package doc stale | Low | 0 runtime callers broken; doc drift |
| P3 — Maintain | IMPROVE-3: emit_pressure_state stale_warning | Low | Cowork telemetry on stale pressure data |

---

## Delta vs Prior Report (2026-06-19T22:07Z)

| Finding | Delta |
|---------|-------|
| BUG-2 (ISM no_data) | ❓ **UNCERTAIN** — not re-probed this cycle |
| BUG-3 (BCTC VPS) | ❌ **WORSENING** — SLA breach 4402→4523 min (+121 min in 2h) |
| BUG-4 (SBV zero-value) | ❌ **ONGOING** — rejections continuing; vn-sbv-fetch restarted but still returning zeros |
| ISSUE-1 (Reuters RSS) | ⚠ **ONGOING** — counter 33→51 (+18 failures in 2h) |
| ISSUE-2 (Trading Economics) | ⚠ **ONGOING** — same 33→51 delta |
| ISSUE-3 (intel-cycle overlap) | ❓ **UNCERTAIN** — off-peak probe window |
| ISSUE-6 (vnstock slow) | ⚠ **UNCHANGED** — 85.7% / 649s avg |
| NEW-HNX (HNX/UPCOM loop) | 🆕 **NEW ISSUE** — CB not tripping; 10 errors/5min; P1 |
| IMPROVE-1/2/3 | 🆕 **NEW** — all 0 runtime callers broken; P3 |
| NEW-3 (system-map watchlist drift) | ⚠ **CARRY** — IMPROVE |
| NEW-4 (digest W25 old key) | ⚠ **CARRY** — Sunday June 22 double-publish risk |

---

*Generated by: health-recheck scheduled routine*
*Probed via: `mcp__gateway__call_tool(server="vn-market", ...)`*
*UTC: 2026-06-20T00:07Z*
