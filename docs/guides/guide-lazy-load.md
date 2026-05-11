**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 4. Lazy-Load Protocol

Agents start with minimum context. Load more only when the current step requires it.
**Core principle: every token loaded must earn its keep. If data is already in context, never re-fetch it.**

### 4.1 Load Levels

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

### 4.2 Token Budget per Level

| Level | What | Token cost | When | Budget rule |
|-------|------|-----------|------|-------------|
| **L0** | YAML frontmatter from `.claude/agents/<id>.md` | ~200 tok | Always (auto by harness) | Fixed |
| **L1** | `docs/agent-memory/notebooks/<id>.md` | ~300 tok | Step 0b (every cycle) | Fixed, max 50 lines |
| **L1b** | Bootstrap MCP response | ~3,000-5,000 tok | Step 0 (cowork only) | Fixed, 1 call replaces 3 |
| **L2** | `docs/<bucket>/<file>.md` (one at a time) | ~200-800 tok each | When step triggers `lazy_load` | Max 3 files/cycle |
| **L3** | Other agent's notebook (Current state + Lessons only) | ~150 tok each | When decision involves another domain | Max 2/cycle |
| **L4** | `docs/agent-memory/notebooks/<id>.md` (git log) | ~100-500 tok | Only when investigating a past event | Max 1/cycle |

**Typical cowork cycle budget:** ~4,000-7,000 tok for context (excluding tool call results).

### 4.3 The Three Anti-Patterns

#### Anti-Pattern 1: Redundant Re-Fetch (biggest waste)

Bootstrap already contains: market context, agent signals, macro snapshot, system health.
**NEVER call these tools separately if bootstrap already ran:**

| Tool | Already in bootstrap? | If you call it again... |
|------|----------------------|------------------------|
| `get_market_context()` | YES -- in `market_context` | ~3,000 tok wasted/cycle |
| `get_agent_signals()` | YES -- in `agent_signals` | ~2,000 tok wasted/cycle |
| `get_macro_snapshot()` | YES -- in `market_context` | ~500 tok wasted/cycle |
| `get_system_health()` | YES -- in `system_status` | ~300 tok wasted/cycle |

**Rule: Before calling ANY tool, ask: "Is this data already in my bootstrap context?"**

```
WRONG:  Step 0: bootstrap() -> Step 3: get_market_context(hours_back=6)  <- REDUNDANT
RIGHT:  Step 0: bootstrap() -> Step 3: extract from bootstrap context    <- FREE
```

#### Anti-Pattern 2: always_load Waste

`always_load` files are loaded EVERY cycle, even if no step uses them.
**Audit rule: every file in `always_load` must be referenced by >=1 flow step.**

```yaml
# WRONG -- market-watcher always loads alert-policy but never fires alerts
always_load:
  - path: docs/policies/alert-policy.md    # <- WASTE: 800 tok x 96 cycles/day = 76,800 tok/day

# RIGHT -- only load what your flow actually uses
always_load:
  - path: docs/protocols/fail-loud-protocol.md   # <- Used by error boundary (every cycle)
lazy_load:
  - path: docs/policies/alert-policy.md          # <- Only if this agent fires alerts
    trigger: alert_decision
```

**Validation: for each `always_load` entry, grep your flow file for a step that needs it. No match = move to `lazy_load` or remove.**

#### Anti-Pattern 3: N+1 File Reads

Loading 5 knowledge files sequentially = 5 Read operations = 5 context switches.
Use **bundles** to batch into 1 read.

```
WRONG (N+1):  Read fail-loud -> Read mcp-tools -> Read alert-policy -> Read portfolio-schema -> Read dev-standards
              5 reads x ~400 tok avg = 2,000 tok + 5 context switches

RIGHT (batch): Read bundle-<agent-id>.md
               1 read x ~1,200 tok = 1,200 tok + 1 context switch (40% savings)
```

### 4.4 Bootstrap-First Principle (Cowork Agents)

Bootstrap is the richest single data source (~3,000-5,000 tok). It contains:

```
bootstrap response
├── agent_signals[]     -> last 24h inter-agent signals (replaces get_agent_signals)
├── market_context      -> watchlist, prices, macro snapshot (replaces get_market_context)
│   ├── macro snapshot  -> regime, FX, commodities (replaces get_macro_snapshot)
│   └── recent alerts   -> what was already fired (replaces get_recent_alerts)
└── system_status       -> DB health, source status (replaces get_system_health)
```

**Extraction protocol (step 0, zero extra tool calls):**

