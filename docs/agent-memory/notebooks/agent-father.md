# Agent Father — Notebook

**Last updated:** 2026-05-21T20:54:40Z | **Sprint:** 1967c — TASK_1967-03 + TASK_1967-05

## This Session — 2026-05-21T20:54Z (Tasks 1967-03 + 1967-05, single cycle)

**TASK_1967-03 — DASHBOARD stale-race guard (ITEM-03):**
Fix surface: `.claude/flows/pm/main.md`
Added "DASHBOARD Write Guard — CAS on pipeline-state.json" section before End-of-cycle skill.
Logic: Read pipeline-state.json fresh immediately before any DASHBOARD write. If `status` contains "idle" or "closed" → suppress signal + log. Applied to ALL pm DASHBOARD writes, not just plan_blocked.
AC: all PASS (design rationale). Handoff updated with [Developer] section.
Signal: `docs/signals/agent-father-1967-03-done.json` → qa.

**TASK_1967-05 — cowork dispatcher drift guard (ITEM-07):**
Fix surface: `.claude/flows/cowork-team/main.md`
Added "Step 3b — Drift threshold guard" between Step 2+3 (DRIFT_MIN returned) and Step 4 (silent exit).
Logic: if DRIFT_MIN > 10 → send_telegram WORK warn with drift value and safe limit. Warning-only, no spawn blocked.
Rationale: floor-15 rounding absorbs up to drift_min=14; threshold=10 provides 5-min safety margin before structural risk.
AC: all PASS (design rationale). Handoff updated with [Developer] section.
Signal: `docs/signals/agent-father-1967-05-done.json` → qa.

**Notebook race awareness:** Both tasks completed in single cycle. PO is running concurrently (1968 close + 1967-02 decision). Did NOT touch pipeline-state.json or ## po DASHBOARD section. Added ## agent-father DASHBOARD section per constraints.

## Previous Session — 2026-05-21T21:00Z (Task 1968b2)

L-6 cron stagger + cycle-bootstrap Step -1 + L-7 batch commit + ITEM-05 collision merge. Signals: agent-father-1968b2-done.json.

## Previous Session — 2026-05-21T20:03Z (Task 1968b1 phase2)

L-4 news-scout get_agent_signals consolidation 3→1 per cycle. Signal: agent-father-1968b1-done.json.

## Previous Session — 2026-05-21T20:30Z (Task 1968a — token/tool-call economy Phase 1)

L-1..L-5: startup→conditional lazy-load, 7 notebooks trimmed, signal-dashboard payload pointer rule, L-5 ULTRA tier.

## Patterns Noticed

- Concurrent agents leave pre-staged files — always check git status before staging.
- DASHBOARD.md modified between reads by concurrent agents — always re-read before editing.
- Always audit all 40 agents after fixing any specific trigger.
- ITEM-05 + L-7 surface collision: read 1967b brief + 1968b2 handoff Coordination before any cycle.md edit.
- Notebook race: when PO is in parallel, never touch pipeline-state.json or ## po DASHBOARD.

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification
- 1968b1: L-4 (get_agent_signals consolidation in news-scout flows) — gated on dev-mcp-server 1967-01
- 1967-03 + 1967-05: await qa ratification
- Await qa ratification of 1968b2 before PO closes sprint 1968.
