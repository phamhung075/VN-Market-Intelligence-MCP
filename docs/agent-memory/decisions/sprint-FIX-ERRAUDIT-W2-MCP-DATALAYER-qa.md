---
agent: qa
task-id: FIX-ERRAUDIT-W2-MCP-DATALAYER
date: 2026-06-16
cycle: QA gate review
---

## Decision Journal — FIX-ERRAUDIT-W2-MCP-DATALAYER

### What was considered

Static audit of 9 migration sites across 7 files:
1. imfConvictionBridge: safeQuery used, returns undefined on !ok — no fabricated 0.
2. scanMarket.getAvgVolumeSync: returns null on db-error and insufficient history — no fabricated 0.
3. scanMarket.getThresholds catch: failLoud replaces bare catch{} — logged.
4. imfDataFetcher.parseImfApiResponse: failLoud on catch instead of silent null.
5. assembleBriefing step7 macroSnapshot: runSectionAsync with reason:'error' logger.warn.
6. assembleBriefing step9 trackedCommodities: runSectionAsync with reason:'error' logger.warn.
7. assembleBriefing step10 autoResolveAlerts: failLoud on catch.
8. assembleBriefing step10b unresolvedAlerts: failLoud on catch.
9. assembleBriefing step11 topConviction: failLoud on catch.
10. assembleBriefing step12 predictionSignals: failLoud on catch.
11. marketContextBuilder.buildMacroSection: three failLoud calls for market_prices, tracked_indicators, sbv_rates.
12. vnstockBridge FINANCE_SCRIPT + VnstockFinancials: pe/pb/roe/roa now number|null; Python emits None on missing column; `ratio_err` logged via sys.stderr.

Note: commit message says "7 sites" but the diff spans 9+ discrete catch→failLoud/safeQuery replacements across the 7 files. Counted individually: each distinct catch block replaced = 1 site.

Forced-failure tests (FORCED-FAILURE label) confirm BOTH branches:
- DB error → reason:'db-error', never ok:true with empty rows
- Genuine no-rows → reason:'no-rows', distinct from error

Live degrade probe (running container vn-market-intelligence-mcp-mcp-server-1):
- getAvgVolumeSync('BRENT') → null (no history rows — correct drop-dimension)
- getAvgVolumeSync('VCB') → null (only 1 distinct day, below MIN_HISTORY_ROWS=5 — correct)
- safeQuery on closed DB → {ok:false, reason:'db-error'} with [degraded:...] console.error
- safeQuery genuine no-rows → {ok:false, reason:'no-rows'}
- safeQuery happy path → {ok:true, rows:[{id:42}]}

tsc: pre-existing error at FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367:test:270 only (triaged separately). Zero new tsc errors introduced.

Test suite: 31 pass / 0 fail across 3 directly-touched test files.
Mock-guard: PASS on all 9 production files.
DDD: domain/utils/safeQuery.ts has zero infrastructure/application imports. Confirmed.
Security: no process.env, no hardcoded secrets in any touched file.

Out-of-scope anti-patterns noted (not blockers for THIS task):
- assembleEveningSummary.ts:285,303 — bare catch→[] / catch→0
- generatePeriodicSummary.ts:583 — bare catch→0
- getPipelineHealth.ts:80,92 — catch→"(unknown)", catch→null (URL parse + fs read)
- pollNews.ts:439,471 — bare catch→[]
- assembleBriefing.ts:606,881,905,1204 — bare JSON parse catch→[], schema probe catch→false, per-ticker skip
- bctcInspectHandler.ts:772 — catch→[] (JSON parse)
- deepFetchMainJob.ts:142,146 / deepFetchVpsJob.ts:281,285 — catch→[]
- polymarket.ts:88 — catch→null

### Why this verdict

APPROVE: All discriminated degrade helpers are correct and complete for the 9 claimed sites. 
Error path is FAIL-LOUD (logged). No surviving fabricated constant (0/null-masking-as-value/50) on 
any migrated path. Forced-failure live probes confirm honest degrade in the deployed container.
Out-of-scope fabricated-default catches exist in untouched files — noted as scope for 
FIX-ERRAUDIT-W3 follow-on, NOT blockers for this task boundary.

what-considered: 9 sites static audit + live degrade probe (closed DB + no-history ticker) + 31-test forced-failure suite + mock-guard PASS + DDD + security
why-change: no change from plan — all checks green within scope boundary
