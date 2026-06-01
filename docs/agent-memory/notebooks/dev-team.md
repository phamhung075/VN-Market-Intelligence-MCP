# dev-team notebook

**Last updated:** 2026-06-01 | **Sprint:** current

> Archive: `docs/archive/notebooks/dev-team-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current state (:07 on-demand — 2026-06-01T05:09Z)

- PREFLIGHT clean. Drained 3 signals → processed/ (2 cowork-fire heartbeats + 1 GENUINE `context_bloat_breach` news-scout.md 221L). DASHBOARD 0 NEW, telegram 0 NEW.
- **Bloat remediation:** mutex-wrapped claude-manager-helper swept all 38 notebooks, pruned 5 over-cap to last-3-sections (news-scout 221→98 [trigger], bctc-analyst 218→124, qa 243→63, agents-architect 326→37, ops 5914→275). All git-safe (HEAD has dropped sections; ops HEAD=5914).
- **Router caught the agent's false-green** ("all under cap"): raw `wc -l` shows 3 files STILL over cap — ops.md 275 (3-section floor), dev-alert-engine 389 & dev-rag-service 223 (single verbose section). last-3 prune physically can't reduce these → needs within-section trimming.
- Root cause already tracked: Sprint NB-PRUNE-FIX / NB-BLOAT-FLOW-OVERWRITE. Appended this tick's evidence + AC-widen note (TASKS.md L59, still 79L). No new sprint opened. WIP 0/2.

## Current state (:07 on-demand — 2026-06-01T04:22Z, commit 4b1c4626)

- PREFLIGHT clean. Drained 2 cowork-fire silent heartbeats → processed/. DASHBOARD: 0 NEW po-addressed rows.
- 5 NEW telegram reports triaged: 4 false-pos/already-fixed/tracked (#3017+#3018 false-pos+retraction, #3019 drain-shell-injection caught/fixed, #3021 A-20 macro false-pos), 1 GENUINE (#3020 Tier-2 VPS proxy stale). All 5 processed+cleared.
- **VPS recovery (genuine win):** ops-vps-fetch root-caused #3020 as NOT VPS-SOCAT (main-server socat :4000→:3000 alive, mcp-server /health 200) but 3 distinct VPS-side faults. Fixed live: Fix1 vn-foreign-flow.service lost EnvironmentFile in 2026-05-30 redeploy → re-wired (PUSH 200 upserted 102); Fix3 vn-vps-proxy TasksMax 16→32 → bctc-discover EAGAIN gone. Fix2 ssc-iboard `iboard-query.ssc.vn` globally dead → SSC-IBOARD-MIGRATE backlog (dev-vps-crawls).
- WIP 0/2. No code sprint dispatched (TSH-1 still pending spawned-agent gateway-wedge clear).

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
- **Auditor staleness alerts get lazily bucketed** — #3020 "VPS proxy stale" was auto-attributed to the known VPS-SOCAT-PERSIST, but raw diagnosis (socat alive + /health 200) found 3 unrelated VPS-side root causes. Always root-cause a stale-data alert from the upstream end, don't trust the auditor's suggested bucket.
- **Spawned-agent gateway wedge is lane-specific:** ops-vps-fetch (Bash/SSH only, no MCP gateway tool) executes fine when spawned, even in sessions where gateway-dependent code agents (po/dev-*) are wedged. Route gateway-independent infra work to the SSH lanes when the gateway-wedge is suspected.

## Carry-over

- **1928a-mcp-gateway-dns-extra-hosts** (URGENT-F1): Docker Desktop restart required. Unblocks 1929a/1930a/1930b/1930c/1922i.
- **1862c-E-dashboard** (HIGH): Cloudflare dashboard SSE ingress — user action needed.
- **1897b** (HIGH): Docker .git/ exclusion — user action needed.
