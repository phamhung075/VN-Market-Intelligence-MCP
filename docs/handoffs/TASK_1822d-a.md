# TASK 1822d-a — Migrate BCTC Playwright discovery to local mcp-server Docker

**Sprint:** 1822d
**Created:** 2026-05-02
**Agent:** developer
**Priority:** HIGH
**Type:** feat
**Estimate:** ~2h
**Branch:** `task/1822d-a-bctc-playwright-local`

---

## Context

`discoverBctcPdfUrlBrowser.ts` currently has a `defaultBrowserFetcher` that calls the
VPS endpoint `GET /proxy/bctc-discover/:ticker?year=YYYY&quarter=Q`. The VPS then
spawns `discover-bctc-urls-browser.py` (Playwright + Chromium) to scrape the SSC
NewsSearch portal.

The VPS is a lite VM — it cannot reliably run Chromium. The mcp-server Docker image
already has Chromium installed (used by `tradingEconomicsChromium.ts` via
`puppeteer-core` + `buildChromiumLaunchConfig()`). The discovery logic must move there.

**Do NOT remove VPS code in this task.** That is Task 1822d-b, which depends on this
task being merged and green.

---

## Files to modify

| File | Change |
|------|--------|
| `apps/mcp-server/src/application/usecases/discoverBctcPdfUrlBrowser.ts` | Replace `defaultBrowserFetcher` (plain fetch → VPS endpoint) with a local Puppeteer-based fetcher |
| `apps/mcp-server/src/__tests__/1289f-bctc-browser-discovery.test.ts` | Add tests for SSC NewsSearch Playwright path; keep existing tests green |

---

## What to implement

### 1. New local Playwright fetcher

Replace `defaultBrowserFetcher` in `discoverBctcPdfUrlBrowser.ts` with a function
that:

- Uses `puppeteer-core` (dynamic import, same as `playwrightScrape` in
  `tradingEconomicsChromium.ts`)
- Calls `buildChromiumLaunchConfig()` (import from
  `../../infrastructure/fetchers/tradingEconomicsChromium.js`)
- Sets the same stealth UA from `TE_USER_AGENT` (or equivalent realistic UA)
- Opens a page, calls `page.goto(url, { waitUntil: "domcontentloaded", timeout })`,
  returns `page.content()`
- Retries once on `"Target closed"` error (same pattern as `playwrightScrapeNews`)
- Closes browser in `finally` block — never throws out of the function

### 2. SSC NewsSearch local path

The Python script's Playwright workflow for SSC NewsSearch downloads the PDF file
to the VPS cache dir and returns a VPS proxy URL. Locally, the equivalent must:

- Load `https://congbothongtin.ssc.gov.vn/faces/NewsSearch`
- Fill `#pt9\\:it8112\\:\\:content` with the ticker
- Click the "Tim kiem" button, wait 4 s
- Parse `<tr role="row">` rows from `page.content()` using cheerio (already a
  dependency)
- Match row by ticker + quarter/year using the same text-matching logic already in
  the `.ts` file (`matches_quarter_and_year` equivalent — see the inline logic in
  `tryHoseBrowser` context matching for reference)
- Click the download icon for the matched row using `page.expect_download` /
  `download.saveAs` to `/app/data/bctc-cache/<CODE>/<sanitised_filename>`
- Return `{ url: "file:///app/data/bctc-cache/<CODE>/<filename>", source: "SSC-NewsSearch", confidence: 0.92 }`
  OR a local HTTP URL if a static file server is available (check
  `Bun.env.BCTC_LOCAL_BASE_URL` — default `""` means return `null` and let the
  caller use the local path directly)

If Playwright is unavailable (import error), fall through to `{ url: null, source:
null, confidence: 0, error: "Playwright not available" }` — never throw.

### 3. Updated fallback chain in `discoverBctcPdfUrlWithBrowser`

```
1. tryHoseBrowser (existing HTML regex — keep as-is)
2. tryHnxBrowser  (existing — keep as-is)
3. tryUpcomBrowser (existing — keep as-is)
4. tryLocalSscNewsSearch (NEW — Playwright local)
```

Return on first non-null `url`.

### 4. `defaultBrowserFetcher` update

Change `defaultBrowserFetcher` to use local Playwright instead of plain `fetch`.
The injected `browserFetcher?: (url, timeout) => Promise<string>` signature is
preserved for testability — existing tests continue injecting their mock fetcher.

The new `defaultBrowserFetcher` must:
- Call `buildChromiumLaunchConfig()` (imported from `tradingEconomicsChromium.js`)
- Set a realistic User-Agent
- Navigate to `url`, wait for `domcontentloaded`, return `page.content()`
- Close browser in `finally`

---

## Acceptance criteria

- [ ] AC-1: `defaultBrowserFetcher` no longer calls any VPS endpoint (no
  `VPS_PROXY_URL`, no `/proxy/bctc-discover/`).
- [ ] AC-2: `defaultBrowserFetcher` launches Chromium via `buildChromiumLaunchConfig()`
  from `tradingEconomicsChromium.js`.
- [ ] AC-3: All 8 existing tests in `1289f-bctc-browser-discovery.test.ts` pass with
  injected mock fetcher unchanged.
- [ ] AC-4: New test — `tryLocalSscNewsSearch` with a mock `page.content()` returning
  fake SSC rows — finds the correct row and returns `source: "SSC-NewsSearch"`.
- [ ] AC-5: New test — Playwright unavailable (import throws) → function returns
  `{ url: null, confidence: 0, error: ... }`, does not throw.
- [ ] AC-6: `tsc --noEmit` clean on modified files.
- [ ] AC-7: Full test suite passes (no new failures).
- [ ] AC-8: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env var respected (fallback
  `/usr/bin/chromium`), consistent with `tradingEconomicsChromium.ts`.

---

## DDD layer check

`discoverBctcPdfUrlBrowser.ts` is in `application/usecases/`. Importing
`buildChromiumLaunchConfig` from `infrastructure/fetchers/tradingEconomicsChromium.ts`
is a violation: application must not import infrastructure directly.

**Correct approach:** Extract `buildChromiumLaunchConfig` + `playwrightPageFetch`
(a generic "launch browser, goto url, return content, close") into a new
infrastructure helper:

```
apps/mcp-server/src/infrastructure/fetchers/chromiumPageFetcher.ts
```

Export:
- `buildChromiumLaunchConfig()` — re-exported from there (or moved here, with
  `tradingEconomicsChromium.ts` importing it back)
- `chromiumFetchPage(url: string, timeout?: number): Promise<string>` — generic
  headless page content fetcher, retries once on Target closed

`discoverBctcPdfUrlBrowser.ts` imports `chromiumFetchPage` from
`../../infrastructure/fetchers/chromiumPageFetcher.js`. The use case file itself
stays in `application/usecases/`.

---

## Key references

- `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts` —
  `buildChromiumLaunchConfig()`, `playwrightScrapeNews()`, retry-on-Target-closed
  pattern, `TE_USER_AGENT`
- `vps-scripts/discover-bctc-urls-browser.py` — exact SSC NewsSearch Playwright
  workflow (selectors, wait times, download handling, filename sanitisation)
- `apps/mcp-server/src/__tests__/1289f-bctc-browser-discovery.test.ts` — existing
  tests; injected mock fetcher pattern must remain valid

---

## Out of scope

- Removing VPS scripts → Task 1822d-b
- Changing `bctc_vps_queue` schema or downstream PDF ingestion pipeline
- Removing the `/bctc-files/` static serving endpoint from VPS (that stays until
  local PDF path is confirmed working)
