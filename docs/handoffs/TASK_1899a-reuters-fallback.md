# TASK 1899a-reuters-fallback — Reuters Fallback Scraper (Playwright DataDome Stealth)

**Sprint:** 1899a | **Branch:** `task/1899a-reuters-fallback` | **Size:** M | **Zone:** apps/news-fetch/

---

## TLDR

Implement ReutersStealthFallback: Playwright + stealth patch to bypass DataDome on reuters.com when RSS fails. Invoked only when RSS returns error or 0 articles (fallback path, not primary). Extracts via DOM selectors. LOW confidence (Playwright heuristic, per brief). Mandatory browser.close() in finally block.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §6b: reuters-stealth.ts — FALLBACK only, invoked when reuters-rss fails
- §13: Failure Modes — DataDome hard-block detection (`x-dd-b: 3`, captcha-delivery.com in response)
- §6: PlaywrightBrowserFactory — shared factory call pattern

**URL & Selectors:**
- Site: `https://www.reuters.com/business`
- DOM selectors (from recon):
  - Headline: `[data-testid="Heading"]`
  - Article: `article[data-testid="Article"]`
  - Date: `time[data-testid="DateLineTime"]`
- Confidence: LOW (stealth JS effectiveness declining per technique doc)
- RAM: ~400–500 MB per scrape
- Timeout: 25 seconds (slightly shorter than Bloomberg)

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/infrastructure/scrapers/reuters-stealth.ts` | ReutersStealthFallback class, DOM parse, FALLBACK | ~100 |

**Dependencies:** Depends on 1899a-domain, 1899a-factory (PlaywrightBrowserFactory).

**Files to Modify:** None (task 1899a-routes will wire fallback invocation).

**Knowledge Needed:**
- Brief §6b (selectors, DataDome detection)
- Brief §9 (RAM constraint, must close browser)
- Brief §13 (failure modes)

---

## Acceptance Criteria

- [ ] **src/infrastructure/scrapers/reuters-stealth.ts created**:
  - Imports `{ ReutersNewsPort }` from ../../domain/repositories
  - Imports `{ NewsSource, Article, FetchResult }` from ../../domain/models
  - Imports `{ PlaywrightBrowserFactory }` from ./playwright-browser-factory

- [ ] **ReutersStealthFallback class**:
  - Implements `ReutersNewsPort` interface
  - Constructor: no args, or with optional logger
  - Method: `async fetchHeadlines(maxItems: number = 15): Promise<FetchResult>`

- [ ] **Browser lifecycle**:
  - Calls `PlaywrightBrowserFactory.launch()` to get { browser, context, page }
  - Does NOT call `playwright.chromium.launch()` directly
  - Wraps page operations in try/finally block
  - MANDATORY: `browser.close()` in finally (brief §6b, §9 RAM constraint)

- [ ] **Navigation & human simulation**:
  - Navigates to `https://www.reuters.com/business`
  - Pre-nav pause: random 0.5–1.5 seconds (humanization)
  - Optional scroll: evaluate to scroll 33% then 50% (humanization per brief)
  - Timeout: 25 seconds page.goto timeout

- [ ] **DataDome detection**:
  - Check response body for `captcha-delivery.com` string
  - Check HTTP response headers for `x-dd-b: 3` (hard-block indicator)
  - If detected: return `FetchResult { error: "datadome-block", articles: [], ... }`
  - Log WARNING: `[reuters] datadome-block detected`
  - Do NOT retry in same cycle (per brief §13)

- [ ] **DOM extraction**:
  - Select articles: `article[data-testid="Article"]`
  - For each article: extract:
    - Headline: `[data-testid="Heading"]` text content within article
    - URL: `a[href^="/article/"]` or similar within article (may be null)
    - PublishedAt: `time[data-testid="DateLineTime"]` datetime attribute
  - Limit to maxItems
  - Set confidence: 'LOW' (stealth-based, per brief)

- [ ] **Article construction**:
  - `source: NewsSource.REUTERS`
  - `fetchedAt: new Date().toISOString()`
  - `publishedAt: normalizeDate(timeValue)` — ISO or null
  - `confidence: 'LOW'` (always LOW for fallback per brief)
  - `method: 'playwright-stealth'`

