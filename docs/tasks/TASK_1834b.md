# TASK 1834b — SPRINT-S: TE Chromium anti-bot hardening

**Sprint:** 1834b
**Type:** SPRINT-S
**Priority:** P2-HIGH
**Owner:** developer
**Status:** In Progress
**Started:** 2026-05-03
**Branch:** `task/1834b-te-chromium-antibot`
**Estimate:** ~2h

---

## Context

Trading Economics Chromium scraper (`tradingEconomicsChromium.ts`) is being detected as a bot. This task hardens the Playwright/Puppeteer launch config and adds request interception to reduce fingerprinting and block tracking domains.

Production file: `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts`
Test file: `apps/mcp-server/src/__tests__/1834b-te-chromium-antibot.test.ts`

---

## Changes Required

### 1. `buildChromiumLaunchConfig()` — launch argument hardening

Add the following args to the Chromium launch config:
- `--disable-blink-features=AutomationControlled`
- `--disable-infobars`

Add randomised `defaultViewport`:
```typescript
defaultViewport: {
  width: 1280 + Math.floor(Math.random() * 200),   // 1280-1479
  height: 800 + Math.floor(Math.random() * 200),    // 800-999
}
```

### 2. New export `TE_BLOCKED_PATTERNS: string[]`

Export a constant containing 6 tracking domain glob patterns to block:
```typescript
export const TE_BLOCKED_PATTERNS: string[] = [
  "**/*.google-analytics.com/**",
  "**/*.googletagmanager.com/**",
  "**/*.doubleclick.net/**",
  "**/*.facebook.com/tr/**",
  "**/*.hotjar.com/**",
  "**/*.mixpanel.com/**",
];
```

### 3. `playwrightScrape()` + `playwrightScrapeNews()` — route interception + random delay

In both functions, after `page` is obtained and before `page.goto()`:

a. Add `page.route()` interception to abort requests matching `TE_BLOCKED_PATTERNS`:
```typescript
await page.route(TE_BLOCKED_PATTERNS, (route) => route.abort());
```

b. Add a random delay of 500-1499ms before `page.goto()`:
```typescript
await new Promise((resolve) => setTimeout(resolve, 500 + Math.floor(Math.random() * 1000)));
```

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | `buildChromiumLaunchConfig()` includes `--disable-blink-features=AutomationControlled` in args |
| AC-2 | `buildChromiumLaunchConfig()` includes `--disable-infobars` in args |
| AC-3 | `defaultViewport.width` is in range [1280, 1479] on repeated calls |
| AC-4 | `defaultViewport.height` is in range [800, 999] on repeated calls |
| AC-5 | `TE_BLOCKED_PATTERNS` is exported and contains exactly 6 entries |
| AC-6 | `playwrightScrape()` registers `page.route()` with `TE_BLOCKED_PATTERNS` before `page.goto()` |
| AC-7 | `playwrightScrapeNews()` registers `page.route()` with `TE_BLOCKED_PATTERNS` before `page.goto()` |

---

## Test File

Path: `apps/mcp-server/src/__tests__/1834b-te-chromium-antibot.test.ts`

Write 7 unit test cases covering AC-1 through AC-7. Use `bun:test`. Mock `page.route` and `page.goto` as needed. Follow the project test template from dev-standards.md.

---

## Risks

1. **`page.route()` availability** — Verify the puppeteer-core version in `package.json` supports `page.route()`. If not available (older puppeteer-core API), use the fallback:
   ```typescript
   await page.setRequestInterception(true);
   page.on('request', (req) => {
     if (TE_BLOCKED_PATTERNS.some((p) => matchesGlob(req.url(), p))) {
       req.abort();
     } else {
       req.continue();
     }
   });
   ```

2. **TypeScript `defaultViewport` type** — `defaultViewport` lives in `LaunchOptions`. Verify the type accepts `{ width: number; height: number }`. If type errors appear, cast as `puppeteer.Viewport` or `playwright.ViewportSize`.

---

## Definition of Done

- [ ] All 7 test cases (AC-1..AC-7) pass
- [ ] `tsc` compiles with zero errors
- [ ] Full test suite passes (existing tests must not regress)
- [ ] Commit: `task(1834b): TE Chromium anti-bot hardening — launch args + route interception + random delay`
- [ ] Report filed at `reports/TASK_REPORT_1834b.md`
