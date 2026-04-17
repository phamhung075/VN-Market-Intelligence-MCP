# TECH-110: fix(news-pipeline) — topStories always empty in evening report

status: APPROVED_BY_ARCHITECT
req_ref: REQ-110

---

## Brownfield Impact

- Files modified:
  - `src/domain/services/vnRelevanceFilter.ts`
  - `src/application/usecases/pollNews.ts`
- Files created:
  - `src/__tests__/1335-news-pipeline-rag-insert.test.ts`
- Files deleted: none
- Breaking changes: no — `VN_SOURCE_IDS` is an exported `const`; extending it is additive. No
  existing call site passes VPS source keys to `isVnRelevant` expecting a `false` return.

---

## Architecture Decision

RC-A is the dominant failure: six VPS-only source identifiers are not in `VN_SOURCE_IDS`, so every
item arriving from those sources falls into the keyword-scan path. Because VPS-pushed RSS summaries
typically have empty `content` fields and short titles without explicit geo/exchange keywords, the
scan returns `false` and items are silently dropped before `tryInsertEntry` is ever reached. The
fix is a one-line array extension in the domain layer — no new abstraction is needed. RC-B
(`tryInsertEntry` createdAt guard) is added as a defensive belt-and-suspenders guard; the risk is
low-probability but the fix cost is near zero. RC-C (timezone comparison) is confirmed safe as-is
by code inspection: both sides use the same ISO 8601 UTC format and SQLite lexicographic TEXT
comparison is correct for that format — no code change required for RC-C.

---

## DDD Layer Plan

| Component                     | Layer       | File                                                              | New/Modify |
| ----------------------------- | ----------- | ----------------------------------------------------------------- | ---------- |
| VN_SOURCE_IDS constant        | domain      | `src/domain/services/vnRelevanceFilter.ts`                        | MODIFY     |
| createdAt guard in tryInsert  | application | `src/application/usecases/pollNews.ts`                            | MODIFY     |
| TDD test suite (4 cases)      | test        | `src/__tests__/1335-news-pipeline-rag-insert.test.ts`             | NEW        |

---

## Interface Contracts

No new exported interfaces. The `VN_SOURCE_IDS` constant remains
`ReadonlyArray<string>` — the type contract is unchanged.

---

## Exact Code Changes

### FR-1 — `src/domain/services/vnRelevanceFilter.ts`

**Location:** lines 27–31 (the `VN_SOURCE_IDS` declaration).

Replace:

```typescript
export const VN_SOURCE_IDS: ReadonlyArray<string> = [
  "cafef",
  "vnexpress",
  "vneconomy",
];
```

With:

```typescript
export const VN_SOURCE_IDS: ReadonlyArray<string> = [
  // Pre-existing local fetchers
  "cafef",
  "vnexpress",
  "vneconomy",
  // VPS-push-only sources (Sprint 103) — exclusively Vietnamese financial content;
  // never require keyword scan to confirm VN relevance.
  "vietstock",
  "vietnambiz",
  "vnbusiness",
  "tuoitre",
  "nhandan",
  "nld",
  // Generic VPS fallback: push handler sets source to "vps" when source field is
  // missing from the pushed item. Treat as VN-relevant (VPS only serves VN sources).
  "vps",
];
```

**File comment block** (lines 7–11) must be updated to reflect the expanded whitelist:

Replace:
```
 * Vietnamese sources (cafef, vnexpress, vneconomy) always pass through —
 * they are presumed relevant by editorial selection.
```

With:
```
 * Vietnamese sources (cafef, vnexpress, vneconomy, vietstock, vietnambiz,
 * vnbusiness, tuoitre, nhandan, nld, vps) always pass through — they are
 * presumed relevant by editorial selection or VPS origin.
```

---

### FR-2 — `src/application/usecases/pollNews.ts`

**Location:** `tryInsertEntry` function, lines 317–361. Add a createdAt guard as the first
statement in the function body (before the title-dedup check).

