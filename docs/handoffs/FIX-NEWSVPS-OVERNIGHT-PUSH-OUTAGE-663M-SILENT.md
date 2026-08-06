---
sprint: DEVTEAM-20260806
branch: fix/newsvps-push-endpoint-hardening
size: S
zone: apps/mcp-server/
priority: P2
depends_on: ["FIX-ACTIVE-READPATH-LIVENESS-PROBE-NO-DETECTOR"]
blocks: []
---

## TLDR
Harden mcp-server /api/push-news endpoint against ~11h silent hang events. Detection architecture is split out to FIX-ACTIVE-READPATH-LIVENESS-PROBE-NO-DETECTOR; this task focuses on endpoint-level timeouts, retry logic, and connection pooling hardening.

## [PM] Planning Context
- **Zone:** apps/mcp-server/
- **Unblocked this tick** — PO split detection half to active-readpath detector (item 2)
- **Acceptance Criteria:**
  - [ ] Endpoint has connection timeout (e.g., 30s max hang before reset)
  - [ ] Retry logic for transient network failures (exponential backoff)
  - [ ] Connection pool health monitoring (detect dead connections, recycle)
  - [ ] Verify no 11h hangs on synthetic load test (smoke test or integration scenario)
- **Files to modify:**
  - `apps/mcp-server/src/routes/api/push-news.ts` (or endpoint handler)
  - Connection pool config (if applicable)
- **Dependencies:** FIX-ACTIVE-READPATH-LIVENESS-PROBE-NO-DETECTOR (detection first; hardening lands after)
- **Knowledge needed:** Node.js/Bun HTTP client libraries, connection pooling patterns

## Note
Prior occurrence: 2026-08-04 ~19:00-04:00 UTC (663 min). Detection landed via active-readpath probe; this fixes endpoint resilience.
