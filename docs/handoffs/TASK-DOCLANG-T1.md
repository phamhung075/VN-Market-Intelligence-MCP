# TASK-DOCLANG-T1: Domain + Config Layer

**Sprint:** DOCLANG-SERIALIZE (Phase 1)  
**Owner:** dev-pdf-extractor  
**Size:** XS (~45 min)  
**Depends on:** ARCH-DOCLANG-SERIALIZE (design complete)

---

## Description

Add the domain port `DocLangWritePort` and extend the Config layer to support DocLang output directory configuration. This is foundational; all downstream tasks depend on this.

---

## Files to Modify

### 1. `apps/pdf-extractor/domain/modules/financial_reports/ports.py`

**ACTION: ADD** the following port at the end of the file (as the 17th port):

```python
class DocLangWritePort(Protocol):
    """
    Port for writing a serialized DocLang XML document to storage (DOCLANG-SERIALIZE Phase 1).

    DDD: domain port — zero infrastructure imports. Pure Protocol.
    
    Concrete adapters:
        - infrastructure/doclang_serializer.FilesystemDocLangWriteAdapter (production, writes to filesystem)
        - infrastructure/doclang_serializer.NullDocLangWriteAdapter (test, no-op)
    """

    def write(self, report_id: str, xml_str: str) -> str:
        """
        Persist the XML string and return the output path.

        Args:
            report_id: UUID string matching financial_reports.id. Used as filename stem.
            xml_str:   Complete well-formed .dclg.xml string.

        Returns:
            Absolute path to the written file (e.g. "/app/data/doclang/<report_id>.dclg.xml").

        Contract:
            - Must NOT raise on I/O failure — catch, log, return empty string.
            - Must NOT modify bctc_table_rows or any other DB table.
            - Thread-safe: each call writes to a unique path (report_id stem).
        """
        ...
```

**VERIFY:**
- Port docstring mentions both concrete adapters by name
- Port count in the file's module docstring updated to 17 (update any docstring at module level if it lists port count)

### 2. `apps/pdf-extractor/infrastructure/config.py`

**ACTION: ADD** the following field to the `Config` class:

```python
doclang_output_dir: str
```

**ACTION: ADD** to the `from_env()` classmethod (look for the existing `doclang_output_dir` in `return Config(...)`):

```python
doclang_output_dir=os.getenv("DOCLANG_OUTPUT_DIR", "/app/data/doclang"),
```

**VERIFY:**
- Env var name is `DOCLANG_OUTPUT_DIR` (uppercase)
- Default value is `/app/data/doclang` (production path)
- Field order in `from_env()` matches class definition

---

## Acceptance Criteria

- [ ] `DocLangWritePort` Protocol added to `domain/modules/financial_reports/ports.py`
- [ ] Port method signature is `write(report_id: str, xml_str: str) -> str`
- [ ] Port docstring explicitly names `FilesystemDocLangWriteAdapter` and `NullDocLangWriteAdapter`
- [ ] `Config.doclang_output_dir: str` field added (class attribute)
- [ ] `Config.from_env()` reads `DOCLANG_OUTPUT_DIR` and defaults to `/app/data/doclang`
- [ ] Port count in module docstring updated to 17
- [ ] No other imports or logic added; pure interface definition

---

## Testing (Local)

Run these to verify no syntax errors:

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/pdf-extractor
python -c "from domain.modules.financial_reports.ports import DocLangWritePort; print('Port OK')"
python -c "from infrastructure.config import Config; c = Config.from_env(); print(f'doclang_output_dir={c.doclang_output_dir}')"
```

Expected output:
```
Port OK
doclang_output_dir=/app/data/doclang
```

---

## Notes

- This task is pure DDD interface definition — no implementation yet
- No external dependencies needed
- The port will be injected into the use case in T4
- The Config field will be read by the adapter in T3
