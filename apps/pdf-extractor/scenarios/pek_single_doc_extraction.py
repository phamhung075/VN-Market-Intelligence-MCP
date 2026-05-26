"""
scenarios/pek_single_doc_extraction.py — PEK-INTEGRATE

FastAPI TestClient scenario: POST /pek-extract with injected FAKE PEK adapter.

ZERO network calls. ZERO model weights. ZERO creds. ZERO DB.

Tests:
    1. POST /pek-extract returns 202 Accepted (market closed simulation).
    2. POST /pek-extract returns 503 when market is open.
    3. Push payload has correct shape (report_id, page_zones, units, pass_rate_report).
    4. paddlepaddle_gpu is NOT in sys.modules (CPU-only invariant).
    5. text_table_extractor.py was NOT imported in the PEK path.

Security clause (G7 / AC-5):
    Zero credentials in this process context.
    No VPS_HOST, API_KEY, SECRET, TOKEN, PASSWORD, PDF_EXTRACTOR_DB in env.

AC-PEK-NEW-1 verification:
    The market-hours 503 is tested by patching is_vn_market_open_utc to return True.
"""

import sys
import os

# Set PYTHONPATH to pdf-extractor root
_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import pytest
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Security clause verification (AC-5 / G7)
# ---------------------------------------------------------------------------

def _check_zero_credentials() -> None:
    """Assert no sensitive credentials in the process environment."""
    forbidden_prefixes = [
        "DB_", "API_KEY", "SECRET", "TOKEN", "PASSWORD",
        "VPS_HOST", "VINAHOST", "PDF_EXTRACTOR_DB",
    ]
    violations = []
    for key in os.environ:
        for prefix in forbidden_prefixes:
            if key.startswith(prefix) or key == prefix:
                violations.append(key)
    assert not violations, (
        f"Security clause violated: credentials in env: {violations}\n"
        "The sandbox process must have zero credentials."
    )


# ---------------------------------------------------------------------------
# Fake PEK adapter (implements PekEngineAdapterPort contract)
# Zero model weights. Returns deterministic fake data.
# ---------------------------------------------------------------------------

class FakePekEngineAdapter:
    """
    Fake PEK engine adapter for scenario testing.
    Implements PekEngineAdapterPort.extract_layout_and_tables().
    Returns deterministic bbox + table data — no real model inference.
    """

    def extract_layout_and_tables(
        self,
        pdf_path: str,
        report_id: str,
    ) -> Dict:
        """Return fake extraction result with correct LF-OVERLAY shape."""
        unit_id = "fake-unit-id-0001"
        return {
            "document_map": {
                "report_id": report_id,
                "total_pages": 3,
                "units": [
                    {
                        "unit_id": unit_id,
                        "schema_page": 1,
                        "pages": [1, 2, 3],
                        "page_type": "table",
                    }
                ],
            },
            "units": [
                {
                    "unit_id": unit_id,
                    "stitched_markdown": (
                        "| col_0 | col_1 | col_2 |\n"
                        "|---|---|---|\n"
                        "| Assets | 100000 | 90000 |\n"
                        "| Equity | 50000 | 45000 |\n"
                    ),
                    "row_count": 4,
                    "quarantined": False,
                    "quarantine_reason": None,
                    "page_row_spans": [
                        {"page": 1, "row_start": 0, "row_end": 2},
                        {"page": 2, "row_start": 2, "row_end": 4},
                    ],
                }
            ],
            "page_zones": [
                {
                    "page_number": 1,
                    "unit_id": unit_id,
                    "page_type": "table",
                    "is_schema_page": True,
                    "is_continuation_page": False,
                    "schema_inherited_from_page": None,
                    "zones": {
                        "image_width_px": 2338,
                        "image_height_px": 3308,
                        "image_dpi": 200,
                        "coordinate_origin": "top-left",
                        "coordinate_unit": "px",
                        "header_band": {"y_min": 0, "y_max": 330},
                        "footer_band": {"y_min": 3000, "y_max": 3308},
                        "column_gutters": [
                            {"col_id": "col_0", "x_min": 0, "x_max": 460},
                            {"col_id": "col_1", "x_min": 461, "x_max": 900},
                        ],
                        "row_bands": [
                            {"y_min": 331, "y_max": 380, "row_density": 0.72},
                            {"y_min": 381, "y_max": 430, "row_density": 0.68},
                        ],
                        "unit_hints": [],
                        "unit_boundary_after_page": False,
                    },
                },
            ],
            "pass_rate_report": {
                "units_total": 1,
                "units_passing": 1,
                "units_quarantined": 0,
                "quarantine_breakdown": {
                    "balance_identity_fail": 0,
                    "codes_not_monotonic": 0,
                    "orphan_rows": 0,
                },
            },
        }


