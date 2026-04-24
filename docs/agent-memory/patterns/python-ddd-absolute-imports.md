# Pattern: Python DDD — Use Absolute Imports (not relative)

## Context

When running pytest from the service root (e.g., `apps/pdf-extractor/`) with `sys.path.insert(0, ...)`,
Python resolves module names from the path root. Relative imports (`from ..domain.X`) fail because
the package is not imported as a nested package — it's treated as a top-level module.

## Rule

All intra-service imports in Python microservices MUST use absolute import style:

```python
# CORRECT
from domain.models import PDFDocument
from domain.services import ExtractPDFService
from application.dtos import ExtractPDFRequest
from infrastructure.repositories import SQLitePDFDocumentRepository

# WRONG — fails when running pytest from service root
from ..domain.models import PDFDocument
from .dtos import ExtractPDFRequest
```

## Why

pytest is run from `apps/pdf-extractor/` with:
```python
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
```

This makes `domain`, `application`, `infrastructure`, `interface` top-level names in sys.path.
Relative imports require the module to be part of an installed package — not just on sys.path.

## Also Apply To

- `main.py` (app factory)
- All `interface/`, `infrastructure/`, `application/` files

## Prevention

When creating a new Python microservice:
1. Set `PYTHONPATH=/app` in Dockerfile (already done)
2. Use absolute imports everywhere from day one
3. Verify with: `cd apps/[service] && pytest __tests__/ -v` (not from monorepo root)
