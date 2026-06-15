# PO Notebook

## 2026-06-15T22:20Z — collapse dual-head SSOT (signal head-drift), reconcile live divergence

Priority-triage signal `head-drift-po-s64-vs-task-board-head` (NEW ~45min, autonomous
tick missed it). RECURRING ROOT: two head pointers with divergent writers —
TOP-LEVEL `.head` (po-s64, 20:17:53Z → FIX-BCTC-BANK-PDF-OCR-RASTERIZE) vs
`.task_board.head` (po-s65, 21:23:56Z → FIX-ERRAUDIT-W1-MCP-P0). Every consumer reads
TOP-LEVEL `.head` (dev-team flow Step 0b `jq -c '.head'`, orch-state-access.md §2,
router-d1-claim) → po-s65's dispatch was invisible to flow-resume.

CONCURRENCY GUARD: orch-state mtime 23:35:34 (= signal-emit write, ~45min stale) → no
live writer. Re-verified mtime unchanged immediately before the atomic write (CAS).

**DECISION: TOP-LEVEL `.head` = single canonical head SSOT** (option a — matches the
existing read sites, lowest blast radius; no architect schema decision needed, the read
SSOT already existed, just align writers). Canonical head value reconciled to the
most-recent real dispatch **FIX-ERRAUDIT-W1-MCP-P0 (next_agent=ba)** — po-s65's intent.
FIX-BCTC-BANK-PDF-OCR-RASTERIZE stays in_progress (dev-pdf-extractor), tracked via its
own in_progress row + router lock, independent of the pointer — not blocked.

**DURABLE FIX (recurring-root, not one-off):**
- `.task_board.head` → non-routing DEPRECATED stub (`canonical_moved_to:".head"`).
- 3 writer scripts retargeted to top-level `.head`: po-s65-error-audit-3wave-mint-dispatch,
  po-s54-macro-accuracy-pair-promote (was task_board.head-only), po-s54-vn-macro-ba-dispatch
  (was dual-write → now single).
- Canonical-head rule + "never write .task_board.head" guard documented in
  orch-state-access.md §4.
- Reconcile script: scripts/po-s66-head-ssot-collapse-reconcile.jq (atomic, idempotent,
  CAS mtime-guard). Signal flipped NEW→RESOLVED (disposition: DURABLE single-head collapse).

Commit scope: orch-state.json (explicit path) + 3 patched po-s* scripts + new s66 script +
orch-state-access.md §4 + po flow-doc pointer + this notebook. NO git add -A (live in-flight
work in tree). PUSH HELD (PO deferred call; origin diverged via benign cloud-chore).

### Carry-over
- **FIX-ERRAUDIT-W1-MCP-P0 (in_progress, P0, canonical head)** → ba writes spec NOW →
  architect→pm→dev-mcp-server→qa. done_verified = lock named-vol DB → 'degraded:' not 'ok'.
- **FIX-ERRAUDIT-W1-PEK-P0 (ready, BLOCKED)** → dispatch ONLY after FIX-BCTC-BANK-PDF-OCR-
  RASTERIZE reports done (same-zone serialize). Then 2nd coding lane.
- **FIX-BCTC-BANK-PDF-OCR-RASTERIZE (in_progress, dev-pdf-extractor)** — let finish; on land
  flip FIX-BCTC-ENRICH-SILENT-0ROWS review→done_verified (check-a leg).
- **Wave-2/3 (backlog ×5)** + **BA-FE-PAGE-REORG (backlog)** → ba→architect grooms later.
- HEAD-DRIFT GUARD now durable: any future script writing `.task_board.head` is a BUG —
  orch-state-access.md §4 is the SSOT; if drift recurs, a writer skipped the retarget.