```
From bootstrap, extract and cache in working memory:
1. REGIME = parse "Global Liquidity: X" -> TIGHTENING|EASING|NEUTRAL
2. CARRY  = parse "VND Carry Spread" -> HOT_MONEY_INFLOW|NEUTRAL|FII_OUTFLOW_RISK
3. SIGNALS_PENDING = filter agent_signals where to_agent=me AND status=pending
4. SYSTEM_HEALTHY = all sources in system_status show healthy=true
```

These 4 values are reused across ALL subsequent steps. Never re-fetch.

### 4.5 Cache-TTL for Slow-Changing Data

Some data doesn't change every cycle. Don't re-fetch what hasn't changed.

| Data | Change frequency | Cache in | TTL |
|------|-----------------|----------|-----|
| Sector rotation | ~4h | Notebook lesson | 4h (skip if last read < 4h ago) |
| BCTC deadlines | Monthly | Agent definition YAML | Until next quarter |
| Glossary terms | Never | `docs/{policies,protocols,standards,references}/` | infinity (never lazy-load at startup) |
| Watch thresholds | Per regime change | Agent definition YAML | Until regime changes |
| Macro snapshot | ~1h | Bootstrap | 1 cycle (always fresh from bootstrap) |
| Price data | ~15min | Tool call result | 1 cycle (always fresh) |

**Notebook as persistent cache:** If you extracted a fact last cycle and it changes slowly, write it as a LESSON. Next cycle, read from notebook (0 tok) instead of re-fetching (500+ tok).

```
# In notebook:
LESSON: sector-rotation 2026-05-07 08:00 -- financials overweight, real-estate underweight -> valid 4h
  -> next refresh: after 12:00 UTC

# In flow step:
IF notebook has sector-rotation lesson AND lesson.timestamp < 4h old
  -> USE notebook value (0 tok)
ELSE
  -> CALL get_sector_rotation() (500 tok)
```

### 4.6 Lazy-Load Triggers in Agent Definition

```yaml
knowledge:
  always_load:                              # Loaded with identity -- MUST be used every cycle
    - path: docs/protocols/fail-loud-protocol.md
      fail_loud: true
  lazy_load:                                # Loaded when step needs it
    - path: docs/standards/mcp-tools.md
      trigger: mcp_tool_call               # Load when first MCP tool is needed
      fail_loud: true
    - path: docs/references/kinh-dich-layer.md
      trigger: hexagram_signal             # Load only if hexagram data appears
      fail_loud: false
    - path: docs/policies/alert-policy.md
      trigger: alert_decision              # Load when about to fire/suppress alert
      fail_loud: true
```

### 4.7 Lazy-Load Decision Rule (Enhanced)

Before loading any file or calling any tool, the agent asks:

```
1. Is this data already in my BOOTSTRAP context?
   YES -> extract from bootstrap (0 extra tokens)
   NO  -> continue

2. Is this fact already in my NOTEBOOK (lesson or cross-team note)?
   YES -> use notebook value (0 extra tokens) -- check if TTL still valid
   NO  -> continue

3. Do I need this for the CURRENT step (not a future step)?
   NO  -> skip (load later if needed)
   YES -> continue

4. Can I load just the SECTION I need, not the whole file?
   YES -> read with offset/limit (save 50-70% tokens)
   NO  -> load full file

5. Will I need this same data in my NEXT cycle?
   YES -> extract key fact -> write as LESSON in notebook (cache for next time)
   NO  -> use and discard
```

### 4.8 Pre-bundled Knowledge (`docs/references/bundles/`)

For agents that always need the same set of knowledge files, bundles avoid N+1 reads:

```
docs/references/bundles/bundle-<agent-id>.md
```

A bundle = one file that concatenates essential sections from multiple knowledge files. Maintained by `claude-manager-helper`. Agent loads 1 file instead of 5.

**Bundle creation rule:** If an agent's flow references >=3 knowledge files in `always_load` or early `lazy_load`, create a bundle.

### 4.9 Token Economy Summary

```
                    WASTEFUL PATTERN              ->  ECO PATTERN                    SAVINGS
-----------------------------------------------------------------------------------------------
Re-fetch bootstrap data via tool call             ->  Extract from bootstrap context   ~95%
always_load unused knowledge files                ->  Move to lazy_load with trigger   100%
Sequential N+1 knowledge reads                    ->  Single bundle read               ~40%
Re-analyze same data every cycle                  ->  Notebook lesson (cached fact)     ~90%
Call slow-changing API every 15min                ->  Cache-TTL in notebook             ~75%
Read full file when 1 section needed              ->  Read with offset/limit           ~60%
Load 2+ notebooks "just in case"                  ->  Load only when step needs it     ~100%
-----------------------------------------------------------------------------------------------
Typical savings for a well-optimized agent:        ~500K tokens/day across all cycles
```
