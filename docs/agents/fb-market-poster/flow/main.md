<!-- size-justification: 287L — single-flow cowork agent with no sub-flows; carries full 8-step cycle (bootstrap, dual-layer notebook reads, live-tool enrichment block with 4 calls, detail-floor composition spec with 7 required fields, 11-check pre-write validation, write, feedback-sink, notification, session log); splitting into sub-flows would fragment context across a simple linear cycle with no branching -->
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

## STEP 1b — Live enrichment via vn-market tools

**Purpose:** Notebooks may lag or be sparse. Before composing, call live tools to fill any missing quantitative fields. Run ALL calls; skip individual call if it errors (log + continue).

```
# Indices + snapshot
snapshot = call_tool(server="vn-market", tool="get_market_snapshot", arguments={})

# Market breadth
breadth = call_tool(server="vn-market", tool="get_market_breadth", arguments={})

# Foreign flow
foreign_flow = call_tool(server="vn-market", tool="get_foreign_flow", arguments={})

# Top movers
top_movers = call_tool(server="vn-market", tool="get_top_movers", arguments={})
```

From results, extract and hold in working memory:
- All indices present in `snapshot`: VN-Index, VN30, HNX-Index, UPCOM — each with `value`, `point_change`, `pct_change`.
- Breadth: `advancers`, `decliners`, `unchanged`, `ceiling` (tăng trần), `floor` (giảm sàn).
- Liquidity: `total_matched_value` (tỷ đồng) and `avg_value_recent` if available.
- Foreign flow: `net_value`, `most_bought` tickers (top 3), `most_sold` tickers (top 3).
- Top movers: winners and losers with ticker, price, `pct_change`, sector.

**Merge rule:** Live tool data is authoritative over notebook data for quantitative fields. If a live tool errors → fall back to notebook value. Log which source was used for each field.

---

## STEP 2 — Read supplementary sources (L2 — lazy)

Load only if time allows and notebook data was sparse:

4. `docs/agent-memory/notebooks/digest-predict.md` — Weekly digest (if today is Friday or Monday).
5. Read up to 2 relevant `docs/analysis-briefs/*.md` — only tickers explicitly flagged in CHEF as key movers.

---

## STEP 3 — Compose the Facebook post

