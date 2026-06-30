# BCTC Deep-Dive Handoff — HVN Q1-2026 (ESC-2)

- **Signal:** `deep_dive_result` → PO
- **From:** bctc-analyst (Opus deep-dive, flow `docs/agents/bctc-analyst/flow/deep-dive-opus.md`)
- **Dispatched by:** dev-team ESC-DISPATCH (cron tick 2026-06-30T22:37Z)
- **Persisted by:** dev-team dispatcher (deep-dive harness had no Bash; could not self-write the signal row — dispatcher persists on its behalf via `scripts/orch-apply.sh`)
- **Verdict:** `flag_for_human_review` — confidence 0.93
- **Severity:** HIGH

---

## Corrected root cause — NOT OCR, it is the REFINE stage

The original escalation hypothesis (CTG #2776 class — "OCR/Tesseract extraction failure, income statement not parsed") is **partially wrong and corrected here**. OCR text extraction **COMPLETED** (`text_status: COMPLETE`). The failure is in the downstream **REFINE** stage (`refine_status: PARTIAL`): only balance-sheet units were materialized; income-statement (B02-DN) and cash-flow (B03-DN) units were never produced, so they serve as all-zero.

## Evidence (all RAW-probed, production serving layer)

| Probe | Result |
|---|---|
| `get_bctc_full(HVN, Q1)` | Income statement ALL zero (revenue/gross/operating/EBITDA/net profit = 0, EPS = N/A); B/S = Assets 10,807,412.979 / Liab 9,939,070.525 / Equity 1,160,067.165; Cash = 0; `refine_status: PARTIAL`; `source_tier: 2` |
| `get_cash_flow(HVN, Q1, 2026)` | operating/investing/financing CF = 0, capex = 0, ocf_ni_ratio = null |
| `list_stored_pdfs` | `HVN_2026_Q1.pdf` present, 16.4 MB (largest in fleet — scanned/image-heavy) |
| `get_bctc_pending_refine` (fleet) | MBB, VCI, TCH, VIX, … all `text_status: COMPLETE` + `refine_status: PENDING` — refine stage backlogged fleet-wide |

## Reasoning

1. **Confirmed extraction failure, not real data.** An operating airline with >10,000 bn VND of assets cannot have exactly 0 revenue, 0 profit, 0 EPS, 0 operating cash flow, and 0 cash. True HVN quarterly revenue is ~26,000,000 mn VND and total assets ~57,000,000 mn VND; the captured 10.8 tn is ~1/5 of reality → severe under-capture.
2. **The 2.7% balance-sheet imbalance is SECONDARY.** L+E exceeds A by ~291,725 mn VND. Cash extracted as 0 (impossible) shows the asset side is under-captured; a complete asset side moves A toward L+E ≈ 11,099,138 and resolves the identity. The ESC-2 imbalance is a downstream symptom of incomplete extraction, not a genuine accounting discrepancy.
3. **Locus = REFINE stage.** `text_status: COMPLETE` = OCR finished. `refine_status: PARTIAL` for HVN = refine produced only balance-sheet units, never B02-DN / B03-DN. The whole Q1-2026 cohort sitting at `text_status: COMPLETE / refine_status: PENDING` corroborates a refine-stage bottleneck, not an OCR-stage one. (Two-pipelines trap avoided: read production serving value via `get_bctc_full`, which itself reports PARTIAL — not a wrong-pipeline 0-row artifact.)

## Bilingual deep_dive_verdict (VI primary / EN)

**VI:** HVN Q1-2026 KHONG phai du lieu that — day la loi trich xuat. Toan bo BCKQKD (doanh thu/loi nhuan/EPS) va LCTT (dong tien HDKD/dau tu/tai chinh) = 0, bat kha thi voi mot hang hang khong dang hoat dong co >10.000 ty tai san. Bang can doi chi trich duoc 3 chi tieu tong (TS 10.807 ty, No 9.939 ty, VCSH 1.160 ty) voi Tien mat=0. Sai lech can doi 2,7% (No+VCSH vuot TS ~292 ty) chi la HE QUA cua trich xuat thieu phia tai san, khong phai sai lech ke toan that. Nguyen nhan goc KHONG phai OCR (text_status=COMPLETE) ma o khau REFINE: refine_status=PARTIAL, chi tao unit bang can doi, chua tao unit B02-DN (BCKQKD) va B03-DN (LCTT). Ca doi bao cao Q1-2026 (MBB/VCI/TCH/VIX) deu text_status=COMPLETE nhung refine_status=PENDING — khau refine ton dong. KHONG dung cac so nay; gan co human-review va chay lai refine.

**EN:** HVN Q1-2026 is NOT real financials — it is an extraction failure. Income statement and cash-flow serve all-zero (impossible for an operating airline >10,000 bn VND assets); the balance sheet captured only 3 summary totals with Cash=0; the 2.7% B/S imbalance is a downstream symptom of incomplete asset-side capture. Root cause is NOT OCR (text_status=COMPLETE) but the REFINE stage: refine_status=PARTIAL produced balance-sheet units only, never income (B02-DN) or cash-flow (B03-DN) units. The whole Q1-2026 cohort sits at text_status=COMPLETE/refine_status=PENDING — refine is backlogged. Do NOT use these numbers; flag for human review and re-run refine.

## Failing pipeline component (for PO → dev-pdf-extractor)

**Primary: the BCTC REFINE pipeline** — `refine_bctc_md → bctc_refined_units → finalize_bctc_refine`. Durable markers: `refine_status=PARTIAL` (HVN) and `refine_status=PENDING` fleet-wide while `text_status=COMPLETE`. The refine stage did not materialize income (B02-DN) / cash-flow (B03-DN) units.

**One-query disambiguation dev should run FIRST** (dev has direct DB + UUID access the gateway harness lacked): check HVN's per-page OCR char-count for the income-statement and cash-flow pages.
- If those pages have OCR text but no refined units → **refine-stage bug** (units not produced from completed text). Fix: re-run/repair refine + `finalize_bctc_refine` for HVN, and clear the fleet refine backlog.
- If those pages have ~0 OCR chars → alternate is an **OCR page-window gap** on the 16.4 MB scanned PDF: `locate_balance_sheet_pages()` / `_MAX_BS_PAGES=8` cap in `apps/pdf-extractor/infrastructure/text_table_extractor.py` never reaching the later statement pages. (Lower probability given fleet-wide `text_status=COMPLETE`, but cheap to rule out.)

Either branch routes to **dev-pdf-extractor**. Immediate data remediation: re-run refine for HVN Q1-2026, then re-validate the accounting identity. Data is currently unusable for analysis.

## Recommended actions (for PO triage)

1. Route the REFINE-pipeline fix to **dev-pdf-extractor** (primary hypothesis; run the disambiguation query above first).
2. Mark HVN Q1-2026 data as unusable / flag_for_human_review until refine is re-run and the identity re-validates.
3. Consider scope: the fix likely clears the **fleet-wide** Q1-2026 refine backlog (MBB/VCI/TCH/VIX/…), not just HVN.

## SECONDARY bug (separate, independent of HVN)

`get_bctc_ocf(HVN, 2026, 1)` fails with `no such column: ocf_operating` — a SQL/schema bug in the `get_bctc_ocf` MCP tool itself, breaking the OCF forensic gate for ALL tickers. Worth a separate low-priority dev ticket. (Optional — PO's call whether to mint.)

## References

- Flow executed: `docs/agents/bctc-analyst/flow/deep-dive-opus.md`
- Extraction runbook (refine/OCR chain + key files): `docs/protocols/bctc-extraction-runbook.md`
- Two-pipelines reference: memory `project_bctc_two_extraction_pipelines.md`
- Table-parser source (alternate-hypothesis component): `apps/pdf-extractor/infrastructure/text_table_extractor.py`
- Idempotency guard: `esc-deepdive:HVN:Q1-2026:ESC-2` (held by originating bctc-analyst routine session, TTL 86400s → auto-expires; dedups re-escalation within 24h — intentionally NOT released early)
