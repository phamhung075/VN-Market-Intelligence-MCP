# PO Notebook

## 2026-06-15T21:24Z — scope ERROR-AUDIT 3-wave epic; dispatch mcp-server P0 pair (1 free lane)

Sprint-scoping input: brief docs/analysis-briefs/2026-06-15-error-handling-audit.md
(read-only codebase-wide audit, 60 agents, 81 raw → 24 carried: 4 P0, 11 P1, 9 P2 +
6 shared "easy-handle" helpers). Every P0/P1 serves a FABRICATED value on error →
direct goal#1 (no-fake-data) work.

**OVERLAP CHECK (mandatory before mint).** The 2 pdf-extractor P0s are in
apps/pdf-extractor/ — SAME zone the active lane (FIX-BCTC-BANK-PDF-OCR-RASTERIZE,
in_progress, dev-pdf-extractor) edits, same FIX-BCTC-ENRICH-SILENT-0ROWS class.
RAW-verified: active commits fffef229/56129626 touched ocr_adapter.py + test + docs
ONLY; pek_engine_adapter.py:668 (layout-crash→empty bbox→0-page SUCCESS) and :342/:717
(PaddleOCR-load fail→paddle_table=None→row_count=0 quarantined=False clean pass) are
UNMODIFIED on disk → DISTINCT, not dups. Same-zone serialization → QUEUE, not dispatch.

**MINTED 7 under epic ERROR-AUDIT-2026-06-15** (all id-guarded, dedup-clean, no collisions):
- DISPATCHED 1 → in_progress (the 1 free coding lane): FIX-ERRAUDIT-W1-MCP-P0 (P0 pair,
  dev-mcp-server) = marketContextBuilder:417 derive status from query-success +
  tickerIntelligenceTools 6 logless catches → tagged-degraded. Pure error→marker, NO
  fetch surface. next=ba; head.active_task_id set; head.next_agent=dev-team.
- QUEUED 1 → ready BLOCKED_BY FIX-BCTC-BANK-PDF-OCR-RASTERIZE: FIX-ERRAUDIT-W1-PEK-P0
  (P0 pair, dev-pdf-extractor) = :668 + :342/:717, ship fail_loud_or_tag_degraded helper.
- BACKLOG 5 (NOT promoted): W2 FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (withDeadline+macroFetch,
  8 macro sites + bounded-fetch cluster), W2 -MCP-DATALAYER (safeQuery+runSection+failLoud),
  W2 -FRONTEND-SAFEFETCH (seq_after fetch-deadline, inner-first), W3 -MCP-P2, W3 -PEK-P2.

WIP≤2 RESPECTED: pdf-extractor lane active + ARCH-CRON (architect-design, NOT coding WIP);
1 free coding lane consumed by W1-MCP-P0. Both pre-existing in_progress rows BYTE-untouched
(race-safe; PEK dispatched_at unchanged). Atomic temp→[-s]→jq empty→conservation→
race-guard→rename; idempotent (re-run mints 0). Script:
scripts/po-s65-error-audit-3wave-mint-dispatch.jq. Committed orch-state explicit-path.
PUSH HELD (origin 72-ahead benign cloud-chore; PO deferred call).

DoD per fix (goal#1): FORCED failure (drop model / lock DB / corrupt payload) → tagged-
degraded / "(loi truy van)" / "degraded:" / quarantined, NOT empty success; LIVE on
NAMED-VOLUME market.db (vn-market-intelligence-mcp_market_data), container rebuilt,
QA-green RAW = done_verified. GENERIC: helpers generic across ALL entities, no hardcode.

### Carry-over
- **FIX-ERRAUDIT-W1-MCP-P0 (in_progress, P0)** → ba writes spec NOW → architect→pm→
  dev-mcp-server→qa. done_verified = lock named-vol DB → 'degraded:' not 'ok'; ticker-intel
  under DB error → '(loi truy van)' not '(khong co du lieu)'; genuine-empty ticker still plain.
- **FIX-ERRAUDIT-W1-PEK-P0 (ready, BLOCKED)** → dispatch ONLY after FIX-BCTC-BANK-PDF-OCR-
  RASTERIZE reports done (no concurrent same-zone agent). Then becomes the 2nd coding lane.
- **Wave-2/3 (backlog ×5)** → ba→architect grooms after Wave-1 lands; macroFetch=8-site one-edit.
- FIX-BCTC-BANK-PDF-OCR-RASTERIZE still in_progress (dev-pdf-extractor) — let it finish; on
  land flip FIX-BCTC-ENRICH-SILENT-0ROWS review→done_verified (check-a leg).
- BA-FE-PAGE-REORG (backlog) still pending ba spec (prior cycle).
- PUSH HELD. Reusable: scripts/po-s65-error-audit-3wave-mint-dispatch.jq.
