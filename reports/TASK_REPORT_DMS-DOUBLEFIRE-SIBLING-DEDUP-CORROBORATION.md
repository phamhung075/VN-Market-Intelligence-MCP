## Task Report DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION

changed:
- apps/mcp-server/src/tools/signals/getRecentSignals.ts (new helper)
- apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts (from_agent=null branch + get_recent_signals tool #166)
- apps/mcp-server/src/__tests__/DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION.test.ts (14 unit tests)
- docs/agents/news-scout/flow/stage-bootstrap.md (Step 0c SIBLING_WINDOW_CACHE)
- docs/agents/news-scout/flow/stage-signals.md (cross-sibling dedup gate)
- docs/agents/market-watcher/flow/main.md (Step 3 DMS-2 corroboration probe)
- docs/data/project-stats.json (toolCount 165->166)
- docs/data/tool-registry.json (totalCount 165->166)

tests: 13309 pass / 0 fail (full suite) | DMS unit: 14 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS

verdict: APPROVED (code-gate PASS)
done_verified: FALSE — 3 behavioral criteria pending live gateway-capable two-fire

### Live-Deferred Behavioral Checklist

- [ ] DMS-1: 2 concurrent news-scout fires same minute -> 0 dup (signal_type, stock_code, title) committed; 2nd finds 1st via SIBLING_WINDOW_CACHE
- [ ] DMS-2a: transient probe-fail + sibling present in 15-min window -> false gateway-down BUG SUPPRESSED
- [ ] DMS-2b: probe-fail + NO sibling in window -> exactly ONE gateway-down BUG filed

impl commit: 51c72725
