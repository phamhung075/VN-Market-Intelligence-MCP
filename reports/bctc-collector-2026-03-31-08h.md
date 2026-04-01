# BÁO CÁO BCTC COLLECTOR — 31/03/2026 08:00 (Vietnam)

## 1. Watchlist hiện tại (4 mã)

| Mã | Sàn | Ngành | Giá gần nhất |
|----|------|-------|-------------|
| VCB | HOSE | Banking | 88.000 VND (+1.15%) |
| VNM | HOSE | Retail | N/A |
| FPT | HOSE | Tech | N/A |
| VEA | HOSE | Aviation | N/A |

## 2. PDF đã tải về từ SSC (2 file)

| Ngày tải | Kích thước | Tên file | Mã liên quan |
|----------|-----------|----------|-------------|
| 2026-03-29 | 16.8 MB | 000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf | Không rõ mã |
| 2026-03-29 | 4.0 MB | BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf | **VNM** |

## 3. Tình trạng dữ liệu BCTC trong database

| Mã | Có dữ liệu? | Ghi chú |
|----|-------------|---------|
| VCB | ❌ KHÔNG | Không có dữ liệu tài chính nào trong DB |
| VNM | ❌ KHÔNG | PDF đã tải (BCTC năm 2025) nhưng **chưa được parse** vào DB |
| FPT | ❌ KHÔNG | Không có dữ liệu tài chính nào trong DB |
| VEA | ❌ KHÔNG | Không có dữ liệu tài chính nào trong DB |

## 4. Phân tích thiếu BCTC Q4/2025

Thời điểm 31/03/2026, các BCTC Q4/2025 (và báo cáo năm 2025) lẽ ra đã phải có — thời hạn nộp BCTC năm thường là 90 ngày sau kết thúc năm tài chính (tức trước 31/03/2026).

| Mã | Kỳ vọng | Thực tế | Trạng thái |
|----|---------|---------|-----------|
| VCB | BCTC Q4/2025 hoặc Năm 2025 | Không có gì | ⚠️ **CẦN ĐIỀU TRA** — PDF fetch thất bại (empty text) |
| VNM | BCTC Năm 2025 | PDF đã tải nhưng chưa parse | ⚠️ **CẦN XỬ LÝ** — cần parse PDF vào DB |
| FPT | BCTC Q4/2025 hoặc Năm 2025 | Không có gì | ⚠️ **CẦN ĐIỀU TRA** — chưa có PDF |
| VEA | BCTC Q4/2025 hoặc Năm 2025 | Không có gì | ⚠️ **CẦN ĐIỀU TRA** — chưa có PDF |

## 5. Sức khỏe hệ thống — ⚠️ NHIỀU VẤN ĐỀ

### Vấn đề nghiêm trọng:
- **Intelligence cycle bị treo**: Một chu kỳ chạy lâu hơn 12 phút và gây kẹt — các chu kỳ sau (04:45, 05:00, 05:15, 05:30, 05:45, 06:00) đều bị skip vì "previous cycle still running".
- **Tất cả nguồn RSS timeout**: CafeF, Reuters, VnEconomy, VnExpress đều lỗi kết nối.
- **VnDirect API / HOSE API down**: Không lấy được giá, scan thị trường thất bại.
- **SSC portal timeout**: Không thể kết nối SSC để kiểm tra BCTC mới.
- **LanceDB không khả dụng**: RAG retrieval và analysis insert đều lỗi.

### Vấn đề phụ:
- Telegram chưa cấu hình: `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` chưa được set.
- PDF parse lỗi: "Invalid PDF structure" — có thể file PDF bị hỏng.
- VCB PDF extraction trả về empty text (có thể là PDF dạng scan/image).

## 6. Khuyến nghị hành động

1. **KHẨN CẤP — Khởi động lại server**: Intelligence cycle bị treo gây kẹt toàn bộ pipeline. Cần restart để giải phóng.
2. **VNM BCTC Năm 2025**: File PDF đã có (`BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`) nhưng chưa được parse. Cần chạy `read_bctc_pdf` để import vào DB.
3. **Cấu hình Telegram**: Set `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` trong `.env` để nhận thông báo.
4. **Điều tra VCB PDF**: PDF extraction trả về empty text — có thể VCB công bố BCTC dạng ảnh scan. Cần kiểm tra thủ công.
5. **FPT & VEA**: Chưa có PDF nào. Cần kiểm tra trên SSC portal thủ công xem BCTC Q4/2025 đã được nộp chưa.
6. **File PDF 16.8MB không rõ mã**: File `000000015802468_Bao_cao_tai_chinh_Rieng_nam_2025.pdf` không xác định được mã cổ phiếu. Cần kiểm tra nội dung.

---
*Báo cáo tự động bởi BCTC Collector — 31/03/2026 08:00 UTC+7*
