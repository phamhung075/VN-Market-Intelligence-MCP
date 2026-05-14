# PO Notebook

## Last updated: 2026-05-14T21:25Z (c113 — cron tick: PREFLIGHT pass, signals drained, WIP saturated, idle BATCH)

---

## Cycle 113 — Cron tick PO triage (WIP saturated; no new dev work)

**Spawn context:** dev-team `main.md` flow Step 0-PREFLIGHT → drain-signals → Step 1 PO Triage. User notes 2 QA agents already running.

### PREFLIGHT (Step 0)
- `.git/HEAD.lock` ABSENT. `git worktree prune -v` output empty (no stale entries).
- `.claude/worktrees/*/` contains 8 agent worktree dirs with `bun.lock` files (12-18h old) — these are package-manager files, not git locks; T6 sweep pattern is `.git/*.lock` only, so not removed.
- No HEAD.lock recurrence escalation needed.

### Drain (Step 0a)
- Inbox had 15 `*.json` signals; 13 were already dual-recorded in `processed/` (git status shows them staged as deletes from inbox + adds to processed). Deduped (rm-d the inbox copies); files were already moved by prior cycle, this cycle finalized the housekeeping.
- 2 NEW signals routed:
  - `news-scout-2026-05-14T05-00-00Z.json` (high, bug-escalation): get_cycle_bootstrap timeout — MCP gateway unreachable + Telegram also failed.
  - `unified-agent-2026-05-14T21:02:21Z.json` (high, bug-escalation): daily-review cycle 21:02 UTC BLOCKED at probe — vn-market connector not responding for health_check, get_cycle_bootstrap, get_system_status, send_telegram (4 tools all error).
- Both routing decisions: same root-cause class as 1913 (FA gateway desktop config — Claude Desktop MCP gateway registration / connector lifecycle) + 1907a (digest-predict 5d silence). NOT new dev work. F1 USER ACTION substrate already tracked in backlog (1913 CRITICAL/URGENT-F1). Append observation to 1907a OPS task next cycle if pattern continues.
- Inbox now empty; both moved to `processed/`.

### Pipeline state (Step 0b)
- `task/1915-fix-part1-scan-disk-empty-watchlist` — DEV done (commit `740615c2` per git log), QA running in background.
- `task/1916a-vps-discover-route` — DEV done (vps part `1b8f8cd5`, mcp-part `8f9c2d55`), in REVIEW per TASKS.md row, QA running in background.
- WIP = 2 (QA in flight on both). WIP LIMIT reached. No new tasks may be opened by dev-team flow Step 3 this cycle.
- TASKS.md NOT empty. No `Dev loop idle.` notification.

### Step 1 — PO Triage decision
- BATCH = `NOTHING` (WIP saturated, no UNBLOCK/CLEAN/SPRINT triggers).
- Reasoning: 1915 and 1916a both under QA review; 1916b queued behind 1916a; 1909c stays HOLD (Q1 PDFs awaited + blocked by 1915+1916). No SPRINT can start while WIP at cap.
- No spec-approval gate reached this cycle (no BA `spec_ready` signal observed in inbox).
- No QA `sprint_done` signal yet (both QA agents still running).
- Pending USER F1 unchanged: 1913 (FA gateway desktop config — 10th cycle), 1897b-carry (Docker .git/ exclusion).
- 2 new bug signals reinforce 1913 priority (3rd and 4th cycles of MCP-gateway-unreachable evidence). If next cycle still shows gateway down, recommend escalating 1913 from URGENT-F1 to BLOCKING-F1 with TNB protocol invocation.

### Telegram notification
- send_telegram(work, "PO c113 cron tick: PREFLIGHT clean, 2 signals routed (MCP-gateway-down ×2 → tracks 1913 F1), WIP 2/2 (1915-QA + 1916a-QA in flight), no new dev work this cycle. Awaiting QA verdicts.")

