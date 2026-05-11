# TASK_1396a — Developer Handoff: Intra-Day Progression Time Label on Incremental price_drop

**Parent spec:** docs/handoffs/TASK_1396.md
**Architect decision:** Option B — additive `topTriggeredAt: string[]` on `StockAlertBlock`
**Layer:** application/usecases
**Date:** 2026-04-29

---

## Files to Touch (in order)

1. `apps/mcp-server/src/application/usecases/assembleAlertDigest.ts`
2. `apps/mcp-server/src/__tests__/1394-alert-digest-diacritics.test.ts` (minimal fix to `makeBlock`)
3. `apps/mcp-server/src/__tests__/1396-intraday-progression-label.test.ts` (new file — write first, TDD)

---

## Step 1 — Update `StockAlertBlock` interface

File: `apps/mcp-server/src/application/usecases/assembleAlertDigest.ts`
Lines 40–49 (current interface block).

Add `topTriggeredAt` after `topMessages`:

```typescript
export interface StockAlertBlock {
  /** The stock code, or "(khac)" for alerts with no parseable code. */
  code: string;
  /** Total alert count for this stock in the 24h window. */
  count: number;
  /** Up to 3 message strings from the most recent alerts. */
  topMessages: string[];
  /**
   * triggered_at value (raw SQLite or ISO string) for each entry in topMessages,
   * same index. Empty string "" when the source row has no triggered_at.
   * Used by formatAlertDigest to render (+HH:MM) ICT on incremental price_drop lines.
   */
  topTriggeredAt: string[];
  /** Number of additional alerts beyond the top 3. Zero when count <= 3. */
  overflow: number;
}
```

---

## Step 2 — Add ICT helper function

Add a new private helper directly above `formatAlertDigest` (around line 152):

```typescript
/**
 * Convert a raw triggered_at string (SQLite "YYYY-MM-DD HH:MM:SS" or ISO
 * "YYYY-MM-DDTHH:MM:SS.mmmZ") to a zero-padded HH:MM string in Vietnam
 * Standard Time (ICT, UTC+7).
 *
 * Returns null when the input is empty, null, or produces an invalid Date.
 */
function toIctHHMM(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // SQLite datetime() stores "YYYY-MM-DD HH:MM:SS" without T or Z.
  // Append "Z" only when the string has no timezone indicator.
  const normalised = /[TZ+]/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(normalised);
  if (isNaN(d.getTime())) return null;
  const ict = new Date(d.getTime() + 7 * 3_600_000);
  const hh = String(ict.getUTCHours()).padStart(2, "0");
  const mm = String(ict.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
```

---

## Step 3 — Update `formatAlertDigest` signature and prefix logic

Current signature (line 154–160):
```typescript
export function formatAlertDigest(
  date: string,
  totalCount: number,
  criticalCount: number,
  highCount: number,
  stockBlocks: StockAlertBlock[],
): string {
```

No signature change needed — `topTriggeredAt` travels inside each `StockAlertBlock`.

Update the per-message loop (current lines 178–194). Replace:

```typescript
    let priceDropSeen = false;
    for (const msg of block.topMessages) {
      let prefix = "";
      if (isCumulative(msg)) {
        // Cumulative entry — always labelled; does NOT consume the "first drop" slot
        prefix = "(lũy kế) ";
      } else if (isPriceDrop(msg)) {
        if (priceDropSeen) {
          // Second or later incremental price_drop in this block
          prefix = "(+thêm) ";
        } else {
          // First incremental price_drop — no prefix, but mark seen
          priceDropSeen = true;
        }
      }
      lines.push(`  - ${prefix}${msg}`);
    }
```

With:

```typescript
    let priceDropSeen = false;
    for (let i = 0; i < block.topMessages.length; i++) {
      const msg = block.topMessages[i]!;
      let prefix = "";
      if (isCumulative(msg)) {
        // Cumulative entry — always labelled; does NOT consume the "first drop" slot
        prefix = "(lũy kế) ";
      } else if (isPriceDrop(msg)) {
        if (priceDropSeen) {
          // Second or later incremental price_drop — show ICT time or fall back
          const raw = block.topTriggeredAt[i] ?? "";
          const ict = toIctHHMM(raw);
          prefix = ict !== null ? `(+${ict}) ` : "(+thêm) ";
        } else {
          // First incremental price_drop — no prefix, but mark seen
          priceDropSeen = true;
        }
      }
      lines.push(`  - ${prefix}${msg}`);
    }
```

---

## Step 4 — Populate `topTriggeredAt` in `assembleAlertDigest()`

Current construction block (lines 262–282):

```typescript
      const top3 = sorted.slice(0, 3);
      const overflow = sorted.length - top3.length;
      const topMessages = top3.map((a) => a.message ?? "(không có nội dung)");

      return {
        code,
        count: alerts.length,
        topMessages,
        overflow,
      };
```

Replace with:

