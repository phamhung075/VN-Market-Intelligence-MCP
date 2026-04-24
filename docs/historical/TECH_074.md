# TECH-074: Fix RSS Parser — Atom 1.0 Entry Support

status: APPROVED_BY_ARCHITECT
req_ref: REQ-074

---

## Brownfield Impact

- Files modified: `src/infrastructure/fetchers/rss.ts`
- Files created: `src/__tests__/1188-rss-atom.test.ts`
- Files deleted: none
- Breaking changes: no — `parseRssFeed(xml: string): RssItem[]` signature unchanged,
  `RssItem` interface unchanged, all callers unchanged.

---

## Architecture Decision

The fix lives entirely inside the infrastructure layer's `rss.ts` module. The existing
`$("item")` loop is extended to a union selector `$("item, entry")` and the per-element
field extraction branches on the element tag name: RSS 2.0 elements use the existing
`.find("link").first().text()` path; Atom `<entry>` elements use a new `extractAtomUrl`,
`extractAtomDate`, and `extractAtomContent` helper block. Branching on tag name (not
feed-level heuristics) ensures both formats can coexist in one loop and the RSS 2.0 code
path is never touched by the Atom branch.

---

## DDD Layer Plan

| Component             | Layer          | File Path                                        | New/Modify |
| --------------------- | -------------- | ------------------------------------------------ | ---------- |
| `parseRssFeed()`      | infrastructure | `src/infrastructure/fetchers/rss.ts`             | MODIFY     |
| Atom helper block     | infrastructure | `src/infrastructure/fetchers/rss.ts` (inline)    | NEW        |
| Atom unit tests       | infrastructure | `src/__tests__/1188-rss-atom.test.ts`            | NEW        |

No domain, application, or interface layer changes.

---

## Interface Contracts

### `parseRssFeed` — unchanged signature

```typescript
export function parseRssFeed(xml: string): RssItem[]
```

### `RssItem` — unchanged

```typescript
export interface RssItem {
  title: string;
  url: string;
  publishedAt: string;
  content: string;
  source: string;
}
```

---

## Exact Code Changes — `src/infrastructure/fetchers/rss.ts`

### Change 1 — Union selector (line 60)

Replace:

```typescript
$("item").each((_idx, el) => {
```

With:

```typescript
$("item, entry").each((_idx, el) => {
```

One character change. Cheerio's xmlMode CSS selector engine already supports comma-union
selectors. `<item>` and `<entry>` are mutually exclusive in real feeds so order does not
matter; both are iterated in document order.

### Change 2 — Per-element field extraction (inside the `.each()` callback)

Replace the four `const` declarations that extract `title`, `url`, `publishedAt`,
`content` with a tag-name branch. The complete new body of the `.each()` callback
(replacing lines 62-69 of the current file) is:

```typescript
const $el = $(el);
const tagName = (el as cheerio.Element & { tagName?: string }).tagName ?? el.type;
const isAtom = tagName === "entry";

const title = $el.find("title").first().text().trim();

let url: string;
let publishedAt: string;
let content: string;

if (isAtom) {
  // FR-2: Atom URL — priority chain
  const linkEl = $el.find("link[rel='alternate'][href]").first();
  const linkAny = $el.find("link[href]").first();
  const idText = $el.find("id").first().text().trim();
  url =
    linkEl.attr("href")?.trim() ||
    linkAny.attr("href")?.trim() ||
    idText ||
    "";

  // FR-3: Atom date — priority chain
  publishedAt =
    $el.find("published").first().text().trim() ||
    $el.find("updated").first().text().trim() ||
    "";

  // FR-4: Atom content — priority chain
  content =
    $el.find("summary").first().text().trim() ||
    $el.find("content").first().text().trim() ||
    "";
} else {
  // RSS 2.0 — existing path, unchanged
  url = $el.find("link").first().text().trim();
  publishedAt = $el.find("pubDate").first().text().trim();
  content =
    $el.find("description").first().text().trim() ||
    $el.find("content\\:encoded").first().text().trim() ||
    $el.find("encoded").first().text().trim();
}
```

Key implementation notes:

1. `isAtom` is derived from the element's `tagName` property. Cheerio exposes `tagName`
   on element nodes in xmlMode; the cast to `& { tagName?: string }` is required because
   the Cheerio `AnyNode` type does not declare `tagName` in all versions — the fallback
   to `el.type` is unreachable in practice but keeps TypeScript strict.

2. The Atom URL chain uses attribute selectors directly on `<link>`:
   - `link[rel='alternate'][href]` — Google News shape: self-closing, no text content.
   - `link[href]` — baodautu.vn shape: `<link href="..."/>` with no `rel` attribute.
   - `$el.find("id").first().text()` — last-resort IRI from `<id>`.
   Using `.attr("href")` (not `.text()`) is mandatory for self-closing elements.

3. The RSS 2.0 `else` branch is identical to the original code. No behavioral change
   for any existing caller.

4. The `decodeHtmlEntities()` calls at the `items.push()` site remain unchanged —
   they apply to both paths automatically.

---

## Test Fixture Design — `src/__tests__/1188-rss-atom.test.ts`

### Fixture builder `buildMockAtomFeed()`

Mirrors the `buildMockRss()` helper in `021-rss-cafef.test.ts` but emits Atom 1.0
markup. Accepts a typed entries array so each test can craft the exact shape it needs.