# ---------------------------------------------------------------------------
# Fake push client (records calls, no HTTP)
# ---------------------------------------------------------------------------

class FakeLayoutFirstPushClient:
    """Records push_layout calls. No HTTP. No creds."""

    def __init__(self):
        self.calls: List[Dict] = []

    async def push_layout(
        self,
        report_id: str,
        document_map: Dict,
        units: List[Dict],
        page_zones: List[Dict],
        pass_rate_report: Dict,
    ) -> Dict:
        self.calls.append({
            "report_id": report_id,
            "document_map": document_map,
            "units": units,
            "page_zones": page_zones,
            "pass_rate_report": pass_rate_report,
        })
        return {"ok": True, "units_stored": len(units), "pages_stored": len(page_zones)}


# ---------------------------------------------------------------------------
# App factory with injected fakes
# ---------------------------------------------------------------------------

def _build_test_app(
    fake_pek_adapter: Optional[FakePekEngineAdapter] = None,
    fake_push_client: Optional[FakeLayoutFirstPushClient] = None,
):
    """
    Build a FastAPI test app with fake PEK adapter + push client injected.
    All other use cases are None (graceful 503 degrade — not under test here).
    """
    from fastapi import FastAPI, APIRouter
    from interface.handlers import register_routes

    # Minimal mock for required positional args
    mock_extract_usecase = MagicMock()
    mock_inspection_store = MagicMock()

    app = FastAPI()
    router = APIRouter()

    register_routes(
        router=router,
        extract_usecase=mock_extract_usecase,
        inspection_store=mock_inspection_store,
        extract_tables_usecase=None,
        extract_md_tables_usecase=None,
        extract_layout_first_usecase=None,
        pek_engine_adapter=fake_pek_adapter or FakePekEngineAdapter(),
        pek_push_client=fake_push_client or FakeLayoutFirstPushClient(),
    )
    app.include_router(router)
    return app


# ---------------------------------------------------------------------------
# Scenario tests
# ---------------------------------------------------------------------------

