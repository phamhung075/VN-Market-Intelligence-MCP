# PO Notebook

_Last: 2026-07-20T00:52Z (bounded triage — signal_queue drain 25→0 + sprint_goal cap 16→15; 1 PLAN-ONLY mint, ZERO dev dispatch)_

## Tick 2026-07-20T00:52Z — signal_queue drain + sprint_goal cap breach

Router-directed bounded triage after Tier-3 auditor. All writes via `orch-apply.sh` (Zod + conservation + CAS PASS). Commit `74464df28` (orch-state only, explicit path). Prior-art grepped before any mint.

**TASK 1 — 25 NEW → triaged (0 remaining), 5 clusters, 1 new PLAN-ONLY mint:**
- **COLLAPSE 5** pdf-extractor A-20 event-loop-stall dups → existing `PDF-AVAIL-02-FIX` (enriched: root-cause worker-timeout / event-loop isolation / separate health-server port; recurring_bug_count=5; **supervised:true** set to block BOUNDED-1; do-NOT-restart — re-restart re-wedges the next long PDF). No mint.
- **FOLD 11** mcp-server A-21/A-30 mem/restart = known-FP re-emit churn (mem-pct-denominator falsespike; restart-count 7 cumulative/stale). Already tracked by `FIX-MCP-MEMORY-CODE-LEAK` + `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`. No mint.
- **RESOLVED 3** boardDetailsRefreshJob market.db corruption (self-resolved 20:46Z integrity_check=ok) → recurring Docker-virt class `SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING` count 2→3.
- **CLOSE 1** market_messages data_stale — 07-19 Sun weekend, market-hours-blind FP.
- **PLAN-ONLY MINT 1:** `SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP` (cross-service/, supervised) collapsing 4 frontend:3001 A-12 + api-gateway:4000 A-04/A-13 CURL_ERR flaps. MCP serving path healthy ⇒ isolate real-outage vs probe-FP first (health-probe-timeout FP class); no infra action.

**TASK 2 — sprint_goal.entries 16→15 (≤ cap 15):** archived SHIPPED `QUE-REFERENCE-PAGE` (route apps/frontend/app/routes/dashboard.kinh-dich-reference.tsx exists 9489B, renders 64 que; successor KINHDICH-HOVER-DETAIL treats it as existing; 0 orphan refs in task_board lanes).

## Carry-over
- **A-30 TRIPWIRE (STANDING):** the FOLD above holds ONLY while GC ceiling intact — escalate to ops if baseline >~93% no-dip OR peak sustained >97% no-reclaim OR OOMKilled=true.
- **agent-father COORDINATION:** `unified-agent.md` = present-but-forbidden Write; `tran-ngoc-bau.md` = missing tools grant. Same owner, different mechanism — fold, don't assume one fix covers both.
- **DO NOT flip GAP-CHEF-SYNTHESIS-A DONE_VERIFIED on one good cycle** — intermittent; require 3 consecutive dishes with non-empty conviction_calls[]+sector_phases[].
- **Audit-plane distrust (STANDING):** notebook `Synthesis: <path>` ≠ persistence receipt; verify by mtime, not citation.
- **pdf-extractor + dashboard-tier are PLAN-ONLY** — filed, NOT dispatched; router/user gates execution. supervised:true on both blocks idle auto-pickup.
- Session f4ca241d (router coord). Committed MY scoped path only; did NOT push.
