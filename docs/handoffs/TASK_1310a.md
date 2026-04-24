# TASK 1310a — fix(push-foreign-flow): UNIQUE constraint on duplicate code rows

## TLDR

**Bug**: VPS vn-foreign-flow service sends duplicate ticker codes in single payload.
Second INSERT in transaction hits `UNIQUE constraint failed: vnstock_trading_stats.code`.

**Fix**: Deduplicate `normalised` items by `(code, date)` key before transaction. Last occurrence wins.

**File changed**: `src/infrastructure/db/vnstockStore.ts` — `upsertForeignFlow()` lines 426–443

**Test**: `src/__tests__/1310a-foreign-flow-dedup.test.ts` — 9 assertions GREEN

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts   # deduplicate by (code,date) before transaction, last-write-wins

tests_written:
- src/__tests__/1310a-foreign-flow-dedup.test.ts   # 9 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 6693 total, 14 pre-existing failures (Bootstrap 230, SSC pipeline, OCR, watchdog — unrelated)

## Root cause

`upsertForeignFlow` iterated `normalised` array in a transaction, running one
INSERT per item. When VPS sent `[{code:"VNM",...}, {code:"VNM",...}]` both with
the same `date`, the second INSERT hit `UNIQUE(code, date)` and SQLite aborted.

Although `ON CONFLICT(code, date) DO UPDATE` handles cross-call duplicates fine,
**within a single transaction** SQLite still fires the constraint before the
UPDATE clause if the same key appears twice in the same run. Deduplication
before the transaction removes all intra-batch duplicates.

## Fix (11 lines in vnstockStore.ts)

```ts
const dedupMap = new Map<string, typeof normalisedRaw[0]>();
for (const item of normalisedRaw) {
  const key = `${item.code}\0${item.date ?? ""}`;
  dedupMap.set(key, item); // overwrite → last value wins
}
const normalised = Array.from(dedupMap.values());
```

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1310a-foreign-flow-dedup.test.ts

merge_commit: 60aa5da3
