# TECH-103: fix(push-news) — wire all 9 VPS sources into pollNews

status: APPROVED_BY_ARCHITECT
req_ref: TASKS.md#1324 + #1325 (root cause confirmed, no REQ file needed)

---

## Brownfield Impact

- Files modified: 2
  - `src/application/usecases/pollNews.ts`
  - `src/interface/mcp/server.ts`
- Files created: 1
  - `src/__tests__/1324-push-news-all-sources.test.ts`
- Files deleted: none
- Breaking changes: no — `SourceFetchers` extension is additive; all new keys are optional

---

## Root Cause (confirmed)

`/api/push-news` handler (server.ts line 828–835) builds a hardcoded `fetchers` object
with exactly 3 VN keys: `cafef`, `vnexpress`, `vneconomy`.

`bySource` is correctly grouped from all pushed items (line 813–816), so items from
`vietstock`, `vietnambiz`, `vnbusiness`, `tuoitre`, `nhandan`, `nld` arrive in the map
but are silently discarded — no fetcher key consumes them.

The VPS script (`vps-scripts/fetch-vn-news.sh`) pushes 9 distinct `source` values:

| source key   | feed origin                               |
|--------------|-------------------------------------------|
| `cafef`      | cafef.vn/thi-truong-chung-khoan + doanh-nghiep |
| `vnexpress`  | vnexpress.net/rss/kinh-doanh              |
| `vneconomy`  | vneconomy.vn/chung-khoan + tai-chinh      |
| `vietstock`  | vietstock.vn (3 feeds: stocks, insider, macro) |
| `vietnambiz` | vietnambiz.vn/chung-khoan                 |
| `vnbusiness` | vnbusiness.vn/rss/chung-khoan             |
| `tuoitre`    | tuoitre.vn/rss/kinh-doanh                 |
| `nhandan`    | nhandan.vn/rss (kinhte + chungkhoan)      |
| `nld`        | nld.com.vn/rss/tai-chinh-chung-khoan      |

---

## Architecture Decision

The fix is in two layers:

1. **`SourceFetchers` interface** (domain contract) — add 6 new optional keys so the
   type system is aware of all VPS-pushed sources.
2. **`push-news` handler** (interface layer) — replace the 3-key hardcoded `fetchers`
   literal with a dynamic map over `bySource` keys, returning `bySource[key] ?? []`
   for every key present in the push payload. This means zero code changes are needed
   when future sources are added to the VPS script.

`reuters` and `tradingeconomics` stay as explicit no-op fetchers (`async () => []`)
because they are non-VN sources the handler must never accidentally proxy from
`bySource`.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `SourceFetchers` interface | application | `src/application/usecases/pollNews.ts` | MODIFY |
| `push-news` handler fetchers object | interface | `src/interface/mcp/server.ts` | MODIFY |
| TDD test: all-sources push | test | `src/__tests__/1324-push-news-all-sources.test.ts` | NEW |

---

## Interface Contracts

### Change 1 — pollNews.ts: extend `SourceFetchers` (lines 54–60)

Current:
```typescript
export interface SourceFetchers {
  cafef?: () => Promise<RssItem[]>;
  vnexpress?: () => Promise<RssItem[]>;
  reuters?: () => Promise<RssItem[]>;
  vneconomy?: () => Promise<RssItem[]>;
  tradingeconomics?: () => Promise<RssItem[]>;
}
```

Replace with:
```typescript
export interface SourceFetchers {
  // Pre-existing sources (local fetchers + RSS)
  cafef?: () => Promise<RssItem[]>;
  vnexpress?: () => Promise<RssItem[]>;
  reuters?: () => Promise<RssItem[]>;
  vneconomy?: () => Promise<RssItem[]>;
  tradingeconomics?: () => Promise<RssItem[]>;
  // VPS-push-only sources (no local fetcher — data arrives via POST /api/push-news)
  vietstock?: () => Promise<RssItem[]>;
  vietnambiz?: () => Promise<RssItem[]>;
  vnbusiness?: () => Promise<RssItem[]>;
  tuoitre?: () => Promise<RssItem[]>;
  nhandan?: () => Promise<RssItem[]>;
  nld?: () => Promise<RssItem[]>;
}
```

Note: `pollNews` resolves fetchers at lines 390–396 using `Required<SourceFetchers>`.
That `Required<>` cast must also include the 6 new keys. The resolved object currently
hardcodes 5 entries in `sourceEntries` (lines 401–407). With the dynamic approach below,
`sourceEntries` is built from `Object.entries(fetchers)` — no hardcoded list needed.

### Change 2 — pollNews.ts: dynamic source resolution (lines 390–407)

Remove the hardcoded `sourceEntries` array and the `Required<SourceFetchers>` cast.
Replace with a dynamic iteration approach:

