# TASK-DOCLANG-T3: Adapters — Write Ports

**Sprint:** DOCLANG-SERIALIZE (Phase 1)  
**Owner:** dev-pdf-extractor  
**Size:** XS (~45 min)  
**Depends on:** DOCLANG-T2-SERIALIZER (DocLangSerializer complete)

---

## Description

Implement two adapter classes in the SAME FILE as T2: `apps/pdf-extractor/infrastructure/doclang_serializer.py`. These adapters implement the `DocLangWritePort` domain port defined in T1.

1. **`FilesystemDocLangWriteAdapter`** — production adapter, writes to filesystem
2. **`NullDocLangWriteAdapter`** — test no-op adapter

---

## File to Extend

### `apps/pdf-extractor/infrastructure/doclang_serializer.py`

Add the following TWO classes after `DocLangSerializer` (same file).

---

## Implementation

### Class 1: `FilesystemDocLangWriteAdapter`

```python
import os

class FilesystemDocLangWriteAdapter:
    """
    Production adapter for DocLangWritePort — writes XML to filesystem.
    
    Implements: domain.modules.financial_reports.ports.DocLangWritePort
    
    Usage:
        adapter = FilesystemDocLangWriteAdapter(output_dir="/app/data/doclang")
        path = adapter.write(report_id="abc-123", xml_str="<doclang>...</doclang>")
        # Output: /app/data/doclang/abc-123.dclg.xml
    """
    
    def __init__(self, output_dir: str):
        """
        Initialize the adapter.
        
        Args:
            output_dir: Directory path for writing .dclg.xml files (e.g., "/app/data/doclang")
        """
        self._output_dir = output_dir
    
    def write(self, report_id: str, xml_str: str) -> str:
        """
        Write the XML string to a file on disk.
        
        Args:
            report_id: UUID or document ID (becomes filename stem)
            xml_str: Complete well-formed DocLang XML string
        
        Returns:
            Absolute path to the written file (e.g., "/app/data/doclang/abc-123.dclg.xml")
            On I/O error: logs error and returns empty string (never raises)
        
        Contract:
            - Thread-safe: each call writes to a unique path (report_id stem)
            - Creates output_dir if it does not exist
            - Never modifies bctc_table_rows or any DB table
        """
        try:
            # Ensure output directory exists
            os.makedirs(self._output_dir, exist_ok=True)
            
            # Construct output path
            filename = f"{report_id}.dclg.xml"
            filepath = os.path.join(self._output_dir, filename)
            
            # Write file
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(xml_str)
            
            logger.info("DocLangWriteAdapter: wrote report_id=%s path=%s", report_id, filepath)
            return filepath
        
        except IOError as exc:
            logger.error("DocLangWriteAdapter: IOError writing report_id=%s error=%s", report_id, exc)
            return ""
        except Exception as exc:
            logger.error("DocLangWriteAdapter: unexpected error report_id=%s error=%s", report_id, exc)
            return ""
```

### Class 2: `NullDocLangWriteAdapter`

```python
class NullDocLangWriteAdapter:
    """
    Test adapter for DocLangWritePort — no-op, returns empty string.
    
    Implements: domain.modules.financial_reports.ports.DocLangWritePort
    
    Usage in tests: pass to DocLangSerializeUseCase constructor instead of FilesystemDocLangWriteAdapter.
    Ensures tests do not write to disk.
    """
    
    def write(self, report_id: str, xml_str: str) -> str:
        """
        No-op write (test-only).
        
        Args:
            report_id: (ignored)
            xml_str: (ignored)
        
        Returns:
            Empty string (no file written)
        """
        return ""
```

---

## Acceptance Criteria

- [ ] `FilesystemDocLangWriteAdapter` class created in `infrastructure/doclang_serializer.py`
- [ ] Constructor accepts `output_dir: str` parameter
- [ ] `write(report_id, xml_str)` creates `output_dir` if absent (os.makedirs)
- [ ] `write()` writes to `{output_dir}/{report_id}.dclg.xml`
- [ ] `write()` returns absolute path on success
- [ ] `write()` catches IOError/Exception, logs error, returns empty string (never raises)
- [ ] Log messages use `logger.info()` (success) and `logger.error()` (failure)
- [ ] `NullDocLangWriteAdapter` class created in same file
- [ ] `NullDocLangWriteAdapter.write()` returns empty string (no-op)
- [ ] Both classes are thread-safe (unique filename per report_id)

---

## Testing (Local)

```python
import tempfile
import os
from infrastructure.doclang_serializer import FilesystemDocLangWriteAdapter, NullDocLangWriteAdapter

# Test 1: Filesystem adapter
with tempfile.TemporaryDirectory() as tmpdir:
    adapter = FilesystemDocLangWriteAdapter(tmpdir)
    xml = "<doclang>test</doclang>"
    path = adapter.write("test-001", xml)
    
    assert path.endswith("test-001.dclg.xml")
    assert os.path.exists(path)
    with open(path, "r") as f:
        assert f.read() == xml
    print("Filesystem adapter test: PASS")

# Test 2: Null adapter
null_adapter = NullDocLangWriteAdapter()
result = null_adapter.write("test-002", "<doclang>test</doclang>")
assert result == ""
print("Null adapter test: PASS")

# Test 3: IOError handling (permission denied simulation)
# On macOS, create a read-only directory and attempt write
with tempfile.TemporaryDirectory() as tmpdir:
    readonly_dir = os.path.join(tmpdir, "readonly")
    os.makedirs(readonly_dir)
    os.chmod(readonly_dir, 0o444)  # Read-only
    
    adapter = FilesystemDocLangWriteAdapter(readonly_dir)
    result = adapter.write("test-003", "<doclang>test</doclang>")
    assert result == ""  # Should not raise, should return ""
    print("IOError handling test: PASS")
```

---

## Notes

- Both adapters implement the `DocLangWritePort` domain port (type hints can be added via `Protocol` mixin in Python 3.8+, but plain classes work fine)
- The null adapter is NOT a mock; it's a real, production-safe adapter for test contexts
- Filesystem adapter creates directories recursively to handle nested output paths in future phases
- UTF-8 encoding is explicit in the open() call to ensure Vietnamese diacritics round-trip correctly
