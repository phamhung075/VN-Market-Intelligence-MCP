# BCTC Table Extraction — Research Brief

> **Type:** Research-only decision brief (no code changes). Next step: PO turns the recommendation into a build sprint.
> **Author:** report-analyzer (research agent)
> **Date:** 2026-05-24
> **Goal (user's words):** *"BCTC can extract correct RESULT TABLES for analysis."*
> **Scope:** Survey 2024–2026 table-structure-recognition (TSR) + cell-extraction approaches for scanned/financial PDFs; recommend one; design an image-vs-text cross-check experiment using the 14 real BCTC docs already in the system.

<!-- size-justification: research brief; completeness over brevity is explicitly authorized by the task. Single-file deliverable per task constraint. -->

---

## 1. Executive Summary

The current pipeline (`pdfplumber` + Tesseract OCR + regex `field_extractor`) extracts **free text** acceptably but has **no table-structure model**. BCTC result figures live inside multi-column tables (consolidated vs parent-company; current-quarter vs YTD vs prior-period; merged header cells). The regex extractor (`field_extractor/primitive.py`) finds a Vietnamese label line, then grabs **the first numeric token within the next 5 lines** — it has no concept of *which column* that number belongs to. That is the structural root cause behind the wrong-figure class, and the decimal-shift bug (VNM `net_profit=0.000051`, DHG `rev=0.000009`) is a symptom: a Vietnamese-formatted number (`.` = thousands separator, `,` = decimal) is misparsed because the value is read out of column context and through Python `float()`, which treats `.` as a decimal point.

**No single tool solves both halves.** Table extraction is two problems: (a) **structure** — find cells, rows, columns, spanning headers; (b) **content** — read the Vietnamese text/numbers in each cell. The winning designs in 2024–2026 either combine a structure model + an OCR engine, or use a document vision-language model (VLM) that does both end-to-end.

**RECOMMENDED OPTION → a two-track design:**

1. **Primary extractor: PaddleOCR PP-StructureV3** (layout + table-structure + Vietnamese-capable OCR, CPU-friendly, self-hosted, free) running **on the main server** as an infrastructure adapter that emits structured HTML/JSON tables. This replaces the blind regex with column-aware cell extraction and keeps financial PDFs fully self-hosted (no third-party data exposure).
2. **Cross-check / confidence gate: an image-rendered VLM pass** — render each result-table page to an image and ask **Claude vision (Sonnet 4.x) via API** (or Gemini 2.5 Pro) for the same figures, **only on pages flagged low-confidence or on a sampled audit set**. Disagreement >10× magnitude = decimal-shift signal → block insert / raise to WORK channel. This is the exact "image flow vs extracted-text flow" comparison the user asked for, and it would have caught the VNM/DHG bugs at write time.

The Phase 0 spike (Section 7) runs **PP-StructureV3, PaddleOCR-VL-0.9B, and one API VLM** against the 14-doc gold-set, scored by **TEDS + figure-level accuracy**, then PO picks the production winner from measured numbers rather than from this brief's prior.

**Why not "just call an API for everything":** these are financial documents; cost and privacy matter (Section 6, Section 8). A self-hosted structure model is the durable backbone; the API is a high-value spot-check, not the hot path.

**Why not "run a big VLM locally on the Mac":** the local machine is a 2018 Intel MacBook Pro (no Apple Silicon, no CUDA, AMD 4 GB Metal that PyTorch barely uses). A 7B+ vision-LLM there is too slow for production. The Mac is a **dev/eval box**, not a runtime target (Section 5).

---

## 2. How the current pipeline works, and exactly where tables break

**Files read:**
- `apps/pdf-extractor/infrastructure/extraction_engine.py` — `PdfplumberExtractionEngine`. `extract_tables()` calls `pdfplumber.page.extract_tables()` (line-based heuristics on native-PDF vector lines). `extract_text_ocr()` falls back to Tesseract (`lang="vie+eng"`, `resolution=200`) when a page has <50 chars of native text.
- `apps/pdf-extractor/domain/primitives/field_extractor/primitive.py` — regex label match (`doanh\s+thu\s+thu[ầa]n`, etc.), then **first numeric token in the next ≤5 lines** via `_NUMERIC_PATTERN`.
- `apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py` — `float(stripped)` then `× multiplier` keyed on a `unit_hint` ("billion_vnd" / "raw_micro"). **The `.`/`,` Vietnamese format is not handled here** — a string like `"1.234,5"` (1,234.5) either throws `ValueError` or parses as `1.234`.
- `apps/pdf-extractor/domain/modules/financial_reports/module.py` — composes the 6 primitives.
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — `isDecimalShiftAnomaly(ocr, apiBridge)` already implements the **>10× magnitude divergence** check between OCR figure and an API-bridge value. This is the seed of the cross-check gate we want to generalize.

**Failure chain for tables:**

| Failure | Cause | Evidence |
|---|---|---|
| Wrong column picked | `field_extractor` takes the *first* number after a label; no column model. A BCTC income row has 4+ numbers (Q current, Q prior, YTD current, YTD prior; consolidated vs parent). | `field_extractor/primitive.py` L111–121 |
| Scanned tables = empty | `pdfplumber.extract_tables()` relies on vector ruling lines; **scanned BCTC pages are images** with no vector lines → returns `[]`. | `extraction_engine.py` L42–44 |
| Decimal shift | Vietnamese `1.234.567,89` parsed by `float()`; `,` decimal and `.` thousands not normalized → micro/over-scaled values. | `decimal_normalizer/primitive.py` L60; VNM/DHG cases in docstring L9–13 |
| Merged headers lost | "Quý này / Lũy kế từ đầu năm" spanning headers collapse to flat text; no row/col span recovery. | inherent to text-line extraction |
| OCR diacritic errors | Tesseract `vie` drops/mangles tone marks → label regex misses → field returns `None` or matches wrong line. | known Tesseract Vietnamese limitation [9][10] |

**Conclusion:** the gap is **table-structure recognition + Vietnamese cell OCR + Vietnamese number normalization**, not "better free-text OCR."

---

## 3. Option survey — open-source / self-hostable (structure + content)

All "local-Mac-feasible" judgments assume the 2018 Intel i7 / 16 GB / AMD 4 GB / no-CUDA box described in the task. "Main-server-feasible" assumes Docker with tunable RAM; **GPU presence on the main server is unknown and is an open question (Section 8).**

### 3.1 Microsoft Table Transformer (TATR, DETR-based)
- **What:** Object-detection model for table **detection + structure** (rows/cols/spanning cells). Outputs cell grid; **needs a separate OCR/text source** to fill cell text. [1][2][3]
- **Accuracy:** ICDAR-2013 exact-match ~**81%** (PubTables-1M + FinTabNet combined, after annotation cleanup); **65%** FinTabNet-only — i.e. financial tables are its *weaker* domain unless fine-tuned. [1][8]
- **Vietnamese:** N/A for text (structure-only); Vietnamese handled by whatever OCR you pair (Tesseract `vie` / PaddleOCR).
- **CPU/GPU:** Supports CPU inference explicitly [8]. DETR on CPU is **slow** (multiple seconds/page on the Intel Mac; tolerable on a beefy server CPU). [8]
- **Local-Mac:** Feasible for eval, slow for production. **Main-server:** Feasible (CPU OK; GPU faster).
- **Burden:** Medium — two-stage pipeline (TATR structure + OCR + your own cell-text alignment). You own the glue.
- **Verdict:** Strong **structure** engine, but FinTabNet weakness + you must bolt on Vietnamese OCR + cell alignment. More integration than PP-Structure.

### 3.2 PaddleOCR PP-StructureV3  ★ recommended primary
- **What:** End-to-end pipeline: layout detection + **table structure** + OCR (text) → structured HTML/JSON. One toolkit does structure **and** content. [4][5][6]
- **Accuracy:** PP-StructureV3 reaches OmniDocBench edit distances **0.145 (EN) / 0.206 (ZH)**, reported to **match Gemini-2.5-Pro-class accuracy at <100M params**; the PaddleOCR-VL line hits Table **TEDS 0.9543**. [4][6]
- **Vietnamese:** PaddleOCR supports 100+ languages incl. Vietnamese; described as the **"CPU-friendly accuracy middle ground"** and the best non-torch Asian-script option. Vietnamese accuracy is improvable via fine-tune (PaddleOCRv5 exact acc 37.5%→50.0% on noisy images after fine-tuning — i.e. baseline is usable, fine-tune is a known lever). [7][9][11]
- **CPU/GPU:** Runs well on **CPU**; GPU/MPS gives 10–20× speedup. [11][7]
- **Local-Mac:** Feasible (CPU; no torch dependency = lighter than Surya/Marker). **Main-server:** Feasible and recommended runtime.
- **Burden:** Medium-low — single toolkit, mature, structured output out of the box.
- **Verdict:** **Best self-hosted backbone** for this system: structure + Vietnamese content + CPU-friendly + free + structured JSON. Keeps financial PDFs in-house.

### 3.3 Surya (datalab) + Marker
- **What:** Surya = detection/layout/reading-order/**table-rec** OCR in 90+ languages; Marker = full PDF→Markdown/JSON/HTML pipeline built on Surya. [12]
- **Accuracy:** Strong on layout-heavy docs; Marker is the "safest default" general tool per 2026 round-ups. [12]
- **Vietnamese:** 90+ languages (Vietnamese included); less battle-tested on Vietnamese than PaddleOCR.
- **CPU/GPU:** Torch-based; supports CPU **and Apple MPS** — but MPS on the AMD 2018 Mac is weak/unreliable, so effectively CPU-bound and **heavy** (pulls torch + multi-GB models). [12]
- **Local-Mac:** Marginal (slow, heavy). **Main-server:** Feasible (better with GPU).
- **Verdict:** Good alternative if PP-Structure's Vietnamese quality disappoints; heavier footprint. Keep as a Phase-0 backup candidate.

### 3.4 IBM docling
- **What:** Production RAG-oriented parser → `DoclingDocument` preserving semantic hierarchy (tables, headers). Often paired with Surya for vision. [12]
- **Vietnamese:** depends on the OCR backend it's configured with.
- **Verdict:** Excellent **orchestration/schema** layer, not a TSR model itself. Consider as the *output-normalization* layer over whichever TSR engine wins. Not the core extractor.

### 3.5 img2table / Camelot / Tabula
- **What:** img2table = lightweight OpenCV table detection + your OCR; Camelot/Tabula = **digital-PDF-only** (vector lines).
- **Vietnamese:** via paired OCR (img2table) / N/A.
- **Verdict:** Camelot/Tabula are essentially what `pdfplumber.extract_tables()` already does — **useless on scanned BCTC**. img2table is a lighter-weight fallback but inferior to PP-Structure. **Drop.**

### 3.6 PaddleOCR-VL-0.9B (compact document VLM)  ★ recommended local/eval candidate
- **What:** 0.9B VLM (NaViT visual encoder + ERNIE-4.5-0.3B), end-to-end multilingual document parsing: text, **tables**, formulas, charts. Released 2025-10-16. [13][14][15]
- **Accuracy:** Table **TEDS 92.14** (Chinese); SOTA-class for its size; runs on vLLM/transformers. [13][14]
- **Vietnamese:** **One of 109 supported languages** — explicitly multilingual. [14][15]
- **CPU/GPU:** "fast inference, low resource consumption," "suitable where compute is limited" — a 0.9B model is the **only VLM class plausibly runnable on the Intel Mac CPU** (still slow per-page, but feasible for an eval set; not for production throughput). [13][15]
- **Local-Mac:** Feasible for eval only (CPU, slow). **Main-server:** Feasible; the best self-hosted VLM option here.
- **Verdict:** Best **self-hosted VLM** bridge between classical TSR and big API VLMs. Strong Phase-0 candidate; could become the production cross-check engine if API privacy is rejected (Section 8).

---

## 4. Option survey — hosted / API (structure + content, end-to-end)

These send the PDF/page-image to a third party — **data-privacy gate applies** (Section 6, Section 8).

### 4.1 Claude vision (Sonnet 4.x / Opus 4.x) — recommended cross-check engine
- **Table accuracy:** In an independent image-table extraction eval, **Claude Sonnet 4 scored 9.5/10**, tied with Gemini 2.5 Pro as the standout pair; Claude Sonnet 4.5 ~85% on printed media. (Note: that eval showed *Opus 4.1* underperforming Sonnet 4 at raw table extraction — prefer **Sonnet 4.x** for the extraction call.) [16][17]
- **Vietnamese + numbers:** Strong multilingual + reliable JSON-structured output / instruction following. [16]
- **Structured output:** Native — ask for JSON `{row_label, period, value}`. 
- **Cost:** Per-token (image tokens + output); roughly higher per page than dedicated OCR APIs but used *sparingly* (low-confidence + audit sample) the cost is small.
- **Latency:** Seconds/page (API).
- **Privacy:** **API inputs are NOT used for training** under Commercial/API terms; **7-day** retention (post-2025-09-14), zero-retention available for qualifying use. Best-in-class for sending financial docs to an API. [18]
- **Verdict:** **Best cross-check VLM** — accuracy + the strongest API data-handling posture for financial documents.

### 4.2 Gemini 2.5 Pro
- **Table accuracy:** **9.5/10**, tied best with Claude Sonnet 4; 85% printed / 93% handwriting. [16][17]
- **Privacy:** Paid API not used for training (Vertex/AI Studio paid tiers); confirm tier terms.
- **Verdict:** Co-best on accuracy; viable alternative cross-check engine. Pick per privacy/cost terms in Section 8.

### 4.3 Mistral OCR 3
- **Table accuracy:** **96.6% on tables** (vs Textract 84.8%); dedicated document-parsing model. [19][20]
- **Cost:** **$2 / 1,000 pages** ($1/1k batch) — ~**97% cheaper** than Textract for forms+tables. The cheapest high-accuracy option by far. [19][20]
- **Vietnamese:** multilingual OCR; validate Vietnamese diacritics in the spike.
- **Privacy:** **No documented SOC2/HIPAA/FedRAMP, no published SLA** — weaker compliance posture; flag for the financial-data privacy decision. [19]
- **Verdict:** If a hosted *bulk* extractor is acceptable, Mistral OCR 3 is the cost/accuracy leader. Privacy posture is the catch for financial docs.

### 4.4 GPT-4o / document-AI APIs (Google Document AI, Azure Document Intelligence, AWS Textract, LlamaParse, Reducto, Unstructured.io API)
- **GPT-4o:** Capable but **weaker on multi-column tables / lateral reading** than Claude/Gemini per the comparison. [16]
- **Cost (forms+tables):** AWS Textract **~$65/1k**, Google Document AI **$30–45/1k**, Azure Form Recognizer **~$1.50/1k basic**. [19]
- **Verdict:** Document-AI suites are mature and offer custom training (Azure/AWS), but cost 15–30× Mistral and add vendor lock-in. **Not recommended as the hot path** for a single-user system; Azure/AWS only if an enterprise compliance requirement appears.

---

## 5. Hardware feasibility — honest per-target verdict

| Target | Spec | Realistic role |
|---|---|---|
| **Local Mac** | 2018 MBP, Intel i7-9750H (6c), 16 GB, AMD Radeon Pro 555X 4 GB + Intel UHD 630, no Apple Silicon, no CUDA, weak Metal/MPS | **Dev + eval only.** Tesseract/PaddleOCR-CPU run fine for the 14-doc gold-set. A 0.9B VLM is the *largest* model that's tolerable here (slow). 7B+ VLM = too slow for production. **Never the runtime.** |
| **Main server** | Docker, tunable RAM, headless browsers allowed; **GPU unknown** | **Production runtime** for the self-hosted extractor (PP-StructureV3 / PaddleOCR-VL). CPU is acceptable for PP-Structure; a GPU would 10–20× it [11]. **Confirm GPU before sizing.** |
| **Vinahost VPS** | Vietnam, lightweight HTTP only, no headless, geo-proxy | **Not an inference target.** Keep its role as the BCTC-PDF source proxy (`/bctc-files/`) only. |
| **External API** | Claude / Gemini / Mistral | **Cross-check + audit sampling**, gated by the privacy decision. Pay-per-use; no infra to maintain. |

---

## 6. Comparison matrix

Legend — Local-Mac: ✅ ok / ⚠️ slow-eval-only / ❌ no. Main-server: ✅ / ⚠️ needs-GPU-ideally.

| Option | Type | Table accuracy | Vietnamese | Local-Mac | Main-server | API cost/page | Latency | Privacy (financial) | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| **pdfplumber+Tesseract (current)** | text-line | ❌ no structure | ⚠️ vie weak on diacritics | ✅ | ✅ | $0 | fast | ✅ self-hosted | low (but broken) |
| **TATR** | structure-only | ~81% comb / 65% FinTabNet [1][8] | n/a (pair OCR) | ⚠️ slow | ✅ (GPU faster) | $0 | slow-CPU | ✅ self-hosted | medium (glue) |
| **PP-StructureV3** ★ | structure+content | TEDS ~0.95; ≈Gemini-2.5 at <100M [4][6] | ✅ 100+ langs, CPU-friendly [11] | ✅ | ✅ | $0 | med-CPU | ✅ self-hosted | med-low |
| **Surya/Marker** | structure+content | strong layout [12] | ✅ 90+ (less proven) | ⚠️ heavy/torch | ✅ (GPU) | $0 | slow-CPU | ✅ self-hosted | medium |
| **docling** | schema layer | n/a (orchestrator) | via backend | ✅ | ✅ | $0 | — | ✅ self-hosted | low |
| **img2table / Camelot** | structure | low / digital-only | via OCR / n/a | ✅ | ✅ | $0 | fast | ✅ self-hosted | low (insufficient) |
| **PaddleOCR-VL-0.9B** ★ | VLM | TEDS 92.14 [13] | ✅ 109 langs incl. VN [14] | ⚠️ eval-only | ✅ | $0 | slow-CPU | ✅ self-hosted | medium |
| **Claude Sonnet 4.x** ★ | API VLM | 9.5/10 [16] | ✅ strong + JSON | n/a | n/a | per-token (sparing) | sec/page | ✅ API no-train, 7-day [18] | none (API) |
| **Gemini 2.5 Pro** | API VLM | 9.5/10 [16] | ✅ | n/a | n/a | per-token | sec/page | ✅ paid no-train (confirm) | none |
| **Mistral OCR 3** | API OCR | 96.6% tables [19] | ✅ (verify) | n/a | n/a | **$2/1k ($1 batch)** [19] | sec/page | ⚠️ no SOC2/SLA [19] | none |
| **AWS Textract** | API doc-AI | 84.8% tables [19] | partial | n/a | n/a | ~$65/1k [19] | sec/page | enterprise-grade | none |
| **Azure Doc Intelligence** | API doc-AI | high (custom) | ✅ | n/a | n/a | ~$1.50/1k basic [19] | sec/page | enterprise-grade | low (custom train) |
| **Google Document AI** | API doc-AI | high | ✅ | n/a | n/a | $30–45/1k [19] | sec/page | enterprise-grade | low |

---

## 7. Accuracy measurement — metrics + gold-set protocol

### 7.1 Metrics (what to compute)
- **TEDS (Tree-Edit-Distance Similarity)** — represent each table as an HTML tree; TEDS = 1 − normalized tree-edit-distance between predicted and ground-truth tree. **TEDS-Struct** scores shape only; **TEDS-Content** also penalizes wrong cell text. Use **TEDS-Content** (it captures multi-hop cell misalignment + OCR errors — exactly our column-picking failure). [21][24][25]
- **GriTS (Grid Table Similarity)** — evaluates tables directly in 2-D matrix form (GriTS-Top for topology, GriTS-Con for content, GriTS-Loc for cell location). More faithful than TEDS for spanning cells; TATR repo ships a GriTS implementation. Report alongside TEDS. [22][23]
- **Cell-level F1** — precision/recall/F1 of correctly recovered cells (often averaged over IoU thresholds 0.6–0.9). Good for "did we find the cells." [24]
- **★ Figure-level accuracy (the business metric)** — for each (doc, field ∈ {net_revenue, gross_profit, net_profit, total_assets, equity}) × (period column) the extracted value must equal the human-verified value within tolerance (e.g. ±0.5%). **This is what the user actually cares about** — TEDS/GriTS measure the table; figure-accuracy measures the answer. Report all four; gate on figure-accuracy.

### 7.2 Gold-set (use the 14 docs already on disk — do NOT fetch new)
Sources confirmed on disk: `data/pdfs-local/` and `data/pdfs/` — VCB, FPT, HPG, VNM, DHG (+ VEA, ACB, SHB, BSR, DGC, DIG, EIB per task). PDFs + OCR text already exist (`pdf_extracted_text` table; viewer at `/api/bctc-inspect`).
1. For each doc, a human (or PO-verified API pass cross-checked against the company's published numbers / API-bridge) records ground-truth: the income-statement and balance-sheet result rows, **explicitly tagging which column** = consolidated current-quarter (the column we report). Store as `gold/<TICKER>_<YEAR>_Q<N>.json`.
2. **Must include the known-bad cases as regression anchors:** VNM (`net_profit` decimal-shift) and DHG (`rev` decimal-shift). The harness must turn these from red→green.
3. Keep ground-truth in billion VND, Vietnamese number format normalized, with the source page number.

### 7.3 Harness
A standalone eval script (lives under `apps/pdf-extractor/` eval tooling, **not** in the pure-primitive sandbox — it does I/O) that, per doc: runs each candidate extractor → emits predicted table (HTML/JSON) + extracted figures → computes TEDS-Content, GriTS, cell-F1 vs gold table, and figure-accuracy vs gold figures → writes a CSV/HTML scoreboard (option × metric). PO reads the scoreboard and picks the winner. This is reusable as the regression gate after integration.

---

## 8. The image-vs-text cross-check — design (the comparison the user wants)

This is **both** an evaluation harness **and** a runtime confidence gate. It generalizes the existing `isDecimalShiftAnomaly()` (>10× magnitude divergence) in `bctcInspectHandler.ts`.

```
                 ┌─────────────────────────────────────────────┐
   BCTC PDF ───► │  Locate result-table pages (layout/keywords) │
                 └───────────────┬───────────────┬─────────────┘
                                 │               │
         TEXT TRACK              │               │   IMAGE TRACK
   (current + PP-Structure)      ▼               ▼   (render → VLM)
   pdfplumber/PP-Structure       │               │   PyMuPDF/pdf2image page→PNG (300 DPI)
   → structured cells            │               │   → Claude Sonnet 4.x / PaddleOCR-VL
   → Vietnamese-number normalize │               │   → JSON {field, period, value}
                                 ▼               ▼
                 ┌─────────────────────────────────────────────┐
                 │ RECONCILE per (field, period):                │
                 │   ratio = max(|a|,|b|) / max(min(|a|,|b|),ε)   │
                 │   • agree (≤ tol)        → confidence ↑, store │
                 │   • disagree >10×        → DECIMAL-SHIFT flag  │
                 │   • disagree (other)     → low_confidence gate │
                 └───────────────┬───────────────┬─────────────┘
                                 ▼               ▼
                        insert (high conf)   block + WORK-channel alert
```

**Runtime policy (cost-aware):** the **text track (PP-StructureV3) is the hot path** on every doc. The **image/VLM track runs only when** (a) text-track confidence < threshold, (b) accounting validation fails (`validate_financial_figures` returns low), or (c) a random audit sample (e.g. 1-in-N) for drift monitoring. This keeps API spend bounded while guaranteeing the decimal-shift class is caught — the VNM/DHG cases trip the >10× rule and would never have been stored silently.

**Vietnamese number normalization (must-fix regardless of extractor):** add a normalization step in the infrastructure adapter (NOT in `decimal_normalizer`, which is pure and must stay deterministic on already-clean strings — feed it clean input). Rule: if a number matches `\d{1,3}(\.\d{3})+(,\d+)?` treat `.`=thousands, `,`=decimal → strip `.`, swap `,`→`.` before `float()`. This alone fixes the parse half of the decimal-shift bug; the cross-check catches whatever slips through.

---

## 9. Recommended target architecture (fits pdf-extractor DDD + Security Clause)

Per the pilot charter (`docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md` §"Service-specific gotchas"): **OCR/model calls and PDF I/O are impure → infrastructure adapters; primitives stay pure; the sandbox runner must hold ZERO credentials** (Security Clause / G7-AC5, confirmed in `sandbox/runner.py` docstring).

```
interface/        POST /extract, /extract-tables, /cross-check   (HTTP)
application/      ExtractTablesUseCase, CrossCheckUseCase         (orchestration, DI)
domain/
  primitives/     decimal_normalizer, validate_financial_figures,
                  confidence_scorer, low_confidence_gate,
                  ratio_computer, field_extractor                (PURE — unchanged)
  + NEW pure primitives (deterministic, no I/O):
      reconcile_figures(a, b, tol)        → "agree"|"shift"|"low" (generalizes isDecimalShiftAnomaly)
      vn_number_normalize(str)            → clean numeric string  (".", "," handling)
      select_period_column(cells, hint)   → pick consolidated-current-quarter col
  modules/        financial_reports (compose the above)
infrastructure/   (adapters — hold creds, do I/O, run models)
      PdfPageRenderer            (PyMuPDF / pdf2image → PNG)
      PpStructureTableAdapter    (PP-StructureV3 → structured cells)   ← PRIMARY, main-server
      VlmCrossCheckAdapter       (Claude Sonnet 4.x API / PaddleOCR-VL) ← GATED cross-check
      (existing PdfplumberExtractionEngine kept as native-PDF fast path)
```

**Placement:**
- **PP-Structure adapter → main server** (Docker; CPU acceptable, GPU if confirmed). Self-hosted; financial PDFs never leave infra.
- **VLM cross-check adapter → external API** (Claude Sonnet 4.x) **or** self-hosted PaddleOCR-VL on the main server if the privacy decision forbids APIs.
- **Local Mac → eval harness + Phase-0 spike only.**
- **API keys** live only in the infrastructure adapter's runtime env (mcp-server / pdf-extractor service), **never** in `sandbox/` and never in any primitive — preserving the Security Clause and the import-linter fence (`domain.primitives` must not import `infrastructure`).

**How it catches the decimal-shift bug:** the new pure `reconcile_figures` primitive is unit-tested with the VNM/DHG values (`0.000051` vs `51000`, `0.000009` vs `9000`) and returns `"shift"`; the application layer routes `"shift"` → low-confidence gate → block insert + WORK alert. Deterministic, testable in the sandbox, no creds needed.

---

## 10. Phased rollout

**Phase 0 — Spike (1 sprint, on the Intel Mac, no production changes).**
- Build the eval harness (Section 7.3) + the 14-doc gold-set with VNM/DHG anchors.
- Run **3 candidates**: PP-StructureV3 (CPU), PaddleOCR-VL-0.9B (CPU, eval-only), and **one API VLM** (Claude Sonnet 4.x; Gemini 2.5 Pro optional) on a few pages to anchor the upper bound.
- Score TEDS-Content + GriTS + cell-F1 + figure-accuracy. **Exit criterion:** PP-Structure figure-accuracy ≥ agreed bar (e.g. ≥95% on the result column) AND both VNM/DHG anchors flip to correct (or are caught by the cross-check).
- **Deliverable:** scoreboard CSV/HTML → PO picks production extractor.

**Phase 1 — Vietnamese number normalization + reconcile primitive (small, high-value).**
- Add pure primitives `vn_number_normalize`, `reconcile_figures`, `select_period_column` with unit tests (VNM/DHG as regression anchors). No model needed; fixes the parse-half of the bug immediately.

**Phase 2 — Integrate the winning self-hosted extractor.**
- `PpStructureTableAdapter` (or spike winner) in `infrastructure/`; wire through `ExtractTablesUseCase`; replace blind regex column-picking with `select_period_column` over real cells. Deploy to main server. Re-run harness as regression gate.

**Phase 3 — Cross-check gate + audit sampling.**
- `VlmCrossCheckAdapter` + `CrossCheckUseCase`; gated (low-confidence / validation-fail / 1-in-N audit). Generalize `isDecimalShiftAnomaly` into the pure `reconcile_figures`. Surface disagreements to WORK channel + the `/api/bctc-inspect` viewer.

**Phase 4 — (optional) fine-tune.** If Vietnamese accuracy is the bottleneck, fine-tune PaddleOCR on a small annotated BCTC set (the 37.5%→50% noisy-image gain [9] shows the lever exists). Defer unless Phase-0 numbers demand it.

---

## 11. Open questions for PO / Architect

1. **Privacy / data residency (blocking):** Is sending financial-statement PDFs (or rendered page images) to a third-party API (Claude / Gemini / Mistral) acceptable, or must extraction stay **fully self-hosted**? Claude/Gemini paid APIs do not train on inputs (7-day retention) [18]; Mistral lacks SOC2/SLA [19]. **If self-hosted-only → drop the API cross-check and use PaddleOCR-VL-0.9B on the main server instead.** This single answer decides Section 4 vs 3.6.
2. **Does the main server have a GPU?** PP-StructureV3 runs on CPU but a GPU is 10–20× faster [11]; production throughput sizing and whether a VLM can run self-hosted both depend on this. Currently unknown (system-map shows only Docker + FlareSolverr; no GPU declared).
3. **API budget:** If APIs are allowed, what monthly cap? Mistral OCR 3 is **$2/1k pages** [19] (cheap enough for bulk); Claude/Gemini per-token is pricier but used only as a gated cross-check. Need a number to set the audit-sampling rate (1-in-N) in Phase 3.
4. **Figure-accuracy bar + tolerance:** What pass threshold (e.g. ≥95% of result-column figures within ±0.5%) defines Phase-0 success and the production regression gate?
5. **Ground-truth ownership:** Who verifies the 14-doc gold-set figures (human vs PO-verified API-bridge cross-check against published company numbers)? Needed before the spike can score anything.

---

## 12. Sources

1. Microsoft Table Transformer (TATR) — https://github.com/microsoft/table-transformer
2. microsoft/table-transformer-structure-recognition — https://huggingface.co/microsoft/table-transformer-structure-recognition
3. table-transformer (PyPI) — https://pypi.org/project/table-transformer/
4. PP-StructureV3 Introduction — http://www.paddleocr.ai/main/en/version3.x/algorithm/PP-StructureV3/PP-StructureV3.html
5. PaddleOCR ppstructure/table README — https://github.com/PaddlePaddle/PaddleOCR/blob/main/ppstructure/table/README.md
6. PaddleOCR 3.0 Technical Report — https://arxiv.org/html/2507.05595v1
7. PaddleOCR vs Tesseract vs EasyOCR (CodeSOTA, 2026) — https://www.codesota.com/ocr/paddleocr-vs-tesseract
8. TATR INFERENCE.md (CPU support, ICDAR/FinTabNet accuracy) — https://github.com/microsoft/table-transformer/blob/main/docs/INFERENCE.md ; accuracy cleanup — https://arxiv.org/pdf/2303.00716
9. Enhancing OCR for Sino-Vietnamese via fine-tuned PaddleOCRv5 — https://arxiv.org/pdf/2510.04003
10. A Survey on Vietnamese Document Analysis and Recognition — https://arxiv.org/html/2506.05061v1
11. 8 Top Open-Source OCR Models Compared (Modal) — https://modal.com/blog/8-top-open-source-ocr-models-compared
12. Surya (datalab-to) — https://github.com/datalab-to/surya ; Marker/Docling/MinerU comparison (2026) — https://themenonlab.blog/blog/best-open-source-pdf-to-markdown-tools-2026
13. PaddleOCR-VL-0.9B overview (TEDS 92.14, CPU) — https://www.emergentmind.com/topics/paddleocr-vl-0-9b
14. PaddleOCR-VL paper (109 langs, tables) — https://arxiv.org/abs/2510.14528
15. Baidu PaddleOCR-VL release (MarkTechPost) — https://www.marktechpost.com/2025/10/17/baidus-paddlepaddle-team-releases-paddleocr-vl-0-9b-a-navit-style-ernie-4-5-0-3b-vlm-targeting-end-to-end-multilingual-document-parsing/
16. Comparative Analysis of AI OCR Models (IntuitionLabs) — https://intuitionlabs.ai/articles/ai-ocr-models-pdf-structured-text-comparison
17. Gemini 2.5 Pro & Claude Sonnet 4 image table extraction eval (16x) — https://eval.16x.engineer/blog/image-table-data-extraction-evaluation-results
18. Anthropic API data retention (not used for training; 7-day) — https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
19. Document AI Cost Comparison (Mistral $2/1k; Textract/Google/Azure; Mistral 96.6% tables; no SOC2) — https://aiproductivity.ai/blog/document-ai-cost-comparison/ ; Mistral OCR — https://mistral.ai/news/mistral-ocr
20. Mistral OCR 3 technical review (PyImageSearch) — https://pyimagesearch.com/2025/12/23/mistral-ocr-3-technical-review-sota-document-parsing-at-commodity-pricing/
21. OCRBench v2 / TEDS context — https://arxiv.org/html/2501.00321v2
22. GriTS: Grid Table Similarity Metric — https://arxiv.org/pdf/2203.12555
23. Evaluating Table Structure Recognition: A New Perspective — https://arxiv.org/pdf/2208.00385
24. The Ultimate Guide to Assessing Table Extraction (Nanonets — TEDS-Struct vs Content, cell-F1) — https://nanonets.com/blog/the-ultimate-guide-to-assessing-table-extraction/
25. OmniDocBench (CVPR 2025) — https://github.com/opendatalab/OmniDocBench
```
