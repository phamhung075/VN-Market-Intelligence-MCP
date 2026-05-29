# PO Notebook

## Cycle 2026-05-29T22:16Z — INCIDENT TRIAGE → Sprint DATA-PIPELINE-INTEGRITY (4 root-caused data bugs)

**Input:** ops fully diagnosed multi-source live-data failure (live-probed + VPS-audited). VPS HEALTHY — all 5 pushes HTTP 200 (prices/BCTC/news/SBV-FX/foreign-flow). Blockers = 4 CODE bugs already root-caused. Do NOT re-diagnose.

**Action: kicked off Sprint DATA-PIPELINE-INTEGRITY (CRITICAL, multi-zone). Preempts WIP cap (data-correctness incident > priority order).**

**Verified diagnosis grounded before creating tasks (didn't rubber-stamp):**
- Bug 4: read `ohlcvForeignFlowStore.ts` L1-54 — VERBATIM UPDATE-only (`WHERE code=? AND date=?`), doc-comment L5/L16 literally says "no stub rows / silently skipped". Confirmed. Foreign-flow arrives before OHLCV row → silent skip.
- Bugs 1-3: TASKS.md MACRO-SEED-WIRING #3003 already flagged carry/yield computedAt=2026-05-23 stale + USD/VND=26255 as "monitoring" 2026-05-29. Ops now escalates to actionable FIX. Consistent.

**4 tasks created (one per bug, zone-tagged):**
- DPI-1 FX dual-path 26255 vs 26115 → dev-macro-indicators (canonical SBV source OR source-tag both)
- DPI-2 carry/yield computedAt stale → dev-macro-indicators (find recompute job, restore, persist)
- DPI-3 Brent/Gold +0.00% delta → dev-macro-indicators (prev-close store + delta pipeline)
- DPI-4 foreign-flow "No data" → dev-mcp-server (UPSERT/INSERT…ON CONFLICT in ohlcvForeignFlowStore.ts)
+ DPI-OPS (REBUILD), DPI-QA (live re-probe), DPI-EXIT (po). Umbrella lock `task:DATA-PIPELINE-INTEGRITY` claimed (TTL 3600).

**DoD (hard, no false-greens):** live re-probe through MCP tools — FX single value, fresh computedAt, non-zero Brent/Gold deltas, populated get_foreign_flow + direct DB count>0. Verification = agents call live tools (feedback_trust_verification_is_system_job), REBUILD not restart (feedback_rebuild_after_dev_change). Bug-4 verify via live tool + DB count, NOT push echo (project_mcp_server_write_wedge).

**NEXT:** ba — decompose 4 bugs into REQ_DATA-PIPELINE-INTEGRITY.md, confirm multi-zone split. PIPELINE: continue.

## Carry-over
- DATA-PIPELINE-INTEGRITY: goal ARMED until all 4 surfaces re-probe correct. Architect must: (1) pick FX canonical source policy, (2) RCA-to-fix the carry/yield recompute job, (3) design delta/prev-close pipeline, (4) define foreign-flow upsert contract. multi-zone: bugs 1-3 macro-indicators, bug 4 mcp-server, no cross-coupling expected.
- BCTC-TABLE-BOUNDARY: code GREEN, infra-BLOCKED on live verify (BTB-UNBLOCK: fail-loud+heartbeat+timeout). Not touched by this incident.
- SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST still OPEN.
