> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 1: Fetch News + Historical Context

**1. Fetch news**

```
call_tool(server="vn-market", tool="fetch_and_analyze", arguments={"sources": ["cafef", "vnexpress", "vneconomy"], "limit": 20})
```

Returns: `fetched_articles[]`, `impact_by_ticker`, `alerts[]`
Filter duplicates → extract title/source/published_date/content.

**1a. Fetch news — dedicated international slice (NEW)**

```
call_tool(server="vn-market", tool="fetch_and_analyze", arguments={"sources": ["reuters"], "limit": 10})
```

Rationale: Reuters previously competed for a slice of the shared 20-item domestic-weighted pool and was diluted to ~0 effective items across 12 sampled cycles (2026-07-18→07-20, the drop window). A dedicated call guarantees up to 10 international items per cycle, independent of domestic volume — at zero cost to the domestic pool (cafef/vnexpress/vneconomy keep the full 20-item budget, no longer sharing with reuters).
Non-fatal: if this call errors or returns empty (network/feed unavailable — see LANE C R8 in `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md`), log and continue. Do not block Stage 1 on it.
Merge `fetched_articles[]` from both calls before Stage 2 (sentiment). Cross-call duplicates are already handled server-side (`INSERT OR IGNORE` on `source_url + published_at`).

**1b. Historical context** — call once per high-impact item (impactScore ≥ 6):

```
call_tool(server="vn-market", tool="search_similar_context", arguments={
  "query": "<article title or main theme>",
  "limit": 3
})
```

- If results returned: prepend to analysis context — "N similar past events: <title> (<date>), ..."
- If no results (LanceDB empty): skip, continue without historical context
- Non-fatal: if tool errors, log and continue
