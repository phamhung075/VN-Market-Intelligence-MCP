# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · architect

**Sprint goal:** Clickable DONE-task decision trail on /dashboard/orchestration
**Agent:** architect
**Started:** 2026-06-08T02:30:00Z

---

### STEP architect-S2 · architect · 2026-06-08T08:20:00Z
**task-id:** A20-EVENTLOOP-STARVATION-ARCHITECT
**what-done:** Diagnosed event-loop starvation root cause in PdfplumberExtractionEngine; issued fix design (asyncio.to_thread wrappers); authored architecture brief 2026-06-08-pdf-extractor-eventloop-starvation.md
**what-considered:**
- Option A: uvicorn workers>1 (ruled out: multiplies RSS footprint 600MB/worker; reverses max_workers=1 host-safety decision; blunt instrument)
- Option B: wrap PdfplumberExtractionEngine sync pdfplumber+pytesseract calls in asyncio.to_thread() (chosen: minimal, targeted, consistent with codebase pattern, no memory impact)
- Option C: gunicorn+uvicorn workers (ruled out: same multi-process RSS problem as Option A)
**why-decision:** extract_tables() and extract_text_ocr() in extraction_engine.py are async-def but block the event loop synchronously (pdfplumber page iteration + pytesseract.image_to_string() — NO await). /health cannot interleave until extraction completes. asyncio.to_thread() is already the established offload pattern in 6+ other infrastructure files; DDD-clean (no caller changes needed).
**why-change:** prior patches addressed wrong layer (cgroup/cpu). This is event-loop blocking, not CPU quota exhaustion. Root cause is in infrastructure/extraction_engine.py, not docker-compose.yml.

### STEP architect-S1 · architect · 2026-06-08T02:30:00Z
**task-id:** ARCH-A20-CPU-CGROUP-REVIEW
**what-done:** Raised pdf-extractor cpus limit from 1.0 to 2.0 in docker-compose.yml; bumped healthcheck start_period from 15s to 60s; authored architecture brief 2026-06-08-pdf-extractor-cpu-cgroup-fix.md
**what-considered:**
- Option A: cpus 1.0→2.0 (1 line, simplest, mirrors mcp-server pattern)
- Option B: OCR sidecar (new container, IPC overhead, no capacity gain)
- Option C: exec-form healthcheck only (does NOT escape cgroup — exec probe throttled identically)
**why-decision:** docker stats confirmed pdf-extractor at 99.01% CPU (pinned at cgroup limit); all other peers idle. Docker VM has 6 CPUs, total active load ~3 cores. Raising to 2.0 gives Tesseract ~1 core + uvicorn ~1 core. Peers unaffected. Option C is a no-op for this failure mode.
**why-change:** no change from plan — RECURRING-BUG rule demanded architect decision; Option A was the obvious correct choice once evidence confirmed peer headroom
