# TASK 1899a-factory — Shared Infrastructure: PlaywrightBrowserFactory

**Sprint:** 1899a | **Branch:** `task/1899a-factory-browser` | **Size:** S | **Zone:** apps/news-fetch/

---

## TLDR

Implement PlaywrightBrowserFactory: a shared utility that launches Chromium with stealth settings, applies playwright-stealth JS patch, and returns `{ browser, context, page }`. Both Bloomberg and Reuters fallback scrapers call this factory (never call playwright.chromium.launch() directly). Factory handles browser lifecycle cleanup.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §6: Infrastructure Scrapers — PlaywrightBrowserFactory subsection (§6c note)
- §6a/§6b/§6c: Scrapers must import factory, not launch directly
- RAM constraint (§9): Browser launched on-demand, closed in finally block

**File Structure:**
- Lives in: `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts`
- Imported by: `reuters-stealth.ts`, `bloomberg-stealth.ts`
- Pattern: Single Responsibility (launch/configure/close only; no scraping logic)

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts` | PlaywrightBrowserFactory class + launch function | ~80 |

**Dependencies:** Depends on 1899a-core (tsconfig for imports).

**Files to Modify:** None (adapters depend on this).

**Knowledge Needed:**
- Brief §6 (Playwright stealth specs)
- `docs/mainserver-crawl-techniques/playwright-stealth-setup.md` (if exists, for stealth recipe)
- `docs/policies/dev-standards.md` (infra patterns)

---

## Acceptance Criteria

- [ ] **src/infrastructure/scrapers/playwright-browser-factory.ts created**:
  - Imports: `playwright` npm package, `stealth` from playwright-stealth
  - No imports from domain, application, or interface layers

- [ ] **PlaywrightBrowserFactory class**:
  - Purpose: Singleton or static factory for launching Chromium
  - Method: `async launch(): Promise<{ browser: Browser; context: BrowserContext; page: Page }>`
    - Calls `playwright.chromium.launch({ headless: true })`
    - Applies stealth patch: `await stealth(context)` on context
    - Adds human simulation args (see brief §6b/§6c for optional pre-nav pause, scroll timing)
    - Returns `{ browser, context, page: await context.newPage() }`
    - No error handling (caller handles catch)

- [ ] **Browser cleanup pattern**:
  - Caller owns browser.close() lifecycle
  - Factory does NOT close (caller must call in finally block per brief §6b/§6c)
  - Factory exports only launch function (no close wrapper)

- [ ] **Playwright API compliance**:
  - Return type matches Playwright TS typings: `Browser`, `BrowserContext`, `Page` from playwright module
  - User-Agent header set per dev-standards (if required by standards doc)

- [ ] **Stealth application**:
  - playwright-stealth npm package installed (dependency in package.json from 1899a-core)
  - `stealth(context)` called AFTER context creation, BEFORE newPage()
  - Proper await on async stealth() function

- [ ] **Typescript strict mode**:
  - All types explicit, no implicit any
  - async/await syntax correct

- [ ] **No hardcoded timeouts**:
  - All timeout/pause values in calling scraper code (not in factory)
  - Factory is launch-only

- [ ] **Commit message**:
  - Format: `feat(1899a-factory): PlaywrightBrowserFactory — Chromium launch + stealth patch`
  - Trailers: `Task: 1899a-factory`

---

## [Developer] Notes

**Factory signature (from brief pattern):**

```typescript
// playwright-browser-factory.ts
import playwright from 'playwright';
import stealth from 'playwright-stealth';

export class PlaywrightBrowserFactory {
  static async launch(): Promise<{ 
    browser: playwright.Browser; 
    context: playwright.BrowserContext; 
    page: playwright.Page 
  }> {
    const browser = await playwright.chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      userAgent: '<BROWSER_UA from dev-standards if required>',
    });
    await stealth(context);
    const page = await context.newPage();
    return { browser, context, page };
  }
}

// Caller pattern (for reference, not this task):
// const { browser, context, page } = await PlaywrightBrowserFactory.launch();
// try {
//   await page.goto(url);
//   // scraping logic
// } finally {
//   await browser.close();
// }
```

**Pattern notes:**
- Static method (no instance needed)
- Returns tuple/object with all three handles (browser, context, page)
- Caller is responsible for browser.close() in finally block
- Stealth patch applied to context before newPage() (order matters per playwright-stealth docs)

**Testing locally:**
```bash
cd apps/news-fetch
tsc --noEmit
npm ls playwright playwright-stealth
# Verify both installed
```

**Common pitfalls:**
- Forgetting await on stealth() call — it's async
- Calling stealth on page instead of context — wrong API
- Launching without headless: true (will hang in container environment)
- Not returning browser from factory (caller needs it for .close())

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service).
- All files in src/infrastructure/scrapers/
- Next tasks (1899a-bloomberg, 1899a-reuters-fallback) will import and use this factory

---

## [QA] Review — 2026-05-13

**Verdict: APPROVED**
**Merge SHA:** `b2b84977`
**Branch deleted:** yes (`fix/1899a-news-fetch-factory`)

### Test Results
- Unit tests (1899a-factory): 10/10 pass
- Full suite (apps/news-fetch/): 29/29 pass, 0 fail
- TypeScript (`bun tsc --noEmit`): 0 errors

### DDD Compliance: PASS
- `playwright-browser-factory.ts` imports only `playwright` + `playwright-stealth` (npm packages)
- Zero imports from `domain/`, `application/`, or `interface/` layers

### Security: PASS
- No `process.env` usage
- No hardcoded secrets or API keys
- No SQL (factory is browser-launch only)

### Issues Found
#### Blocking
None.

#### Non-Blocking
None.

### Notes
- Factory branch carried domain commit `b71ba215` (feat: 1899a-domain) — both landed in main via this merge. Domain QA branch was already at main HEAD, so no double-merge risk.
- Sibling `fix/1899a-news-fetch-reuters-rss` (dev-mainserver-crawls) depends on factory being on main — now unblocked.
