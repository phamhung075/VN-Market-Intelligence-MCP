# dev-team notebook

## Current state (c170 — 2026-05-17T19:44Z)
- PREFLIGHT: HEAD.lock cleared (age=2930s c170 start; second HEAD.lock age=293s removed during commit). Prune clean.
- Drain: po-signoff-c169 (NOTHING/idle) processed → signals/processed/.
- New signal: market-watcher-mcp-unavailable-20260517T193800Z.json found during drain (market-watcher blocked by wrong MCP URL).
- PO triage (c170): BATCH — 1938a-cowork-mcp-url-fix (HIGH FIX, cross-service/).
- Root cause identified: `https://zenmidi.com/mcp` has no cloudflared route → 404. Correct: `https://zenmidi.com/vn-market/mcp`.
- Execute: developer handled directly (cross-service/ zone). 15 files updated. Commit: 88920963.
- 1937a SPIKE resolved. 1938a DONE.
- ACTION REQUIRED FOR USER: Reload Claude Desktop (Cmd+R) for cowork workspace changes to take effect.

## c170 cycle log
- PREFLIGHT: HEAD.lock cleared (age=2930s + second occurrence age=293s during commit).
- Drain: c169 signal processed. market-watcher bug signal found + moved to processed.
- PO triage: BATCH 1938a (root cause of 1937a: wrong MCP URL).
- Execute: developer — 15 files updated, committed 88920963.
- WORK notification sent.