- [ ] **Error handling**:
  - Timeout: return error message, articles: []
  - Network error: return error message, articles: []
  - Empty page (zero articles): return articles: [], error: null

- [ ] **Typescript strict mode**:
  - All types explicit, async/await correct

- [ ] **Commit message**:
  - Format: `feat(1899a-reuters-fallback): Reuters fallback scraper — DataDome stealth, FALLBACK path`
  - Trailers: `Task: 1899a-reuters-fallback`

---

## [Developer] Notes

**Scraper skeleton:**

```typescript
// reuters-stealth.ts (simplified)
import { ReutersNewsPort } from '../../domain/repositories';
import { NewsSource, Article, FetchResult } from '../../domain/models';
import { PlaywrightBrowserFactory } from './playwright-browser-factory';

export class ReutersStealthFallback implements ReutersNewsPort {
  async fetchHeadlines(maxItems: number = 15): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const { browser, page } = await PlaywrightBrowserFactory.launch();

    try {
      // Pre-nav pause
      const pauseMs = Math.random() * 1000 + 500;
      await new Promise(r => setTimeout(r, pauseMs));

      // Navigate
      await page.goto('https://www.reuters.com/business', {
        waitUntil: 'networkidle',
        timeout: 25000,
      });

      // DataDome check
      const content = await page.content();
      if (content.includes('captcha-delivery.com')) {
        console.warn('[reuters] datadome-block detected');
        return {
          source: NewsSource.REUTERS,
          articles: [],
          fetchedAt,
          method: 'playwright-stealth',
          error: 'datadome-block',
        };
      }

      // Scroll for humanization
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.33);
      });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.17);
      });

      // DOM extraction
      const articles: Article[] = [];
      const articleElems = await page.locator('article[data-testid="Article"]').all();

      for (const elem of articleElems.slice(0, maxItems)) {
        const headline = await elem.locator('[data-testid="Heading"]').textContent() || '';
        const urlElem = await elem.locator('a[href*="/article/"]').first();
        const url = await urlElem.getAttribute('href');
        const dateElem = await elem.locator('time[data-testid="DateLineTime"]').first();
        const publishedAt = await dateElem.getAttribute('datetime');

        articles.push({
          source: NewsSource.REUTERS,
          headline,
          url: url ? `https://reuters.com${url}` : null,
          publishedAt: normalizeDate(publishedAt),
          fetchedAt,
          confidence: 'LOW',
        });
      }

      return {
        source: NewsSource.REUTERS,
        articles,
        fetchedAt,
        method: 'playwright-stealth',
        error: null,
      };
    } finally {
      await browser.close();
    }
  }
}

function normalizeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
```

**Key notes:**
- This is FALLBACK only — cron job calls reuters-rss first; calls this only if RSS returns error or 0 articles
- DataDome is effective anti-bot (harder than PerimeterX); stealth patch is best-effort
- LOW confidence reflects brief's note "Playwright-stealth JS-level effectiveness declining (2026 per technique doc)"
- RAM constraint same as Bloomberg; must close browser in finally
- Timeout slightly shorter (25s vs 30s) since this is fallback (RSS is primary)

**Testing locally:**
```bash
cd apps/news-fetch
# Manual test (requires PLAYWRIGHT_LIVE=true and working DataDome bypass):
bun test src/__tests__/integration/reuters-stealth-live.test.ts
```

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service).
- All files in src/infrastructure/scrapers/
- Next task (1899a-routes) will wire fallback invocation (RSS error → trigger this)

---

## [QA] Review — 2026-05-13

**Verdict:** APPROVED
**Merge SHA:** `3e04dc5f` (feat commit shipped directly on main; branch `task/1899a-reuters-fallback` already deleted)
**Branch deleted:** yes
**Cycle:** dev-team c78

### Test Results

| Scope | Pass | Fail |
|---|---|---|
| Targeted (3 files) | 28 | 0 |
| Full suite (`apps/news-fetch/`) | 112 | 0 |

37 expect() calls across targeted tests. 178 expect() calls full suite. No regressions.

### TSC

`bun tsc --noEmit` — **0 errors** (clean output, no output = 0 errors).

Pre-existing errors note (dev flagged `playwright-browser-factory.ts:23` + `1899a-factory.test.ts:89`):
- `playwright-browser-factory.ts:23` — `import playwright from 'playwright'` is a default import, no type error observed under current tsconfig.
- `1899a-factory.test.ts:89` — `as unknown as` cast for Bun mock typing; idiomatic workaround, no structural type bug.
- Both lines are present and tsc returns 0 errors. No new task required — not real type bugs.

### DDD Compliance: PASS

`reuters-stealth.ts` imports (lines 20–22):
- `../../domain/repositories.js` (ReutersNewsPort)
- `../../domain/models.js` (NewsSource, Article, FetchResult)
- `./playwright-browser-factory.js` (PlaywrightBrowserFactory)

Zero imports from `application/` or `interface/`. grep returned nothing.

### Security: PASS

- No `process.env` — none found
- No hardcoded secrets, API keys, or passwords — none found
- No SQL — scraper only (no DB interaction)

### AC Verification

| AC | Status | Location |
|---|---|---|
| `reuters-stealth.ts` created | PASS | `apps/news-fetch/src/infrastructure/scrapers/reuters-stealth.ts` (133L) |
| Imports `ReutersNewsPort` from `../../domain/repositories.js` | PASS | line 20 |
| Imports `NewsSource, Article, FetchResult` from `../../domain/models.js` | PASS | line 21 |
| Imports `PlaywrightBrowserFactory` from `./playwright-browser-factory.js` | PASS | line 22 |
| Implements `ReutersNewsPort` | PASS | line 27 `implements ReutersNewsPort` |
| `fetchHeadlines(maxItems: number = 15): Promise<FetchResult>` | PASS | line 28 |
| Uses `PlaywrightBrowserFactory.launch()` (not `chromium.launch()` directly) | PASS | line 30 |
| try/finally block wrapping page ops | PASS | lines 32–119 |
| `browser.close()` in finally | PASS | line 118 |
| Pre-nav pause 500–1500 ms | PASS | lines 34–35 |
| `page.goto` timeout 25000ms | PASS | lines 37–40 (`PAGE_TIMEOUT_MS = 25_000`) |
| DataDome header check (`x-dd-b: 3`) | PASS | lines 43–53 |
| DataDome body check (`captcha-delivery.com`) | PASS | lines 56–66 |
| Both DataDome paths return `error: 'datadome-block', articles: []` | PASS | lines 46–52, 59–65 |
| Scroll humanization 33% then 50% | PASS | lines 69–74 |
| DOM selector `article[data-testid="Article"]` | PASS | line 78 |
| Headline selector `[data-testid="Heading"]` | PASS | line 81 |
| URL selector `a[href*="/article/"]`, prefixed with `https://www.reuters.com` | PASS | lines 84–86 |
| Date selector `time[data-testid="DateLineTime"]` datetime attr | PASS | lines 88–89 |
| `confidence: 'LOW'` (always LOW for FALLBACK) | PASS | line 97 |
| `method: 'playwright-stealth'` on all return paths | PASS | lines 50, 63, 105, 114 |
| `source: NewsSource.REUTERS` on all return paths | PASS | lines 47, 60, 101, 111 |
| `normalizeDate` helper function exported | PASS | line 124 |
| Catch block for generic errors (network/timeout) | PASS | lines 108–116 |
| Empty page returns `articles: [], error: null` | PASS | lines 100–107 |
| maxItems cap applied via `.slice(0, maxItems)` | PASS | line 80 |
| TypeScript strict (no `any`, `.js` import paths) | PASS | all imports end `.js`, no `any` in prod code |

All AC items: PASS (28/28).

### Issues

**Blocking:** none

**Non-Blocking:** none

### Notes

- Split-policy (200L cap): all 4 files within cap — `reuters-stealth.ts` 133L, 3 test files 197L / 158L / 119L. Developer learned from c77 bloomberg 494L flag. No follow-up split task needed.
- Pattern identical to 1899a-bloomberg (c77): same factory, same shape, DataDome instead of PerimeterX. FALLBACK designation correct.
- `normalizeDate` exported (unlike bloomberg-stealth's unexported helper) — enables direct unit testing. Clean design improvement over c77 sibling.
