# PO Notebook

## c · 2026-06-08T08:13:00Z — TRIAGE: A-20 4th recurrence POST cgroup-fix → ARCHITECT escalation (no-3rd-patch rule FIRED)

**Trigger:** signal sau-c111-a20 (WARN, system-auditor c111, 08:07Z) — pdf-extractor /health timeout. Router RAW-VERIFIED independently: `curl -m5 localhost:5001/health` ×3 → HTTP 000 (hard timeout each), `docker ps` = "Up 6h (unhealthy)". Confirmed health-lies / event-loop-starvation, NOT transient OCR collision.

**DECISIVE CONTEXT — fix disproven:** This is the FIRST probe after architect cgroup fix acb48383 (cpus 1.0→2.0 + start_period 60s) shipped in 04:27 rebuild. Fix FAILED. CPU-class patch history all dead: 48a64056, 3033e1dc, acb48383. OCR ALREADY process-offloaded (PDFX-SINGLE-WORKER-BLOCKING DONE) + push-clients async (FIX-PDFX-PUSH-CLIENTS-ASYNC-URLOPEN DONE). So NOT CPU quota, NOT OCR blocking. Recurrence c105(01:03Z)→c106→c111(08:07Z) ~7h. My armed po-S6 rule ("event-loop starvation again → architect, no 3rd patch") fires. DJ-GATE-1 = STEP po-S9.

**Smell found:** `uvicorn.run()` main.py:258 has NO `workers=` (single worker / single event loop); Dockerfile CMD same. Host /health dead while OCR isolated in child = MAIN-process loop starvation (model warm-up / sync I/O / picklable OCR payload deserialization on loop / blocked-resource await in /health).

**DISPATCH (WIP 2/2, architect slot was 1/2 w/ ARCH-TSU in REVIEW):**
1. **A20-EVENTLOOP-STARVATION-ARCHITECT** (UNBLOCK, owner=architect, zone=apps/pdf-extractor/, M) — deep-dive on uvicorn worker model / event-loop offload. FORBIDDEN: any 4th CPU/cgroup/start_period patch. AC: host /health returns 200 within 5s WHILE /extract OCR in flight (failure-under-load).
2. **A20-WEDGE-CAPTURE-RESTART** (FIX, owner=ops, zone=apps/pdf-extractor/, S) — CAPTURE-THEN-RESTART: py-spy dump + docker stats + IN-CONTAINER /health probe (key discriminator: does it wedge from inside too?) + logs + ps aux INTO docs/troubleshooting/2026-06-08-a20-eventloop-starvation-capture.md, THEN targeted `docker restart vn-market-intelligence-mcp-pdf-extractor-1` (NEVER down&&up — kills peers ~21min). Poll /health up to 90s. Preserves architect evidence; unblocks 26-row queue + Q1 ingest.

signal_queue.rows[sau-c111-a20] → TRIAGED with resolution pointing to both tasks.

**Carry-over (next PO cycle):**
- VERIFY A20-WEDGE-CAPTURE-RESTART: capture file has all 5 diagnostics + committed; host /health=200 post-restart. Attach capture path to architect task.
- AWAIT A20-EVENTLOOP-STARVATION-ARCHITECT brief → review (5-field critique if improvement_proposal-style; else BA→PM→dev-pdf-extractor → ops targeted rebuild). Then unblock FIX-PDF-EXTRACTOR-UNHEALTHY (reparse VHM/HCM/HSG/KBC), 26 blocked rows re-queue, 22-filing Q1 batch, FIX-AUDITOR-A20-MULTIPROBE.
- DO NOT flip any A20 task DONE until /health=200 holds ≥15min UNDER /extract load (single-probe PASS is the c103 false-green trap — FIX-AUDITOR-A20-MULTIPROBE).
- FIX-SBV-REFRESH-SILENT-SWALLOW verify (sbvRatesJob.ts re-throw → wrapRun status=error; SBV FX <26h) → then PM flip FIX-MACRO-REFRESH-DEAD DONE. C-09 macro half already RAW-verified live (dataSource=live, fedFundsRate=3.62).
- Queue when slots free: FIX-PDFX-TEST-LOOP-POLLUTION (deferred 2×) → FIX-MCP-SUITE-HEALTH-BASELINE; CLEAN-NB-TRIM-PDFX (202L over cap); FIX-ALERT-ORPHAN-CORRELATION; HPG/REE reparse post-rebuild.
- tnb c91 Monday-dish Fed-rate gate (2026-06-09 05:15Z): 5.33% weekday → escalate CRITICAL.
