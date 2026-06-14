# TASK-DOCLANG-T2: Core Serializer — DocLangSerializer

**Sprint:** DOCLANG-SERIALIZE (Phase 1)  
**Owner:** dev-pdf-extractor  
**Size:** M (~2 hours)  
**Depends on:** DOCLANG-T1-DOMAIN (port + config ready)

---

## Description

Implement the pure, stateless `DocLangSerializer` class in a new file `apps/pdf-extractor/infrastructure/doclang_serializer.py`. This is the heart of the Phase 1 serializer — it transforms `ExtractedTableDTO` objects into DocLang XML.

**Key principle:** Pure transformation, stdlib-only (no infrastructure imports except logging). No I/O, no DB calls, no state beyond `bbox_provider` hook parameter.

---

## File to Create

### `apps/pdf-extractor/infrastructure/doclang_serializer.py`

This file will contain TWO classes:
1. **`DocLangSerializer`** (this task)
2. **`FilesystemDocLangWriteAdapter` + `NullDocLangWriteAdapter`** (TASK-DOCLANG-T3)

---

## Implementation: `DocLangSerializer`

### Class Signature

```python
class DocLangSerializer:
    """
    Pure DocLang XML serializer for financial report tables.
    
    Input: list of ExtractedTableDTO objects (from application/dtos.py)
    Output: Complete, well-formed DocLang XML string (version 0.6)
    
    Transformation rules:
    - Group DTOs by table_index
    - Single-DTO group → emit one <table>
    - Multi-DTO group (same table_index, different page_numbers) → emit paired <table> with <thread> + <page_break>
    - Rectangular rule: pad short rows to len(headers), warn on surplus cells
    - XML escape all cell content: & < > " '
    
    Threading (cross-page continuation):
    - When multiple ExtractedTableDTO objects share the same table_index but differ in page_number,
      they represent a logical table split across pages. Emit as paired <table> elements with
      matching <thread thread_id="{table_index}"/> and separated by <page_break/>.
    - This handles both upstream shapes: single stitched DTO (no threading) and multiple DTOs (threading).
    """
    
    def __init__(self, bbox_provider: Optional[Callable[[int, int], Tuple[int, int, int, int]]] = None):
        """
        Initialize the serializer.
        
        Args:
            bbox_provider: Optional hook for future phase (Phase 2). When provided, will be called
                          as bbox_provider(table_index, page_number) -> (x, y, w, h). In Phase 1,
                          always None; the serializer skips <location> emission without branching.
        """
        self._bbox_provider = bbox_provider
        # No other state
    
    def serialize(self, tables: list[ExtractedTableDTO], report_id: str = "unknown") -> str:
        """
        Serialize a list of ExtractedTableDTO objects to a DocLang XML string.
        
        Args:
            tables: List of ExtractedTableDTO, each with table_index, headers, rows, page_number
            report_id: Document identifier for metadata (default: "unknown")
        
        Returns:
            Well-formed DocLang XML string (UTF-8), ready to write to disk.
            Never raises. Returns empty string if tables is empty.
        """
        # ALGORITHM:
        # 1. Filter out empty tables (both headers and rows missing)
        # 2. Group tables by table_index (ascending order)
        # 3. For each group, call _serialize_group(group, thread_id)
        # 4. Wrap all table elements in <doclang> root with xmlns + version
        # 5. Return as string
        ...
    
    @staticmethod
    def _escape_xml(text: str) -> str:
        """
        Escape XML special characters: & < > " '
        
        PROMOTED from: scripts/spike-doclang-otsl-overlap.py:225-275
        Reference: https://www.w3.org/TR/xml/#syntax
        
        Escaping order matters: & MUST be first.
        
        Args:
            text: Raw cell value (may be None or non-string)
        
        Returns:
            XML-escaped string. UTF-8 Vietnamese diacritics pass through unescaped.
        """
        if text is None:
            return ""
        if not isinstance(text, str):
            logging.debug("DocLangSerializer._escape_xml: non-string cell %r, coercing to str", type(text))
            text = str(text)
        
        # Order: & first, then others
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        text = text.replace(">", "&gt;")
        text = text.replace('"', "&quot;")
        text = text.replace("'", "&apos;")
        return text
    
    def _serialize_group(self, group: list[ExtractedTableDTO], thread_id: Optional[int]) -> list[str]:
        """
        Serialize one table index group into one or more <table> elements.
        
        Args:
            group: List of ExtractedTableDTO with identical table_index, in ascending page_number order
            thread_id: table_index value (for threading annotation on multi-DTO groups)
        
        Returns:
            List of strings, each representing one <table> element (as XML string).
            For single-DTO groups: [single_table_str]
            For multi-DTO groups: [table1_with_thread, page_break, table2_with_thread]
        """
        # Single DTO: no threading
        if len(group) == 1:
            return [self._table_element(group[0], thread_id=None)]
        
        # Multiple DTOs: thread them
        result = []
        for i, dto in enumerate(group):
            result.append(self._table_element(dto, thread_id=thread_id))
            # Add page_break between tables (not after the last one)
            if i < len(group) - 1:
                result.append("<page_break/>")
        return result
    
    def _table_element(self, dto: ExtractedTableDTO, thread_id: Optional[int] = None) -> str:
        """
        Emit a single <table>...</table> element for one ExtractedTableDTO.
        
        Args:
            dto: One ExtractedTableDTO with headers, rows, table_index, page_number
            thread_id: If set, emit <thread thread_id="{thread_id}"/> as first child
        
        Returns:
            Complete <table>...</table> XML string.
        """
        lines = ["<table>"]
        
        # Emit thread marker if cross-page
        if thread_id is not None:
            lines.append(f'  <thread thread_id="{thread_id}"/>')
        
        # Header row
        for header in dto.headers:
            lines.append(f"  <ched/>{self._escape_xml(header)}")
        lines.append("  <nl/>")
        
        # Data rows (apply rectangular rule)
        for row_idx, row in enumerate(dto.rows):
            # Pad or warn
            if len(row) < len(dto.headers):
                row_padded = list(row) + [""] * (len(dto.headers) - len(row))
            elif len(row) > len(dto.headers):
                row_padded = list(row)
                logging.warning(
                    "DocLangSerializer: row %d too long (table_index=%d, page_number=%d, expected=%d, actual=%d)",
                    row_idx, dto.table_index, dto.page_number, len(dto.headers), len(row)
                )
            else:
                row_padded = row
            
            for cell in row_padded:
                lines.append(f"  <fcel/>{self._escape_xml(cell)}")
            lines.append("  <nl/>")
        
        lines.append("</table>")
        return "\n".join(lines)

```

