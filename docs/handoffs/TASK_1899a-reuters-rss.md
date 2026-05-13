# TASK 1899a-reuters-rss — Reuters RSS Scraper (Primary Path, No Browser)

**Sprint:** 1899a | **Branch:** `task/1899a-reuters-rss` | **Size:** M | **Zone:** apps/news-fetch/

---

## TLDR

Implement ReutersRssScraper: fetch Reuters RSS feed (https://feeds.reuters.com/reuters/businessNews), parse XML to Article[], HIGH confidence. No Playwright—pure fetch + XML parse. Implements ReutersNewsPort interface. Fallback logic (when RSS fails) is out of scope (belongs to 1899a-reuters-fallback).

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §6a: reuters-rss.ts — PRIMARY path, RSS fetch, XML parse, HIGH confidence
- §6b: reuters-stealth.ts — FALLBACK (separate task)
- §13: Failure Modes — return error on HTTP 4xx/5xx, empty articles guard

**URL & Selectors:**
- RSS Feed: `https://feeds.reuters.com/reuters/businessNews`
- Parser: Bun's native `DOMParser` or minimal XML utility
- Confidence: HIGH (structured feed)
- RAM: ~30–50 MB (no browser)
- Timeout: 10 seconds

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts` | ReutersRssScraper class, XML parse, HIGH confidence | ~100 |

**Dependencies:** Depends on 1899a-domain (implements ReutersNewsPort).

**Files to Modify:** None.

**Knowledge Needed:**
- Brief §6a (RSS URL, parser requirements)
- Brief §13 (failure modes: HTTP error, empty guard)
- `docs/policies/dev-standards.md` (User-Agent, error handling)

---

## Acceptance Criteria

- [ ] **src/infrastructure/scrapers/reuters-rss.ts created**:
  - Imports `{ ReutersNewsPort, FetchResult }` from ../../domain/
  - Imports `{ NewsSource, Article }` from ../../domain/models

- [ ] **ReutersRssScraper class**:
  - Implements `ReutersNewsPort` interface
  - Constructor: no args, or with optional logger
  - Method: `async fetchHeadlines(maxItems: number = 15): Promise<FetchResult>`

- [ ] **HTTP fetch behavior**:
  - Fetches `https://feeds.reuters.com/reuters/businessNews`
  - Uses browser User-Agent per dev-standards (e.g., `Mozilla/5.0 ...`)
  - Timeout: 10 seconds (Bun timeout or AbortSignal)
  - On HTTP error (resp.ok === false): 
    - Log warning (e.g., `[reuters-rss] HTTP error {status}`)
    - Return `FetchResult { source: REUTERS, articles: [], error: 'HTTP {status}', fetchedAt, method: 'rss' }`

- [ ] **XML parsing**:
  - Parse RSS feed XML into item elements
  - Extract per item: title (→ headline), link (→ url, null if missing), pubDate (→ publishedAt, ISO parse)
  - Limit to maxItems rows
  - If feed is empty or parse fails: return `FetchResult { articles: [], error: '...', fetchedAt, ... }`

- [ ] **Article construction**:
  - `confidence: 'HIGH'` (RSS is structured)
  - `fetchedAt: new Date().toISOString()`
  - `publishedAt: parseDate(item.pubDate)` — normalize to ISO string or null if unparseable
  - `source: NewsSource.REUTERS`
  - `method: 'rss'`

- [ ] **Empty guard**:
  - If articles.length === 0 after parse: log info, return articles array as-is (do NOT trigger fallback here; that's cron job responsibility)

- [ ] **Date normalization**:
  - Handle RFC 2822 format (Reuters standard): `Mon, 13 May 2026 14:30:00 GMT`
  - Convert to ISO 8601: `2026-05-13T14:30:00Z`
  - If parse fails, set publishedAt to null (not error)

- [ ] **Typescript strict mode**:
  - All types explicit
  - Proper error types (Error handling if needed)

- [ ] **Commit message**:
  - Format: `feat(1899a-reuters-rss): Reuters RSS scraper — fetch + XML parse, HIGH confidence`
  - Trailers: `Task: 1899a-reuters-rss`

---

## [Developer] Notes

**RSS parse pattern:**

```typescript
// reuters-rss.ts (skeleton)
import { ReutersNewsPort } from '../../domain/repositories';
import { NewsSource, Article, FetchResult } from '../../domain/models';

export class ReutersRssScraper implements ReutersNewsPort {
  async fetchHeadlines(maxItems: number = 15): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();
    
    try {
      const resp = await fetch('https://feeds.reuters.com/reuters/businessNews', {
        headers: { 'User-Agent': '<BROWSER_UA>' },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        return {
          source: NewsSource.REUTERS,
          articles: [],
          fetchedAt,
          method: 'rss',
          error: `HTTP ${resp.status}`,
        };
      }

      const text = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      
      const items = doc.querySelectorAll('item').slice(0, maxItems);
      const articles: Article[] = [];

      items.forEach((item) => {
        const headline = item.querySelector('title')?.textContent || '';
        const url = item.querySelector('link')?.textContent || null;
        const pubDate = item.querySelector('pubDate')?.textContent || null;
        
        articles.push({
          source: NewsSource.REUTERS,
          headline,
          url,
          publishedAt: pubDate ? normalizeRfcDate(pubDate) : null,
          fetchedAt,
          confidence: 'HIGH',
        });
      });

      return {
        source: NewsSource.REUTERS,
        articles,
        fetchedAt,
        method: 'rss',
        error: articles.length === 0 ? null : null,
      };
    } catch (err) {
      return {
        source: NewsSource.REUTERS,
        articles: [],
        fetchedAt,
        method: 'rss',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function normalizeRfcDate(rfcDate: string): string | null {
  try {
    const date = new Date(rfcDate);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
```

**Testing locally:**
```bash
cd apps/news-fetch
curl -H "User-Agent: Mozilla/5.0" https://feeds.reuters.com/reuters/businessNews | head -50
# Verify RSS structure before coding
```

**Common pitfalls:**
- DOMParser API differs across runtimes (Bun has XMLParser module; check Bun docs)
- RFC 2822 parse edge cases (timezones, locale-specific month names)
- Empty feed is NOT an error (return articles: [], error: null)
- maxItems pagination: slice before parse to avoid processing extra

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service).
- All files in src/infrastructure/scrapers/
- Next task (1899a-routes) will wire this scraper into use case
