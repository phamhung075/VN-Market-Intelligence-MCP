# Microservices DDD Architecture

All services follow Domain-Driven Design for testability, mockability, and clear separation.

## File Structure Pattern

```
[service]/
├── domain/
│   ├── models.py           # Value Objects, Entities
│   ├── repositories.py     # Abstract ports (interfaces)
│   ├── services.py         # Domain logic orchestrators
│   └── errors.py           # Custom exceptions
├── application/
│   ├── usecases.py         # Use case implementations
│   └── dtos.py             # Input/output data contracts
├── infrastructure/
│   ├── repositories.py     # Concrete implementations
│   ├── http_clients.py     # External HTTP calls
│   └── config.py
├── interface/
│   ├── handlers.py         # HTTP route handlers (thin)
│   └── serializers.py      # JSON converters
├── __tests__/
│   ├── unit/               # Domain + application logic
│   ├── integration/        # With mocked infrastructure
│   └── e2e/                # Full stack (docker-compose)
└── ports.ts / ports.py     # All abstract port definitions
```

## Rule: Dependency Injection

- domain/ ← never imports infrastructure/ or interface/
- application/ ← imports domain/, receives injected infrastructure ports
- infrastructure/ ← implements domain/ ports
- interface/ ← calls application/ usecases, receives injected dependencies

```
Interface (HTTP request)
  ↓
  Handler (parse + validate)
  ↓
  UseCase (injected ports from infrastructure/)
  ↓
  Domain Service (pure logic, calls repositories)
  ↓
  Repository Port (abstract)
  ↓
  Infrastructure Impl (DB, HTTP, file I/O)
```

---

## Example 1: PDF Extractor (Python)

### domain/models.py

```python
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass
class PDFDocument:
    """Entity: represents a single PDF document"""
    id: str
    url: str
    source_type: str  # 'bctc', 'weather', 'utility_bill'
    status: str       # 'pending', 'processing', 'success', 'failed'
    extracted_at: Optional[datetime] = None

@dataclass
class ExtractedTable:
    """Value Object: structured data from PDF"""
    table_index: int
    headers: list[str]
    rows: list[list[str]]
    page_number: int

@dataclass
class ExtractedContent:
    """Value Object: complete extraction result"""
    document_id: str
    tables: list[ExtractedTable]
    text_content: str
    ocr_confidence: float  # 0.0-1.0
    extraction_time_ms: int
```

### domain/repositories.py

```python
from abc import ABC, abstractmethod
from typing import Optional
from .models import PDFDocument, ExtractedContent

class PDFDocumentRepository(ABC):
    """Port: persistence layer (abstract)"""

    @abstractmethod
    async def save(self, doc: PDFDocument) -> None:
        pass

    @abstractmethod
    async def find_by_id(self, doc_id: str) -> Optional[PDFDocument]:
        pass

    @abstractmethod
    async def find_pending(self) -> list[PDFDocument]:
        pass

class PDFStorageRepository(ABC):
    """Port: file storage (abstract)"""

    @abstractmethod
    async def fetch_pdf(self, url: str) -> bytes:
        """Download PDF from URL"""
        pass

    @abstractmethod
    async def store_extraction(self, doc_id: str, content: ExtractedContent) -> str:
        """Store extracted JSON result"""
        pass

class PDFExtractionEngine(ABC):
    """Port: extraction algorithm (abstract)"""

    @abstractmethod
    async def extract_tables(self, pdf_bytes: bytes) -> list[ExtractedTable]:
        pass

    @abstractmethod
    async def extract_text_ocr(self, pdf_bytes: bytes) -> tuple[str, float]:
        """Returns (text, confidence)"""
        pass
```

### domain/services.py

