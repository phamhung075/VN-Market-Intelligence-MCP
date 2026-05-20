<!-- size-justification: 130L — thin dispatcher; sub-flow routing table + BATCH schema spec + JUMP TO anchors + notebook-write skill route are tightly bound. Cross-file sub-flows live in `po/triage-*.md`, `po/channel-audit.md`, `po/sprint-*.md`. -->
# Product Owner — Main Flow (Thin Dispatcher)

**Tools:** `.claude/tools/package/po.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
docs/TASKS.md blockers | `docs/data/project-stats.json` | latest `reports/TASK_REPORT_*.md` | `pendingSignals[]` from dev-team

## Output
`docs/SPRINT_GOAL.md` vision | BA task in docs/TASKS.md | sprint sign-off | BATCH return to dev-team

---

## Role in dev-team flow
> Canonical orchestration: `.claude/flows/dev-team/main.md`

**Called from:** dev-team Step 1 — triage all inputs and classify work
**Receives:** `pendingSignals[]` from Step 0a | `read_telegram_reports(status="new")` | `list_unresolved_reports()` | `docs/TASKS.md` | `git log --oneline -30` | `git branch`
**Produces:** `NOTHING` (→ idle EXIT) or `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])` where type ∈ {FIX, SPIKE, SPRINT-S, SPRINT-M, SPRINT-L, UNBLOCK, CLEAN}
**Hand off to:** main terminal — routes batch by type into Step 2 (planning) or Step 3 (direct FIX)
**Composes with:** architect/ba/pm in Step 2 (never directly — main terminal is the router)

Priority order: recurring bugs → UNBLOCK → FIX → CLEAN → SPRINT-S → SPRINT-M/L
> Task size rules → docs/standards/task-size-rules.md
CLEAN: flag any branch with 0 unmerged commits (`git log main..<branch> --oneline` empty) or stale worktree → route to qa.
SPIKE: exploratory question, no clear scope. Output: findings doc. Time-box default 2h. Schema below.

**Every FIX/SPRINT-* entry MUST carry `zone:`** — one of: `apps/<service>/` (single zone), `multi` (architect must split), or `cross-service/` (genuine root/scripts work — routes to generic developer). dev-team Step 3 reads this field; missing zone = batch rejected back to PO.

**SPIKE batch entry schema:**
```
{
  type: "SPIKE",
  id: "SPIKE_NNN",
  title: "<kebab-topic>",
  question: "<the actual question to answer>",
  mode: "spike",
  zone?: "apps/<service>/",
  timebox?: <minutes>          # default 120
}
```

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md` · in-file jumps use `JUMP TO <label>`; cross-file routes use `→ Run sub-flow: <path>`.

| Spawn context | First action |
|---|---|
| Cron / dev-team spawn (triage) | JUMP TO `tnb-audit` (pre-flight chain auto-falls through to `no-task-guard`) |
| BUG channel report only | JUMP TO `channel-audit` |
| Triage finished, found backlog → kick off sprint | → Run sub-flow: `.claude/flows/po/sprint-kickoff.md` |
| BA returned a spec for review | → Run sub-flow: `.claude/flows/po/review-ba-spec.md` |
| QA signalled sprint complete | → Run sub-flow: `.claude/flows/po/sprint-signoff.md` |

Never inline both pre-flight and a branch workflow — keep context lean. Pre-flight always runs first, then route to the right sibling and EXIT via its RETURN block.

---

**Pre-check — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Pre-check — Signal dashboard** → skill: `.claude/skills/signal-dashboard/SKILL.md` (§ READ)
- Scan `## po` section for NEW rows. For each: read payload → add to triage context. Mark READ.
- Log: `"[dashboard] {N} new signals"` or `"[dashboard] inbox empty"`. Never fail-loud.

**Pre-check**: `$PROJECT_ROOT/docs/TASKS.md` blocked tasks waiting for PO → handle first

<!-- jump:tnb-audit -->
## Step 0-TNB — Read TNB Audit Findings (MANDATORY)

→ Run sub-flow: `.claude/flows/po/triage-tnb.md`

Feeds findings into Step 1 sprint planning. ACK appended to `docs/handoffs/tnb-audit-latest.md`.

<!-- jump:triage-signals -->
## Step 0-SIG — Triage pendingSignals[]

→ Run sub-flow: `.claude/flows/po/triage-signals.md`

MANDATORY when dev-team passed signals. Each `pendingSignals[]` entry routed per signal-type table. If `pendingSignals[]` empty → JUMP TO `channel-audit`.

<!-- jump:channel-audit -->
## Step 0 — Channel Audit + Cross-Check

→ Run sub-flow: `.claude/flows/po/channel-audit.md`

Reads MARKET/WORK/BUG/market-group (10 msgs each), classifies issues by 9-row failure-signal table, cross-checks against TASKS.md + git + container state (4-row decision matrix). New FIX/SPRINT tasks carry `zone:`.

---

<!-- jump:no-task-guard -->
## No-Task Guard

After pre-flight runs, check:
1. docs/TASKS.md — any pending/in-progress tasks? → handle first
2. `read_telegram_reports(status="new")` — any user requests? → handle first
3. Step 0 found issues? → self-initiate sprint from those findings
4. All empty AND channels clean → JUMP TO `end` and return:
```
## RETURN
DONE: No tasks, no user requests, channels clean
NEXT: idle (next cron tick will retry — autonomous mode never returns to user when channels are clean)
PIPELINE: idle
```

**PO CAN self-initiate** when channel audit found bugs, strategy errors, UX issues, or logic problems — these are the sprint backlog. To kick off → jump to `po/sprint-kickoff.md`.

## Branch Workflows (load only the one you need)

| Caller intent | File |
|---|---|
| Triage finished, backlog found → kick off new sprint | `po/sprint-kickoff.md` |
| BA returned a spec for review (`docs/REQ_NNN.md`) | `po/review-ba-spec.md` |
| QA signalled sprint complete (`reports/SPRINT_REPORT_NNN.md`) | `po/sprint-signoff.md` |

Do not inline these workflows here — that's the whole point of the split.

---

**Notebook write** (end of every cycle) → skill: `.claude/skills/notebook-write/SKILL.md` (OVERWRITE, target ≤50L). Skill handles body discipline + Carry-over block.

> Invariant: timestamp = current UTC, never future, never speculative. ALWAYS get via `date -u +"%Y-%m-%dT%H:%M:%SZ"` before any ACK append or notebook header.

**Commit notebook**:
```bash
git add docs/agent-memory/notebooks/po.md
git commit -m "chore(memory/po): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
