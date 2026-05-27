"""
BT-0 Phase-0 Eval Harness — BCTC Table Extractor Bake-off
==========================================================
SPIKE CODE — throwaway quality, lives in spike/eval/ only.
NEVER pollutes production domain/primitives, sandbox/runner.py,
dashboard/index.html, dashboard/traces.js, dashboard/trust-contract.spec.js.

PRIVACY GUARDRAIL: Zero external API calls. No PDF/image leaves this machine.
SECURITY CLAUSE: Zero DB credentials, zero API keys in this file or in env.

Candidates evaluated:
  1. Baseline: pdfplumber text extraction + current Tesseract OCR (vie+eng)
  2. PaddleOCR PP-StructureV3 (image-based table pipeline)
  3. PaddleOCR PaddleOCRVL (VLM, attempted — feasibility probe)
  4. Surya table-rec (attempted — needs torch, blocked on Python 3.13/Intel Mac)
  5. Microsoft TATR (attempted — needs torch, blocked on Python 3.13/Intel Mac)

PP-StructureV3 API note (v3.5.0):
  The correct invocation is pipe.predict(input) which returns a list of
  LayoutParsingResultV2 objects.  Each result contains:
    result["parsing_res_list"] — list of LayoutBlock (label + content)
    result["table_res_list"]   — list of table results with .html["pred"] (HTML string)
  DO NOT call pipe(img) directly — the __call__ wrapper is a C extension
  method-wrapper that is NOT callable from Python; it raises "'PPStructureV3'
  object is not callable".  Use pipe.predict(img) instead.

Usage:
  python harness.py [--doc VNM|BSR|DHG|all] [--candidate all|baseline|paddleocr_struct|paddleocr_vl]
"""

import os
import sys
import json
import time
import re
import argparse
from pathlib import Path
from typing import Optional

# ---- Paths ----------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[4]
PDFS_LOCAL = REPO_ROOT / "data" / "pdfs-local"
GOLD_DIR = Path(__file__).parent / "gold"
RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# ---- Gold set registry ----------------------------------------------------
GOLD_REGISTRY = {
    "VNM": {
        "gold_file": "VNM_2025_Q4.json",
        "pdf_name": "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
        "is_text_native": False,
        "income_stmt_pages": [7, 8],  # 0-indexed; pages 8-9 in document
    },
    "BSR": {
        "gold_file": "BSR_2025_Q4.json",
        "pdf_name": "20260130-BSR-Bao-cao-tai-chinh-rieng-Quy-4-nam-2025.pdf",
        "is_text_native": True,
        "income_stmt_pages": [3],  # page 4 0-indexed
    },
    "DHG": {
        "gold_file": "DHG_2026_Q1.json",
        "pdf_name": "20260420-DHG-BCTC-Quy-1.2026.pdf",
        "is_text_native": False,
        "income_stmt_pages": [5],  # page 6 0-indexed
    },
}

# ---- Number normalization (mirrors BT-1 primitive) ------------------------
_VN_THOUSANDS_DOT = re.compile(r"^\(?-?\d{1,3}(\.\d{3})+(,\d+)?\)?$")
_VN_MIXED = re.compile(r"^\(?-?\d{1,3}(\.\d{3})+\)?$")  # integer VN thousands


def vn_normalize(token: str) -> Optional[float]:
    """Normalize VN-format number string to float.
    VN: . = thousands sep, , = decimal sep.
    Returns None on parse failure.
    """
    token = token.strip().replace(" ", "")
    negative = False
    if token.startswith("(") and token.endswith(")"):
        negative = True
        token = token[1:-1]
    if token.startswith("-"):
        negative = True
        token = token[1:]
    # Already clean integer
    if re.fullmatch(r"\d+", token):
        val = float(token)
        return -val if negative else val
    # VN format: dots as thousands, optional comma decimal
    if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", token):
        token = token.replace(".", "").replace(",", ".")
        val = float(token)
        return -val if negative else val
    # VN decimal only (no thousands): 0,5
    if re.fullmatch(r"\d+,\d+", token):
        val = float(token.replace(",", "."))
        return -val if negative else val
    # EN format passthrough
    try:
        val = float(token.replace(",", ""))
        return -val if negative else val
    except ValueError:
        return None


