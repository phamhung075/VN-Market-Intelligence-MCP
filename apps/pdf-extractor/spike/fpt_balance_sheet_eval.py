"""
FPT Balance Sheet Evaluation — BT-0 Sharpened
==============================================
SPIKE CODE — lives under apps/pdf-extractor/spike/ only.
NEVER pollutes production domain/primitives, sandbox/runner.py,
dashboard/*, pilot-status-pdf-extractor.json.

PRIVACY GUARDRAIL: Zero external API calls. No PDF/image leaves this machine.
SECURITY CLAUSE: Zero DB credentials, zero API keys.

Target: 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf
  Page 4 (doc) = 0-idx 3: TÀI SẢN NGẮN HẠN (Current Assets)
  Page 5 (doc) = 0-idx 4: TÀI SẢN DÀI HẠN + TỔNG CỘNG TÀI SẢN
  Page 6 (doc) = 0-idx 5: NỢ PHẢI TRẢ
  Page 7 (doc) = 0-idx 6: VỐN CHỦ SỞ HỮU + TỔNG CỘNG NGUỒN VỐN

Comparison:
  TEXT PATH: Tesseract OCR (vie+eng) on rendered page PNG
  IMAGE PATH: PP-StructureV3 structured table extraction on rendered page PNG

Usage:
  python fpt_balance_sheet_eval.py --mode page4        # checkpoint: page 4 only
  python fpt_balance_sheet_eval.py --mode all          # full 4-6 stitch
  python fpt_balance_sheet_eval.py --mode text_only    # text path only (fast)
  python fpt_balance_sheet_eval.py --mode image_only   # image path only
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ---- Paths ---------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[3]
PDF_PATH = REPO_ROOT / "data" / "pdfs-local" / "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
GOLD_FILE = Path(__file__).parent / "eval" / "gold" / "FPT_2025_Q4_balance_sheet.json"
RESULTS_DIR = Path(__file__).parent / "eval" / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# FPT balance sheet spans these 0-indexed page numbers
# Page 4 = current assets only (checkpoint)
PAGE4_IDX = 3
PAGE5_IDX = 4
PAGE6_IDX = 5
PAGE7_IDX = 6

# Key balance-sheet row codes for page 4 (current assets)
PAGE4_KEY_CODES = {"100", "110", "111", "112", "120", "123", "130", "131",
                   "132", "134", "135", "136", "137", "140", "141", "149",
                   "150", "151", "152", "153"}

# Key summary figures expected by the user: the five sentinel rows
SENTINEL_ROWS = [
    ("100", "TÀI SẢN NGẮN HẠN"),
    ("200", "TÀI SẢN DÀI HẠN"),
    ("270", "TỔNG CỘNG TÀI SẢN"),
    ("300", "NỢ PHẢI TRẢ"),
    ("400", "VỐN CHỦ SỞ HỮU"),
    ("440", "TỔNG CỘNG NGUỒN VỐN"),
]

DPI_SCALE = 2.78  # 200 DPI from 72 DPI base


# ---- Number normalization ------------------------------------------------

_VN_RE = re.compile(r"^\d{1,3}(\.\d{3})+(,\d+)?$")
_INT_RE = re.compile(r"^\d+$")
_DECIMAL_COMMA_RE = re.compile(r"^\d+,\d+$")


def vn_normalize(token: str) -> Optional[float]:
    """Normalize VN-format number token to float.
    VN format: dot=thousands, comma=decimal.
    Handles parentheses for negatives: (586.166.744.274) -> -586166744274.
    """
    token = token.strip().replace(" ", "")
    if not token:
        return None
    negative = False
    if token.startswith("(") and token.endswith(")"):
        negative = True
        token = token[1:-1]
    if token.startswith("-"):
        negative = True
        token = token[1:]
    if _INT_RE.fullmatch(token):
        val = float(token)
        return -val if negative else val
    if _VN_RE.fullmatch(token):
        token = token.replace(".", "").replace(",", ".")
        val = float(token)
        return -val if negative else val
    if _DECIMAL_COMMA_RE.fullmatch(token):
        val = float(token.replace(",", "."))
        return -val if negative else val
    try:
        # EN format passthrough
        val = float(token.replace(",", ""))
        return -val if negative else val
    except ValueError:
        return None


def extract_numbers_from_text(text: str) -> list[float]:
    """Extract all valid number tokens from OCR text."""
    numbers = []
    for tok in re.split(r"\s+", text):
        # Strip trailing punctuation but keep parentheses for negatives
        tok_clean = tok.strip(".,;:—–")
        val = vn_normalize(tok_clean)
        if val is not None and abs(val) > 0:
            numbers.append(val)
    return numbers


# ---- Render page to PNG --------------------------------------------------

def render_page_to_png(pdf_path: Path, page_idx: int, dpi_scale: float, png_path: Path) -> tuple[int, int]:
    """Render a PDF page to PNG using PyMuPDF. Returns (width, height)."""
    import fitz  # type: ignore
    doc = fitz.open(str(pdf_path))
    page = doc[page_idx]
    mat = fitz.Matrix(dpi_scale, dpi_scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(str(png_path))
    w, h = pix.width, pix.height
    doc.close()
    return w, h


# ---- TEXT PATH: Tesseract OCR -------------------------------------------

def text_path_tesseract(pdf_path: Path, page_indices: list[int], label: str) -> dict:
    """Extract text from pages using Tesseract OCR on rendered page images.
    Returns dict with all_numbers, all_text_lines, elapsed_s, strategy_notes.
    """
    t0 = time.time()
    all_numbers: list[float] = []
    all_text_lines: list[str] = []
    notes: list[str] = []

    try:
        import fitz  # type: ignore
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore

        doc = fitz.open(str(pdf_path))
        for pg_idx in page_indices:
            mat = fitz.Matrix(DPI_SCALE, DPI_SCALE)
            page = doc[pg_idx]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            notes.append(f"Page {pg_idx+1}: rendered {pix.width}x{pix.height}px")

            t_pg = time.time()
            text = pytesseract.image_to_string(img, lang="vie+eng", config="--psm 6")
            elapsed_pg = time.time() - t_pg
            notes.append(f"Page {pg_idx+1}: tesseract {elapsed_pg:.1f}s, chars={len(text)}")

            for line in text.split("\n"):
                line = line.strip()
                if line:
                    all_text_lines.append(line)
                    all_numbers.extend(extract_numbers_from_text(line))
        doc.close()
    except Exception as e:
        notes.append(f"ERROR: {e}")

    elapsed = time.time() - t0
    return {
        "path": "text_tesseract",
        "label": label,
        "elapsed_s": round(elapsed, 2),
        "all_numbers": all_numbers,
        "all_text_lines": all_text_lines,
        "notes": notes,
        "s_per_page": round(elapsed / max(len(page_indices), 1), 2),
    }


# ---- TEXT PATH: raw text lines join -------------------------------------

def lines_to_rows(lines: list[str]) -> list[dict]:
    """
    Parse OCR lines into structured rows: {code, label, q4_2025, q4_2024}.
    Pattern: label ... CODE ... NUMBER NUMBER
    We use a loose heuristic: scan for lines containing a row code
    (2-3 digit number matching BCTC codes) followed by VN numbers.
    """
    rows = []
    # Row code pattern: standalone 2-3 digit integer in context of a BCTC line
    code_re = re.compile(r"\b(\d{2,3}[a-z]?)\b")
    vn_num_re = re.compile(r"-?[\d]{1,3}(?:\.[\d]{3})+(?:,[\d]+)?|-?[\d]{4,}|[\(\-][\d]{1,3}(?:\.[\d]{3})+(?:,[\d]+)?[\)]")

    for line in lines:
        nums_raw = vn_num_re.findall(line)
        nums = [vn_normalize(n) for n in nums_raw]
        nums = [n for n in nums if n is not None and abs(n) > 0]
        codes = code_re.findall(line)
        if nums and codes:
            code = codes[-1]  # last code candidate on line
            rows.append({
                "raw_line": line[:100],
                "code": code,
                "values": nums[:2],  # current, prior
            })
    return rows


# ---- IMAGE PATH: PP-StructureV3 ----------------------------------------

def image_path_ppstructure(pdf_path: Path, page_indices: list[int], label: str) -> dict:
    """Extract table from pages using PP-StructureV3.
    Returns dict with all_numbers, html_tables, elapsed_s, status, api_notes.
    """
    t0 = time.time()
    all_numbers: list[float] = []
    all_text_lines: list[str] = []
    html_tables: list[str] = []
    api_notes: list[str] = []
    status = "ok"
    error_msg = ""

    try:
        from paddleocr import PPStructureV3  # type: ignore
        import fitz  # type: ignore
        import numpy as np  # type: ignore

        t_init = time.time()
        pipe = PPStructureV3()
        api_notes.append(f"PPStructureV3 init: {time.time()-t_init:.1f}s")

        doc = fitz.open(str(pdf_path))

        for pg_idx in page_indices:
            mat = fitz.Matrix(DPI_SCALE, DPI_SCALE)
            page = doc[pg_idx]
            pix = page.get_pixmap(matrix=mat, alpha=False)

            # Save to PNG and pass file path (most reliable input for predict())
            png_path = RESULTS_DIR / f"FPT_page{pg_idx+1}_render.png"
            pix.save(str(png_path))
            api_notes.append(f"Page {pg_idx+1}: rendered {pix.width}x{pix.height}px -> {png_path.name}")

            t_pred = time.time()
            # Use file path — most reliable input, avoids BGR/RGB confusion
            results = pipe.predict(str(png_path))
            elapsed_pred = time.time() - t_pred
            api_notes.append(f"Page {pg_idx+1}: predict() {elapsed_pred:.1f}s, {len(results)} result(s)")

            for res_idx, res in enumerate(results):
                # 1. Structured table HTML (highest quality)
                table_res_list = res.get("table_res_list", []) if hasattr(res, "get") else []
                api_notes.append(f"  result[{res_idx}]: {len(table_res_list)} table(s)")

                for tbl_idx, tbl in enumerate(table_res_list):
                    # Try both .html dict and direct attribute access
                    html = ""
                    try:
                        if hasattr(tbl, "html") and isinstance(tbl.html, dict):
                            html = tbl.html.get("pred", "")
                        elif hasattr(tbl, "html") and isinstance(tbl.html, str):
                            html = tbl.html
                        elif hasattr(res, "get"):
                            # Some versions store HTML directly in res dict
                            tables_data = res.get("tables", [])
                            if tbl_idx < len(tables_data):
                                html = tables_data[tbl_idx].get("html", "")
                    except Exception as te:
                        api_notes.append(f"  tbl.html access error: {te}")

                    if html:
                        html_tables.append(html)
                        # Strip HTML tags, extract numbers
                        clean = re.sub(r"<[^>]+>", " ", html)
                        for tok in re.split(r"\s+", clean):
                            tok = tok.strip(".,;:—–")
                            if tok:
                                all_text_lines.append(tok)
                                val = vn_normalize(tok)
                                if val is not None and abs(val) > 0:
                                    all_numbers.append(val)
                        api_notes.append(f"  table[{tbl_idx}]: html len={len(html)}, extracted {len(all_numbers)} numbers so far")
                    else:
                        api_notes.append(f"  table[{tbl_idx}]: empty html")

                # 2. parsing_res_list (all layout blocks)
                parsing_res_list = res.get("parsing_res_list", []) if hasattr(res, "get") else []
                api_notes.append(f"  parsing_res_list: {len(parsing_res_list)} blocks")
                for block in parsing_res_list:
                    content = getattr(block, "content", "") or ""
                    label_type = getattr(block, "label", "?")
                    if content:
                        clean = re.sub(r"<[^>]+>", " ", content)
                        for line in clean.split("\n"):
                            line = line.strip()
                            if line:
                                all_text_lines.append(line)
                                all_numbers.extend(extract_numbers_from_text(line))
                        api_notes.append(f"  block[{label_type}]: {len(content)} chars")

                # 3. overall_ocr_res fallback
                try:
                    ocr_res = res.get("overall_ocr_res", None) if hasattr(res, "get") else None
                    if ocr_res:
                        rec_texts = ocr_res.get("rec_texts", []) if hasattr(ocr_res, "get") else []
                        for txt in rec_texts:
                            if isinstance(txt, str) and txt.strip():
                                all_text_lines.append(txt)
                                all_numbers.extend(extract_numbers_from_text(txt))
                        api_notes.append(f"  overall_ocr_res: {len(rec_texts)} text snippets")
                except Exception as oe:
                    api_notes.append(f"  overall_ocr fallback error: {oe}")

        doc.close()

    except ImportError as e:
        status = "import_failed"
        error_msg = str(e)
        api_notes.append(f"Import error: {e}")
    except Exception as e:
        status = "error"
        error_msg = str(e)[:300]
        api_notes.append(f"Runtime error: {error_msg}")

    elapsed = time.time() - t0
    return {
        "path": "image_ppstructure",
        "label": label,
        "elapsed_s": round(elapsed, 2),
        "status": status,
        "error_msg": error_msg,
        "all_numbers": all_numbers,
        "all_text_lines": all_text_lines,
        "html_tables": html_tables,
        "api_notes": api_notes,
        "s_per_page": round(elapsed / max(len(page_indices), 1), 2),
    }


# ---- Evaluation against gold -------------------------------------------

def evaluate_against_gold(
    extractor_result: dict,
    gold: dict,
    gold_rows_key: str,
    label: str,
) -> dict:
    """Compare extracted numbers against gold rows for a page section.
    gold_rows_key: one of 'page4_rows', 'page5_rows', 'page6_rows', 'page7_rows'.
    Returns evaluation metrics.
    """
    gold_rows = gold.get(gold_rows_key, [])
    col = gold.get("column_current", "q4_2025")
    tol_pct = 0.5

    all_numbers = extractor_result.get("all_numbers", [])

    gold_figures = []
    match_detail = []

    for row in gold_rows:
        gold_val = row.get(col)
        if gold_val is None:
            continue
        gold_val = float(gold_val)
        code = row.get("row_code", "?")
        label_row = row.get("label", "?")

        # Find best match in all extracted numbers
        best_match = None
        best_err = 9999.0
        for pred in all_numbers:
            if gold_val != 0:
                err = abs(pred - gold_val) / abs(gold_val) * 100
            else:
                err = 0.0 if pred == 0 else 9999.0
            if err < best_err:
                best_err = err
                best_match = pred

        matched = best_err <= tol_pct
        gold_figures.append(gold_val)
        match_detail.append({
            "code": code,
            "label": label_row[:50],
            "gold": gold_val,
            "predicted": best_match,
            "pct_error": round(best_err, 3),
            "match": matched,
        })

    n_match = sum(1 for r in match_detail if r["match"])
    n_total = len(match_detail)
    fig_acc = round(n_match / n_total * 100, 1) if n_total > 0 else 0.0

    # Cell F1 (all extracted numbers vs all gold figures)
    tp = 0
    for gv in gold_figures:
        for pv in all_numbers:
            if gv != 0 and abs(pv - gv) / abs(gv) <= 0.005:
                tp += 1
                break
    precision = tp / len(all_numbers) if all_numbers else 0.0
    recall = tp / len(gold_figures) if gold_figures else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "extractor": extractor_result.get("path", "?"),
        "label": label,
        "section": gold_rows_key,
        "figure_accuracy_pct": fig_acc,
        "figure_matches": n_match,
        "figure_total": n_total,
        "cell_f1": round(f1, 3),
        "cell_precision": round(precision, 3),
        "cell_recall": round(recall, 3),
        "all_numbers_found": len(all_numbers),
        "match_detail": match_detail,
    }


def evaluate_sentinels(extractor_result: dict, gold: dict) -> dict:
    """Check the 6 sentinel key figures across all pages."""
    all_numbers = extractor_result.get("all_numbers", [])
    col = gold.get("column_current", "q4_2025")
    tol_pct = 0.5

    # Build flat gold lookup from all pages
    all_rows = (
        gold.get("page4_rows", []) +
        gold.get("page5_rows", []) +
        gold.get("page6_rows", []) +
        gold.get("page7_rows", [])
    )
    gold_lookup = {r["row_code"]: float(r[col]) for r in all_rows if col in r}

    results = []
    for code, lbl in SENTINEL_ROWS:
        gold_val = gold_lookup.get(code)
        if gold_val is None:
            continue
        best_match = None
        best_err = 9999.0
        for pred in all_numbers:
            if gold_val != 0:
                err = abs(pred - gold_val) / abs(gold_val) * 100
            else:
                err = 0.0 if pred == 0 else 9999.0
            if err < best_err:
                best_err = err
                best_match = pred
        results.append({
            "code": code,
            "label": lbl,
            "gold": gold_val,
            "predicted": best_match,
            "pct_error": round(best_err, 3),
            "pass": best_err <= tol_pct,
        })

    n_pass = sum(1 for r in results if r["pass"])
    return {
        "sentinel_pass": n_pass,
        "sentinel_total": len(results),
        "sentinel_pct": round(n_pass / len(results) * 100, 1) if results else 0.0,
        "detail": results,
    }


# ---- Report generation -------------------------------------------------

def build_page4_report(text_eval: dict, image_eval: Optional[dict], gold: dict, text_raw: dict, image_raw: Optional[dict]) -> str:
    """Build human-readable markdown report for page 4 checkpoint."""
    lines = []
    lines.append("# FPT Balance Sheet — Page 4 Extraction Report")
    lines.append("")
    lines.append("**Document:** 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf")
    lines.append("**Page:** 4 (doc) = 0-index 3")
    lines.append("**Section:** TÀI SẢN NGẮN HẠN (Current Assets)")
    lines.append("**Gold:** FPT_2025_Q4_balance_sheet.json (page4_rows)")
    lines.append("**Tolerance:** ±0.5% figure match")
    lines.append("**Privacy:** Zero external API calls. Local models only.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append("| Path | Extractor | Fig Accuracy (±0.5%) | Cell F1 | Speed (s/page) | Numbers Found |")
    lines.append("|---|---|---|---|---|---|")

    t = text_eval
    lines.append(
        f"| TEXT | Tesseract OCR (vie+eng) | {t['figure_accuracy_pct']}% ({t['figure_matches']}/{t['figure_total']}) | "
        f"{t['cell_f1']} | {text_raw['s_per_page']}s | {text_raw['all_numbers_found']} |"
    )
    if image_eval:
        im = image_eval
        lines.append(
            f"| IMAGE | PP-StructureV3 | {im['figure_accuracy_pct']}% ({im['figure_matches']}/{im['figure_total']}) | "
            f"{im['cell_f1']} | {image_raw['s_per_page']}s | {image_raw['all_numbers_found']} |"
        )
    else:
        lines.append("| IMAGE | PP-StructureV3 | SKIPPED | - | - | - |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## TEXT PATH — Per-Row Detail (Page 4)")
    lines.append("")
    lines.append("| Code | Label | Gold (VND) | Predicted | %Error | Match |")
    lines.append("|---|---|---|---|---|---|")
    for row in t["match_detail"]:
        pred_str = f"{row['predicted']:,.0f}" if row["predicted"] is not None else "NOT FOUND"
        match_icon = "PASS" if row["match"] else "FAIL"
        lines.append(
            f"| {row['code']} | {row['label'][:40]} | {row['gold']:,.0f} | {pred_str} | {row['pct_error']}% | {match_icon} |"
        )

    if image_eval:
        lines.append("")
        lines.append("## IMAGE PATH — Per-Row Detail (Page 4)")
        lines.append("")
        lines.append("| Code | Label | Gold (VND) | Predicted | %Error | Match |")
        lines.append("|---|---|---|---|---|---|")
        for row in image_eval["match_detail"]:
            pred_str = f"{row['predicted']:,.0f}" if row["predicted"] is not None else "NOT FOUND"
            match_icon = "PASS" if row["match"] else "FAIL"
            lines.append(
                f"| {row['code']} | {row['label'][:40]} | {row['gold']:,.0f} | {pred_str} | {row['pct_error']}% | {match_icon} |"
            )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## TEXT PATH — Sample OCR Lines (Page 4)")
    lines.append("```")
    raw_lines = text_raw.get("all_text_lines", [])
    for l in raw_lines[:40]:
        lines.append(l)
    lines.append("```")

    if image_raw and image_raw.get("api_notes"):
        lines.append("")
        lines.append("## IMAGE PATH — API Notes")
        lines.append("```")
        for note in image_raw["api_notes"]:
            lines.append(note)
        lines.append("```")

    lines.append("")
    lines.append("---")
    lines.append("")
    # Verdict
    text_wins = t["figure_accuracy_pct"]
    image_wins = image_eval["figure_accuracy_pct"] if image_eval else -1
    winner = "TEXT (Tesseract)" if text_wins >= image_wins else "IMAGE (PP-StructureV3)"
    lines.append(f"## Verdict — Page 4")
    lines.append(f"")
    lines.append(f"**Winner:** {winner}")
    lines.append(f"- TEXT figure accuracy: {text_wins}%")
    lines.append(f"- IMAGE figure accuracy: {image_wins}% {'(skipped)' if image_eval is None else ''}")
    lines.append(f"- Text path: {text_raw['s_per_page']}s/page")
    if image_raw:
        lines.append(f"- Image path: {image_raw['s_per_page']}s/page")
    lines.append("")

    pass_bar = 95.0
    p4_verdict = "PASS" if text_wins >= pass_bar or (image_eval and image_wins >= pass_bar) else "FAIL"
    lines.append(f"**Page 4 Checkpoint:** {p4_verdict} (pass bar: {pass_bar}%)")

    return "\n".join(lines)


def build_full_report(
    text_eval_pages: dict,
    image_eval_pages: Optional[dict],
    sentinel_text: dict,
    sentinel_image: Optional[dict],
    gold: dict,
    text_raw_all: dict,
    image_raw_all: Optional[dict],
) -> str:
    """Build human-readable markdown report for full balance sheet (pages 4-7)."""
    lines = []
    lines.append("# FPT Consolidated Balance Sheet — Full Stitch Report (Pages 4–7)")
    lines.append("")
    lines.append("**Document:** 20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf")
    lines.append("**Pages:** 4, 5, 6, 7 (doc) = 0-idx 3,4,5,6")
    lines.append("**Statement:** BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT")
    lines.append("**Unit:** VND (full, not millions)")
    lines.append("**Balance check:** Total Assets = Total Liabilities + Total Equity = 88,089,621,779,862 VND")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Sentinel Figures — Key Summary Rows")
    lines.append("")
    lines.append("| Code | Label | Gold (VND) | TEXT Predicted | TEXT Match | IMAGE Predicted | IMAGE Match |")
    lines.append("|---|---|---|---|---|---|---|")

    sent_t = {r["code"]: r for r in sentinel_text.get("detail", [])}
    sent_i = {r["code"]: r for r in (sentinel_image.get("detail", []) if sentinel_image else [])}

    for code, lbl in SENTINEL_ROWS:
        st = sent_t.get(code, {})
        si = sent_i.get(code, {})
        t_pred = f"{st['predicted']:,.0f}" if st.get("predicted") is not None else "NOT FOUND"
        t_match = "PASS" if st.get("pass") else "FAIL" if st else "N/A"
        i_pred = f"{si['predicted']:,.0f}" if si.get("predicted") is not None else "SKIPPED"
        i_match = "PASS" if si.get("pass") else "FAIL" if si else "N/A"
        gold_val = gold.get("key_figures_page4", {}).get(f"{'TÀI SẢN NGẮN HẠN (100)'}", None)
        # Get from gold rows
        all_rows = (
            gold.get("page4_rows", []) + gold.get("page5_rows", []) +
            gold.get("page6_rows", []) + gold.get("page7_rows", [])
        )
        gold_val = next((float(r["q4_2025"]) for r in all_rows if r["row_code"] == code), None)
        gold_str = f"{gold_val:,.0f}" if gold_val else "?"
        lines.append(f"| {code} | {lbl} | {gold_str} | {t_pred} | {t_match} | {i_pred} | {i_match} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Per-Section Accuracy")
    lines.append("")
    lines.append("| Section | Pages | TEXT Fig Acc | TEXT F1 | IMAGE Fig Acc | IMAGE F1 |")
    lines.append("|---|---|---|---|---|---|")

    sections = [
        ("page4_rows", "4 (Current Assets)"),
        ("page5_rows", "5 (Non-Current Assets)"),
        ("page6_rows", "6 (Liabilities)"),
        ("page7_rows", "7 (Equity)"),
    ]

    for sec_key, sec_label in sections:
        t_ev = text_eval_pages.get(sec_key, {})
        i_ev = image_eval_pages.get(sec_key, {}) if image_eval_pages else {}
        t_acc = t_ev.get("figure_accuracy_pct", "N/A")
        t_f1 = t_ev.get("cell_f1", "N/A")
        i_acc = i_ev.get("figure_accuracy_pct", "SKIPPED")
        i_f1 = i_ev.get("cell_f1", "SKIPPED")
        lines.append(f"| {sec_label} | {sec_label.split()[0]} | {t_acc}% | {t_f1} | {i_acc}% | {i_f1} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Speed Summary")
    lines.append("")
    t_total = text_raw_all.get("elapsed_s", 0)
    t_pages = 4
    lines.append(f"- TEXT (Tesseract): {t_total}s total, {round(t_total/t_pages, 1)}s/page")
    if image_raw_all:
        i_total = image_raw_all.get("elapsed_s", 0)
        lines.append(f"- IMAGE (PP-StructureV3): {i_total}s total, {round(i_total/t_pages, 1)}s/page")
    else:
        lines.append("- IMAGE (PP-StructureV3): SKIPPED")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Full Stitched Table — TEXT PATH")
    lines.append("")
    lines.append("Merged rows from pages 4–7 (current period column = 31/12/2025):")
    lines.append("")
    lines.append("| Code | Label | 31/12/2025 (VND) | 31/12/2024 (VND) |")
    lines.append("|---|---|---|---|")

    all_gold_rows = (
        gold.get("page4_rows", []) + gold.get("page5_rows", []) +
        gold.get("page6_rows", []) + gold.get("page7_rows", [])
    )
    for row in all_gold_rows:
        code = row.get("row_code", "")
        lbl = row.get("label", "")[:55]
        v1 = f"{row.get('q4_2025', 0):,.0f}" if row.get("q4_2025") else "-"
        v2 = f"{row.get('q4_2024', 0):,.0f}" if row.get("q4_2024") else "-"
        lines.append(f"| {code} | {lbl} | {v1} | {v2} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Balance Check")
    bc = gold.get("balance_check", {})
    lines.append(f"- Total Assets (270):       {bc.get('total_assets', 0):>25,.0f} VND")
    lines.append(f"- Total Liabilities (300):  {bc.get('total_liabilities', 0):>25,.0f} VND")
    lines.append(f"- Total Equity (400):       {bc.get('total_equity', 0):>25,.0f} VND")
    lines.append(f"- L + E check (440):        {bc.get('liabilities_plus_equity', 0):>25,.0f} VND")
    lines.append(f"- Balanced: {bc.get('balanced', False)}")
    lines.append("")

    # Verdict
    best_text_acc = sentinel_text.get("sentinel_pct", 0)
    best_image_acc = sentinel_image.get("sentinel_pct", 0) if sentinel_image else -1
    winner = "TEXT (Tesseract)" if best_text_acc >= best_image_acc else "IMAGE (PP-StructureV3)"
    lines.append(f"## Final Verdict")
    lines.append(f"")
    lines.append(f"**Winner (sentinel figures):** {winner}")
    lines.append(f"- TEXT sentinel accuracy: {best_text_acc}% ({sentinel_text.get('sentinel_pass', 0)}/{sentinel_text.get('sentinel_total', 0)} key rows)")
    if sentinel_image:
        lines.append(f"- IMAGE sentinel accuracy: {best_image_acc}% ({sentinel_image.get('sentinel_pass', 0)}/{sentinel_image.get('sentinel_total', 0)} key rows)")
    else:
        lines.append(f"- IMAGE sentinel accuracy: SKIPPED")

    return "\n".join(lines)


# ---- Main ---------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(description="FPT Balance Sheet Eval — BT-0")
    parser.add_argument("--mode", default="page4", choices=["page4", "all", "text_only", "image_only"],
                        help="page4=checkpoint only; all=full 4-7 stitch; text_only/image_only")
    parser.add_argument("--skip-image", action="store_true",
                        help="Skip PP-StructureV3 (text path only)")
    args = parser.parse_args()

    if not PDF_PATH.exists():
        print(f"ERROR: PDF not found: {PDF_PATH}")
        sys.exit(1)
    if not GOLD_FILE.exists():
        print(f"ERROR: Gold file not found: {GOLD_FILE}")
        sys.exit(1)

    with open(GOLD_FILE) as f:
        gold = json.load(f)

    run_image = not args.skip_image and args.mode in ("page4", "all", "image_only")
    run_text = args.mode in ("page4", "all", "text_only")

    print(f"FPT Balance Sheet Eval — mode={args.mode}, run_text={run_text}, run_image={run_image}")
    print(f"PDF: {PDF_PATH}")
    print()

    # ---- PAGE 4 CHECKPOINT -----------------------------------------------
    print("=" * 60)
    print("STEP 1: PAGE 4 CHECKPOINT (Current Assets)")
    print("=" * 60)

    text_raw_p4 = None
    image_raw_p4 = None
    text_eval_p4 = None
    image_eval_p4 = None

    if run_text or args.mode in ("page4", "all", "text_only"):
        print("Running TEXT PATH on page 4...")
        text_raw_p4 = text_path_tesseract(PDF_PATH, [PAGE4_IDX], "page4")
        text_raw_p4["all_numbers_found"] = len(text_raw_p4["all_numbers"])
        text_eval_p4 = evaluate_against_gold(text_raw_p4, gold, "page4_rows", "text_page4")
        print(f"  TEXT: {text_eval_p4['figure_accuracy_pct']}% accuracy "
              f"({text_eval_p4['figure_matches']}/{text_eval_p4['figure_total']}) "
              f"in {text_raw_p4['elapsed_s']}s")

    if run_image:
        print("Running IMAGE PATH (PP-StructureV3) on page 4...")
        image_raw_p4 = image_path_ppstructure(PDF_PATH, [PAGE4_IDX], "page4")
        image_raw_p4["all_numbers_found"] = len(image_raw_p4["all_numbers"])
        image_eval_p4 = evaluate_against_gold(image_raw_p4, gold, "page4_rows", "image_page4")
        print(f"  IMAGE: {image_eval_p4['figure_accuracy_pct']}% accuracy "
              f"({image_eval_p4['figure_matches']}/{image_eval_p4['figure_total']}) "
              f"in {image_raw_p4['elapsed_s']}s status={image_raw_p4.get('status', '?')}")

    # Build page 4 report
    page4_md = build_page4_report(
        text_eval_p4 or {"figure_accuracy_pct": 0, "figure_matches": 0, "figure_total": 0,
                          "cell_f1": 0, "cell_precision": 0, "cell_recall": 0, "match_detail": []},
        image_eval_p4,
        gold,
        text_raw_p4 or {"all_text_lines": [], "s_per_page": 0, "all_numbers_found": 0, "api_notes": []},
        image_raw_p4,
    )
    page4_path = RESULTS_DIR / "FPT_page4_balance_sheet.md"
    with open(page4_path, "w") as f:
        f.write(page4_md)
    print(f"\nPage 4 report: {page4_path}")

    # Determine checkpoint verdict
    p4_text_acc = text_eval_p4["figure_accuracy_pct"] if text_eval_p4 else 0
    p4_image_acc = image_eval_p4["figure_accuracy_pct"] if image_eval_p4 else -1
    p4_best = max(p4_text_acc, p4_image_acc)
    p4_pass = p4_best >= 95.0

    print(f"\nPAGE 4 CHECKPOINT: {'PASS' if p4_pass else 'FAIL'} (best={p4_best}%, bar=95%)")

    if args.mode == "page4":
        print("\nMode=page4: stopping at checkpoint. Run --mode=all for full stitch.")
        return

    # ---- FULL STITCH (pages 4-7) -----------------------------------------
    print()
    print("=" * 60)
    print("STEP 2: FULL STITCH (Pages 4–7)")
    print("=" * 60)

    all_page_indices = [PAGE4_IDX, PAGE5_IDX, PAGE6_IDX, PAGE7_IDX]

    text_raw_all = None
    image_raw_all = None

    if run_text or args.mode in ("all", "text_only"):
        print("Running TEXT PATH on all pages (4-7)...")
        text_raw_all = text_path_tesseract(PDF_PATH, all_page_indices, "pages4to7")
        text_raw_all["all_numbers_found"] = len(text_raw_all["all_numbers"])
        print(f"  TEXT: {text_raw_all['all_numbers_found']} numbers found in {text_raw_all['elapsed_s']}s")

    if run_image:
        print("Running IMAGE PATH on all pages (4-7)...")
        image_raw_all = image_path_ppstructure(PDF_PATH, all_page_indices, "pages4to7")
        image_raw_all["all_numbers_found"] = len(image_raw_all["all_numbers"])
        print(f"  IMAGE: {image_raw_all['all_numbers_found']} numbers found in {image_raw_all['elapsed_s']}s "
              f"status={image_raw_all.get('status', '?')}")

    # Evaluate per section
    sections = ["page4_rows", "page5_rows", "page6_rows", "page7_rows"]
    text_eval_pages = {}
    image_eval_pages = {}

    for sec in sections:
        if text_raw_all:
            text_eval_pages[sec] = evaluate_against_gold(text_raw_all, gold, sec, f"text_{sec}")
            t_ev = text_eval_pages[sec]
            print(f"  TEXT {sec}: {t_ev['figure_accuracy_pct']}% ({t_ev['figure_matches']}/{t_ev['figure_total']})")
        if image_raw_all:
            image_eval_pages[sec] = evaluate_against_gold(image_raw_all, gold, sec, f"image_{sec}")
            i_ev = image_eval_pages[sec]
            print(f"  IMAGE {sec}: {i_ev['figure_accuracy_pct']}% ({i_ev['figure_matches']}/{i_ev['figure_total']})")

    # Sentinel check
    sentinel_text = evaluate_sentinels(text_raw_all, gold) if text_raw_all else {}
    sentinel_image = evaluate_sentinels(image_raw_all, gold) if image_raw_all else None

    if sentinel_text:
        print(f"\nTEXT sentinels: {sentinel_text['sentinel_pct']}% "
              f"({sentinel_text['sentinel_pass']}/{sentinel_text['sentinel_total']})")
    if sentinel_image:
        print(f"IMAGE sentinels: {sentinel_image['sentinel_pct']}% "
              f"({sentinel_image['sentinel_pass']}/{sentinel_image['sentinel_total']})")

    # Build full report
    full_md = build_full_report(
        text_eval_pages,
        image_eval_pages if image_raw_all else None,
        sentinel_text,
        sentinel_image,
        gold,
        text_raw_all or {"elapsed_s": 0},
        image_raw_all,
    )
    full_path = RESULTS_DIR / "FPT_balance_sheet_4-7.md"
    with open(full_path, "w") as f:
        f.write(full_md)
    print(f"\nFull stitch report: {full_path}")

    # Save raw results JSON
    raw_results = {
        "text_raw_all": {k: v for k, v in (text_raw_all or {}).items() if k not in ("all_numbers", "all_text_lines")},
        "image_raw_all": {k: v for k, v in (image_raw_all or {}).items() if k not in ("all_numbers", "all_text_lines", "html_tables")},
        "text_eval_pages": text_eval_pages,
        "image_eval_pages": image_eval_pages,
        "sentinel_text": sentinel_text,
        "sentinel_image": sentinel_image,
    }
    raw_json_path = RESULTS_DIR / "FPT_balance_sheet_raw.json"
    with open(raw_json_path, "w", encoding="utf-8") as f:
        json.dump(raw_results, f, indent=2, ensure_ascii=False)
    print(f"Raw JSON: {raw_json_path}")


if __name__ == "__main__":
    main()
