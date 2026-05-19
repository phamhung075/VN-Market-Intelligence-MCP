# QA Report — Sprint 1951b Tool Packages

```
date: 2026-05-19
sprint: 1951b
commit: 80768093
files: 13
outcome: CHANGES_REQUESTED
round: 1
```

## [QA] Review Record

### Pipeline

- bun test / tsc: SKIP (Smart-Skip — Markdown + JSON only, zero TypeScript changed)
- DDD scan: SKIP (no source code)
- Security scan: SKIP (no source code)
- Commit file count: 13/13 verified in git show

---

## Part A — Tool Packages

### A1: market-analyst.md — 7 tools present

| Tool | server | args | example | failure modes |
|------|--------|------|---------|---------------|
| `get_macro_snapshot` | vn-market | none | PASS | PASS |
| `fetch_and_analyze` | vn-market | tickers[], limit | PASS | PASS |
| `run_impact_chain` | vn-market | event_id, tickers[] | PASS | PASS |
| `get_alerts` | vn-market | minutes_back, severity | PASS | PASS |
| `get_bctc_full` | vn-market | code, quarters | PASS | PASS |
| `get_financial_summary` | vn-market | code | PASS | PASS |
| `get_sector_comparison` | vn-market | code | PASS | PASS |

Result: PASS — all 7 tools present with server, args, example, failure modes.

### A2: anti-hallucination/SKILL.md — Rule 6

- Rule 6 block present: PASS
- Anti-discovery hard-fail: PASS (`Anti-discovery violation = hard-fail immediately. No retry.`)
- Forbidden targets listed: PASS
  - `docs/tasks/TASKS.md` — PRESENT (see BLOCK-1 below re path)
  - `docs/handoffs/` — PRESENT
  - `.claude/agents/*.md` — PRESENT
  - `.claude/flows/*.md` — PRESENT
  - `docs/data/system-map.json` — PRESENT
  - `docs/data/schedule.json` — PRESENT
- Permitted targets: PASS (`docs/agent-memory/notebooks/<own-id>.md` + `docs/signals/<signal-file>.json`)

### A3: tran-ngoc-bau.md — Anti-discovery clause

- Anti-discovery line L7: `Even with full access, NEVER call list_servers / search_tools / list_server_tools.`
- PASS

### A4: system-map.json — mcp_server_name

- `jq '.. | objects | select(has("mcp_server_name"))' docs/data/system-map.json` → `{ "id": "mcp-server", "mcp_server_name": "vn-market" }`
- PASS (field exists under correct microservice entry)
- NOTE: Path `.services."mcp-server".mcp_server_name` returns null — field is nested differently. Functional test passes; brief jq expression needs adjustment.

---

## Part B — Notebook-Write Capability (8 agents)

| Agent | Write in tools | Edit in tools | Scope restriction in description |
|-------|----------------|---------------|----------------------------------|
| alert-commander | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/alert-commander.md...") |
| news-scout | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/news-scout.md...") |
| market-watcher | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/market-watcher.md...") |
| financial-analyst | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/financial-analyst.md...") |
| digest-predict | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/digest-predict.md...") |
| unified-agent | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/unified-agent.md...") |
| report-analyzer | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/report-analyzer.md...") |
| qa-responder | PASS | PASS | PASS ("Writes only to docs/agent-memory/notebooks/qa-responder.md...") |

Part B: ALL PASS

---

## Part C — market-watcher drift fix

- `.claude/flows/market-watcher/cycle.md` Step 5: `Write (full overwrite)` — PASS
- APPEND-ONLY language: ABSENT — PASS
- References `skill: .claude/skills/notebook-write/SKILL.md` — PASS

Part C: PASS

---

## Part D — Open Questions

### OQ-1: get_financial_summary existence

- No `.claude/tools/list/get_financial_summary.md` file exists
- Referenced in `.claude/tools/list/financial-reports.md:309` as "(legacy)"
- No standalone tool definition file
- Verdict: PHANTOM TOOL — documented in market-analyst.md package but has no tool definition file in `.claude/tools/list/`. See BLOCK-2.

### OQ-2: macro_* naming convention

- `.claude/tools/list/` contains: `macro_calibration.md`, `macro_carry.md`, `macro_dinhGia.md`, `macro_evidence.md`, `macro_imfSignals.md`, `macro_policy.md`, `macro_prediction.md`, `macro_rateLimit.md`
- market-analyst.md does NOT list any `macro_*` tools — it lists `get_macro_snapshot` instead
- `get_macro_snapshot` has no tool definition file in `.claude/tools/list/` (ABSENT)
- `get_macro_snapshot` is referenced in other tool docs as a real tool that was superseded by `get_market_context` (see `market-data_marketContext.md:80`)
- Verdict: `get_macro_snapshot` appears to be a real historical tool, but no standalone `.md` in tools/list. See BLOCK-3.

---

## Blocking Issues

### BLOCK-1: anti-hallucination/SKILL.md:70 — Wrong TASKS.md path

**File:** `.claude/skills/anti-hallucination/SKILL.md:70`
**Issue:** Forbidden target listed as `docs/tasks/TASKS.md`. Actual file lives at `docs/TASKS.md`. Path `docs/tasks/` does not exist on disk. An agent reading this rule literally could write to `docs/TASKS.md` believing it is not forbidden (wrong path does not match real file).
**Fix:** Change `docs/tasks/TASKS.md` to `docs/TASKS.md`.

### BLOCK-2: get_financial_summary — phantom tool in market-analyst package

**File:** `.claude/tools/package/market-analyst.md:141`
**Issue:** `get_financial_summary` is documented with full example and return signature. No `.claude/tools/list/get_financial_summary.md` exists. Referenced only as "(legacy)" in `financial-reports.md:309` with no parameters or implementation. Market-analyst agents invoking this tool will get an MCP error.
**Required action:** Architect/developer must confirm whether tool exists on vn-market MCP server. If yes → create tool definition file. If no → remove from market-analyst package and document alternative (e.g. `get_bctc_full` covers the KPI data).

### BLOCK-3: get_macro_snapshot — no tool definition file

**File:** `.claude/tools/package/market-analyst.md:69`
**Issue:** `get_macro_snapshot` listed as primary macro tool. No `.claude/tools/list/get_macro_snapshot.md` exists. `market-data_marketContext.md:80` shows it was superseded by `get_market_context` (compound tool that replaces `get_watchlist + get_market_snapshot + get_macro_snapshot + get_alerts + get_analysis_history`). Market-analyst package may be directing agents to a deprecated/removed tool instead of `get_market_context`.
**Required action:** Architect/developer must confirm: (a) does `get_macro_snapshot` still exist on vn-market server? If yes → add tool definition file. If no → replace with `get_market_context` in market-analyst package.

---

## Non-Blocking

- NB-1: `docs/data/system-map.json` `mcp_server_name` field is nested inside microservice entry, not at `.services."mcp-server"` path. Brief jq query path is wrong but field exists — functional impact zero.
- NB-2: `get_bctc_full` has no standalone `.claude/tools/list/get_bctc_full.md` but is fully documented in `financial-reports.md` and referenced throughout. Treat as documented compound tool — non-blocking.

---

## Verdict: CHANGES_REQUESTED

3 blocking issues. BLOCK-2 and BLOCK-3 require architect confirmation before fixer can act (phantom vs deprecated tool determination). BLOCK-1 is a trivial path fix.
