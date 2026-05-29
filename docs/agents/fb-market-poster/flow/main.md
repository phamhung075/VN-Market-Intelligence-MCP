<!-- size-justification: 434L — single-flow cowork agent with no sub-flows; carries full 8-step cycle (bootstrap, dual-layer notebook reads, forward-looking source reads, live-tool enrichment block with 4 calls, 3-section composition spec with full detail floor, 15-check pre-write validation with hard-fail jargon grep + extended forbidden-English mapping table + false-green proof statement, write, feedback-sink, notification, session log); splitting into sub-flows would fragment context across a simple linear cycle with no branching -->
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

## STEP 2 — Read forward-looking sources (L2 — mandatory for Dự đoán)

These feeds the **Dự đoán** section. Read ALL that exist — guard each: if file missing or <50 chars → skip and log. Do NOT skip this entire step.

4. `docs/agent-memory/notebooks/digest-predict.md` — Digest-predict signals and weekly outlook. Extract:
   - Any forward-looking signals (predicted direction, key levels, scenarios) for the next session or week.
   - Weekly outlook if present (sector rotation, regime call).

5. `docs/agent-memory/notebooks/unified-agent.md` (already read in STEP 1 — do NOT re-read; use working memory) — re-check for:
   - CHEF outlook / conviction section (look for keywords: "dự báo", "tuần tới", "kỳ vọng", "nhìn về", "outlook", "conviction").
   - Any regime call (risk-on / risk-off / carry / FII pressure language).

6. Read up to 2 relevant `docs/analysis-briefs/*.md` — only tickers explicitly flagged in CHEF as key movers. Extract any forward call or price target.

Hold all extracted forward signals in working memory under the label `$prediction_inputs`.

---

## STEP 3 — Compose the Facebook post

