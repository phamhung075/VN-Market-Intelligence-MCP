# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 077 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1191 | Replace TE stream.ashx with public RSS feeds | Developer | infrastructure | — | task/1191-te-stream-rss | Review |

**WIP:** 0 In Progress.

---

## Task Details (active tasks only — Done tasks archived)

### Task 1191 — Replace TE stream.ashx with public RSS feeds

**Goal:** Rewrite `tradingEconomicsStream.ts` to use three free public RSS feeds (MarketWatch, Google News global economy, Google News financial markets) with sequential fallback, replacing the broken session-gated `stream.ashx` endpoint.

**Acceptance criteria:**
1. `tradingEconomicsStream.ts` no longer references `stream.ashx`
2. Three feed URLs defined as named constants (MarketWatch + two Google News queries)
3. Sequential fallback: feed 1 → feed 2 → feed 3 → []
4. All items tagged `source = 'tradingeconomics'`
5. Injectable `httpClient` parameter for test isolation
6. Rate limiter uses host key `"tradingeconomics-rss"`
7. `bun test src/__tests__/1191-te-stream-rss.test.ts` — all pass
8. `bun tsc --noEmit` — 0 errors

**Test file:** `src/__tests__/1191-te-stream-rss.test.ts`
**Branch:** `task/1191-te-stream-rss`
