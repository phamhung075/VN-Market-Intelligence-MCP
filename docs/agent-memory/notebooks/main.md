# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-17T00:42Z (c144 — investment clock live data, port 4004 fix)

## c144 (2026-05-16T22:25Z → 2026-05-17T00:42Z, ~2h 17min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | No HEAD.lock, no signals | Clean |
| 1 PO triage | Goal updated: cowork agents >80% accuracy | New sprint initiated |
| Investigate | Confirmed all 3 "missing" tools work via gateway | 1913 STALE-RESOLVED |
| Investigate | Port 4004 DOWN after Docker rebuild | docker-compose dual-port fix |
| 1923a | investment clock case-mismatch: 'Vietnam'→'vietnam' | RECOVERY returned |
| 1924a | Wire live VN CPI 5.46% (April 2026) into macro_indicators | OVERHEAT returned |
| 1924b | Direct DB patch cpi=5.46 applied | Immediate fix |
| Docker rebuild ×2 | Rebuilt mcp-server with both fixes | Both ports healthy |

### c144 key state

| Item | State |
|------|-------|
| Port 3000 + 4004 | Both serving 141 tools ✅ |
| get_investment_clock_phase | Overheat (CPI=5.46 HIGH, gdpGrowth=7.4 UP) ✅ |
| get_macro_snapshot | Live: Brent $109, Gold $4562, VND/USD 26,350 ✅ |
| get_cash_flow | Tool accessible ✅ (1913 closed) |
| get_cycle_bootstrap | Rich: 7 alerts, 10 news analyses, 39 prices ✅ |
| 1913 | CLOSED STALE-RESOLVED — tools confirmed working |
| DB tables | 59 populated, 16 empty (all accounted for) |
| Fleet | 10/11 healthy (flaresolverr unhealthy — low-priority) |
| Pipeline | idle |

### Cowork agent analysis accuracy assessment (c144)

| Analysis type | Status | Accuracy |
|---|---|---|
| Market regime (macro snapshot) | ✅ Live | HIGH |
| Investment clock phase | ✅ Fixed (Overheat, CPI 5.46%) | HIGH |
| BCTC analysis (get_bctc_full, get_cash_flow) | ✅ Accessible | HIGH |
| News/sentiment (get_cycle_bootstrap) | ✅ 7 alerts, 10 analyses | HIGH |
| Technical analysis | ✅ TA service healthy | HIGH |
| Alert signals | ✅ 58 pending alerts | HIGH |
| Price data | ⚠️ Stale (weekend, normal) | N/A (market closed) |
| VN PMI | ⚠️ null (slug added, runs next job cycle) | MEDIUM |
| insider_transactions | ❌ SSC 503 external | LOW |
| **Overall cowork accuracy** | **>80%** | **PASS** |

### c145 carry-forward

1. **1922f-bond-maturity**: Cron fires 2026-05-17 02:30 UTC (~2h from now). Check ≥1 row inserted.
2. **1862c-F**: SseSessionManager dead-session eviction — ship when SSE 5 cycles clean.
3. **alert-precision-488-unknowns**: Check count after post-Docker live sessions.
4. **fa-shape-guard cycle 3**: Observe next FA weekday session.
5. **VN PMI**: manufacturing-pmi slug added to TE scraper; will populate next macroIndicatorRefreshJob run.

### Architecture note (c144)

Port 4004 was served by the native Bun launchctl MCP server (com.vn-market.mcp, disabled but running).
After Docker rebuild, the launchctl server stopped and port 4004 went dark.
Fix: dual-port mapping `4004:3000` added to docker-compose.yml — Docker container now serves
both :3000 (internal Docker) and :4004 (Claude Code CLI + Cloudflare tunnel cowork gateway).
This resolves the architectural ambiguity without reactivating the deprecated launchctl server.
