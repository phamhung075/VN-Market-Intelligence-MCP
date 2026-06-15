# PO Notebook

## 2026-06-15T20:18Z — head reconcile + dispatch BCTC-OCR P0; scope FE-PAGE-REORG sprint

Dev-team :07 tick. Two items, sequenced against WIP≤2 + host headroom (load ~6.8/13
containers — healthy, NOT the 205-starvation scenario).

**ITEM 1 — board reconcile (done first).** `.head.active_task_id` was STALE-pointing at
FIX-BCTC-ENRICH-SILENT-0ROWS (in review[], done_verified=PENDING after its check-a HOLD)
— never advanced past last cycle's HOLD, so the :07 tick keying off `.head` would miss the
READY P0. Verified orch-state board itself already committed (4763dee7/5773ee7b; CLEAN tree,
no dirty board → no false-promotion sweep risk). Reconciled `.head` →
FIX-BCTC-BANK-PDF-OCR-RASTERIZE + DISPATCHED it ready→in_progress (P0, dev-pdf-extractor;
add OCR-rasterize leg via in-image PaddleOCR before text-table parse; GENERIC low-text-density
routing, no allowlist; preserve 989654f2 enrich_failed fail-loud). = 1 dev coding lane.
ARCH-CRON in_progress = QA-LIVE-OUTCOME-OBSERVE gate (no dev WIP). WIP≤2 honored.

**ITEM 2 — NEW user sprint scoped.** "Frontend pages resemble each other, merge to
categories." Read-only audit already persisted (2026-06-15-frontend-page-reorg-audit.md).
Minted sprint_goal[FE-PAGE-REORG] (Wave-1 P0+P1 / Wave-2 P2+P3, owner dev-frontend) +
BA-FE-PAGE-REORG TODO → ba→architect→pm→dev-frontend→qa. Spec mandate: ONE generic
<ScreenerTable>/component per cluster for ALL entities (/goal#2, no per-page fork) + every
migrated cell renders REAL loader data, no destructuring-default/placeholder mask (/goal#1 +
no-fake-data); NO API/route/behavior change (tests stay green). Planning = ZERO dev coding
WIP; dev-frontend IMPL becomes the natural 2nd lane only AFTER spec lands → no over-parallel
fan-out now.

Committed b2ae5134 (orch-state + script, explicit path; 83-file dirty tree NOT swept) +
8f2b7119 (2 DJ entries, task_board byte-unchanged). Script:
scripts/po-s64-head-reconcile-bctc-ocr-dispatch-fe-reorg-scope.jq. PUSH HELD (PO deferred;
origin diverged via benign cloud-chore).

### Carry-over
- **FIX-BCTC-BANK-PDF-OCR-RASTERIZE (in_progress, P0)** → dev-pdf-extractor leads NOW.
  done_verified = REAL VARIED rows VCB AND CTG vs named-volume DB; FPT145/VCB112 non-regress;
  genuinely-unparseable PDF still enrich_failed. On land → flip FIX-BCTC-ENRICH-SILENT-0ROWS
  review→done_verified (its (b)+(c) legs already PASS; check-a completes via this OCR leg).
- **BA-FE-PAGE-REORG (backlog, TODO)** → ba writes spec next; dev-frontend IMPL = 2nd lane
  after spec (low-risk internal refactor, no behavior change).
- cowork bctc-analyst CTG/VCB/D2D RELEASE block stays JUSTIFIED-blocked (real, not stale).
- 06-16 gates pending: vnstock-tradingstats 08:30Z sweep, RSI market-open echo. PUSH HELD.
- Reusable: scripts/ops-bctc-enrich-reverify-pulljob.sh; scripts/po-s64-…-fe-reorg-scope.jq.
- FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK batch one dev-vps-crawls pass.
