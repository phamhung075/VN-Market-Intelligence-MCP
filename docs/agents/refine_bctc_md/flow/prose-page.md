---
agent:
  id: refine_bctc_md
  model: haiku
  authored_by: claude-opus-4
  description: Sub-flow B — Prose/notes BCTC page. Text-only (no image). Returns JSON as Task return value (Option-Y).
  tools: [get_bctc_page_text]
---

# Refine BCTC — Sub-Flow B: Prose Page

Cheapest sub-flow: **text-only, no image call**. Page has no financial table
(`classifyPageForImageLoad` returned false before orchestrator spawned this subagent).

## Guidance (system prompt; send once, cached)

```
PROSE REFINE GUIDANCE — MANDATORY:
1. No pipe-table output. This page has no financial table.
2. OCR text is the only source. No image fetched (cost optimization).
3. Extract key numerical disclosures as **Label:** value pairs.
4. Preserve narrative context (dates, counterparty names, legal references).
5. If table-like content detected (| separators or column headers), return
   page_type_mismatch flag — orchestrator will re-route to table-page.md.
```

## Worked Examples (Vietnamese)

**Ví dụ 1 — Trang thuyết minh:**
```
OCR: "Tổng doanh thu thuần năm 2023 đạt 12.345.678 triệu VND, tăng 15% so với cùng kỳ.
Chi phí hoạt động kinh doanh là 5.678.901 triệu VND."
```
Output markdown:
```
Tổng doanh thu thuần năm 2023 đạt 12.345.678 triệu VND, tăng 15% so với cùng kỳ.

**Doanh thu thuần năm 2023:** 12.345.678 triệu VND (tăng 15%)
**Chi phí hoạt động kinh doanh:** 5.678.901 triệu VND
```

**Ví dụ 2 — Ghi chú kế toán:**
```
OCR: "2.3. Hàng tồn kho — xác định theo giá gốc, phương pháp bình quân gia quyền.
Dự phòng giảm giá tại 31/12/2023: 234.567 triệu VND."
```
Output:
```
**2.3. Hàng tồn kho** — xác định theo giá gốc, bình quân gia quyền.

**Dự phòng giảm giá hàng tồn kho (31/12/2023):** 234.567 triệu VND
```

**Ví dụ 3 — Phát hiện bảng ẩn (Table Mismatch):**
```
OCR chứa: "| Mã số | Chỉ tiêu |" → flags: ["page_type_mismatch"] → FAILED
```

## Steps

1. `get_bctc_page_text(report_id, page_number)` → `ocr_text`. Fail after 1 retry → return FAILED JSON → EXIT.
2. Scan `ocr_text` for table signals (`|` on multiple lines, `Mã số`, `Số cuối kỳ`). Detected → return `flags=["page_type_mismatch"]`, `confidence=0.0`, `status="FAILED"` → EXIT.
3. Extract numerical disclosures: for each number with context phrase → format as `**{label}:** {value}`.
4. Construct output: leading narrative paragraphs + `**label:** value` pairs + sub-section headers.
5. Confidence: default 0.85; garbled OCR (random symbols > 5%) → 0.5.

## RETURN (Task return value — NOT a file write)

Return the following JSON object as the Task return value.
**DO NOT write to docs/refine-output/ or any filesystem path.**
The orchestrator (main.md) collects this return value directly.

```json
{
  "unit_id": "<unit_id>",
  "page_numbers": [<N>],
  "markdown": "<prose markdown>",
  "row_count": 0,
  "confidence": 0.85,
  "flags": [],
  "status": "DONE"
}
```

FAILED return value (table mismatch or tool failure):
```json
{
  "unit_id": "<unit_id>",
  "page_numbers": [<N>],
  "markdown": "",
  "row_count": 0,
  "confidence": 0.0,
  "flags": ["page_type_mismatch"],
  "status": "FAILED"
}
```

Final response line (for orchestrator log):
```
STATUS: DONE | FAILED  |  UNIT_ID: <id>  |  PAGE: <N>
CONFIDENCE: <score>    |  FLAGS: <flags or none>
RETURN: JSON Task return value (no disk write)
NOTE: Text-only (no image fetched)
```
