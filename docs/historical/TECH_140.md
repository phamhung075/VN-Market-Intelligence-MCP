# TECH-140: fix(alert-digest-diacritics) — Proper Vietnamese in Weekday Alert Digest

status: APPROVED_BY_ARCHITECT
req_ref: REQ-140

## Brownfield Impact

- Files modified: `src/application/usecases/assembleAlertDigest.ts`, `src/__tests__/1394-alert-digest-diacritics.test.ts` (new)
- Files created: `src/__tests__/1394-alert-digest-diacritics.test.ts`
- Files deleted: none
- Breaking changes: no — `formatAlertDigest` signature unchanged, output contract still same shape, only string literals change

## Architecture Decision

`formatAlertDigest` is a pure function (no I/O) already exported from the application layer — it accepts `(date, totalCount, criticalCount, highCount, stockBlocks)` and returns a string. Fix is purely string-literal replacement inside that function plus the `null`-message fallback on line 239. No new abstractions needed; the existing export boundary is the correct seam for TDD.

Pattern matches Tasks 1392/1393 (calibration-report diacritics) — same RED-first/GREEN-fix two-task structure, same application layer, same pure-function test approach.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `formatAlertDigest` string literals | application | `src/application/usecases/assembleAlertDigest.ts` | MODIFY |
| `null`-message fallback (line 239) | application | `src/application/usecases/assembleAlertDigest.ts` | MODIFY |
| TDD test T1–T5 | application (test) | `src/__tests__/1394-alert-digest-diacritics.test.ts` | NEW |

## Interface Contracts

`formatAlertDigest` signature — unchanged:

```typescript
export function formatAlertDigest(
  date: string,
  totalCount: number,
  criticalCount: number,
  highCount: number,
  stockBlocks: StockAlertBlock[],
): string
```

## Exact String Changes

### In `formatAlertDigest` (lines ~144–170)

| Location | Old | New |
|---|---|---|
| line 145 | `Tom tat canh bao` | `Tóm tắt cảnh báo` |
| line 145 | `Khong co canh bao trong 24 gio qua.` | `Không có cảnh báo trong 24 giờ qua.` |
| line 151 | `Tom tat canh bao (24 gio qua)` | `Tóm tắt cảnh báo (24 giờ qua)` |
| line 153 | `canh bao` (total label) | `cảnh báo` |
| line 153 | `Nghiem trong` | `Nghiêm trọng` |
| line 153 | `Quan trong` | `Quan trọng` |
| line 160 | `canh bao:` (per-stock label) | `cảnh báo:` |
| line 165 | `(va ${block.overflow} canh bao khac)` | `(và ${block.overflow} cảnh báo khác)` |

### In `assembleAlertDigest` (line 239)

| Location | Old | New |
|---|---|---|
| line 239 | `"(khong co noi dung)"` | `"(không có nội dung)"` |

**Out of scope**: `(khac)` grouping key (lines 100, 103, 104, 115, 118, 159) — used as sort/group key, not sent verbatim to MARKET. Logger lines (line 261+) — English, intentional.

## TDD Test Spec (`src/__tests__/1394-alert-digest-diacritics.test.ts`)

```typescript
import { formatAlertDigest } from "../application/usecases/assembleAlertDigest.js";

// Minimal StockAlertBlock factory
const block = (count: number, msgs: string[], overflow = 0) =>
  ({ code: "VNM", count, topMessages: msgs, overflow });

describe("1394 — formatAlertDigest diacritics", () => {
  it("T1: header contains Tóm tắt cảnh báo", () => {
    const r = formatAlertDigest("2026-04-17", 1, 0, 1, [block(1, ["msg"])]);
    expect(r).toContain("Tóm tắt cảnh báo");
    expect(r).not.toContain("Tom tat");
  });
  it("T2: zero-alert branch uses Không có cảnh báo", () => {
    const r = formatAlertDigest("2026-04-17", 0, 0, 0, []);
    expect(r).toContain("Không có cảnh báo");
    expect(r).not.toContain("Khong co");
  });
  it("T3: severity label uses Nghiêm trọng", () => {
    const r = formatAlertDigest("2026-04-17", 1, 1, 0, [block(1, ["msg"])]);
    expect(r).toContain("Nghiêm trọng");
    expect(r).not.toContain("Nghiem trong");
  });
  it("T4: per-stock label uses cảnh báo:", () => {
    const r = formatAlertDigest("2026-04-17", 1, 0, 1, [block(1, ["msg"])]);
    expect(r).toContain("cảnh báo:");
    expect(r).not.toContain("canh bao:");
  });
  it("T5: overflow line uses cảnh báo khác", () => {
    const r = formatAlertDigest("2026-04-17", 4, 0, 0, [block(4, ["a","b","c"], 1)]);
    expect(r).toContain("cảnh báo khác");
    expect(r).not.toContain("canh bao khac");
  });
});
```

No DB, no infra imports — import is `formatAlertDigest` only.

## Task Breakdown

Tasks already in TASKS.md. Dependency order:

1. **Task 1394** — Write `src/__tests__/1394-alert-digest-diacritics.test.ts` per spec above. Run `bun test` → T1–T5 FAIL (RED). `bun tsc --noEmit` = 0 errors.
2. **Task 1395** — Apply string replacements in `assembleAlertDigest.ts` (8 literals + line 239 fallback). Run `bun test` → T1–T5 PASS (GREEN), full suite 5056+ pass.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Unicode encoding issue in `.ts` file (editor/save strips diacritics) | Low | High | Verify via `grep "Tóm tắt" src/...` after save |
| Accidental change to `(khac)` grouping key | Low | Medium | AC-3 diff review: only 2 files changed |
| Test import path wrong (`.js` extension) | Low | Low | Follow existing test import pattern (use `.js` in import) |

## Security Review

- SQL parameterized? Yes (unchanged)
- File paths validated? N/A (no file I/O)
- External HTTP rate-limited? N/A (no HTTP)
- Secrets via Bun.env only? N/A (no secrets)
