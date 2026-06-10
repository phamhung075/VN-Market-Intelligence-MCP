# Decision Journal — Sprint GO-FLEET-DEPLOY · agents-architect

**Sprint:** GO-FLEET-DEPLOY  
**Agent:** agents-architect  
**Started:** 2026-06-10T20:35:25Z

---

### STEP A-1 · agents-architect · 2026-06-10T20:35:25Z
**task-id:** GFD-1  
**status-flip:** OPEN → IN-DESIGN  
**what-done:** Accepted input packet from PO. Verified ground truth: 4/6 services Go-ready with exit 0; news-fetch = genuine Node-to-Go port (no go.mod); rag-service = Python/FastAPI/LanceDB/torch — Go-exception confirmed. Read system-map.json for capability_manifest, zone owners, compose resource limits.  
**what-considered:**  
- Verify PO's go-build evidence independently → accepted as-is per brief constraint (PO live-verified 2026-06-10, DO NOT RE-DERIVE)  
- Any services already transitionally deployed? → No; all 6 in `not_deployed_by_design`  
**why-decision:** Input packet complete and internally consistent. Proceeding to design.

---

### STEP A-2 · agents-architect · 2026-06-10T20:35:25Z
**task-id:** GFD-1  
**what-done:** Chose rag-service strategy: Option (b) — Python singleton with tight memory cap (512m/768m) + new /embed/health probe.  
**what-considered:**  
- Option (a): Go HTTP wrapper shelling to Python sidecar → REJECTED: two-process IPC overhead, no memory saving (Python runtime still loads in full), new failure modes for episodic-use service, adds scope to a deploy sprint  
- Option (b): Python singleton with cap → ACCEPTED: right lever is memory limit reduction from 1.5g→768m; probe gap is fixed by new /embed/health endpoint; no new code risk  
- Drop rag entirely → REJECTED: user directive is all 6 running  
**why-decision:** RAG is an episodic-use service (semantic search, not hot-path). Its memory is dominated by model load at startup, not request volume. A cap reduction addresses the concern without architecture change. The "dark capability" gap is a probe problem, not an architecture problem.

---

### STEP A-3 · agents-architect · 2026-06-10T20:35:25Z
**task-id:** GFD-1  
**what-done:** Defined news-fetch port scope: Go port of RSS/API fetch paths (CGO=0, modernc/sqlite); Playwright/chromium scraping EXCLUDED from port.  
**what-considered:**  
- Full port including Playwright → REJECTED: Playwright is Node/Chrome-native; Go bindings exist but are immature; adds risk with no benefit (the chromium source is served by mcp-server's existing cron)  
- Keep news-fetch as Bun/Node → REJECTED: user directive is Go fleet  
- Split: Go primary + Bun scraper sidecar → possible but adds compose complexity; deferred to dev-news-fetch to propose if needed  
**why-decision:** The VPS-proxied path (`/proxy/news`) is the primary news ingest. It is pure HTTP — no browser required. Porting that path to Go delivers the lightweight binary the user wants. Chromium path is a secondary edge case already covered by mcp-server.

---

### STEP A-4 · agents-architect · 2026-06-10T20:35:25Z
**task-id:** GFD-1  
**status-flip:** IN-DESIGN → BRIEF-COMPLETE  
**what-done:** Authored brief at `docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md`. Dropped signal to pm at `docs/signals/go-fleet-deploy-brief-20260610T203525Z.json`. Defined GFD-2 through GFD-12 task batch.  
**why-decision:** All four deliverables complete: (a) inventory, (b) topology + rag decision, (c) footprint math + soak gate, (d) per-service DoD including new rag probe. Signaling pm for implementation chain dispatch.
