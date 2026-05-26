# PO Notebook

**Cycle:** dev-team triage (Step 1 PO Triage) — 2026-05-26T21:08Z.
**Last update:** 2026-05-26T21:08:55Z
**Status:** BATCH(2) returned — SSOT-REFRESH + CLEAN-1972. HARD-SCOPED OUT of all pdf-extractor/LF-*/PEK-*/rebuild work (parallel session owns LF-FIX, only live lock fleet-wide).

---

## 2026-05-26T21:08Z — dev-team triage, parallel LF-FIX active

**Held-lock truth verified:** only branch = `task/1972-vndirect-ohlcv-null-coercion`; harness confirms `task:LF-FIX` (pdf-extractor) is the ONLY live lock. All TASKS.md IN-PROGRESS markers (P2-A1, P2-F2, MACRO-VNINDEX) are STALE — reconciled, not re-dispatched.

**Reconciled (TASKS.md, minimal edits):**
- P2-A1 + P2-F2: IN-PROGRESS → RECONCILED-STALE → READY (no live lock; deferred while LF-FIX active).
- SSOT-REFRESH + CLEAN-1972: QUEUED → DISPATCHED.

**SSOT divergence VERIFIED live:** `system-map.json` mcp-server tools array = 125 (jq), `project-stats.json` toolCount = 146, board prior note = 148. THREE numbers. Owner (dev-mcp-server) must COUNT the live registry FIRST, then write single true value to system-map.json + reconcile project-stats.json. Pure data, no rebuild, no pdf.

**CLEAN-1972 VERIFIED:** `git log main..task/1972` = 1 commit `0d918f08` (carries ohlcvBackfill.ts + 159L test). → qa merge-or-discard, NEVER auto-discard.

**BATCH returned (WIP=2, both non-pdf, zero rebuild):**
1. SSOT-REFRESH (CLEAN) → dev-mcp-server, zone apps/mcp-server/, data-only.
2. CLEAN-1972 (CLEAN) → qa, zone cross-service/, merge-or-discard.

**HELD (not dispatched):** MACRO-VNINDEX-DATA-GAP (pipeline-state defers under host load); DRIFT-2 (rebuild-only, DEFERRED); ARCH-DOC-DRIFT (doc-only PARKED). Dashboard ## po rows = mostly COWORK-domain calibration → route to cowork-team, NOT dev-team code tasks.

**Cross-team inbox:** RESTART-NEQ-REBUILD-GATE already applied (DRIFT-3-A3 SHA gate in runbook Step 4). DRIFT-3 Phase A SHIPPED last cycle (A1/A2/A3 + close). MACRO-CONTRACT + CLIENTS-TYPE SHIPPED — board risk flags STALE.

---

## Carry-over
- PEK-IMPL chain + BCTC-LAYOUT-FIRST LF-FIX = PARALLEL SESSION OWNS. Do NOT touch apps/pdf-extractor/, any LF-*/PEK-* task, pilot-status-*.json, or pipeline-state BCTC fields. Concurrent docker rebuild = 16GB host kernel-panic risk; all rebuilds serialized to later hop.
- ALL container rebuilds DEFERRED this tick (DRIFT-2 kinh-dich, MACRO deploy, any pdf rebuild).
- Next PO hops: SSOT-REFRESH + CLEAN-1972 close-out; PEK-EXIT after parallel session's PEK-QA returns (independent LIVE re-verify).
- Files written this cycle UNSTAGED (TASKS.md reconcile + this notebook). Main terminal commits scoped (never -A). commit-mutex uncallable by subagents.
- DoD bar for any dispatched task = honest-green; NOT-RUN ≠ green; verify live, not board markers.
