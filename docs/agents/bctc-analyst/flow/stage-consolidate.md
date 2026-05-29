> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Stage: Consolidation

**Model:** sonnet (rank + synthesize across passes — synthesis task)
**Input:** `pass_1_result` through `pass_6_result` (session state from all 6 passes)

## Algorithm

### Step 1 — Collect

Load all six pass outputs from session state. Assert all 6 are present before proceeding.
If any pass was skipped (skipped_reason set): note the absence; continue with available passes.

### Step 2 — De-duplicate

Group findings by `trick_type` across all passes.
If the same `trick_type` appears in multiple passes:
- Merge into one finding: highest `confidence` wins; evidence lists combined (deduped by row_index/page_anchor/code)
- Record which passes detected it: "detected_by": ["balance-sheet-v1", "footnote-v1"]

### Step 3 — Rank

Sort all (de-duplicated) findings by:
1. `severity` DESC (high → medium → low)
2. `confidence` DESC (high → medium → low)
3. `pass_order` ASC (earliest pass first as tiebreaker — pass 1 before pass 6)

### Step 4 — Assign trick_confidence

Evaluate the consolidated findings list:
- `"high"` — ≥1 finding with `confidence=high` AND `len(evidence) ≥ 2`
- `"medium"` — findings are medium confidence OR high with single evidence item
- `"low"` — all findings are low confidence
- `"none"` — all 6 passes returned `pass_clean=true` (no findings anywhere)

### Step 5 — Write trick_summary

Compose 1–2 sentences in **Vietnamese prose** summarizing the top findings.
Rules:
- Plain Vietnamese (no Hán-Việt jargon, no σ/bp notation)
- Name the trick types in plain terms (e.g. "vốn hóa chi phí vận hành", "doanh thu ghi nhận sớm")
- If `trick_confidence=none`: write "Không phát hiện dấu hiệu bất thường trong kỳ này."

Example (high confidence): "FPT Q1-2026 có dấu hiệu vốn hóa chi phí (TSCĐ tăng 34% trong khi doanh thu giảm 38%) và sai lệch dòng tiền hoạt động so với lợi nhuận (OCF/NI = -1.15). Mức độ tin cậy cao — có bằng chứng từ 2 đường phân tích độc lập."

### Step 6 — Populate Signal Fields

Set in session state (to be merged into the TICKER's bctc_signal output):
```json
{
  "trick_summary": "...",
  "trick_confidence": "high | medium | low | none",
  "trick_pass_versions": ["balance-sheet-v1", "pl-v1", "cashflow-v1", "rpt-v1", "footnote-v1", "segment-v1"]
}
```

If any pass was skipped, remove its id from `trick_pass_versions`.

## Output

Session state variables: `trick_summary`, `trick_confidence`, `trick_pass_versions`
These are merged into the `bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` signal file
in `stage-log-notify.md` step 5 (after this consolidation completes).

No disk writes in this stage — all output goes to session state only.
