# Lộ trình 4 tuần — Từ "amateur" lên "có nền pro"

> **Bắt đầu:** 2026-05-28
> **Kết thúc dự kiến:** 2026-06-25
> **Cam kết tối thiểu:** 1h/ngày × 7 ngày × 4 tuần = **28h**

## Triết lý

Mỗi tuần học 1 thứ → áp dụng ngay vào project VN-Market-Intelligence-MCP → test kiểm chứng. **Không học rộng, học để đo được tiến bộ.**

## Tại sao lộ trình này?

Gap lớn nhất giữa bạn (solo builder ở Tầng 4 - Vertical AI) và pro:
1. **Vocabulary gap** → không đọc được Anthropic/OpenAI blog
2. **Prompt craft gap** → viết prompt theo cảm tính, không có technique
3. **EVAL gap** ⭐ → không có thước đo, mọi cải tiến đều là mê tín
4. **Fleet design gap** → không biết fleet mình so với industry pattern thế nào

Lộ trình này lấp **đúng 4 gap đó** trong 4 tuần.

---

## 📊 Dashboard tiến bộ tổng

```
TUẦN 1 — VOCAB         [ ] vocab quiz  [ ] apply test  [ ] project test
TUẦN 2 — PROMPT CRAFT  [ ] recall      [ ] apply test  [ ] hallucination↓
TUẦN 3 — EVAL ⭐        [ ] concept     [ ] 20 cases    [ ] baseline score    [ ] 3 patterns
TUẦN 4 — FLEET AUDIT   [ ] strategy    [ ] eval #2     [ ] vs autogen        [ ] confidence
```

Pass criteria từng tuần ở cuối mỗi section. Pass = nhảy tuần tiếp; fail = lặp lại.

---

## 🗓️ TUẦN 1 — Vocabulary + LLM Mental Model

**Ngày:** 2026-05-28 → 2026-06-03
**Mục tiêu:** đọc được blog pro mà không bị "ngợp thuật ngữ"

### Học (5h)

- [ ] **Mon (1.5h)** — Andrej Karpathy "Intro to LLMs" (YouTube 1h)
  - Link: https://www.youtube.com/watch?v=zjkBMFhNj_g
  - Xem chậm, dừng lại note. Đây là mental model cơ bản nhất.

- [ ] **Tue (1h)** — Anthropic "Prompt engineering overview" + glossary
  - Link: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
  - Tập trung phần glossary để nhớ thuật ngữ.

- [ ] **Wed (1h)** — Đọc 5 blog Simon Willison gần nhất
  - Link: https://simonwillison.net/
  - Mục đích: cảm nhận "pro builder hàng ngày suy nghĩ gì".

- [ ] **Thu (1h)** — Viết tay 30 thuật ngữ + định nghĩa 1 câu (list dưới)

- [ ] **Fri (0.5h)** — Skim 1 paper survey: "The Rise and Potential of LLM Based Agents"
  - Link: https://arxiv.org/abs/2309.07864
  - Chỉ skim abstract + figures, không cần hiểu hết.

### 30 thuật ngữ phải nhớ

Foundation: `token`, `context window`, `attention`, `embedding`, `temperature`, `top-p`, `sampling`

Failure: `hallucination`, `grounding`

Prompting: `chain-of-thought (CoT)`, `few-shot`, `zero-shot`, `in-context learning`, `system prompt`, `prompt caching`, `structured output`

Tool use: `function calling / tool use`, `agentic loop`

Knowledge: `RAG`, `chunk`, `reranking`

Eval: `eval`, `golden dataset`, `LLM-as-judge`, `regression test`

Training: `fine-tuning`, `RLHF`

System: `MCP`, `multi-agent`, `orchestration`, `blackboard`

### Thực hành (2h)

- [ ] Mở `docs/agents/financial-analyst/main.md` (hoặc agent quen nhất)
- [ ] Đánh dấu mỗi đoạn = thuật ngữ nào ("đây là system prompt", "đây là few-shot")

### ✅ Test cuối tuần 1 (30 phút)