def extract_numbers_from_line(line: str) -> list[float]:
    """Extract all valid VN/EN numbers from a text line."""
    # Split on whitespace, try each token
    results = []
    for tok in line.split():
        # Remove common noise chars
        tok = tok.strip(".,;:—–-")
        val = vn_normalize(tok)
        if val is not None and abs(val) > 0:
            results.append(val)
    return results


# ---- Metrics ---------------------------------------------------------------

def figure_accuracy(predicted: float, gold: float, tol_pct: float = 0.5) -> dict:
    """Return accuracy info for a single figure."""
    if gold == 0:
        return {"match": predicted == 0, "pct_error": 0.0 if predicted == 0 else 999.9}
    pct_err = abs(predicted - gold) / abs(gold) * 100
    return {
        "match": pct_err <= tol_pct,
        "pct_error": round(pct_err, 4),
        "predicted": predicted,
        "gold": gold,
    }


def compute_cell_f1(predicted_cells: list, gold_cells: list) -> dict:
    """Simple cell-level F1 between two lists of number values (within ±0.5%)."""
    if not gold_cells:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    tp = 0
    for gc in gold_cells:
        for pc in predicted_cells:
            if gc != 0 and abs(pc - gc) / abs(gc) <= 0.005:
                tp += 1
                break
    precision = tp / len(predicted_cells) if predicted_cells else 0.0
    recall = tp / len(gold_cells)
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3), "tp": tp}


# ---- Candidate 1: Baseline (pdfplumber + Tesseract) -----------------------

def run_baseline(doc_key: str, gold: dict, pdf_path: Path, pages: list[int]) -> dict:
    """Current production flow: pdfplumber text extraction + Tesseract OCR."""
    t0 = time.time()

    # Step 1: Try pdfplumber text extraction (for text-native PDFs)
    all_text_lines = []
    all_numbers = []
    text_strategy_used = "unknown"

    try:
        import pdfplumber
        with pdfplumber.open(str(pdf_path)) as pdf:
            for pg_idx in pages:
                if pg_idx < len(pdf.pages):
                    text = pdf.pages[pg_idx].extract_text() or ""
                    if len(text.strip()) > 100:
                        text_strategy_used = "pdfplumber_text"
                        for line in text.split("\n"):
                            line = line.strip()
                            if line:
                                all_text_lines.append(line)
                                all_numbers.extend(extract_numbers_from_line(line))
    except Exception as e:
        text_strategy_used = f"pdfplumber_error: {e}"

    # Step 2: If no text, fall back to Tesseract OCR (current fallback path)
    if not all_text_lines or len(all_numbers) < 5:
        text_strategy_used = "tesseract_ocr"
        try:
            import fitz
            import pytesseract
            from PIL import Image
            doc = fitz.open(str(pdf_path))
            for pg_idx in pages:
                if pg_idx < len(doc):
                    page = doc[pg_idx]
                    mat = fitz.Matrix(2.0, 2.0)
                    pix = page.get_pixmap(matrix=mat, alpha=False)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    text = pytesseract.image_to_string(img, lang="vie+eng", config="--psm 6")
                    for line in text.split("\n"):
                        line = line.strip()
                        if line:
                            all_text_lines.append(line)
                            all_numbers.extend(extract_numbers_from_line(line))
            doc.close()
        except Exception as e:
            text_strategy_used = f"tesseract_error: {e}"

    elapsed = time.time() - t0

    return _evaluate_extraction(
        candidate="baseline_pdfplumber_tesseract",
        strategy_used=text_strategy_used,
        all_numbers=all_numbers,
        all_text_lines=all_text_lines,
        gold=gold,
        elapsed_s=elapsed,
        doc_key=doc_key,
    )


# ---- Candidate 2: PaddleOCR PP-StructureV3 --------------------------------

