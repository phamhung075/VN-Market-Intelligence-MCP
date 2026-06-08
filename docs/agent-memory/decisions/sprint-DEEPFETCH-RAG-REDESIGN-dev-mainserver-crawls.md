# Decision Journal — Sprint DEEPFETCH-RAG-REDESIGN · dev-mainserver-crawls

**Sprint goal:** Deep-Fetch + RAG Redesign. Phase 2 Playwright fallback executor for JS/international sources.
**Agent:** dev-mainserver-crawls
**Started:** 2026-06-08T15:30Z

---

### STEP dev-mainserver-crawls-S1 · dev-mainserver-crawls · 2026-06-08T15:50Z
**task-id:** DFR-P2-MAIN
**what-done:** Implemented POST /fetch-article route on apps/news-fetch/ (port 5008). Added SSRF allowlist config loader (deepFetch.playwrightAllowedDomains from mcp.config.json). Wired route into Hono router via handlers.ts. Added mcp.config.json mount + MCP_CONFIG_PATH env to docker-compose news-fetch service. Built and started news-fetch container. Verified all 4 ACs live.
**what-considered:**
- Route placement: `src/routes/fetchArticle.ts` (new `routes/` dir) vs extending handlers.ts directly. Chose separate file to keep handlers.ts as thin router-only (DDD: handler imports route handler, route file owns logic).
- Config loader: env walk-up vs just env var. Chose walk-up fallback chain (env → __dirname walk → cwd) so it works both in Docker (MCP_CONFIG_PATH=/app/mcp.config.json) and in local dev without env var.
- Browser lifecycle: followed existing bloomberg-stealth/reuters-stealth pattern — PlaywrightBrowserFactory.launch() per request with page.close() + browser.close() in finally. The "pool" referenced in the blueprint is the shared factory pattern (not a persistent pool), consistent with existing service architecture.
- SSRF guard: www. prefix stripped before Set lookup — "www.reuters.com" and "reuters.com" both match allowlisted "reuters.com".
**why-decision:** Only valid path: new route on existing service. No new microservice (blueprint hard rule). SSRF allowlist config-driven (mandatory per blueprint). 30s timeout matches Contract B. page.close() before browser.close() prevents context leak.
**why-change:** No change from blueprint §Zone 3 + Contract B. All 4 ACs pass live.

**live-verification:**
- AC-P2N-1: POST /fetch-article https://vietnambiz.vn/ → HTTP 200, status=ok, body_text=8000 chars (Vietnamese financial content)
- AC-P2N-2: POST /fetch-article https://evil.com/steal-secrets → HTTP 400, reason="domain not allowed: evil.com"
- AC-P2N-3: POST /reuters/headlines → HTTP 200, source=reuters, 3 articles, no regression
- AC-P2N-4: docker exec confirms /app/mcp.config.json mounted, MCP_CONFIG_PATH=/app/mcp.config.json set, playwrightAllowedDomains=['vietstock.vn','vietnambiz.vn','vnbusiness.vn','reuters.com','bloomberg.com'] live
- tsc --noEmit: EXIT 0 (zero TS errors)
- bun test: 233 pass, 0 fail (26 files)