```typescript
      const top3 = sorted.slice(0, 3);
      const overflow = sorted.length - top3.length;
      const topMessages = top3.map((a) => a.message ?? "(không có nội dung)");
      const topTriggeredAt = top3.map((a) => a.triggered_at ?? "");

      return {
        code,
        count: alerts.length,
        topMessages,
        topTriggeredAt,
        overflow,
      };
```

---

## Step 5 — Fix `makeBlock` in `1394-alert-digest-diacritics.test.ts`

File: `apps/mcp-server/src/__tests__/1394-alert-digest-diacritics.test.ts`
Lines 27–34 — `makeBlock` helper.

`topTriggeredAt` is now a required field on `StockAlertBlock`. Add it with a safe empty-array default so no test logic changes:

```typescript
function makeBlock(
  code: string,
  count: number,
  messages: string[],
  overflow = 0,
): StockAlertBlock {
  return { code, count, topMessages: messages, topTriggeredAt: [], overflow };
}
```

Only change: add `topTriggeredAt: []` to the return object literal. All 5 test cases pass through `makeBlock` — no further edits to 1394 test bodies.

---

## Step 6 — Write new test file (TDD — write before implementing)

File: `apps/mcp-server/src/__tests__/1396-intraday-progression-label.test.ts`

```typescript
/**
 * Task 1396 — Intra-Day Progression Time Label on Incremental price_drop
 *
 * AC1: Second+ incremental price_drop gets (+HH:MM) ICT prefix
 * AC2: First price_drop in block — no prefix
 * AC3: Cumulative entry keeps (lũy kế); does not consume "first drop" slot
 * AC4: triggered_at unavailable → falls back to (+thêm)
 * AC5: Non-price-drop messages unchanged
 * AC6: Zero-alert and single-drop paths unchanged
 */

import { describe, it, expect } from "bun:test";
import {
  formatAlertDigest,
  type StockAlertBlock,
} from "../application/usecases/assembleAlertDigest.js";

const DATE = "2026-04-29";

function block(
  code: string,
  messages: string[],
  triggeredAts: string[],
  count?: number,
  overflow = 0,
): StockAlertBlock {
  return {
    code,
    count: count ?? messages.length,
    topMessages: messages,
    topTriggeredAt: triggeredAts,
    overflow,
  };
}

describe("Task 1396 — intra-day progression time label", () => {
  // AC1 — second incremental drop shows (+HH:MM) ICT
  it("AC1: second price_drop renders (+HH:MM) where HH:MM is ICT", () => {
    const b = block(
      "GAS",
      [
        "Giá giảm ↓2.4% (44.954 → 43.866 VND)",
        "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      ],
      [
        "2026-04-29T06:30:00.000Z", // 13:30 ICT
        "2026-04-29T05:00:00.000Z", // 12:00 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    // First drop — no prefix
    expect(text).toContain("  - Giá giảm ↓2.4%");
    // Second drop — ICT time label (06:30 UTC = 13:30 ICT)
    expect(text).toContain("  - (+13:30) Giá giảm ↓1.2%");
    expect(text).not.toContain("(+thêm)");
  });

  // AC1 variant — SQLite format ("YYYY-MM-DD HH:MM:SS", no T or Z)
  it("AC1b: SQLite-format triggered_at parses correctly", () => {
    const b = block(
      "VCB",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29 07:00:00", // treated as UTC → 14:00 ICT
        "2026-04-29 06:00:00", // treated as UTC → 13:00 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("  - Giá giảm ↓1.0%");
    expect(text).toContain("  - (+13:00) Giá giảm ↓2.0%");
  });

  // AC2 — first drop has no prefix
  it("AC2: first price_drop in block renders with no prefix", () => {
    const b = block(
      "HPG",
      ["Giá giảm ↓1.5% (X → Y)"],
      ["2026-04-29T06:30:00.000Z"],
    );
    const text = formatAlertDigest(DATE, 1, 0, 1, [b]);

    expect(text).toContain("  - Giá giảm ↓1.5%");
    expect(text).not.toContain("(+");
    expect(text).not.toContain("(lũy kế)");
  });

  // AC3 — cumulative keeps (lũy kế) and does not consume first-drop slot
  it("AC3: cumulative entry gets (lũy kế); next incremental is still first drop — no time label", () => {
    const b = block(
      "GAS",
      [
        "Giá giảm ↓3.6% lũy kế từ mở cửa (45.500 → 43.866 VND)",
        "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "2026-04-29T05:00:00.000Z",
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("(lũy kế) Giá giảm ↓3.6%");
    // Incremental is still the first non-cumulative drop — no prefix
    expect(text).toContain("  - Giá giảm ↓1.2%");
    expect(text).not.toContain("(+thêm)");
    expect(text).not.toMatch(/\(\+\d{2}:\d{2}\)/);
  });

  // AC3b — cumulative + two incrementals: second incremental gets time label
  it("AC3b: cumulative + two incrementals — second incremental gets (+HH:MM)", () => {
    const b = block(
      "GAS",
      [
        "Giá giảm ↓3.6% lũy kế từ mở cửa (45.500 → 43.866 VND)",
        "Giá giảm ↓2.4% (44.954 → 43.866 VND)",
        "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "2026-04-29T06:00:00.000Z", // 13:00 ICT
        "2026-04-29T05:00:00.000Z", // 12:00 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 3, 0, 3, [b]);

    expect(text).toContain("(lũy kế) Giá giảm ↓3.6%");
    expect(text).toContain("  - Giá giảm ↓2.4%");
    expect(text).toContain("  - (+12:00) Giá giảm ↓1.2%");
  });

  // AC4 — triggered_at unavailable → fall back to (+thêm)
  it("AC4: empty triggered_at on second drop falls back to (+thêm)", () => {
    const b = block(
      "TCB",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "", // unknown
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("  - (+thêm) Giá giảm ↓2.0%");
    expect(text).not.toMatch(/\(\+\d{2}:\d{2}\)/);
    expect(text).not.toContain("(+NaN");
  });

  // AC4b — invalid date string → fall back to (+thêm)
  it("AC4b: invalid triggered_at string falls back to (+thêm), never crashes", () => {
    const b = block(
      "MWG",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "not-a-date",
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("  - (+thêm) Giá giảm ↓2.0%");
  });

  // AC5 — non-price-drop lines unchanged
  it("AC5: volume_spike lines receive no qualifier", () => {
    const b = block(
      "FPT",
      [
        "Giá giảm ↓1.0% (A → B)",
        "KL bất thường 3.2× TB (1.200.000 / TB 375.000)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "2026-04-29T06:00:00.000Z",
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    const vLine = text.split("\n").find((l) => l.includes("KL bất thường"));
    expect(vLine).toBeDefined();
    expect(vLine).not.toContain("(+");
    expect(vLine).not.toContain("(lũy kế)");
  });

  // AC6 — zero-alert path unchanged
  it("AC6: zero-alert digest is unchanged", () => {
    const text = formatAlertDigest(DATE, 0, 0, 0, []);
    expect(text).toContain("Không có cảnh báo");
    expect(text).not.toContain("(+");
  });

  // AC6b — single price_drop unchanged
  it("AC6b: single price_drop block unchanged", () => {
    const b = block(
      "VNM",
      ["Giá giảm ↓0.5% (X → Y)"],
      ["2026-04-29T06:30:00.000Z"],
    );
    const text = formatAlertDigest(DATE, 1, 0, 1, [b]);

    expect(text).toContain("Giá giảm ↓0.5%");
    expect(text).not.toContain("(+");
  });

  // Zero-pad check
  it("HH:MM values are zero-padded (e.g. 09:05 not 9:5)", () => {
    const b = block(
      "SSI",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29T02:10:00.000Z", // 09:10 ICT
        "2026-04-29T02:05:00.000Z", // 09:05 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("(+09:05)");
    expect(text).not.toContain("(+9:5)");
  });
});
```

