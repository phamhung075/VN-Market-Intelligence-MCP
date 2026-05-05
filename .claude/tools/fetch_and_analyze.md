---
name: fetch_and_analyze
type: tool
package: news-analysis
related_tools: run_impact_chain, post_agent_signal
complexity: complex
---

# fetch_and_analyze

Fetch live news from RSS sources (CafeF, VnExpress, Reuters/AP News), normalize each item into structured AnalysisEntry, store in SQLite RAG memory and vector store, and return a formatted summary of market intelligence gathered. **Core data pipeline for news-to-signal transformation.**

## Arguments

- **sources** (array) — optional, default: ["cafef", "vnexpress", "reuters"]
  - Which RSS feeds to fetch. Options: "cafef" (local), "vnexpress" (local), "reuters" (global), "apnews" (global), "bloomberg" (premium, if available)

- **watchlist_only** (boolean) — optional, default: false
  - If true, filter results to only articles mentioning watchlist stocks. Reduces noise.

- **hours_back** (number) — optional, default: 24
  - How far back to fetch news (in hours). Typical: 24 for daily refresh, 1 for hourly updates.

- **min_relevance_score** (number) — optional, default: 0.3
  - Minimum relevance score (0-1) for storing in RAG. Lower = more articles stored; higher = only high-relevance kept.

## Return Type

```typescript
{
  success: boolean,
  articles_fetched: number,
  articles_stored: number,
  summary: {
    headlines: Array<{
      title: string,
      source: "cafef" | "vnexpress" | "reuters" | "apnews" | "bloomberg",
      stocks_mentioned: string[],
      sentiment: "bullish" | "bearish" | "neutral",
      relevance_score: number,
      published_at: string
    }>,
    top_stories: Array<{
      title: string,
      impact_estimate: number,
      affected_stocks: string[]
    }>,
    sentiment_summary: {
      overall: "bullish" | "bearish" | "mixed",
      bullish_articles: number,
      bearish_articles: number,
      neutral_articles: number
    },
    rag_insertion_count: number  // Articles stored to vector DB
  },
  sources_failed?: string[],  // RSS sources that failed to fetch
  timestamp: string
}
```

## Example Usage

### News Scout — Hourly News Cycle
```typescript
// Fetch news every hour (VN market hours)
const news = await call_tool("vn-market", "fetch_and_analyze", {
  sources: ["cafef", "vnexpress"],
  watchlist_only: false,
  hours_back: 1,  // Last hour only (avoids duplicates from prior cycles)
  min_relevance_score: 0.4
});

console.log(`Fetched: ${news.articles_fetched}, Stored: ${news.articles_stored}`);

// Process top stories
for (const story of news.summary.top_stories.slice(0, 5)) {
  console.log(`📰 ${story.title} (impact: ${story.impact_estimate.toFixed(2)})`);
  console.log(`   Affects: ${story.affected_stocks.join(", ")}`);

  // Run cascade analysis on high-impact stories
  if (story.impact_estimate > 7) {
    const cascade = await call_tool("vn-market", "run_impact_chain", {
      headline: story.title,
      event_type: "news",
      urgency: "immediate"
    });

    // Post signals from cascade
    for (const watchlist of cascade.impact_chain.watchlist_impact) {
      await call_tool("vn-market", "post_agent_signal", {
        agent: "financial-analyst",
        signal_type: "urgent_news",
        confidence: watchlist.conviction,
        data: {
          headline: story.title,
          stock: watchlist.stock_code,
          cascade_reasoning: cascade.impact_chain.macro_impact.description
        }
      });
    }
  }
}

// Check sentiment
console.log(`\nSentiment: ${news.summary.sentiment_summary.overall}`);
console.log(`  Bullish: ${news.summary.sentiment_summary.bullish_articles}`);
console.log(`  Bearish: ${news.summary.sentiment_summary.bearish_articles}`);
```

### News Scout — Daily Summary Feed
```typescript
// At day-end (16:00 UTC), fetch full day's news
const dailyNews = await call_tool("vn-market", "fetch_and_analyze", {
  sources: ["cafef", "vnexpress", "reuters"],
  watchlist_only: true,  // Only watchlist-relevant articles
  hours_back: 8,  // VN morning hours (2:00-10:00 UTC ≈ 9:00-17:00 Hanoi)
  min_relevance_score: 0.5
});

// Summarize for market briefing
const newsMsg = `
📰 **Today's Market News (${new Date().toISOString().split("T")[0]})**