**Language rule:** Plain, everyday Vietnamese. No analyst jargon. No citations (Layer #, σ, bp). No hexagram terms. No ticker codes without context. Use common names where helpful (e.g., "cổ phiếu Vingroup" alongside VHM/VIC if needed for clarity). Write as if explaining to a friend over coffee.

**Forbidden English terms — use Vietnamese equivalents instead (this list is also the grep set for STEP 4 check 3):**

| Forbidden English | Required Vietnamese |
|---|---|
| bullish | tăng / tích cực |
| bearish | giảm / tiêu cực |
| neutral | trung tính |
| breadth | độ rộng thị trường |
| broad-based | trên diện rộng |
| support | hỗ trợ |
| resistance | kháng cự |
| momentum | đà |
| stasis | đi ngang |
| durable | kéo dài / bền vững |
| outflow | dòng tiền rút ra |
| inflow | dòng tiền đổ vào |
| risk-on | ưa rủi ro |
| risk-off | tránh rủi ro |
| rally | tăng mạnh / hồi phục |
| sell-off | bán tháo |
| breakout | phá vỡ ngưỡng |
| rebound | hồi phục |
| consolidate / consolidation | tích lũy |
| sentiment | tâm lý thị trường |
| volatility | biến động |
| catalyst | yếu tố kích hoạt / động lực |
| upside / downside | đầu tăng / đầu giảm |

Any English word from this table appearing in the post body is a jargon violation (same class as σ/bp). Exception: permitted inside quoted company names or ticker codes only.

---

### Section ordering (MANDATORY — never change this order)

The post has exactly THREE sections, in this order:

```
1. Tóm tắt nhanh   ← shortest; context only
2. Phân tích       ← bridge; causal interpretation
3. Dự đoán         ← LONGEST; the main value of the post
```

The **Dự đoán** section is THE point of the post. It must be the most prominent, most detailed section. The recap is secondary — keep it concise.

---

### Section 1 — Tóm tắt nhanh (brief recap)

**Purpose:** Quick orientation — the factual context. Keep SHORT. Do NOT editorialize here.

**Detail floor (mandatory — all quantitative data goes here):**

**1. Multiple indices** — VN-Index, VN30, HNX-Index, UPCOM, each with: current value (điểm), point change (±x điểm), percentage change (±x%). Example: "VN-Index đóng cửa ở 1.285 điểm, giảm 12 điểm (−0,9%)".

**2. Market breadth** — advancers (tăng), decliners (giảm), unchanged (đứng giá), ceiling hits (tăng trần), floor hits (giảm sàn) as plain counts. Example: "320 mã tăng, 410 mã giảm, 85 đứng giá; 18 trần, 22 sàn."

**3. Liquidity** — total matched value in tỷ đồng; compare to recent average if available.

**4. Foreign flows** — net buy/sell in tỷ đồng; top 2–3 most-bought and most-sold tickers with amounts.

**5. Named movers (≥5 tickers, across multiple sectors)** — winners and losers; each with ticker + company name + % change + price. Spread across ≥2–3 sectors.

**6. Named news / events / companies / policies** — at least 2 specific named items (not generic placeholders). From news-scout notebook.

**7. Macro figures (if in scope)** — USD/VND, gold, oil each with direction. Mention impact only if direct.

---

### Section 2 — Phân tích (analysis)

**Purpose:** Interpret the day causally. Connect the data from the recap to meaning. This is the bridge between facts and prediction.

**Required content:**
- WHY did the market move today? Name the causal driver(s) — policy, earnings, foreign selling, macro shift, sector rotation. Link to named events from Section 1.
- What do the breadth and liquidity signals imply? (e.g., broad advance = healthy risk-on vs. narrow rally = concentration risk; high volume confirms vs. low volume warns)
- What does the foreign flow signal? (accumulation, distribution, carry-trade pressure, FII rotation)
- What macro regime does today reinforce? (risk-on / risk-off, USD pressure on importers, rate sensitivity, etc.)
- What sector narrative is playing out? (bank-led = rate expectations; real estate = FDI/land law; materials = commodity cycle)

**Style:** 3–5 sentences of plain causal reasoning. Every claim must name something specific. No generic filler.

---

### Section 3 — Dự đoán (prediction) — THE main section

**Purpose:** Deliver the forward value. This is what readers come for. Must be EARNED — every prediction claim must follow from something stated in Section 2 (Phân tích). No bare assertions.

**Prediction inputs (pull from $prediction_inputs assembled in STEP 2):**
- digest-predict signals: predicted direction, key levels, scenarios for next session/week.
- CHEF (unified-agent) outlook / conviction section (if present).
- Regime call from macro extraction (risk-on/off, carry/FII pressure).
- If NO fleet prediction exists for today → derive your own from the Phân tích section, but you MUST reason through it (show the logic). Do not assert without reasoning.

**Required content:**
- **Direction call** — likely direction for next session and/or week (tăng / giảm / tích lũy / đi ngang), and why (must trace to Phân tích).
- **Key levels or zones to watch** — at least 1 specific VN-Index support/resistance level or range. Example: "nếu VN-Index giữ được 1.270 điểm thì..."
- **Specific tickers or sectors to watch** — name at least 1–2 tickers or sectors with a conditional ("nếu ... thì ..." or "khi ... mới ..."). Example: "Nhóm ngân hàng sẽ dẫn đầu nếu khối ngoại đảo chiều mua ròng."
- **Scenario framing (if-then)** — at least 1 "nếu ... thì ..." scenario showing bull and/or bear condition. Grounded in today's analysis.

**Tone:** Calm and reasoned. Not overconfident. Use hedged language naturally: "có khả năng", "nếu", "theo quan sát", "tuy nhiên cần theo dõi". No exaggerated certainty.

---

### Detail Floor — data availability rules

Do NOT pad with generic vague sentences where data is missing — if a field is genuinely unavailable after tool calls, omit that field entirely. Do not fabricate numbers.

---

### Hard rules

- ALWAYS include direction + delta% for VN-Index and any named ticker (memory: feedback_market_data_direction). Never write a bare price without change.
- Total post length: 150–1300 words. The 3-section structure naturally requires more space — do NOT truncate the Dự đoán section to meet a word target. Trim the recap if needed. Long-form is fine; the ceiling is generous by design.
- No markdown formatting in the post body (no `**bold**`, no `#headers`). Plain prose + the disclaimer separator. Section headings may be written as plain Vietnamese labels if helpful for readability (e.g., "Tóm tắt:" or "Dự đoán:") but no markdown.
- The disclaimer block MUST appear verbatim at the end, inside `---` separators.
- **Anti-filler rule:** Forbidden generic phrases: "tin tức trong nước", "thông tin tích cực", "yếu tố bên ngoài", "thị trường biến động" (alone, without specifics). Every explanatory sentence must name something concrete.

---

### Post template

```
[Hook — 1 sentence: bức tranh tổng thể ngày hôm nay với số liệu chính]

Tóm tắt nhanh:
[4 chỉ số với điểm + % thay đổi]
[Độ rộng: số mã tăng/giảm/đứng/trần/sàn]
[Thanh khoản tỷ đồng]
[Khối ngoại: mua/bán ròng tỷ đồng; mã được mua/bán nhất]
[≥5 cổ phiếu nổi bật từ nhiều ngành, mỗi mã kèm % và giá]
[≥2 tin tức/sự kiện/chính sách có tên cụ thể]
[Macro: tỷ giá / vàng / dầu nếu có tác động]

Phân tích:
[Lý giải nhân quả: tại sao thị trường diễn biến như vậy hôm nay]
[Ý nghĩa của breadth, thanh khoản, dòng ngoại]
[Chế độ thị trường hiện tại (risk-on/off, áp lực tỷ giá, v.v.)]
[Câu chuyện ngành đang diễn ra]

Dự đoán:
[Hướng kỳ vọng cho phiên tiếp theo / tuần tới + lý do từ phân tích]
[Mức hỗ trợ/kháng cự VN-Index cần theo dõi]
[1-2 cổ phiếu/nhóm ngành cụ thể + điều kiện ("nếu ... thì ...")]
[Ít nhất 1 kịch bản if-then: bull và/hoặc bear]

---
⚠️ Nội dung được tạo tự động bởi bot AI, chưa được kiểm chứng. Tôi không chịu trách nhiệm về tính chính xác của thông tin. Nếu nội dung có sai sót hoặc cần chỉnh sửa, mọi góp ý của bạn sẽ được ghi nhận lại để giúp bot hoạt động và phục vụ bạn tốt hơn.
---
```

---

## STEP 4 — Pre-write validation

Before writing the file, verify ALL checks. Fix inline where possible; log and accept partial if a field was genuinely unavailable from all tools.

**Structural checks (must pass — fix inline if failing):**
1. VN-Index appears with both level AND % change.
2. Disclaimer block present verbatim at the end.
3. **Hard-fail jargon grep (MUST be zero hits before file write):** Scan the entire post body for each of the following. Any hit = mandatory fix inline before proceeding to STEP 5.

   **Quant / notation violations:**
   - `σ` (sigma character)
   - `sigma` (word)
   - `bp` or `bps` (basis points)
   - `±` (used as a statistical notation, not a plain plus-or-minus)
   - `Layer #` or `Layer ` followed by a digit
   - `standard deviation` or `độ lệch chuẩn` (in a quant context)
   - z-score, z score
   - hexagram, Kinh Dịch, quẻ
   - `TNB`
   - `convergence` (English)
   - `signal #` or `signal ` followed by a digit

   **Forbidden-English violations (from the mapping table in STEP 3):**
   - `bullish`, `bearish`, `neutral` (standalone English)
   - `breadth` (English)
   - `broad-based` (English)
   - `momentum` (English)
   - `stasis` (English)
   - `durable` (English)
   - `outflow`, `inflow` (English)
   - `risk-on`, `risk-off` (English)
   - `rally`, `sell-off`, `breakout`, `rebound` (English)
   - `consolidat` (matches consolidate/consolidation, English)
   - `sentiment` (English)
   - `volatility` (English)
   - `catalyst` (English)
   - `upside`, `downside` (English)

   **FALSE-GREEN PROOF:** If this check were a no-op, inserting a deliberate `σ` or the word `bullish` into the draft would NOT be caught. This grep is proven non-false-green only if such an injection causes the check to fire and block file write. Any future change to this check must include a planted-violation smoke test (insert `σ` → verify check fires → remove).

4. Post length: minimum 150 words, maximum 1300 words.
   - Count words in the post body (exclude the file header line and the disclaimer separator lines from the count).
   - If word count < 150 → composition failed (EXIT with bug: "[fb-market-poster] Post too short: {N} words").
   - If word count > 1300 → trim recap section (Tóm tắt nhanh) first; never trim Dự đoán.
   - Long-form is encouraged — do NOT compress Dự đoán to fit a low ceiling.

**Section-order checks (must pass — fix inline if failing):**
5. All three sections are present in the post, in the mandatory order: Tóm tắt nhanh → Phân tích → Dự đoán. Missing any section → fix inline.
6. Dự đoán section exists and contains at least ONE concrete forward call: a direction call (tăng/giảm/tích lũy/đi ngang), a key level or zone, a named ticker/sector with condition, or an if-then scenario. If Dự đoán is absent or contains only generic statements → mandatory fix inline.
7. Earned-prediction check — every prediction claim in the Dự đoán section must trace to a specific fact or interpretation stated in the Phân tích section. Scan: if a forward claim appears in Dự đoán that has no anchor in Phân tích → add the missing reasoning to Phân tích, or remove the unsupported claim. No orphan forecasts.
8. Recap must not dominate — the combined word count of Phân tích + Dự đoán must exceed the word count of Tóm tắt nhanh. If Tóm tắt nhanh is longer → trim it (remove less-important detail-floor items before trimming analysis or prediction).

**Detail-floor checks (each field: pass if present with data, skip if genuinely no data available from any source including live tools):**
9. ≥2 indices present with numeric value + change (VN-Index minimum; VN30/HNX/UPCOM additional).
10. Market breadth: at least advancers + decliners count present.
11. Liquidity: total matched value figure present (tỷ đồng).
12. Foreign flow: net value figure present (tỷ đồng buy/sell).
13. ≥5 named tickers with direction + % change each.
14. ≥2 named news items or events/companies/policies (not generic placeholders).

**Filler check (must pass):**
15. Draft does NOT contain any of the forbidden generic phrases: "tin tức trong nước", "thông tin tích cực", "yếu tố bên ngoài", "thị trường biến động" used without a named specific following them.

**On failure:**
- Check 3 (jargon grep) fails: **mandatory fix inline — remove or replace every violating term before file write. Do NOT write the file with any jargon hit present.** Re-run the grep after fix; proceed only when zero hits confirmed.
- Checks 1–2, 4–8 fail: fix inline, re-verify.
- Checks 9–14 fail because data genuinely unavailable after live tools + notebook: log which field is missing in RETURN QUALITY field; proceed (do NOT pad).
- Check 15 fails: mandatory fix inline before writing.
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
- Validation: passed {N}/15 checks (section-order: {pass/fail}, earned-prediction: {pass/fail}, recap-not-dominant: {pass/fail}, detail-floor fields available: {list})
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
