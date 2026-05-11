# Handoff — TASK_te_chromium_fix: Trading Economics Chromium Scraper Fixes

**Branch:** `fix/te-chromium-docker`
**Commit:** `023d7771`
**Status:** DONE — 3 issues fixed, Docker rebuilt, chromium verified

---

## What Was Done

### Issue 1 — playwright-core → puppeteer-core (FIXED)

**File:** `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts`

Replaced the `playwright-core` dynamic import in `playwrightScrape()` with `puppeteer-core` API:

```typescript
const puppeteer = (await import("puppeteer-core")).default;
const browser = await puppeteer.launch({
  executablePath: Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 ...");
await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
await page.waitForSelector("table.table", { timeout: 15_000 });
const html = await page.content();
await browser.close();
```

Cache logic (6h TTL, 12h stale fallback), cheerio parsing, and the injected `deps.scrape` interface are all unchanged.

### Issue 2 — Dockerfile Chromium (FIXED)

**File:** `apps/mcp-server/Dockerfile`

- Added `--no-install-recommends` flag
- Added `chromium-driver` and `fonts-liberation`
- Fixed `libasound2` → `libasound2t64` (Debian trixie/13 renamed this package)
- Added `ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
- Updated comments: playwright → puppeteer

Base image is `oven/bun:1-debian` = Debian GNU/Linux 13 (trixie). Package `chromium` resolves to version 147.0.7727.116.

### Issue 3 — playwright-core removed from package.json (FIXED)

**File:** `apps/mcp-server/package.json`

Removed `"playwright-core": "^1.44.0"` from dependencies. `puppeteer-core@^24.40.0` retained.

**File:** `apps/mcp-server/bun.lock`

Regenerated locally via `bun install` — 1 package removed. The frozen lockfile now matches `package.json` so Docker build no longer falls through to a native rebuild of `better-sqlite3`.

---

## Test Results

```
bun test src/__tests__/1798-te-chromium-scraper.test.ts
10 pass / 0 fail
```

All 10 test cases pass. The test file mocks `deps.scrape` so no real browser is invoked.

---

## Docker Verification

```
docker exec vn-market-mcp-server-1 which chromium
→ /usr/bin/chromium

docker exec vn-market-mcp-server-1 chromium --version
→ Chromium 147.0.7727.116 built on Debian GNU/Linux 13 (trixie)

Container status: Up (healthy)
```

---

## QA Checklist

- [ ] Run full test suite: `bun test` — ensure no regressions
- [ ] Live fetch test: call `fetchTradingEconomicsChromium()` in a running container
  - Expected: returns `MacroIndicators` with non-null `cpi`, `gdpGrowth`, `interestRate`
  - Acceptable: returns stale cache or null if Trading Economics blocks headless browsers
- [ ] Verify `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` prevents binary download on `bun install`
