# Team MCP Tool Recheck — 2026-06-23 16:08 UTC

**Run by:** health-recheck agent  
**Gateway:** `vn-market` reachable ✅ (confirmed via schema-error response on first tool call)  
**Market:** VN market CLOSED (outside 02:00–08:59 UTC Mon–Fri)

---

## ACTIVE FINDINGS (re-confirmed this cycle)

| # | Tool / Component | Class | Evidence | Caller Count | Suggested Fix |
|---|---|---|---|---|---|
| F-1 | VPS `vn-bctc-fetch` → BCTC pipeline | **BUG** | SLA breached: 9803 min actual vs 360 min threshold; data 163.4h old; VPS service unhealthy (6d 21h uptime, all unhealthy) | `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctc-analyst` agent | Investigate VPS vn-bctc-fetch service logs; restart if stuck; verify push endpoint reachable from VPS |
| F-2 | `vn-sbv-fetch` VPS → SBV zero-value push | **ISSUE** | 6+ ERROR logs since 13:04 UTC `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`, every 30 min; vn-sbv-fetch uptime only 59m (crash-restarted); zero-overwrite guard correctly protecting data | `pushSbvRatesHandler.ts` (VPS push path) | Investigate VPS vn-sbv-fetch crash loop; check VCB XML parse on VPS; SBV FX data itself is SAFE (direct sbvRatesJob still working, FX data fresh 4 min) |
| F-3 | Reuters RSS source | **BUG** | `Reuters RSS | Ngưng | Chưa bao giờ | 221 ⚠` — 221 consecutive failures, never successfully fetched; news-fetch:5008 Reuters endpoint consistently failing | News pipeline (`pollNewsJob`, `intelligenceCycleJob`) | The VPS vn-reuters-fetch.service was decommissioned (dead feeds.reuters.com URLs per fix #7). Verify whether news-fetch:5008/reuters/headlines target URL is valid/alive; if dead feed, disable this source in config to stop error noise |
| F-4 | Trading Economics sources (×2) | **BUG** | `Trading Economics | Ngưng | Chưa bao giờ | 221-222 ⚠` — both TE sources have NEVER fetched successfully; 221-222 consecutive failures | Macro data pipeline, `macroIndicatorRefreshJob` | Chromium-based TE fetch was fixed (Dockerfile, fix #6) but still failing. Re-diagnose: check whether TE Chromium fetcher inside Docker container has working Chromium at `/usr/bin/chromium`; check for anti-bot blocking |
| F-5 | `get_ism_subcomponents` | **ISSUE** | Returns `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)"}` — `macroIndicatorRefreshJob` ran today at 12:13 UTC (100% success) but no ISM rows populated | Any caller of `get_ism_subcomponents`; log shows `[get_ism_subcomponents] no ISM data in fred_series_daily` at 14:04 UTC | Verify `FRED_API_KEY` env var is set in running container; if key missing, ISM will never populate. Check `macroIndicatorRefreshJob` logs for FRED fetch sub-step errors |
| F-6 | `get_vn_macro_indicators` | **ISSUE** | Returns `{"status":"degraded"}` with `blocked_reason: "NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128: context deadline exceeded"` — Industrial Production Index data unavailable | Macro analysis flows using `get_vn_macro_indicators` | NSO VPS proxy path failing with timeout; check if `www.nso.gov.vn` is reachable from VPS, or if proxy port 3128 config has changed |

---

## RESOLVED FINDINGS (not in prior report — first check this cycle; no stale carry-forward)

_No prior report to diff against. All findings above are fresh this cycle._

---

## PROBE RESULTS — ALL TOOLS TESTED

| Tool | Status | Latency | Notes |
|---|---|---|---|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ OK | 17 ms | Returns agent_signals + market_context + system_status; market prices current |
| `get_system_status` | ✅ OK | ~100 ms | 10 unresolved errors (6× SBV zero-value rejections), all CBs green |
| `get_cron_health` | ✅ OK | ~200 ms | All 70 cron jobs healthy; `sbvRatesRefreshJob` 98.2% (minor); all others ≥99.8% |
| `get_macro_snapshot` | ✅ OK | ~50 ms | VN-Index 1869.04, Oil $76.92, Gold $4144, USD/VND 26128 — all live tier-1 |
| `get_market_snapshot` | ⚠ SLOW (1st call) | 60s timeout then ✅ 1s | First probe timed out after 60s; second call returned in <1s. Likely cold-start/connection issue, not systematic outage |
| `get_pipeline_health` | ✅ OK | ~100 ms | 4 tickers oversold (D2D RSI 26, DPM RSI 25, NKG RSI 21, NVL RSI 23); BDI/DAG/DLC/JSH/SIS/VDC no TA data |
| `get_sla_status` | ✅ OK | ~50 ms | bctc breached CRITICAL (9803 min); sbv_fx ok (4 min); price ok; news off-hours expected |
| `get_vps_service_health` | ⚠ DEGRADED | ~50 ms | 2 unhealthy: vn-bctc-fetch (6d21h uptime, unhealthy), vn-sbv-fetch (59m uptime, unhealthy); vn-news-fetch healthy; vn-price-fetch/vn-foreign-flow idle (market closed) |
| `get_earnings_calendar` | ✅ OK | ~50 ms | Returns 41 tickers; multiple QUÁ HẠN (overdue) for Q1-2026 |
| `get_agent_signals(from_agent="news-scout")` | ✅ OK | ~50 ms | Empty (no recent signals from news-scout) |
| `get_agent_signals(from_agent="market-watcher")` | ✅ OK | ~50 ms | Empty (no recent signals) |
| `get_ism_subcomponents` | ❌ NO_DATA | ~50 ms | `no ISM sub-component rows` — FRED_API_KEY likely missing or ISM fetch not running |
| `get_vn_macro_indicators` | ❌ DEGRADED | ~50 ms | NSO Excel VPS proxy timeout — IIP data missing |
| `task_list_held` | ✅ OK | ~50 ms | 5 task locks: cowork-leader-lock, 2× chef slots (today), 1× chef slot (yesterday, expiring tonight), 1× digest-sunday slot — all normal |
| `get_recent_fixes` | ✅ OK | ~50 ms | Returns 20 recent fixes; no fix for current issues |

### Schema Drift Check
- `get_cycle_bootstrap`: valid `agent_name` enum includes `financial-analyst` and `report-analyzer` — these are NOT in `system-map.json` agents list but DO exist in `getCycleBootstrap.ts` (`VALID_AGENT_NAMES` const) and have test coverage (`1862b-report-analyzer-skill.test.ts`). **Docs drift only, not a runtime bug.** Grep: `grep -n "financial-analyst\|report-analyzer" apps/mcp-server/src/application/usecases/getCycleBootstrap.ts` confirms both present at line 20.
- `get_agent_signals`: inbox mode correctly requires `agent` param when `from_agent` omitted. Flow files that use `from_agent="news-scout"` / `from_agent="market-watcher"` do NOT trigger inbox mode. **Caller-surface verified: 0 affected callers** for the inbox-mode pattern (grep `from_agent.*null` in docs/agents returned no matches).

---

## CRON HEALTH SUMMARY

All 70 registered cron jobs at ≥99.8% success rate over last 7 days. Notable:

| Job | Success Rate | Runs | Avg Duration | Note |
|---|---|---|---|---|
| `sbvRatesRefreshJob` | 98.2% | 56 | 4111 ms | ~1 failure in 7 days; VPS push path errors separate from this job |
| `intelligenceCycleJob` | 100% | 1187 | 27841 ms | One `already running — skipped` WARN at 13:45 UTC — transient |
| `alertDigestJob` | 100% | 9 | 2178 ms | One `already running` WARN — transient long run |
| `eveningSummaryJob` | 100% | 8 | 1786 ms | One `already running` WARN at 15:30 — transient |
| All others | 100% | — | — | Healthy |

---

## SYSTEM OVERVIEW

- **DB size:** 290.89 MB, WAL: 0 B (healthy, WAL fully checkpointed)
- **Circuit breakers:** All 16 CLOSED (0 failures) ✅
- **Alerts (24h):** 51 total, 25 HIGH/CRITICAL, all notified to Telegram
- **Unresolved errors:** 10 (6× SBV zero-value rejections + 3× already-running WARNs + 1× ISM no-data)
- **Open warnings:** 52 high/critical items
- **Pending feedback:** 67 new items
- **Task locks:** 5 held (normal cowork dedup locks)
- **Source health:** Bloomberg ✅, CafeF/VnEconomy/VnExpress transient 1-error (degraded) but recent success; nhandan/nld/vietnambiz ✅; **Reuters ❌** (221 failures); **Trading Economics ❌** (221-222 failures); newsapi disabled by design

---

## PRIORITY ACTION LIST

1. **[HIGH] F-1 vn-bctc-fetch VPS unhealthy** — BCTC SLA at 163h, bctc-analyst agent fully blind to new Q1-2026 filings. Run `get_vps_service_health` + `restart_vps_service` for `vn-bctc-fetch`; check VPS logs.
2. **[HIGH] F-3 + F-4 Reuters/Trading Economics** — 221+ consecutive failures suggests a structural source issue (dead URLs or anti-bot block), not transient. Disable or fix these sources to clear the source health table noise. Reuters VPS service was already decommissioned; confirm the news-fetch:5008 Reuters endpoint also needs to be disabled/fixed.
3. **[MEDIUM] F-2 vn-sbv-fetch unhealthy** — SBV FX data is currently safe (direct job compensates), but 6 ERROR logs/hour is alert fatigue. Restart VPS service + verify VCB XML parse working on VPS.
4. **[MEDIUM] F-5 FRED ISM data** — Verify `FRED_API_KEY` is set in the running mcp-server container. One `docker exec` inspect of env vars would confirm.
5. **[LOW] F-6 NSO VPS proxy** — IIP data degraded. May need VPS proxy config update for `www.nso.gov.vn`.
