# PO Notebook

**Cycle:** news-fetch live-data inspection view — follow-on enhancement DISPATCHED.
**Last update:** 2026-05-24T17:05:33Z
**Status:** Spec'd + routed architect→developer→qa→PO. NOT a pilot reopen (pilot stays DONE 12/12, frozen).

---

## 2026-05-24T17:05Z — news-fetch live-data view: scoped + dispatched to architect

### User want: show actual fetched article rows per source from DB on the news-fetch dashboard ("see live data, is result correct or not").

### Step 0 channel audit: MCP gateway NOT reachable from this spawned agent session (list_servers/search_tools/call_tool all "No such tool"). Per fail-loud anti-hallucination + my pdf-extractor precedent, did NOT fabricate channel content. Substituted with local signal-bus + git review: no open news-fetch bugs (only benign context-bloat janitor signals + closed pilot signals). Proceeded.

### KEY FINDING that shaped the whole spec:
- news-fetch (port 5008) is STATELESS — NO DB, src/domain/repositories.ts has scraper ports ONLY.
- Persisted rows live in mcp-server `rag_analyses` (schema-news.ts). Path verified end-to-end:
  news-fetch -> newsHeadlinesRefreshJob -> /api/push-news (x-api-key) -> pushNewsHandler -> pollNews INSERT OR IGNORE INTO rag_analyses.
- So the live view CANNOT be on news-fetch (would need to give the stateless scraper DB creds = design + Security-Clause regression). MUST be a read-only endpoint on mcp-server (port 3000 /api/*). Precedent: G5 allowed exactly ONE mcp-server task for the HTTP boundary.

### Product decisions (PO): sources reuters+bloomberg; fields source/headline(source_title)/url(source_url)/published_at/verdict(sentiment+impact)/fetched_at(created_at); dedup-key NOT stored -> architect surfaces derived OR omits, no fabrication; N=20 per source ORDER BY created_at DESC; LIVE SELECT-only query each load, no cache, read-only.

### Security Clause carried verbatim: sandbox process + 3 existing sandbox panels (data.js, file:// zero-CORS) stay zero-creds + UNTOUCHED (G6/G8/G9 frozen). Live section = separate panel, http-fetch mcp-server only, honest-degrade under file:// (never fake rows).

### Outputs (uncommitted at write time -> commit this cycle, no push):
- docs/TASKS.md — new "Follow-On Enhancement" block: NF-LD-1 architect READY, NF-LD-2 dev BLOCKED, NF-LD-3 qa BLOCKED, NF-LD-EXIT po gate.
- docs/handoffs/TASK_NF-LD.md — full findings + product shape + per-task ACs + constraints.
- docs/signals/po-news-fetch-livedata-20260524T170518Z.json — dispatch to architect.

## Carry-over
- NEXT: main terminal spawns architect to run NF-LD-1 (design endpoint + live section). Then developer NF-LD-2, qa NF-LD-3, PO NF-LD-EXIT.
- HARD: never touch sandbox runner/data.js/3 sandbox panels; never touch pilot-status-news-fetch.json (frozen 12/12); endpoint SELECT-only on mcp-server.
- pdf-extractor pilot DONE (prior cycle). BCTC VPS staleness B-08/1972 stays OPEN as INFRA-only (not a code freeze).
