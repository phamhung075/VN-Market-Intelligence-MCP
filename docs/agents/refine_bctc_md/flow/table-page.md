---
agent:
  id: refine_bctc_md
  model: claude-haiku-3-5
  authored_by: claude-opus-4
  description: Sub-flow A — One table-dense BCTC page → trusted pipe-table markdown.
  tools: [get_bctc_page_text, get_bctc_page_image]
---

# Refine BCTC — Sub-Flow A: Table Page

## REFINE CONTRACT — MANDATORY (system prompt; send once, cached)

```
1. Numbers ← OCR text (get_bctc_page_text). Source of record.
2. Structure / column boundaries / row labels ← image (get_bctc_page_image).
3. Text ≠ image on a number: FLAG immediately. NEVER silently pick one.
   - High discrepancy or unsure: [ĐỘ TIN CẬY THẤP — {specific reason}]
   - Minor discrepancy, text chosen: [độ tin cậy thấp]
4. Balance check (assets = liab + equity) is catch-net ONLY. Passing balance does NOT clear a flagged number.
```

Output header: `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |` / `|---|---|---|---|`
VN number convention: `.` = thousands sep, `,` = decimal. Trust flags go into the value cell.

## Worked Examples (Vietnamese)

**Ví dụ 1 — Nhất trí (Agreement):**
```
OCR "Số cuối kỳ": "1.234.567" | Image: "1 234 567" → nhất trí
```
`| 110 | Tiền và tương đương tiền | 1.234.567 | 1.000.000 |`

**Ví dụ 2 — Bất đồng lớn (Red Flag):**
```
OCR: "1.234.567" | Image: "1.345.678" → bất đồng ở hàng trăm nghìn
```
`| 110 | Tiền và tương đương tiền | [ĐỘ TIN CẬY THẤP — OCR 1234567 vs image 1345678] | 1.000.000 |`

**Ví dụ 3 — Bất đồng nhỏ, chọn OCR (Yellow Flag):**
```
OCR: "123.456,5" | Image: "123.456,6" (chữ số cuối mờ) → sai lệch nhỏ
```
`| 120 | Phải thu ngắn hạn | [độ tin cậy thấp] 123.456,5 | 98.000,0 |`

**Ví dụ 4 — Balance:**
```
Tài sản 5.000.000 = Nợ 3.000.000 + Vốn 2.000.000 ✓ → flag: "balance_check:PASSED"
Balance PASSED không xóa cờ đỏ đã ghi. Cờ vẫn giữ nguyên.
```

## Steps

1. `get_bctc_page_text(report_id, page_number)` → `ocr_text`. Fail after 1 retry → FAILED output → EXIT.
2. `get_bctc_page_image(report_id, pages=[page_number])` → `page_image`. Fail → proceed text-only, flag `["image_unavailable"]`, confidence ≤ 0.6.
3. Read structure from image (column boundaries, row labels, account codes). If continuation marker detected (`tiếp theo`/`continued`) → flag `["wrong_subflow:use_continuation-stitch"]` → FAILED → EXIT.
4. For each numeric cell: OCR value vs. image value → apply contract (agree/red-flag/yellow-flag).
5. Construct pipe-table (one header, one row per BCTC line item, flags in value cells).
6. Balance check if balance-sheet page → record `balance_check:PASSED|FAILED|N/A` in flags.
7. Confidence: start 1.0; red flag −0.15; yellow flag −0.05; min 0.1.
8. Write `docs/refine-output/{report_id}/{unit_id}.json` via `Write` tool.

```json
{ "unit_id":"<unit_id>", "page_numbers":[<N>], "markdown":"<pipe-table>",
  "confidence":<0.0-1.0>, "flags":[], "status":"DONE" }
```

## RETURN
```
STATUS: DONE | FAILED  |  UNIT_ID: <id>  |  PAGE: <N>
CONFIDENCE: <score>    |  FLAGS: <flags or none>
OUTPUT: docs/refine-output/{report_id}/{unit_id}.json
```
