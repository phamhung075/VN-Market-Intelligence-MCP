# PO Notebook

## c · 2026-06-08T13:16Z — DFR Phase 2 + Phase 3 ungated (user greenlit combined)

**Trigger:** User greenlit Phase 2 + Phase 3 of DEEPFETCH-RAG-REDESIGN as one combined sprint. Phase 1 fully DONE + live. Directed gate: ungate DFR-P2 + DFR-P3, sequence, write architect hand-off. No nested-spawn — router dispatches architect.

**DJ-GATE-1 (verify-raw before flip, active_sprints[23].tasks):**
- DFR-P1-RAG=DONE, DFR-P1-MCP=DONE, DFR-QA-1=DONE (Phase-1 complete).
- DFR-P2 deps [DFR-Q1, DFR-Q2, DFR-QA-1] all DONE. DFR-P3 deps [DFR-Q3, DFR-P1-RAG] all DONE.
- Feasibility docs present: dfr-q1-q2-recon.md (vnexpress 200/plain HTTP, EXTEND vn-vps-proxy `/proxy/article-body`, NO new service), SPIKE_DFR-Q3-Q4 (lancedb 0.30.2 FTS via 2-call create_fts_index + RRFReranker).

**Board flips (atomic, verified-raw post-write):**
- DFR-P2-DEEPFETCH: BLOCKED -> **TODO**, next_role=architect (zone=multi).
- DFR-P3-HYBRID: BLOCKED -> **TODO**, next_role=architect (zone=rag-service).

**Sequencing:** Run BOTH in parallel. Hot zones disjoint (P2=mcp-server+vps+mainserver-crawls; P3=rag-service). WIP=0 at gate. Only shared touch = thin mcp-server search opt-in flag for P3 — architect must keep mcp-server slices from colliding on same module.

**Architect hand-off written:** docs/handoffs/2026-06-08-dfr-p2-p3-architect-handoff.md — P2 3-way zone split (mcp-server gate+queue+reindex / vps-crawls extend article-body-fetcher+vps-proxy / mainserver-crawls Playwright fallback) + P3 FTS+RRF integration design (2-call index, when-to-build, hybrid opt-in flag). Guardrails baked: caps 10/5, per-domain daily cap, 4h stale expiry, source_url UNIQUE, no silent DB delete, VPS plain-HTTP only, Playwright main-server only, no hardcoded system data, no branches.

**Router action requested:** dispatch **ARCHITECT** (run architect flow) with the hand-off scope. PO does not nested-spawn.

**Carry-over (next PO cycle):**
- After architect emits P2 zone-split + P3 design -> ba/pm -> dev-{mcp-server,vps-crawls,mainserver-crawls,rag-service} -> qa.
- P2 outward-facing: at QA, raw-verify caps + per-domain limits + stale expiry actually enforced (not just spec'd); rag_analyses re-index via upsert (no delete).
- (prior) A20 event-loop starvation: AWAIT architect brief; /health=200 >=15min under /extract load before DONE.
- (prior) FIX-MACRO-REFRESH-DEAD: dev fix landed b7ce338f — verify live macro refresh, then PM flip DONE.
