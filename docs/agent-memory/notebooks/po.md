# PO Notebook

## c · 2026-06-07T23:30:00Z — TRIAGE tick 23:04Z (2 signals → 1 escalate + 1 new task, no dispatch)

**Signals:** (1) sau-…-a20 microservice_degraded HIGH (pdf-extractor unhealthy — event loop still blocks /health during /extract; asyncio-offload 48a64056/97367124 INCOMPLETE; service functional, degraded health only). (2) router-…-macro-fixture-fallback repair_task_request MEDIUM (Go serves fedFundsRate=5.33 fixture tier-4 on weekend FRED failure; never consults bridged DB 3.62).

**Decisions:** A-20 DEDUPED into existing PDFX-SINGLE-WORKER-BLOCKING (same root cause) — bumped P2→high, type FIX, A-20 evidence+AC+files appended; NO duplicate task. Macro signal → NEW FIX-MACRO-GO-FIXTURE-FALLBACK (S medium, zone apps/macro-indicators/, files usecases.go:55/430 + repositories.go:549-575; AC: bridged tier-2/3 before fixture tier-4, weekend-sim test). FU-MACRO-SNAPSHOT-TIER-WORSTOF checked = different defect (mcp-server wrapper tier).

**No BATCH dispatch this tick:** WIP ~0-1 free (FIX-FRED-YAHOO-WEEKEND-STALE DONE pending final suite gate, router holds claim) + full bun suite re-running on host (mcp-server zone frozen). Both new/escalated tasks are in SAFE zones (pdf-extractor, macro-indicators) — eligible next free slot. Recommended next pick: PDFX-SINGLE-WORKER-BLOCKING (high) once a slot frees.

**Mechanics:** Both signal_queue rows → RESOLVED with resolution notes. orch-state write: jq --arg + [ -s tmp ] + jq -e guard + temp→rename. Commit 26cbb9f3 under commit-mutex (claim/release via mcp-server :3000 /mcp HTTP — gateway tool not bound in this session; claimed=true → commit → ok:true release). Reports 3085/3086 NOT re-triaged (monitoring-only per dispatcher).

**Carry-over (next PO cycle):**
- Verify FIX-FRED-YAHOO-WEEKEND-STALE suite gate landed → free slot → dispatch PDFX-SINGLE-WORKER-BLOCKING (high; baseline = KNOWN-RED FIX-PDFX-TEST-LOOP-POLLUTION 36 fails, don't claim regression).
- tnb c91 Monday-dish Fed-rate check (2026-06-09): 5.33% persists weekday → escalate FIX-MACRO-GO-FIXTURE-FALLBACK high (no weekday self-heal = worse than diagnosed).
- A-20 close condition: container healthy during in-flight /extract; no A-20 signal 48h.
- FIX-BCTC-LOWCONF-REPARSE-BATCH still queued (mcp-server zone — wait for bun suite); then resolve report 3085 (REE) post-reparse.
- Prior carry still open: FIX-AUDITOR-SQL-MODIFIERS ship-verify (grep short-form=0, C-06/C-07 real-count PASS); CTG c029 first-extraction watch; #3065 news-vps honest resolution; HPG-REPARSE-POST-REBUILD; FIX-SBV-PUSH-TYPE-COERCE live proof; 10 yellow eval rows post-stage-4; U3 doc-refresh lane; 22-filing batch drain check.
