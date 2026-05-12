# PO — Bug Triage

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                    # why: check for existing tasks / avoid duplicates
- docs/data/project-stats.json     # why: system state and recent metrics

## Step 1: Classify bugs from BUG channel

```
read_telegram_reports(channel="bug", limit=20)
```

For each bug message:
1. Is it already tracked in docs/TASKS.md? → skip (no duplicate)
2. Classify: crash | data error | logic error | UX | regression | deploy-gap
3. Cross-check git log (last 20 commits) — was it already fixed?
4. If deploy-gap → spawn `ops` for container rebuild immediately

**Decision matrix:**

| Git has fix? | Container current? | Action |
|---|---|---|
| No | — | New bug — open task → `developer` |
| Yes | Yes | Regression — open task, tag `regression`, priority HIGH |
| Yes | No | Deploy gap → `ops`: `docker compose up -d --build` |
| Done task exists, no git fix | — | Premature-close — reopen, priority HIGH |

## Step 2: Create tasks

For each confirmed new bug:
```
| NNN | [Bug description — module/symptom] | pending | developer | — |
```
Tag with root-cause label: `regression` | `deploy-gap` | `premature-close` | `new`.

## Step 3: Commit notebook

> Timestamp invariant: always `date -u +"%Y-%m-%dT%H:%M:%SZ"` — never speculative.

```bash
git add docs/agent-memory/notebooks/po.md
git commit -m "chore(memory/po): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Bug triage complete — N tasks created
TASKS: [list]
PIPELINE: continue → dev-team dispatch
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/po/sprint-plan.md       # when: no critical (crash/data-loss) bugs blocking sprint — routine bugs filed and dev-team will pick up
- → STOP                          # when: critical bugs filed that must resolve before any new sprint can start (sprint deferred)
