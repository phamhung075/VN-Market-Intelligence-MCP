# Three-Channel Telegram Strategy for Cowork Agents

## Channels Overview

### WORK Channel (agents → dev team)
**Purpose:** Agent activity logs, status reports, coordination
**Audience:** Development team only
**Frequency:** Every agent cycle (15 min market / 60 min off-hours)
**Env var:** `TELEGRAM_INFO_WORK_CHANNEL_ID`

Format (caveman ultra mode):
```
[Agent Name] HH:MM UTC — {N} signals analyzed
  Fired: {X} ({conviction}% min)
  Suppressed: {Y} ({reason})
  Next: HH:MM UTC
```

### BUG Channel (agents → dev team)
**Purpose:** Errors, anomalies, timeouts, missing data
**Audience:** Development team only
**Frequency:** Whenever problem detected
**Env var:** `TELEGRAM_REPORT_BUG_CHANNEL_ID`

Format:
```
[Agent Name] ⚠️ {SEVERITY}
  Issue: {Problem description}
  Impact: {What stops working}
  Status: {Retrying/Blocked}
```

### MARKET Channel (agents → users)
**Purpose:** Market analysis results, alerts, briefings, /ask answers
**Audience:** Users making trading decisions
**Frequency:** When conviction high OR daily briefing time OR /ask answered
**Env var:** `TELEGRAM_INFO_MARKET_GROUP_ID`

Format (full narrative, complete sentences):
```
{EMOJI} {CODE} — {ACTION} [{CONVICTION}% xác tín]

WHY? {2-sentence catalyst + news source}

CONFIRMS? {N}/{TOTAL} signals — full explanations per dimension

KINH DỊCH: {Hex name + meaning + timing + next hex}

NEXT? {Complete reassessment trigger + timing}

RISK: {3 complete risk statements, no truncation}

POSITION: {Action recommendation or impact}
```

---

## Agent Sending Rights

| Agent | MARKET | WORK | BUG | Notes |
|-------|--------|------|-----|-------|
| Alert Commander (05) | YES (main alerts) | YES (status) | YES (errors) | EXCLUSIVE for main alerts |
| Digest & Predict (06) | YES (briefings) | YES (status) | YES (errors) | Named exception: digest/predict role |
| QA Responder (07) | YES (/ask answers) | YES (status) | YES (errors) | Named exception: /ask answering role |
| News Scout (01) | NEVER | YES (status) | YES (errors) | Analysis incomplete at this stage |
| Financial Analyst (02) | NEVER | YES (status) | YES (errors) | Sends signals to bus only |
| Market Watcher (04) | NEVER | YES (status) | YES (errors) | Sends signals to bus only |
| Unified Agent | NEVER | YES (coordination) | via `submit_feedback` | Observe-only on BUG |

---

## Message Quality Standards

### MARKET Messages (User-Facing)
- Full conviction breakdown (all 6 dimensions with explanations)
- Complete risk disclosure (no ellipsis, no truncation)
- 5-section narrative format (Why/Confirms/Kinh/Next/Risk)
- Proper Vietnamese with full diacritics (normalized to NFC)
- No abbreviations that hide information
- Max 4000 chars — split if needed

### WORK Messages (Agent Status)
- Caveman ultra mode (compact, 3-5 lines per agent)
- Clear metrics (count of signals fired/suppressed)
- Next run time
- Reason for suppressions if any

### BUG Messages (Problem Reports)
- Severity level (⚠️ warning, 🔴 critical)
- Clear description of problem
- Impact on analysis
- Current status (retrying, blocked, investigating)

---

## Examples

### Market Alert (MARKET Channel)
```
🔴 VNM — BÁN NGAY [82% xác tín]

WHY?
VNM công bố lợi nhuận Q1 giảm 18% YoY do chi phí nguyên liệu sữa tăng mạnh.
Tin tức: Cafef.vn — "Vinamilk lợi nhuận quý 1 giảm sốc"

CONFIRMS? 5/6 tín hiệu:
• Giá: 78% — Phá vỡ hỗ trợ 80,000 VND, xu hướng giảm 3 phiên liên tiếp
• Khối lượng: 85% — Volume 2.4x trung bình, áp lực bán rõ rệt
• Tin tức: 90% — Kết quả kinh doanh kém hơn kỳ vọng thị trường 15%
• Vĩ mô: 65% — Lạm phát nguyên liệu toàn cầu vẫn cao
• Ngành: 70% — Toàn ngành thực phẩm chịu áp lực margin
• Kinh Dịch: 80% — Quẻ Bác (23) đang trong giai đoạn đỉnh điểm

KINH DỊCH:
Quẻ Bác (23) — Suy thoái, phân rã
Thời gian: 7-10 ngày đến đảo chiều
Quẻ kế: Phục (24) — khả năng phục hồi sau đáy

NEXT?
Theo dõi BCTC Q2 (31/07) và động thái mua lại cổ phiếu quỹ.
Thời gian: 14 ngày

RISK:
• Nếu nguyên liệu sữa giảm >10% trong 30 ngày, luận điểm bán có thể sai.
• Chiến dịch marketing mới có thể kích cầu ngắn hạn, che giấu margin yếu.
• Biến động tỷ giá USD/VND >1% ảnh hưởng chi phí nhập khẩu.

POSITION:
Giảm 20% tỷ trọng VNM, đặt stop-loss tại 83,000 VND.
```

### Agent Status (WORK Channel)
```
[News Scout] 14:35 UTC — 5 signals analyzed
  Fired: 2 (VNM earnings 80%, BSR margin 75%)
  Suppressed: 3 (GEX conviction 48%, REE macro 52%, PVD duplicate)
  Next: 14:50 UTC
```

### Error Report (BUG Channel)
```
[Financial Analyst] ⚠️ Network Error
  Issue: BCTC portal timeout (45s, giving up)
  Impact: Conviction delayed for VNM, VCB, BID (BCTC unavailable)
  Status: Retrying next cycle (14:50 UTC)
```
