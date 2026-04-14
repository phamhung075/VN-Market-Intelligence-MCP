# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 074 — Backlog

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1188 | Fix rss.ts parser: add Atom `<entry>` support (Google News + baodautu.vn) | Dev | infrastructure | — | task/1188-rss-atom-support | Review | TECH_074 |
| 1185 | Investigate baodautu.vn RSS parsing (HTTP 200, 0 items) | Dev | infrastructure | 1188 | — | Backlog |

**WIP:** 0 In Progress.

---

## Task Details (active tasks only — Done tasks archived)

### 1188 — Fix rss.ts parser: add Atom `<entry>` support

**Status:** Backlog | **Layer:** infrastructure
**Context:** `parseRssFeed()` in `src/infrastructure/fetchers/rss.ts` only selects `$("item")`
(RSS 2.0). Google News RSS and baodautu.vn return Atom 1.0 feeds with `<entry>` elements and
`<link href="...">` attributes (not `<link>` text nodes). Result: HTTP 200 responses are parsed
as 0 items on every intelligence cycle, leaving `rag_analyses` empty and evening reports blank.
1. Extend `parseRssFeed` to union-select `$("item, entry")` and handle both RSS and Atom link formats
2. Add `url` extraction for Atom: prefer `<link rel="alternate" href>` then `<link href>` then `<id>`
3. Add `publishedAt` extraction for Atom: prefer `<published>` then `<updated>`
4. Add `content` extraction for Atom: prefer `<summary>` then `<content>`
5. Write unit tests with RSS 2.0 fixture and Atom 1.0 fixture (real-shape, not minimal)
6. Run full test suite — zero regressions
**Done when:** `parseRssFeed` returns >= 1 item on an Atom fixture; `fetchReuters` live smoke-test
returns >= 1 item; next evening report has topStories.length >= 3.

### 1185 — Investigate baodautu.vn RSS parsing (HTTP 200, 0 items)

**Status:** Backlog | **Layer:** infrastructure | **Depends on:** 1188
**Context:** `fetch-vn-news.sh` on Vinahost VPS gets HTTP 200 from `baodautu.vn/dau-tu-tai-chinh.rss`
but parses 0 items. Most likely resolved as a side-effect of task 1188 (Atom parser fix). If not,
investigate VPS-side grep pattern in `fetch-vn-news.sh`.
**Done when:** baodautu.vn delivers items in the cycle OR is documented as permanently broken.
