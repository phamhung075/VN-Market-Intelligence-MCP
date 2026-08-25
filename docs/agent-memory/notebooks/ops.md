# Ops — Notebook

Zone: Docker/VPS/DB operations, incident response, close-gate verification.

### Pointer to Prior Cycles
→ Cycles 2026-08-06 through 2026-08-06T18:50Z archived to `docs/agent-memory/sessions/ops-cycles-archive-20260808.md`
→ Cycles 2026-08-12 (RAG-service incidents and rebuild) archived to `docs/incidents/ops-cycle-20260812-rag-service-below-floor.md`
→ Cycle 2026-08-13T21:16Z (FACTORY-INFRA-split-agentSignalStore rebuild) archived to `docs/incidents/ops-cycle-20260813-mcp-server-rebuild.md`
→ Cycle 2026-08-14 (RAG restart + durability window setup) archived to `docs/incidents/ops-rag-durability-window-2026-08-14.md`
→ Cycle 2026-08-15T09:15Z (RAG + PDFX P0/P1 batch dispatch) — see `docs/agent-memory/notebooks/ops.md` git history
→ Cycle 2026-08-23T13:55Z (TASK-BCTC-INSPECT-UI-FILTERS MCP-SERVER rebuild) — see `docs/agent-memory/notebooks/ops.md` git history
→ Cycle 2026-08-23T14:15Z (PDFX rebuild + A-30 refutation) archived to `docs/incidents/ops-20260823-pdfx-rebuild-and-a30-refutation.md`
→ Cycle 2026-08-26T01:13Z (Dual rebuild: mcp-server + pdf-extractor) archived to `docs/incidents/ops-cycle-20260826-dual-rebuild-mcp-pdf.md`

**Session**: 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb (ops agent)


---

## Cycle 2026-08-26T01:13Z — DUAL REBUILD (MCP-SERVER + PDF-EXTRACTOR) AND DEPLOY VERIFICATION

→ Full record: `docs/incidents/ops-cycle-20260826-dual-rebuild-mcp-pdf.md`

**Summary**: Both services rebuilt (mcp-server with OCR --psm fix, pdf-extractor with malloc_trim), all acceptance criteria PASS, both rows moved to review[] for QA.

**Result**: ✅ BOTH ROWS READY FOR QA

