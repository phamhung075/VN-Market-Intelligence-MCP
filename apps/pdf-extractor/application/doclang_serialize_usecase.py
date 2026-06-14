"""
Application-layer use case: serialize ExtractPDFResponse to DocLang XML and write via port.

Sprint: DOCLANG-SERIALIZE Phase 1

DDD note: This layer imports infrastructure (doclang) ONLY inside execute(), inside the
validation block. This is an exception to strict DDD but acceptable for Phase 1 (observability
only, not a domain rule). Phase 2 can extract validation to a separate DocLangValidatePort.
"""

import logging
import os
import tempfile
from typing import Optional

from application.dtos import ExtractPDFResponse
from domain.modules.financial_reports.ports import DocLangWritePort
from infrastructure.doclang_serializer import DocLangSerializer

logger = logging.getLogger(__name__)


class DocLangSerializeUseCase:
    """
    Transform ExtractPDFResponse tables to DocLang XML and persist via write port.

    Input:  ExtractPDFResponse (already contains extracted .tables list)
    Output: Path to written .dclg.xml file (or empty string on write failure)

    Contract:
    - Never raises (all errors logged, gracefully degraded)
    - Validation is observability only (logs INFO/WARNING, does not gate pipeline)
    - Thread-safe: each call is independent
    - Never modifies bctc_table_rows or any extraction state
    """

    def __init__(
        self,
        serializer: DocLangSerializer,
        write_port: DocLangWritePort,
    ) -> None:
        """
        Initialize the use case.

        Args:
            serializer:  DocLangSerializer instance (pure transform, no state
                         beyond bbox_provider).
            write_port:  DocLangWritePort implementation (production:
                         FilesystemDocLangWriteAdapter; test: NullDocLangWriteAdapter).
        """
        self._serializer = serializer
        self._write_port = write_port

    def execute(
        self,
        response: ExtractPDFResponse,
        report_id: Optional[str] = None,
    ) -> str:
        """
        Serialize all tables in response to DocLang XML and write via port.

        Args:
            response:  ExtractPDFResponse with .tables list and optional .document_id.
            report_id: Override document identifier. If None, uses response.document_id
                       or "unknown".

        Returns:
            Absolute path to written .dclg.xml file (from write_port.write()).
            On write failure: returns empty string (never raises).

        Side effects:
        - Writes XML file to disk via write_port (additive only).
        - Logs validation result (INFO on success, WARNING on failure).
        - Never modifies bctc_table_rows or extraction state.
        """
        rid = report_id or getattr(response, "document_id", None) or "unknown"

        try:
            # Serialize tables to XML string (pure transform, never raises)
            xml_str = self._serializer.serialize(response.tables, report_id=rid)

            # Write via port (catches IOError internally, returns empty string on failure)
            path = self._write_port.write(rid, xml_str)

            # Validation observability — log-only, never gate
            # NOTE: doclang.validate() requires saxonche (Java runtime). In tests (host venv
            # with JRE), this works. In container production, saxonche may lack JRE; the use
            # case gracefully skips validation and returns path regardless.
            self._validate_output(xml_str, rid, path)

            return path

        except Exception as exc:
            logger.error(
                "DocLangSerializeUseCase.execute: unexpected error report_id=%s error=%s",
                rid,
                exc,
            )
            return ""

    def _validate_output(self, xml_str: str, report_id: str, path: str) -> None:
        """
        Validate DocLang XML output (observability only — never raises, never gates).

        Imports doclang only when called (avoiding top-level dependency and keeping
        import close to its usage point).

        Args:
            xml_str:   XML string to validate.
            report_id: For logging context.
            path:      For logging context.
        """
        try:
            from doclang import validate, ValidationError  # type: ignore[import]

            with tempfile.NamedTemporaryFile(
                suffix=".dclg.xml", mode="w", encoding="utf-8", delete=False
            ) as f:
                f.write(xml_str)
                tmp_path = f.name

            try:
                validate(tmp_path, allow_empty_namespace=False)
                logger.info(
                    "DocLangSerializeUseCase: validate OK report_id=%s path=%s",
                    report_id,
                    path,
                )
            except ValidationError as e:
                xsd_errors = getattr(e, "xsd_errors", [])
                schematron_errors = getattr(e, "schematron_errors", [])
                logger.warning(
                    "DocLangSerializeUseCase: validate FAIL report_id=%s "
                    "xsd_errors=%d schematron_errors=%d",
                    report_id,
                    len(xsd_errors),
                    len(schematron_errors),
                )
            finally:
                os.unlink(tmp_path)

        except ImportError:
            logger.debug(
                "DocLangSerializeUseCase: doclang not available "
                "(expected in container), skipping validation"
            )
        except Exception as exc:
            logger.warning(
                "DocLangSerializeUseCase: validation infrastructure error "
                "(non-fatal): %s",
                exc,
            )
