# Team MCP Tool Recheck — 2026-06-20 06:03 UTC

**Run by:** health-recheck agent  
**Gateway:** vn-market reachable ✅  
**Probe window:** 2026-06-20 ~06:03–06:06 UTC (VN market CLOSED — off-hours run, expected)

---

## Summary

| Class | Count | Worst severity |
|-------|-------|----------------|
| BUG   | 4     | CRITICAL (BCTC pipeline dead) |
| ISSUE | 4     | HIGH (Reuters/TE persistent, orphan lock) |
| IMPROVE | 1   | LOW (docs drift only) |
| RESOLVED | 0  | — |

---

## ACTIVE FINDINGS

### BUG-1 — CRITICAL: BCTC pipeline dead, SLA breached 3.4× limit

| Field | Value |
|-------|-------|
| Tool | `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status` |
| Evidence | `vn-bctc-fetch: unhealthy`, bctc proxy last push `2026-06-16 18:02` (4 days stale), SLA status: **4883 min / 1295 min SLA → CRITICAL** |
| Caller count | bctc-analyst (flow/cycle.md), refine_bctc_md (push_bctc_refined_unit), ops (data-validation-checks.md) — 3+ direct agents |
| Impact | BCTC PDF pipeline completely stalled. Q1-2026 earnings season ongoing — 11 tickers show QUÁ HẠN in `get_earnings_calendar`. bctc-analyst cycles blocked on stale data. |
| Probe command | `get_sla_status`, `get_vps_proxy_health`, `get_vps_service_health` |
| Suggested fix | SSH into VPS, restart `vn-bctc-fetch.service`. If VPS-side service is healthy, check push endpoint reachability from VPS → mcp-server. Run `trigger_bctc_vps_fetch` after restart. |

---

### BUG-2 — HIGH: HNX & UPCOM price sources failing continuously

| Field | Value |
|-------|-------|
| Tool | `get_system_status`, `get_cycle_bootstrap` |
| Evidence | 10 consecutive errors in last 3 min: `[hnx] all HNX price sources failed`, `[hnx] all UPCOM price sources failed`. Watchlist tickers BDI, VNH, JSH, VDC, DLC, ACV all returning `N/A`. |
| Caller count | market-watcher (cycle.md step 1), alert-engine (price scan jobs), intelligenceCycleJob (100% success but masking per-source errors) |
| Impact | 6 watchlist tickers have no price data. Price anomaly detection blind for HNX/UPCOM tickers. |
| Probe command | `get_system_status` → Recent System Errors section |
| Suggested fix | Investigate HNX/UPCOM fetcher source chain in stock-price service. Circuit breakers show `hose: OK, hnx: OK` (CB level OK) but underlying price sources all failing → likely rate-limit, IP block, or API schema change at HNX/UPCOM endpoint. Check VPS proxy `/proxy/ssc-iboard` for HNX/UPCOM route fallback. |

---

### BUG-3 — HIGH: Reuters RSS — 106 consecutive failures (never succeeded)

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Source Health section |
| Evidence | `Reuters RSS | Ngưng | Chưa bao giờ | 106 ⚠` — 106 consecutive errors, source has NEVER successfully fetched in recorded history |
| Caller count | news-scout uses `fetch_and_analyze` which aggregates from news pipeline. Reuters is listed as a configured source in system-map.json `data_sources[reuters]`. |
| Impact | One international news source permanently dead. news-scout loses coverage of Reuters-first international stories (oil, geopolitics, Fed). Quality degradation for news-scout and unified-agent context. |
| Probe command | `get_system_status` → SOURCE HEALTH block |
| Suggested fix | Verify `feeds.reuters.com` RSS URL is still valid (Reuters changed their RSS structure in 2024). Check if vn-reuters-fetch.service was decommissioned per fix #7 (`2026-04-30` hotfix that decommissioned vn-reuters-fetch.service for dead URLs) but the source is still registered. If decommissioned, remove from active source list to clean up noise. |

---

