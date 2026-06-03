"""
Unit tests for the cover-letter / full-statement title classifier.

FIX-CTG-2 (BCTC-FETCH-CORRECTNESS): verifies that
  - Cover-letter titles (CV CBTT, Công văn CBTT, CBTT link BCTC, …) are
    SKIPPED by is_cover_letter_title() and score rank=99 from _title_rank().
  - Full-statement titles (BCTC Hợp nhất, Báo cáo tài chính, …) pass
    is_full_statement_title() and score rank=0 (consolidated) or rank=1.
  - _parse_article_ids_and_titles() selects the full-statement article over a
    cover-letter article when both appear on the same HTML page.

Run:
    python3 -m pytest vps-scripts/test_discover_bctc_title_classifier.py -v
  or:
    python3 vps-scripts/test_discover_bctc_title_classifier.py
"""

import sys
import os
import types

# ---------------------------------------------------------------------------
# Import the classifier functions from the production script without executing
# its __main__ block.  The script is not a package; we load it as a module.
# ---------------------------------------------------------------------------
import importlib.util

_SCRIPT = os.path.join(os.path.dirname(__file__), "discover-bctc-urls-browser.py")
_spec = importlib.util.spec_from_file_location("discover_bctc", _SCRIPT)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

is_cover_letter_title = _mod.is_cover_letter_title
is_full_statement_title = _mod.is_full_statement_title
is_consolidated_title = _mod.is_consolidated_title
_title_rank = _mod._title_rank
_parse_article_ids_and_titles = _mod._parse_article_ids_and_titles


# ---------------------------------------------------------------------------
# is_cover_letter_title — positive cases (should return True)
# ---------------------------------------------------------------------------

def test_cover_letter_cv_cbtt_ascii():
    """'CV CBTT BCTC Quy I.2026' is the canonical cover-letter pattern."""
    assert is_cover_letter_title("CV CBTT BCTC Quy I.2026 VI") is True


def test_cover_letter_cv_cbtt_lowercase():
    assert is_cover_letter_title("cv cbtt bctc quy 1.2025") is True


def test_cover_letter_cong_van_cbtt_with_diacritics():
    assert is_cover_letter_title("Công văn CBTT Quy II 2025") is True


def test_cover_letter_cong_van_cbtt_no_diacritics():
    assert is_cover_letter_title("cong van cbtt quy 3 nam 2024") is True


def test_cover_letter_cbtt_link_bctc():
    assert is_cover_letter_title("CBTT link BCTC Quy IV.2024") is True


def test_cover_letter_cbtt_kem_link():
    assert is_cover_letter_title("CBTT kem link Quy I 2026") is True


def test_cover_letter_cong_van_full_phrase():
    assert is_cover_letter_title("Công văn công bố thông tin đính kèm BCTC 2025") is True


# ---------------------------------------------------------------------------
# is_cover_letter_title — negative cases (should return False)
# ---------------------------------------------------------------------------

def test_full_statement_bctc_hop_nhat():
    """Core case: the real CTG Q1 2026 full consolidated statement title.
    The sub-clause 'va giai trinh bien dong loi nhuan' is part of the financial
    statement filename — 'giai trinh' here is NOT a cover-letter signal."""
    assert is_cover_letter_title(
        "BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan signed"
    ) is False


def test_full_statement_bao_cao_tai_chinh():
    assert is_cover_letter_title("Báo cáo tài chính hợp nhất Quý I năm 2026") is False


def test_full_statement_bctc_rieng_le():
    assert is_cover_letter_title("BCTC rieng le Quy I.2026 signed") is False


def test_full_statement_annual():
    assert is_cover_letter_title("BCTC hop nhat kiem toan nam 2025") is False


# ---------------------------------------------------------------------------
# is_full_statement_title
# ---------------------------------------------------------------------------

def test_full_statement_positive_bctc():
    assert is_full_statement_title("BCTC hop nhat Quy I.2026") is True


def test_full_statement_positive_bao_cao():
    assert is_full_statement_title("Báo cáo tài chính quý I 2026") is True


def test_full_statement_negative_cover_letter():
    """'CV CBTT BCTC …' mentions 'bctc' but is still NOT a full statement."""
    assert is_full_statement_title("CV CBTT BCTC Quy I.2026 VI") is False


def test_full_statement_negative_no_kw():
    assert is_full_statement_title("Thông báo đại hội đồng cổ đông 2026") is False


# ---------------------------------------------------------------------------
# _title_rank
# ---------------------------------------------------------------------------

def test_rank_consolidated_is_best():
    assert _title_rank("BCTC hop nhat Quy I.2026") == 0


def test_rank_full_statement_non_consolidated():
    assert _title_rank("BCTC rieng le Quy I.2026") == 1


def test_rank_cover_letter_is_worst():
    assert _title_rank("CV CBTT BCTC Quy I.2026 VI") == 99


def test_rank_generic_match():
    """A title that passes quarter/year but has no financial-statement keyword."""
    assert _title_rank("Biên bản họp HĐQT Quý I 2026") == 2


# ---------------------------------------------------------------------------
# _parse_article_ids_and_titles — integration: HTML page with both a cover
# letter and a full statement; the full statement must win.
# ---------------------------------------------------------------------------

