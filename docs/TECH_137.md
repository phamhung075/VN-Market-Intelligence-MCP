# TECH-137: fix(morning-briefing-filler) — omit filler sections in formatBriefingMessage when data absent

status: APPROVED_BY_ARCHITECT
req_ref: REQ-137

## Brownfield Impact

- Files modified: `src/scheduler/morningBriefingJob.ts` (formatter only, lines 36–55)
- Files created: `src/__tests__/1387-morning-briefing-filler.test.ts`
- Files deleted: none
- Breaking changes: no — formatter output contracts for non-empty data unchanged (FR-4)

## Architecture Decision

`formatBriefingMessage` is a pure synchronous string builder — no side effects, no imports beyond the `DailyBriefing` type. The fix is three surgical guard changes: remove the `else` filler branches and move the watchlist header inside the non-empty guard. Pattern is identical to Sprint 135 (`formatFranceSummaryVI` — "omit entirely when empty") and Sprint 136 (`eveningSummaryJob` — skip section when count=0). No new abstractions needed; no cross-layer changes.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `formatBriefingMessage` filler removal | interface/scheduler | `src/scheduler/morningBriefingJob.ts` | MODIFY |
| TDD unit tests T1–T4 | test | `src/__tests__/1387-morning-briefing-filler.test.ts` | NEW |

## Interface Contracts

No interface changes. `DailyBriefing` type unchanged. `formatBriefingMessage` signature unchanged:

```typescript
export function formatBriefingMessage(briefing: DailyBriefing): string
```

Output contract delta (formatter only):
- `vnIndex == null` → no "VN-Index" line emitted (was: `"📈 VN-Index: chưa có dữ liệu"`)
- `watchlistSummary.length === 0` → no header + no filler line (was: `"📊 Giá cổ phiếu:"` + `"  Chưa có dữ liệu giá"`)
- `w.price == null` on entry → entry silently skipped (was: `"N/A"` in price field)

## Exact Code Changes (3 surgical edits)

### Change 1 — VN-Index else branch (lines 40–42)

```typescript
// REMOVE:
} else {
  lines.push("📈 VN-Index: chưa có dữ liệu");
}

// REPLACE WITH: (close if, no else)
}
// section omitted when vnIndex null
```

### Change 2 — Watchlist header + guard restructure (lines 44–55)

```typescript
// BEFORE:
lines.push("");
lines.push("📊 Giá cổ phiếu:");
if (briefing.watchlistSummary.length > 0) {
  for (const w of briefing.watchlistSummary) {
    const price = w.price ? `${w.price.toLocaleString("en-US")}` : "N/A";
    const chg = w.changePct != null ? ` (${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%)` : "";
    lines.push(`  ${w.code}: ${price}${chg}`);
  }
} else {
  lines.push("  Chưa có dữ liệu giá");
}

// AFTER:
if (briefing.watchlistSummary.length > 0) {
  const pricedEntries = briefing.watchlistSummary.filter((w) => w.price != null);
  if (pricedEntries.length > 0) {
    lines.push("");
    lines.push("📊 Giá cổ phiếu:");
    for (const w of pricedEntries) {
      const price = w.price!.toLocaleString("en-US");
      const chg = w.changePct != null ? ` (${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%)` : "";
      lines.push(`  ${w.code}: ${price}${chg}`);
    }
  }
}
```

Note on edge case from REQ-137: `watchlistSummary` non-empty but ALL entries have `null` price → `pricedEntries` is empty → header suppressed too. This is correct — no point showing a section header with zero entries.

## Task Breakdown

| Task | Description | Depends on |
|------|-------------|-----------|
| 1387 | Write `src/__tests__/1387-morning-briefing-filler.test.ts` — T1–T4 RED | none |
| 1388 | Apply 3 surgical edits to `formatBriefingMessage` — T1–T4 GREEN | 1387 merged |

### Test structure for 1387

```typescript
import { formatBriefingMessage } from "../../scheduler/morningBriefingJob.js";
// minimal DailyBriefing stub — only fields used by formatter
const base: DailyBriefing = { date: "2026-04-17", vnIndex: null, watchlistSummary: [], topStories: [], alerts: [], newReports: [] };

describe("formatBriefingMessage — filler omission", () => {
  test("T1: vnIndex null → no VN-Index line", ...);
  test("T2: watchlistSummary empty → no watchlist header or filler", ...);
  test("T3: entry with null price → entry absent", ...);
  test("T4: all data present → all sections shown", ...);
});
```

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| `DailyBriefing` type has required fields not present in test stub | Low | Low | Use `as DailyBriefing` cast with minimal stub; formatter only reads `vnIndex`, `watchlistSummary`, `topStories`, `alerts`, `unresolvedAlerts`, `newReports` |
| `w.price == null` check differs from `!w.price` (0 is falsy) | Low | Low | Use `w.price != null` (not `!w.price`) — price=0 would render as "0" not skip; matches REQ-137 spec |
| `lines.push("")` blank-line emission before watchlist section skipped | Low | Low | Blank line is inside new guard — no orphan blank line when section omitted |
| Regression to topStories/newReports/other sections | None | High | Those sections already correctly gated by `if (arr.length > 0)` — not touched |

## Security Review

- SQL parameterized? N/A — pure formatter, no DB calls
- File paths validated? N/A
- External HTTP rate-limited? N/A
- Secrets via Bun.env only? N/A
