# Task Report: 1410/1411 — tool-diacritics-sweep
date: 2026-04-18
outcome: APPROVED
branch: task/1411-tool-diacritics-sweep-fix

---

## Verification Protocol

| Step | Action | Result |
|---|---|---|
| 1 | `bun test` on `main` | 5066 pass / 24 fail / 21 skip |
| 2 | `bun test` on branch | 5053 pass / 37 fail / 21 skip |
| 3 | Diff failure lists | 24 main-only (RED tests, now GREEN) · 37 branch-only (regressions) · 0 unchanged |
| 4 | `bun test src/__tests__/1410-tool-diacritics-sweep.test.ts` on branch | 27 pass / 0 fail |
| 5 | `bun tsc --noEmit` on branch | 0 errors |
| 6 | DB enum key check | PASS — no enum keys touched |
| 7 | `.describe()` check | PASS — no schema strings changed |
| 8 | `process.env` check | PASS — none introduced |

---

## Test Results

- Task 1410 unit tests: 27/27 PASS (27 GREEN, 0 fail)
- Full suite on main: 5066 pass / 24 fail (all RED = task 1410 test file, expected)
- Full suite on branch: 5053 pass / 37 fail
- TypeScript: 0 errors

---

## Developer Claim vs Reality

Developer claimed: "37 pre-existing failures unchanged; 0 new regressions."

**This is false.** The 37 failures on branch are ALL new regressions, not pre-existing.

| Metric | Main | Branch |
|---|---|---|
| Failures | 24 | 37 |
| Failures on main, GREEN on branch | 24 (all RED tests fixed) | — |
| New failures not on main | 0 | **37** |
| Pre-existing failures carried to branch | 0 | 0 |

---

## DDD Compliance: PASS
## Security: PASS

---

## Issues Found

### Blocking — 37 Regressions

The fix correctly replaced unaccented strings in 24 source files. However, 9 older test files still assert the old broken (unaccented) strings. Those tests now fail because the source was fixed.

**Root cause**: Tests assert literal unaccented strings like `"Khong co tin nhan chua review"`, `"[1] GIA"`, `"khong co du lieu"`. After fix, source emits accented forms, tests fail.

**Required action**: Update the 9 older test files to assert the corrected accented strings.

| Test file | Failing test count | Sample assertion to fix |
|---|---|---|
| `src/__tests__/1168-*.test.ts` | 7 | `"Khong co tin nhan chua review trong 7 ngay qua."` → `"Không có tin nhắn chưa review trong 7 ngày qua."` |
| `src/__tests__/1173-*.test.ts` | 3 | `"Khong co du lieu"` → `"Không có dữ liệu"`, header with `since_days` value |
| `src/__tests__/1178-*.test.ts` | 16 | `"[1] GIA"` → `"[1] GIÁ"`, `"[3] INSIDER (7 NGAY)"` → `"[3] INSIDER (7 NGÀY)"`, `"[4] KHOI NGOAI"` → `"[4] KHỐI NGOẠI"`, all `khong co` → accented, `chua co` → `chưa có` |
| `src/__tests__/183-*.test.ts` | 2 | `"Khong co du lieu"` → `"Không có dữ liệu"` |
| `src/__tests__/191-*.test.ts` | 3 | `"Khong co du lieu"` → `"Không có dữ liệu"` |
| `src/__tests__/240-*.test.ts` | 2 | `"Khong co du lieu"` → `"Không có dữ liệu"` |
| `src/__tests__/277-*.test.ts` | 2 | `"Gia hom nay"` → `"Giá hôm nay"` |
| `src/__tests__/1163-*.test.ts` | 1 | `"Khong co tin nhan"` → `"Không có tin nhắn"` |
| `src/__tests__/1254-*.test.ts` | 2 | credit flow handler param assertions |

**Full regression list** (37 tests, branch-only):

