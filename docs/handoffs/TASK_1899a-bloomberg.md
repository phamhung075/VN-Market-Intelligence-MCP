# TASK 1899a-bloomberg — Bloomberg Stealth Scraper (Playwright, Primary Path)

**Sprint:** 1899a | **Branch:** `task/1899a-bloomberg-scraper` | **Size:** L | **Zone:** apps/news-fetch/

---

## TLDR

Implement BloombergStealth: Playwright Chromium + stealth patch to bypass PerimeterX passive phase (200 delivered on first load). Extracts headlines via DOM selectors AND `__NEXT_DATA__` JSON fallback. Implements BloombergNewsPort interface. HIGH confidence on DOM; LOW on JSON fallback. Mandatory browser.close() in finally block.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §6c: bloomberg-stealth.ts — PRIMARY path (PerimeterX passive phase)
- §13: Failure Modes — PerimeterX challenge detection, zero articles guard
- §6: PlaywrightBrowserFactory — shared factory call pattern

**URL & Selectors:**
- Site: `https://www.bloomberg.com/news`
- DOM selectors (from recon):
  - Headline container: `[data-component="headline"]`
  - Link: `a[href^="/news/articles/"]`
  - Date: `time[data-type="published-at"]`
- JSON fallback: `script#__NEXT_DATA__` → `props.pageProps.stories[].headline` + `.publishedAt`
- Confidence: HIGH (DOM), LOW (JSON fallback)
- RAM: ~400–500 MB per scrape
- Timeout: 30 seconds (Playwright page load)

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/infrastructure/scrapers/bloomberg-stealth.ts` | BloombergStealth class, DOM + JSON parse, PRIMARY | ~150 |

**Dependencies:** Depends on 1899a-domain, 1899a-factory (PlaywrightBrowserFactory).

**Files to Modify:** None.

**Knowledge Needed:**
- Brief §6c (selectors, JSON path, PerimeterX passive)
- Brief §9 (RAM constraint, must close browser in finally)
- `docs/mainserver-crawl-techniques/playwright-stealth-setup.md` (if exists)

---

## Acceptance Criteria

- [ ] **src/infrastructure/scrapers/bloomberg-stealth.ts created**:
  - Imports `{ BloombergNewsPort }` from ../../domain/repositories
  - Imports `{ NewsSource, Article, FetchResult }` from ../../domain/models
  - Imports `{ PlaywrightBrowserFactory }` from ./playwright-browser-factory

- [ ] **BloombergStealth class**:
  - Implements `BloombergNewsPort` interface
  - Constructor: no args, or with optional logger
  - Method: `async fetchHeadlines(maxItems: number = 10): Promise<FetchResult>`

- [ ] **Browser lifecycle**:
  - Calls `PlaywrightBrowserFactory.launch()` to get { browser, context, page }
  - Does NOT call `playwright.chromium.launch()` directly
  - Wraps page operations in try/finally block
  - MANDATORY: `browser.close()` in finally (brief §6c, §9 RAM constraint)
  - Never returns without browser cleanup

- [ ] **Navigation & human simulation**:
  - Navigates to `https://www.bloomberg.com/news`
  - Optional pre-nav pause: random 0.5–1.5 seconds (humanization)
  - Optional scroll: page.evaluate() to scroll to 33% then 50% viewport height
  - Timeout: 30 seconds page.goto timeout or global AbortSignal

- [ ] **DOM extraction (primary)**:
  - Select elements: `[data-component="headline"]` (article containers)
  - For each: extract:
    - Headline: text content of matching headline element
    - URL: `a[href^="/news/articles/"]` within container (or null if missing)
    - PublishedAt: `time[data-type="published-at"]` data-value or datetime attribute
  - Limit to maxItems
  - Set confidence: 'HIGH' (DOM is structured)

- [ ] **JSON fallback extraction**:
  - If DOM extraction yields 0 articles:
    - Find `<script id="__NEXT_DATA__">` tag
    - Parse JSON, navigate path: `window.__NEXT_DATA__.props.pageProps.stories[].headline`, `.publishedAt`
    - Extract same fields
    - Set confidence: 'LOW' (JS-level, less reliable per brief)

- [ ] **PerimeterX detection**:
  - Check if `page.content()` contains `px-block` class (challenge page indicator)
  - If detected: return `FetchResult { error: "perimeterx-challenge", articles: [], ... }`
  - Log WARNING: `[bloomberg] PerimeterX challenge detected`
  - Do NOT retry in same cycle (per brief §13)

- [ ] **Article construction**:
  - `source: NewsSource.BLOOMBERG`
  - `fetchedAt: new Date().toISOString()`
  - `publishedAt: normalizeDate(timeValue)` — ISO string or null
  - `confidence: 'HIGH' | 'LOW'` (per extraction path)
  - `method: 'playwright-stealth'`

- [ ] **Error handling**:
  - Timeout: return error message, articles: []
  - Network error: return error message, articles: []
  - Paywall content (zero articles): return articles: [], error: null (not an error per brief §13)

- [ ] **Typescript strict mode**:
  - All types explicit, async/await syntax correct
  - No implicit any

