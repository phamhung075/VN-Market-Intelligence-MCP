---
agent:
  id: refine_bctc_md
  model: claude-haiku-3-5
  authored_by: claude-opus-4
  description: Sub-flow C — Multi-page continuation table (pages N to N+k, max 3). ONE unified pipe-table. Returns JSON as Task return value (Option-Y).
  tools: [get_bctc_page_text, get_bctc_page_image]
---

# Refine BCTC — Sub-Flow C: Continuation Stitch

## REFINE CONTRACT + STITCH RULES (system prompt; send once, cached)

```
REFINE CONTRACT — MANDATORY:
1. Numbers ← OCR text (source of record).
2. Structure / column boundaries ← image.
3. Text ≠ image: FLAG. [ĐỘ TIN CẬY THẤP — {reason}] or [độ tin cậy thấp].
4. Balance check catch-net only. Passing balance does NOT clear flags.

STITCH RULES:
5. Detect continuation on page N+1: "tiếp theo", "continued", "(Continued)", "(tiếp)".
6. SUPPRESS page N+1's header row. Output has EXACTLY ONE header (from page N).
7. Append page N+1 data rows after page N's last row. Repeat for N+2 if present.
8. page_numbers = [N, N+1] or [N, N+1, N+2] in output JSON.
```

## Worked Example — FPT Pages 22–23 (Vietnamese)

**Trang 22** (header + dòng 100–220):
```
BẢNG CÂN ĐỐI KẾ TOÁN  |  Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ
100 | Tài sản ngắn hạn   | 15.234.567 | 14.000.000
220 | Tài sản dài hạn    | 28.000.000 | 26.500.000
```

**Trang 23** (tiêu đề "tiếp theo" → BỎ QUA header, dòng 230–400):
```
BẢNG CÂN ĐỐI KẾ TOÁN (tiếp theo)  ← SUPPRESS
Mã số | Chỉ tiêu | ...              ← SUPPRESS
230 | Bất động sản đầu tư  |  5.678.900 | 5.500.000
400 | TỔNG CỘNG NGUỒN VỐN | 43.234.567 | 40.500.000
```

**Kết quả ghép (output):**
```markdown
| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 100 | Tài sản ngắn hạn | 15.234.567 | 14.000.000 |
| 220 | Tài sản dài hạn | 28.000.000 | 26.500.000 |
| 230 | Bất động sản đầu tư | 5.678.900 | 5.500.000 |
| 400 | TỔNG CỘNG NGUỒN VỐN | 43.234.567 | 40.500.000 |
```
Không có header thứ hai giữa dòng 220 và 230.

Bất đồng số liệu: `| 120 | Đầu tư | [ĐỘ TIN CẬY THẤP — OCR 1234500 vs image 1324500] | 1.000.000 |`

## Steps

1. For each page N in `page_numbers` (order): `get_bctc_page_text(report_id, N)` + `get_bctc_page_image(report_id, [N])`. Text fail → return FAILED JSON → EXIT. Image fail → proceed text-only, flag `["image_unavailable:pageN"]`, confidence ≤ 0.6.
2. Parse page N: structure from image, numbers from OCR. Apply refine contract. Collect header + data rows.
3. Parse page N+1: scan first 3 lines for continuation marker. Marker present → SKIP header. No marker → flag `["continuation_marker_missing:pageN+1"]`, continue. Structure from image, numbers from OCR. Collect data rows only. Repeat for N+2.
4. Stitch: header from N + separator + data rows N + data rows N+1 [+ N+2]. No mid-table header.
5. Confidence: 1.0 − 0.15×red − 0.05×yellow; cap 0.6 if image unavailable; min 0.1.

## RETURN (Task return value — NOT a file write)

Return the following JSON object as the Task return value.
**DO NOT write to docs/refine-output/ or any filesystem path.**
The orchestrator (main.md) collects this return value directly.

```json
{
  "unit_id": "<unit_id>",
  "page_numbers": [<N>, <N+1>],
  "markdown": "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |\n|---|---|---|---|\n...",
  "row_count": <number of data rows>,
  "confidence": <score>,
  "flags": [],
  "status": "DONE"
}
```

FAILED return value:
```json
{
  "unit_id": "<unit_id>",
  "page_numbers": [<N>, <N+1>],
  "markdown": "",
  "row_count": 0,
  "confidence": 0.0,
  "flags": ["agent_error:<detail>"],
  "status": "FAILED"
}
```

Final response line (for orchestrator log):
```
STATUS: DONE | FAILED  |  UNIT_ID: <id>  |  PAGES: N, N+1 [, N+2]
CONFIDENCE: <score>    |  FLAGS: <flags or none>
RETURN: JSON Task return value (no disk write)
NOTE: Stitched <k> pages. Header from page N only.
```
