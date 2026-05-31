# AR-AGENT-A — Author `refine_bctc_md` Flows (agent-father)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** agent-father | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** None (can start parallel with AR-MCP) | **Blocks:** AR-AGENT-B (must complete before B starts)

---

## Summary

Author the `refine_bctc_md` agent and all four sub-flow files using Opus as the authoring model (one-time). Flow files declare `model: claude-haiku-3-5` for runtime execution. This task outputs deterministic, worked-example-rich flows that Haiku will execute per-page at runtime.

**Scope:** FR-6, FR-7, FR-13 (agent prompt design). Agent runs as Haiku at runtime but is authored by Opus once.  
**DDD scope:** interface (agent-father domain). The agent itself is a deployed interface to the refine system.

---

## Acceptance Criteria

### AC-FR6: Haiku Runtime Model

- [ ] Agent `init.md` declares `model: claude-haiku-3-5` in frontmatter (line 1).
- [ ] Flow files (`table-page.md`, `prose-page.md`, `continuation-stitch.md`, `disagreement-verify.md`) each declare `model: claude-haiku-3-5` in their frontmatter.
- [ ] Opus is used for one-time authoring session only (agent-father runs Opus to author all flows). At runtime, the declared model is Haiku.
- [ ] DDD layer: interface (agent definition).

### AC-FR7: Prompt Caching

- [ ] System prompt (refine contract + column format + worked examples) is sent once per report session and marked for caching.
- [ ] Agent `.md` instructions include guidance: "The refine contract block is the system prompt. Do not repeat it in each user turn. It is sent once and cached."
- [ ] Per-page calls within a session reuse the cached prefix.
- [ ] QA bake-off (FR-15) reports cache hit rate and tokens saved vs first-page cost.

### AC-FR13: Refine Contract Enforcement in Prompt

The system prompt **MUST** encode the three-tier contract verbatim:

```
REFINE CONTRACT — MANDATORY, NOT OPTIONAL:

1. Numbers ← OCR text (get_bctc_page_text). These are the numeric source of record.
2. Structure / column boundaries / row labels ← image (get_bctc_page_image). Read table layout from the image.
3. Text ≠ image on a number: FLAG immediately. NEVER silently pick one.
   - High discrepancy or unsure which is correct: [ĐỘ TIN CẬY THẤP — {specific reason}]
   - Minor discrepancy, text chosen: [độ tin cậy thấp]
4. Balance check (assets = liab + equity) is a catch-net ONLY. A passing balance does NOT clear a flagged number.
```

- [ ] Agent must NOT silently pick one value without flagging when text ≠ image.
- [ ] Balance check is recorded as information, never as override.
- [ ] All worked examples in sub-flows demonstrate flagging behavior.

---

## Files to Create

### Main Agent Definition

**File:** `docs/agents/refine_bctc_md/init.md`

- [ ] Frontmatter starts on line 1 (project_agent_frontmatter_line1 memory).
- [ ] `agent.id: refine_bctc_md`
- [ ] `agent.model: claude-haiku-3-5`
- [ ] `authored_by: claude-opus-4` (annotation, not runtime model)
- [ ] `agent.description: BCTC page refine agent. Reads OCR text + page images. Produces trusted markdown per FR-13 contract.`
- [ ] `agent.tools: [get_bctc_page_text, get_bctc_page_image]`
- [ ] `agent.output: docs/refine-output/{report_id}/{unit_id}.json` (per-window output; orchestrator collects all, then deletes)
- [ ] Include initialization logic to select the correct sub-flow based on page type.

### Sub-Flow A: `flow/table-page.md`

**Purpose:** Process one table-dense page. Input: OCR text + page image. Output: trusted pipe-table markdown.

**Must include:**
- [ ] System prompt with refine contract (all three tiers + balance catch-net caveat).
- [ ] Column format specification: `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |`
- [ ] Worked examples (Vietnamese, in context) showing:
  - Agreement case: OCR "1.234.567" and image "1.234.567" → emit value 1234567.
  - Disagreement case: OCR "1.234.567" and image "1.345.678" → emit `[ĐỘ TIN CẬY THẤP — OCR 1234567 vs image 1345678]` in value cell.
  - Yellow flag case: minor discrepancy, text chosen → emit `[độ tin cậy thấp]`.
- [ ] Output format: one pipe-table markdown block. No duplicate header. Header row = `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |`.
- [ ] Frontmatter: `model: claude-haiku-3-5`
- [ ] Tool calls: `get_bctc_page_text`, `get_bctc_page_image`
- [ ] Output: markdown table string
- [ ] DDD: table-specific refine logic (domain-level instructions for Haiku).

