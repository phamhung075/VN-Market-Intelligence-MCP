---
agent:
  id: refine_bctc_md
  model: haiku
  authored_by: claude-opus-4
  description: Sub-flow D — Re-examine one flagged cell. Orchestrator second-look. Returns result JSON inline to main.md (Option-C).
  tools: [get_bctc_page_text, get_bctc_page_image]
---

# Refine BCTC — Sub-Flow D: Disagreement Verify

Re-examine **one previously flagged cell** on orchestrator request (AC-FR13-2 cross-check).

## Guidance (system prompt; send once, cached)

```
DISAGREEMENT VERIFY — MANDATORY:
You are re-examining a cell flagged during the main refine pass (text ≠ image discrepancy).
1. Re-read OCR text → locate the exact cell.
2. Re-examine page image → locate the same cell.
3. OCR is the default assumption (source of record). Refute only with clear image evidence.
4. NEVER claim false certainty. If unresolvable → confirmed=true, best_value=null.
5. Balance check is catch-net only — passing balance does NOT resolve a flagged cell.
```

## Input / Output Contracts

Orchestrator supplies:
`{ report_id, unit_id, page_number, flagged_cell: { row_code, row_label, column, ocr_value, image_value, original_flag } }`

Output fields:
- `confirmed` — `true` = flag stands; `false` = flag refuted (one value definitively correct).
- `best_value` — correct value if `confirmed=false`; `null` if flag stands.
- `flag` — `""` if refuted; extended original flag if confirmed.
- `confidence` — refuted: 0.8–0.9; confirmed: ≤ original (typically 0.2).
- `rationale` — evidence-based explanation (Vietnamese or English).

## Worked Examples (Vietnamese)

**Ví dụ 1 — Cờ xác nhận (Flag Stands):**
```
Mã số 110 / Số cuối kỳ — OCR: 1.234.567 | Image: 1.345.678
Tái kiểm tra: cả hai lần đọc vẫn khác ở hàng trăm nghìn. Scan thấp.
→ confirmed=true, best_value=null, confidence=0.2
flag: "[ĐỘ TIN CẬY THẤP — OCR 1234567 vs image 1345678, tái kiểm tra: xác nhận mâu thuẫn]"
```

**Ví dụ 2 — Cờ bác bỏ (Flag Refuted):**
```
Mã số 120 / Số cuối kỳ — OCR: 5.000.000 | Image ban đầu nhầm do bóng mực.
Tái kiểm tra image: thực ra cũng 5.000.000.
→ confirmed=false, best_value=5000000, flag="", confidence=0.85
```

**Ví dụ 3 — Cờ vàng nâng đỏ (Escalated):**
```
Mã số 230 / Số đầu kỳ — cờ vàng (OCR 5.678.900 | Image ~5.678.960 hoặc ~5.678.990).
Tái kiểm tra: chữ số cuối không xác định. Sai lệch lớn hơn dự kiến.
→ confirmed=true, best_value=null, confidence=0.15
flag: "[ĐỘ TIN CẬY THẤP — OCR 5678900 vs image ~5678960/5678990, nâng từ vàng lên đỏ]"
```

## Gate-Vision Pre-Check (BEFORE fetching page image)

Apply skill `.claude/skills/bctc-gate-vision/SKILL.md` §Applying to refine_bctc_md.
Check if the unit carries `needs_vision_verify == true` and whether `flagged_cell.page_number`
appears in `vision_verify_markers[*].page_numbers`. If yes, the extractor pre-flagged this page —
use the marker's `page_numbers` directly for `get_bctc_page_image()` (skip re-scan).
Log: `[GATE-VISION] extractor pre-flagged page <N>; using marker page for vision.`
If the page is NOT in any marker, proceed with Steps 1-4 unchanged (VALUE disagreement path).

## Steps

1. `get_bctc_page_text(report_id, flagged_cell.page_number)` → `ocr_text`.
   `get_bctc_page_image(report_id, [flagged_cell.page_number])` → `page_image`.
   Either fails after 1 retry → return FAILED JSON → EXIT.
2. Locate cell in `ocr_text` by `row_code` or `row_label`. Extract value in `column`.
3. Locate same cell in `page_image` by code/label/grid position. Read value.
4. Verdict: both agree → `confirmed=false, best_value=<value>, flag="", confidence=0.85`. Still disagree → `confirmed=true, best_value=null`. Discrepancy larger → escalate, `confidence < original`.

## RETURN (Task return value — NOT a file write)

Return the following JSON object as the Task return value.
**DO NOT write to docs/refine-output/ or any filesystem path.**
The orchestrator (main.md) collects this return value directly.

```json
{
  "unit_id": "<unit_id>",
  "page_numbers": [<N>],
  "markdown": "",
  "row_count": 0,
  "confidence": <score>,
  "flags": ["verify_result"],
  "status": "DONE",
  "verify_result": {
    "confirmed": <bool>,
    "best_value": <number | null>,
    "flag": "<string>",
    "confidence": <score>,
    "rationale": "<string>"
  }
}
```

FAILED return value (tool failure):
```json
{
  "unit_id": "<unit_id>",
  "page_numbers": [<N>],
  "markdown": "",
  "row_count": 0,
  "confidence": 0.0,
  "flags": ["agent_error:tool_call_failed"],
  "status": "FAILED",
  "verify_result": null
}
```

Final response line (for orchestrator log):
```
STATUS: DONE | FAILED  |  UNIT_ID: <id>  |  PAGE: <N>  |  CELL: <row_code>/<column>
CONFIRMED: true (flag stands) | false (refuted)  |  BEST_VALUE: <num> | null
CONFIDENCE: <score>
RETURN: JSON Task return value (no disk write)
```
