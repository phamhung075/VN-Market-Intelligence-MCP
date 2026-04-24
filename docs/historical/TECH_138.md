# TECH_138 — weekly-portfolio-filler fix

status: APPROVED_BY_ARCHITECT
sprint: 138
tasks: 1389 (TDD RED), 1390 (GREEN fix)

## Problem

`weeklyPortfolioReportJob.ts` has two message-quality violations:

1. **Silent-skip missing**: when `positionRows.length === 0`, `runWeeklyPortfolioReport` still calls `send(reportText)` with filler "(Chua co vi the nao trong danh muc)" → MARKET channel receives noise.
2. **Unaccented Vietnamese**: all labels in `formatWeeklyReport` use ASCII approximations — no diacritics.

## Target state

### Change 1 — Silent skip in `runWeeklyPortfolioReport`

After Step 3 (build portfolioRows), add:

```typescript
if (portfolioRows.length === 0) {
  logger.info("[weeklyPortfolioReport] no open positions — skipping send");
  return;
}
```

### Change 2 — Diacritics in `formatWeeklyReport`

| Current | Replace with |
|---------|-------------|
| `"BAO CAO DANH MUC TUAN (..."` | `"BÁO CÁO DANH MỤC TUẦN (..."` |
| `"(Chua co vi the nao trong danh muc)"` | remove (dead code after Change 1) |
| `"Ma    | Gia dau tuan | Gia cuoi tuan | Thay doi tuan"` | `"Mã    | Giá đầu tuần | Giá cuối tuần | Thay đổi tuần"` |
| `"------+--------------+---------------+--------------"` | keep as-is |
| `"Tong P&L tuan: ..."` | `"Tổng P&L tuần: ..."` |
| `"Tong P&L tich luy: ..."` | `"Tổng P&L tích lũy: ..."` |

## Test table (1389-weekly-portfolio-filler.test.ts)

| ID | Setup | Input | Assert |
|----|-------|-------|--------|
| T1 | `formatWeeklyReport` unchanged | `rows=[]` | output does NOT contain `"Chua co"` — RED (still present) |
| T2 | `runWeeklyPortfolioReport` unchanged | `positionRows=[]` | `sendFn` NOT called — RED (still called) |
| T3 | `formatWeeklyReport` unchanged | rows present | output does NOT contain `"Gia dau tuan"` — RED (still present) |
| T4 | `formatWeeklyReport` unchanged | rows present | output contains `"Giá đầu tuần"` — RED (not present) |

RED state: T1+T2+T3+T4 FAIL before fix. GREEN: all pass after.

## Files

| File | Action |
|------|--------|
| `src/scheduler/weeklyPortfolioReportJob.ts` | Change 1 + Change 2 |
| `src/__tests__/1389-weekly-portfolio-filler.test.ts` | New TDD file |

## Layer

scheduler — imports from `application/usecases` and `infrastructure/` only. No domain layer changes.

## Acceptance

- `bun test src/__tests__/1389-weekly-portfolio-filler.test.ts` → 4/4 pass
- `bun test` full suite → 5026+ pass, 0 fail, 21+ skip
- `bun tsc --noEmit` → 0 errors
- `grep "Chua co\|gia dau tuan\|Tong P&L tuan" src/scheduler/weeklyPortfolioReportJob.ts` → 0 matches
