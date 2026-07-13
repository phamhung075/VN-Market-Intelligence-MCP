# Tool Package — QA Responder

**Location:** `docs/agents/tools/package/qa-responder.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-15

Invoke via gateway: call_tool(server="vn-market", tool="<name>", arguments={...}) — grammar SSOT: project CLAUDE.md § MCP Tools. Wrong: tool_name/input/vnmarket-mcp.

---

## Tools — QA Responder

### Bootstrap & Diagnostics
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch signals + market context + system status in parallel | `agent_name: "qa-responder"` |

### User Questions & Answers
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_pending_ask_questions` | Fetch pending questions from user ask-queue | — |
| `answer_ask_question` | Provide answer and send response | `question_id: string, answer: string, sources?: string[]` |

### Market Intelligence
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_market_context` | Market snapshot, trading window, VN-Index status | — |
| `get_market_snapshot` | Price, volume, sector sentiment, trading halt status | — |
| `get_watchlist` | Current watchlist tickers and metadata | — |

### Financial Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_kinhdich_reading` | Hexagram reading for specific stock | `code: string` (NOT `ticker`) |
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment trend | `code: string` (req, NOT `ticker`) |
| `get_insider_transactions` | Detailed insider transaction history | — |

### Macro & Prediction
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_macro_snapshot` | Macro environment (rates, FX, credit, inflation) | — |
| `get_prediction_markets` | Market-wide prediction accuracy by signal type | — |

### Risk & Analysis
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_crisis_early_warning` | Crisis velocity, mention spikes, severity trends | — |

### QA-Specific Tools
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `run_qa_responder` | Execute QA responder cycle (process pending questions) | — |

### Logging & Feedback
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `log_agent_work` | Log cycle lifecycle — **two-call pattern required** (see recipe below) | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "market" \| "work" \| "bug"` |
| `submit_feedback` | Submit feature request or bug report | `severity: "critical" \| "high" \| "medium" \| "low", title: string` |

Lifecycle recipe (2 calls, id round-trip) → `docs/agents/tools/list/log_agent_work.md`

---

## Question Categories

QA Responder handles user questions about:

- **Stock Analysis:** BCTC, insider activity, technical patterns
- **Portfolio:** Holdings, risk, rebalancing recommendations
- **Market:** Sector rotation, macro conditions, trading halts
- **Predictions:** Forecast outlook, confidence levels
- **System:** Tool availability, data freshness, alert accuracy

---

## Channel Permissions

| Channel | Write | Rules |
|---------|-------|-------|
| **market** | ❌ | Not used |
| **work** | ✅ | Cycle completion, response summaries |
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
| `task_list_held` | List held locks for debug/audit | `kind?, owner_agent?, expired?` |

Full protocol: `docs/protocols/task-lock-protocol.md` | Skill: `.claude/skills/task-lock/SKILL.md`

---

## Related Documentation

- **All Tools Index:** `docs/agents/tools/list/README.md`
- **Ask Queue Protocol:** `docs/protocols/ask-queue-protocol.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
