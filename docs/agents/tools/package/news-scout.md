# Tool Package — News Scout

**Location:** `docs/agents/tools/package/news-scout.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-15

Invoke via gateway: call_tool(server="vn-market", tool="<name>", arguments={...}) — grammar SSOT: project CLAUDE.md § MCP Tools. Wrong: tool_name/input/vnmarket-mcp.

---

## Tools — News Scout

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "news-scout"` |

### News Fetching & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `fetch_and_analyze` | Fetch VN news from geo-blocked sources + analyze impact | `watchlist?: string[], keywords?: string[]` |
| `run_impact_chain` | Trace news impact through supply chain and related stocks | `newsText: string, includeWatchlist?: boolean` |
| `search_similar_context` | Find historical news with similar patterns/catalysts | `query: string, context: object, limit?: number` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_watchlist` | Current watchlist tickers and metadata | — |
| `get_agent_signals` | Recent inter-agent signals (last 24h) | `from_agent: string` (req in sender-history mode); `agent: string` (req in inbox mode) |
| `get_macro_snapshot` | Macro regime snapshot for 0b regime detection | `source?: string, regimeType?: string` |
| `get_market_sentiment_index` | Market-wide news sentiment z-score, EMA5, dispersion (P0 indicator) | — |

### US Monetary Chain
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_fed_liquidity_spread` | Compute EFFR-IORB spread (carry cost proxy) | — |
| `get_ism_subcomponents` | ISM Manufacturing PMI sub-components + regime signal | — |

### Inter-Agent Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `post_agent_signal` | Post signal to inter-agent bus | `from_agent: string, to_agent: string, signal_type: string, payload: object` |

### Evidence Pipeline (Prediction Engine)
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `record_evidence_fragment` | Record a directional evidence fragment (feeds nightly accumulator → `evidence_likelihood_ratios` → prediction claims) | `stock: string, evidence_type: string, direction: "bullish"\|"bearish"\|"neutral", magnitude: number (0-1), confidence: number (0-1), source_agent: string, ttl_days?: number (default 30)` |

**Wired in:** `docs/agents/news-scout/flow/stage-sentiment.md` § Evidence Fragment Recording — emits `news_sentiment_stock` (per watchlist ticker) and `news_sentiment_macro` (`stock="MARKET"`). Both are the ACTUAL seeded `evidence_type` strings in `evidence_likelihood_ratios` (TASK-EVIDENCE-HOP2-AGENTS FR-2.1, live-verified — do not invent new type names). Full param reference: `docs/agents/tools/list/record_evidence_fragment.md`.

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle lifecycle — **two-call pattern required** (see recipe below) | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

Lifecycle recipe (2 calls, id round-trip) → `docs/agents/tools/list/log_agent_work.md`

---

## Signal Types Emitted

| Signal Type | To Agent | When | Confidence | Required `finding_data` Fields |
|-------------|----------|------|------------|------|
| `urgent_news` | alert-commander | Breaking news, impact >= 8 | 0.75+ | `headline` (string), `source` (string), `severity` (low\|medium\|high\|critical) |
| `chain_catalyst` | all | Watchlist impact >= 7, multi-agent trigger | 0.80+ | `event_type`, `direction`, `confidence`, `affected_stocks[]`, `affected_sectors[]`, `headline`, `source` |
| `price_confirmation` | market-watcher | Price move validates catalyst | 0.85+ | `price_change_pct`, `volume_ratio`, `confirms_direction`, `fully_priced`, `confidence` |
| `cross_validate` | analyst | Multi-source validation | 0.70+ | `direction` (bullish\|bearish\|neutral), `confidence`, `summary` |

**Important:** All required fields in `finding_data` must be present. Missing any required field will cause validation rejection with detailed error message.

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ✅ | News findings, impact analysis |
| **work** | ✅ | Cycle completion |
| **bug** | ✅ | Errors only |

---

Per-tool params + worked example → `docs/agents/tools/list/<tool_name>.md` (lazy-load only when calling an unfamiliar tool)

---

## Task-Lock Coordination Tools (Phase 2 Ready)

Tool ready — flow-level claim/heartbeat wiring lands in Phase 2/3 (not yet active in cycle.md).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim a coordination lock before exclusive work | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew a held lock every 5 min (prove-alive) | `task_id` |
| `task_release` | Release lock on completion | `task_id` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Signal Types:** `docs/standards/mcp-tools.md` → "Inter-Agent Signal Types"
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
