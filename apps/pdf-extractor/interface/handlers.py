"""
Interface — FastAPI route handlers (thin HTTP layer).

Handlers delegate all business logic to application usecases.
HTTP concerns (status codes, serialization) are handled here.

FACTORY-PDF-split-handlers: route registration is split into one
interface/routes_*.py module per domain area (schemas → interface/schemas.py,
statement-section allow-set → domain/constants.py, background-task runners →
interface/{routes_md_tables,routes_layout_first,pek_run_helper}.py). This
module now just wires the shared APIRouter to each of them. Route paths,
status codes, and request/response shapes are unchanged from the pre-split
version — this was a pure structural move, not a behavior change.
"""

from typing import Any, Optional

from fastapi import APIRouter

from application.usecases import ExtractPDFUseCase
from application.extract_tables_usecase import ExtractTablesUseCase
from application.extract_md_tables_usecase import ExtractMdTablesUseCase
from application.extract_layout_first_usecase import ExtractLayoutFirstUseCase  # LF-EXTRACT

from interface.routes_health import register_health_routes
from interface.routes_extract import register_extract_routes
from interface.routes_extract_tables import register_extract_tables_routes
from interface.routes_md_tables import register_md_tables_routes
from interface.routes_layout_first import register_layout_first_routes
from interface.routes_pek import register_pek_routes
from interface.routes_rasterizer import register_rasterizer_routes
from interface.routes_page_text import register_page_text_routes


def register_routes(
    router: APIRouter,
    extract_usecase: ExtractPDFUseCase,
    extract_tables_usecase: Optional[ExtractTablesUseCase] = None,
    extract_md_tables_usecase: Optional[ExtractMdTablesUseCase] = None,
    extract_layout_first_usecase: Optional["ExtractLayoutFirstUseCase"] = None,
    pek_engine_adapter: Optional[Any] = None,
    pek_push_client: Optional[Any] = None,
    ocr_text_source: Optional[Any] = None,
    ocr_source_ok: bool = True,
    pdf_data_dir: str = "data/pdfs",
    local_extract_usecase: Optional[ExtractPDFUseCase] = None,
    doclang_serialize_usecase: Optional[Any] = None,  # DOCLANG-SERIALIZE (wired, not yet called by handlers)
) -> None:
    """Attach all routes to the given APIRouter."""
    register_health_routes(router, ocr_source_ok=ocr_source_ok)
    register_extract_routes(
        router,
        extract_usecase=extract_usecase,
        local_extract_usecase=local_extract_usecase,
    )
    register_extract_tables_routes(router, extract_tables_usecase=extract_tables_usecase)
    register_md_tables_routes(router, extract_md_tables_usecase=extract_md_tables_usecase)
    register_layout_first_routes(
        router, extract_layout_first_usecase=extract_layout_first_usecase
    )
    register_pek_routes(
        router, pek_engine_adapter=pek_engine_adapter, pek_push_client=pek_push_client
    )
    register_rasterizer_routes(router, pdf_data_dir=pdf_data_dir)
    register_page_text_routes(router, ocr_text_source=ocr_text_source)
