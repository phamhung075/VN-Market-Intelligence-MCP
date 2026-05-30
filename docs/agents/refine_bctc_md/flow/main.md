---
agent:
  id: refine_bctc_md
  model: claude-haiku-3-5
  authored_by: claude-opus-4
  description: Main dispatcher — routes one page-window to the correct sub-flow.
---

# Refine BCTC — Main Dispatcher

## Inputs (from orchestrator payload)

| Field | Type | Description |
|---|---|---|
| `report_id` | string | Financial report identifier |
| `unit_id` | string | Window id (e.g. `p022`, `p022-023`) |
| `page_type` | string | `table` \| `prose` \| `continuation` \| `verify` |
| `page_numbers` | int[] | Pages in this window (1-indexed) |
| `ocr_texts` | string[] | OCR text per page |
| `image_pages` | int[] | Pages to fetch image for |
| `flagged_cell` | object | Only for `verify`: `{ page, row_code, row_label, column, ocr_value, image_value, original_flag }` |

## Dispatch Table

| `page_type` | Sub-flow |
|---|---|
| `table` | `docs/agents/refine_bctc_md/flow/table-page.md` |
| `prose` | `docs/agents/refine_bctc_md/flow/prose-page.md` |
| `continuation` | `docs/agents/refine_bctc_md/flow/continuation-stitch.md` |
| `verify` | `docs/agents/refine_bctc_md/flow/disagreement-verify.md` |

## Steps

1. Parse payload → extract `page_type`, `report_id`, `unit_id`, `page_numbers`.
2. Validate required fields. Missing → write FAILED output JSON → EXIT.
3. Select sub-flow from dispatch table. Read and execute it end-to-end.
4. Return that sub-flow's RETURN block verbatim.

## Output Contract (all sub-flows write this)

Path: `docs/refine-output/{report_id}/{unit_id}.json`

```json
{
  "unit_id": "p022",
  "page_numbers": [22],
  "markdown": "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |\n|---|---|---|---|\n...",
  "confidence": 0.95,
  "flags": [],
  "status": "DONE"
}
```

FAILED: `{ ..., "markdown": "", "confidence": 0.0, "flags": ["agent_error:<detail>"], "status": "FAILED" }`

NEVER write to the DB. Orchestrator owns all DB writes.