### Sub-Flow B: `flow/prose-page.md`

**Purpose:** Process a prose/notes page (no table structure detected). Input: OCR text only. Output: clean paragraph text or extracted numerical disclosures.

**Must include:**
- [ ] Instruction: "This page does not contain a table. Extract key numerical disclosures as `**Label:** value` pairs or clean paragraph text."
- [ ] Worked example: prose page with embedded numbers → extract as `**Key disclosure:** 123.456 billion VND`.
- [ ] No image call (text-only is the optimization here).
- [ ] Frontmatter: `model: claude-haiku-3-5`
- [ ] Tool calls: `get_bctc_page_text` only
- [ ] Output: markdown paragraph text (no pipe tables)
- [ ] This is the cheapest flow: text-only, no image token cost.

### Sub-Flow C: `flow/continuation-stitch.md`

**Purpose:** Handle a multi-page table that continues across pages N and N+1 (or more, up to max). Input: OCR text for all pages + images for all pages. Output: ONE unified pipe-table with continuation rows appended, no duplicate header.

**Critical instruction:**
- [ ] Detect continuation marker (`tiếp theo` / `continued`) in page N+1's header.
- [ ] Suppress N+1's table header row; merge rows into page N's table.
- [ ] Output `page_numbers_json = [N, N+1, ...]` reflecting all pages in the window.

**Must include:**
- [ ] Worked example: FPT span [22, 23] — synthetic example showing two partial tables (one ending with "tiếp theo", next starting mid-table) stitching into one complete table with single header at top, no duplicate rows.
- [ ] Frontmatter: `model: claude-haiku-3-5`
- [ ] Tool calls: `get_bctc_page_text`, `get_bctc_page_image`
- [ ] Output: markdown table string (unified across pages)
- [ ] DDD: continuation-specific stitching logic.

### Sub-Flow D: `flow/disagreement-verify.md`

**Purpose:** Re-examine a previously flagged cell when the orchestrator requests a second look. Input: specific flagged cell context (OCR text excerpt + image crop indicator). Output: `{ confirmed: boolean, best_value: number | null, flag: string }`.

**Must include:**
- [ ] Instruction: "You are re-examining a cell that was flagged during the main refine pass. Provide your best judgment on the correct value and whether the flag should stand."
- [ ] Worked example: a cell flagged as `[ĐỘ TIN CẬY THẤP — OCR 123 vs image 456]` → re-examine → confirm or refute.
- [ ] Frontmatter: `model: claude-haiku-3-5`
- [ ] Tool calls: `get_bctc_page_text`, `get_bctc_page_image`
- [ ] Output: structured JSON `{ confirmed: true/false, best_value: number, flag: string }`

---

## Implementation Notes

### Frontmatter Template

Each file must start on line 1 with:

```markdown
---
agent:
  id: refine_bctc_md (or flow name for sub-flows)
  model: claude-haiku-3-5
  description: ...
  tools:
    - get_bctc_page_text
    - get_bctc_page_image
---

# Refine [Type] — [Subtitle]

[Instructions and worked examples follow]
```

### System Prompt Block (for table-page.md)

Must include all three tiers of the contract:

```markdown
## Refine Contract

### 1. Numbers ← OCR Text (Source of Record)
All numeric values come from OCR text (`get_bctc_page_text`). The OCR text is the authoritative numeric source.

### 2. Structure ← Image
Table structure (column boundaries, row labels, page breaks, continuation markers) comes from the image (`get_bctc_page_image`).

### 3. Disagreement → Flag (Never Guess)
If OCR text and image disagree on a number:
- **High discrepancy or unsure which is correct:** 
  ```
  [ĐỘ TIN CẬY THẤP — {specific reason}]
  ```
- **Minor discrepancy, text chosen:**
  ```
  [độ tin cậy thấp]
  ```
- **NEVER silently pick one value.** Always flag if there is disagreement.

### 4. Balance Check = Catch-Net Only
Assets = Liabilities + Equity is a final sanity check, not the gate. A passing balance does NOT clear a flagged number. Record the balance status but do not override trust flags based on it.
```

### Worked Examples (in Vietnamese)

**Example 1 (Agreement):**
```
OCR text cell: "1.234.567"  (meaning 1,234,567 thousand VND — Vietnamese uses . for thousands separator)
Image cell shows: "1.234.567" or "1 234 567"
→ Agreement: emit value as-is in pipe table cell: 1234567
→ No flag needed.
```

