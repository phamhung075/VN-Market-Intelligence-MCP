# TASK_1473b — GREEN: fix(diacritics): restore diacritics in changelogTools, telegramReportTools, supplyChainTools, tickerIntelligenceTools

sprint: 178
phase: GREEN
depends_on: TASK_1473a (RED merged)

## Goal

Replace all unaccented Vietnamese strings with correct diacritics. All 1473a tests pass. No logic changes — strings only.

---

## File 1: src/interface/mcp/tools/changelogTools.ts

### log_fix tool description (lines 69-70)

| Old | New |
|-----|-----|
| `"Dev Team ghi lai mot sua loi vao bang system_changelog. "` | `"Dev Team ghi lại một sửa lỗi vào bảng system_changelog. "` |
| `"Analysis Team co the dung get_recent_fixes de kiem tra truoc khi bao cao lai van de da duoc xu ly."` | `"Analysis Team có thể dùng get_recent_fixes để kiểm tra trước khi báo cáo lại vấn đề đã được xử lý."` |

### title param describe (line 75)

| Old | New |
|-----|-----|
| `"Ten ngan mo ta sua loi (bat buoc)"` | `"Tên ngắn mô tả sửa lỗi (bắt buộc)"` |

### detail param describe (line 80)

| Old | New |
|-----|-----|
| `"Mo ta chi tiet ve thay doi (tuy chon)"` | `"Mô tả chi tiết về thay đổi (tùy chọn)"` |

### fix_type param describe (line 85)

| Old | New |
|-----|-----|
| `"Loai sua loi: 'bugfix', 'hotfix', 'feature', 'docs', 'refactor' (mac dinh: bugfix)"` | `"Loại sửa lỗi: 'bugfix', 'hotfix', 'feature', 'docs', 'refactor' (mặc định: bugfix)"` |

### files param describe (line 90)

| Old | New |
|-----|-----|
| `"Danh sach cac file da thay doi (duong dan tuong doi)"` | `"Danh sách các file đã thay đổi (đường dẫn tương đối)"` |

### commit_hash param describe (line 94)

| Old | New |
|-----|-----|
| `"Git commit hash tuong ung (tuy chon)"` | `"Git commit hash tương ứng (tùy chọn)"` |

### supersedes_alert_ids param describe (lines 104-105)

| Old | New |
|-----|-----|
| `"Task 1005 — danh sach id alerts cu da bi sua loi nay vo hieu hoa. "` | `"Task 1005 — danh sách id alerts cũ đã bị sửa lỗi này vô hiệu hóa. "` |
| `"Moi alert trong danh sach se duoc danh dau 'Superseded by fix' trong resolution_notes."` | `"Mỗi alert trong danh sách sẽ được đánh dấu 'Superseded by fix' trong resolution_notes."` |

### get_recent_fixes tool description (lines 169-171)

| Old | New |
|-----|-----|
| `"Lay danh sach cac sua loi gan nhat tu Dev Team. "` | `"Lấy danh sách các sửa lỗi gần nhất từ Dev Team. "` |
| `"Analysis Team nen goi tool nay truoc khi bao cao van de de tranh bao cao trung lap. "` | `"Analysis Team nên gọi tool này trước khi báo cáo vấn đề để tránh báo cáo trùng lặp. "` |
| `"Tra ve cac sua loi moi nhat truoc (DESC)."` | `"Trả về các sửa lỗi mới nhất trước (DESC)."` |

### get_recent_fixes limit param describe (line 180)

| Old | New |
|-----|-----|
| `"So ban ghi toi da tra ve (1-50, mac dinh 10)"` | `"Số bản ghi tối đa trả về (1-50, mặc định 10)"` |

---

## File 2: src/interface/mcp/tools/telegramReportTools.ts

### read_telegram_reports tool description (lines 89-90)

| Old | New |
|-----|-----|
| `"Doc cac bao cao tu kenh Report Channel. Mac dinh tra ve cac bao cao chua xu ly (status=new). "` | `"Đọc các báo cáo từ kênh Report Channel. Mặc định trả về các báo cáo chưa xử lý (status=new). "` |

(line 90 already has correct diacritics: `"Khi không có báo cáo mới, trả về thông báo thoát vòng lặp Dev Team."` — VERIFY, no change if already correct)

### status param describe (line 96)

| Old | New |
|-----|-----|
| `"Trang thai bao cao can lay: 'new' (mac dinh), 'processed', hoac 'all'"` | `"Trạng thái báo cáo cần lấy: 'new' (mặc định), 'processed', hoặc 'all'"` |

### limit param describe (line 104)