```python
from typing import Optional
from datetime import datetime
from .models import PDFDocument, ExtractedContent
from .repositories import (
    PDFDocumentRepository,
    PDFStorageRepository,
    PDFExtractionEngine,
)
from .errors import PDFProcessingError

class ExtractPDFService:
    """Domain service: pure business logic for PDF extraction"""

    def __init__(
        self,
        doc_repo: PDFDocumentRepository,
        storage_repo: PDFStorageRepository,
        engine: PDFExtractionEngine,
    ):
        self.doc_repo = doc_repo
        self.storage_repo = storage_repo
        self.engine = engine

    async def process_pdf(self, doc_id: str) -> ExtractedContent:
        """
        Core logic: download → extract → validate → store
        Pure domain logic; repositories are injected ports.
        """
        # Load document metadata
        doc = await self.doc_repo.find_by_id(doc_id)
        if not doc:
            raise PDFProcessingError(f"Document {doc_id} not found")

        # Mark as processing
        doc.status = "processing"
        await self.doc_repo.save(doc)

        try:
            # Fetch PDF (port call)
            pdf_bytes = await self.storage_repo.fetch_pdf(doc.url)

            # Extract tables (port call)
            start = datetime.now()
            tables = await self.engine.extract_tables(pdf_bytes)
            text, ocr_conf = await self.engine.extract_text_ocr(pdf_bytes)
            extraction_time = int((datetime.now() - start).total_seconds() * 1000)

            # Validate extraction quality
            if ocr_conf < 0.5 and not tables:
                raise PDFProcessingError("Extraction quality too low")

            # Create result
            content = ExtractedContent(
                document_id=doc_id,
                tables=tables,
                text_content=text,
                ocr_confidence=ocr_conf,
                extraction_time_ms=extraction_time,
            )

            # Store result (port call)
            await self.storage_repo.store_extraction(doc_id, content)

            # Mark as success
            doc.status = "success"
            doc.extracted_at = datetime.now()
            await self.doc_repo.save(doc)

            return content

        except Exception as e:
            doc.status = "failed"
            await self.doc_repo.save(doc)
            raise PDFProcessingError(str(e)) from e
```

### application/dtos.py

```python
from dataclasses import dataclass, asdict
from typing import Optional

@dataclass
class ExtractPDFRequest:
    """Input contract"""
    url: str
    source_type: str  # 'bctc', 'weather', 'utility_bill'
    priority: int = 0

@dataclass
class ExtractedTableDTO:
    """Output contract"""
    table_index: int
    headers: list[str]
    rows: list[list[str]]
    page_number: int

@dataclass
class ExtractPDFResponse:
    """Output contract"""
    document_id: str
    tables: list[ExtractedTableDTO]
    text_content: str
    ocr_confidence: float
    extraction_time_ms: int
    status: str  # 'success' | 'failed'

    def to_json(self) -> dict:
        return asdict(self)
```

### application/usecases.py

```python
from typing import Optional
from uuid import uuid4
from .dtos import ExtractPDFRequest, ExtractPDFResponse
from ..domain.models import PDFDocument
from ..domain.services import ExtractPDFService
from ..domain.errors import PDFProcessingError

class ExtractPDFUseCase:
    """Application layer: orchestrates domain service + repositories"""

    def __init__(self, extract_service: ExtractPDFService):
        self.extract_service = extract_service

    async def execute(self, request: ExtractPDFRequest) -> ExtractPDFResponse:
        """
        High-level orchestration:
        1. Create document
        2. Run domain service
        3. Convert to response DTO
        """
        doc_id = str(uuid4())
        doc = PDFDocument(
            id=doc_id,
            url=request.url,
            source_type=request.source_type,
            status="pending",
        )
        await self.extract_service.doc_repo.save(doc)

        try:
            content = await self.extract_service.process_pdf(doc_id)

            return ExtractPDFResponse(
                document_id=content.document_id,
                tables=[
                    ExtractedTableDTO(
                        table_index=t.table_index,
                        headers=t.headers,
                        rows=t.rows,
                        page_number=t.page_number,
                    )
                    for t in content.tables
                ],
                text_content=content.text_content,
                ocr_confidence=content.ocr_confidence,
                extraction_time_ms=content.extraction_time_ms,
                status="success",
            )
        except PDFProcessingError as e:
            return ExtractPDFResponse(
                document_id=doc_id,
                tables=[],
                text_content="",
                ocr_confidence=0.0,
                extraction_time_ms=0,
                status="failed",
            )
```

