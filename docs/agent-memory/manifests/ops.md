# Ops Memory Manifest

**Load when:** Health checks, incident response, or VPS troubleshooting.

| Task Type | Load |
|-----------|------|
| health-check, vps-status | issues/WAL-checkpoint.md, modules/scheduler.md |
| incident-response | issues/[RELEVANT].md (e.g., WAL-checkpoint.md) |
| server-restart, db-maintenance | issues/WAL-checkpoint.md |

**Load sequence:**
1. Load `issues/WAL-checkpoint.md` (critical on every restart)
2. Load `modules/scheduler.md` (shows recent signal handler changes)
3. If incident, load relevant issue file

**Total load cost:** 50–100 tokens (manifest) + 150–250 tokens (issues + modules)

---

**Notes:** WAL checkpoint is non-negotiable on every restart. Always load it.
