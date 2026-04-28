# TASK_1353a — imfIndicatorPollerJob DI overload + 8 gap tests

## Source
Architect design: `docs/handoffs/TASK_1353.md` (1353a section)

## Production change required

Add optional DI `options` parameter to `runImfIndicatorPollerJob` in:
`apps/mcp-server/src/scheduler/market-data/imfIndicatorPollerJob.ts`

```typescript
export async function runImfIndicatorPollerJob(options?: {
  fetchFn?: () => Promise<ImfIndicator[]>;
  storeFn?: (indicators: ImfIndicator[]) => Promise<void>;
  classifyFn?: (input: ImfClassificationInput) => ImfClassificationOutput;
}): Promise<ImfPollerJobResult>
```

Defaults fall back to the existing hardcoded imports — zero behaviour change in production.

## Test file to create

`apps/mcp-server/src/__tests__/1353a-imf-indicator-poller-job-gaps.test.ts`

### File header (copy verbatim)

```typescript
/**
 * TASK_1353a — imfIndicatorPollerJob gap-fill tests
 *
 * Covers paths not reached by 1296b-imf-integration.test.ts:
 *   1–2. fetchFn returns [] → early-throw path → success:false
 *   3–5. Happy path: storeFn + classifyFn wired correctly, indicator_count correct
 *   6.   fetchFn throws → outer catch absorbs, success:false
 *   7.   storeFn throws → outer catch absorbs, success:false
 *   8.   classifyFn throws → outer catch absorbs, success:false
 *
 * Prerequisite: runImfIndicatorPollerJob must accept optional DI overload
 * (fetchFn / storeFn / classifyFn). See TASK_1353.md risk flag.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { runImfIndicatorPollerJob } from "../scheduler/market-data/imfIndicatorPollerJob.js";
import type { ImfIndicator, ImfClassificationInput, ImfClassificationOutput } from "../domain/models/imfIndicators.js";
```

## Shared helpers

```typescript
function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "Global GDP Growth (%)",
    value: 3.1,
    publishedAt: "2026-01-01T00:00:00Z",
    ageInDays: 5,
    previousValue: 3.0,
    yoyChange: 0.1,
    source: "imf_api",
    confidence: 0.95,
    ...overrides,
  };
}

function stubClassify(): ImfClassificationOutput {
  return {
    sentiment: 0.4,
    confidence: 0.80,
    classification: "imf_bullish",
    reasoning: "Stub reasoning",
    sectorImpacts: [],
  };
}
```

## 8 test cases (full spec in TASK_1353.md §1353a)

| # | Path | Key assertion |
|---|------|---------------|
| 1 | fetchFn returns [] | success: false, indicator_count: 0 |
| 2 | fetchFn returns [] | error === "IMF circuit breaker open or API unreachable" |
| 3 | fetchFn returns [ind] | storeFn called with [ind] |
| 4 | fetchFn returns 3 | indicator_count === 3, success: true |
| 5 | fetchFn + classifyFn | result.sentiment deep-equals stubClassify() output |
| 6 | fetchFn throws | success: false, does not re-throw, error captured |
| 7 | storeFn throws | success: false, error === "DB write failed" |
| 8 | classifyFn throws | success: false, error === "classify explosion" |

## Acceptance criteria

- [ ] `runImfIndicatorPollerJob` accepts optional `options` param (DI overload)
- [ ] Existing behaviour unchanged when called without options
- [ ] All 8 tests pass in isolation (`bun test 1353a`)
- [ ] Full suite still passes (0 regression)
- [ ] Branch: `task/1353a-imf-poller-di-gap-tests`
