---
sprint: HCM-DISAMBIG
task_id: HCM-D2
title: Chef Block A disambiguation rule for HCM ticker vs TP. HCM city
zone: apps/mcp-server/  (docs-owned, chef.md is a flow file)
size: XS
priority: MEDIUM
owner: dev-mcp-server
depends_on: []
blocks: []
---

## TLDR

Add a single formatting rule to the "Format rules" list in Block A of `docs/agents/unified-agent/flow/chef.md` (lines 184–191). The rule directs the dish writer to disambiguate HCM ticker from TP.HCM city on first mention: HCM ticker → `HCM (cổ phiếu)` or `HCM (mã)`; city → always `TP. HCM`. This is a **prompt-only edit** — no TS/Go code, no microservice rebuild required (chef.md is read fresh each cron tick by unified-agent).

## [PM] Planning Context

### Zone
`docs/agents/unified-agent/flow/chef.md` — interface layer (prompt specification). Owned and editable by `dev-mcp-server` alongside D1 (shared zone, same dev specialist).

### Acceptance Criteria

From `docs/REQ_HCM-DISAMBIG.md` §AC Table — Chef Narrative (D2):

| ID | Rule | DDD Layer | Notes |
|---|---|---|---|
| AC-D2-01 | `docs/agents/unified-agent/flow/chef.md` Block A "Format rules" MUST contain an explicit line: when HCM ticker appears in a dish, first mention renders as `HCM (mã)` or `HCM (cổ phiếu)`; when the city appears, always render as `TP. HCM` | Interface | Prompt-only edit; no rebuild required |
| AC-D2-02 | The disambiguation line MUST appear within the "Format rules" list block, before the `**Send:**` directive | Interface | Placement constraint |
| AC-D2-03 | The rule text itself must use plain Vietnamese — no analyst jargon, per `feedback_market_report_plain_vietnamese` | Interface | Language constraint |

### Files to read first

- `docs/REQ_HCM-DISAMBIG.md` (full spec, §3 AC Table — Chef Narrative)
- `docs/architecture-briefs/2026-05-28-hcm-disambig.md` (architect D2 decision + exact insertion point)
- `docs/agents/unified-agent/flow/chef.md` (lines 184–191, "Format rules" block)

### Files to modify

1. **`docs/agents/unified-agent/flow/chef.md:184–191`**
   - Locate Block A "Format rules" list (ends at line 191 with `"NO bullet-point ticker dumps. Every MARKET message is narrative prose."`)
   - Insert new rule after line 191, before `**Send:**` (line 193)
   - Exact text from architect brief §4:

```
- Khi nhắc đến cổ phiếu HCM, lần đầu tiên trong tin phải viết `HCM (cổ phiếu)` hoặc `HCM (mã CK)` để phân biệt với thành phố; khi nhắc đến thành phố luôn dùng `TP. HCM`.
```

### Files to create
None.

### Dependencies
None — this task runs in parallel with HCM-D1 (zero file overlap).

### Knowledge needed

- `docs/policies/dev-standards.md`
- Memory: `feedback_market_report_plain_vietnamese` (plain VN, no jargon)
- Memory: `feedback_dev_doc_graphify` (doc updates trigger `/graphify docs --update --no-viz` at sprint exit, not here)

## [Dev] Implementation Guidance

### Step 1: Locate insertion point

Open `docs/agents/unified-agent/flow/chef.md` and find Block A (search for "Format rules"):

Expected around lines 184–191:

```markdown
- Không khai báo ví dụ cổ phiếu: tránh danh sách dấu đầu dòng "Cổ phiếu A, B, C đi lên/xuống"; thay vào đó là câu văn hành động (VD: "Cổ phiếu ngân hàng hôm nay chiếm lợi thế với VPB, BID, ACB cùng tăng khi lãi suất khả dụng tốt"). Mục tiêu: mỗi MARKET là lời kể, không phải bảng dữ liệu.
- Không danh sách bullet-point cổ phiếu. Mỗi tin MARKET là lời kể narrative.

**Send:**
```

### Step 2: Insert the rule

**After** the line `"NO bullet-point ticker dumps. Every MARKET message is narrative prose."` **and before** `**Send:**`, add:

```markdown
- Khi nhắc đến cổ phiếu HCM, lần đầu tiên trong tin phải viết `HCM (cổ phiếu)` hoặc `HCM (mã CK)` để phân biệt với thành phố; khi nhắc đến thành phố luôn dùng `TP. HCM`.
```

**Result (line-by-line):**

```markdown
...
- Không danh sách bullet-point cổ phiếu. Mỗi tin MARKET là lời kể narrative.
- Khi nhắc đến cổ phiếu HCM, lần đầu tiên trong tin phải viết `HCM (cổ phiếu)` hoặc `HCM (mã CK)` để phân biệt với thành phố; khi nhắc đến thành phố luôn dùng `TP. HCM`.

**Send:**
```

### Step 3: Verify the change

- [ ] New line is inside the "Format rules" list (between the last existing rule and `**Send:**`)
- [ ] Plain Vietnamese: no analyst jargon like "Layer", "σ", "bp", "hexagram"
- [ ] Markdown syntax correct (backticks around `HCM (cổ phiếu)`, `HCM (mã CK)`, `TP. HCM`)
- [ ] No other changes to chef.md

### Step 4: Commit

Use explicit-file staging:
```bash
git add docs/agents/unified-agent/flow/chef.md
git commit -m "docs(hcm-disambig/D2): add Block A format rule for HCM ticker vs TP.HCM city

- Insert disambiguation rule in 'Format rules' list
- First-mention HCM ticker → 'HCM (cổ phiếu)' or 'HCM (mã CK)'
- City → always 'TP. HCM'
- Plain Vietnamese, no jargon

Task: HCM-D2
AC: AC-D2-01, AC-D2-02, AC-D2-03
"
```

### Exit Criteria

- [ ] `docs/agents/unified-agent/flow/chef.md` Block A "Format rules" list contains the new HCM disambiguation line
- [ ] Line is positioned correctly (after last existing rule, before `**Send:**`)
- [ ] Plain Vietnamese text, no analyst jargon
- [ ] Markdown syntax valid
- [ ] Commit landed on main, explicit-file staging

---

## [PM] Task Completion

**Ship once edit is verified and committed.**

No ops rebuild needed for this task (chef.md is read fresh by unified-agent each cron tick).

---

## [Notebook] Attachments

**Dev-mcp-server session notes:** [to be filled by dev after task completion]

- [ ] Insertion point confirmed in Block A "Format rules"
- [ ] No merge conflicts with existing chef.md text
- [ ] Commit message references all ACs

---

## RETURN (to main terminal after commit)

```
DONE: HCM-D2 chef.md Block A format rule added and committed
FILES_MODIFIED:
  - docs/agents/unified-agent/flow/chef.md (Block A "Format rules")
COMMIT: [sha to be filled by dev]
ACS_COMPLETED: AC-D2-01, AC-D2-02, AC-D2-03
NEXT: HCM-QA can proceed once HCM-OPS + HCM-D2 both complete (no new OPS rebuild for D2)
BLOCKED_BY: HCM-PM (now released)
WIP_ZONE: dev-mcp-server (can run in parallel with HCM-D1 — zero file overlap)
NOTE: No rebuild needed for this edit; unified-agent reads chef.md fresh each tick
```
