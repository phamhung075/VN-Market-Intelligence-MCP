# Handoff — TASK_te_chromium (Tasks 1797 + 1798)

Branch: `fix/newsapi-limit-te-chromium`

## What was built

### Task 1797 — NewsAPI Daily Rate-Limit Guard

**New file:** `apps/mcp-server/src/infrastructure/fetchers/newsapiRateLimit.ts`

Persists a daily usage counter to `/app/data/newsapi-usage.json` (survives container restarts). Two independent gates:

- **Daily cap at 90** (10-req safety buffer below the 100-req free tier)
- **Minimum 30-minute interval** between calls (caps at max 48 calls/day, well within the 96-call/day that the 15-min intelligence cycle would otherwise produce)

Date rollover (new UTC calendar day) automatically resets the counter to 0.

**Modified:** `apps/mcp-server/src/infrastructure/fetchers/newsapi.ts`
- Imports `checkNewsApiLimit` + `incrementNewsApiCount` from `newsapiRateLimit.ts`
- Checks the limit before every network call — returns `[]` immediately if capped or interval not elapsed
- Calls `incrementNewsApiCount` after a successful API response

**Test file:** `apps/mcp-server/src/__tests__/1797-newsapi-daily-limit.test.ts`
- 15 test cases covering: no file, count below/at cap, date rollover, interval check, increment persistence, combined gates

### Task 1798 — Trading Economics Playwright/Chromium Scraper

**New file:** `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts`

Scrapes `https://tradingeconomics.com/vietnam/indicators` using Playwright/Chromium (the page is a React SPA; plain HTTP/cheerio returns skeleton HTML with no values).

- 6-hour result cache at `/app/data/te-cache.json` — avoids hammering the site
- On scrape failure: returns stale cache if < 12h old, else `null`
- Stealth headers: real browser UA + `Accept-Language: en-US`
- Waits for `table.table` or `div[data-field]` selector
- `TeChromiumDeps.scrape` is injectable — tests mock it without launching a browser
- Honours `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env var (set in Docker to system Chromium)

**Modified:** `apps/mcp-server/src/infrastructure/fetchers/tradingEconomics.ts`
- Added `fetchMacroIndicatorsWithFallback()` — tries Chromium first, falls back to existing cheerio scraper. Cheerio path is unchanged as a safe fallback for dev machines without Playwright.

**Modified:** `apps/mcp-server/src/infrastructure/fetchers/index.ts`
- Exports `fetchMacroIndicatorsWithFallback`, `fetchTradingEconomicsChromium`, `playwrightScrape`, `TeChromiumDeps`, `TeCacheEntry`

**Modified:** `apps/mcp-server/package.json`
- Added `playwright-core: ^1.44.0`

**Modified:** `apps/mcp-server/Dockerfile`
- Added `chromium` + its system dependencies (`libnss3`, `libatk-bridge2.0-0`, `libdrm2`, `libxkbcommon0`, `libgbm1`, `libasound2`)
- Added `ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` — points playwright-core at the system package, avoiding a ~300 MB download

**Test file:** `apps/mcp-server/src/__tests__/1798-te-chromium-scraper.test.ts`
- 11 test cases covering: fresh scrape, 6h cache hit, cache miss, failure+stale-cache, failure+expired-cache, failure+no-cache, boundary at 6h, never-throws contract

## Test results

- New tests: **26 pass, 0 fail** (1797 + 1798 combined)
- Regression: **8441 pass, 32 fail** — the 32 failures are pre-existing (network-dependent tests, lancedb integration tests) and were confirmed not introduced by this change

## QA validation checklist

- [ ] `bun test src/__tests__/1797-newsapi-daily-limit.test.ts` — 15 pass
- [ ] `bun test src/__tests__/1798-te-chromium-scraper.test.ts` — 11 pass
- [ ] `bun test src/__tests__/024-trading-economics.test.ts` — existing TE tests still pass
- [ ] `bun test src/__tests__/1345a-reuters-fallback.test.ts` — Reuters fallback still passes
- [ ] `bun test src/__tests__/fix-fetch-source-issue2-disabled-health.test.ts` — health tracker still passes
- [ ] Docker image rebuild: `chromium` package installs, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` is set
- [ ] `playwright-core` resolves: `bun install` picks up version `^1.44.0`
- [ ] Verify `/app/data/newsapi-usage.json` is created after first NewsAPI call in container
- [ ] Verify `/app/data/te-cache.json` is created after first Chromium scrape

## Assumptions

- The Docker base image (`oven/bun:1-debian`) has the Debian `chromium` package available in its apt repos. If not, substitute `chromium-browser` or use `npx playwright install chromium --with-deps` instead.
- `playwright-core ^1.44.0` is the stable release at time of writing; the exact version can be bumped to the latest stable if the Bun lockfile conflicts.
- The existing `tradingEconomics.ts` cheerio scraper is kept intact — it remains the fallback for dev machines and CI environments without Playwright.
