# TASK_1356b — trackSessionToolUsageJob Gap Tests (8 cases)

**Sprint:** 1356
**Layer:** Test (scheduler/system)
**Size:** S (approx 2h)
**Owner:** Developer
**Status:** Ready for execution

---

## Context

`trackSessionToolUsageJob.ts` (`apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts`) exports one function:

```ts
export async function trackSessionToolUsageJob(
  cache: SessionToolCache = sessionToolCache
): Promise<ToolUsageStats>
```

It accepts an injected `SessionToolCache` instance (constructor DI via default parameter). No `mock.module()` needed — all tests inject a freshly constructed `SessionToolCache` directly.

Existing coverage (test 1299c, TC-7 and TC-8):
- TC-7: empty cache → stats written, no crash
- TC-8: 3 sessions with known tools → sessionCount=3, per-tool counts correct

Six branches remain uncovered: stat field correctness (uniqueTools, sessionCount), multi-session toolCounts aggregation, output path writing, edge cases for zero toolNames, expired session exclusion, and `generatedAt` ISO format.

---

## Production Code Analysis

```
trackSessionToolUsageJob(cache)
  ├─ snap = cache.snapshot()          // purges expired, returns Record<string, SessionCacheEntry>
  ├─ for each entry in snap.values():
  │     for each tool in entry.toolNames:
  │           toolCounts[tool] = (toolCounts[tool] ?? 0) + 1
  ├─ stats = {
  │     generatedAt: new Date().toISOString(),
  │     sessionCount: Object.keys(snap).length,
  │     uniqueTools: Object.keys(toolCounts).length,
  │     toolCounts,
  │   }
  ├─ mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  ├─ writeFileSync(OUTPUT_PATH, JSON.stringify(stats, null, 2))
  └─ return stats
```

`OUTPUT_PATH = join(process.cwd(), "docs/agent-memory/modules/tool-usage-stats.json")`

The function is side-effectful (writes to disk). Tests that care about file output must either read back `OUTPUT_PATH` after the call, or assert on the returned `stats` object (which is identical to what is written). Asserting on the return value is sufficient and avoids filesystem coupling.

---

## DI / Mock Strategy

No `mock.module()` required. All 8 tests:

1. Construct `new SessionToolCache(maxSize, ttlMs)` directly
2. Populate via `cache.set(sessionId, entry)`
3. Call `await trackSessionToolUsageJob(cache)`
4. Assert on the returned `ToolUsageStats`

For the expired-session test: construct cache with a very short TTL (e.g. 1ms), set entries, wait for natural expiry using `Bun.sleep(5)` or by setting `loadedAt` in the past and using a tiny `ttlMs`.

Imports needed:
```ts
import { SessionToolCache } from "../infrastructure/cache/sessionToolCache.js";
import { trackSessionToolUsageJob, type ToolUsageStats } from "../scheduler/system/trackSessionToolUsageJob.js";
```

No teardown needed — no mock.module() was used.

---

## Test File

**Path:** `apps/mcp-server/src/__tests__/1356b-track-session-tool-usage-job-gaps.test.ts`

No `Bun.env["DB_PATH"]` header needed (no DB access).

---

## 8 Test Cases

### TSU-1: Empty cache — sessionCount=0, uniqueTools=0, toolCounts={}

Covers the already-existing TC-7 gap: confirm all three stat fields are exactly correct (TC-7 only checked `sessionCount` and `toolCounts`).

**Setup:**
```ts
const cache = new SessionToolCache(10, 60_000);
```

**Assert:**
```ts
const stats = await trackSessionToolUsageJob(cache);
expect(stats.sessionCount).toBe(0);
expect(stats.uniqueTools).toBe(0);
expect(stats.toolCounts).toEqual({});
```

---

### TSU-2: Single session, single tool — sessionCount=1, uniqueTools=1, toolCounts correct

**Setup:**
```ts
cache.set("s1", { skills: [], toolNames: ["get_price"], loadedAt: Date.now() });
```

**Assert:**
```ts
expect(stats.sessionCount).toBe(1);
expect(stats.uniqueTools).toBe(1);
expect(stats.toolCounts).toEqual({ get_price: 1 });
```

---

### TSU-3: Multi-session aggregation — same tool across sessions counts correctly

Two sessions share `"fetch_and_analyze"`, one session has it alone.

**Setup:**
```ts
cache.set("s1", { skills: [], toolNames: ["fetch_and_analyze", "get_price"], loadedAt: Date.now() });
cache.set("s2", { skills: [], toolNames: ["fetch_and_analyze", "send_telegram"], loadedAt: Date.now() });
cache.set("s3", { skills: [], toolNames: ["get_price"], loadedAt: Date.now() });
```

