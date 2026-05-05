# VN Market Intelligence MCP

MCP server (TypeScript/Bun) — real-time VN stock intelligence (HOSE/HNX/UPCOM).

---

## Prerequisites — Must Be True Before Any Agent Runs

### 1. Pipeline Resume — Check `docs/pipeline-state.json`

- If `status == "in_progress"` AND `nextAgent` present AND `updatedAt < 24h` → spawn `nextAgent` immediately. No user prompt.
- If `status == "in_progress"` AND `updatedAt >= 24h` → stale crash, reset to `"idle"`.
- If `"idle"` or missing → fall through to session gate.

**Session Gate:** PO cannot self-initiate if TASKS.md empty AND no Telegram reports. Ask user for goal.

### 2. BCTC Pipeline Must Be Operational for Financial Analysis

Before any agent analyzes financial data (BCTC quarterly reports), verify:

```
VPS (Vietnam — Vinahost)
  └─ downloads BCTC PDFs from geo-blocked VN sources
       └─ sends to MCP server
            └─ PDF → text extraction (pdf-parse + OCR)
                 └─ text available to agents via get_bctc_full() MCP tool
```

**Check health before spawning financial agents:**
- `ops` → `get_vps_service_health()` — VPS reachable and fetching
- `ops` → `list_stored_pdfs()` — PDFs present for target tickers
- If broken → spawn `ops` to fix VPS pipeline before analysis proceeds

---

## Switch — User Request → Agent

Spawn the matching agent. Never do the work yourself.

| Intent | Spawn |
|--------|-------|
| add / build / improve | `po` |
| bug / broken (infra) | `ops` |
| bug / broken (code) | `developer` |
| analyze stock / news | `market-analyst` |
| brainstorm / explore | `idea-forge` |
| sprint status | `pm` |
| system health / audit | `system-auditor` |
| DRY / hardcoded values | `code-janitor` |
| update cowork agents | `cowork-refactory-expert` |
| organize / cleanup | `claude-manager-helper` |

Agent defines who receives next. Full routing rules → `/dispatch`

---

## Agent Chaining Protocol

Full protocol → `.claude/knowledge/agent-chaining-protocol.md`

---

## Interdiction — Never Ask the User to Act

**Never ask the user to run commands, restart services, SSH to servers, or perform any technical action.** Always spawn the appropriate agent instead (`ops`, `developer`, `qa`, etc.). The user is configuration admin only — they set goals, they do not execute tasks. If an action requires capabilities beyond available MCP tools, spawn `ops` to exhaust all automated options first and report the precise blocker, not a request for the user to intervene.

---

## Lazy-Load — Memory & Tools on Demand

Load context only as needed: MEMORY.md index (not all 30+ memory files), agent-specific tool specs (not full 130+ catalog), agent docs (active rotation only). Full rules → `.claude/knowledge/lazy-load-protocol.md`. **Goal: keep working context under 100k tokens.**