**Example 2 (Disagreement — High Confidence in Text):**
```
OCR text cell: "1.234.567"
Image cell shows: "1.345.678"
→ Disagreement: values differ significantly.
→ Emit: [ĐỘ TIN CẬY THẤP — OCR 1234567 vs image 1345678] in value cell (use OCR as primary, flag the conflict)
→ The flag tells downstream analysts: this cell needs review.
```

**Example 3 (Disagreement — Minor, Text Chosen):**
```
OCR text cell: "123.456,5"
Image cell shows: "123.456,6" (last digit blurry but likely 6)
→ Minor discrepancy; OCR is likely correct.
→ Emit: [độ tin cậy thấp] in value cell (yellow flag, text chosen)
→ Confidence = 0.4 (not as bad as red flag 0.2, but not perfect 1.0).
```

---

## Output Format

Each sub-flow outputs:

**table-page.md:**
```markdown
| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 100 | Tài sản | 1.234.567 | 1.000.000 |
| 110 | Tiền và tương đương tiền | [ĐỘ TIN CẬY THẤP — OCR 567 vs image 789] | 100.000 |
| ... | ... | ... | ... |
```

**prose-page.md:**
```markdown
Theo thuyết minh báo cáo tài chính, công ty ghi nhận doanh thu từ...

**Doanh thu chính:** 12.345.678 tỷ VND
**Chi phí hoạt động:** 5.678.901 tỷ VND
```

**continuation-stitch.md:**
```markdown
| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 100 | [Table from page 22, continued from page 23...] | ... | ... |
[All rows from both pages, merged, no duplicate header]
```

---

## Exit Criteria

- [x] `docs/agents/refine_bctc_md/init.md` created (frontmatter line 1).
- [x] `docs/agents/refine_bctc_md/flow/main.md` created (dispatcher logic).
- [x] `docs/agents/refine_bctc_md/flow/table-page.md` created (refine contract + worked examples).
- [x] `docs/agents/refine_bctc_md/flow/prose-page.md` created (text-only flow).
- [x] `docs/agents/refine_bctc_md/flow/continuation-stitch.md` created (multi-page stitching).
- [x] `docs/agents/refine_bctc_md/flow/disagreement-verify.md` created (re-examination sub-flow).
- [x] All frontmatter declare `model: claude-haiku-3-5`.
- [x] All flow files include worked examples in Vietnamese.
- [x] Refine contract (all three tiers + balance caveat) embedded in system prompt.
- [x] Prompt caching guidance included in agent instructions.
- [x] Per-window output path specified: `docs/refine-output/{report_id}/{unit_id}.json`.

---

## Non-Negotiables

- **Frontmatter on line 1.** No comment or blank line before `---` (project_agent_frontmatter_line1 memory).
- **Opus authors all flows.** Agent-father runs one authoring session to write all flow files.
- **Haiku declared in all flow frontmatter.** No Sonnet, no Opus in runtime declarations.
- **Worked examples in Vietnamese.** QA and analyst users must recognize the language and context.
- **Refine contract verbatim in system prompt.** All three tiers + balance caveat, word-for-word.
- **Output path per-window.** Each instance writes one JSON file to `docs/refine-output/{report_id}/{unit_id}.json`. Orchestrator collects.
- **No aggregation in flows.** Flow handles exactly ONE window. Multi-window aggregation is the orchestrator's job.

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§3.3, §0.2–0.5)
- Requirements: `docs/REQ_BCTC-AGENTIC-REFINE.md` (FR-6, FR-7, FR-13)
- Agent-father pattern: `.claude/skills/agent-md-factory/SKILL.md`
- Prompt caching: Claude API docs (model-specific syntax; Haiku 4.5 supports `cache_control`)

---

## RETURN

```
TASK: AR-AGENT-A
STATUS: READY FOR ASSIGNMENT
OWNER: agent-father
BLOCKER: None (can start immediately)
BLOCKS: AR-AGENT-B (must complete before B starts)
ESTIMATED: 3–4 hours (Opus authoring 1-time session, then review/refine)
AUTHORING SESSION: Agent-father uses Opus to write all flow files
RUNTIME MODEL: claude-haiku-3-5 (declared in all frontmatter)
CRITICAL: Frontmatter on line 1, refine contract verbatim, worked examples Vietnamese, per-window output
NEXT: AR-AGENT-B (sequential after this completes)
```
