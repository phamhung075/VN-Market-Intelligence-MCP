# TASK_1308a — Sentiment: Insider Selling + Global Bearish Macro Patterns

## TLDR
Fix sentiment misclassification: add `detectInsiderSelling()` + missing bearish keywords.

## Problem
3 bug reports:
- 1272/1278: CEO Group shareholder dumping 9M shares → BULLISH (wrong). "bán ra" missing from VN_BEARISH.
- 1284: "IMF hạ dự báo GDP" + "Quỹ ngoại báo lỗ" → BULLISH (wrong). Global macro patterns missing.

## Files
- `src/domain/services/sentimentClassifier.ts` — add keywords
- `src/application/usecases/pollNews.ts` — add detectInsiderSelling()
- `src/__tests__/1308a-sentiment-patterns.test.ts` — 19 tests

---

## [Developer] Implementation Record

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/sentimentClassifier.ts`
  — added VN_BEARISH: bán ra(w2), hạ dự báo(w4), hạ dự báo tăng trưởng(w6), cảnh báo kịch bản bất lợi(w3), báo lỗ(w3), tăng phòng thủ tiền mặt(w3)
  — added EN_BEARISH: risk-off(w3), flight to safety(w3)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/pollNews.ts`
  — added detectInsiderSelling() after detectInsiderFamilyBuying() (mirrors same pattern)

tests_written:
- `src/__tests__/1308a-sentiment-patterns.test.ts` — 19 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true  # 6693 pass, 13 pre-existing failures unrelated to this task

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/sentimentClassifier.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/pollNews.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1308a-sentiment-patterns.test.ts

merge_commit: committed directly to main (294573e6)

---

## Weight-clash note
"hạ dự báo tăng trưởng" required weight 6 (not 4/5) because bullish phrases
"tăng trưởng"(w2) + "dự báo tăng"(w3) = 5 fire simultaneously on the same text.
Covered-range dedup is per-polarity (bullish/bearish tracked separately), so
bearish claim does not suppress bullish sub-phrase matches.
Pattern: when adding bearish compound that contains bullish substrings, set weight
to (sum of all overlapping bullish weights) + 1.
