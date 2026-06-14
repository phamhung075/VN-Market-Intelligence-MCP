# TASK-DOCLANG-T5: Composition & Wiring — main.py + requirements.txt

**Sprint:** DOCLANG-SERIALIZE (Phase 1)  
**Owner:** dev-pdf-extractor  
**Size:** XS (~30 min)  
**Depends on:** DOCLANG-T4-USECASE (use case complete)

---

## Description

Wire the `DocLangSerializeUseCase` into the composition root (`main.py`) and add the `doclang` dependency to `requirements.txt`. This glues all the pieces together.

---

## Files to Modify

### 1. `apps/pdf-extractor/requirements.txt`

**ACTION: ADD** a single line at the end (or in alphabetical order with other external dependencies):

```
doclang==0.6.0
```

**VERIFY:**
- Pin is exactly `doclang==0.6.0` (no `>=`, `<`, `~=`, or other relaxed constraints)
- Run `pip check` after adding to confirm no version conflicts

---

### 2. `apps/pdf-extractor/main.py`

Find the section after `extract_layout_first_usecase` construction (around line 88-248 based on the architecture brief). Add the following:

**ACTION: ADD IMPORTS** (at the top of the file, with other use case imports):

```python
from infrastructure.doclang_serializer import (
    DocLangSerializer,
    FilesystemDocLangWriteAdapter,
)
from application.doclang_serialize_usecase import DocLangSerializeUseCase
```

**ACTION: ADD CONSTRUCTION** (after the `extract_layout_first_usecase` block, before the return statement):

```python
# --- DOCLANG-SERIALIZE: DocLang XML serializer (additive output only) ---
_doclang_serializer = DocLangSerializer(bbox_provider=None)  # Phase 1: no geometry
_doclang_write_adapter = FilesystemDocLangWriteAdapter(
    output_dir=cfg.doclang_output_dir
)
doclang_serialize_usecase = DocLangSerializeUseCase(
    serializer=_doclang_serializer,
    write_port=_doclang_write_adapter,
)
```

**ACTION: ADD REGISTRATION** (in the `register_routes()` call, pass as kwarg):

Find the line that looks like:
```python
register_routes(
    app=app,
    extract_pdf_usecase=extract_pdf_usecase,
    extract_md_tables_usecase=extract_md_tables_usecase,
    extract_layout_first_usecase=extract_layout_first_usecase,
    # ... other use cases
)
```

Add to the kwargs:
```python
    doclang_serialize_usecase=doclang_serialize_usecase,
```

Example:
```python
register_routes(
    app=app,
    extract_pdf_usecase=extract_pdf_usecase,
    extract_md_tables_usecase=extract_md_tables_usecase,
    extract_layout_first_usecase=extract_layout_first_usecase,
    doclang_serialize_usecase=doclang_serialize_usecase,  # NEW
    # ... rest of kwargs
)
```

---

## Acceptance Criteria

- [ ] `requirements.txt` contains `doclang==0.6.0` (exact pin, no range)
- [ ] `pip check` in the pdf-extractor environment reports "No broken requirements found"
- [ ] `main.py` imports `DocLangSerializer`, `FilesystemDocLangWriteAdapter`, `DocLangSerializeUseCase`
- [ ] `main.py` constructs `_doclang_serializer` with `bbox_provider=None`
- [ ] `main.py` constructs `_doclang_write_adapter` with `output_dir=cfg.doclang_output_dir`
- [ ] `main.py` constructs `doclang_serialize_usecase` with both instances
- [ ] `doclang_serialize_usecase` registered in `register_routes()` kwargs
- [ ] No handler modifications yet (ADDITIVE ONLY — handlers remain unchanged)

---

## Testing (Local)

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/pdf-extractor

# Test 1: Verify requirements.txt
grep "doclang==0.6.0" requirements.txt && echo "Pin OK"

# Test 2: Verify pip check
pip install -r requirements.txt
pip check  # Must output: "No broken requirements found."

# Test 3: Verify imports work
python -c "from main import doclang_serialize_usecase; print('Wiring OK')"
```

Expected output:
```
Pin OK
No broken requirements found.
Wiring OK
```

---

## Notes

- The `doclang_serialize_usecase` is wired but NOT yet called by any handler — that happens in a future phase (post-QA)
- `bbox_provider=None` means Phase 1 serializer emits no `<location>` elements; Phase 2 can wire a concrete provider
- `cfg.doclang_output_dir` comes from Config field added in DOCLANG-T1
- The wiring is ADDITIVE — no existing handler or use case is modified
- If `register_routes()` signature is different (e.g., via kwargs dict), adapt the passing pattern to match