def run_paddleocr_structure(doc_key: str, gold: dict, pdf_path: Path, pages: list[int]) -> dict:
    """PP-StructureV3: image-based table layout + OCR.

    API (paddleocr v3.5.0):
      pipe = PPStructureV3()
      results = pipe.predict(img_or_path)  ← returns list[LayoutParsingResultV2]
      for res in results:
          # structured table HTML
          for tbl in res["table_res_list"]:
              html = tbl.html["pred"]
          # all text blocks (text + table content)
          for block in res["parsing_res_list"]:
              block.label   # "table" | "text" | "figure" | ...
              block.content # text content (HTML for tables)
    """
    t0 = time.time()
    all_numbers = []
    all_text_lines = []
    status = "ok"
    error_msg = ""
    api_notes = []

    try:
        import fitz
        import numpy as np
        from paddleocr import PPStructureV3

        # Init pipeline (models cached after first call)
        pipe = PPStructureV3()
        api_notes.append("PPStructureV3 init: OK")
        doc_fitz = fitz.open(str(pdf_path))

        for pg_idx in pages:
            if pg_idx >= len(doc_fitz):
                api_notes.append(f"Page {pg_idx} out of range (doc has {len(doc_fitz)} pages)")
                continue
            page = doc_fitz[pg_idx]
            # 2x scale → 144 DPI effective (72 DPI base × 2) — good for OCR
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            # PPStructureV3.predict() requires numpy.ndarray (BGR order, uint8)
            # NOT PIL Image — passing PIL raises "Not supported input data type"
            img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                pix.height, pix.width, 3
            )
            img_bgr = img_rgb[:, :, ::-1].copy()  # RGB → BGR for PaddleOCR
            api_notes.append(f"Page {pg_idx}: rendered {pix.width}×{pix.height} px (numpy BGR)")

            # --- FIXED: use pipe.predict(img_bgr) not pipe(img) ---
            # pipe.__call__ is a C extension method-wrapper, not callable from Python.
            # pipe.predict(input) is the correct public API (returns list[LayoutParsingResultV2]).
            # Input must be numpy.ndarray (BGR uint8), not PIL Image.
            results = pipe.predict(img_bgr)
            api_notes.append(f"Page {pg_idx}: predict() returned {len(results)} result(s)")

            for res_idx, res in enumerate(results):
                # 1. Extract from structured table list (highest quality source)
                table_res_list = res.get("table_res_list", [])
                api_notes.append(f"  result[{res_idx}]: {len(table_res_list)} table(s) detected")
                for tbl in table_res_list:
                    try:
                        html = tbl.html.get("pred", "")
                        if html:
                            clean = re.sub(r"<[^>]+>", " ", html)
                            for line in clean.split():
                                tok = line.strip()
                                if tok:
                                    all_text_lines.append(tok)
                                    all_numbers.extend(extract_numbers_from_line(tok))
                    except Exception as tbl_e:
                        api_notes.append(f"  table html extraction error: {tbl_e}")

                # 2. Extract from parsing_res_list (covers all blocks: text + tables)
                parsing_res_list = res.get("parsing_res_list", [])
                api_notes.append(f"  result[{res_idx}]: {len(parsing_res_list)} blocks in parsing_res_list")
                for block in parsing_res_list:
                    content = getattr(block, "content", "") or ""
                    if content:
                        # Strip any HTML tags (table content may be HTML)
                        clean = re.sub(r"<[^>]+>", " ", content)
                        for line in clean.split("\n"):
                            line = line.strip()
                            if line:
                                all_text_lines.append(line)
                                all_numbers.extend(extract_numbers_from_line(line))

                # 3. Fallback: overall_ocr_res text (plain OCR over whole page)
                try:
                    ocr_res = res.get("overall_ocr_res", None)
                    if ocr_res is not None:
                        rec_texts = ocr_res.get("rec_texts", [])
                        for txt in rec_texts:
                            if isinstance(txt, str) and txt.strip():
                                all_text_lines.append(txt)
                                all_numbers.extend(extract_numbers_from_line(txt))
                        api_notes.append(f"  overall_ocr_res: {len(rec_texts)} text lines")
                except Exception as ocr_e:
                    api_notes.append(f"  overall_ocr fallback error: {ocr_e}")

        doc_fitz.close()

    except Exception as e:
        status = "error"
        error_msg = str(e)
        api_notes.append(f"Exception: {error_msg}")

    elapsed = time.time() - t0

    result = _evaluate_extraction(
        candidate="paddleocr_pp_structurev3",
        strategy_used=f"pp_structurev3 status={status}" + (f" err={error_msg[:80]}" if error_msg else ""),
        all_numbers=all_numbers,
        all_text_lines=all_text_lines,
        gold=gold,
        elapsed_s=elapsed,
        doc_key=doc_key,
    )
    result["api_notes"] = api_notes
    return result


