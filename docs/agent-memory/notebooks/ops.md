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
→ Cycle 2026-08-26 (Dual rebuild + SQLite corruption recovery with data restoration) archived to `docs/incidents/ops-cycle-20260826-sqlite-corruption-recovery.md`

**Session**: 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb (ops agent)

---

## 2026-08-26T10:08Z — Market.DB Restore COMPLETE (FIX-MARKETDB-20260826-RESTORE-DROPPED-12205-FF5M-AND-54-EVIDENCE-ROWS-STILL-RECOVERABLE)

**Status**: ✅ TASK COMPLETE — Both AC-1 and AC-2 satisfied, row moved to done[]

**AC-1**: evidence_fragments restore (54 rows) — COMPLETE at 2026-08-26T01:30Z
- Pre: 619 rows, Post: 673 rows, verified correct

**AC-2 HALF 2**: intraday_foreign_flow_5m restoration (3,917 distinct rows) — COMPLETE at 2026-08-26T10:08Z

**Atomic write execution**:
- Baseline (in-txn): 145,037 rows
- CSV rows: 3,918 data (no header)
- Distinct keys after dedup on MAX(compacted_at): 3,917
- Duplicate handled: ACB 2026-08-25T08:55:00.000Z → kept row with later compacted_at
- Overlap check: 0 (all keys confirmed absent)
- Rows inserted (changes()): 3,917
- Final count (in-txn): 148,954 rows
- Duplicates: 0, PRAGMA quick_check: ok ✓

**Spot checks**: ACB duplicate correctly resolved, sample rows 2026-08-25 04:30-05:00 present with populated data ✓

**Artifacts preserved**:
- data/live/market.db.corrupt-2026-08-26T0031Z (protected per constraint)
- data/live/market.db.backup-20260826T0906Z (pre-write backup)

**Task disposition**: MOVED TO done[] WITH STATUS=DONE, next_agent=architect
Next: Architect investigates FIX-SQLITE-DOCKER-VIRT-CORRUPTION root cause.