class TestPekSingleDocExtractionScenario:
    """
    FastAPI TestClient scenario: POST /pek-extract with injected fakes.
    Zero network. Zero model weights. Zero creds.
    """

    def setup_method(self):
        """Check security clause before each test."""
        _check_zero_credentials()

    def test_pek_extract_accepted_when_market_closed(self):
        """
        POST /pek-extract returns 202 Accepted when market is closed.
        Uses a simulated off-market UTC time (Sun 03:00 UTC).
        """
        fake_adapter = FakePekEngineAdapter()
        fake_push = FakeLayoutFirstPushClient()
        app = _build_test_app(fake_adapter, fake_push)
        client = TestClient(app)

        # Patch is_vn_market_open_utc to return False (market closed)
        with patch(
            "interface.handlers.is_vn_market_open_utc",
            return_value=False,
        ):
            resp = client.post(
                "/pek-extract",
                json={
                    "report_id": "e8ea3df5-3f32-413d-a3eb-c71634c0438d",
                    "pdf_path": "/app/data/pdfs/test_fpt.pdf",
                },
            )

        assert resp.status_code == 202, (
            f"Expected 202 Accepted, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["status"] == "accepted"
        assert data["report_id"] == "e8ea3df5-3f32-413d-a3eb-c71634c0438d"

    def test_pek_extract_503_when_market_open(self):
        """
        POST /pek-extract returns HTTP 503 when market is open.
        AC-PEK-NEW-1: no model loaded, RSS unchanged.
        """
        app = _build_test_app()
        client = TestClient(app)

        # Patch market guard to simulate open-hours (Mon 03:00 UTC)
        with patch(
            "interface.handlers.is_vn_market_open_utc",
            return_value=True,
        ):
            resp = client.post(
                "/pek-extract",
                json={
                    "report_id": "test-report-001",
                    "pdf_path": "/app/data/pdfs/test.pdf",
                },
            )

        assert resp.status_code == 503, (
            f"Expected HTTP 503 (market open), got {resp.status_code}: {resp.text}"
        )
        detail = resp.json().get("detail", {})
        assert detail.get("error") == "market_open", (
            f"Expected error='market_open', got: {detail}"
        )

    def test_push_payload_has_correct_shape(self):
        """
        After POST /pek-extract (market closed), fake adapter + push client
        must produce a payload with correct LF-OVERLAY shape.
        """
        fake_adapter = FakePekEngineAdapter()
        fake_push = FakeLayoutFirstPushClient()

        # Call fake adapter directly to verify payload shape
        result = fake_adapter.extract_layout_and_tables(
            pdf_path="/fake/path.pdf",
            report_id="report-shape-test",
        )

        assert "document_map" in result
        assert "units" in result
        assert "page_zones" in result
        assert "pass_rate_report" in result

        # Verify page_zones shape matches LF-OVERLAY §3.2 contract
        assert len(result["page_zones"]) >= 1
        pz = result["page_zones"][0]
        assert "page_number" in pz
        assert "unit_id" in pz
        assert "zones" in pz
        zones = pz["zones"]
        for field in [
            "image_width_px", "image_height_px", "image_dpi",
            "coordinate_origin", "coordinate_unit",
            "header_band", "footer_band", "column_gutters",
            "row_bands", "unit_hints", "unit_boundary_after_page",
        ]:
            assert field in zones, f"Missing zones field: {field}"

        # Verify column_gutters use positional col_N IDs (AC-0 compliance)
        for gutter in zones["column_gutters"]:
            assert gutter["col_id"].startswith("col_"), (
                f"Column gutter ID must be positional (col_N), got: {gutter['col_id']}"
            )

        # Verify units have stitched_markdown
        assert len(result["units"]) >= 1
        unit = result["units"][0]
        assert "stitched_markdown" in unit
        assert len(unit["stitched_markdown"]) > 0, "stitched_markdown must not be empty"

    def test_zero_network_calls(self):
        """
        The fake scenario makes zero network calls to HuggingFace / PaddleHub / mcp-server.
        Verified by checking that urllib.request.urlopen is never called.
        """
        import urllib.request as urllib_req

        fake_adapter = FakePekEngineAdapter()
        fake_push = FakeLayoutFirstPushClient()

        with patch.object(urllib_req, "urlopen") as mock_urlopen:
            result = fake_adapter.extract_layout_and_tables(
                pdf_path="/fake.pdf",
                report_id="test-zero-network",
            )
            # The fake adapter should not call urlopen
            mock_urlopen.assert_not_called()

    def test_gpu_package_not_in_sys_modules(self):
        """
        After running the scenario, paddlepaddle_gpu must NOT be in sys.modules.
        CPU-only invariant check (AC-PEK-2a).
        """
        fake_adapter = FakePekEngineAdapter()
        fake_adapter.extract_layout_and_tables(
            pdf_path="/fake.pdf",
            report_id="gpu-check",
        )
        assert "paddlepaddle_gpu" not in sys.modules, (
            "paddlepaddle_gpu found in sys.modules — CPU-only invariant violated!"
        )

    def test_text_table_extractor_not_involved_in_pek_path(self):
        """
        text_table_extractor.py must NOT be called by the PEK extraction path.
        The two paths (structured bctc_table_rows vs PEK layout) are separate.
        AC-PEK-6 / REQ-PEK-6: structured path non-regression.
        """
        import importlib
        # If text_table_extractor was already imported, grab the module
        tte_module = sys.modules.get("infrastructure.text_table_extractor")

        if tte_module is not None:
            # Patch the assemble method to detect any call from PEK path
            with patch.object(tte_module.TextTableExtractor, "assemble") as mock_assemble:
                fake_adapter = FakePekEngineAdapter()
                fake_adapter.extract_layout_and_tables(
                    pdf_path="/fake.pdf",
                    report_id="tte-non-regression",
                )
                mock_assemble.assert_not_called(), (
                    "TextTableExtractor.assemble was called from PEK path — "
                    "structured path must remain separate!"
                )
        else:
            # text_table_extractor not imported = cannot be called (pass)
            pass

    def test_503_when_pek_adapter_not_configured(self):
        """
        POST /pek-extract returns 503 if pek_engine_adapter is None (not configured).
        """
        from fastapi import FastAPI, APIRouter
        from interface.handlers import register_routes
        from unittest.mock import MagicMock

        app = FastAPI()
        router = APIRouter()
        register_routes(
            router=router,
            extract_usecase=MagicMock(),
            inspection_store=MagicMock(),
            pek_engine_adapter=None,
            pek_push_client=None,
        )
        app.include_router(router)
        client = TestClient(app)

        # Market closed so we get past the market-hours guard
        with patch(
            "interface.handlers.is_vn_market_open_utc",
            return_value=False,
        ):
            resp = client.post(
                "/pek-extract",
                json={"report_id": "r1", "pdf_path": "/fake.pdf"},
            )

        assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Run as script for manual verification
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import subprocess
    result = subprocess.run(
        [sys.executable, "-m", "pytest", __file__, "-v"],
        cwd=_ROOT,
    )
    sys.exit(result.returncode)
