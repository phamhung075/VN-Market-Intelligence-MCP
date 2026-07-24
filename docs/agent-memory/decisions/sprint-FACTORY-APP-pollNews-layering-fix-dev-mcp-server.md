# Decision Journal — Sprint FACTORY-APP-pollNews-layering-fix · dev-mcp-server

**Sprint goal:** DDD layering fix — move the source-health tracker singleton out of the interface layer into infrastructure, behavior-preserving.
**Agent:** dev-mcp-server
**Started:** 2026-07-24T04:45:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T05:00:28Z
**task-id:** FACTORY-APP-pollNews-layering-fix
**what-done:** Relocated `globalSourceTracker` singleton (+ `_resetGlobalSourceTracker`) from `interface/mcp/tools/news-analysis/sourceHealthTools.ts` to new `infrastructure/observability/sourceHealthRegistry.ts`; rewired 3 production consumers (`application/usecases/pollNews.ts`, `interface/mcp/tools/system/systemTools.ts`, `infrastructure/fetchers/tradingEconomicsChromium.ts` x2 dynamic imports) + 6 test files.
**what-considered:**
- New file location: `infrastructure/observability/` (mirrors existing stateful trackers `jobMetrics.ts`, `circuitBreakerLogger.ts`) vs `infrastructure/cache/` (LRU-only precedent, wrong shape) vs `infrastructure/adapters/` (formatters only, wrong shape).
- Split scope: move ONLY the stateful singleton block; leave `formatSourceHealthTable`/`registerSourceHealthTools` (pure rendering, no state) in the interface file — they are legitimately interface-layer concerns.
**why-decision:** `eslint.config.mjs` Fence-B already documented this exact violation by name ("pollNews.ts imports globalSourceTracker from interface/" — annotated FENCE-LEGACY); `infrastructure/observability/` is the established home for in-memory stateful trackers in this codebase (jobMetrics.ts precedent).
**why-change:** no change — task scope matched investigation exactly; also updated the now-stale FENCE-LEGACY comment (eslint.config.mjs) and a stale precedent citation (getMoneyRadarComposite.ts) since both directly named the file/pattern being moved.
