# Commit Convention — Worked Examples

> Parent: [commit-convention.md](./commit-convention.md)

**Load when:** you need a concrete pattern to copy (sprint commit, merge commit, notebook commit).

---

## Worked Example (Sprint 1863, Task 1863b)

```
feat(1863/scheduler): 1863b verdictResolutionJob hourly resolver

Reads pending alerts from store, fetches current price,
flips to confirmed/false_positive based on direction match.
Fail-loud on price fetch error.

Sprint: 1863
Task: 1863b
AC: cron 0 * * * * / pending→confirmed|false_positive / fail-loud on price error / 24h window
```

---

## Merge Commits

Merge commits bundle multiple tasks. Use `chore` or `feat` type, sprint-scoped. `Task:` trailer is optional (use only if merging a single task branch):

```
chore(1863/scheduler): merge task/1863b-verdict-resolution-job
```

Format: follow `docs/policies/commit-convention.md` — type and sprint scope required; `Task:` trailer omitted when merging multi-task branches.

---

## Notebook Commits

Agents commit their notebook at end of each work cycle. **No Sprint/Task/AC trailers** — memory update, not task completion.

Format: `chore(memory/<agent-id>): notebook YYYY-MM-DD`

Shell pattern:
```bash
git add docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook YYYY-MM-DD"
```

Worked example:
```
chore(memory/developer): notebook 2026-05-10
```

Query per-agent history:
```bash
git log --follow --oneline -- docs/agent-memory/notebooks/developer.md
git log --follow -p -- docs/agent-memory/notebooks/developer.md | head -60
```

Rules:
- Scope is always `memory/<agent-id>` — agent ID must match the notebook filename (e.g. `tran-ngoc-bau`, not `tnb`)
- Date is the session date (YYYY-MM-DD), not commit timestamp
- No Sprint/Task/AC trailers — omit entirely
- One commit per agent per cycle — do not batch multiple agents into one commit
