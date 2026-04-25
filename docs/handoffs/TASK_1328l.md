# TASK 1328l — Document alert message standard format

**Sprint:** 1328 | **Phase:** 3 | **Layer:** .claude/knowledge | **Size:** S
**Status:** Todo | **Depends on:** nothing (parallel) | **Blocks:** nothing

---

## TLDR

Create `.claude/knowledge/alert-message-format.md` codifying the 5-section narrative format. Update `cowork-05-alert-commander.md` with a pointer. Add format check to `qa-checklist.md`.

---

## Files to create / modify

1. `.claude/knowledge/alert-message-format.md` — new
2. `cowork-workspace-team-claude-desktop/05-alert-commander.md` — add pointer
3. `.claude/knowledge/qa-checklist.md` — add format check item

---

## File 1 — alert-message-format.md (new)

Create `.claude/knowledge/alert-message-format.md`:

```markdown
# Alert Message Format Standard

**Owner:** Alert Commander (05)
**Channel:** MARKET only
**Scope:** HIGH and CRITICAL severity alerts

---

## 5-Section Narrative (mandatory for all HIGH/CRITICAL alerts)

### Section 1 — Tại sao (Why)
- Macro or sector cascade trigger + source citation
- 1-2 complete sentences in Vietnamese
- Include: event type, direction, affected sector, news source
- Example: "Fed nâng lãi suất 0.25% → áp lực lên ngân hàng VN (Nguồn: Reuters 25/04)"

### Section 2 — Xác nhận (Confirms)
- Price action % change vs baseline
- Volume ratio vs 20-day average
- Sector alignment (stock-specific vs sector-wide move)
- All 6 dimension scores from ConvictionResult (from 1328e conviction block)

### Section 3 — Kinh Dịch
- Hexagram name (Vietnamese)
- Confidence score as percentage
- Expected trajectory timing
- Example: "Quẻ Càn — 85% tin cậy. Xu hướng tăng trong 3-5 ngày."

### Section 4 — Tiếp theo (Next)
- Expected price trajectory + time horizon
- Reassessment trigger condition
- Complete sentences, no abbreviations

### Section 5 — Rủi ro (Risks)
- COMPLETE list of all identified risks
- NO ellipsis ("...")
- NO "và nhiều hơn nữa" or similar truncation phrases
- Each risk is a complete sentence
- Minimum 2 risks required for HIGH; minimum 3 for CRITICAL

---

## Truncation Rules

- The `TelegramMessageFactory.formatAlertMessage()` method truncates to 100 graphemes.
  Alert bodies MUST NOT pass through this method.
- Use `formatConvictionBlock()` → `splitMessage()` → `sendTelegramMarket()` path (implemented in 1328e).
- Telegram 4096-char limit handled automatically by `splitMessage()`.

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

See `.claude/knowledge/qa-checklist.md` section "Alert Format Check" for review items.
```

---

## File 2 — Update 05-alert-commander.md

Add to the KNOWLEDGE section (after existing lazy-load list):
```markdown
- `.claude/knowledge/alert-message-format.md` — 5-section narrative standard (ALWAYS load)
```

---

## File 3 — Update qa-checklist.md

Add section "Alert Format Check" with items:
- [ ] All 5 sections present (Tại sao / Xác nhận / Kinh Dịch / Tiếp theo / Rủi ro)
- [ ] Section 5 (Rủi ro) has no "...", no "và nhiều hơn"
- [ ] Conviction block did NOT pass through `TelegramMessageFactory.formatAlertMessage()`
- [ ] Vietnamese text uses full diacritics (not ASCII approximations)

---

## Acceptance criteria

- [ ] `.claude/knowledge/alert-message-format.md` created
- [ ] `05-alert-commander.md` references the format doc
- [ ] `qa-checklist.md` has alert format check items
- [ ] `bun tsc --noEmit` clean (no TS files changed)