### infrastructure/repositories.py

```python
import sqlite3
from typing import Optional
import aiohttp
from ..domain.models import PDFDocument, ExtractedContent, ExtractedTable
from ..domain.repositories import PDFDocumentRepository, PDFStorageRepository

class SQLitePDFDocumentRepository(PDFDocumentRepository):
    """Concrete implementation: SQLite persistence"""

    def __init__(self, db_path: str):
        self.db_path = db_path

    async def save(self, doc: PDFDocument) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT OR REPLACE INTO pdf_documents (id, url, source_type, status, extracted_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (doc.id, doc.url, doc.source_type, doc.status, doc.extracted_at),
        )
        conn.commit()
        conn.close()

    async def find_by_id(self, doc_id: str) -> Optional[PDFDocument]:
        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            "SELECT id, url, source_type, status, extracted_at FROM pdf_documents WHERE id = ?",
            (doc_id,),
        ).fetchone()
        conn.close()

        if not row:
            return None

        return PDFDocument(
            id=row[0],
            url=row[1],
            source_type=row[2],
            status=row[3],
            extracted_at=row[4],
        )

class HTTPPDFStorageRepository(PDFStorageRepository):
    """Concrete implementation: HTTP fetch + local storage"""

    def __init__(self, storage_dir: str):
        self.storage_dir = storage_dir

    async def fetch_pdf(self, url: str) -> bytes:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=30) as resp:
                if resp.status != 200:
                    raise Exception(f"HTTP {resp.status}")
                return await resp.read()

    async def store_extraction(self, doc_id: str, content: ExtractedContent) -> str:
        import json
        import os

        output_path = os.path.join(self.storage_dir, f"{doc_id}.json")
        with open(output_path, 'w') as f:
            json.dump({
                'document_id': content.document_id,
                'tables': [
                    {
                        'table_index': t.table_index,
                        'headers': t.headers,
                        'rows': t.rows,
                        'page_number': t.page_number,
                    }
                    for t in content.tables
                ],
                'text_content': content.text_content,
                'ocr_confidence': content.ocr_confidence,
                'extraction_time_ms': content.extraction_time_ms,
            }, f)
        return output_path
```

### infrastructure/extraction_engine.py

```python
from typing import Optional
import pdfplumber
from ..domain.models import ExtractedTable
from ..domain.repositories import PDFExtractionEngine

class PdfplumberExtractionEngine(PDFExtractionEngine):
    """Concrete implementation: pdfplumber + Tesseract ONNX"""

    async def extract_tables(self, pdf_bytes: bytes) -> list[ExtractedTable]:
        import io
        tables = []

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_tables = page.extract_tables()
                if page_tables:
                    for table_idx, table in enumerate(page_tables):
                        if table:
                            headers = table[0] if table else []
                            rows = table[1:] if len(table) > 1 else []
                            tables.append(
                                ExtractedTable(
                                    table_index=table_idx,
                                    headers=headers,
                                    rows=rows,
                                    page_number=page_num,
                                )
                            )
        return tables

    async def extract_text_ocr(self, pdf_bytes: bytes) -> tuple[str, float]:
        import io
        import pytesseract
        from PIL import Image

        text_parts = []
        confidence = 1.0

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                # Extract text directly first
                text = page.extract_text()
                if text:
                    text_parts.append(text)

                # OCR fallback for images
                im = page.to_image()
                ocr_text = pytesseract.image_to_string(im.original)
                if ocr_text and len(ocr_text) > len(text or ""):
                    text_parts.append(ocr_text)
                    confidence = 0.8  # OCR is less reliable

        return "\n".join(text_parts), confidence
```

### interface/handlers.py