```typescript
interface AtomEntry {
  title: string;
  linkRel?: "alternate" | "none";  // "alternate" = Google News, "none" = baodautu.vn shape
  href?: string;                   // href attr value for <link>
  idText?: string;                 // <id> text, used as last-resort URL
  published?: string;              // ISO 8601
  updated?: string;                // ISO 8601, used when published absent
  summary?: string;                // Atom <summary>
  content?: string;                // Atom <content>, used when summary absent
}
```

The builder emits:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Google News</title>
  <entry>
    <title>...</title>
    <link rel="alternate" href="https://..."/>   <!-- or <link href="..."/> or omitted -->
    <id>urn:uuid:...</id>
    <published>2026-04-13T07:30:00Z</published>  <!-- or omitted -->
    <updated>2026-04-13T08:00:00Z</updated>      <!-- or omitted -->
    <summary>...</summary>                        <!-- or omitted -->
    <content>...</content>                        <!-- or omitted -->
  </entry>
</feed>
```

The builder conditionally emits each field so individual tests can test fallback
behavior by omitting specific fields.

### Test coverage matrix — 10 required cases

| # | describe / it label | Fixture shape | Assertion |
|---|---------------------|---------------|-----------|
| 1 | returns >= 1 item from Atom feed | 3 entries, all fields present | `items.length === 3` |
| 2 | each item has non-empty title, url, publishedAt, content | 3 standard entries | all fields truthy |
| 3 | AC-2: URL from `<link rel="alternate" href>` | Google News shape | `item.url === href value` |
| 4 | AC-3: URL from `<link href>` without rel | baodautu.vn shape | `item.url === href value` |
| 5 | AC-4: publishedAt from `<published>` | entry has both published + updated | `item.publishedAt === published value` |
| 6 | AC-5: publishedAt fallback to `<updated>` | entry has updated only | `item.publishedAt === updated value` |
| 7 | AC-6: content from `<summary>` | entry has summary | `item.content === summary text` |
| 8 | AC-7: content fallback to `<content>` | entry has content only | `item.content === content text` |
| 9 | URL fallback to `<id>` | no `<link>`, has `<id>` | `item.url === id text` |
| 10 | empty Atom feed returns `[]` | `<feed>` with no `<entry>` | `items.length === 0` |
| 11 | mixed document: both `<item>` and `<entry>` | 2 items + 1 entry | `items.length === 3` |

Tests 3 and 4 must explicitly assert the URL was extracted from the `href` attribute,
not from `.text()` (which would be empty for self-closing elements).

### Vietnamese content fixture data

To mirror production, entry titles reference real tickers and index names:
- "VN-Index giảm 8 điểm trước áp lực bán ròng của khối ngoại"
- "HPG hưởng lợi khi đầu tư công được giải ngân sớm trong Q2"
- "VCB công bố lợi nhuận Q1/2026 tăng 18% so với cùng kỳ"

URLs use the `https://news.google.com/articles/` prefix to mirror real Google News shape.

---

## Regression Safety for Existing RSS 2.0 Tests

The union selector `$("item, entry")` introduces no risk to `021-rss-cafef.test.ts`,
`022-rss-vnexpress.test.ts`, or `023-rss-reuters.test.ts` because:

1. All three existing test files feed RSS 2.0 XML (`<item>` nodes only) to
   `parseRssFeed()`. The `isAtom` branch evaluates to `false` for every element;
   the `else` path executes the original extraction code verbatim.

2. The union selector does not change traversal order for a document that contains
   only `<item>` nodes — Cheerio returns them in document order as before.

3. No existing test calls `$("item")` directly; they all call `parseRssFeed()` through
   the public function. The selector change is internal.

4. The `content:encoded` escape (`"content\\:encoded"`) is preserved in the RSS 2.0
   `else` branch — the backslash-escape is required for CSS selector parsing in xmlMode.

5. The `decodeHtmlEntities()` calls at the `items.push()` site are not modified. Both
   the numeric entity test and the orphan `#NNN;` entity test in task 021 continue to
   pass because the decode step is shared.

Developer must run `bun test` after the change and confirm all pre-existing tests pass
before opening PR.

---

## Task Breakdown (for PM)

| ID   | Scope | Description | Depends On |
|------|-------|-------------|------------|
| 1188 | infrastructure | Modify `rss.ts`: union selector + Atom branch | — |
| 1188 | infrastructure | New test file `1188-rss-atom.test.ts` (11 cases) | rss.ts change |
| 1185 | — | Close as resolved by 1188 (Atom fix covers baodautu.vn) | 1188 merged |

Single PR covers both the implementation and tests. 1185 closes at merge.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cheerio `tagName` not available on all node types | Low | Medium | Cast with optional chain + `el.type` fallback; confirmed by reading cheerio Element typedef |
| Atom namespace prefix `atom:entry` in some feeds | Low | Medium | cheerio xmlMode strips namespace prefixes in CSS selectors by default; add explicit prefix variant test if prefix-qualified feeds are encountered |
| `link[rel='alternate'][href]` selector rejects valid entries | Low | Low | Selector is a proper CSS attribute filter; cheerio xmlMode honors attribute selectors on XML nodes |
| RSS 2.0 test regression | Very Low | High | Else branch is byte-for-byte copy of original; confirmed by code inspection |
| Performance overhead of union selector | Negligible | None | cheerio traversal is synchronous in-memory; 15-minute cycle has no latency constraint |

---

## Security Review

- SQL parameterized? N/A (no database writes in this module)
- File paths validated (no `../`)? N/A (no file I/O)
- External HTTP rate-limited? N/A (HTTP handled by callers upstream; `rss.ts` is XML-only)
- Secrets via Bun.env only? N/A (no secrets in this module)