# ---- Candidate 3: PaddleOCR VL (VLM probe) --------------------------------

def run_paddleocr_vl(doc_key: str, gold: dict, pdf_path: Path, pages: list[int]) -> dict:
    """PaddleOCR VL pipeline (image understanding VLM). Feasibility probe."""
    t0 = time.time()
    all_numbers = []
    all_text_lines = []
    status = "probing"
    error_msg = ""
    feasibility_notes = []

    try:
        import fitz
        from PIL import Image
        from paddleocr import PaddleOCRVL
        feasibility_notes.append("PaddleOCRVL import: OK")

        pipe = PaddleOCRVL()
        feasibility_notes.append("PaddleOCRVL init: OK")

        doc_fitz = fitz.open(str(pdf_path))
        # Only run on first page to bound time (VLM is slow on CPU)
        pg_idx = pages[0] if pages else 0
        if pg_idx < len(doc_fitz):
            page = doc_fitz[pg_idx]
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            prompt = (
                "Extract all numbers from the table in this Vietnamese financial report page. "
                "Return each row as: row_code | label | value1 | value2"
            )
            result = pipe(image=img, query=prompt)
            feasibility_notes.append(f"VLM inference completed: result_type={type(result).__name__}")

            if isinstance(result, str):
                for line in result.split("\n"):
                    all_text_lines.append(line)
                    all_numbers.extend(extract_numbers_from_line(line))
            elif isinstance(result, dict):
                text = result.get("result", result.get("text", str(result)))
                for line in str(text).split("\n"):
                    all_text_lines.append(line)
                    all_numbers.extend(extract_numbers_from_line(line))

        doc_fitz.close()
        status = "ok"
    except ImportError as e:
        status = "import_failed"
        error_msg = str(e)
        feasibility_notes.append(f"Import error: {e}")
    except Exception as e:
        status = "runtime_error"
        error_msg = str(e)[:200]
        feasibility_notes.append(f"Runtime error: {error_msg}")

    elapsed = time.time() - t0

    result = _evaluate_extraction(
        candidate="paddleocr_vl",
        strategy_used=f"paddleocr_vl status={status}",
        all_numbers=all_numbers,
        all_text_lines=all_text_lines,
        gold=gold,
        elapsed_s=elapsed,
        doc_key=doc_key,
    )
    result["feasibility_notes"] = feasibility_notes
    result["error_msg"] = error_msg
    return result


# ---- Candidate 4: Surya table-rec (feasibility probe only) ----------------