- [ ] **Vocab quiz:** che định nghĩa, gọi tên 30 thuật ngữ — đạt ≥ 25/30
- [ ] **Apply test:** đọc Anthropic "Building Effective Agents" (https://www.anthropic.com/engineering/building-effective-agents), viết 5 câu tóm tắt. Hiểu được = pass.
- [ ] **Project test:** chọn 1 agent .md, chỉ ra các đoạn "CoT", "few-shot", "tool use"

**Pass criteria:** ≥ 2/3 test đạt. Fail → lặp lại tuần 1.

---

## 🗓️ TUẦN 2 — Prompt Engineering như nghề thủ công

**Ngày:** 2026-06-04 → 2026-06-10
**Mục tiêu:** viết prompt tốt hơn 90% người dùng AI

### Học (5h)

- [ ] **Mon (1h)** — Anthropic Prompt Engineering Course (free) — Lesson 1-3
  - Link: https://github.com/anthropics/courses/tree/master/prompt_engineering_interactive_tutorial

- [ ] **Tue (1h)** — Lesson 4-6 (focus: CoT, structured output)

- [ ] **Wed (1h)** — Lesson 7-9 (focus: examples, complex tasks)

- [ ] **Thu (1h)** — Anthropic blog: "Prompt caching" + "Long context tips"
  - https://www.anthropic.com/news/prompt-caching
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips

- [ ] **Fri (1h)** — Đọc 3 system prompt nổi tiếng đã leak:
  - ChatGPT (search github "chatgpt system prompt leaked")
  - Claude (Anthropic publish chính thức: https://docs.anthropic.com/en/release-notes/system-prompts)
  - Cursor (search github "cursor system prompt")

### Thực hành (3h)

Pick **1 agent yếu nhất** (gợi ý: `chef / unified-agent` vì hay HOLLOW-RUN).

- [ ] Đọc lại file `.md` với mắt mới sau tuần học
- [ ] Refactor với 3 cải tiến:
  - (a) CoT rõ ràng
  - (b) Structured output schema
  - (c) 2-3 few-shot examples
- [ ] Chạy thử 5 lần, so sánh output cũ vs mới

### ✅ Test cuối tuần 2

- [ ] **Recall test:** không nhìn note, kể 5 kỹ thuật prompt từ course Anthropic
- [ ] **Apply test:** đưa 1 người không biết AI 2 prompt (cũ vs mới) — họ chọn cái nào dễ hiểu? Phải là cái mới.
- [ ] **Project test:** chef đã refactor có giảm hallucination so với baseline không? (chạy 10 lần, đếm lỗi)

**Pass criteria:** ≥ 2/3 test đạt. Fail test 3 vẫn nhảy tuần 3 (sẽ vòng lại).

---

## 🗓️ TUẦN 3 — EVAL: thước đo của mọi quyết định ⭐

**Ngày:** 2026-06-11 → 2026-06-17
**Mục tiêu:** xây dựng golden dataset đầu tiên + LLM-as-judge cho 1 agent
**Tuần quan trọng nhất — KHÔNG được bỏ.**

### Học (5h)

- [ ] **Mon (1.5h)** — Hamel Husain "Your AI Product Needs Evals" — đọc 2 lần
  - Link: https://hamel.dev/blog/posts/evals/
  - Đây là vốn cả đời. Đọc chậm.

- [ ] **Tue (1h)** — Eugene Yan "Evaluation & Hallucination Detection for LLMs"
  - Link: https://eugeneyan.com/writing/evals/

- [ ] **Wed (1h)** — Hamel "Creating a LLM-as-a-Judge That Drives Business Results"
  - Link: https://hamel.dev/blog/posts/llm-judge/

- [ ] **Thu (1h)** — Anthropic docs "Evaluating prompts" + xem OpenAI evals library
  - https://docs.anthropic.com/en/docs/build-with-claude/develop-tests
  - https://github.com/openai/evals

- [ ] **Fri (0.5h)** — Đọc 1 case study eval (Notion, Linear, hoặc tương tự — search "how X built AI eval")

### Thực hành (5h — tuần này nặng nhất)

Build golden dataset cho **1 agent duy nhất** — đề xuất: `financial-analyst`.

- [ ] **Step 1 (1h)** — Sưu tầm 20 ca thật: lấy 20 cycle gần nhất từ `docs/agent-memory/notebooks/financial-analyst.md`, copy input
- [ ] **Step 2 (2h)** — Viết expected output: với mỗi ca, ghi "output đúng phải có ABC, không được có XYZ"
- [ ] **Step 3 (1h)** — Viết LLM-as-judge prompt: "Cho input X, output Y, đánh giá theo 5 tiêu chí... trả về score 1-10 + giải thích"
- [ ] **Step 4 (1h)** — Chạy baseline: chạy agent hiện tại trên 20 ca, judge chấm, ghi score trung bình

Lưu tất cả vào: `docs/learning/eval-financial-analyst-baseline-2026-06-17.md`

### ✅ Test cuối tuần 3 (test khó nhất)

- [ ] **Concept test:** giải thích "eval là gì, tại sao quan trọng" cho người không biết tech trong 2 phút
- [ ] **Apply test:** golden dataset có **≥ 20 ca**, mỗi ca có input + expected criteria
- [ ] **Run test:** chạy được judge tự động, ra số trung bình (ví dụ: 6.5/10) → có baseline
- [ ] **Insight test:** từ baseline, tìm ra **3 pattern thất bại**

**Pass criteria:** ≥ 3/4 test đạt. **BẮT BUỘC** test 3 phải đạt — không có baseline thì tuần 4 vô nghĩa.

---

## 🗓️ TUẦN 4 — Multi-agent Architecture + Fleet Audit

**Ngày:** 2026-06-18 → 2026-06-24
**Mục tiêu:** nhìn fleet 22 agent qua mắt pro, quyết định cắt/gộp/giữ

### Học (5h)

- [ ] **Mon (1h)** — Anthropic "Building Effective Agents" — đọc 2 lần
  - https://www.anthropic.com/engineering/building-effective-agents

- [ ] **Tue (1h)** — Anthropic "Claude Code best practices"
  - https://www.anthropic.com/engineering/claude-code-best-practices

- [ ] **Wed (1h)** — AutoGen documentation: agent patterns (skim, không code)
  - https://microsoft.github.io/autogen/

- [ ] **Thu (1h)** — LangGraph: "Multi-agent collaboration" tutorial (xem code, không cần chạy)
  - https://langchain-ai.github.io/langgraph/tutorials/multi_agent/

- [ ] **Fri (1h)** — Đọc 1 paper: "ReAct" hoặc "Reflexion"
  - ReAct: https://arxiv.org/abs/2210.03629
  - Reflexion: https://arxiv.org/abs/2303.11366

### Thực hành (4h) — Fleet Audit

- [ ] **Step 1 (1h)** — Liệt kê 22 agent + 1 dòng mô tả mỗi cái
- [ ] **Step 2 (1h)** — Map theo pattern: mỗi agent thuộc planner/executor/critic/blackboard/swarm?
- [ ] **Step 3 (1h)** — Phát hiện duplicate → đề xuất gộp
- [ ] **Step 4 (0.5h)** — Phát hiện bloat → đề xuất cắt
- [ ] **Step 5 (0.5h)** — Áp eval tuần 3: dự đoán agent nào điểm thấp nhất

Lưu kết quả: `docs/learning/fleet-audit-2026-06-24.md`

### ✅ Test cuối tuần 4 — test tổng hợp

- [ ] **Strategy test:** viết **1 trang A4** trả lời "Fleet 22 agent có cần tinh gọn không? Cắt cái nào, gộp cái nào, tại sao?" — với pattern reference
- [ ] **Apply test:** chạy eval tuần 3 trên **1 agent thứ 2** → có 2 baseline
- [ ] **Compare test:** so fleet bạn với AutoGen/LangGraph examples — 3 điểm bạn **tốt hơn**, 3 điểm **kém hơn**
- [ ] **Meta test:** giờ bạn có dám tự tin nói "tôi không đi chệch hướng so với pro"? Lý do?

**Pass criteria:** ≥ 3/4 test đạt. Test 4 là test tâm lý quan trọng nhất.

---

## 🚨 Emergency rules

| Tình huống | Xử lý |
|---|---|
| Tuần này không có thời gian | Giãn lịch, **không nhảy**. Tuần 3 không bỏ qua dù gì. |
| Tuần 1 fail vocab | Lặp lại 3 ngày, không tiếc thời gian. Đây là fundament. |
| Tuần 3 không build được dataset | Giảm xuống **10 ca**, vẫn pass. Đừng bỏ tuần 3. |
| Bị cuốn vào project deadline | Pause project 1 tuần để học. ROI cao hơn. |
| Muốn nhảy đọc paper xịn | KHÔNG. Đọc paper khi đã pass tuần 4. |

---

## Sau 4 tuần — bạn sẽ có

- ✅ Vocabulary đủ đọc bất kỳ blog pro nào (tuần 1)
- ✅ Skill prompt engineering bằng 1 năm tự mò (tuần 2)
- ✅ **Eval framework cho project — đây là cái biến bạn thành pro** (tuần 3)
- ✅ Tự tin định vị fleet so với industry (tuần 4)
- ✅ Trả lời được "tôi có đang đi đúng hướng không?" bằng DỮ LIỆU

---

## Lộ trình sau 4 tuần (preview)

Nếu pass cả 4 tuần, hướng tiếp theo:

- **Tháng 2** — Áp eval cho toàn bộ fleet, thiết lập regression CI
- **Tháng 3** — Cost optimization (prompt caching, model routing), observability dashboard
- **Tháng 4** — Advanced RAG (financial corpus tuning), domain-specific patterns
- **Tháng 5-6** — Bắt đầu đọc papers nghiêm túc, contribute open-source

---

## Tham khảo

Bản brainstorm gốc dẫn tới roadmap này (2026-05-28 conversation):

- Reframe: bạn ở Tầng 4 (Vertical AI), không cạnh tranh với Tầng 1 (Foundation models)
- 3 lo lắng đúng: vocabulary gap, prompt craft, missing eval
- Self-audit 10 câu hỏi: nếu tick ≥ 7 = pro, < 5 = amateur
- Khuyến nghị chiến lược 1 câu: **"Học sâu EVAL trong 1 tháng — sau đó tự biết học gì tiếp"**

---

**Ngày tạo:** 2026-05-28
**Người học:** Hung (daihung.pham@gmail.com)
**Project context:** VN-Market-Intelligence-MCP — solo builder, vertical AI for VN finance
