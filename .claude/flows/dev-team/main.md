# Dev Team — Cron Orchestration Flow (Thin Dispatcher)

## Input
`read_telegram_reports(status="new")` | Unresolved reports: `WHERE resolution NOT IN ('fixed','wontfix','duplicate') AND status='processed'` | docs/TASKS.md | git log (last 30 commits) | `git branch`

## Output
Tasks executed → docs/TASKS.md updated → WORK notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO | Detail file |
|---|---|---|
| Cold start / cron tick | `drain-signals` | `drain-signals.md` |
| Pipeline resume (`in_progress`) | `pipeline-resume` | inline below |
| FIX / direct task | `execute` | `execute-tier.md` |
| Post-execution verification only | `post-cycle` | `post-cycle.md` |
| Empty signals + empty TASKS.md + no reports | `session-gate` | inline below |

---

<!-- jump:drain-signals -->
## Step 0a — Drain `docs/signals/`

→ Run sub-flow: `.claude/flows/dev-team/drain-signals.md`

Output: `pendingSignals[]` for Step 1, or empty.

If empty AND TASKS.md empty AND no Telegram reports → JUMP TO `session-gate`.

---

<!-- jump:pipeline-resume -->
## Step 0b — Pipeline Resume + Session Gate

- `in_progress` AND `nextAgent` AND `updatedAt < 24h` → spawn `nextAgent` immediately. JUMP TO `execute`.
- `in_progress` AND `updatedAt ≥ 24h` → stale crash, reset to `"idle"`. Fall through to Step 1.
- `"idle"` or missing → fall through to Step 1.

<!-- jump:session-gate -->
**Session Gate:** TASKS.md empty AND no Telegram reports AND `pendingSignals` empty → `send_telegram(work, "Dev loop idle.")` → JUMP TO `end`.

---

<!-- jump:po-triage -->
## Step 1 — PO Triage

→ Spawn `po` with: `pendingSignals[]`, `read_telegram_reports(status="new")`, `listUnresolvedReports()`, `docs/TASKS.md`, `git log --oneline -30`, `git branch`
→ PO contract: `.claude/flows/po/main.md` § Role in dev-team flow
→ Return: `NOTHING` (→ idle EXIT) | `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`

---

<!-- jump:planning -->
## Step 2 — Planning

| Type | Sequence | Notes |
|---|---|---|
| FIX | (skip) | direct to Step 3 |
| SPIKE | (skip) | direct to developer with `feature-spike.md`; throwaway branch, findings doc only |
| SPRINT-S | architect → pm | each reads own flow |
| SPRINT-M | ba → architect → pm | sequential |
| SPRINT-L | ba → architect → pm; post-merge architect review | sequential |
| UNBLOCK | spawn `{route_to}` | `send_telegram(work, "Unblocked: [brief]")` → EXIT |
| CLEAN | spawn `qa` with branch list | qa flow handles cleanup → EXIT |

Architect MUST set `ZONE: apps/<service>/` in RETURN — PM propagates into handoff/RETURN per task. Step 3 zone-routes by this field. Agent contracts: each agent's `flows/<agent>/main.md` § Role in dev-team flow.

---

<!-- jump:execute -->
## Step 3 — Execution

→ Run sub-flow: `.claude/flows/dev-team/execute-tier.md`

Covers: tier grouping, zone routing (3-tier resolution: explicit → infer → report), parallel spawn rules, conflict check, merge gate.

---

<!-- jump:post-cycle -->
## Step 4 + 4.5 — Scan + Compact

→ Run sub-flow: `.claude/flows/dev-team/post-cycle.md`

Covers: post-execution checks (4.0–4.1), Compact Checkpoint (4.5), doc self-heal.

---

## Invariants

- WIP ≤ 2 | docs/TASKS.md ≤ 80 lines | project-stats.json updated each sprint
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- Notify WORK at: fix shipped | sprint complete | blocker resolved | idle