def run_surya_probe(doc_key: str, gold: dict, pdf_path: Path, pages: list[int]) -> dict:
    """Surya table-rec — feasibility probe. Needs torch which is NOT available on Python 3.13 / Intel Mac."""
    t0 = time.time()
    feasibility_notes = []
    status = "probing"
    error_msg = ""

    try:
        import torch  # type: ignore
        feasibility_notes.append("torch import: OK")
        import surya.table_rec  # type: ignore  # noqa: F401
        feasibility_notes.append("surya.table_rec import: OK")
        status = "ok_but_not_run"
    except ImportError as e:
        status = "import_failed"
        error_msg = str(e)
        feasibility_notes.append(f"Import failed: {e}")
        if "torch" in str(e).lower():
            feasibility_notes.append(
                "BLOCKED: PyTorch is not available for Python 3.13 on Intel Mac (x86_64). "
                "PyTorch dropped Intel Mac wheel support. "
                "Fix: use Python 3.10/3.11 on a machine with ARM or GPU, or run on main server."
            )

    elapsed = time.time() - t0
    return {
        "candidate": "surya_table_rec",
        "doc_key": doc_key,
        "status": status,
        "error_msg": error_msg,
        "feasibility_notes": feasibility_notes,
        "elapsed_s": round(elapsed, 2),
        "figure_matches": 0,
        "figure_total": 0,
        "figure_accuracy_pct": 0.0,
        "cell_f1": 0.0,
        "all_numbers_found": 0,
        "can_run_on_this_mac": False,
        "blocking_reason": "torch not available on Python 3.13 / Intel Mac x86_64",
    }


# ---- Candidate 5: Microsoft TATR (feasibility probe only) -----------------

def run_tatr_probe(doc_key: str, gold: dict, pdf_path: Path, pages: list[int]) -> dict:
    """Microsoft Table Transformer (TATR) — feasibility probe. Also needs torch."""
    t0 = time.time()
    feasibility_notes = []
    status = "probing"
    error_msg = ""

    try:
        import torch  # type: ignore
        feasibility_notes.append("torch import: OK")
        from transformers import TableTransformerForObjectDetection  # type: ignore  # noqa: F401
        feasibility_notes.append("TableTransformerForObjectDetection import: OK")
        status = "ok_would_run"
    except ImportError as e:
        status = "import_failed"
        error_msg = str(e)
        feasibility_notes.append(f"Import failed: {e}")
        if "torch" in str(e).lower():
            feasibility_notes.append(
                "BLOCKED: Same torch constraint as Surya. "
                "TATR from microsoft/table-transformer requires torch>=1.9. "
                "Not installable on Python 3.13 / Intel Mac x86_64."
            )

    elapsed = time.time() - t0
    return {
        "candidate": "microsoft_tatr",
        "doc_key": doc_key,
        "status": status,
        "error_msg": error_msg,
        "feasibility_notes": feasibility_notes,
        "elapsed_s": round(elapsed, 2),
        "figure_matches": 0,
        "figure_total": 0,
        "figure_accuracy_pct": 0.0,
        "cell_f1": 0.0,
        "all_numbers_found": 0,
        "can_run_on_this_mac": False,
        "blocking_reason": "torch not available on Python 3.13 / Intel Mac x86_64",
    }


# ---- Common evaluation logic -----------------------------------------------

def _evaluate_extraction(
    candidate: str,
    strategy_used: str,
    all_numbers: list,
    all_text_lines: list,
    gold: dict,
    elapsed_s: float,
    doc_key: str,
) -> dict:
    """Given a list of extracted numbers + gold dict, compute metrics."""
    gold_rows = gold.get("rows", [])
    # Determine which column to use (consolidated current quarter)
    col_key_q = "q4_2025" if "q4_2025" in (gold_rows[0] if gold_rows else {}) else \
                "q1_2026" if "q1_2026" in (gold_rows[0] if gold_rows else {}) else \
                "q4_2025"
    col_key_ytd = "ytd_2025" if "ytd_2025" in (gold_rows[0] if gold_rows else {}) else col_key_q

    # Gold figures: current quarter column values (in VND, raw)
    gold_figures = []
    gold_lookup = {}
    for row in gold_rows:
        val = row.get(col_key_q)
        if val is not None and val != 0:
            gold_figures.append(float(val))
            gold_lookup[row["row_code"]] = float(val)

    # Match predicted numbers against gold figures
    figure_results = []
    for code, gold_val in gold_lookup.items():
        # Try to find predicted value within ±0.5% from extracted numbers
        best_match = None
        best_err = 999.0
        for pred in all_numbers:
            if gold_val != 0:
                err = abs(pred - gold_val) / abs(gold_val) * 100
                if err < best_err:
                    best_err = err
                    best_match = pred
        fa = figure_accuracy(best_match if best_match is not None else 0, gold_val)
        figure_results.append({
            "row_code": code,
            "gold": gold_val,
            "predicted": best_match,
            "pct_error": fa["pct_error"],
            "match": fa["match"],
        })

    n_match = sum(1 for r in figure_results if r["match"])
    n_total = len(figure_results)
    fig_acc_pct = round(n_match / n_total * 100, 1) if n_total > 0 else 0.0

    # Cell F1
    cell_f1_result = compute_cell_f1(all_numbers, gold_figures)

    return {
        "candidate": candidate,
        "doc_key": doc_key,
        "strategy_used": strategy_used,
        "elapsed_s": round(elapsed_s, 2),
        "figure_matches": n_match,
        "figure_total": n_total,
        "figure_accuracy_pct": fig_acc_pct,
        "cell_f1": cell_f1_result["f1"],
        "cell_precision": cell_f1_result["precision"],
        "cell_recall": cell_f1_result["recall"],
        "all_numbers_found": len(all_numbers),
        "figure_detail": figure_results,
        "can_run_on_this_mac": True,
    }


