# Architecture Brief — Cowork Tool Packages (Sprint 1951b)

**Date:** 2026-05-19
**Author:** agents-architect
**Status:** READY FOR AGENT-FATHER
**Signal:** `docs/signals/agents-architect-1951b-tool-packages-brief.json`

---

## 1. Problem Statement

Cowork agents spawned by the master scheduler know tool names (e.g. `get_macro_snapshot`) but not the gateway invocation grammar: `mcp__claude_ai_gateway__call_tool({server, tool, arguments})`. The user's constraint: **no runtime discovery** — agents must never call `list_servers`, `search_tools`, or `list_server_tools`. Every tool must be pre-documented with the full call_tool recipe.

---

## 2. Current State — Package Coverage Inventory

| Agent | Flow pointer to package | Package exists | Package quality |
|---|---|---|---|
| news-scout | `**Tools:** .claude/tools/package/news-scout.md` | YES | Full — server + grammar + examples |
| market-watcher | `**Tools:** .claude/tools/package/market-watcher.md` | YES | Full |
| financial-analyst | `**Tools:** .claude/tools/package/financial-analyst.md` | YES | Full |
| alert-commander | `**Tools:** .claude/tools/package/alert-commander.md` | YES | Full |
| digest-predict | `**Tools:** .claude/tools/package/digest-predict.md` | YES | Full |
| unified-agent | `**Tools:** .claude/tools/package/unified-agent.md` | YES | Full |
| tran-ngoc-bau | `**Tools:** .claude/tools/package/tran-ngoc-bau.md` | YES | Full (FULL access declared — gap: no explicit anti-discovery clause) |
| report-analyzer | `**Tools:** .claude/tools/package/report-analyzer.md` | YES | Full |
| qa-responder | `**Tools:** .claude/tools/package/qa-responder.md` | YES | Full |
| ops | `**Tools:** .claude/tools/package/ops.md` | YES | Full |
| market-analyst | `**Tools:** .claude/tools/package/market-analyst.md` | YES | **INCOMPLETE** — only 2 MCP tools listed; flow calls `get_macro_snapshot`, `fetch_and_analyze`, `run_impact_chain`, `get_bctc_full`, `get_sector_comparison`, `get_alerts` — all missing from package |

**Summary:** 10/11 agents have a package file. 1 file (market-analyst) is severely incomplete — it was written as a backtest-only agent but the flow (`market-analyst/main.md`) uses the full TNB top-down methodology with 6+ tools absent from its package.

---

## 3. Tool Package Shape Decision — CHOSEN: Option A (existing pattern)

**Decision: Continue `.claude/tools/package/<agent>.md` — already deployed for 10/11 agents.**

Rationale:
- Waterfall lazy-load: flows already carry `**Tools:** .claude/tools/package/<agent>.md` as the first header line — loaded at cycle start, before any tool call.
- SSOT discipline: one file per agent, no duplication. Shared tools (`get_cycle_bootstrap`, `post_agent_signal`, `log_agent_work`, `send_telegram`) are duplicated by design — each agent's package is self-contained so it can be loaded in isolation.
- Token economy: packages are ≤200-350L each, loaded once, not re-read mid-cycle.
- No new pattern needed — agent-father only needs to fix market-analyst's package.

Option B (docs/references/) rejected: adds a second path agents must know; breaks the existing `**Tools:**` header contract.
Option C (inline) rejected: inflates flow files past 200L split threshold.

---

## 4. Gateway Grammar SSOT — What Must Be in Every Package

Each package already states the grammar. The canonical form (copy from any working package):

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

**Server name SSOT:** All 11 packages use `server="vn-market"` — this is correct and consistent. The value `"vn-market"` appears in every package's "How to Invoke" section. `docs/data/system-map.json` lists tools under `project.microservices[id=mcp-server]` but has no `mcp_server` field per tool — it is not the SSOT for server names. The SSOT is the `server:` field inside each package file itself.

**Recommendation:** Add `mcp_server_name: "vn-market"` as a top-level metadata field to `docs/data/system-map.json` under `project.microservices[id=mcp-server]` so it is machine-queryable. Tool packages then reference it as prose ("Server name: **`vn-market`** — see system-map.json"). No tool-by-tool `mcp_server` field needed — all tools live on the same server.