| Old | New |
|-----|-----|
| `"So ban ghi toi da tra ve (1-50, mac dinh 20)"` | `"Số bản ghi tối đa trả về (1-50, mặc định 20)"` |

### unclaimed_only param describe (lines 110-111)

| Old | New |
|-----|-----|
| `"Chi tra ve bao cao chua duoc claim (mac dinh: true). "` | `"Chỉ trả về báo cáo chưa được claim (mặc định: true). "` |
| `"Dat false de xem tat ca bao cao bao gom ca da claimed."` | `"Đặt false để xem tất cả báo cáo bao gồm cả đã claimed."` |

### process_telegram_report tool description (lines 180-181)

| Old | New |
|-----|-----|
| `"Danh dau mot bao cao la da xu ly va tuy chon xoa tin nhan Telegram tuong ung "` | `"Đánh dấu một báo cáo là đã xử lý và tùy chọn xóa tin nhắn Telegram tương ứng "` |
| `"khoi kenh Report Channel de giu kenh sach se."` | `"khỏi kênh Report Channel để giữ kênh sạch sẽ."` |

### process_telegram_report delete_telegram_message param describe (line 193)

| Old | New |
|-----|-----|
| `"Xoa tin nhan Telegram trong kenh Report Channel sau khi xu ly (mac dinh: true)"` | `"Xóa tin nhắn Telegram trong kênh Report Channel sau khi xử lý (mặc định: true)"` |

### claim_telegram_report tool description (lines 261-263)

| Old | New |
|-----|-----|
| `"Dat quyen so huu (ownership lock) cho mot bao cao de tranh hai agent xu ly cung luc. "` | `"Đặt quyền sở hữu (ownership lock) cho một báo cáo để tránh hai agent xử lý cùng lúc. "` |
| `"Dung truoc khi goi process_telegram_report. "` | `"Dùng trước khi gọi process_telegram_report. "` |
| `"Neu da co agent khac claim roi, tra ve thong bao 'Already claimed by {claimant}'."` | `"Nếu đã có agent khác claim rồi, trả về thông báo 'Already claimed by {claimant}'."` |

### claim id param describe (line 269)

| Old | New |
|-----|-----|
| `"Primary key cua ban ghi telegram_reports can claim"` | `"Primary key của bản ghi telegram_reports cần claim"` |

### claim claimant param describe (line 274)

| Old | New |
|-----|-----|
| `"Ten dinh danh cua agent dang claim ban ghi nay (vi du: 'dev-team', 'unified-agent')"` | `"Tên định danh của agent đang claim bản ghi này (ví dụ: 'dev-team', 'unified-agent')"` |

---

## File 3: src/interface/mcp/tools/supplyChainTools.ts

### Error text (line 318)

| Old | New |
|-----|-----|
| `"Loi: Khong the lay du lieu chuoi cung ung. Vui long thu lai."` | `"Lỗi: Không thể lấy dữ liệu chuỗi cung ứng. Vui lòng thử lại."` |

---

## File 4: src/interface/mcp/tools/tickerIntelligenceTools.ts

### Error text (line 264)

| Old | New |
|-----|-----|
| `"(loi phan tich BCTC)"` | `"(lỗi phân tích BCTC)"` |

---

## Verification

```bash
bun test src/__tests__/1473-tool-diacritics-batch3.test.ts
bun tsc --noEmit
```

All tests GREEN. No TS errors. Commit as `fix(1473): GREEN — restore diacritics in batch-3 tool files`.

## Notes

- process_telegram_report error text at line 250 already has diacritics (`"xử lý"`) — do NOT touch.
- read_telegram_reports exit-signal at line 148-149 already has diacritics — do NOT touch.
- claim_telegram_report line 295 area: `"Already claimed by"` is English — correct, do NOT touch.
- Only change string literals — no logic, no imports, no type changes.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/changelogTools.ts   # 9 string literals restored: log_fix description, title/detail/fix_type/files/commit_hash/supersedes_alert_ids params, get_recent_fixes description + limit param
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/telegramReportTools.ts   # 9 string literals restored: read_telegram_reports description/status/limit/unclaimed_only, process_telegram_report description/delete param, claim_telegram_report description/id/claimant params
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/supplyChainTools.ts   # 1 error text string restored
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/tickerIntelligenceTools.ts   # 1 error text string restored

tests_written:
- src/__tests__/1473-tool-diacritics-batch3.test.ts   # 46 assertions, all GREEN (test written in 1473a RED phase)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 31 pre-existing failures unrelated to diacritics (Telegram/DB infra env-dependent tests)