# ---- Run bake-off ----------------------------------------------------------

def run_bakeoff(doc_keys: list[str], candidates: list[str]) -> list[dict]:
    results = []

    for doc_key in doc_keys:
        if doc_key not in GOLD_REGISTRY:
            print(f"[WARN] Unknown doc: {doc_key}")
            continue

        reg = GOLD_REGISTRY[doc_key]
        gold_path = GOLD_DIR / reg["gold_file"]
        pdf_path = PDFS_LOCAL / reg["pdf_name"]

        if not gold_path.exists():
            print(f"[ERROR] Gold file missing: {gold_path}")
            continue
        if not pdf_path.exists():
            print(f"[ERROR] PDF not found: {pdf_path}")
            continue

        with open(gold_path) as f:
            gold = json.load(f)

        pages = reg["income_stmt_pages"]
        print(f"\n{'='*60}")
        print(f"DOC: {doc_key}  |  PDF: {reg['pdf_name']}")
        print(f"Gold rows: {len(gold.get('rows', []))}, IS pages: {[p+1 for p in pages]}")
        print(f"{'='*60}")

        for cand in candidates:
            print(f"  Running candidate: {cand} ...", end=" ", flush=True)
            try:
                if cand == "baseline":
                    r = run_baseline(doc_key, gold, pdf_path, pages)
                elif cand == "paddleocr_struct":
                    r = run_paddleocr_structure(doc_key, gold, pdf_path, pages)
                elif cand == "paddleocr_vl":
                    r = run_paddleocr_vl(doc_key, gold, pdf_path, pages)
                elif cand == "surya":
                    r = run_surya_probe(doc_key, gold, pdf_path, pages)
                elif cand == "tatr":
                    r = run_tatr_probe(doc_key, gold, pdf_path, pages)
                else:
                    print(f"Unknown candidate: {cand}")
                    continue

                print(
                    f"done in {r['elapsed_s']}s | "
                    f"fig_acc={r['figure_accuracy_pct']}% ({r['figure_matches']}/{r['figure_total']}) | "
                    f"cell_f1={r.get('cell_f1', 0)}"
                )
                results.append(r)
            except Exception as e:
                print(f"CRASHED: {e}")
                results.append({
                    "candidate": cand,
                    "doc_key": doc_key,
                    "status": "crashed",
                    "error": str(e),
                    "figure_accuracy_pct": 0.0,
                    "cell_f1": 0.0,
                    "elapsed_s": 0,
                    "figure_matches": 0,
                    "figure_total": 0,
                })

    return results


# ---- Scoreboard output -----------------------------------------------------

