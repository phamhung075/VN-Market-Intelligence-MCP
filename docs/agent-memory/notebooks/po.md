# PO Notebook

## c · 2026-06-08T10:42:33Z — DJ-GATE-1: DEEPFETCH-RAG-REDESIGN spec approved + Phase-1 dev authorized

**Trigger:** Directed review gate. BA spec ready (DFR-BA-1 spec_ready) + all 5 feasibility probes DONE/GREEN. Decision STEP po-S2 → docs/handoffs/sprint-DEEPFETCH-RAG-REDESIGN-po.md.

**Verify-raw (not badges):**
- Read full BA spec 352L: 6 FR / 26 AC all live-verifiable, NFR1-6 (non-destructive/backward-compat/baseline-test-preserved/no-re-embed/no-downtime/no-hardcode), 5 edge cases, DDD layer+zone map. Phase-2/3 explicitly OUT. No gap vs brief → no revision.
- Read SPIKE_DFR-Q3-Q4 doc raw: Q4 add_columns() non-destructive (3 rows before→after, vectors not re-embedded, safe defaults); Q3 FTS+hybrid available lancedb 0.30.2. Prod = Docker 0.30.2.
- Q1/Q2 recon doc + brief exist on disk; Q5 ALTER safe (single-writer, schema-news.ts:57 pattern).
- Board deps cross-checked: P1-RAG=[BA-1]; P1-MCP=[BA-1,P1-RAG]; QA-1=[P1-RAG,P1-MCP]; P2=[Q1,Q2,QA-1]; P3=[Q3,P1-RAG].

**Decisions / board flips:**
1. DFR-BA-1: spec_ready → **approved** (no revision).
2. DFR-P1-RAG: TODO → **READY** (next dispatch; both migration gates Q4+Q5 green; runs FIRST).
3. DFR-P1-MCP / DFR-QA-1: stay TODO (deps unmet).
4. DFR-P2-DEEPFETCH / DFR-P3-HYBRID: stay **BLOCKED**. Feasibility gates green BUT Phase-1 ordering dep intact (P2 needs QA-1, P3 needs P1-RAG live). Not dispatched. Dep-notes unchanged (Q-answers clear feasibility precondition only, not the ordering dep).

**Router action requested:** dispatch **DFR-P1-RAG → dev-rag-service**. PO does not nested-spawn.

**Carry-over (next PO cycle):**
- NEXT GATE: after DFR-P1-RAG lands live-verified (add_columns migration non-destructive on LIVE rag_entries, old rows still searchable, 16-col schema) → authorize DFR-P1-MCP dispatch → dev-mcp-server. WIP serialized P1-RAG → P1-MCP → QA-1.
- After DFR-QA-1 green: re-evaluate P2 (Q1/Q2 green, now only QA-1 dep) for unblock; P3 unblocks once P1-RAG live (Q3 green).
- ops_rebuild_required after DFR-P1-MCP merge.
- (prior sprint) A20 event-loop starvation: AWAIT A20-EVENTLOOP-STARVATION-ARCHITECT brief; no 4th CPU/cgroup patch; /health=200 must hold ≥15min UNDER /extract load before any A20 DONE.
- FIX-SBV-REFRESH-SILENT-SWALLOW verify → PM flip FIX-MACRO-REFRESH-DEAD DONE.
