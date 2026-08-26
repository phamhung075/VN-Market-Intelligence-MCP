"""
Route-level tests — GET /pek-extract/{report_id} (interface/routes_pek_status.py)
and the full POST /pek-extract -> background task -> durable record chain.

FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S AC-1:
the 202 response already carries report_id as a job id. These tests assert
that job id's terminal state is now genuinely OBSERVABLE end-to-end through
the real HTTP wiring (interface/handlers.py::register_routes), not just at
the repository-unit level (see test_pek_extract_silent_drop_durable_record.py
for the semaphore-contention reproduction).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient

from interface.handlers import register_routes
from infrastructure.pek_extraction_status_repository import (
    PekExtractionStatusRepository,
)


def _build_client(pek_status_repo=None, pek_engine_adapter=None, pek_push_client=None) -> TestClient:
    """Minimal FastAPI TestClient with ONLY register_routes wired (mirrors
    __tests__/unit/test_fu1_fail_loud.py::_build_handler_client)."""
    extract_usecase = MagicMock()

    app = FastAPI()
    router = APIRouter()
    register_routes(
        router,
        extract_usecase=extract_usecase,
        pek_engine_adapter=pek_engine_adapter,
        pek_push_client=pek_push_client,
        pek_status_repo=pek_status_repo,
    )
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


class TestPekExtractStatusRouteWiring:
    def test_get_status_404_when_repo_not_wired(self):
        client = _build_client(pek_status_repo=None)
        resp = client.get("/pek-extract/some-report-id")
        assert resp.status_code == 404

    def test_get_status_404_when_report_id_unknown(self, tmp_path):
        repo = PekExtractionStatusRepository(db_path=str(tmp_path / "s1.db"))
        client = _build_client(pek_status_repo=repo)
        resp = client.get("/pek-extract/never-accepted-report")
        assert resp.status_code == 404

    def test_get_status_returns_failed_record(self, tmp_path):
        repo = PekExtractionStatusRepository(db_path=str(tmp_path / "s2.db"))
        repo.mark_accepted("r1")
        repo.mark_failed("r1", "PEK extraction queue wait of 0.2s elapsed ...")

        client = _build_client(pek_status_repo=repo)
        resp = client.get("/pek-extract/r1")

        assert resp.status_code == 200
        body = resp.json()
        assert body["report_id"] == "r1"
        assert body["status"] == "failed"
        assert "queue wait" in body["error"]
        assert body["updated_at"]


class TestPostThenGetEndToEnd:
    """
    Full chain: POST /pek-extract writes "accepted" BEFORE the 202 response,
    the background task (run synchronously by TestClient before the response
    completes) then flips it to a terminal state, and GET reads it back.
    """

    def test_post_accepted_then_background_success_flips_to_done(self, tmp_path):
        repo = PekExtractionStatusRepository(db_path=str(tmp_path / "e2e-done.db"))

        pek_engine_adapter = MagicMock()
        pek_engine_adapter.extract_layout_and_tables.return_value = {
            "document_map": {},
            "units": [],
            "page_zones": [],
            "pass_rate_report": {},
        }
        pek_push_client = AsyncMock()
        pek_push_client.push_layout = AsyncMock(
            return_value={"units_stored": 0, "pages_stored": 0}
        )

        client = _build_client(
            pek_status_repo=repo,
            pek_engine_adapter=pek_engine_adapter,
            pek_push_client=pek_push_client,
        )

        # Market-hours guard is a real UTC clock read (Layer 2, routes_pek.py)
        # — patch it closed exactly as scenarios/pek_single_doc_extraction.py
        # already does, per this module's own load-bearing-patch-target note.
        with patch("interface.routes_pek.is_vn_market_open_utc", return_value=False):
            post_resp = client.post(
                "/pek-extract", json={"report_id": "e2e-r1", "pdf_path": "/fake/e2e.pdf"}
            )
        assert post_resp.status_code == 202
        assert post_resp.json() == {"status": "accepted", "report_id": "e2e-r1"}

        get_resp = client.get("/pek-extract/e2e-r1")
        assert get_resp.status_code == 200
        assert get_resp.json()["status"] == "done", (
            "background task ran synchronously under TestClient — status must "
            f"be 'done' by the time GET runs, got {get_resp.json()!r}"
        )

    def test_post_accepted_then_background_failure_flips_to_failed_not_silent(self, tmp_path):
        """
        AC-1 core claim at the HTTP layer: a background task that raises
        (any exception, not just SemaphoreContendedError) must leave the
        report_id observably "failed" — never stuck at "accepted" forever.
        """
        repo = PekExtractionStatusRepository(db_path=str(tmp_path / "e2e-failed.db"))

        pek_engine_adapter = MagicMock()
        pek_engine_adapter.extract_layout_and_tables.side_effect = RuntimeError(
            "simulated background extraction failure"
        )
        pek_push_client = AsyncMock()

        client = _build_client(
            pek_status_repo=repo,
            pek_engine_adapter=pek_engine_adapter,
            pek_push_client=pek_push_client,
        )

        with patch("interface.routes_pek.is_vn_market_open_utc", return_value=False):
            post_resp = client.post(
                "/pek-extract", json={"report_id": "e2e-r2", "pdf_path": "/fake/e2e2.pdf"}
            )
        assert post_resp.status_code == 202, (
            "AC-1: the 202 contract itself does not change — the failure must "
            "surface via the durable record, not via the HTTP response code"
        )

        get_resp = client.get("/pek-extract/e2e-r2")
        assert get_resp.status_code == 200
        body = get_resp.json()
        assert body["status"] == "failed", (
            f"AC-1 VIOLATION: report_id never reached a durable 'failed' state: {body!r}"
        )
        assert "simulated background extraction failure" in body["error"]
