# TASK 1968a — Phase 1 Token/Tool-Call Economy (agent-father, zero-code)

**Sprint:** 1968 | **Status:** GATED on 1967b brief landing | **Owner:** agent-father | **Time-box:** 2h | **Created:** 2026-05-21T19:10Z po c235

## Source Brief
`docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` §2 Tier-1 (L-1 through L-5).

## Pre-Condition (HARD GATE)
1. Sprint 1967b architect brief landed at `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`.
2. PO has emitted sanity-check signal confirming overlap merge complete (no double-fix of same .md surface).
3. ETA: 2026-05-21T22:01Z (1967b time-box 4h from 19:01Z PO kickoff).

Until both conditions met, agent-father must NOT touch any of the target files.

## Scope (5 levers, all .md edits, NO code)

### L-1 — Fix `trigger: startup` semantics (4 agents)
| Agent file | Current | Required action |
|---|---|---|
| `.claude/agents/news-scout.md` | `agent-roster.md trigger: startup` + `GLOSSARY_VI.md trigger: startup` | Change to real conditional triggers: `agent-roster.md` → `trigger: system_routing_question`. `GLOSSARY_VI.md` → `trigger: vn_financial_terms`. |
| `.claude/agents/alert-commander.md` | `mcp-tools.md trigger: startup` (line 82-84) | Decide: if agent constructs MCP calls every cycle → promote to `always_load` with inline `# justification: alert-commander constructs MCP calls every cycle; mcp-tools.md is the SSOT for tool names + payload shapes`. Otherwise → `trigger: mcp_tool_unavailable`. **Note (po cross-ref):** 1963-MW-IDENTITY fix promoted mcp-tools.md to `always_load` ONLY for market-watcher (DASHBOARD `## agent-father` row confirms). Alert-commander was NOT covered by that fix. Recommended action: promote to `always_load` (alert-commander dispatches MCP calls every cycle to write_alert_verdict + post_agent_signal). |
| `.claude/agents/financial-analyst.md` | `GLOSSARY_VI.md trigger: startup` | Change to `trigger: vn_financial_terms`. |
| `.claude/agents/report-analyzer.md` | `GLOSSARY_VI.md trigger: startup` | Change to `trigger: vn_financial_terms`. |

### L-2 — Archive + trim 7 over-size notebooks
For each notebook below: (1) Read current file. (2) Copy full content to `docs/archive/notebooks/<agent-id>-2026-05-21.md`. (3) Overwrite live notebook to ≤120L, preserving `## Carry-over` section + any cycle-current decisions (last 3 cycles max). (4) Add pointer to archive at top of live file.

| Notebook | Current size | Target | Archive path |
|---|---|---|---|
| `docs/agent-memory/notebooks/qa.md` | 1149L | ≤120L | `docs/archive/notebooks/qa-2026-05-21.md` |
| `docs/agent-memory/notebooks/dev-frontend.md` | 384L | ≤120L | `docs/archive/notebooks/dev-frontend-2026-05-21.md` |
| `docs/agent-memory/notebooks/architect.md` | 310L | ≤120L | `docs/archive/notebooks/architect-2026-05-21.md` |
| `docs/agent-memory/notebooks/dev-team.md` | 286L | ≤120L | `docs/archive/notebooks/dev-team-2026-05-21.md` |
| `docs/agent-memory/notebooks/pm.md` | 269L | ≤120L | `docs/archive/notebooks/pm-2026-05-21.md` |
| `docs/agent-memory/notebooks/ba.md` | 234L | ≤120L | `docs/archive/notebooks/ba-2026-05-21.md` |
| `docs/agent-memory/notebooks/system-auditor.md` | 211L | ≤120L | `docs/archive/notebooks/system-auditor-2026-05-21.md` |

Also update `.claude/skills/notebook-write/SKILL.md`: change hard cap from previous value to 120L; add archive-before-overwrite rule.

### L-3 — Signal payload pointer rule
Edit `.claude/skills/signal-dashboard/SKILL.md`:
- Add section "## Payload Pointer Discipline"
- Rule 1: When DASHBOARD summary column would exceed 120 chars → truncate to 80 chars + ` → docs/handoffs/TASK_NNN.md` pointer.
- Rule 2: pm sprint-kickoff signals payload body must be ≤800 chars JSON (title + scope summary + task ID list only). Full plan lives in `docs/handoffs/SPRINT_NNN.md`.
- Rule 3: pointer must resolve to an existing file before the truncating writer emits.
- No retroactive rewrite — applies to NEW signals from cycle-2 onward.

### L-5 — ULTRA caveman tier for cycle-status pings
| File | Edit |
|---|---|
| `.claude/flows/news-scout/stage-log-notify.md` | Route cycle-status WORK message through ULTRA tier per `.claude/skills/caveman/SKILL.md`. |
| `.claude/flows/market-watcher/cycle.md` Step 5b | Same — cycle-status ping → ULTRA. |
| alert-commander session-log header | One-line ULTRA cycle summary before detail body. |

No invention — ULTRA tier is already defined in caveman skill.

## Acceptance Criteria (per Sprint Goal AC-1..AC-6)
- AC-1 (L-1): 4 agent .md files updated; each `always_load` promotion has inline `# justification: ...` comment.
- AC-2 (L-2): 7 notebooks ≤120L; 7 archive files exist; `## Carry-over` preserved in live files; notebook-write SKILL updated.
- AC-3 (L-3): signal-dashboard SKILL has new "## Payload Pointer Discipline" section.
- AC-4 (L-5): 3 cycle-status emission sites route through ULTRA.
- AC-5 (commit): single batched commit OR 5 per-lever commits, all following `docs/policies/commit-convention.md`.
- AC-6 (ratification): emit `docs/signals/agent-father-1968a-phase1-done.json` (caveman ULTRA tier) — PO ratifies via `docs/signals/po-1968a-phase1-approved.json`.

## Out of Scope
- Any production code change. Any Docker rebuild. Any DB schema. Any BCTC path. Any cron schedule.
- L-4 (`get_agent_signals` consolidation) — that's 1968b.
- L-6 / L-7 / L-8 / L-9 — Phase 2 or Phase 3.
- Retroactive signal payload rewrite — only forward-looking rule.

## Coordination Notes
- Sprint 1967b orchestration audit is running in parallel; agent-father MUST read its brief before file surgery to absorb any always_load / notebook hygiene findings that overlap.
- If 1967b finds additional drift in same files, agent-father merges fixes in single touch — avoid double-edit.
- If 1967b finds nothing in these zones, proceed with brief as-is.