def build_scoreboard(results: list[dict]) -> str:
    """Build markdown scoreboard table."""
    lines = []
    lines.append("# BT-0 BCTC Table Extractor Bake-off — SCOREBOARD")
    lines.append("")
    lines.append("**Privacy:** Zero external API calls. All models ran locally on-device (CPU, Intel Mac i7 16GB).")
    lines.append("")
    lines.append("## Summary Table")
    lines.append("")
    lines.append("| Candidate | Doc | Fig Accuracy (±0.5%) | Cell F1 | Speed (s/page) | Runs on Mac? | Notes |")
    lines.append("|---|---|---|---|---|---|---|")

    for r in results:
        doc = r.get("doc_key", "?")
        cand = r.get("candidate", "?")
        fig_acc = r.get("figure_accuracy_pct", 0)
        cell_f1 = r.get("cell_f1", 0)
        elapsed = r.get("elapsed_s", 0)
        can_run = "YES" if r.get("can_run_on_this_mac", False) else "NO"
        strategy = r.get("strategy_used", r.get("status", "?"))
        matches = r.get("figure_matches", 0)
        total = r.get("figure_total", 0)
        notes = r.get("blocking_reason", strategy)[:60]
        lines.append(
            f"| {cand} | {doc} | {fig_acc}% ({matches}/{total}) | {cell_f1} | {elapsed} | {can_run} | {notes} |"
        )

    lines.append("")
    lines.append("## Feasibility Notes per Candidate")
    lines.append("")
    seen_cands = set()
    for r in results:
        cand = r.get("candidate", "?")
        if cand in seen_cands:
            continue
        seen_cands.add(cand)
        lines.append(f"### {cand}")
        lines.append(f"- Runs on this Mac (Python 3.13, Intel x86_64, no GPU): {r.get('can_run_on_this_mac', False)}")
        if r.get("blocking_reason"):
            lines.append(f"- **BLOCKED:** {r['blocking_reason']}")
        for note in r.get("feasibility_notes", []):
            lines.append(f"- {note}")
        lines.append("")

    return "\n".join(lines)


# ---- Main ------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="BT-0 BCTC Eval Harness")
    parser.add_argument("--doc", default="all", help="Document key(s): VNM,BSR,DHG or all")
    parser.add_argument(
        "--candidate",
        default="all",
        help="Candidates: baseline,paddleocr_struct,paddleocr_vl,surya,tatr or all",
    )
    parser.add_argument("--timebox-s", type=int, default=600, help="Per-candidate timebox in seconds")
    args = parser.parse_args()

    if args.doc == "all":
        doc_keys = list(GOLD_REGISTRY.keys())
    else:
        doc_keys = [d.strip() for d in args.doc.split(",")]

    if args.candidate == "all":
        candidates = ["baseline", "paddleocr_struct", "paddleocr_vl", "surya", "tatr"]
    else:
        candidates = [c.strip() for c in args.candidate.split(",")]

    print(f"BT-0 Eval Harness — docs={doc_keys} candidates={candidates}")
    print(f"PDF dir: {PDFS_LOCAL}")
    print(f"Gold dir: {GOLD_DIR}")
    print()

    results = run_bakeoff(doc_keys, candidates)

    # Save full JSON results
    out_json = RESULTS_DIR / "bakeoff_results.json"
    with open(out_json, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nFull results saved: {out_json}")

    # Build and save scoreboard
    scoreboard_md = build_scoreboard(results)
    out_md = RESULTS_DIR / "scoreboard.md"
    with open(out_md, "w") as f:
        f.write(scoreboard_md)
    print(f"Scoreboard saved: {out_md}")

    # Print scoreboard to stdout
    print("\n" + scoreboard_md)

    # Build per-doc summary for JSON
    summary = {}
    for r in results:
        doc = r.get("doc_key", "?")
        cand = r.get("candidate", "?")
        if doc not in summary:
            summary[doc] = {}
        summary[doc][cand] = {
            "figure_accuracy_pct": r.get("figure_accuracy_pct", 0),
            "cell_f1": r.get("cell_f1", 0),
            "elapsed_s": r.get("elapsed_s", 0),
            "can_run_on_mac": r.get("can_run_on_this_mac", False),
        }

    out_summary = RESULTS_DIR / "summary.json"
    with open(out_summary, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Summary saved: {out_summary}")


if __name__ == "__main__":
    main()