```python
from fastapi import APIRouter, HTTPException
from ..application.usecases import ExtractPDFUseCase
from ..application.dtos import ExtractPDFRequest, ExtractPDFResponse

class PDFExtractorHandler:
    """HTTP layer: thin handler, delegates to usecase"""

    def __init__(self, extract_usecase: ExtractPDFUseCase):
        self.extract_usecase = extract_usecase

    async def handle_extract(self, request: ExtractPDFRequest) -> ExtractPDFResponse:
        """POST /extract"""
        return await self.extract_usecase.execute(request)

def register_routes(router: APIRouter, handler: PDFExtractorHandler):

    @router.post("/extract")
    async def extract_pdf(request: ExtractPDFRequest):
        response = await handler.handle_extract(request)
        return response.to_json()
```

### __tests__/unit/test_extract_pdf_service.py

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

from ...domain.services import ExtractPDFService
from ...domain.models import PDFDocument, ExtractedTable, ExtractedContent
from ...domain.errors import PDFProcessingError

@pytest.mark.asyncio
class TestExtractPDFService:
    """Unit tests: mock all ports, test domain logic only"""

    @pytest.fixture
    def setup(self):
        """Setup mocked ports"""
        doc_repo = AsyncMock()
        storage_repo = AsyncMock()
        engine = AsyncMock()

        service = ExtractPDFService(doc_repo, storage_repo, engine)

        return {
            'service': service,
            'doc_repo': doc_repo,
            'storage_repo': storage_repo,
            'engine': engine,
        }

    async def test_process_pdf_success(self, setup):
        """Happy path: extraction succeeds"""
        s = setup
        doc_id = "doc-123"

        # Setup mocked ports
        doc = PDFDocument(
            id=doc_id,
            url="http://example.com/test.pdf",
            source_type="bctc",
            status="pending",
        )
        s['doc_repo'].find_by_id.return_value = doc
        s['doc_repo'].save = AsyncMock()

        pdf_bytes = b"PDF mock"
        s['storage_repo'].fetch_pdf.return_value = pdf_bytes
        s['storage_repo'].store_extraction = AsyncMock()

        tables = [
            ExtractedTable(
                table_index=0,
                headers=["Revenue", "Profit"],
                rows=[["2026", "1000000"]],
                page_number=1,
            ),
        ]
        s['engine'].extract_tables.return_value = tables
        s['engine'].extract_text_ocr.return_value = ("extracted text", 0.95)

        # Execute
        result = await s['service'].process_pdf(doc_id)

        # Assert domain logic
        assert result.document_id == doc_id
        assert len(result.tables) == 1
        assert result.ocr_confidence == 0.95

        # Assert ports were called correctly
        s['doc_repo'].find_by_id.assert_called_once_with(doc_id)
        s['storage_repo'].fetch_pdf.assert_called_once_with(doc.url)
        s['engine'].extract_tables.assert_called_once_with(pdf_bytes)

    async def test_process_pdf_not_found(self, setup):
        """Error case: document not found"""
        s = setup
        s['doc_repo'].find_by_id.return_value = None

        with pytest.raises(PDFProcessingError):
            await s['service'].process_pdf("nonexistent")

    async def test_process_pdf_low_quality(self, setup):
        """Error case: extraction quality too low"""
        s = setup
        doc = PDFDocument(
            id="doc-123",
            url="http://example.com/test.pdf",
            source_type="bctc",
            status="pending",
        )
        s['doc_repo'].find_by_id.return_value = doc
        s['storage_repo'].fetch_pdf.return_value = b"PDF mock"

        # Low confidence, no tables
        s['engine'].extract_tables.return_value = []
        s['engine'].extract_text_ocr.return_value = ("", 0.3)

        with pytest.raises(PDFProcessingError):
            await s['service'].process_pdf("doc-123")
```

### __tests__/integration/test_extract_pdf_usecase.py

```python
import pytest
from ...application.usecases import ExtractPDFUseCase
from ...application.dtos import ExtractPDFRequest
from ...infrastructure.repositories import SQLitePDFDocumentRepository
from ...domain.services import ExtractPDFService
from unittest.mock import AsyncMock

