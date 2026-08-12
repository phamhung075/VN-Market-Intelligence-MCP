---
agent:
  id: refine_bctc_md
  model: haiku
  authored_by: claude-opus-4
  description: Sub-flow C — Multi-page continuation table (pages N to N+k, max 3). ONE unified pipe-table. Read and applied inline by main.md's Phase 2 loop (Option-C, same execution context — not a separate return).
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

## Truncation-Tail Windows (informational — no new step required)

Some windows dispatched here exist because a much longer continuation table exceeded
`maxWindowPages` and got split (`windows[].truncated_continuation === true` when the server
surfaces it). For such a window, Step 2's "collect header" may legitimately find NOTHING on
page N — that is expected, not an error; page N is itself a truncated mid-table continuation,
not the table's true first page. Do not fabricate a header. Proceed straight to data-row
collection (same as any window whose first page has no header line). The server-side parser
(`finalize_bctc_refine`) already recovers the correct code/label column order for these rows by
inheriting it from the true head window automatically — you do not need to fetch, guess, or
backfill it. Optional: add flag `truncation_tail_no_own_header` when this occurs, for triage
visibility only (does not affect confidence scoring).

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

## RESULT SHAPE (values you build inline — NOT a file write; nothing returns them to you)

You (the leaf worker, inside main.md's Phase 2 loop) construct these fields directly in your own
reasoning while processing this window — nothing "returns" them to you and there is no separate
agent collecting them. Use them straight away as the `push_bctc_refined_unit` call arguments
(`markdown`, `confidence`, `flags`, `window_status`).
**DO NOT write to docs/refine-output/ or any filesystem path.**

DONE shape:
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

FAILED shape:
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

Log line (this fire's session log only — not a return value):
```
STATUS: DONE | FAILED  |  UNIT_ID: <id>  |  PAGES: N, N+1 [, N+2]
CONFIDENCE: <score>    |  FLAGS: <flags or none>
NOTE: Stitched <k> pages. Header from page N only.
```
