# VN Market Intelligence MCP

MCP server (TypeScript/Bun) — real-time VN stock intelligence (HOSE/HNX/UPCOM).

---

## Prerequisites — Must Be True Before Any Agent Runs

### 1. Pipeline Resume — Check Before Asking User

**Step 1 — Read `docs/pipeline-state.json`:**

- If the file exists AND `status == "in_progress"` AND `nextAgent` is present AND `updatedAt` is less than 24 hours ago → **immediately spawn `nextAgent` with `nextPrompt` as the full prompt. Do NOT ask the user anything. Do NOT check TASKS.md.**
- If the file exists AND `status == "in_progress"` AND `updatedAt` is more than 24 hours ago → treat as stale crash. Write `status: "idle"` to the file. Fall through to Step 2.
- If the file does not exist, OR `status == "idle"` → fall through to Step 2.

**Step 2 — User Session Gate (existing logic):**

PO cannot self-initiate if `docs/TASKS.md` is empty AND no Telegram reports exist.
In that case: **ask the user for a session goal** before spawning PO.

```
User provides: goal / priority / context
→ Main terminal passes to PO as session prompt
→ PO uses it to initiate sprint
```

If PO returns `PIPELINE: idle` (nothing to do) → stop, ask user what to work on next.

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

## Code Search — Semble First

Dev-team agents (`developer`, `architect`, `ba`, `fixer`, `code-janitor`, `system-auditor`) have both Semble and default tools available. **Prefer Semble for exploration; use Grep/Glob only for exhaustive or exact matching.** Full decision guide → `.claude/skills/semble-search/SKILL.md`

---

## Agent Chaining Protocol

Full protocol → `.claude/knowledge/agent-chaining-protocol.md`

---

## Interdiction — Never Ask the User to Act

**Never ask the user to run commands, restart services, SSH to servers, or perform any technical action.** Always spawn the appropriate agent instead (`ops`, `developer`, `qa`, etc.). The user is configuration admin only — they set goals, they do not execute tasks. If an action requires capabilities beyond available MCP tools, spawn `ops` to exhaust all automated options first and report the precise blocker, not a request for the user to intervene.