### BUG-4 — HIGH: Trading Economics — 106 consecutive failures (2 sources, never succeeded)

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Source Health section |
| Evidence | Two Trading Economics sources both show `Ngưng | Chưa bao giờ | 106 ⚠` — 106 consecutive errors each |
| Caller count | `get_macro_snapshot`, `get_vn_macro_indicators`, `macro-health-read` skill (used by market-watcher step 2, news-scout step 0b, unified-agent) — high impact |
| Impact | Macro indicator data for Trading Economics feeds (commodity prices, CPI comparisons, global macro) degraded. `get_macro_snapshot` fell back to cached/estimated data (confirmed via `oil_usd_delta: null` in probe response — delta not computable). |
| Probe command | `get_system_status` → SOURCE HEALTH block |
| Suggested fix | Chromium-based scraper (`trading-economics-chromium` source) may have failed. Check Chromium binary in mcp-server Docker container — previous hotfix (2026-04-30 fix #6) installed it, but container may have been rebuilt without it. Run `docker exec mcp-server chromium --version`. If missing, rebuild container with Dockerfile fix. |

---

## ISSUES (degraded / not broken)

### ISSUE-1 — MEDIUM: VPS SBV fetch unhealthy, zero-value rejection guard firing

| Field | Value |
|-------|-------|
| Tool | `get_vps_service_health`, `get_system_status` |
| Evidence | `vn-sbv-fetch: unhealthy | 45m uptime`. System error: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` (2026-06-20 06:01:06). SBV proxy last push 06:01 (data flowing, rejection guard working). |
| Impact | Low — rejection guard is protecting good prior data. Service recently restarted (45 min uptime). Data flowing but with intermittent zero-value pushes. |
| Suggested fix | Investigate why VPS `vn-sbv-fetch.service` restarted ~05:15 UTC. Check VPS systemd logs. The zero-value rejection is a protection, not a bug — the guard is working. Root cause is upstream SBV API returning zero for some fields. |

---

### ISSUE-2 — MEDIUM: Orphaned cowork-leader-lock (expired 27 min)

| Field | Value |
|-------|-------|
| Tool | `task_list_held` |
| Evidence | Lock `cowork-leader-lock` with `expires_at: 2026-06-20T05:36:17.000Z` (expired ~27 min at time of check). TTL=1800s. Held by `cowork-dispatcher`, heartbeat not refreshed since claim. |
| Impact | If cowork-dispatcher tries to re-claim this lock on next cycle, the expired lock may cause a brief delay. Auto-expires by TTL — the system should handle this correctly. |
| Suggested fix | Run `task_force_release_orphan` if cowork-dispatcher reports claim failure in next cycle. Low urgency. |

---

### ISSUE-3 — LOW: `bctcReparseJob` success rate 89.7% (7-day window)

| Field | Value |
|-------|-------|
| Tool | `get_cron_health` |
| Evidence | `bctcReparseJob: success_rate=0.90 (89.7%), total_runs=87`. Below the 90% confidence threshold. |
| Impact | ~9 BCTC re-parse cycles failed in last 7 days. Given BCTC pipeline is already stalled (BUG-1), this compounds the issue. |
| Suggested fix | Check error logs for failed bctcReparseJob runs. Likely related to BUG-1 (VPS push failure) or the known parsing complexity issues from fix #10. |

---

### ISSUE-4 — LOW: 47 open high/critical system warnings, 65 pending feedback items

| Field | Value |
|-------|-------|
| Tool | `get_system_status` |
| Evidence | `open_warnings: 47 high/critical items`, `pending_feedback: 65 new items`. Last weekly audit: 2026-06-06 (14 days ago). |
| Impact | Accumulated technical debt. Some warnings may already be covered by active fixes. |
| Suggested fix | Run `dataAuditJob:weekly` or dispatch system-auditor for a Tier-3 deep audit. Review `get_signal_rejection_summary` for actionable patterns. |

---

## IMPROVE (works, docs mismatch)

### IMPROVE-1 — LOW: `get_price_history` tool list doc says `ticker`, live tool requires `code`

| Field | Value |
|-------|-------|
| Tool | `get_price_history` |
| Evidence | Live probe with `{"ticker": "FPT", "days": 5}` → `Input validation error: path ["code"] Required`. Probe with `{"code": "FPT", "days": 5}` → success. |
| Caller surface | `grep -r "get_price_history" docs/agents/*/flow/*.md apps/**/*.ts` → ALL flow callers use `code` correctly (cycle.md, data-validation-checks.md, audit-market.md). ZERO callers use broken `ticker` param. |
| Docs with wrong param | `docs/agents/tools/list/get_price_history.md` (says `ticker`), `docs/agents/tools/package/market-watcher.md` example at line 145 (uses `tickers: [...]` array — doubly wrong). |
| Caller-surface verified | **0 affected callers** — all flow files use `code`. Doc-only drift. |
| Suggested fix | Update `docs/agents/tools/list/get_price_history.md` param from `ticker` → `code`. Update market-watcher.md example at line 145 from `tickers: ["VCB", "ACB", "FPT"]` → single `code: "VCB"`. |

---

## Tool Probe Summary

| Tool | Reachable | Latency | Notes |
|------|-----------|---------|-------|
| `get_system_status` | ✅ | fast | Returns full health + errors |
| `get_cycle_bootstrap` | ✅ | 6ms | Requires exact `agent_name` enum |
| `get_market_snapshot` | ✅ | fast | Data fresh, breadth good |
| `get_macro_snapshot` | ✅ | fast | Some delta fields null (TE source down) |
| `get_agent_signals` | ✅ | fast | `from_agent: null` correctly returns all-producer signals |
| `get_technical_indicators` | ✅ (code param) | fast | source_tier: 3 (expected off-hours) |
| `get_cron_health` | ✅ | fast | Most jobs healthy; bctcReparseJob 89.7% |
| `get_vps_service_health` | ✅ | fast | 2 unhealthy (bctc, sbv) |
| `get_vps_proxy_health` | ✅ | fast | bctc STALE (4 days) |
| `get_earnings_calendar` | ✅ | fast | 11 tickers QUÁ HẠN |
| `get_pipeline_health` | ✅ | fast | 5 tickers TA-not-ready (0 rows) |
| `get_sla_status` | ✅ | fast | bctc CRITICAL breached |
| `get_price_history` | ✅ (code param) | fast | Doc says `ticker` — live requires `code` |
| `get_watchlist` | ✅ | fast | 41 tickers, 6 showing N/A (HNX/UPCOM down) |
| `task_list_held` | ✅ | fast | 1 expired lock (cowork-leader-lock) |
| `get_vn_macro_indicators` | ✅ | fast | IIP data flowing |
| `get_recent_fixes` | ✅ | fast | No recent fix for any of the 4 active BUGs |

---

## Resolved (prior cycle)

*None — first run of this health-recheck agent.*

---

_Report generated: 2026-06-20 06:06 UTC_
