# TASK 1842c — VNSignalAdapter: Vietnamese Signal Normalizer + Kinh Dich Wiring

> **Sprint:** 1842 | **Task ID:** 1842c | **Type:** SPRINT-S
> **Owner:** developer | **Created by:** pm | **Date:** 2026-05-03
> **Priority:** P0 — blocks 1842d
> **Depends on:** 1842a (DONE)
> **Can run in parallel with:** 1842b

---

## Context

The architect's design (1842a) identified two signal-layer issues that must be solved before the computation engine (1842d) can be built:

1. `kinhdich_readings` stores signals in Vietnamese (`MUA`, `BAN`, `GIU`, `THAN TRONG`, `CHO`). The existing `hexagramBacktester.ts` already has a partial normalizer but it is embedded inside the backtester. A standalone `VNSignalAdapter` class is needed as a clean domain component.

2. The Kinh Dich signal generation pipeline does not currently route its output through any normalizer before storage or consumption. The adapter must be wired at the output of the Kinh Dich signal producer so that all downstream consumers receive English-normalised signals.

Architecture reference: `docs/architecture/1842a-backtesting-engine.md` Section 4.4.

---

## Scope

### Files to Create

```
apps/mcp-server/src/
  domain/
    backtesting/
      VNSignalAdapter.ts               — adapter class wrapping normalizeSignal()
  __tests__/
    1842c-vn-signal-adapter.test.ts    — unit tests for adapter
```

### Files to Modify

```
apps/mcp-server/src/domain/backtesting/signalNormalizer.ts
  — IF 1842b has already created this file: import from it in VNSignalAdapter
  — IF 1842b is not yet merged: create signalNormalizer.ts here (same pure function)
  Note: coordinate with 1842b developer to avoid duplication. If both tasks run in
  parallel, 1842c should create signalNormalizer.ts and 1842b should import it.
  Resolve via a short sync or commit order.

apps/mcp-server/src/domain/backtesting/index.ts   (barrel, create if absent)
  — export VNSignalAdapter, normalizeSignal, TradingSignalDirection
```

Identify where Kinh Dich signals are produced and stored. Likely entry point:
- `interface/scheduler/` cron job that calls the Kinh Dich service
- OR `interface/mcp/tools/` tool handler that writes to `kinhdich_readings`

Wire `VNSignalAdapter.normalize()` at the write path so that stored signals are English-normalised going forward. This is in addition to the read-path normalization in `backtestSignalRepo.ts` (1842b) — both paths must be covered.

---

## Detailed Specifications

### 1. `VNSignalAdapter` Class

```typescript
// apps/mcp-server/src/domain/backtesting/VNSignalAdapter.ts
import { normalizeSignal, TradingSignalDirection } from "./signalNormalizer.js";

export interface RawKinhDichSignal {
  stockCode: string;
  rawDirection: string;   // e.g. "MUA (tich cuc)"
  confidence: number;
  timestamp: string;
}

export interface NormalisedSignal {
  stockCode: string;
  direction: TradingSignalDirection;  // "BUY" | "SELL" | "HOLD" | "WAIT"
  confidence: number;
  timestamp: string;
  originalRaw: string;   // preserve for debugging
}

export class VNSignalAdapter {
  /**
   * Normalise a single raw Kinh Dich signal from Vietnamese to English.
   */
  normalize(raw: RawKinhDichSignal): NormalisedSignal {
    return {
      stockCode: raw.stockCode,
      direction: normalizeSignal(raw.rawDirection),
      confidence: raw.confidence,
      timestamp: raw.timestamp,
      originalRaw: raw.rawDirection,
    };
  }

  /**
   * Batch normalise an array of raw signals.
   * Filters out signals that normalise to "WAIT" if filterWait = true (default false).
   */
  normalizeAll(
    signals: RawKinhDichSignal[],
    options?: { filterWait?: boolean }
  ): NormalisedSignal[] {
    const normalised = signals.map((s) => this.normalize(s));
    if (options?.filterWait) {
      return normalised.filter((s) => s.direction !== "WAIT");
    }
    return normalised;
  }

  /**
   * Returns true if the raw signal string maps to a tradeable direction (BUY or SELL).
   * Convenience method for filtering at the producer side.
   */
  isTradeable(rawDirection: string): boolean {
    const dir = normalizeSignal(rawDirection);
    return dir === "BUY" || dir === "SELL";
  }
}
```

### 2. Kinh Dich Write-Path Wiring

Find the code path that writes rows to `kinhdich_readings`. Use `mcp__semble__search` to locate it. Likely files: `kinhDichTools.ts`, `kinhDichService.ts`, or a scheduler job.

At the write point, apply `VNSignalAdapter.normalize()` so the stored `direction` field contains `BUY`/`SELL`/`HOLD`/`WAIT` instead of Vietnamese strings.