## Current state (c169 — 2026-05-17T18:40Z)
- PREFLIGHT: HEAD.lock absent. Prune clean.
- Drain: 0 signals. 0 pending signals.
- PO triage: NOTHING — 1937a-cowork-scheduler-mcp-gap SPIKE queued (TNB Finding #4, N=2 cowork agents blocked in scheduler context). No codeable FIX/SPRINT tasks.
- WORK notified: "Dev loop idle."
- USER request: frontend feature — stock detail panel needs info source + decision sections.
- Dispatched: dev-frontend agent (1937b-stock-detail-source-decision).
- Session gate: idle EXIT.

## c169 cycle log
- PREFLIGHT: HEAD.lock absent. Prune clean.
- Drain: 0 signals.
- PO triage: NOTHING (1937a SPIKE filed by PO, idle return).
- User feature request: dispatched dev-frontend.
- WORK notified.

## Current state (c166 — 2026-05-17T16:10Z)
- PREFLIGHT: HEAD.lock #53 cured (age=1281s, size=0B, no live pid). Prune clean.
- Drain: 0 signals. MCP unavailable (scheduled session env). 0 Telegram reports.
- TASKS.md: no codeable work. USER-ACTION items only.
- Recent: route fix shipped (377aefbf) — /news and /macro 404s via gateway resolved.
- Session gate: idle EXIT.

## c166 cycle log
- PREFLIGHT: HEAD.lock #53 cured. Prune clean.
- Drain: empty. MCP down.
- Session gate: idle EXIT.

## Current state (c165 — 2026-05-17T15:12Z)
- PREFLIGHT: no locks. Prune clean.
- Drain: 0 signals. 0 new Telegram reports. Working tree clean.
- TASKS.md: no codeable work.
- Session gate: idle EXIT.

## c165 cycle log
- PREFLIGHT: clean.
- Drain: empty.
- Session gate: idle EXIT.

## Current state (c164 — 2026-05-17T14:12Z)
- PREFLIGHT: HEAD.lock #52 cured (age=1208s, size=0B, no live pid). index.lock absent. Prune clean.
- Drain: 1 signal — `qa-responder-mcp-unavailable-20260517T134905Z.json` (type=bug-escalation, severity=critical). NEW fingerprint. Processed → DB + moved to processed/. Result: routed-to-po.
- Telegram: 0 new reports.
- PO triage (inline): signal = same root cause as 1907a (ALL cowork scheduled tasks lack MCP). Updated 1907a to reflect full scope (5 agents confirmed blocked: digest-predict, market-watcher, alert-commander, qa-responder, news-scout). No new codeable task — user action required.
- Committed: cowork notebooks (alert-commander/news-scout) + signal processed + TASKS.md update.
- Session gate: idle EXIT.

## c164 cycle log
- PREFLIGHT: HEAD.lock #52 cured. Prune clean.
- Drain: 1 signal (qa-responder MCP unavailable). Fingerprint NEW. Processed to DB + moved.
- PO inline triage: 1907a updated (pattern confirmed: 5 agents blocked in scheduled tasks).
- Session gate: idle EXIT.

## Current state (c163 — 2026-05-17T13:12Z)
- PREFLIGHT: HEAD.lock #51 cured (age=2871s, size=0B, no live pid). index.lock also cured (age=1281s). Prune clean.
- Drain: inbox empty (0 signals). No new Telegram reports.
- Committed 4 cowork notebooks (market-watcher/qa-responder/alert-commander/unified-agent) — bdf503be.
- TASKS.md: no codeable work. All open items USER-ACTION/MONITORING/WONTFIX.
- Session gate: idle EXIT. WORK notified.

## c163 cycle log
- PREFLIGHT: HEAD.lock #51 + index.lock cured. Prune clean.
- Drain: 0 signals, 0 new reports.
- Committed 4 pending cowork notebooks.
- PO triage: NOTHING — all tasks USER-ACTION/MONITORING/WONTFIX.
- Session gate: idle EXIT.

## Current state (c162 — 2026-05-17T12:12Z)
- PREFLIGHT: HEAD.lock #50 cured (age=1262s, size=0B, no live git pid). Worktree prune clean.
- Drain: inbox empty (0 signals).
- Telegram: 1 new report (2928 — market-watcher notebook commit blocked by HEAD.lock). Resolved: fixed (HEAD.lock cleared, notebook in 5b5e963f).
- TASKS.md: no codeable work. All open items are USER-ACTION or MONITORING/OBSERVE.
- Session gate: idle EXIT. WORK notified.
- All 9 services healthy (api-gateway check).
- Committed: alert-commander notebook c162 + tool-usage-stats reset (e6375010).
- Open USER-ACTION items: 1907a (Claude Desktop digest-predict), 1862c-E-dashboard (Cloudflare SSE), 1897b (Docker .git/ exclusion).

## c162 cycle log
- PREFLIGHT: HEAD.lock #50 cured (age=1262s, 0B, no pid). Prune clean.
- Drain: inbox empty.
- Telegram: 2928 resolved (fixed).
- PO triage: NOTHING — all open tasks USER-ACTION/MONITORING/WONTFIX.
- Session gate: idle EXIT.

## Current state (c161 — 2026-05-17T13:07Z)
- PREFLIGHT: HEAD.lock absent. Prune clean.
- Drain: inbox empty (0 signals).
- TASKS.md: no codeable work. All open items are USER-ACTION or MONITORING/OBSERVE.
- Session gate: idle EXIT.
- Parallel commits landed from cowork agents since c160: b3d9ce18 (ARCHITECTURE.md), 7987d247 (news-scout notebook), 642b7114 (frontend scaffold files), a1405881 (signals drain), 1a8c5007 (signal-dashboard skill), 7f52a859 (cowork notebooks).
- Open USER-ACTION items for user: 1907a (Claude Desktop digest-predict), 1862c-E-dashboard (Cloudflare SSE ingress), 1897b (Docker .git/ exclusion).

## c161 cycle log
- PREFLIGHT: HEAD.lock absent. Prune clean.
- Drain: inbox empty.
- PO triage: NOTHING — all open tasks are USER-ACTION, MONITORING, or OBSERVE.
- Session gate: idle EXIT.

## Current state (c160 — 2026-05-17T12:07Z)
- PREFLIGHT: HEAD.lock absent. Worktree prune clean.
- Drain: 2 signals (SPIKE-1933a brief_complete + TNB c65 audit-handoff). Both NEW, dual-record written to signals.db.
- TNB c65 ACK written. Most findings stale (resolved c159). Open carries: 1907a (CRITICAL USER), BCTC banking (cowork), 1862c-E-dashboard (USER), 1897b (USER).
- SPIKE-1933a → WONTFIX: evaluateAlert() dead code deleted from clients.ts:423 (interfaces + function, ~27 lines). ZERO callers confirmed by grep. Architecture: market.db.alerts → Alert Commander = canonical intelligence path. Go alert-engine /evaluate reserved for future stop-loss use case.
- 1933b: dead code deletion complete. tsc 0 errors. 31/31 targeted tests GREEN (1307-ta-alert-scan + 1309-bb-alert-scan + 1309c-parallel + 1930b-cashflow-ratio-guard). Full suite: Bun 1.3.13 OOM/C++ crash (known upstream bug, unrelated to changes).
- TASKS.md: cleaned to 65 lines (< 80 limit). Archived stale Backlog entries (CLEAN-c130, 1919, 1913, 1918a, 1918b). Todo collapsed (DONE items promoted to Done). 1922i → WONTFIX. In Progress empty.
- 1907a-digest-predict: Claude Desktop IS running (launchctl confirmed). No crontab/plist trigger. Digest-predict runs via Claude Desktop internal scheduler. USER-ACTION required: verify scheduled task in Claude Desktop.
- No codeable work remaining. All open tasks are USER-ACTION, cowork, or monitoring.

## c160 cycle log
- PREFLIGHT: HEAD.lock absent. Prune clean.
- Drain: 2 signals processed (SPIKE-1933a + TNB c65). Both NEW. Moved to processed/.
- PO triage: BATCH([1933b FIX — dead code cleanup]). TNB c65 ACK written.
- TASK_1933b (dev-mcp-server): evaluateAlert/AlertEvaluateRequest/AlertEvaluateResponse deleted from clients.ts. tsc 0 errors. 31 targeted tests GREEN. SPIKE-1933a WONTFIX.
- TASKS.md: 65 lines. Backlog pruned. Todo collapsed.
- Session gate: no codeable work → idle EXIT.

## Current state (c159 post-Docker-restart — 2026-05-17T11:05Z)
- Docker restart complete. All 12 containers Up+healthy (mcp-server, alert-engine, rag-service, etc.).
- MCP gateway port 3000: healthy (141 tools, 53 sessions, uptime ~2h pre-existed restart).
- API gateway port 4000: all 9 services OK.
- 1928a DONE: extra_hosts fix applied to /Users/admin/Documents/Claude/Projects/mcp server gatway/docker-compose.yml. Container recreated. host.docker.internal=192.168.65.254 in /etc/hosts. Virtiofs DNS no longer a single point of failure.
- 1929a RESOLVED: alerts table healthy (516 rows, fresh 09:07 UTC data). Prior "malformed" error was transient virtiofs I/O.
- 1930a RESOLVED: verdictResolutionJob rows_written=0 both today runs (09:07+10:07 UTC). 1926a fix held.
- 1930b LIVE VERIFY PASS: FPT net_profit=20,225 / operating_cf=10,189,002 → ~504x (guard suppresses). VCB Q4 operating_cf=1.2e15 (extraction bug) → ~1.42e8 (guard suppresses). Unit mismatch confirmed.
- 1930c RESOLVED: rag-service healthy, no LENC errors, 1925a drop+reinit held.
- 1922i ROOT CAUSE FOUND: alert_engine_records=0 because evaluateAlert() in clients.ts:423 is dead code. taAlertScanJob/bbAlertScanJob write to market.db.alerts only (Alert Commander pipeline). Go alert-engine /evaluate never called in production. Escalated to architect as SPIKE-1933a.
- Signal emitted: 2026-05-17T11-00-01Z-spike-1933a-alert-engine-wiring.json

## c159 cycle log
- PREFLIGHT: HEAD.lock absent. Prune clean.
- Drain: inbox empty (0 signals).
- Artifacts: Cowork news-scout scheduled task failure produced WORK_STATUS.md (root) + reports/news-scout-cycle-2026-05-17.md — deleted. Confirms MCP gateway still down (same 1928a root cause at that point).
- PO triage: NOTHING — blocked backlog only.
- Session gate: idle EXIT.
- POST-DOCKER-RESTART (user action): Actioned all 5 blocked tasks — see current state above.
- TASKS.md updates: 1928a/1929a/1930a/1930c DONE. 1922i → SPIKE-1933a. 1930b verified.

## Current state (c158 close — 2026-05-17T10:15Z)
- PREFLIGHT: HEAD.lock #49 cured (age=655s, size=0B, no live pid). Worktree prune clean.
- Drain-signals: inbox empty (0 signals).
- PO triage (c158): NOTHING — all remaining tasks require Docker Desktop restart (1928a F1 USER) or user Cloudflare action (1862c-E-dashboard). Gateway-independent code backlog exhausted (1862c-F c156, 1930b c157 both done).
- Session gate: idle EXIT. No codeable work.
- USER ACTION STILL PENDING: 1928a Docker Desktop restart (F1). After restart: prioritize 1929a (alerts table) + 1922i (alert_engine_records count) + 1930b live verify.

## c158 cycle log
- PREFLIGHT: HEAD.lock #49 cured (age=655s, 0B, no pid). Prune clean.
- Drain: inbox empty.
- PO triage: NOTHING — blocked backlog only. 1930b confirmed Done.
- Session gate: idle EXIT.
- Post-cycle: no non-main branches. No signals. Telegram unavailable. Notebook written.

## Current state (c157 close — 2026-05-17T11:58Z)
- PREFLIGHT: HEAD.lock absent. Worktree prune clean.
- Drain-signals: 1 signal (po-c156-triage → routed-to-po). Inbox now empty.
- PO triage (c157): BATCH([1930b FIX]) — OCF/NI ratio plausibility guard, gateway-independent code fix. PO c156 had explicitly queued this as next-slot task.
- TASK_1930b (dev-mcp-server): `OCF_NI_RATIO_PLAUSIBILITY_LIMIT=20` added. `computeOcfNiRatio` refactored to return `{ratio,rawRatio}`. `CashFlowFound` gains `ocf_ni_ratio_raw` (unguarded for FA inspection) + `ocf_ni_suppressed` (true when raw>20). FPT (504×) and VCB (1.42e8×) now suppressed; FA can see raw_ratio to diagnose extraction issue. 7/7 tests GREEN, tsc clean. Commits: 1bc41147 + 11eeb5ee.
- USER ACTION STILL PENDING: 1928a Docker Desktop restart (F1). Gateway down ≥10h. All cowork agents dark. 4 Docker-gated tasks blocked.
- Pattern: two consecutive gateway-independent code cycles executed. When gateway returns, prioritize 1929a (alerts table corruption) + live verify of 1930b.

## c157 cycle log
- PREFLIGHT: HEAD.lock absent. Worktree prune clean.
- Drain: 1 signal (po-c156-triage, fingerprint 85a698e7, routed-to-po). Inbox empty.
- PO triage (c157): 1930b dispatched (DEV-ABLE NOW per c156 PO signal). All other tasks blocked on 1928a.
- TASK_1930b (dev-mcp-server, commits 1bc41147 + 11eeb5ee): Interface-layer guard only. 7 new tests GREEN. Full suite: no new failures. tsc 0 errors. DDD PASS.
- Post-cycle: no non-main branches. Inbox empty. Telegram unavailable (gateway down). Notebook written.

## Current state (c156 close — 2026-05-17T09:30Z)
- PREFLIGHT: HEAD.lock #48 cured (age=520s, size=0B, no live pid). Worktree prune clean.
- Drain-signals: 2 signals (market-watcher + qa-responder, bug-escalation HIGH, MCP gateway down 9th+ consecutive block). All Telegram ops skipped (gateway down).
- PO triage (c156): BATCH([1862c-F FIX]) — SSE session eviction, gateway-independent code work. 1930b queued next slot. 1932a marked Done.
- TASK_1862c-F (dev-mcp-server): Structured 404 `{error:"session_not_found",sessionId}` + heartbeat eviction (dead session removed from Map + interval cleared). 5/5 tests GREEN, tsc 0 errors, no regressions. Commits: c52982af + b04b5df1 + 2850dcf6.
- USER ACTION STILL PENDING: 1928a Docker Desktop restart (F1). All cowork agents dark. 4 Docker-gated tasks remain blocked.
- Productive parallel tracks: frontend (1932a 4 dashboards — done), MCP code-only fixes (1862c-F — done).

## c156 cycle log
- PREFLIGHT: HEAD.lock #48 cured (age=520s, size=0B, no pid). Worktree prune clean.
- Drain-signals: 2 signals processed (routed-to-po). Both confirm MCP gateway outage ≥9h.
- PO triage: 1862c-F dispatched (gateway-independent). 1932a Done. WIP=0→1 during execution.
- TASK_1862c-F (dev-mcp-server): AC1+AC2 production fixes, 5 tests GREEN, tsc clean. Done.
- Post-cycle: Telegram unavailable. Notebook written.

## Current state (c155 close — 2026-05-17T08:13Z)
- Pipeline: 1931a DONE. apps/frontend/ scaffold hardened (5 risk flags closed).
- HEAD.lock #47 cured at PREFLIGHT (age=1300s, size=0B, no live pid). lsof captured.
- MCP gateway down (1928a URGENT-F1): 10th+ consecutive block. All Telegram ops skipped. All Docker-gated tasks (1929a, 1930a, 1930b, 1930c, 1922i) blocked on user action.
- 4 signals drained (alert-commander + market-watcher + news-scout + qa-responder, all bug-escalation HIGH, dedup of prior cycle signals).
- Productive parallel track: frontend zone (zero MCP coupling).

## c155 cycle log
- PREFLIGHT: HEAD.lock #47 cured (age=1300s, size=0B, no pid). Worktree prune clean.
- Drain-signals: 4 signals processed (all routed-to-po). All confirm cluster-wide MCP gateway outage ≥8h.
- PO triage (c155): BATCH([1931a FIX]) — frontend hardening selected as only zero-MCP-dependency parallel track. Docker-gated tasks skipped.
- TASK_1931a (dev-frontend, worktree): All 5 risk flags closed. Dockerfile, docker-compose frontend service (port 3001), npm install (757 pkgs), components.json + shadcn Button/Card/Input, playwright.config.ts + smoke.spec.ts, API_GATEWAY_URL wired. Vitest 3/3 GREEN, tsc 0 errors. Commits: ecda4fc2 + 0e443e03.
- Merge gate: all controls pass (index-check clean, tree-verify clean, C2 OK).
- Post-cycle: MCP gateway down — Telegram skipped. Notebook written.

## Current state (c138 close — 2026-05-16T06:30Z)
- Pipeline: idle (3rd consecutive). Inbox empty, no new signals.
- HEAD.lock #46 cured at PREFLIGHT (age=1290s, size=0B, no live pid).
- Worktree-agent-aa8dd0061c8780417 still locked (pid 93207 live session). Skip CLEAN.
- MCP gateway (1913 BLOCKING-F1): cycle 14+.

## c138 cycle log
- PREFLIGHT: HEAD.lock #46 cured. Inbox empty. Worktree prune clean.
- Session gate: inbox empty + pendingSignals=[] + WIP=0 → idle EXIT.

## Current state (c137 close — 2026-05-16T05:55Z)
- Pipeline: idle. Docker DNS 2nd recurrence (05:02 UTC) resolved by ops at 05:48 UTC. No codeable work.
- HEAD.lock #45 cured at PREFLIGHT (age=1286s, size=0B, no live pid). index.lock also cured (Spotlight, age=1825s).
- Docker DNS: 2 incidents today (02:21 + 05:02 UTC). HOLD until 3rd occurrence → architect SPIKE.
- WIP: 0/2. Worktree-agent-aa8dd0061c8780417 locked by live session — skip CLEAN this cycle.
- MCP gateway (1913 BLOCKING-F1): cycle 13+. All Telegram ops skipped.

## c137 cycle log
- PREFLIGHT: HEAD.lock #45 cured (age=1286s, size=0B, no pid). index.lock #1 cured (Spotlight com.apple 75631, age=1825s).
- Drain: 2 signals processed (both Docker DNS 1919-recurrence, resolved by ops). Inbox empty.
- Ops: Docker Desktop force-restart at 05:48 UTC. All 12 containers Up+healthy. DNS resolves. Notebook bea2bbda.
- PO triage (c137): NOTHING — Docker DNS HOLD (2/3 threshold). All backlog user-action/monitoring. Notebook af245d3f.
- Post-cycle: no non-main branches (worktree locked by live session, skip). No new signals.

## Current state (c136 close — 2026-05-16T04:52Z)
- Pipeline: TASK_1921b SHIPPED + QA APPROVED. urgent_news regime enum fix delivered. Inbox empty.
- HEAD.lock #44 cured at PREFLIGHT (age=2539s, size=0B, no live pid).
- SPIKE_1921a carry-forward COMPLETE: `UrgentNewsFindingData.regime` migrated NEUTRAL|BULL|BEAR → TIGHTENING|NEUTRAL|EASING. Thresholds: TIGHTENING:0.60, NEUTRAL:0.55, EASING:0.50.
- MCP gateway (1913 BLOCKING-F1): still unavailable (cycle 12+). All Telegram ops skipped.
- Worktree `worktree-agent-aa8dd0061c8780417` harness-locked (T6 will clean next preflight).

## c136 cycle log
- PREFLIGHT: HEAD.lock #44 cured (age=2539s ~42min, size=0B, no pid). Signal in inbox: `20260516T033153Z-spike-1921a-complete.json` (SPIKE_1921a complete).
- Drain: 1 signal processed (spike-complete, architect→po). Moved to processed/. DB fingerprint recorded.
- PO triage (c136): BATCH([1921b FIX]) — spike-complete signal triggered TASK_1921b dispatch. No other actionable items. WIP=0→1.
- TASK_1921b (dev-mcp-server, worktree `agent-aa8dd0061c8780417`, d4eb752a→cherry-pick 2031d8b8): All 4 files changed. H3 tests 15/0, 1293a 32/0. tsc 0 errors. DDD PASS. Security PASS.
- QA gate: APPROVED 2031d8b8. All 7 ACs verified.
- PM: TASKS.md updated (4cac7d44). 1921b DONE. SPIKE_1921a chain COMPLETE.
- Post-cycle: no non-main branches (worktree harness-locked only). No new signals. Telegram skipped (1913).

## Current state (c135 close — 2026-05-16T03:45Z)
- Pipeline: 1 SPIKE dispatched and completed (SPIKE_1921a). Carry-forward: TASK_1921b (dev-mcp-server, size S, signal in inbox).
- HEAD.lock #43 cured at PREFLIGHT (age=1360s, size=0B, no live pid).
- TNB c61 processed: TIGHTENING regime confirmed, news-scout schema bug identified, FA auto-cure applied.
- SPIKE_1921a finding: urgent_news Zod schema rejects TIGHTENING/EASING — silent signal loss every non-NEUTRAL cycle. Fix: migrate to TIGHTENING|NEUTRAL|EASING enum (Option B).
- Signal in inbox: `20260516T033153Z-spike-1921a-complete.json` → picked up next cycle by PO for 1921b dispatch.

## c135 cycle log
- PREFLIGHT: HEAD.lock #43 cured (age=1360s ~23min, size=0B, no pid). Signals inbox empty.
- Drain: skipped (inbox empty at start).
- PO triage (c135): BATCH([SPIKE_1921a]) — TNB c61 triggered urgent_news regime enum rethink.
- SPIKE_1921a (architect, worktree, 7001cdd9): Root cause confirmed — Zod schema `"NEUTRAL"|"BULL"|"BEAR"` rejects TIGHTENING/EASING values from news-scout. Option B recommended (migrate to TIGHTENING|NEUTRAL|EASING). 4 files to change, no DB migration. Carry-forward: TASK_1921b.
- Post-cycle: no non-main branches. Spike signal dropped to inbox. Notebook committed.

## Carry-over to c156
- **1928a-mcp-gateway-dns-extra-hosts** (URGENT-F1): Docker Desktop restart required (user action). Unblocks 1929a/1930a/1930b/1930c/1922i.
- **1929a** (HIGH): alerts table malformed in market.db — post-Docker restart.
- **1930b** (HIGH): get_cash_flow implausible values — post-Docker restart.
- **1930a** (MEDIUM): verdict retry recurrence — post-Docker restart.
- **1930c** (MEDIUM): LanceDB LENC magic recurrence — post-Docker restart.
- **1922i** (MEDIUM): alert_engine_records count verification — post-Docker restart.
- **1862c-E-dashboard** (HIGH): Cloudflare dashboard SSE ingress — user action needed.
- **1862c-F** (MEDIUM): SseSessionManager eviction — gated on 1862c-E stable.

## Lessons / patterns
- **Worktree harness auto-merge worked this cycle**: c80/c81/c82 needed manual cherry-pick, c83 didn't. Hypothesis: only 2 disjoint doc-only tracks → no conflicts → harness merged transparently. Pattern is environment-dependent; cannot rely on, so cherry-pick fallback must remain in skill.
- **Agents should verify PO file/line refs before blind-edit**: c83 Track B developer found PO's `dev-team/main.md L91-96` was wrong (size rules actually at `po/main.md L26`). Agent greped + corrected. This is the right behavior — encode in developer flow that PO refs are advisory, source-of-truth is grep.
- **BA spec discoveries can downgrade priorities**: 1881a was HIGH METHODOLOGY but spec-time discoveries reveal implementation weaker than expected. Right call; spec doesn't pre-resolve architecture.
- **HEAD.lock cure 47 lifetime**: Pattern stable. ~21min average stale lock cleared cleanly.
- **MCP gateway outage pattern**: 10th+ consecutive block. Docker Desktop virtiofs socket deadlock. Only USER action (Docker Desktop restart + extra_hosts) can break the cycle.
- **Zero-MCP parallel tracks**: When gateway is down, frontend zone is the only productive work. Pattern: identify zero-MCP-coupling tasks in PO triage when outage persists.
