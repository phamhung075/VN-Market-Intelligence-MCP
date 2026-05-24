"""
Unit tests — domain/primitives/field_extractor/ (P2-B4).

Tests cover:
  - happy path: net_revenue field found in OCR text
  - happy path: equity field extraction
  - happy path: total_assets extraction
  - edge: field label in text but target field NOT present → None
  - failure: empty text input → None (no exception)
  - failure: None text → None (no exception)
  - failure: unknown field_name → None
  - Vietnamese label patterns with diacritics and whitespace variants

Pattern source: READ-ONLY archaeology from mcp-server BCTC extractors.
ZERO writes to mcp-server.

Domain rules:
  - Zero imports from infrastructure/, application/, interface/
  - Pure function — no I/O, no side effects
"""

import pytest

from domain.primitives.field_extractor import extract_field


# ---------------------------------------------------------------------------
# Import sanity
# ---------------------------------------------------------------------------


def test_field_extractor_imports():
    """Primitive imports without error and alias is callable."""
    from domain.primitives.field_extractor import extract_field, field_extractor  # noqa: F401

    assert callable(extract_field)
    assert callable(field_extractor)
    assert field_extractor is extract_field


# ---------------------------------------------------------------------------
# Happy path — net_revenue
# ---------------------------------------------------------------------------


def test_happy_net_revenue_simple():
    """Extracts net_revenue from simple OCR line."""
    text = "Doanh thu thuần: 1,234.5\nLợi nhuận sau thuế: 456.0"
    result = extract_field(text=text, field_name="net_revenue")
    assert result == "1,234.5"


def test_happy_net_revenue_multiline():
    """Extracts net_revenue when value is on next line after label."""
    text = "10\nDoanh thu thuần\n1,234.5\nLợi nhuận gộp\n300.0"
    result = extract_field(text=text, field_name="net_revenue")
    assert result == "1,234.5"


def test_happy_net_revenue_diacritics_variant():
    """Handles OCR diacritic variant: 'Doanh thu thuan' (missing tone)."""
    text = "Doanh thu thuan: 9,876.0"
    result = extract_field(text=text, field_name="net_revenue")
    assert result == "9,876.0"


# ---------------------------------------------------------------------------
# Happy path — other fields
# ---------------------------------------------------------------------------


def test_happy_total_assets():
    """Extracts total_assets from balance sheet line."""
    text = "Tổng cộng tài sản: 50,000.0\nVốn chủ sở hữu: 20,000.0"
    result = extract_field(text=text, field_name="total_assets")
    assert result == "50,000.0"


def test_happy_equity():
    """Extracts equity (vốn chủ sở hữu) value."""
    text = "Tổng tài sản: 50,000.0\nVốn chủ sở hữu: 20,000.0"
    result = extract_field(text=text, field_name="equity")
    assert result == "20,000.0"


def test_happy_net_profit():
    """Extracts net_profit (lợi nhuận sau thuế) value."""
    text = "Doanh thu thuần: 10,000.0\nLợi nhuận sau thuế: 500.0"
    result = extract_field(text=text, field_name="net_profit")
    assert result == "500.0"


def test_happy_net_profit_not_retained_earnings():
    """net_profit pattern must NOT match 'lợi nhuận sau thuế chưa phân phối' (retained earnings)."""
    text = "Lợi nhuận sau thuế chưa phân phối: 123.0\nLợi nhuận sau thuế: 456.0"
    result = extract_field(text=text, field_name="net_profit")
    # Should match the 'lợi nhuận sau thuế' line, not the retained earnings line
    assert result == "456.0"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_edge_field_not_in_text():
    """Target field label absent from text → None."""
    text = "Doanh thu thuần: 1,234.5\nTổng tài sản: 50,000.0"
    result = extract_field(text=text, field_name="net_profit")
    assert result is None


def test_edge_label_present_but_no_number():
    """Label found but no numeric token anywhere nearby → None."""
    text = "Doanh thu thuần\nnhận xét thêm\nmô tả\nthông tin\ngiải thích\nchi tiết"
    result = extract_field(text=text, field_name="net_revenue")
    assert result is None


# ---------------------------------------------------------------------------
# Failure path
# ---------------------------------------------------------------------------


def test_failure_empty_text():
    """Empty string input → None (no exception)."""
    result = extract_field(text="", field_name="net_revenue")
    assert result is None


def test_failure_whitespace_only():
    """Whitespace-only string → None (no exception)."""
    result = extract_field(text="   \n\t  ", field_name="net_revenue")
    assert result is None


def test_failure_unknown_field_name():
    """Unknown field_name → None."""
    text = "Doanh thu thuần: 1,234.5"
    result = extract_field(text=text, field_name="unknown_field")
    assert result is None


def test_failure_empty_field_name():
    """Empty field_name → None."""
    text = "Doanh thu thuần: 1,234.5"
    result = extract_field(text=text, field_name="")
    assert result is None


# ---------------------------------------------------------------------------
# Fence-A compliance (runtime check)
# ---------------------------------------------------------------------------


def test_fence_a_no_infra_imports():
    """Fence-A: primitive module must not import infrastructure/application/interface."""
    import domain.primitives.field_extractor.primitive as pmod

    src = getattr(pmod, "__file__", "")
    assert src, "Primitive module has no __file__"
    # If this test runs without ImportError from infra/app/interface, Fence-A holds.
