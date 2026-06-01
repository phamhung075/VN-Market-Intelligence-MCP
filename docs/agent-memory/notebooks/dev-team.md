# dev-team notebook

**Last updated:** 2026-06-01 | **Sprint:** current

> Archive: `docs/archive/notebooks/dev-team-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current state (:07 — 2026-06-01T10:09Z) — cafef-verify PASS; LIVE news-push outage found + RESTORED (deploy regression from our own sprint)

- PREFLIGHT clean (HEAD 7aa3abbf, single main worktree). Drained 3 cowork-fire SILENT heartbeats → 0 inbox. DASHBOARD 0 NEW dev-team rows. WIP 0/2.
- Light tick → drove the just-shipped CAFEF sprint (b99bf783) to verified-closure. **ops-vps-fetch recon (mutex-wrapped, read-only):** FU-OPS-CAFEF-1 **PASS** — cafef-market + cafef-biz both **20 items/cycle across 7 cycles**, ZERO PERMANENTLY_BLOCKED → the is_blocked() CF-anchor fix is holding in prod. FU-OPS-CAFEF-2: **bs4 NOT installed** on VPS → article-body silently on 5000-char regex fallback (not 8000-char bs4 primary).
- **But recon surfaced a LIVE incident:** every push cycle `http=000` since ~09:07Z → ALL 14 VN feeds fetched but NOT landing in mcp-server DB. I hypothesized socat-died-on-08:57Z-reboot and dispatched `ops` (mutex-wrapped) to restore. **ops verify-raw CORRECTED me:** socat alive, VPS uptime 48d (NO reboot; "boot-1/boot-2 08:57Z" log lines were misread). REAL cause: `/root/fetch-vn-news.sh` shipped unrendered template placeholders `API_URL="__MCP_BASE__/..."` + `API_KEY="__API_KEY__"` → curl to literal hostname → http=000. ops rendered creds from /root/vn-market.env.bak, fixed same bug in fetch-foreign-flow.sh, **verified raw: http=200, received=242, cursor advanced 0→1780331100**. Pipeline RESTORED end-to-end. ops committed ops.md (53c3d888).
- **Root = deploy regression from OUR cafef sprint:** repo `vps-scripts/fetch-vn-news.sh` L7-8 hold hardcoded `__MCP_BASE__`/`__API_KEY__`; last commit to touch it = 814088b0 (cafef P1). Deploy clobbered the live rendered script with the raw template → ~1h push outage; RECURS on every redeploy. Filed HIGH sprint candidate VPS-DEPLOY-PLACEHOLDER-GUARD (deploy-time render + pre-deploy placeholder-leak guard; consider env-fallback form like foreign-flow uses). Also filed VPS-BS4-INSTALL (LOW: pip3 install beautifulsoup4, no restart). cursor_epoch=0 was a SYMPTOM of broken push (resolved by same fix), not a separate bug.
- 2 ops-lane spawns, each mutex-wrapped (ops-vps-fetch + ops) and released. No code mutated by dev-team this tick (verification + incident-restore + filing).

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

## Lessons / patterns

- **A recon's INFERRED root cause is a hypothesis, not fact — make the fixer verify-raw before acting on it.** ops-vps-fetch recon read "boot-1/boot-2 08:57Z" log lines and I inferred VPS-reboot-killed-socat; passed that to ops as the working hypothesis. ops verify-raw'd (uptime 48d, socat alive via curl 200) and found the REAL cause (unrendered `__MCP_BASE__`/`__API_KEY__` placeholders). The wrong hypothesis cost nothing because ops re-verified instead of blindly restarting socat. Never relay a recon's suggested root-cause bucket as settled.
- **A deploy that copies a repo template can silently clobber a rendered live config — green code tests don't cover it.** cafef sprint (814088b0) fixed is_blocked() (verified cafef 0→20), but the SAME deploy overwrote /root/fetch-vn-news.sh's rendered API_URL/API_KEY lines with raw `__PLACEHOLDER__` template → ~1h push outage. The code fix was correct; the DEPLOY-RENDER step was skipped. Lesson: any VPS-script deploy needs a pre-deploy placeholder-leak guard (reject `__[A-Z_]+__` in deployed artifacts) + render step; prefer `${VAR:-default}` env-fallback form (foreign-flow has it, fetch-vn-news.sh didn't). Filed VPS-DEPLOY-PLACEHOLDER-GUARD.
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
