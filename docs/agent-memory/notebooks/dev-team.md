# dev-team notebook

**Last updated:** 2026-05-17 | **Sprint:** current

> Archive: `docs/archive/notebooks/dev-team-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current state (c170 — 2026-05-17T19:44Z)

- PREFLIGHT: HEAD.lock cleared. Prune clean.
- MCP URL root cause identified: `https://zenmidi.com/mcp` wrong → correct `https://zenmidi.com/vn-market/mcp`. 15 files updated. Commit: 88920963. 1938a DONE.
- ACTION REQUIRED FOR USER: Reload Claude Desktop (Cmd+R) for cowork workspace changes to take effect.

## Lessons / patterns

- Worktree harness auto-merge works when tracks are disjoint (no conflicts).
- PO file/line refs are advisory — source-of-truth is grep. Developer must verify before blind-edit.
- BA spec discoveries can downgrade priorities.
- MCP gateway outage pattern: Docker Desktop virtiofs socket deadlock. Only USER action (Docker Desktop restart + extra_hosts) can break the cycle.
- Zero-MCP parallel tracks: When gateway down, frontend zone is only productive work.
- HEAD.lock cure pattern: ~21min average stale lock cleared cleanly. age>0, size=0B, no live pid → safe rm.

## Carry-over

- **1928a-mcp-gateway-dns-extra-hosts** (URGENT-F1): Docker Desktop restart required. Unblocks 1929a/1930a/1930b/1930c/1922i.
- **1862c-E-dashboard** (HIGH): Cloudflare dashboard SSE ingress — user action needed.
- **1897b** (HIGH): Docker .git/ exclusion — user action needed.
