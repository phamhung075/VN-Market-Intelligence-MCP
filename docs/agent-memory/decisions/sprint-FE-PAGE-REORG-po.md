# Decision Journal — Sprint FE-PAGE-REORG · po

**Sprint goal:** FE-PAGE-REORG (active); this cycle scopes the cross-cutting ERROR-AUDIT-2026-06-15 epic (ambient to the sprint).
**Agent:** po
**Started:** 2026-06-15T21:24:00Z

---

### STEP po-S1 · po · 2026-06-15T21:24:00Z
**task-id:** FIX-ERRAUDIT-W1-MCP-P0
**what-done:** Minted the 3-wave error-handling audit epic (7 tasks) and dispatched the dev-mcp-server P0 pair into the 1 free coding lane; queued the pdf-extractor P0 pair behind the active same-zone lane; backlogged Waves 2-3.
**what-considered:**
- Dispatch mcp-server P0 pair first (free lane, no fetch surface, lowest-risk Wave-1) vs pdf-extractor P0 pair — pdf-extractor zone is ACTIVELY edited (FIX-BCTC-BANK-PDF-OCR-RASTERIZE in_progress) → same-zone serialization forbids a concurrent agent.
- Mint pek P0s at all vs skip-as-duplicate — RAW-checked: active commits fffef229/56129626 touched ocr_adapter.py + test + docs ONLY; pek_engine_adapter.py:668/:342/:717 unmodified on disk → DISTINCT, real, must mint (queued not dispatched).
- Promote Wave-2/3 to ready vs backlog — backlog; promoting would invite WIP>2 fan-out (host-starvation lesson). ba→architect grooms later.
**why-decision:** dev-mcp-server P0 pair is the safest Wave-1 first dispatch (pure error→marker, no fetch surface, the only free coding lane); pek pair correctly queued via blocked_by to honor same-zone-serialization + WIP≤2.
**why-change:** Board has no `todo` array (brief said "todo"); mapped to live lifecycle: dispatch→in_progress, same-zone-queue→ready+blocked_by, ungroomed→backlog.