---

## Execution Order

1. Write `1396-intraday-progression-label.test.ts` (Step 6) — all tests RED.
2. Apply Step 1 (interface change) — TypeScript will immediately flag `makeBlock` in 1394 test.
3. Apply Step 5 (fix `makeBlock`) — 1394 tests green again.
4. Apply Step 2 (add `toIctHHMM` helper).
5. Apply Step 3 (update `formatAlertDigest` loop).
6. Apply Step 4 (populate `topTriggeredAt` in `assembleAlertDigest`).
7. Run full test suite — all tests green.

---

## Acceptance Checklist

- [ ] AC1: `(+HH:MM)` appears on second incremental price_drop (UTC→ICT offset correct)
- [ ] AC1b: SQLite format `"YYYY-MM-DD HH:MM:SS"` parses as UTC, offsets +7h correctly
- [ ] AC2: First price_drop has no prefix
- [ ] AC3: Cumulative `(lũy kế)` prefix unchanged; does not occupy "first drop" slot
- [ ] AC4: Empty/null `triggered_at` falls back to `(+thêm)`, no crash, no `(+NaN:NaN)`
- [ ] AC5: `volume_spike`, `price_surge`, etc. lines have no prefix
- [ ] AC6: Zero-alert and single-drop paths output identical to pre-change
- [ ] 1394 diacritics tests still green (only `makeBlock` return literal changes)
- [ ] 188 alert-digest tests still green (no changes to that file)
- [ ] HH:MM is zero-padded (09:05 not 9:5)

---

## RETURN
DONE: Architect decided Option B; TASK_1396.md updated with decision rationale; TASK_1396a.md written with exact file+line changes, new test file, and execution order.
NEXT: pm | sequence 1396 into developer task
HANDOFF: docs/handoffs/TASK_1396a.md
PIPELINE: continue
