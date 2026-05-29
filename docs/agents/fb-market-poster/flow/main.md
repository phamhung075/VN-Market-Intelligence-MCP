# FB Market Poster — Main Flow

Daily synthesis agent. Reads the day's published market intelligence and writes ONE plain-Vietnamese Facebook-ready post.

**Tools:** `docs/agents/tools/package/fb-market-poster.md`

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input

Scheduled invocation: daily M-F at 13:07 UTC (20:07 VN), after EOD CHEF dish.

## Output

`docs/social/fb-post-YYYY-MM-DD.md` — dated Facebook draft post in plain Vietnamese.
`docs/agent-memory/notebooks/fb-market-poster.md` — cycle log (full overwrite).

---

## STEP 0 — Bootstrap

→ skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `fb-market-poster`)

Log cycle start:
```
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "status": "running"
})
```
Store returned `id` as `$logId`.

---

## STEP 1 — Read synthesized sources (L1 — primary)

Read the following files. Each read is guarded: if file missing or <50 chars → log + skip (do NOT fail cycle, this source is unavailable):

1. `docs/agent-memory/notebooks/unified-agent.md` — CHEF dishes. Extract:
   - Today's MARKET dishes (morning + EOD at minimum). Look for the `[LATEST]` entry.
   - VN-Index level and % change for the day.
   - Key sector moves with direction + delta%.
   - Notable tickers with direction + delta%.
   - Macro context summary (USD/VND, Gold, macro regime in plain terms).

2. `docs/agent-memory/notebooks/news-scout.md` — News findings. Extract:
   - Top 1-2 news items of the day with impact direction.
   - Any legal/crisis signals relevant to watchlist.

3. `docs/agent-memory/notebooks/market-watcher.md` — Anomalies. Extract:
   - Any price anomalies fired today (ticker, direction, magnitude).

**Grounding check:** At least the unified-agent notebook must yield usable data (VN-Index reading + at least 1 sector or ticker move). If not → send_telegram(bug, "[fb-market-poster] No usable CHEF data found for today — cycle aborted") → EXIT.

---

## STEP 2 — Read supplementary sources (L2 — lazy)

Load only if time allows and notebook data was sparse:

4. `docs/agent-memory/notebooks/digest-predict.md` — Weekly digest (if today is Friday or Monday).
5. Read up to 2 relevant `docs/analysis-briefs/*.md` — only tickers explicitly flagged in CHEF as key movers.

---

## STEP 3 — Compose the Facebook post

**Language rule:** Plain, everyday Vietnamese. No analyst jargon. No citations (Layer #, σ, bp). No hexagram terms. No ticker codes without context. Use common names where helpful (e.g., "cổ phiếu Vingroup" alongside VHM/VIC if needed for clarity). Write as if explaining to a friend over coffee.

**Structure:**

```
[Hook — 1 sentence]
Câu mở: nêu bức tranh tổng thể ngày hôm nay (thị trường tăng/giảm/đi ngang).

[Thị trường hôm nay — 2-4 câu]
- VN-Index: nêu điểm số và % thay đổi so với hôm qua (+/−).
- Ngành/nhóm cổ phiếu nổi bật: ai dẫn đầu tăng, ai giảm mạnh, kèm %.
- 1-2 cổ phiếu đáng chú ý nhất với giá và % thay đổi.

[Tại sao — 1-3 câu]
Giải thích ngắn gọn nguyên nhân: tin tức vĩ mô, sự kiện nổi bật, yếu tố bên ngoài.
Giữ đơn giản — không cần số liệu phức tạp.

[Nhìn về phía trước — 1-2 câu]
Điểm cần theo dõi tuần tới hoặc ngày mai. Giữ giọng điềm tĩnh, không phán đoán quá chắc.

[Disclaimer — giữ nguyên khối này]
---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
```

**Hard rules:**
- ALWAYS include direction + delta% for VN-Index and any named ticker (memory: feedback_market_data_direction). Never write a bare price without change.
- Total post length: 200-350 words (Facebook sweet spot — readable on mobile).
- No markdown formatting in the post body (no `**bold**`, no `#headers`). Plain prose + the disclaimer separator.
- The disclaimer block MUST appear verbatim at the end, inside `---` separators.

---

## STEP 4 — Pre-write validation

Before writing the file, verify:
1. VN-Index appears with both level AND % change.
2. At least one sector or ticker named with direction + delta%.
3. Disclaimer block present verbatim.
4. No jargon terms: Layer, σ, bp, hexagram, Kinh Dịch, TNB, signal #, convergence.
5. Post length between 150 and 500 words.

If checks 1-4 fail → fix inline. If check 5 fails (too long) → trim. If still failing → send_telegram(bug, "[fb-market-poster] Post validation failed: <which check>") and EXIT.

---

## STEP 5 — Write deliverable

Compute today's date in VN timezone (UTC+7):
```
DATE = today's date in YYYY-MM-DD format (VN time)
FILEPATH = docs/social/fb-post-{DATE}.md
```

Write the post to `FILEPATH`. File format:
```markdown
# Thị trường chứng khoán Việt Nam — {DATE}

_Được tạo bởi bot AI lúc {HH:MM} giờ Việt Nam_

{POST BODY — plain prose, no markdown formatting in body}

---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
```

---

## STEP 6 — Feedback sink (v1 minimal)

The disclaimer promises feedback will be recorded. The feedback sink is `docs/social/fb-feedback.md`.
This file is user-appendable. The agent does NOT write to it during the cycle (no Facebook comments to read in v1).
After writing the post, verify `docs/social/fb-feedback.md` exists. If not, create it with this header:
```markdown
# FB Market Poster — Feedback Log

User corrections and feedback on published posts. Append manually below.

Format: YYYY-MM-DD | [post file] | [correction or comment]
```

---

## STEP 7 — WORK notification

```
send_telegram(channel="work", message="[fb-market-poster] Post written: docs/social/fb-post-{DATE}.md — ready for copy-paste to Facebook Page")
```

---

## STEP 8 — Session log + notebook write

Call tool to close log:
```
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "id": $logId,
  "status": "completed",
  "summary": "FB post written: docs/social/fb-post-{DATE}.md",
  "findings": "Sources read: unified-agent={yes/no}, news-scout={yes/no}, market-watcher={yes/no}",
  "actions": ["wrote docs/social/fb-post-{DATE}.md"]
})
```

Write notebook (full overwrite) → skill: `.claude/skills/notebook-write/SKILL.md`

Notebook entry format:
```markdown
# FB Market Poster — Notebook

**Last updated:** {DATETIME} UTC

## Last cycle
- Date: {DATE}
- Post file: docs/social/fb-post-{DATE}.md
- VN-Index: {level} ({+/-delta}%)
- Sources read: unified-agent={yes/no}, news-scout={yes/no}, market-watcher={yes/no}
- Validation: passed {N}/5 checks
- Status: {published/failed}

## Lessons learned
- (append any new tool-behavior lessons here)

## Known patterns
- unified-agent notebook LATEST entry = today's EOD dish (read [This session] section)
- Post writes at 20:07 VN after EOD dish (08:37 UTC) — data is fresh
```

---

## RETURN

```
DONE: FB post written for {DATE} → docs/social/fb-post-{DATE}.md
NEXT: idle (user copy-pastes to Facebook Page manually)
PIPELINE: complete
QUALITY: full | partial
```

If any step failed gracefully (skipped source, etc.):
```
DONE: FB post written for {DATE} with partial data → docs/social/fb-post-{DATE}.md
NEXT: idle
PIPELINE: complete
QUALITY: partial — sources missing: [list]
```