Insert after the opening brace of `tryInsertEntry` (after line 320):

```typescript
  // Guard: createdAt must be a non-empty ISO 8601 string.
  // normalizeNews() always sets this via new Date().toISOString(), but a defensive
  // check prevents silent row drops if a code path ever passes undefined.
  if (!entry.createdAt) {
    logger.warn("[tryInsertEntry] entry.createdAt is missing — substituting current UTC time", {
      entryId: entry.id,
      sourceUrl: entry.sourceUrl,
    });
    entry.createdAt = new Date().toISOString();
  }
```

The guard is placed **before** the `isTitleDuplicate` check so the timestamp is valid for both the
dedup window computation and the INSERT binding. The `entry` parameter type is
`ReturnType<typeof normalizeNews>` which has `createdAt: string` (not optional), so TypeScript
will not flag a direct assignment — no cast needed.

---

## Task Breakdown (for PM)

Dependency order (both tasks are in TASKS.md Sprint 110):

| Task | Title | Depends on | Layer |
| ---- | ----- | ---------- | ----- |
| 1336 | Write failing TDD tests (TC-1 through TC-4) | none | test |
| 1335 | Apply FR-1 + FR-2 fixes; confirm all 4 TC pass | 1336 | domain + application |

---

## TDD Test Specification — Task 1336

**File:** `src/__tests__/1335-news-pipeline-rag-insert.test.ts`

**Line 1 (mandatory, before all imports):**
```typescript
process.env["DB_PATH"] = ":memory:";
```

**Schema setup helper** must replicate the full `rag_analyses` DDL from
`src/__tests__/1322-evening-summary-news-count.test.ts` lines 78–99 (the same columns, including
`source_url TEXT` for the UNIQUE partial index). Also needs `watchlist` and `market_prices` tables
to avoid FK errors from `assembleEveningSummary`.

**Mock RssItem factory:**
```typescript
function makeVpsItem(overrides: Partial<RssItem> = {}): RssItem {
  return {
    title:       overrides.title       ?? "VNDirect tăng mạnh phiên chiều",
    content:     overrides.content     ?? "",           // empty — typical VPS RSS summary
    url:         overrides.url         ?? `https://vietstock.vn/${Date.now()}`,
    publishedAt: overrides.publishedAt ?? new Date().toISOString(),
    source:      overrides.source      ?? "vietstock",
    ...overrides,
  };
}
```

**The four test cases:**

### TC-1 — VPS items land in rag_analyses

```
describe("TC-1: pollNews with vietstock items inserts rows into rag_analyses")

Setup:
  - db = new Database(":memory:") with full DDL
  - 3 distinct RssItems, source: "vietstock", distinct URLs

Call:
  await pollNews({
    db,
    fetchers: {
      vietstock:        async () => [item1, item2, item3],
      reuters:          async () => [],
      tradingeconomics: async () => [],
    },
    watchlist: [],
  });

Assert:
  const count = (db.prepare("SELECT COUNT(*) as n FROM rag_analyses").get() as { n: number }).n;
  expect(count).toBe(3);

  // All rows have created_at >= midnightVietnamAsUtc()
  const midnight = midnightVietnamAsUtc();   // same helper as 1322 test
  const recent = (db.prepare(
    "SELECT COUNT(*) as n FROM rag_analyses WHERE created_at >= ?"
  ).get(midnight) as { n: number }).n;
  expect(recent).toBe(3);
```

**Why this FAILS before fix:** `isVnRelevant({ source: "vietstock", title: "VNDirect tăng mạnh phiên chiều", content: "" })` returns `false` (source not in old `VN_SOURCE_IDS`, empty content fails keyword scan) — `tryInsertEntry` is never called — `rag_analyses` stays empty.

---

### TC-2 — assembleEveningSummary sees the inserted rows

```
describe("TC-2: assembleEveningSummary returns topStories and newsCount = 3 after pollNews")

Setup: same db with TC-1 rows already inserted (run TC-1 setup + pollNews first)