def _make_hnx_html(rows):
    """
    Build a minimal HNX-format HTML fragment with the given rows.
    Each row: (code_slug, article_id, title)
    """
    parts = []
    for slug, aid, title in rows:
        parts.append(
            f'<a href="/cophieu-etfs/chi-tiet-chung-khoan-ny-{slug}.html">{slug.upper()}</a>'
            f' funcShowFileAttach({aid}, 1) '
            f'<a class="hrefViewDetail" href="#">{title}</a>'
        )
    return "\n".join(parts)


def test_parse_skips_cover_letter_selects_full_statement():
    """
    Page has two CTG articles for Q1 2026.
    HNX article listing uses digit "1" in titles (not Roman numeral I), which
    is what matches_quarter_and_year expects.

      - article 1001: cover letter "CV CBTT BCTC Quy 1.2026"  (should be SKIPPED)
      - article 1002: full statement "BCTC hop nhat Quy 1.2026"  (should be SELECTED)
    Expected: returns 1002.
    """
    html = _make_hnx_html([
        ("ctg12345", 1001, "CV CBTT BCTC Quy 1.2026 VI"),
        ("ctg12345", 1002, "BCTC hop nhat Quy 1.2026 signed"),
    ])
    result = _parse_article_ids_and_titles(html, "CTG", 2026, "Q1")
    assert result == 1002, f"Expected 1002 (full statement), got {result}"


def test_parse_cover_letter_only_returns_none():
    """
    Page has ONLY a cover letter; no full-statement article exists.
    Expected: returns None (caller will move to next page / next source).
    """
    html = _make_hnx_html([
        ("ctg12345", 1001, "CV CBTT BCTC Quy 1.2026 VI"),
    ])
    result = _parse_article_ids_and_titles(html, "CTG", 2026, "Q1")
    assert result is None, f"Expected None (cover letter skipped), got {result}"


def test_parse_prefers_consolidated_over_standalone():
    """
    Page has standalone + consolidated full statements; consolidated must win.
    """
    html = _make_hnx_html([
        ("ctg12345", 2001, "BCTC rieng le Quy 1.2026 signed"),
        ("ctg12345", 2002, "BCTC hop nhat Quy 1.2026 signed"),
    ])
    result = _parse_article_ids_and_titles(html, "CTG", 2026, "Q1")
    assert result == 2002, f"Expected 2002 (consolidated), got {result}"


def test_parse_cover_letter_then_consolidated_then_standalone():
    """
    All three types present; consolidated full statement must win.
    """
    html = _make_hnx_html([
        ("ctg12345", 3001, "CV CBTT BCTC Quy 1.2026 VI"),
        ("ctg12345", 3002, "BCTC rieng le Quy 1.2026 signed"),
        ("ctg12345", 3003, "BCTC hop nhat Quy 1.2026 signed"),
    ])
    result = _parse_article_ids_and_titles(html, "CTG", 2026, "Q1")
    assert result == 3003, f"Expected 3003 (consolidated), got {result}"


def test_parse_wrong_ticker_ignored():
    """Articles for a different ticker must not match."""
    html = _make_hnx_html([
        ("shb99999", 9001, "BCTC hop nhat Quy I.2026 signed"),
    ])
    result = _parse_article_ids_and_titles(html, "CTG", 2026, "Q1")
    assert result is None


def test_parse_wrong_quarter_ignored():
    """Article for Q2 must not match a Q1 query."""
    html = _make_hnx_html([
        ("ctg12345", 8001, "BCTC hop nhat Quy II.2026 signed"),
    ])
    result = _parse_article_ids_and_titles(html, "CTG", 2026, "Q1")
    assert result is None


# ---------------------------------------------------------------------------
# Self-runner (no pytest dependency required on VPS)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    tests = [
        test_cover_letter_cv_cbtt_ascii,
        test_cover_letter_cv_cbtt_lowercase,
        test_cover_letter_cong_van_cbtt_with_diacritics,
        test_cover_letter_cong_van_cbtt_no_diacritics,
        test_cover_letter_cbtt_link_bctc,
        test_cover_letter_cbtt_kem_link,
        test_cover_letter_cong_van_full_phrase,
        test_full_statement_bctc_hop_nhat,
        test_full_statement_bao_cao_tai_chinh,
        test_full_statement_bctc_rieng_le,
        test_full_statement_annual,
        test_full_statement_positive_bctc,
        test_full_statement_positive_bao_cao,
        test_full_statement_negative_cover_letter,
        test_full_statement_negative_no_kw,
        test_rank_consolidated_is_best,
        test_rank_full_statement_non_consolidated,
        test_rank_cover_letter_is_worst,
        test_rank_generic_match,
        test_parse_skips_cover_letter_selects_full_statement,
        test_parse_cover_letter_only_returns_none,
        test_parse_prefers_consolidated_over_standalone,
        test_parse_cover_letter_then_consolidated_then_standalone,
        test_parse_wrong_ticker_ignored,
        test_parse_wrong_quarter_ignored,
    ]

    passed = 0
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except Exception:
            print(f"  FAIL  {fn.__name__}")
            traceback.print_exc()
            failed += 1

    print(f"\n{passed}/{passed + failed} passed")
    sys.exit(0 if failed == 0 else 1)
