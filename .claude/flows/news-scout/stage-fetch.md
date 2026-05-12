> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 1: Fetch News + Historical Context

**1. Fetch news**

```
call_tool(server="vn-market", tool="fetch_and_analyze", arguments={})
```

Returns: `fetched_articles[]`, `impact_by_ticker`, `alerts[]`
Filter duplicates → extract title/source/published_date/content.

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
