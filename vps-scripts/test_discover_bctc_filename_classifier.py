"""
Unit tests for filename-based cover-letter detection.

FU-CTG-DISCOVERY-FILENAME-FILTER (BCTC-EXTRACT-QUALITY): verifies that
  - is_cover_letter_filename() flags resolved PDF filenames containing
    CV_CBTT / cong_van_cbtt markers (case-insensitive), independent of the
    article TITLE that pointed at the attachment.
  - _fetch_pdf_url() applies this filename filter after ArticlesFileAttach
    resolution: a good-titled article (e.g. "Bao cao tai chinh quy 1/2026")
    whose resolved PDF is CV_CBTT_BCTC_Quy_I.2026_VI.pdf must NOT be
    returned — same disposition as the pre-existing title-based filter
    (FIX-CTG-2, see test_discover_bctc_title_classifier.py).
  - When an article's ArticlesFileAttach response lists multiple candidate
    hrefs, the cover-letter one is skipped and a later non-cover-letter
    href in the same response is still returned.

Run:
    python3 -m pytest vps-scripts/test_discover_bctc_filename_classifier.py -v
  or:
    python3 vps-scripts/test_discover_bctc_filename_classifier.py
"""

import sys
import os

# ---------------------------------------------------------------------------
# Import the classifier + fetch functions from the production script without
# executing its __main__ block. The script is not a package; load as module.
# ---------------------------------------------------------------------------
import importlib.util

_SCRIPT = os.path.join(os.path.dirname(__file__), "discover-bctc-urls-browser.py")
_spec = importlib.util.spec_from_file_location("discover_bctc_filename", _SCRIPT)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

is_cover_letter_filename = _mod.is_cover_letter_filename
_fetch_pdf_url = _mod._fetch_pdf_url


# ---------------------------------------------------------------------------
# is_cover_letter_filename — positive cases (should return True)
# ---------------------------------------------------------------------------

def test_filename_cv_cbtt_real_ctg_case():
    """The exact filename from the FU-CTG-DISCOVERY-FILENAME-FILTER finding."""
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/CV_CBTT_BCTC_Quy_I.2026_VI.pdf"
    ) is True


def test_filename_cv_cbtt_lowercase():
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/cv_cbtt_bctc_quy_i.2026_vi.pdf"
    ) is True


def test_filename_cv_cbtt_mixed_case():
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/Cv_Cbtt_Bctc_Quy_I.2026_Vi.pdf"
    ) is True


def test_filename_cong_van_cbtt():
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/cong_van_cbtt_quy_1_2026.pdf"
    ) is True


def test_filename_cong_van_cbtt_uppercase():
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/CONG_VAN_CBTT_QUY_1_2026.PDF"
    ) is True


def test_filename_marker_with_query_string():
    """Query strings after the filename must not defeat the check."""
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/CV_CBTT_BCTC_Quy_I.2026_VI.pdf?token=abc123"
    ) is True


def test_filename_marker_url_encoded():
    """URL-encoded filenames (e.g. spaces as %20) must be decoded before matching."""
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/CV%5FCBTT%5FBCTC.pdf"
    ) is True


# ---------------------------------------------------------------------------
# is_cover_letter_filename — negative cases (should return False)
# ---------------------------------------------------------------------------

def test_filename_full_statement_hop_nhat():
    """A real consolidated-statement filename must NOT be flagged."""
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/BCTC_Hop_Nhat_Quy_I.2026.pdf"
    ) is False


def test_filename_no_marker():
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/CTG_BCTC_Q1_2026.pdf"
    ) is False


def test_filename_empty_string():
    assert is_cover_letter_filename("") is False


def test_filename_cbtt_alone_not_flagged():
    """Bare 'cbtt' (without the cv_/cong_van_ prefix) is not a filename marker
    — mirrors the title-filter's narrower keyword set; avoids over-matching
    filenames that merely mention CBTT in a longer descriptive name."""
    assert is_cover_letter_filename(
        "https://owa.hnx.vn/ftp/2026/BCTC_CBTT_Quy_I.2026.pdf"
    ) is False


# ---------------------------------------------------------------------------
# _fetch_pdf_url — integration: ArticlesFileAttach response parsing +
# filename-based rejection, independent of the article title.
# ---------------------------------------------------------------------------

def _fake_attach_html(hrefs):
    return "\n".join(f'<a href="{h}">download</a>' for h in hrefs)


