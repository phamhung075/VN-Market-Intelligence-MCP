# Decision Journal — Sprint WORKFLOW-FLUIDITY · dev-mcp-server

**Sprint goal:** No agent workflow can livelock, silently drop a signal row, or strand a task lock.
**Agent:** dev-mcp-server
**Started:** 2026-06-07T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-07T00:00:00Z
**task-id:** WF-2
**what-done:** Implemented Option A mtime-compare-retry CAS in orchStateStore.ts (appendSignalQueueRow + new writeHeadAtomic); added 3-writer-class block to signal-dashboard SKILL.
**what-considered:**
- Option B (SQLite migration): heavier, breaks single-JSON-SSOT invariant; BA spec said architect must decide — PO disposition says Option A.
- Pre-write vs post-write mtime check: post-write always differs (our own rename changes mtime); pre-write check (before rename) correctly detects concurrent clobber.
**why-decision:** Option A chosen per BA spec + PO scope note. Pre-rename mtime check is the only reliable window: after rename, mtime always changes from our own write. CAS_MAX_RETRIES=3 matches spec; drop on exhaustion is logged at WARN, not thrown.
**why-change:** no change from WF-2 spec; BLOCKER-WF2-A (locate TS write path) resolved by reading orchStateStore.ts directly.
