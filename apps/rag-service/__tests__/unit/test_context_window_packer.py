"""
Unit tests for domain/primitive/context_window_packer/context_window_packer.py

Fence-A: zero imports from application/, infrastructure/, interface/.
"""
import pytest
from domain.primitive.context_window_packer.context_window_packer import pack


class TestPack:
    """Pure function unit tests for the context_window_packer primitive."""

    def test_golden_assembles_all_fields(self) -> None:
        """Standard pack: title + source + content appear in result."""
        result = pack("HOSE Report", "Earnings grew Q3", "VNDirect", max_chars=512)
        assert "HOSE Report" in result
        assert "VNDirect" in result
        assert "Earnings grew Q3" in result

    def test_content_truncated_to_max_chars(self) -> None:
        """Content exceeding max_chars is truncated to exactly max_chars characters."""
        long_content = "A" * 100
        result = pack("Title", long_content, "SRC", max_chars=10)
        # The content portion in the result should be truncated
        assert "AAAAAAAAAA" in result
        assert "AAAAAAAAAAA" not in result  # no 11 A's

    def test_empty_content_handled(self) -> None:
        """Empty content does not raise an error."""
        result = pack("Title", "", "SRC", max_chars=512)
        assert isinstance(result, str)
        assert "Title" in result

    def test_empty_title_omitted(self) -> None:
        """Empty title does not appear as empty line."""
        result = pack("", "Content", "SRC", max_chars=512)
        # Should not start with a newline from empty title
        assert not result.startswith("\n")

    def test_empty_source_omitted(self) -> None:
        """Empty source is omitted gracefully."""
        result = pack("Title", "Content", "", max_chars=512)
        assert "Title" in result
        assert "Content" in result

    def test_result_is_string(self) -> None:
        """Return type is always str."""
        assert isinstance(pack("T", "C", "S", max_chars=100), str)

    def test_exact_max_chars_boundary(self) -> None:
        """Content of exactly max_chars length is kept untruncated."""
        content = "B" * 10
        result = pack("T", content, "S", max_chars=10)
        assert "BBBBBBBBBB" in result