@pytest.mark.asyncio
class TestExtractPDFUseCase:
    """Integration tests: real repos (SQLite), mocked external services"""

    async def test_extract_pdf_flow(self, tmp_path):
        """Full use case: request → domain → repo → response"""

        # Real SQLite repo
        db_path = str(tmp_path / "test.db")
        doc_repo = SQLitePDFDocumentRepository(db_path)

        # Mocked external services
        storage_repo = AsyncMock()
        engine = AsyncMock()

        # Setup domain service
        domain_service = ExtractPDFService(doc_repo, storage_repo, engine)

        # Setup use case
        usecase = ExtractPDFUseCase(domain_service)

        # Execute
        request = ExtractPDFRequest(
            url="http://example.com/test.pdf",
            source_type="bctc",
        )

        response = await usecase.execute(request)

        # Assert response
        assert response.status == "failed"  # because engine is mocked
        assert response.document_id  # should have ID

        # Assert repo persisted document
        doc = await doc_repo.find_by_id(response.document_id)
        assert doc is not None
```

---

## Example 2: RAG Service (Python)

```
rag-service/
├── domain/
│   ├── models.py          # EmbeddingVector, AnalysisEntry
│   ├── repositories.py    # VectorStorePort, AnalysisRepositoryPort
│   ├── services.py        # SearchService (pure logic)
│   └── errors.py
├── application/
│   ├── usecases.py        # SearchUseCase, IndexUseCase
│   └── dtos.py            # SearchRequest, SearchResult
├── infrastructure/
│   ├── repositories.py    # LanceDBVectorStore, SQLiteAnalysisRepository
│   ├── embedder.py        # SentenceTransformersEmbedder
│   └── config.py
├── interface/
│   ├── handlers.py        # SearchHandler, IndexHandler
│   └── serializers.py
└── __tests__/
```

---

## Example 3: Technical Analysis (TypeScript)

### domain/models.ts

```typescript
export interface CandleStick {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  rsi: number;           // 0-100
  macd: {
    line: number;
    signal: number;
    histogram: number;
  };
  movingAverages: {
    ma5: number;
    ma20: number;
    ma50: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}
```

### domain/repositories.ts

```typescript
export interface PriceHistoryRepository {
  getHistory(code: string, days: number): Promise<CandleStick[]>;
}

export interface TAIndicatorCalculator {
  calculateRSI(closes: number[], period?: number): number;
  calculateMACD(closes: number[]): { line: number; signal: number; histogram: number };
  calculateMA(closes: number[], period: number): number;
  calculateBB(closes: number[], period?: number, stdDev?: number): { upper: number; middle: number; lower: number };
}
```

### domain/services.ts

```typescript
export class CalculateTAService {
  constructor(
    private priceRepo: PriceHistoryRepository,
    private calculator: TAIndicatorCalculator,
  ) {}

  async compute(code: string, days: number): Promise<TechnicalIndicators> {
    // Pure domain logic
    const history = await this.priceRepo.getHistory(code, days);

    const closes = history.map(c => c.close);

    const rsi = this.calculator.calculateRSI(closes);
    const macd = this.calculator.calculateMACD(closes);
    const ma5 = this.calculator.calculateMA(closes, 5);
    const ma20 = this.calculator.calculateMA(closes, 20);
    const ma50 = this.calculator.calculateMA(closes, 50);
    const bb = this.calculator.calculateBB(closes);

    const trend = this.determineTrend(rsi, macd.histogram, closes);

    return {
      rsi,
      macd,
      movingAverages: { ma5, ma20, ma50 },
      bollingerBands: bb,
      trend,
    };
  }

  private determineTrend(rsi: number, macdHist: number, closes: number[]): string {
    if (rsi > 70 && macdHist > 0) return 'BULLISH';
    if (rsi < 30 && macdHist < 0) return 'BEARISH';
    return 'NEUTRAL';
  }
}
```

### application/usecases.ts

```typescript
export class ComputeTAUseCase {
  constructor(private service: CalculateTAService) {}

