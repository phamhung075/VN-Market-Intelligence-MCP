> Parent: [guide-agent-ops.md](./guide-agent-ops.md)

# Notebook & Cross-Team Awareness (Sections 7-8)

---

## Section 7: Notebook — The Agent's Brain

The notebook = **fast-loading personal memory**. Replaces expensive re-analysis with pre-digested 1-line lessons. Like a senior employee's cheat sheet.

### Design Principles

| Principle | Why |
|-----------|-----|
| **Index, not dump** | Each lesson links to where full detail lives |
| **1 line = 1 lesson** | Loading 10 lines costs less than re-analyzing 200 lines of logs |
| **Overwrite, never append** | Fresh notebook every cycle — stale lessons waste tokens |
| **Read others, edit yours** | Cross-team awareness without zone violations |
| **Max 50 lines** | If over -> prune oldest unused lessons |

### Enhanced Notebook Format (Recommended)

```markdown
# <Agent Name> — Notebook

**Last updated:** YYYY-MM-DD HH:MM UTC | **Sprint:** NNNN

## Current state
<1-2 lines: operational status, blockers>

## Last session summary
- <What was done — 1 line>
- <Key finding — 1 line>
- <Outcome — 1 line>

## Lessons learned
One line per lesson. Format: `LESSON: <context> — <fact> -> <action>`
Each lesson links to where the detail lives.

- LESSON: get_technical_indicators — returns empty for IPO < 30 days -> skip, don't retry
  -> detail: docs/agent-memory/notebooks/market-watcher.md @ Cycle 2026-05-07
- LESSON: VPS proxy timeout at 08:30 UTC = market close surge -> retry after 60s
  -> detail: docs/agent-memory/notebooks/news-scout.md @ Cycle 2026-05-06

## Cross-team notes
Facts from other agents' notebooks. Refresh when stale (>3 days).

- [alert-commander] max 10 alerts/day — batch low-priority signals (read 2026-05-07)
- [financial-analyst] BCTC Q1 deadline 04-30 — expect report surge (read 2026-05-05)

## Known patterns
- <Recurring pattern in this domain>
```

### Lesson Categories

| Category | Trigger | Example |
|----------|---------|---------|
| **Tool behavior** | Unexpected result | `get_prices null on weekend -> check is_trading_day` |
| **Data location** | Found data somewhere unexpected | `FX rates in macro_snapshot, not separate tool` |
| **Token waste** | Dead-end analysis | `skip penny stocks < 1000 VND — no coverage` |
| **Cross-agent** | Signal useful/missing | `market-watcher price_anomaly includes volume` |
| **Workaround** | Known issue bypass | `pdf-extractor timeout -> batch 5 pages` |

**Do NOT save:** raw tool outputs, temporary debug info, one-time fixes already in code.

### Token Economy of Knowledge

```
Raw data (expensive)     -> Tool calls, full API responses       200+ tok/call
         | extract lessons
Notebook (cheap)         -> 1-line lessons, < 50 lines           ~300 tok total
         | share via read
Cross-team (near-free)   -> Read 2-10 lines from other notebook  ~150 tok each
```

---

## Section 8: Cross-Team Awareness

Agents read teammates' notebooks to make better decisions. Like colleagues checking the team board before standup.

### When to Read Other Notebooks

| Situation | Read whose | Why |
|-----------|-----------|-----|
| Before posting signal | Target agent's | Know their state and capacity |
| Decision in another domain | Domain expert's | Avoid contradicting findings |
| After receiving signal | Sender's | Understand signal context |
| Start of cycle (optional) | `memory.reads_notebooks` list | Refresh cross-team awareness |

### Rules

- **Read only** — NEVER edit another agent's files
- **Scan, don't study** — `Current state` + `Lessons learned` only (2-10 lines)
- **Max 2 notebooks per cycle** — more = diminishing returns
- **Cache in your notebook** — write to `## Cross-team notes` so you don't re-read next cycle
- **Stale = re-read** — if a cross-team note is >3 days old, re-read source