- [ ] **Commit message**:
  - Format: `feat(1899a-bloomberg): Bloomberg stealth scraper — DOM + JSON fallback, PerimeterX bypass`
  - Trailers: `Task: 1899a-bloomberg`

---

## [Developer] Notes

**Scraper skeleton:**

```typescript
// bloomberg-stealth.ts (simplified)
import { BloombergNewsPort } from '../../domain/repositories';
import { NewsSource, Article, FetchResult } from '../../domain/models';
import { PlaywrightBrowserFactory } from './playwright-browser-factory';

export class BloombergStealth implements BloombergNewsPort {
  async fetchHeadlines(maxItems: number = 10): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    const { browser, page } = await PlaywrightBrowserFactory.launch();

    try {
      // Pre-nav pause
      const pauseMs = Math.random() * 1000 + 500;
      await new Promise(r => setTimeout(r, pauseMs));

      // Navigate
      await page.goto('https://www.bloomberg.com/news', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Check PerimeterX
      const content = await page.content();
      if (content.includes('px-block')) {
        return {
          source: NewsSource.BLOOMBERG,
          articles: [],
          fetchedAt,
          method: 'playwright-stealth',
          error: 'perimeterx-challenge',
        };
      }

      // DOM extraction
      let articles: Article[] = [];
      const headlines = await page.locator('[data-component="headline"]').all();
      
      for (const elem of headlines.slice(0, maxItems)) {
        const headline = await elem.textContent() || '';
        const urlElem = await elem.locator('a[href^="/news/articles/"]').first();
        const url = await urlElem.getAttribute('href');
        const dateElem = await elem.locator('time[data-type="published-at"]').first();
        const publishedAt = await dateElem.getAttribute('datetime');

        articles.push({
          source: NewsSource.BLOOMBERG,
          headline,
          url: url ? `https://bloomberg.com${url}` : null,
          publishedAt: normalizeDate(publishedAt),
          fetchedAt,
          confidence: 'HIGH',
        });
      }

      // JSON fallback if DOM empty
      if (articles.length === 0) {
        const script = await page.locator('script#__NEXT_DATA__').textContent();
        if (script) {
          try {
            const data = JSON.parse(script);
            const stories = data?.props?.pageProps?.stories || [];
            articles = stories.slice(0, maxItems).map((story: any) => ({
              source: NewsSource.BLOOMBERG,
              headline: story.headline || '',
              url: story.url || null,
              publishedAt: normalizeDate(story.publishedAt),
              fetchedAt,
              confidence: 'LOW',
            }));
          } catch (e) {
            // JSON parse failed, continue with empty
          }
        }
      }

      return {
        source: NewsSource.BLOOMBERG,
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

**Important notes:**
- Brief says "200 delivered on first load" = PerimeterX passive phase (no challenge page on first GET). Stealth JS patch is applied by PlaywrightBrowserFactory.
- Timeout of 30s is generous (PerimeterX adds delay but should resolve)
- "Paywall note: only public/free headlines accessible" — do NOT try to unlock paywalled content
- RAM spikes during browser.launch; ensure container has 2.5GB limit

**Testing locally:**
```bash
cd apps/news-fetch
# Manual test (requires PLAYWRIGHT_LIVE=true in env):
bun test src/__tests__/integration/bloomberg-stealth-live.test.ts
```

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service).
- All files in src/infrastructure/scrapers/
- Next task (1899a-routes) will wire this into use case

---

## [QA] Review — 2026-05-13

**Verdict:** APPROVED
**Merge SHA:** `d76fc44b`
**Branch deleted:** yes (`task/1899a-bloomberg-scraper`); notebook HEAD also committed (`bf0f3bdd`)

### Test Results

| Scope | Pass | Fail |
|---|---|---|
| `__tests__/1899a-bloomberg.test.ts` (targeted) | 29 | 0 |
| Full suite — `apps/news-fetch/` (5 files) | 84 | 0 |

41 expect() calls in targeted file. 141 expect() calls across full suite. 0 regressions introduced.

### TypeScript

`bun tsc --noEmit` — **0 errors**.

### DDD Compliance — PASS

`bloomberg-stealth.ts` imports:
- `../../domain/repositories.js` — domain port interface
- `../../domain/models.js` — domain value types
- `./playwright-browser-factory.js` — permitted sibling infrastructure

Zero imports from `application/`, `interface/`, or any other infra module.

### Security — PASS

- No `process.env` (uses `Bun.env` pattern; scraper has no env reads at all — correct for a pure scraper)
- No hardcoded credentials or API keys; `BLOOMBERG_NEWS_URL` is a public URL constant — not a secret
- No SQL (no database layer in this file)
- No unguarded `!` non-null assertions; all attribute reads use `.catch(() => null)` fallback
- `any` appears only in JSDoc comment (`/** Normalise any parseable... */`), not as a TypeScript type

### AC Verification