  async execute(request: ComputeTARequest): Promise<ComputeTAResponse> {
    const indicators = await this.service.compute(request.code, request.days);

    return {
      code: request.code,
      indicators,
      timestamp: new Date(),
    };
  }
}
```

### __tests__/unit/calculate-ta.test.ts

```typescript
describe('CalculateTAService', () => {
  let service: CalculateTAService;
  let priceRepo: jest.Mocked<PriceHistoryRepository>;
  let calculator: jest.Mocked<TAIndicatorCalculator>;

  beforeEach(() => {
    // Mock all ports
    priceRepo = {
      getHistory: jest.fn(),
    };

    calculator = {
      calculateRSI: jest.fn().mockReturnValue(65),
      calculateMACD: jest.fn().mockReturnValue({ line: 0.5, signal: 0.3, histogram: 0.2 }),
      calculateMA: jest.fn().mockReturnValue(100),
      calculateBB: jest.fn().mockReturnValue({ upper: 105, middle: 100, lower: 95 }),
    };

    service = new CalculateTAService(priceRepo, calculator);
  });

  it('should compute bullish trend', async () => {
    const history = [
      { close: 100 },
      { close: 102 },
      { close: 105 },
    ];

    priceRepo.getHistory.mockResolvedValue(history as any);

    const result = await service.compute('VCB', 60);

    expect(result.trend).toBe('BULLISH');
    expect(priceRepo.getHistory).toHaveBeenCalledWith('VCB', 60);
    expect(calculator.calculateRSI).toHaveBeenCalled();
  });
});
```

---

## Inter-Service Contracts (Shared Types)

### packages/shared-types/index.ts

```typescript
// ============= Alert =============
export interface Alert {
  id: string;
  stock: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  createdAt: Date;
}

// ============= Signal =============
export interface Signal {
  stock: string;
  type: 'price_drop' | 'price_surge' | 'news' | 'fundamental';
  confidence: number;    // 0-1
  metadata?: Record<string, any>;
}

// ============= PDF Extraction =============
export interface ExtractPDFRequest {
  url: string;
  sourceType: 'bctc' | 'weather' | 'utility_bill';
}

export interface ExtractPDFResponse {
  documentId: string;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  textContent: string;
  ocrConfidence: number;
  status: 'success' | 'failed';
}

// ============= Technical Analysis =============
export interface ComputeTARequest {
  code: string;
  days: number;
}

export interface ComputeTAResponse {
  code: string;
  rsi: number;
  macd: { line: number; signal: number; histogram: number };
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// ============= RAG Search =============
export interface SearchRequest {
  query: string;
  limit: number;
  decayHalfLifeDays: number;
}

export interface SearchResult {
  analysisId: string;
  content: string;
  similarity: number;    // 0-1
  ageHours: number;
  recencyScore: number;  // after temporal decay
}
```

---

## Testing Command Pattern

```bash
# Unit tests (all mocked)
pnpm --filter pdf-extractor test:unit

# Integration tests (real SQLite, mocked HTTP)
pnpm --filter pdf-extractor test:integration

# E2E tests (docker-compose up)
pnpm test:e2e

# All
pnpm test

# With coverage
pnpm test -- --coverage
```

---

## Benefits

✅ **Testability** — every layer is mockable independently
✅ **Clear contracts** — DTOs define input/output precisely
✅ **Reusability** — domain logic has zero dependencies
✅ **Language-agnostic** — same pattern works in Python + TypeScript
✅ **Easy to debug** — follow the layer stack
✅ **Scalability** — extract microservices later without refactoring logic

---

## Next: Update CLAUDE.md with DDD pattern?

Would you like me to:
1. Create starter templates for each service type?
2. Add DDD pattern to CLAUDE.md?
3. Start with Phase 0 refactor (monolith → monorepo)?