### Constants

Define at module level:

```python
import logging
from typing import Optional, Callable, Tuple, List
from application.dtos import ExtractedTableDTO

logger = logging.getLogger(__name__)

DOCLANG_NS = "https://www.doclang.ai/ns/v0"
DOCLANG_VERSION = "0.6"
```

### Root wrapper

In the `serialize()` method, wrap the table elements like this:

```python
def serialize(self, tables: list[ExtractedTableDTO], report_id: str = "unknown") -> str:
    # ... (implementation details above)
    
    # Build groups by table_index
    groups_dict = {}
    for dto in tables:
        if not dto.headers or (not dto.rows and not dto.headers):  # Skip empty
            logging.warning("DocLangSerializer: skipping empty table (table_index=%d, page_number=%d)", 
                          dto.table_index, dto.page_number)
            continue
        
        if dto.table_index not in groups_dict:
            groups_dict[dto.table_index] = []
        groups_dict[dto.table_index].append(dto)
    
    # Sort groups and serialize
    table_elements = []
    for table_idx in sorted(groups_dict.keys()):
        group = groups_dict[table_idx]
        # Sort by page_number within group
        group.sort(key=lambda dto: dto.page_number)
        table_elements.extend(self._serialize_group(group, thread_id=table_idx))
    
    # Root element with metadata
    root_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<doclang xmlns="{DOCLANG_NS}" version="{DOCLANG_VERSION}">',
        f'  <head><custom>report_id={report_id}</custom></head>',
    ]
    root_lines.extend(["  " + line for line in "\n".join(table_elements).split("\n")])
    root_lines.append("</doclang>")
    
    return "\n".join(root_lines)
```

---

## Acceptance Criteria

- [ ] `DocLangSerializer` class created with `__init__(bbox_provider=None)` signature
- [ ] `serialize(tables, report_id)` returns well-formed XML string (passes `xml.etree.ElementTree.fromstring()`)
- [ ] Threading logic: groups by `table_index`, emits paired `<table>` + `<page_break>` for multi-DTO groups
- [ ] `_escape_xml()` promoted verbatim from spike (& < > " ' escaping, in correct order)
- [ ] Rectangular rule enforced: short rows padded, surplus cells logged as WARNING
- [ ] Output wraps in `<doclang xmlns="https://www.doclang.ai/ns/v0" version="0.6"><head><custom>report_id=...</custom></head>...</doclang>`
- [ ] No imports beyond: `xml.etree.ElementTree`, `logging`, `typing`, `ExtractedTableDTO`
- [ ] Empty tables (0 headers AND 0 rows) skipped with WARNING log

---

## Testing (Local)

Create a minimal test to verify XML structure:

```python
from infrastructure.doclang_serializer import DocLangSerializer
from application.dtos import ExtractedTableDTO

# Test 1: Single table
serializer = DocLangSerializer()
dto = ExtractedTableDTO(
    table_index=0,
    page_number=1,
    headers=["A", "B"],
    rows=[["1", "2"], ["3", "4"]]
)
xml = serializer.serialize([dto], report_id="test-001")
assert "<?xml" in xml
assert "<doclang" in xml
assert "<ched/>A" in xml
assert "<fcel/>1" in xml
print("Single table test: PASS")

# Test 2: Cross-page threading
dto1 = ExtractedTableDTO(table_index=0, page_number=4, headers=["X", "Y"], rows=[["a", "b"]])
dto2 = ExtractedTableDTO(table_index=0, page_number=5, headers=["X", "Y"], rows=[["c", "d"]])
xml = serializer.serialize([dto1, dto2], report_id="test-002")
assert xml.count('<thread thread_id="0"/>') == 2
assert "<page_break/>" in xml
print("Cross-page threading test: PASS")
```

---

## Notes

- This is the core logic; adapters are added in T3
- Promoted code from spike must be used verbatim (no re-implementation)
- The `bbox_provider` hook is stored but always `None` in Phase 1 — no branching logic in cell emission
- Empty table detection: if headers is empty OR (headers non-empty AND rows empty), skip with warning