Call:
  const summary = await assembleEveningSummary({ db, reportsDir: ":memory-skip:" });
  // Note: reportsDir must be a writable temp path or the function must be called
  // with a temp dir created via mkdtempSync — follow 1322 test pattern.

Assert:
  expect(summary.newsCount).toBe(3);
  expect(summary.topStories.length).toBe(3);
```

**Why this FAILS before fix:** no rows in `rag_analyses` (TC-1 fails first), so `newsCount === 0` and `topStories === []`.

---

### TC-3 — URL dedup: same URL pushed twice → 1 row only

```
describe("TC-3: pushing the same URL twice inserts exactly 1 row (INSERT OR IGNORE)")

Setup:
  - db = new Database(":memory:") with full DDL
  - duplicateItem = makeVpsItem({ url: "https://vietstock.vn/dup-article" })

Call:
  await pollNews({ db, fetchers: { vietstock: async () => [duplicateItem] }, watchlist: [] });
  await pollNews({ db, fetchers: { vietstock: async () => [duplicateItem] }, watchlist: [] });

Assert:
  const count = (db.prepare("SELECT COUNT(*) as n FROM rag_analyses WHERE source_url = ?")
    .get("https://vietstock.vn/dup-article") as { n: number }).n;
  expect(count).toBe(1);
```

**Why this FAILS before fix:** same as TC-1 — the item never passes the relevance filter, so
`rag_analyses` stays empty and count is 0 (not 1).

---

### TC-4 — Zero-news baseline

```
describe("TC-4: assembleEveningSummary returns newsCount = 0 when rag_analyses is empty")

Setup:
  - db = new Database(":memory:") with full DDL — no rows inserted

Call:
  const summary = await assembleEveningSummary({ db, reportsDir: tempDir });

Assert:
  expect(summary.newsCount).toBe(0);
  expect(summary.topStories).toEqual([]);
```

**Why this PASSES even before fix (baseline sanity):** `assembleEveningSummary` correctly returns
empty arrays when no rows exist. This test establishes the zero-baseline and confirms the query
itself works — it must stay green before and after the fix.

> Note: TC-4 is expected to PASS on current code. The TDD contract in REQ-110 FR-3 states "all 4
> tests FAIL before fix" but TC-4 is a sanity baseline — it proves the query returns zero
> correctly. Developer must verify TC-4 passes both before and after applying the fix (no
> regression). The three tests that FAIL before fix are TC-1, TC-2, TC-3.

---

## Source URL UNIQUE index note

`tryInsertEntry` uses `INSERT OR IGNORE` on `source_url`. The schema DDL in the test file must
include the partial unique index to make TC-3 deterministic:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS rag_analyses_source_url_uq
  ON rag_analyses (source_url)
  WHERE source_url IS NOT NULL;
```

Reference: check existing DDL in `src/infrastructure/db/schema.ts` for the exact index name
before declaring it in the test setup to avoid name collision.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| `"vps"` whitelist causes non-VN items from misconfigured sources to enter cascade | Low | Low | VPS scripts exclusively serve VN sources; push handler already validates payload shape |
| title-dedup false-negative rate rises slightly (more items pass relevance, more titles compared) | Low | Low | isTitleDuplicate has 24h window + 50-char fingerprint; throughput impact negligible |
| createdAt guard mutates entry in-place — unexpected for a pure function caller | Low | Low | `tryInsertEntry` is a private function in `pollNews.ts`; mutation is local to that scope |
| TC-4 misclassified as "must fail" when it should pass | Medium | Medium | Test comment in file explicitly states TC-4 is a baseline that passes before and after fix |

---

## Security Review

- SQL parameterized? Yes — `tryInsertEntry` binds all values via `stmt.run(...)`. No change to
  binding pattern.
- File paths validated (no `../`)? Yes — no new file path handling introduced.
- External HTTP rate-limited? N/A — no new external HTTP calls.
- Secrets via Bun.env only? Yes — no new env vars.