def test_fetch_pdf_url_rejects_sole_cover_letter_attachment(monkeypatch):
    """
    Simulates the exact FU-CTG-DISCOVERY-FILENAME-FILTER finding: article
    613699 has a good title but ArticlesFileAttach resolves to ONLY a
    cover-letter PDF. Expected: None (caller falls through to next page /
    next source, same as when the title filter fires).
    """
    html = _fake_attach_html([
        "https://owa.hnx.vn/ftp/2026/CV_CBTT_BCTC_Quy_I.2026_VI.pdf",
    ])
    monkeypatch.setattr(_mod, "_http_post", lambda *a, **kw: html)
    result = _fetch_pdf_url(613699)
    assert result is None, f"Expected None (cover-letter-only attachment rejected), got {result}"


def test_fetch_pdf_url_skips_cover_letter_returns_real_statement(monkeypatch):
    """
    ArticlesFileAttach lists TWO attachments for one article: a cover letter
    first, then the real consolidated statement. The cover letter must be
    skipped and the real statement returned.
    """
    html = _fake_attach_html([
        "https://owa.hnx.vn/ftp/2026/CV_CBTT_BCTC_Quy_I.2026_VI.pdf",
        "https://owa.hnx.vn/ftp/2026/BCTC_Hop_Nhat_Quy_I.2026.pdf",
    ])
    monkeypatch.setattr(_mod, "_http_post", lambda *a, **kw: html)
    result = _fetch_pdf_url(613699)
    assert result == "https://owa.hnx.vn/ftp/2026/BCTC_Hop_Nhat_Quy_I.2026.pdf", (
        f"Expected the non-cover-letter statement URL, got {result}"
    )


def test_fetch_pdf_url_returns_clean_attachment_unchanged():
    """No cover-letter marker present — pre-existing behaviour unaffected."""
    import types
    html = _fake_attach_html([
        "https://owa.hnx.vn/ftp/2026/CTG_BCTC_Q1_2026.pdf",
    ])
    orig = _mod._http_post
    _mod._http_post = lambda *a, **kw: html
    try:
        result = _fetch_pdf_url(999999)
    finally:
        _mod._http_post = orig
    assert result == "https://owa.hnx.vn/ftp/2026/CTG_BCTC_Q1_2026.pdf"


def test_fetch_pdf_url_no_hrefs_returns_none():
    orig = _mod._http_post
    _mod._http_post = lambda *a, **kw: "<html>no attachments</html>"
    try:
        result = _fetch_pdf_url(1)
    finally:
        _mod._http_post = orig
    assert result is None


# ---------------------------------------------------------------------------
# Self-runner (no pytest dependency required on VPS)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    class _FakeMonkeypatch:
        """Minimal monkeypatch.setattr stand-in for the self-runner (no pytest)."""
        def __init__(self):
            self._restores = []

        def setattr(self, obj, name, value):
            self._restores.append((obj, name, getattr(obj, name)))
            setattr(obj, name, value)

        def undo(self):
            for obj, name, old in reversed(self._restores):
                setattr(obj, name, old)

    def _run_with_monkeypatch(fn):
        mp = _FakeMonkeypatch()
        try:
            fn(mp)
        finally:
            mp.undo()

    tests = [
        test_filename_cv_cbtt_real_ctg_case,
        test_filename_cv_cbtt_lowercase,
        test_filename_cv_cbtt_mixed_case,
        test_filename_cong_van_cbtt,
        test_filename_cong_van_cbtt_uppercase,
        test_filename_marker_with_query_string,
        test_filename_marker_url_encoded,
        test_filename_full_statement_hop_nhat,
        test_filename_no_marker,
        test_filename_empty_string,
        test_filename_cbtt_alone_not_flagged,
        test_fetch_pdf_url_returns_clean_attachment_unchanged,
        test_fetch_pdf_url_no_hrefs_returns_none,
    ]
    mp_tests = [
        test_fetch_pdf_url_rejects_sole_cover_letter_attachment,
        test_fetch_pdf_url_skips_cover_letter_returns_real_statement,
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

    for fn in mp_tests:
        try:
            _run_with_monkeypatch(fn)
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except Exception:
            print(f"  FAIL  {fn.__name__}")
            traceback.print_exc()
            failed += 1

    print(f"\n{passed}/{passed + failed} passed")
    sys.exit(0 if failed == 0 else 1)
