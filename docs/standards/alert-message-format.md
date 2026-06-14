# Alert Message Format Standard

<!-- size-justification: 121L — atomic message format standard: 5-section narrative + examples + severity rules + emoji conventions. All read together by Alert Commander to ensure consistent market-facing output; splitting into format-rules + examples + emojis would fragment the format spec. -->

**Owner:** Alert Commander (05)
**Channel:** MARKET only
**Scope:** HIGH and CRITICAL severity alerts
**Load when:** writing or reviewing alert message output, implementing conviction blocks, auditing Telegram content.

---

## 5-Section Narrative (mandatory for all HIGH/CRITICAL alerts)

### Section 1 — Tại sao (Why)
- Macro or sector cascade trigger + source citation
- 1-2 complete sentences in Vietnamese
- Include: event type, direction, affected sector, news source
- Example: `"Fed nâng lãi suất 0.25% → áp lực lên ngân hàng VN (Nguồn: Reuters 25/04)"`

### Section 2 — Xác nhận (Confirms)
- Price action % change vs baseline
- Volume ratio vs 20-day average
- Sector alignment (stock-specific vs sector-wide move)
- All 6 dimension scores from ConvictionResult (from task 1328e conviction block)

### Section 3 — Kinh Dịch
- Hexagram name (Vietnamese)
- Confidence score as percentage
- Expected trajectory timing
- Example: `"Quẻ Càn — 85% tin cậy. Xu hướng tăng trong 3-5 ngày."`

### Section 4 — Tiếp theo (Next)
- Expected price trajectory + time horizon
- Reassessment trigger condition
- Complete sentences, no abbreviations

### Section 5 — Rủi ro (Risks)
- COMPLETE list of all identified risks
- NO ellipsis (`"..."`)
- NO `"và nhiều hơn nữa"` or similar truncation phrases
- Each risk is a complete sentence
- Minimum 2 risks for HIGH severity; minimum 3 for CRITICAL severity

---

## Conviction Block Display Rule

Conviction block (all 6 dimension scores) is displayed **only for HIGH and CRITICAL** severity alerts. LOW and MEDIUM alerts omit this block entirely (PO decision, Sprint 1328).

---

## Channel Routing Rules

| Section | MARKET | WORK | BUG |
|---------|--------|------|-----|
| Section 1 (Tại sao) | YES | NO | NO |
| Section 2 (Xác nhận) | YES | NO | NO |
| Section 3 (Kinh Dịch) | YES | NO | NO |
| Section 4 (Tiếp theo) | YES | NO | NO |
| Section 5 (Rủi ro) | YES | NO | NO |
| Alert fire notification | NO | YES (summary only) | NO |
| Bug/error report | NO | NO | YES |

Alert Commander is the ONLY agent sending to MARKET. WORK channel receives a one-line summary (ticker + severity + fired/suppressed). BUG channel receives structured error reports, never alert content.

---

## Truncation Rules

- `TelegramMessageFactory.formatAlertMessage()` truncates to **400 graphemes** (raised from 100 on 2026-04-29). Alert bodies MUST NOT pass through this method — it will destroy multi-section narrative content.
- Use `formatConvictionBlock()` → `splitMessage()` → `sendTelegramMarket()` path (implemented in task 1328e).
- Telegram 4096-character hard limit is handled automatically by `splitMessage()`, which splits on paragraph boundaries.

---

## Vietnamese Diacritic Handling

- All Vietnamese text MUST use full Unicode diacritics (NFC normalization).
- NFC normalization is applied automatically at the `sendTelegramMarket()` layer (implemented in task 1328i).
- Never use ASCII approximations (e.g., `"Tai sao"` instead of `"Tại sao"`).
- Grapheme counting via `Intl.Segmenter` ensures character limits are computed correctly for composed characters.

---

## Character Limits per Section

| Section | Recommended max | Hard limit |
|---------|-----------------|------------|
| Section 1 (Tại sao) | 300 graphemes | Telegram 4096 total |
| Section 2 (Xác nhận) | 200 graphemes | Telegram 4096 total |
| Section 3 (Kinh Dịch) | 150 graphemes | Telegram 4096 total |
| Section 4 (Tiếp theo) | 300 graphemes | Telegram 4096 total |
| Section 5 (Rủi ro) | 400 graphemes | Telegram 4096 total |
| Full message | 1,350 graphemes | 4,096 chars |

If full message exceeds 4096 chars, `splitMessage()` splits at paragraph boundaries and sends as sequential messages. Do NOT pre-truncate individual sections to compensate.

---

## Format Example

```
⚠️ VNM — CẢNH BÁO CAO [72% xác tín]

Tại sao: Fed nâng lãi suất 0.25% tác động tiêu cực đến nhập khẩu sữa. Tỷ giá USD/VND tăng 1.2% làm tăng chi phí nguyên liệu VNM (Nguồn: cafef 25/04).

Xác nhận: Giá 65% | Khối lượng 80% | Ngành 60% | Vĩ mô 58% | Cảm xúc 70% | Kinh Dịch 75%

Kinh Dịch: Quẻ Khảm — 75% tin cậy. Áp lực ngắn hạn trong 5-7 ngày.

Tiếp theo: Kỳ vọng VNM test vùng hỗ trợ 65,000 VND trong 3 ngày tới. Xem lại khi VN-Index hồi phục >1,250 điểm.

Rủi ro:
• Tỷ giá USD/VND tăng thêm >1% sẽ làm tăng chi phí nhập khẩu nguyên liệu thêm 2-3%.
• Báo cáo Q1 dự kiến 10/05 — nếu biên lợi nhuận gộp giảm <25% sẽ tăng áp lực bán.
• Volume thấp hơn trung bình 20 ngày cho thấy thiếu xác nhận từ tổ chức.
```

---

## QA Enforcement

See `docs/policies/qa-checklist.md` section "Alert Format Check" for review items.
