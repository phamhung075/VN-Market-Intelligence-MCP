# dev-team notebook

**Last updated:** 2026-06-01 | **Sprint:** current

> Archive: `docs/archive/notebooks/dev-team-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current state (:07 on-demand — 2026-06-01T09:14Z) — RE-CAP-1 shipped (maintenance lane)

- PREFLIGHT clean (HEAD b99bf783, single main worktree). Drained 14 signals: 9 `context_bloat_breach` (2× signal-dashboard SKILL.md @192/120 PERSISTENT; 7× TASKS.md @81/80 — EDIT-TRANSIENTS, live count raw-verified = 80=cap, NO ACTION), 1 `brief_complete` (context-resume-economy), 4 cowork-fire heartbeats. 0 telegram. DASHBOARD git-clean (same 5 known-stale P2-*/1967b breadcrumbs).
- **PO raw-verified the brief was ALREADY IMPLEMENTED** — commit b38ac812 shipped all 3 phases (DASHBOARD delta-read + mandatory prune + pipeline-state v2 head) same session it was authored (~410k tok/day savings). Brief's measured "224L/7KB prose" was its pre-impl snapshot. PO did NOT trust the brief at face value → caught it. The ONE residual: signal-dashboard SKILL.md 192>120 cap (b38ac812's content is now load-bearing → fleet resume-economy depends on §READ/§WRITE/§PRUNE) → filed RE-CAP-1 = lazy-load extract, NOT prune.
- **Chain (all maintenance-lane, mutex-wrapped):** po triage 74caacf9 → agents-architect brief 1eb792ac (extract boundary: 72L of §WRITE/§READ/§PRUNE bodies → sibling dashboard-protocol.md, condensed summaries+pointers stay) → agent-father impl abbbbdba. **RAW-VERIFIED (not relayed):** SKILL.md 192→**118L** (≤120 ✓), child dashboard-protocol.md 115L, frontmatter `---` line 1 ✓, all 3 `## WRITE/READ/PRUNE` anchors + 3 child-pointers resolve, no content lost. RE-CAP-1 DONE (qa-waived: pure .md relocation, self-verifying). drain-signals.md `§ PRUNE` ref still resolves.
- WIP 0/2 (maintenance lane does not consume sprint WIP). 3 on-demand spawns each mutex-wrapped (S3 po-triage + agents-architect + agent-father) and released.

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

## Lessons / patterns

- **brief_complete can arrive AFTER its own impl already shipped same-session** — the context-resume-economy brief was fully implemented (b38ac812) before its signal was even drained; PO raw-verified current code state and caught it instead of re-dispatching done work. Always verify the brief's claimed pre-state against live code before scoping.
- **A SKILL/flow file can breach its cap *because* a fresh feature added load-bearing content** — the fix is lazy-load extraction (pointer the bodies to a sibling .md), NEVER a naive prune that would delete a live contract. Route .md cap fixes through architect→agent-father (agent-md-factory), not code CLEAN→qa.

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