**Important constraint:** The Vietnamese text must NOT be deleted from storage. The `originalRaw` field confirms what was received. If the `kinhdich_readings` schema stores only one direction column, do NOT change the schema in this task. Instead, ensure the read-path normalizer in `backtestSignalRepo.ts` (1842b) handles both forms. The write-path wiring is best-effort for new rows going forward — retroactive migration of existing rows is out of scope.

If the write-path change would require a schema migration, skip it and document the decision in the commit message. The read-path normalizer in `backtestSignalRepo.ts` (1842b) already handles both old (Vietnamese) and new (English) rows.

### 3. Export Barrel

Create `apps/mcp-server/src/domain/backtesting/index.ts` if it does not exist:

```typescript
export { VNSignalAdapter } from "./VNSignalAdapter.js";
export { normalizeSignal } from "./signalNormalizer.js";
export type { TradingSignalDirection } from "./signalNormalizer.js";
export type { RawKinhDichSignal, NormalisedSignal } from "./VNSignalAdapter.js";
```

---

## Tests — `1842c-vn-signal-adapter.test.ts`

All tests are pure unit tests — no DB, no network.

### Required Test Cases

**normalize() method:**
- AC-1: `adapter.normalize({ rawDirection: "MUA (tich cuc)", ... })` returns `direction: "BUY"` and `originalRaw: "MUA (tich cuc)"`
- AC-2: `adapter.normalize({ rawDirection: "BAN (tich cuc)", ... })` returns `direction: "SELL"`
- AC-3: `adapter.normalize({ rawDirection: "GIU (tich cuc)", ... })` returns `direction: "HOLD"`
- AC-4: `adapter.normalize({ rawDirection: "THAN TRONG (tich cuc)", ... })` returns `direction: "WAIT"`
- AC-5: `adapter.normalize({ rawDirection: "CHO (tich cuc)", ... })` returns `direction: "WAIT"`
- AC-6: `adapter.normalize({ rawDirection: "BUY", ... })` returns `direction: "BUY"` (pass-through)
- AC-7: `adapter.normalize({ rawDirection: "UNKNOWN", ... })` returns `direction: "WAIT"` (fallback)
- AC-8: `originalRaw` field is always preserved exactly as input

**normalizeAll() method:**
- AC-9: `normalizeAll([3 signals with mixed directions])` returns all 3 normalised
- AC-10: `normalizeAll([signals], { filterWait: true })` excludes WAIT signals
- AC-11: `normalizeAll([])` returns `[]` (empty input)

**isTradeable() method:**
- AC-12: `isTradeable("MUA (tich cuc)")` returns `true`
- AC-13: `isTradeable("GIU (tich cuc)")` returns `false`
- AC-14: `isTradeable("THAN TRONG")` returns `false`

**Total: 14 ACs**

---

## Acceptance Criteria

- [ ] AC-1..8: `normalize()` correctly handles all Vietnamese variants, pass-through, fallback, preserves originalRaw
- [ ] AC-9..11: `normalizeAll()` handles batch processing and filterWait option
- [ ] AC-12..14: `isTradeable()` correctly identifies BUY/SELL as tradeable
- [ ] AC-15: `VNSignalAdapter` and `normalizeSignal` exported from `domain/backtesting/index.ts`
- [ ] AC-16: Kinh Dich write-path wired (or decision to skip documented with reason in commit)
- [ ] AC-17: `bun test` passes with 14/14 new tests + total suite unchanged fail count
- [ ] AC-18: `tsc --noEmit` passes clean

---

## Constraints

- `VNSignalAdapter` is a domain class — zero imports from `infrastructure/`
- Pure function `normalizeSignal` must be the single source of truth (no duplicate normalization logic)
- Do not modify `kinhdich_readings` schema in this task
- If 1842b is running in parallel, coordinate on `signalNormalizer.ts` ownership — one task creates it, the other imports it

---

## Dev Notes

- `hexagramBacktester.ts` already has partial normalization logic. Check it first with `mcp__semble__search` — `VNSignalAdapter` should supersede or delegate to the same logic, not duplicate it.
- If `hexagramBacktester.ts` has normalization, refactor it to import from `signalNormalizer.ts` instead of repeating the logic. This is a DRY improvement in scope for this task.

---

## Commit Message

```
task(1842c): VNSignalAdapter — VI→EN signal normalizer + Kinh Dich wiring

- VNSignalAdapter.normalize/normalizeAll/isTradeable
- signalNormalizer.ts: single source of truth for VI→EN mapping
- domain/backtesting/index.ts barrel export
- hexagramBacktester.ts: refactor to import from signalNormalizer (if duplicate found)
- 14 tests pass
```

---

## Return Format

```
DONE: [files created, test count]
NEXT: qa | review 1842c
HANDOFF: docs/handoffs/TASK_1842c.md
PIPELINE: continue
PIPELINE_STATE_WRITE: written — status=in_progress, nextAgent=qa, activeTaskId=1842c
```
