# Product Owner — Main Flow

## Input
docs/TASKS.md blockers | `docs/data/project-stats.json` | latest `reports/TASK_REPORT_*.md`

## Output
`docs/SPRINT_GOAL.md` vision | BA task in docs/TASKS.md | sprint sign-off

---

**Pre-check**: docs/TASKS.md blocked tasks waiting for PO → handle first

## Step 0 — Channel Audit (MANDATORY, runs before everything)

Read the last 10 messages from each channel and evaluate as the **user** (not as an agent):

```
read_telegram_reports(channel="market", limit=10)
read_telegram_reports(channel="work",   limit=10)
read_telegram_reports(channel="bug",    limit=10)
```

For each message, scan for these failure signals:

| Signal | Description | Action |
|--------|-------------|--------|
| **N/A values** | Any field showing `N/A`, `null`, `undefined`, `—`, or `0.0` where real data is expected | Open bug task → `ops` |
| **Bug / error** | Stack traces, `ERROR`, `FAILED`, tool call errors, MCP exceptions | Open bug task → `ops` or `developer` |
| **Content mismatch** | Message topic doesn't match the channel (e.g. market alert in WORK, build output in MARKET) | Flag in session log, spawn `claude-manager-helper` if pattern is recurring |
| **Cowork doing wrong thing** | Agent reports completing work that contradicts the sprint goal or doesn't match what was asked | Open correction task → `ba` for re-spec |
| **Silent period** | A channel has had 0 messages in >2h during market hours | Flag as potential pipeline failure → `ops` |

**Evaluate from the user's perspective:**
- Would the user understand this message?
- Does the output reflect what was actually asked?
- Are signals actionable or just noise?
- Are agents reporting progress on the right tasks?

### Step 0-b — Cross-check issues against fix history (MANDATORY if any issue found)

Before opening a new bug task, verify the issue wasn't already fixed:

**1. Check docs/TASKS.md** — search for the same module/ticker/tool name in Done tasks:
```
grep -i "<keyword>" docs/TASKS.md
```
If a matching Done task exists → the fix was merged. Suspect **deploy gap** (see below).

**2. Check git log** — last 20 commits for a fix on the same module:
```
git log --oneline -20 -- <affected file or path>
```
If a fix commit exists but the bug still shows in channel → **container not rebuilt**.

**3. Check container state** — is the running server actually on the latest code?
```
get_system_status()   ← compare reported version/build-time vs latest git commit timestamp
get_recent_fixes()    ← last N fixes logged by ops — was this one applied?
```

**Decision matrix:**

| Git has fix? | Container current? | Action |
|---|---|---|
| No | — | New bug — open task → `developer` |
| Yes | Yes | Regression — open task, tag `regression`, priority HIGH |
| Yes | No | Deploy gap — open task → `ops`: rebuild container (`docker compose up -d --build`) |
| Done task exists, no git fix | — | Task was closed prematurely — reopen it, priority HIGH |

**Never open a duplicate bug task.** Always resolve the root cause (regression vs deploy gap) first.

---

**If 1+ issues found**: create bug/correction tasks in docs/TASKS.md (with correct root-cause label) before proceeding to sprint planning.

**If clean**: proceed to No-Task Guard.

**Append to session log:**
```
Channel audit: MARKET(N msgs, X issues) | WORK(N msgs, X issues) | BUG(N msgs, X issues)
Issues: [list with root-cause: new/regression/deploy-gap/premature-close] | CLEAN
```

---

## No-Task Guard

Before doing anything, check:
1. docs/TASKS.md — any pending/in-progress tasks? → handle those first
2. `read_telegram_reports(status="new")` — any user requests? → handle those first
3. Both empty → **cannot self-initiate** → return:
```
## RETURN
DONE: No tasks and no user requests found
NEXT: user | provide session goal or priority to initiate next sprint
PIPELINE: idle
```
Main terminal will ask the user for input before re-spawning PO.

## Self-Initiating Sprint (only when user provides session goal)

**1.** Assess: `docs/data/project-stats.json` (counts) | last 2 task reports | user session goal

**2.** Highest-impact: reliability (failing tests, footguns) | coverage (missing signals) | UX (useless alerts) | architecture (DDD debt)

**3.** Write `docs/SPRINT_GOAL.md`:
```markdown
# Sprint NNN Goal

## Vision
[one sentence: business outcome]

## Scope
IN: [what we're building]
OUT: [what we're NOT doing]

## Success Metric
[how we know it's done]
```

**4.** Create BA task: `| BA-NNN | Requirement Spec for Vision NNN | pending | BA | — |`

**5.** Return:
```
## RETURN
DONE: Sprint NNN goal written, BA task created
NEXT: ba | write requirement spec for docs/SPRINT_GOAL.md
HANDOFF: docs/SPRINT_GOAL.md
PIPELINE: continue
```

## When BA Returns Spec
Read `docs/REQ_NNN.md` — matches vision? AC clear? blockers answerable?
- **Approve** → `status: APPROVED` → return `NEXT: architect | run brownfield analysis`
- **Reject** → feedback in `docs/REQ_NNN.md` → return `NEXT: ba | revise spec per feedback`

## When QA Signals Sprint Complete
Read `reports/SPRINT_REPORT_NNN.md` + smoke test (MCP tool call or market output)
- **Approve** → update docs/TASKS.md + `docs/SPRINT_GOAL.md` → return `PIPELINE: complete`
- **Reject** → open Backlog tasks → return `NEXT: ba | new spec for remaining issues`
