# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 073 — (Backlog)

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1185 | Investigate baodautu.vn RSS parsing (HTTP 200, 0 items) | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 0 Review.

---

## Task Details (active tasks only — Done tasks archived)

### 1185 — Investigate baodautu.vn RSS parsing (HTTP 200, 0 items)

**Status:** Backlog | **Layer:** infrastructure
**Context:** `fetch-vn-news.sh` on Vinahost VPS gets HTTP 200 from `baodautu.vn/dau-tu-tai-chinh.rss` but parses 0 items. All other 9 sources working. Investigate:
1. Fetch raw RSS content on VPS and inspect actual XML structure
2. Check if feed uses non-standard item element names (e.g. `<entry>` instead of `<item>`)
3. Check for encoding issues (charset declaration vs actual encoding)
4. Fix parser/grep pattern in `fetch-vn-news.sh` or flag the feed as permanently broken
**Done when:** baodautu.vn delivers items in the cycle OR is documented as permanently broken with confirmed reason