---

## 5. Package Contents Schema (required fields per tool entry)

Each tool in a package must document:

| Field | Description |
|---|---|
| `tool_name` | Exact name as passed to `call_tool(tool=...)` |
| `server` | `"vn-market"` (single server for all tools) |
| `purpose` | One-line description of what the tool returns |
| `arguments.required` | List of required params + types |
| `arguments.optional` | List of optional params + types |
| `example` | One concrete `call_tool(...)` invocation |
| `failure_modes` | What to do if tool returns error / empty / timeout |

**Current gap:** All 10 existing packages list tools with "Key Params" columns but do NOT document `failure_modes` per tool. They offload this to `cowork-error-boundary` (retry × 1, bug telegram, exit). That is sufficient for Phase 1 — per-tool failure modes are a Phase 2 enhancement.

---

## 6. Anti-Discovery Enforcement

**Proposed addition to `.claude/skills/anti-hallucination/SKILL.md`** (append to § Rules):

```
6. Tool calls limited to those in your package file (.claude/tools/package/<agent>.md).
   NEVER call list_servers / search_tools / list_server_tools at runtime.
   If a needed tool is not in your package → post_agent_signal(to="po", signal_type="bug-escalation",
   payload="Tool <name> missing from package — cannot proceed") → EXIT cycle.
```

This is a one-line behavioral rule + the BUG signal path. No flow file changes required — the skill is already referenced by all cowork flows via `cowork-error-boundary`.

---

## 7. Market-Analyst Package — Gap Detail

`market-analyst/main.md` calls these tools with no package documentation:

| Tool | Used in section | Missing from package |
|---|---|---|
| `get_macro_snapshot` | Top-Down Framework, Morning Routine | YES |
| `fetch_and_analyze` | News Event Analysis | YES |
| `run_impact_chain` | News Event Analysis | YES |
| `get_alerts` | Morning Routine | YES |
| `get_bctc_full` | Stock Financials | YES |
| `get_sector_comparison` | Sector Context | YES |
| `get_financial_summary` | Stock Financials | YES |
| `export_backtest_run_csv` | (listed in package) | documented |
| `compare_backtest_runs` | (listed in package) | documented |

The package was written for a backtest-only scope but the flow covers full TNB analysis. **The package needs a full rewrite** to match the flow's actual tool surface.

---

## 8. Tran-Ngoc-Bau — FULL Access Declaration

`tran-ngoc-bau.md` declares "FULL — all vn-market tools available." This is intentional (quality supervisor needs unrestricted re-check access). However it currently carries no anti-discovery clause. Add to the package:

```
Anti-discovery: Even with full access, NEVER call list_servers / search_tools / list_server_tools.
Use .claude/tools/list/INDEX.md to find tool names at design time only.
```

---

## 9. Migration Plan

### Phase 1 — Fix market-analyst package (no behavior change)
- Rewrite `.claude/tools/package/market-analyst.md` to add all 7 missing tools with full gateway grammar.
- Add `mcp_server_name: "vn-market"` to `docs/data/system-map.json` under the mcp-server microservice entry.
- Add anti-discovery clause to `tran-ngoc-bau` package.

### Phase 2 — Anti-hallucination skill update
- Append Rule 6 (anti-discovery enforcement) to `.claude/skills/anti-hallucination/SKILL.md`.
- All cowork flows already load this skill indirectly via `cowork-error-boundary`. No flow pointer changes needed.

### Phase 3 — QA validation (qa agent)
- For each of the 11 cowork agents: verify flow file has `**Tools:** .claude/tools/package/<agent>.md` header.
- For each tool called in the flow: verify it appears in the package file.
- Pass criterion: 100% tool coverage in packages, 0 calls to discovery tools.

---

## 10. Open Questions for Agent-Father

