# Ops — Notebook

Zone: Docker/VPS/DB operations, incident response, close-gate verification.

### Pointer to Prior Cycles
→ Cycles 2026-08-06 through 2026-08-06T18:50Z archived to `docs/agent-memory/sessions/ops-cycles-archive-20260808.md`
→ Cycles 2026-08-12 (RAG-service incidents and rebuild) archived to `docs/incidents/ops-cycle-20260812-rag-service-below-floor.md`
→ Cycle 2026-08-13T21:16Z (FACTORY-INFRA-split-agentSignalStore rebuild) archived to `docs/incidents/ops-cycle-20260813-mcp-server-rebuild.md`
→ Cycle 2026-08-14 (RAG restart + durability window setup) archived to `docs/incidents/ops-rag-durability-window-2026-08-14.md`

---

## Cycle 2026-08-15T09:15Z — RAG + PDFX P0/P1 BATCH DISPATCH

**Row 1: UNBLOCK-RAG-OPS-DEPLOY-AND-DURABILITY-MEASUREMENT-WINDOW (P0)**

Task: Run D1-D5 durability measurement on already-deployed fix.

**Result: AC-1/AC-2 PASS, AC-3/AC-4 FAIL** → Move to review[]/BLOCKED for PO

Detailed findings: `docs/incidents/ops-rag-durability-2026-08-15-d1d5-measurement.md`

Summary:
- D1: Baseline OK (fix deployed, malloc_trim present)
- D3 VERDICT: **FAIL** — Memory oscillates severely
  - Peak: 97.87% (7.87% margin to OOMKill)
  - Volatility: 2.368pp/min avg (118x threshold)
  - 46% of 13h measurement samples exceed 85% cap bar
- AC-5 fail-path: Escalate to FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED

**Row 2: UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT (P1)**

Task: Rebuild pdf-extractor with malloc_trim fix, then measure burst headroom.

Status: **IN PROGRESS** (Docker build running, blocked on pip install completion)

Current image: sha256:b5db1296ae85 (7 days stale, fix not present)
Build start: 2026-08-15T09:40Z
Expected completion: ~2026-08-15T10:00Z

Next: Verify AC-1 (image differs), AC-2 (malloc_trim present), measure burst via AC-4

---

**Session**: 632721c2-41e4-4aff-8d06-a47cf80dc0d7 (ops agent tier-1, router batch dispatch)


---

**PDFX REBUILD COMPLETION**:

AC-1 (Image differs): **PASS** ✓
- Old: sha256:b5db1296ae853d9667c62765214a0b26099c9f8eb765bea051294c49b1088a1b
- New: sha256:4ee7f1c3598ed8508697a1db638e6f5a3ed2ef25b5e9c77e0b7e4a69565ac997

AC-2 (malloc_trim present): **PASS** ✓
- grep -rl malloc_trim /app returns: /app/interface/pek_run_helper.py

AC-3 (Peer containers): **PASS** ✓
- mcp-server: Up 1h (healthy)
- rag-service: Up 14h (healthy)
- pdf-extractor: Up 1min (healthy)

AC-4/AC-5/AC-6 (Burst measurement): **PENDING** 
- Container is healthy and ready for POST /pek-extract burst testing
- Measure and hand off to PO with findings

