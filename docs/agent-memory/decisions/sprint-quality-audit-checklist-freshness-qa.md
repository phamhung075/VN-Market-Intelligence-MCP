# Decision Journal — Sprint quality-audit-checklist-freshness · qa

**Sprint goal:** Add + verify quality-audit checklist items driven by architect doc (2026-06-10-quality-audit-framework.md) + data-freshness demand.
**Agent:** qa
**Started:** 2026-07-25T06:51:30Z

---

### STEP qa-S1 · qa · 2026-07-25T06:51:30Z
**task-id:** quality-audit-checklist-freshness
**what-done:** Diffed architect's D4-per-capability table (§4) against live docs/data/quality-checklist.json (74 caps, not 38 — doc predates FE-page expansion). All architect-demanded D4 caps already have a FRESH check. Found real gap by cross-referencing MEMORY two-layer feedback (feedback_auditor_b05_bctc_rawpush_two_layer_freshness_fp, feedback_news_freshness_two_layer_fetch_vs_analysis): FR-FRESH-01/02/03 + NEWS-FRESH-01 only check fetch/push layer, never the analysis/serve layer (financial_reports.parsed_at, rag_analyses.created_at) that get_sla_status authoritatively gates.
**what-considered:**
- Re-verify all 437 pre-existing items — rejected, out of scope (RETURN spec asks for items ADDED, not full re-audit)
- Add fetch-vs-analysis two-layer FRESH checks only where a real 2-stage pipeline exists (bctc, news) — not price/sbv/foreign_flow (single-layer)
**why-decision:** Two-layer gap is evidenced, recurring (2 prior FP incidents), and matches D4's own "silently stale" question — highest-value add within scope.
**why-change:** no change from plan.

### STEP qa-S2 · qa · 2026-07-25T06:51:30Z
**task-id:** quality-audit-checklist-freshness
**what-done:** Also found CAP-SVC-RAG-SERVICE has zero D4 checks (only AVAIL/FUNC/OBS) despite graduating from undeployed-by-design to live container (GO-FLEET-DEPLOY 2026-06-11) — the other 5 graduated services (stock-price/ta/kinh-dich-svc/alert-engine/news-fetch) each carry a FRESH check per the same pattern.
**what-considered:**
- Skip rag (still marked "dark"/no-probe in system-map capability_manifest, stale since 2026-06-02) — rejected, RAG-SERVICE-AVAIL-01 itself proves live/deployed
- Add FRESH check honestly as WARN (gate disabled, tracked elsewhere) not fabricate a PASS
**why-decision:** get_cron_health alone would show ragFtsRebuildCronJob 100% success (2 historical runs, last 07-20) — misleadingly "healthy"; live env-var check (CRON_RAG_FTS_REBUILD_ENABLED unset) proves the job is NOT currently registered. Naive-badge trap avoided per host-CLI/runtime verify discipline.
**why-change:** no change from plan.

### STEP qa-S3 · qa · 2026-07-25T06:51:30Z
**task-id:** quality-audit-checklist-freshness
**what-done:** Verified all 3 new items via the LIVE served path: real MCP JSON-RPC tools/call POST to http://localhost:3000/mcp (stateless WebStandardStreamableHTTPServerTransport, confirmed in server.ts) — get_sla_status → bctc BREACHED CRITICAL (age=6777min/SLA=1338min), news OK (16min/30min); get_cron_health + docker exec printenv → rag gate confirmed disabled live. Then re-confirmed both mcp-server:3000/api/quality-checklist and frontend:3001/api/quality-checklist (proxy) serve the 3 new items end-to-end post-write.
**what-considered:**
- docker exec sqlite query (host-CLI shortcut) — used ONLY as secondary corroboration for rag env var, not as primary evidence source for the JSON-served data
- gateway call_tool wrapper — unavailable in this specialist sub-session (no MCP gateway binding, consistent with INV-GATEWAY-1 note in qa/flow/main.md); used direct MCP HTTP JSON-RPC instead, which IS the real served path any client uses
**why-decision:** Raw evidence requirement — badge/summary layer (checklist status field itself) is exactly what's being written, so verification had to be independent of it.
**why-change:** no change from plan.

### STEP qa-S4 · qa · 2026-07-25T06:51:30Z
**task-id:** quality-audit-checklist-freshness
**what-done:** Gap→dev-team check: grepped orch-state.json for prior art on both live findings BEFORE considering a mint. bctc breach → FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP (status REVIEW, dev-mcp-server, active write-back-guard work, commit 25ae59a36 today) already covers the plausible mechanism. rag gate → RAG-FTS-BUILD-MEMORY-BOUND (review) + ALPHA-S2-RAG-FTS-REBUILD-CRON (backlog/BLOCKED) already own the disabled-gate root cause.
**what-considered:**
- Mint a fresh row for the bctc breach — rejected, duplicate of existing REVIEW row per prior-art grep (feedback_grep_board rule)
- Mint a fresh row for rag gate — rejected, duplicate of existing review+backlog pair
**why-decision:** No NEW gap requiring a mint — every demanded checklist item was satisfiable with existing live tools (get_sla_status, get_cron_health, env probe); zero dev-team rows minted this cycle.
**why-change:** no change from plan — WORK step 4 is conditional ("for each demanded item that cannot be satisfied"); none qualified.