Articles: ${dailyNews.articles_fetched} fetched, ${dailyNews.articles_stored} relevant

**Top Stories:**
${dailyNews.summary.top_stories.slice(0, 3)
  .map((story, i) => `${i + 1}. ${story.title}\n   Stocks: ${story.affected_stocks.join(", ")}`)
  .join("\n\n")}

**Sentiment:** ${dailyNews.summary.sentiment_summary.overall} (${dailyNews.summary.sentiment_summary.bullish_articles} bullish, ${dailyNews.summary.sentiment_summary.bearish_articles} bearish)

RAG articles stored: ${dailyNews.summary.rag_insertion_count}
`;

await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: newsMsg
});
```

### Global Macro Monitoring — Reuters + APNews
```typescript
// Monitor global macro news for VN impact
const globalNews = await call_tool("vn-market", "fetch_and_analyze", {
  sources: ["reuters", "apnews"],
  watchlist_only: false,  // Global headlines, not watchlist-specific
  hours_back: 24,
  min_relevance_score: 0.6  // Higher threshold for global noise filtering
});

// Filter to macro-relevant articles (oil, FX, Fed, etc.)
const macroKeywords = ["oil", "fed", "rate", "inflation", "usd", "china"];
const macroArticles = globalNews.summary.headlines.filter(h =>
  macroKeywords.some(kw => h.title.toLowerCase().includes(kw))
);

console.log(`Found ${macroArticles.length} macro-relevant articles`);

// Major macro news (Reuters) warrants cascade analysis
for (const article of macroArticles.slice(0, 3)) {
  const cascade = await call_tool("vn-market", "run_impact_chain", {
    headline: article.title,
    event_type: "macro",
    urgency: "immediate"
  });

  // Post macro cascade signal
  await call_tool("vn-market", "post_agent_signal", {
    agent: "market-watcher",
    signal_type: "chain_catalyst",
    confidence: Math.max(...cascade.impact_chain.sector_cascades.map(s => s.confidence)),
    data: {
      headline: article.title,
      macro_impact: cascade.impact_chain.macro_impact.direction,
      affected_sectors: cascade.impact_chain.sector_cascades.map(s => s.sector)
    }
  });
}
```

### RAG Integration — Searching Prior News
```typescript
// After storing news via fetch_and_analyze, other agents can search RAG
// (This is downstream use, but shows why storing is important)

const news = await call_tool("vn-market", "fetch_and_analyze", {
  sources: ["cafef", "vnexpress"],
  watchlist_only: false,
  hours_back: 24
});

// Later: Financial Analyst wants context on FPT's earnings miss
// It would call a RAG search tool (not shown here) to find:
// - Prior articles on FPT's guidance misses
// - Sector trends on software/IT services
// - Analyst predictions from earlier news
// All enabled by storing articles in vector DB via fetch_and_analyze
```

## When to Use

- **Hourly during market hours** — News Scout fetches fresh articles every hour
- **Daily summary** — End-of-day full news digest for MARKET channel
- **Global macro monitoring** — Reuters/APNews for FX, oil, Fed, geopolitical impacts
- **Incident response** — Refetch specific stocks when crisis breaks news
- **NOT real-time** — RSS feeds have 30-60 min lag; check hourly, not per-minute

## Related Tools

| Tool | Use Case |
|------|----------|
| `run_impact_chain` | Process fetched headlines through cascade engine |
| `post_agent_signal` | Post urgent_news signals from high-impact articles |
| `send_telegram` | Broadcast news summary to MARKET channel |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `sources_failed: ["cafef", "reuters"]` | RSS feeds unreachable | Log to WORK, retry with remaining sources |
| `articles_fetched: 0` | No articles found in window | Normal during off-hours; proceed |
| `rag_insertion_count: 0` | No articles met relevance threshold | Lower `min_relevance_score` next cycle |
| Duplicate articles | Same story published by multiple sources | RAG deduplication handles this (stored once) |

## Notes

- **Local vs. global:** CafeF/VnExpress = VN-focused; Reuters/APNews = global (good for macro context).
- **Relevance scoring:** Based on: keyword overlap with watchlist, article length, publication tier (Reuters > blogs), date recency.
- **RAG persistence:** Articles stored in SQLite + vector DB. Enables search and context retrieval for future cycles.
- **VN sources:** CafeF/VnExpress sometimes publish earnings/news before official VSD filings. Useful for early detection.
- **Lag:** RSS updates typically 30-60 min behind publish. Factor in when calculating urgency.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 3 workflow examples, RAG integration, macro monitoring)
