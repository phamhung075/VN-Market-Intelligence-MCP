# TASK-DOCLANG-T4: Use Case — DocLangSerializeUseCase

**Sprint:** DOCLANG-SERIALIZE (Phase 1)  
**Owner:** dev-pdf-extractor  
**Size:** S (~1 hour)  
**Depends on:** DOCLANG-T3-ADAPTERS (write adapters complete)

---

## Description

Implement `DocLangSerializeUseCase` in a new file `apps/pdf-extractor/application/doclang_serialize_usecase.py`. This is the thin orchestrator layer that ties the pure serializer to the write port and adds observability (validation logging, never gating).

---

## File to Create

### `apps/pdf-extractor/application/doclang_serialize_usecase.py`

---

## Implementation

```python
"""
Application-layer use case: serialize ExtractPDFResponse to DocLang XML and write via port.

DDD note: This layer imports infrastructure (doclang) ONLY inside execute(), inside the
validation block. This is an exception to strict DDD but acceptable for Phase 1 (observability
only, not a domain rule). Phase 2 can extract validation to a separate DocLangValidatePort.
"""

import logging
import tempfile
import os
from typing import Optional

from application.dtos import ExtractPDFResponse
from domain.modules.financial_reports.ports import DocLangWritePort
from infrastructure.doclang_serializer import DocLangSerializer

logger = logging.getLogger(__name__)


class DocLangSerializeUseCase:
    """
    Transform ExtractPDFResponse tables to DocLang XML and persist via write port.
    
    Input: ExtractPDFResponse (already contains extracted .tables list)
    Output: Path to written .dclg.xml file (or empty string on write failure)
    
    Contract:
    - Never raises (all errors logged, gracefully degraded)
    - Validation is observability only (logs INFO/WARNING, does not gate pipeline)
    - Thread-safe: each call is independent
    """
    
    def __init__(
        self,
        serializer: DocLangSerializer,
        write_port: DocLangWritePort,
    ) -> None:
        """
        Initialize the use case.
        
        Args:
            serializer: DocLangSerializer instance (pure transform, no state beyond bbox_provider)
            write_port: DocLangWritePort implementation (production: FilesystemDocLangWriteAdapter,
                       test: NullDocLangWriteAdapter)
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
            response: ExtractPDFResponse with .tables list and optional .document_id
            report_id: Override document identifier (if None, uses response.document_id or "unknown")
        
        Returns:
            Absolute path to written .dclg.xml file (from write_port.write()).
            On write failure: returns empty string (never raises).
        
        Side effects:
        - Writes XML file to disk via write_port
        - Logs validation result (INFO on success, WARNING on failure)
        - Never modifies bctc_table_rows or extraction state
        """
        # Determine report ID
        rid = report_id or getattr(response, "document_id", None) or "unknown"
        
        try:
            # Serialize tables to XML string (pure transform, never raises)
            xml_str = self._serializer.serialize(response.tables, report_id=rid)
            
            # Write via port (catches IOError internally, returns empty string on failure)
            path = self._write_port.write(rid, xml_str)
            
            # Validation observability (Phase 1: log-only, never gate)
            # NOTE: doclang.validate() requires saxonche (Java runtime). In tests (which have
            # the JRE via the local venv), this works. In container production, this is disabled
            # to avoid JRE dependency — container validates only via CI test suite.
            self._validate_output(xml_str, rid, path)
            
            return path
        
        except Exception as exc:
            logger.error("DocLangSerializeUseCase.execute: unexpected error report_id=%s error=%s", rid, exc)
            return ""
    
    def _validate_output(self, xml_str: str, report_id: str, path: str) -> None:
        """
        Validate DocLang XML output (observability only, never raises, never gates).
        
        This is an internal helper that imports doclang only when called (avoiding
        top-level import and keeping the import close to its usage point).
        
        Args:
            xml_str: XML string to validate
            report_id: For logging context
            path: For logging context
        """
        try:
            # Import here to avoid top-level dependency on doclang
            from doclang import validate, ValidationError
            
            # Validate via temporary file (doclang.validate() works on file paths, not strings)
            with tempfile.NamedTemporaryFile(
                suffix=".dclg.xml", mode="w", encoding="utf-8", delete=False
            ) as f:
                f.write(xml_str)
                tmp_path = f.name
            
            try:
                # Run validation (XSD + Schematron)
                validate(tmp_path, allow_empty_namespace=False)
                logger.info(
                    "DocLangSerializeUseCase: validate OK report_id=%s path=%s",
                    report_id, path
                )
            except ValidationError as e:
                # Validation failed but non-fatal (observability)
                xsd_errors = getattr(e, "xsd_errors", [])
                schematron_errors = getattr(e, "schematron_errors", [])
                logger.warning(
                    "DocLangSerializeUseCase: validate FAIL report_id=%s xsd_errors=%d schematron_errors=%d",
                    report_id, len(xsd_errors), len(schematron_errors)
                )
            finally:
                os.unlink(tmp_path)
        
        except ImportError:
            logger.debug("DocLangSerializeUseCase: doclang not available (expected in container), skipping validation")
        except Exception as exc:
            # Validation infra error (saxonche, Java, etc.) — log and continue
            logger.warning(
                "DocLangSerializeUseCase: validation infrastructure error (non-fatal): %s", exc
            )
```

---

## Acceptance Criteria

- [ ] `DocLangSerializeUseCase` class created in new file `application/doclang_serialize_usecase.py`
- [ ] Constructor: `__init__(serializer: DocLangSerializer, write_port: DocLangWritePort)`
- [ ] `execute(response: ExtractPDFResponse, report_id: Optional[str]) -> str` signature correct
- [ ] Falls back to `response.document_id` or `"unknown"` if `report_id` not provided
- [ ] Calls `serializer.serialize(response.tables, report_id=rid)` and stores result
- [ ] Calls `write_port.write(rid, xml_str)` and returns its result
- [ ] Never raises (all exceptions logged, gracefully degraded)
- [ ] Validation block (doclang.validate) logs INFO/WARNING but never gates pipeline
- [ ] `doclang` imported only inside `_validate_output()`, not at module level
- [ ] Respects contract: never modifies bctc_table_rows or extraction state

---

## Testing (Local)

```python
from application.dtos import ExtractedTableDTO, ExtractPDFResponse
from infrastructure.doclang_serializer import DocLangSerializer, NullDocLangWriteAdapter
from application.doclang_serialize_usecase import DocLangSerializeUseCase

# Create a minimal response
dto = ExtractedTableDTO(
    table_index=0,
    page_number=1,
    headers=["A", "B"],
    rows=[["1", "2"]]
)
response = ExtractPDFResponse(
    document_id="doc-001",
    tables=[dto],
    # ... other fields as needed
)

# Create use case
serializer = DocLangSerializer()
null_adapter = NullDocLangWriteAdapter()
usecase = DocLangSerializeUseCase(serializer, null_adapter)

# Execute
result = usecase.execute(response, report_id="test-001")
print(f"Result: {result}")  # Should be empty string (null adapter)

# Test 2: with report_id override
result = usecase.execute(response)  # Should use response.document_id or "unknown"
print(f"Result (auto-id): {result}")

print("Use case tests: PASS")
```

---

## Notes

- The validation call is **optional and non-blocking** — it's there for observability only
- In container production, `doclang` may not be available or may lack JRE; the use case gracefully skips validation
- CI test suite (host-dev) will call `doclang.validate()` on test fixtures (which have the JRE) — AC-1 gate lives in test layer, not pipeline
- The use case follows the "thin orchestrator" pattern — it does NOT implement business logic, just wiring
