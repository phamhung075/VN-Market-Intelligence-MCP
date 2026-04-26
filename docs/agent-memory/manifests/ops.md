# Ops Memory Manifest

**Load when:** Health checks, incident response, or VPS troubleshooting.

| Task Type | Load |
|-----------|------|
| health-check, vps-status | modules/scheduler.md |
| incident-response | issues/[RELEVANT].md |
| server-restart, db-maintenance | modules/scheduler.md |

**Load sequence:**
1. Load `modules/scheduler.md` (signal handler + checkpoint state)
2. If incident, load relevant issue file from `issues/`
3. Check `sessions/LATEST.md` for recent context

**Total load cost:** 50–100 tokens (manifest) + 150–250 tokens (modules + session)

---

**Notes:** WAL checkpoint is implemented and stable (`src/infrastructure/db/checkpoint.ts`). No issue file — it's resolved.
