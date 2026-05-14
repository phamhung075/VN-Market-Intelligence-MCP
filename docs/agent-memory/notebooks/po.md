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

**Spawn context:** user prompt to `.claude/flows/po/main.md` adding new CRITICAL bug to backlog alongside 1915. Ops confirmed via Docker logs 2026-05-14 20:00-20:15 UTC.

### Bug summary (user-provided, ops-confirmed)
- `bctcQueueEnricherJob` SSC portal scraper returns 0 URLs for 14/30 watchlist tickers.
- Affected: DPM, KBC, MWG, NVL, REE, TCH, VNH + 7 others.
- Working: VCB, FPT, DIG, BSR, DGC, HPG, SHB, VEA, VNM (12 PDFs on disk, last Apr 27-29).
- Likely cause: SSC portal (ssc.hsx.vn) HTML structure changed → Cheerio/jsdom selectors stale.
- Impact: Q1-2026 BCTC collection blocked for 14 tickers. Banking deadline 2026-05-15.
- Key file: `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (user said `bctcQueueEnricher.ts` — actual filename `*Job.ts`).

### Triage decisions
- **NEW row added to Backlog: 1916-bctc-queue-enricher-scraper-broken** (CRITICAL/UNBLOCK, owner dev-mcp-server, zone `apps/mcp-server/`).
- **Concurrent with 1915 — NOT a duplicate**: 1915 = bctcReparseJob extraction-side silence (PDFs on disk, no DB rows); 1916 = bctcQueueEnricherJob discovery-side silence (NO new PDFs reaching disk for 14 tickers). Different upstream stages.
- **No block dependency**: user explicit "do not block on 1915". Both SPIKEs run in parallel.
- **NOT recurring-bug** vs 1908/1909-series (different module, different failure mode).
- Mode: SPIKE first (2h timebox) — HTML structure change vs auth-block vs rate-limit unconfirmed; need raw DOM diff before committing to selector rewrite. Findings doc only.

### project-stats.json refresh
- `_lastRefreshedBy` updated to c112 with 1916 context.
- `currentSprintNotes` rewritten to lead with 1916 + cross-reference 1915 + concurrent-not-blocking note.

### BATCH return (added to existing 1915 SPIKE queue)
```
[{
  type: "SPIKE",
  id: "1916-bctc-queue-enricher-scraper-broken",
  title: "bctc-queue-enricher-scraper-broken-triage",
  question: "Is bctcQueueEnricherJob returning 0 URLs for 14/30 tickers because SSC portal HTML structure changed (Cheerio selectors stale), or is it auth-block / rate-limit / other?",
  mode: "spike",
  zone: "apps/mcp-server/",
  files: ["apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts"],
  timebox: 120,
  deadline: "2026-05-15T02:00:00Z",
  owner: "dev-mcp-server",
  baseline_pass: 9277,
  concurrent_with: "1915-bctc-pipeline-silence",
  blocks_on: null
}]
```

### Carry-forward to c113+
- Review 1916 SPIKE deliverable: `reports/SPIKE_1916-bctc-queue-enricher-scraper-broken.md`.
- Post-FIX verify: bctcQueueEnricherJob returns ≥1 URL for ≥10 of 14 affected tickers on next run.
- Track 1915 + 1916 in parallel until both ship.
- 1909c-reparse-validation now blocked by BOTH 1915 + 1916 in addition to calendar.
- Pending USER F1: 1913 (FA gateway desktop config, 10th cycle), 1897b-carry (Docker .git/ exclude).