| OQ | Question | Impact |
|---|---|---|
| OQ-1 | `market-analyst/main.md` calls `get_financial_summary` — does this tool exist in vn-market? Not found in any other package. | If not, flow has a phantom call; qa must flag it. |
| OQ-2 | `tran-ngoc-bau` package lists `macro_calibration`, `macro_carry`, `macro_dinhGia`, etc. — these use a different naming convention (`macro_*`). Are they real tool names or aliases? | Server name stays `vn-market` either way, but tool names must match exactly. |
| OQ-3 | `cowork-error-boundary` says retry × 1 then exit. Should anti-discovery violation (calling `list_servers`) hard-fail immediately with no retry? Recommendation: yes — no retry on prohibited calls. | Needs a behavior note in the skill. |
| OQ-4 | The `market-analyst` flow pointer says `**Tools:** .claude/tools/package/market-analyst.md` — but the package only shows 2 tools. Did agents that loaded this package silently fall through to discovery? Confirm with session logs. | Risk: past cycles may have called undocumented tools. |

---

## 11. Files to Create / Edit (agent-father action list)

| Action | File | Notes |
|---|---|---|
| EDIT | `.claude/tools/package/market-analyst.md` | Add 7 missing tools with full gateway grammar |
| EDIT | `.claude/skills/anti-hallucination/SKILL.md` | Append Rule 6 (anti-discovery enforcement, 4 lines) |
| EDIT | `.claude/tools/package/tran-ngoc-bau.md` | Add anti-discovery clause (2 lines) |
| EDIT | `docs/data/system-map.json` | Add `"mcp_server_name": "vn-market"` to mcp-server microservice entry |
| VERIFY | All 11 packages: `**Tools:**` header present in flow | qa validates in Phase 3 |

---

## 12. Notebook Write Capability — Missing Write/Edit in 8 of 9 Cowork Agent Frontmatter

### 12a. Requirement Confirmed

`notebook-write` skill (`.claude/skills/notebook-write/SKILL.md`) explicitly mandates **`Write` tool — full overwrite** every cycle (not append). `cowork-end-cycle` calls this skill as Step 2 for all cowork agents. Verified in `market-watcher/cycle.md` Step 5 (notebook write) and the `End of cycle → cowork-end-cycle` terminal step. The agent itself executes the `Write` call — there is no router or dispatcher intermediary. Each agent writes its own notebook directly.

Sub-finding: `market-watcher/cycle.md` Step 5 says "APPEND ONLY — each cycle adds a new Cycle block" — this contradicts the canonical `notebook-write` skill (overwrite). This flow-level drift must be corrected as part of the frontmatter fix.

### 12b. Decision — Add Write + Edit to 8 agents

All 8 agents listed below must receive `Write` and `Edit` in their frontmatter `tools:` field. Scope must be documented in the agent description field as the minimal write surface.

**Forbidden write targets (explicitly document in each agent's description or a shared scope-guard note):**
- `docs/tasks/TASKS.md`, any `docs/handoffs/` file
- Any `.claude/agents/*.md` or `.claude/flows/*.md`
- Any `docs/data/system-map.json`, `docs/data/schedule.json`
- Any file outside `docs/agent-memory/notebooks/<own-id>.md` and `docs/signals/<signal-file>.json`

Telegram signal files (`docs/signals/`) are already covered by the signal-bus tool (`post_agent_signal` MCP call) — agents do NOT write those directly. So the only permitted `Write`/`Edit` target per agent is its own notebook.

### 12c. Agent-Father Action List

| Agent | File to edit | Frontmatter delta |
|---|---|---|
| alert-commander | `.claude/agents/alert-commander.md` | Add `Write`, `Edit` to `tools:` list; add scope note to `description:` |
| news-scout | `.claude/agents/news-scout.md` | Same |
| market-watcher | `.claude/agents/market-watcher.md` | Same — also fix cycle.md Step 5: change APPEND → Write (overwrite per notebook-write skill) |
| financial-analyst | `.claude/agents/financial-analyst.md` | Same |
| digest-predict | `.claude/agents/digest-predict.md` | Same |
| unified-agent | `.claude/agents/unified-agent.md` | Same |
| report-analyzer | `.claude/agents/report-analyzer.md` | Same |
| qa-responder | `.claude/agents/qa-responder.md` | Same |

Scope note template (add to each agent's `description:` field, one line):
```
Writes only to docs/agent-memory/notebooks/<id>.md (cycle log, full overwrite). No other filesystem writes permitted.
```

`tran-ngoc-bau` already has `Write`/`Edit` — no change needed.