**Language rule:** Plain, everyday Vietnamese. No analyst jargon. No citations (Layer #, σ, bp). No hexagram terms. No ticker codes without context. Use common names where helpful (e.g., "cổ phiếu Vingroup" alongside VHM/VIC if needed for clarity). Write as if explaining to a friend over coffee.

### Detail Floor (mandatory)

The composed post MUST include the following concrete information whenever the data is available (from live tools in STEP 1b or notebooks). Do NOT pad with generic vague sentences where data is missing — if a field is genuinely unavailable after tool calls, omit that field entirely.

**1. Multiple indices** — Include VN-Index, VN30, HNX-Index, and UPCOM, each with: current value (điểm), point change (±x điểm), and percentage change (±x%). Example form: "VN-Index đóng cửa ở 1.285 điểm, giảm 12 điểm (−0,9%)".

**2. Market breadth** — State advancers (tăng), decliners (giảm), unchanged (đứng giá), ceiling hits (tăng trần), floor hits (giảm sàn) as plain counts. Example: "Toàn thị trường có 320 mã tăng, 410 mã giảm, 85 mã đứng giá; 18 mã trần, 22 mã sàn."

**3. Liquidity** — Total matched trading value for the session in tỷ đồng. Compare to recent average if available. Example: "Thanh khoản đạt 18.500 tỷ đồng, cao hơn mức trung bình 7 phiên gần nhất khoảng 15%."

**4. Foreign flows (khối ngoại)** — Net buy/sell value in tỷ đồng. Name the top 2–3 most-bought and most-sold tickers with amounts. Example: "Khối ngoại bán ròng 620 tỷ đồng; mua mạnh VHM (+180 tỷ), HPG (+90 tỷ); xả FPT (−220 tỷ), VIC (−150 tỷ)."

**5. Named movers (≥5 tickers, across multiple sectors)** — Both winners and losers. Each must have: ticker (+ plain company name for clarity), price or change, and % change. Spread across at least 2–3 different sectors (banking, real estate, materials, tech, retail, energy, etc.). Do NOT cluster everything in one sector. Example: "VNM tăng 3,2% lên 79.500đ; VHM giảm 2,8%; MSN bật +4,1%."

**6. Named news / events / companies / policies** — At least 2 specific named items driving the session moves. These come from news-scout notebook signals. Name the company, policy, or event explicitly. NEVER write generic placeholders like "tin tức trong nước tích cực" or "thông tin vĩ mô". Example: "Ngân hàng Nhà nước hạ lãi suất điều hành 0,25%" or "Vingroup công bố kế hoạch thoái vốn tại VinFast."

**7. Macro figures (if in scope)** — USD/VND rate + direction, gold price + direction, oil price + direction. Connect causally to today's moves where relevant. Example: "Tỷ giá USD/VND tăng nhẹ lên 25.350, tạo áp lực lên nhóm nhập khẩu."

**Structure:**

```
[Hook — 1 sentence]
Câu mở: nêu bức tranh tổng thể ngày hôm nay (thị trường tăng/giảm/đi ngang) kèm số liệu chính.

[Chỉ số thị trường]
Nêu đủ 4 chỉ số (VN-Index, VN30, HNX-Index, UPCOM) với điểm số và % thay đổi.
Độ rộng thị trường: số mã tăng/giảm/đứng/trần/sàn.
Thanh khoản: tổng giá trị khớp lệnh tỷ đồng, so sánh với trung bình nếu có.

[Cổ phiếu nổi bật]
Ít nhất 5 cổ phiếu cụ thể từ nhiều ngành khác nhau, mỗi mã kèm % và giá.
Phân biệt rõ nhóm tăng mạnh và nhóm giảm sâu.

[Khối ngoại]
Mua ròng hay bán ròng bao nhiêu tỷ đồng; các mã được mua/bán nhiều nhất.

[Nguyên nhân — tin tức cụ thể]
Ít nhất 2 sự kiện/tin tức/chính sách có tên cụ thể giải thích động lực ngày hôm nay.
Liên kết số liệu vĩ mô (USD/VND, vàng, dầu) nếu có tác động trực tiếp.

[Nhìn về phía trước — 1-2 câu]
Điểm cần theo dõi tuần tới hoặc ngày mai. Giữ giọng điềm tĩnh, không phán đoán quá chắc.

[Disclaimer — giữ nguyên khối này]
---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
```

**Hard rules:**
- ALWAYS include direction + delta% for VN-Index and any named ticker (memory: feedback_market_data_direction). Never write a bare price without change.
- Total post length: 150–650 words. Target richness, not brevity — include all detail-floor fields available. Do NOT artificially truncate.
- No markdown formatting in the post body (no `**bold**`, no `#headers`). Plain prose + the disclaimer separator.
- The disclaimer block MUST appear verbatim at the end, inside `---` separators.
- **Anti-filler rule:** Forbidden generic phrases: "tin tức trong nước", "thông tin tích cực", "yếu tố bên ngoài", "thị trường biến động" (alone, without specifics). Every explanatory sentence must name something concrete.

---

## STEP 4 — Pre-write validation

Before writing the file, verify ALL checks. Fix inline where possible; log and accept partial if a field was genuinely unavailable from all tools.

**Structural checks (must pass — fix inline if failing):**
1. VN-Index appears with both level AND % change.
2. Disclaimer block present verbatim.
3. No jargon terms: Layer, σ, bp, hexagram, Kinh Dịch, TNB, signal #, convergence.
4. Post length between 150 and 650 words. If under 150 → composition failed (exit with bug). If over 650 → trim least-informative sentences only.

**Detail-floor checks (each field: pass if present with data, skip if genuinely no data available from any source including live tools):**
5. ≥2 indices present with numeric value + change (VN-Index minimum; VN30/HNX/UPCOM additional).
6. Market breadth: at least advancers + decliners count present.
7. Liquidity: total matched value figure present (tỷ đồng).
8. Foreign flow: net value figure present (tỷ đồng buy/sell).
9. ≥5 named tickers with direction + % change each.
10. ≥2 named news items or events/companies/policies (not generic placeholders).

**Filler check (must pass):**
11. Draft does NOT contain any of the forbidden generic phrases: "tin tức trong nước", "thông tin tích cực", "yếu tố bên ngoài", "thị trường biến động" used without a named specific following them.

**On failure:**
- Checks 1–4 fail: fix inline, re-verify.
- Checks 5–10 fail because data genuinely unavailable after live tools + notebook: log which field is missing in RETURN QUALITY field; proceed (do NOT pad).
- Check 11 fails: mandatory fix inline before writing.
- Any check cannot be resolved after one fix attempt → send_telegram(bug, "[fb-market-poster] Post validation failed: <which check>") and EXIT.

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
- Validation: passed {N}/11 checks (detail-floor fields available: {list})
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
