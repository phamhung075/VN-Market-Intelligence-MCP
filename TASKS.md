# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 073 — Evening Intelligence Pipeline Fix

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1186 | Fix evening summary timing race — reschedule to 22:30 VN | Dev | scheduler | — | task/1186-evening-summary-timing | Review |
| 1187 | Investigate pollNewsJob 0-rows + boom-downstream errors | Dev | infrastructure | — | — | Todo |
| 1185 | Investigate baodautu.vn RSS parsing (HTTP 200, 0 items) | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 1 Review.

---

## Task Details (active tasks only — Done tasks archived)

### 1186 — Fix evening summary timing race — reschedule to 22:30 VN

**Status:** Todo | **Layer:** scheduler
**Context:** `eveningSummaryJob` and `intelligenceCycleJob` both fire at 22:00 VN. The evening
summary completes in ~27ms (finds 0 rows in rag_analyses) before the intelligence cycle finishes
its ~2 minute run that writes 100 rows. This produces an empty nightly report even on active
trading days. DB evidence: April 13 evening report generated at 15:00:00 UTC (= 22:00 VN) with
all arrays empty; intelligenceCycleJob at 22:00 VN wrote 100 rows finishing at 22:02:14 VN.
Steps:
1. Find the cron expression for `eveningSummaryJob` in `src/scheduler/jobs.ts`
2. Change it from `0 22 * * 1-5` (or equivalent) to `30 22 * * 1-5` (22:30 VN weekdays)
3. Update `.claude/knowledge/cron-jobs.md` and `docs/data/cron-registry.json` if they reference this schedule
4. Restart server via launchctl kickstart, verify next run is scheduled at 22:30
**Done when:** `eveningSummaryJob` is scheduled at 22:30 VN; cron registry docs updated; bun tsc clean

### 1187 — Investigate pollNewsJob 0-rows + boom-downstream errors

**Status:** Todo | **Layer:** infrastructure
**Context:** `pollNewsJob` runs every ~3 minutes and logs 0 `rows_written` on all 828 success
runs. Each cycle also has exactly one slot with `error_msg: "boom-downstream"`. Meanwhile
`intelligenceCycleJob` writes 100 rows to `rag_analyses` when it runs — so news IS arriving via
VPS push (vps_push_log shows `service: "news"` with 226 items at 21:53 VN). The `pollNewsJob`
appears to be reading from a queue that is always empty, while news actually arrives via the
`/api/push-news` HTTP push path and goes directly to a staging table that the intelligence cycle
consumes. Investigate:
1. Read `src/scheduler/pollNewsJob.ts` (or equivalent) to understand what queue it polls
2. Trace whether the job is redundant (VPS pushes directly), misconfigured, or broken
3. Identify the source of `boom-downstream` — likely a circuit breaker or specific source
4. Fix or disable the broken path; document findings in task report
**Done when:** `boom-downstream` errors stop OR are understood and documented; if job is
redundant it is removed from the cron schedule with doc update

### 1185 — Investigate baodautu.vn RSS parsing (HTTP 200, 0 items)

**Status:** Backlog | **Layer:** infrastructure
**Context:** `fetch-vn-news.sh` on Vinahost VPS gets HTTP 200 from `baodautu.vn/dau-tu-tai-chinh.rss` but parses 0 items. All other 9 sources working. Investigate:
1. Fetch raw RSS content on VPS and inspect actual XML structure
2. Check if feed uses non-standard item element names (e.g. `<entry>` instead of `<item>`)
3. Check for encoding issues (charset declaration vs actual encoding)
4. Fix parser/grep pattern in `fetch-vn-news.sh` or flag the feed as permanently broken
**Done when:** baodautu.vn delivers items in the cycle OR is documented as permanently broken with confirmed reason
