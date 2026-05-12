> Parent: [guide-lazy-load.md](./guide-lazy-load.md)

# Lazy-Load Levels & Budget Rules

**Core principle: every token loaded must earn its keep. If data is already in context, never re-fetch it.**

---

## L0-L4: Load Levels

```
L0  IDENTITY     <- always loaded (agent definition YAML frontmatter only)
     | start
L1  NOTEBOOK     <- loaded at step 0b (< 50 lines, fast context recovery)
     | if cowork
L1b BOOTSTRAP    <- loaded at step 0 (market context via MCP -- THE PRIMARY CACHE)
     | work begins
L2  KNOWLEDGE    <- loaded on demand per step (triggered by lazy_load rules)
     | if cross-agent decision needed
L3  CROSS-TEAM   <- loaded on demand (other agent's notebook, max 2 per cycle)
     | if debugging/investigation
L4  SESSION LOGS <- loaded on demand (own or other agent's historical logs)
```

---

## Token Budget per Level

| Level | What | Token cost | When | Budget rule |
|-------|------|-----------|------|-------------|
| **L0** | YAML frontmatter | ~200 tok | Always | Fixed |
| **L1** | Notebook | ~300 tok | Step 0b | Fixed, max 50 lines |
| **L1b** | Bootstrap MCP | ~3,000-5,000 tok | Step 0 | Fixed, 1 call replaces 3 |
| **L2** | Knowledge file | ~200-800 tok | On demand | Max 3 files/cycle |
| **L3** | Other notebook | ~150 tok | On demand | Max 2/cycle |
| **L4** | Session logs | ~100-500 tok | Investigation | Max 1/cycle |

**Typical cowork cycle:** ~4,000-7,000 tok for context (excluding tool results).

---

## Anti-Pattern 1: Redundant Re-Fetch

Bootstrap already contains: market context, agent signals, macro snapshot, system health.

| Tool | Already in bootstrap? | If you call it again... |
|------|----------------------|------------------------|
| `get_market_context()` | YES | ~3,000 tok wasted/cycle |
| `get_agent_signals()` | YES | ~2,000 tok wasted/cycle |
| `get_macro_snapshot()` | YES | ~500 tok wasted/cycle |
| `get_system_health()` | YES | ~300 tok wasted/cycle |

**Rule:** Before calling ANY tool, ask: "Is this data already in my bootstrap context?"
