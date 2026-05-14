# Task Handoff — 1905a-news-fetch-stealth-fix

**Sprint:** c88
**Branch:** `task/c88-1905a-news-fetch-stealth-fix`
**Commit:** `502499e3`
**Status:** DONE — ready for QA gate

---

## Chosen Option: B — remove playwright-stealth, inline stealth

**Why not option A (dynamic import / CJS interop):**
Probe confirmed `playwright-stealth` v0.0.1 throws intentionally at load time:
```
throw new Error('Wrong package, please see this: https://github.com/berstend/puppeteer-extra/issues/454')
```
This is a placeholder package that has never been functional. No CJS interop can fix a module that exits with an error on import regardless of how it is loaded.

**Why option B:**
Inline stealth via Playwright's native API is strictly superior:
- `context.addInitScript()` runs before any page script — same timing as playwright-stealth would have
- `navigator.webdriver = undefined` is the single most effective anti-fingerprint patch
- No additional dependency, no ESM/CJS ambiguity, type-safe

---

## Diff Summary

### `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts`
- Removed: `import stealth from 'playwright-stealth'`
- Removed: `await stealth(context)` call
- Added: `STEALTH_INIT_SCRIPT` constant (patches `navigator.webdriver`)
- Added: `await context.addInitScript(STEALTH_INIT_SCRIPT)` before `newPage()`
- Added to `newContext()`: `viewport`, `locale`, `colorScheme` options

### `apps/news-fetch/package.json`
- Removed: `"playwright-stealth": "0.0.1"` from dependencies

### `apps/news-fetch/bun.lock`
- Regenerated: 1 package removed

### Test files updated (mock context missing `addInitScript`):
- `__tests__/1899a-bloomberg.test.ts` — added `addInitScript` to playwright mock, removed `playwright-stealth` mock
- `__tests__/1899a-reuters-fallback-detect.test.ts` — same
- `__tests__/1899a-reuters-fallback-lifecycle.test.ts` — same
- `__tests__/1899a-reuters-fallback-dom.test.ts` — same
- `__tests__/1899a-factory.test.ts` — rewrote stealth assertions: `stealthCalls` replaced by `addInitScript` call assertions; `playwright-stealth` mock removed
- `src/__tests__/unit/bloomberg-stealth.test.ts` — added `addInitScript` to playwright mock, removed `playwright-stealth` mock

### New test file:
- `src/__tests__/unit/1905a-playwright-browser-factory.test.ts` — 6 ACs, RED→GREEN confirmed

---

## Test Results

```
172 pass / 6 skip (integration/live, expected) / 0 fail
tsc: clean (0 errors)
DDD scan: clean (no infra imports from domain/application)
```

---

## What Ops Needs Post-Merge

1. **Rebuild news-fetch container:**
   ```bash
   docker compose build news-fetch
   docker compose up -d news-fetch
   ```
   The `bun install --frozen-lockfile` in Stage 1 will install without `playwright-stealth`.

2. **Verify healthy state:**
   ```bash
   docker inspect news-fetch-container --format '{{.State.Health.Status}}'
   # expected: healthy
   ```

3. **Verify cron fires successfully on next tick (30-min cycle):**
   Check `mcp-server` logs for `newsHeadlinesRefreshJob` — should show HTTP 200 from `news-fetch:5008` instead of connection-refused.

4. **No rollback risk:** stealth behaviour is functionally unchanged (navigator.webdriver was never patched before since the package always threw on import). The new inline patch is additive improvement only.