| AC | Status | Note |
|---|---|---|
| `bloomberg-stealth.ts` created | PASS | `apps/news-fetch/src/infrastructure/scrapers/bloomberg-stealth.ts` — 150L |
| Imports `BloombergNewsPort` from `../../domain/repositories` | PASS | line 17 (type import) |
| Imports `NewsSource, Article, FetchResult` from `../../domain/models` | PASS | line 18 |
| Imports `PlaywrightBrowserFactory` from `./playwright-browser-factory` | PASS | line 19 |
| `BloombergStealth` implements `BloombergNewsPort` | PASS | line 24 |
| `async fetchHeadlines(maxItems: number = 10): Promise<FetchResult>` | PASS | line 25 |
| Calls `PlaywrightBrowserFactory.launch()` — NOT `playwright.chromium.launch()` | PASS | line 27 |
| `try/finally` wrapping page operations | PASS | lines 29–136 |
| `browser.close()` in `finally` block | PASS | line 135; 3 test cases assert 1 call each (happy / px-block / goto-throws) |
| Pre-nav pause 500–1500 ms | PASS | lines 31–32 |
| Scroll to 33% then 50% viewport | PASS | lines 40–45 |
| Navigates to `https://www.bloomberg.com/news`, timeout 30 s | PASS | lines 34–37 |
| DOM selector `[data-component="headline"]` | PASS | line 62 |
| Extracts headline, URL (prefixed), publishedAt (`data-value` then `datetime`) | PASS | lines 65–83 |
| `confidence: 'HIGH'` for DOM path | PASS | line 83 |
| JSON fallback on 0 DOM articles — `script#__NEXT_DATA__` | PASS | lines 88–116 |
| JSON path `props.pageProps.stories[].headline/.publishedAt` | PASS | lines 98–113 |
| `confidence: 'LOW'` for JSON fallback | PASS | line 109 |
| PerimeterX `px-block` detection | PASS | lines 49–58 |
| Returns `error: 'perimeterx-challenge'`, `articles: []` on px-block | PASS | lines 51–57 |
| `console.warn` on PerimeterX | PASS | line 50 (produces output in test run — confirmed) |
| No retry in same cycle | PASS | single return, no retry logic |
| `source: NewsSource.BLOOMBERG` | PASS | all Article push calls |
| `fetchedAt: new Date().toISOString()` | PASS | line 26 |
| `method: 'playwright-stealth'` | PASS | all FetchResult returns |
| Timeout error → `articles: [], error: <message>` | PASS | lines 125–133 + test |
| Network error → `articles: [], error: <message>` | PASS | same catch block |
| Zero articles + no error → `articles: [], error: null` | PASS | test case "both DOM and __NEXT_DATA__ yield nothing" |
| Strict TypeScript — no implicit `any` | PASS | `any` in JSDoc comment only; JSON fallback uses `Record<string, unknown>` cast |

All 10 AC groups pass.

### Issues

**Blocking:** none.

**Non-Blocking:**
1. `[NB-1]` `bloomberg-stealth.ts` line 140 — `/** Normalise any parseable... */` — JSDoc word "any" is fine, but the `any` annotation in the skeleton (`story: any`) was intentionally replaced with `Record<string, unknown>` — good catch by developer. No action needed.
2. `[NB-2]` **Split-policy decision** — see below.

### Split-Policy Decision — (b) APPROVE with follow-up task

Test file is **494L** vs 200L cap in `docs/policies/dev-standards.md`.

**Decision: (b) — Approve now; open follow-up task `1899a-bloomberg-test-split`.**

Rationale: the 494L file has clean, non-overlapping logical groupings that map directly to split boundaries:
- Lines 1–258 — DOM extraction happy path (8 cases) → `1899a-bloomberg-dom.test.ts`
- Lines 260–280 — maxItems cap (1 case) — folds into dom file
- Lines 282–361 — JSON fallback (5 cases) → `1899a-bloomberg-json-fallback.test.ts`
- Lines 363–427 — PerimeterX + lifecycle (4 cases) → `1899a-bloomberg-lifecycle.test.ts`
- Lines 463–494 — `normalizeDate` helper (7 cases) → `1899a-bloomberg-normalize-date.test.ts`

No logic interleaving: mock setup is at module scope (shared), but each group could carry its own `activeMockPage` reset. The 200L cap exists to reduce review contention and diff noise — the bloomberg test file poses zero merge risk as it is self-contained. Splitting now adds non-trivial effort for zero functional gain in this cycle.

Follow-up task `1899a-bloomberg-test-split` will be opened for next cycle: split into 4 files, each ≤200L, verify all 29 tests still pass after split.

### Notes

- `normalizeDate` is exported (line 141) — correct, enables direct unit testing (7 normalizeDate tests confirm ISO roundtrip, null passthrough, timezone normalisation to UTC).
- PerimeterX `console.warn` producing stdout in test run is expected and acceptable; tests assert on returned `error` field, not stderr.
- `browser.close()` lifecycle verified in 3 independent code paths (success / px-block / goto-throws) — RAM constraint fully respected per brief §9.
- Implementation matches developer skeleton in §[Developer] Notes almost exactly, with two improvements: (1) proper `catch(() => null)` guards on attribute reads vs bare `.getAttribute()`, (2) `Record<string, unknown>` cast instead of `any` for JSON fallback iteration.