### Carry-forward to c114+
- READ QA verdicts on `task/1915-fix-part1-*` and `task/1916a-vps-*` next cycle. Sign-off if AC met; reject with feedback if not.
- If both pass: spawn 1916b (FIX-HIGH cafef strategy replacement) per backlog ordering.
- Continue tracking MCP-gateway-unreachable pattern: 4 cycles c111/c112/c113 + alert-commander 18:03 UTC + unified-agent 21:02 UTC. If 1913 USER F1 still pending next cycle, draft TNB protocol invocation note to escalate.
- janitor-1912 (LOW CLEAN) still queued. 1914 / 1914b queued. 1907a (CRITICAL OPS — digest-predict cron unwired) still open.

## Cycle 112 — User-injected CRITICAL: 1916-bctc-queue-enricher-scraper-broken

**Spawn:** user prompt with SPIKE 1916 findings (`docs/spikes/SPIKE_1916-bctc-queue-enricher-scraper-broken.md`).

### SPIKE 1916 verdict
Original hypothesis (SSC HTML structure change → Cheerio selectors stale) **FALSIFIED**. `bctcDiscovery.ts` does not use Cheerio at all. Real root cause: **`bctcQueueEnricherJob` has NEVER worked — all 4 discovery strategies dead simultaneously since at least 2026-04-22.** The 9 "working" tickers were populated by the parallel VPS-push pipeline (`fetch-bctc.sh` + `discover-bctc-urls-browser.py`), not by the enricher.

Strategy failures: S0 (VPS Playwright) — `/proxy/bctc-discover` route never deployed on `vps-proxy-server.js` + `bctcHttpFetcher.ts` never sends `X-API-Key`. S1 (SSC iboard) — NXDOMAIN since 2026-04-27. S2 (cafef) — `FinanceInfo.ashx` migrated, query params lost in 301 redirect. S3 (vietstock) — JS-rendered 404 swallowed silently.

### Triage decisions
- **1916 parent row moved to Done** as `1916-bctc-queue-enricher-scraper-broken-SPIKE-DONE-c113` (CRITICAL SPIKE completed).
- **Two carry-forward FIX tasks queued in Backlog:**
  - `1916a-fix-vps-discover-route-and-apikey` (CRITICAL FIX, zone `multi` = `vps-scripts/` + `apps/mcp-server/`, owner ops + dev-mcp-server, deadline 2026-05-15T02:00:00Z). Add `/proxy/bctc-discover/:ticker?year=&quarter=` route to `vps-proxy-server.js` (shells out to existing `discover-bctc-urls-browser.py`) + inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` in `bctcHttpFetcher.ts` for VPS host. 5 ACs.
  - `1916b-fix-cafef-strategy-replacement` (HIGH FIX, zone `apps/mcp-server/`, owner dev-mcp-server, sequenced AFTER 1916a). Replace dead `s.cafef.vn/Candles/FinanceInfo.ashx` Strategy 2 with working alt or delete. 3 ACs.
- **Sequencing:** 1916a is minimum viable fix (Strategy 0 alone delivers full enrichment); 1916b is hardening on top.
- **Concurrent with 1915 SPIKE (still pending review)** — different upstream stage. 1916 = discovery; 1915 = extraction. Banking Q1-2026 SSC filing window 2026-05-15T02:00Z still drives both deadlines.
- **Zone classification:** 1916a marked `multi` per po.md rule — architect must split into 2 sequenced subtasks (VPS route first, then header injection + Docker rebuild). 1916b clean single zone `apps/mcp-server/`.

### project-stats.json
- `_lastRefreshedBy` updated to c113 with SPIKE-DONE + carry-forward FIX summary.
- `currentSprintNotes` rewritten with full strategy-by-strategy failure map + 1916a/b dispatch info.

### Carry-forward to c114+
- Dispatch 1916a immediately (architect for zone-split + BA spec) — CRITICAL deadline 2026-05-15T02:00Z (~5h from now).
- Watch for 1915 SPIKE deliverable to surface (still pending review).
- 1909c-reparse-validation remains HOLD, now blocked by 1915 + 1916a.
- Pending USER F1: 1913 (FA gateway desktop config, 10th cycle), 1897b-carry (Docker .git/ exclude).
- Background carries: janitor-1912, 1914 dedup-api, 1914b-log-agent-work-doc, 1907a digest-predict 5d silence.
