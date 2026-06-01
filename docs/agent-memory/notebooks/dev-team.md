# dev-team notebook

**Last updated:** 2026-06-01 | **Sprint:** current

> Archive: `docs/archive/notebooks/dev-team-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current state (:07 on-demand — 2026-06-01T08:09Z) — light; chef timestamp-anomaly found

- PREFLIGHT clean. Drained 4 cowork-fire SILENT heartbeats → processed/. 0 telegram. DASHBOARD git-clean (same 5 known-stale P2-*/1967b breadcrumbs).
- **Chef PARTIALLY-VERIFIED-LIVE reinforced:** a new intraday section landed since 07:09 (git diff +72L vs d0c10c05) — same healthy pattern (get_cycle_bootstrap, zero self-abort, clean silent-exit on 0 convergence). Core hardening status unchanged; guaranteed-morning-floor still the only residual.
- **NEW low-pri bug found (verify-raw):** chef telemetry mis-stamps cycle timestamps — the section written AFTER my 07:09 commit self-labels **"intraday 02:13 UTC"** (chronologically impossible); AND every section repeats `Next: morning 05:23 UTC 2026-06-03 (Monday)` but 06-03 is a **Wednesday** (today 06-01 IS Monday). LOW severity — cron fires on its own schedule (unaffected), publish logic unaffected; only human-readable cycle-time + next-slot-date strings wrong. NOT acted (single instance, cosmetic, WIP/gateway discipline). FOLD into chef FU bucket (CHEF-FLOW-CAP-REFACTOR area / new CHEF-TS-STAMP FU); WATCH next tick for pattern (do the :13 rescans keep mis-stamping?). No spawn.
- WIP 0/2. No code sprint.

## Current state (:07 on-demand — 2026-06-01T07:09Z) — CHEF-HARDENING PARTIALLY-VERIFIED-LIVE

- PREFLIGHT clean. Drained 4 cowork-fire SILENT heartbeats → processed/ (no slots due). 0 telegram reports. DASHBOARD git-clean (5 `| NEW |` rows are the known-stale dev-mcp-server P2-* impl_done 2026-05-25 + ancient po 1967b breadcrumbs, not inbound). WIP 0/2.
- **Chef live-verify advanced (raw-read unified-agent.md notebook, gateway-free):** chef fired 3× today post-context (02:17/03:22/06:18 UTC), all intraday. RAW EVIDENCE: (1) **zero self-abort signature** anywhere (grep blocker/would-you-like/refusal/cannot-proceed = NONE) — the original no_self_abort English-prose violation is GONE; (2) **get_cycle_bootstrap used 3×** — the new signal path (replaced get_agent_signals hard gate) is live; (3) **graceful degradation PROVEN LIVE** — 03:22 run hit "macro_snapshot service offline"+early-timeout and STILL completed full Layer-6 analysis instead of aborting (the non-blocking-degradation teeth working); (4) 06:18 (first run AFTER 05:31 hardening) executed clean, silent-exited via the LEGITIMATE intraday conditional-publish gate (0 convergence clusters) — correct design, NOT the bug.
- **Status upgrade:** chef hardening DONE-PENDING-LIVE-VERIFY → **PARTIALLY-VERIFIED-LIVE**. Narrow residual: guaranteed-MORNING-publish degraded-dish-floor not re-exercised (today's 05:23 morning fired BEFORE the 05:31 fix; chef computes next morning 06-03). Distinction held per verify-raw: intraday silent-exit (0 convergence) = designed behavior, only morning/evening slots are guaranteed-publish where the floor applies.
- No code sprint dispatched (verification was raw-read + bookkeeping). Open backlog non-time-sensitive; next-pickable queued in pipeline-state.

## Current state (:07 on-demand — 2026-06-01T06:09Z) — IDLE

- PREFLIGHT clean. Drained 3 cowork-fire SILENT heartbeats → processed/ (no slots due, nothing spawned). 0 telegram reports. DASHBOARD git-clean — the 5 `| NEW |` rows are all known-stale breadcrumbs (dev-mcp-server P2-* impl_done 2026-05-25 + ancient po 1967b), not inbound.
- No chef fire in these ticks → chef-hardening live-verify STILL PENDING next actual chef cron fire. WIP 0/2. IDLE exit (no new trigger; open backlog non-time-sensitive, next-pickable queued in pipeline-state).

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