```typescript
// All fetchers with defaults filled in for known local sources
const resolvedFetchers: SourceFetchers = {
  cafef:          options.fetchers?.cafef          ?? defaultCafefFetcher,
  vnexpress:      options.fetchers?.vnexpress      ?? defaultVnExpressFetcher,
  reuters:        options.fetchers?.reuters         ?? defaultReutersFetcher,
  vneconomy:      options.fetchers?.vneconomy      ?? defaultVnEconomyFetcher,
  tradingeconomics: options.fetchers?.tradingeconomics ?? defaultTradingEconomicsFetcher,
  // VPS-only: inject if provided, skip (undefined) otherwise
  vietstock:    options.fetchers?.vietstock,
  vietnambiz:   options.fetchers?.vietnambiz,
  vnbusiness:   options.fetchers?.vnbusiness,
  tuoitre:      options.fetchers?.tuoitre,
  nhandan:      options.fetchers?.nhandan,
  nld:          options.fetchers?.nld,
};

// Build source entries dynamically — skips undefined VPS-only fetchers
const sourceEntries: Array<{ name: string; promise: Promise<RssItem[]> }> =
  (Object.entries(resolvedFetchers) as Array<[string, (() => Promise<RssItem[]>) | undefined]>)
    .filter((entry): entry is [string, () => Promise<RssItem[]>] => entry[1] !== undefined)
    .map(([key, fn]) => ({ name: key, promise: fn() }));
```

This removes the hardcoded `Required<SourceFetchers>` cast and the manual 5-element
`sourceEntries` array entirely. VPS-only sources are skipped during scheduled
`pollNews()` calls (they have no default fetcher), and are active only when the
`push-news` handler injects them.

### Change 3 — server.ts: dynamic fetchers in push-news handler (lines 828–835)

Current (hardcoded 3 VN sources):
```typescript
fetchers: {
  cafef:          async () => bySource["cafef"]    ?? [],
  vnexpress:      async () => bySource["vnexpress"] ?? [],
  vneconomy:      async () => bySource["vneconomy"] ?? [],
  reuters:        async () => [],
  tradingeconomics: async () => [],
},
```

Replace with dynamic map over `bySource` keys:
```typescript
fetchers: {
  // Build a no-op-default fetcher for every key present in bySource.
  // This forwards all 9 (or more) VPS-pushed source keys without
  // maintaining a hardcoded list here.
  ...Object.fromEntries(
    Object.keys(bySource).map((src) => [src, async () => bySource[src] ?? []])
  ),
  // Non-VN sources: always no-op in push-news context
  reuters:          async () => [],
  tradingeconomics: async () => [],
},
```

The spread order puts `reuters`/`tradingeconomics` last so they override any
hypothetical VPS key collision (defensive — those two keys will never appear in
`bySource` in practice, but the explicit no-op guarantees it).

---

## Task Breakdown

Dependency order (task IDs already exist in TASKS.md):

| Order | Task | Description | Depends On |
|-------|------|-------------|------------|
| 1 | 1325 | TDD test (write FIRST — failing) | none |
| 2 | 1324 | Extend `SourceFetchers` + dynamic `sourceEntries` in pollNews.ts | 1325 red |
| 3 | 1324 | Dynamic fetchers spread in server.ts push-news handler | 1324 step 2 |
| 4 | 1325 | Verify test goes green | 1324 complete |

### Test specification for 1325 (`src/__tests__/1324-push-news-all-sources.test.ts`)

```
describe("push-news: all 9 VPS sources wired into pollNews")
  it("accepts vietstock items via fetcher injection")
  it("accepts vietnambiz items via fetcher injection")
  it("accepts vnbusiness items via fetcher injection")
  it("accepts tuoitre items via fetcher injection")
  it("accepts nhandan items via fetcher injection")
  it("accepts nld items via fetcher injection")
  it("inserts items from all 9 sources in a single pollNews call")
  it("does not invoke undefined fetchers for absent VPS-only sources")
```

Pattern: inject mock fetchers for all 9 sources via `options.fetchers`, verify
`result.inserted > 0` and `result.errors === 0`. Use in-memory DB (`:memory:`).
Mirror the setup pattern from `src/__tests__/102-job-news-poll.test.ts`.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `Required<SourceFetchers>` cast breaks TypeScript after removing 5-key hardcode | Low | High | Use `SourceFetchers` (partial) in `resolvedFetchers`; filter undefined before build |
| New VPS source key collides with `reuters`/`tradingeconomics` no-ops | Very Low | Medium | Explicit key override after spread (described in Change 3) |
| `bySource[src]` is undefined at spread time | Very Low | Low | `?? []` default in fetcher closure; same pattern as original code |
| Scheduled `intelligenceCycleJob` accidentally invokes new VPS-only keys | None | — | VPS-only keys have no default fetcher → `undefined` → filtered out by `.filter()` |

---

## Security Review

- SQL parameterized? Yes — no new SQL added
- File paths validated? N/A
- External HTTP rate-limited? N/A — handler receives push from VPS, no outbound call
- Secrets via Bun.env only? Yes — `VPS_PUSH_API_KEY` unchanged, no new env vars
