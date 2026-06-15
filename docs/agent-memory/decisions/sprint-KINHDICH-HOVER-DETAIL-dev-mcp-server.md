# Decision Journal — Sprint KINHDICH-HOVER-DETAIL · dev-mcp-server

**Sprint goal:** CI-RED fix — 8 failing tests across 4 files
**Agent:** dev-mcp-server
**Started:** 2026-06-15T02:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-15T02:25:00Z
**task-id:** CI-RED-d20468c0-FIX
**what-done:** Fixed 8 failing tests in 4 files; all stale expectations updated to match current production behavior
**what-considered:**
- Option A: update test expectations to match actual enricher behavior (orphan arm cycles)
- Option B: roll back orphan arm in production to match old TC-4 contract
- Option C: update scheduler regex tests to match scheduleCron wrapper (introduced post-test write)
**why-decision:** Production code (orphan arm, scheduleCron wrapper) represents intentional improvements; tests were written before those changes shipped; updating tests is the correct fix — no production rollback warranted
**why-change:** no change from plan; root cause confirmed by reading enricher code execution order

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-15T11:50:00Z
**task-id:** FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE
**what-done:** Added mcpServerCleanShutdown sentinel on graceful shutdown; restartCadenceAlertJob now classifies each startup as deploy (clean-shutdown exists between prev and current) vs crash (no sentinel), counting only crashes toward ALERT_THRESHOLD
**what-considered:**
- Option A: Docker API RestartCount — NOT accessible in-container without Docker socket mount (infrastructure coupling, security risk)
- Option B: Write mcpServerCleanShutdown sentinel in SIGTERM/SIGINT handler (chosen) — pure in-DB signal, no external dependency, uses existing cron_job_runs infrastructure
- Option C: Check error_msg field of startup row — would require sentinel semantics change before writing success
**why-decision:** Option B is the only approach that: (a) works in-container without Docker API, (b) uses existing DB infrastructure, (c) is generic (no per-deploy-id hardcode), (d) naturally models the real distinction: SIGTERM handler ran = deploy; no handler = crash
**why-change:** fix_spec suggested Docker-native RestartCount as first preference; live recon confirmed in-container access to docker metadata requires socket mount not present — Option B is the definitive in-process alternative