**Assert:**
```ts
expect(stats.sessionCount).toBe(3);
expect(stats.toolCounts["fetch_and_analyze"]).toBe(2);
expect(stats.toolCounts["get_price"]).toBe(2);
expect(stats.toolCounts["send_telegram"]).toBe(1);
```

---

### TSU-4: uniqueTools count — reflects distinct tool names, not total appearances

Four sessions, 3 distinct tools (one tool repeated across sessions).

**Setup:**
```ts
cache.set("s1", { skills: [], toolNames: ["A", "B"], loadedAt: Date.now() });
cache.set("s2", { skills: [], toolNames: ["B", "C"], loadedAt: Date.now() });
cache.set("s3", { skills: [], toolNames: ["A", "C"], loadedAt: Date.now() });
```

**Assert:**
```ts
expect(stats.uniqueTools).toBe(3);   // A, B, C — not 6 total appearances
expect(stats.sessionCount).toBe(3);
```

---

### TSU-5: sessionCount accuracy — reflects snapshot size, not set() call count

Set 5 entries, verify sessionCount=5.

**Setup:**
```ts
for (let i = 0; i < 5; i++) {
  cache.set(`s${i}`, { skills: [], toolNames: [`tool_${i}`], loadedAt: Date.now() });
}
```

**Assert:**
```ts
expect(stats.sessionCount).toBe(5);
expect(stats.uniqueTools).toBe(5);
```

---

### TSU-6: toolCounts correctness — tool present in all sessions gets count = sessionCount

5 sessions all containing `"omnipresent_tool"` plus one unique tool each.

**Setup:**
```ts
for (let i = 0; i < 5; i++) {
  cache.set(`s${i}`, { skills: [], toolNames: ["omnipresent_tool", `unique_${i}`], loadedAt: Date.now() });
}
```

**Assert:**
```ts
expect(stats.toolCounts["omnipresent_tool"]).toBe(5);
// 6 distinct tools total: omnipresent_tool + 5 unique_N
expect(stats.uniqueTools).toBe(6);
```

---

### TSU-7: Expired session excluded — snapshot purges expired entries before counting

Use a 1ms TTL cache. Set entries, wait for expiry, then run job.

**Setup:**
```ts
const shortCache = new SessionToolCache(10, 1); // 1ms TTL
shortCache.set("s1", { skills: [], toolNames: ["stale_tool"], loadedAt: Date.now() });
await Bun.sleep(10); // let TTL expire
```

**Assert:**
```ts
const stats = await trackSessionToolUsageJob(shortCache);
expect(stats.sessionCount).toBe(0);
expect(stats.uniqueTools).toBe(0);
expect(stats.toolCounts).toEqual({});
```

Note: `SessionToolCache.snapshot()` calls `_purgeExpired()` internally before building the result, so expired entries are never counted.

---

### TSU-8: generatedAt — ISO 8601 format, recent timestamp

**Setup:**
```ts
const before = new Date().toISOString();
const stats = await trackSessionToolUsageJob(new SessionToolCache(10, 60_000));
const after = new Date().toISOString();
```

**Assert:**
```ts
// Must parse as a valid date
expect(new Date(stats.generatedAt).toISOString()).toBe(stats.generatedAt);
// Must be between before and after
expect(stats.generatedAt >= before).toBe(true);
expect(stats.generatedAt <= after).toBe(true);
```

---

## Edge Case Notes

- TSU-1 overlaps with TC-7 intentionally but adds `uniqueTools` assertion that TC-7 missed.
- TSU-3 overlaps with TC-8 intentionally but uses a cleaner 3-tool fixture and asserts `uniqueTools` explicitly.
- If the developer prefers to skip TSU-1/TSU-3 as duplicates and replace with two other cases (e.g. session with empty `toolNames` array, or overwrite same sessionId), that is acceptable provided the 8-test count is maintained and all 8 pass.

---

## Zero toolNames edge case (optional 9th, mention to developer)

A session with `toolNames: []` contributes to `sessionCount` but not to `toolCounts` or `uniqueTools`. If developer wants a 9th bonus test, this is the case. Not required by PO spec.

---

## Success Criteria

- 8 tests, all pass
- Zero production file changes
- `bun test 1356b` exits 0
- Baseline: 7745 (after 1356a) + 8 = 7753 pass, 0 fail

---

## Files to Create

| Path | Action |
|---|---|
| `apps/mcp-server/src/__tests__/1356b-track-session-tool-usage-job-gaps.test.ts` | Create |

## Files to Modify

None.

---

## Parallel Eligibility

1356a and 1356b share no production files and no test fixtures. They must be executed in parallel by developer in one message.