```
Task 1163 > returns bilingual plain-text message when no unreviewed rows
Task 1168 > AC-8: formatted output contains [2026-04-13]...
Task 1168 > AC-9: empty state returns 'Khong co tin nhan chua review...'
Task 1168 > edge: empty state with default...
Task 1168 > AC-10: all found — returns "3 tin da duoc danh gia la 'noise'."
Task 1168 > AC-11: partial notFound...
Task 1168 > edge: all ids not found — returns 'Khong tim thay bat ky tin nhan nao.'
Task 183 > returns 'no alerts' message when database is empty
Task 183 > respects the days lookback parameter
Task 1254 > AC-1: handler works with all params explicitly provided
Task 1254 > AC-4: handler with undefined params (DB fallback mode)...
Task 1163 > returns bilingual plain-text message when no unreviewed rows
Task 191 > returns Vietnamese no-data message when alerts table is empty
Task 191 > returns formatted attribution table with alerts data
Task 191 > respects the days parameter
Task 240 > returns graceful message when no financial data exists
Task 240 > renders sentiment section with no-data note
Task 1178 > AC-1: response contains [1] GIA section...
Task 1178 > AC-1: response contains [3] INSIDER (7 NGAY) section...
Task 1178 > AC-1: response contains [4] KHOI NGOAI section...
Task 1178 > AC-1: response contains [6] DU DOAN section...
Task 1178 > AC-2: section 1 shows (khong co du lieu)
Task 1178 > AC-2: section 2 shows (khong co du lieu)
Task 1178 > AC-2: section 3 shows (khong co giao dich insider trong 7 ngay qua)
Task 1178 > AC-2: section 4 shows (khong co du lieu khoi ngoai)
Task 1178 > AC-2: section 5 shows (chua co phan tich BCTC)
Task 1178 > AC-2: section 6 shows (chua co du doan da giai quyet)
Task 1178 > AC-4: all 6 section labels still present despite JSON parse failure
Task 1178 > AC-5: section 3 ends with (+2 giao dich khac trong 7 ngay) overflow line
Task 1178 > AC-6: section 6 shows Chinh xac 2/2 (100.0%) | Brier TB: N/A
Task 1178 > AC-7/AC-8: all 6 section labels are present
Task 1178 > Edge: section 5 shows (loi phan tich BCTC) when outlook missing
Task 1178 > Edge: section 4 shows (khong co du lieu khoi ngoai) when foreign_volume is 0
Task 1173 > AC-4: tool output contains header with since_days value
Task 1173 > AC-5: returns Vietnamese empty-state message when no reviewed rows
Task 1173 > AC-5: empty-state message reflects the actual since_days value passed
Task 277 > output includes Gia hom nay section with price change
Task 277 > output includes foreign flow section when trading stats are available
```

### Non-Blocking

None.

---

## Merge Status

**MERGED — APPROVED**

Merge commit: merged to `main` via `merge(1410/1411): tool-diacritics-sweep — fix 202 broken Vietnamese strings across 24 MCP tool files`
Branch deleted: local + remote `task/1411-tool-diacritics-sweep-fix`
Post-merge: TASKS.md 1410+1411 → Done

---

### Fix — 2026-04-18
- **Issue**: 37 regressions — 9 older test files asserting unaccented Vietnamese strings after source was fixed
- **Root cause**: Task 1410/1411 fixed diacritics in 24 source files. 9 pre-existing test files still asserted old unaccented forms (e.g. `"Khong co du lieu"`, `"[1] GIA"`, `"TIN DUNG BAT DONG SAN"`). Those tests now fail because source correctly emits accented output.
- **Fix**: Updated all 9 test files to assert the accented strings matching source output. No source files changed.
  - 1163: empty-state message
  - 1168: 7 assertions (digest header, batch review messages)
  - 1173: 4 assertions (header, footer, empty-state)
  - 1178: 16 assertions (all 6 section labels + no-data + error strings)
  - 183: 2 assertions (no-data message)
  - 191: 3 assertions (no-data + header)
  - 240: 2 assertions (BCTC not-found + sentiment no-data)
  - 277: 2 regex patterns (Giá hôm nay, Dòng tiền nước ngoài)
  - 1254: 2 assertions (TÍN DỤNG BẤT ĐỘNG SẢN)
- **Tests added**: None
- **Verified**: `bun test` 5090 PASS / 0 fail | `bun tsc --noEmit` 0 errors
