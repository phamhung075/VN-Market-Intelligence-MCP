---
name: commit
description: Update docs, commit all changes by category, push to main, merge and clean branch
trigger: /commit
---

# /commit

Commit all changes grouped by category, update related docs, push to main, and clean up the branch.

## Step 0 — Update related documentation FIRST

Before staging anything, scan all changed files and update any docs that should reflect those changes.
Include updated docs in the same commit as their related source category.

| Changed files | Docs to update |
|--------------|----------------|
| `.claude/agents/*.md` | `docs/agent-memory/notebooks/<agent-id>.md` if behavior changed |
| `apps/mcp-server/src/**` (new tools/routes) | `docs/data/project-stats.json` (tool count) |
| `apps/mcp-server/src/**` (schema change) | Any `docs/` architecture docs referencing that schema |
| `docs/data/orch/orch-state.json` | Verify `.task_board` status updated; archive completed tasks to `.task_board.archive[]` if not already done |
| `docs/agents/*/flow/**` | Relevant agent `.md` if the flow change affects agent behavior |
| `docs/{policies,protocols,standards,references}/**` | Any agent `.md` that references the changed knowledge file |
| Source code bug fix | Add entry to relevant session log if a bug was resolved |

Do not create new documentation files unless clearly missing. Prefer updating existing docs.

## Step 1 — Categorize changes

Group all modified/untracked files into logical categories. Skip `.DS_Store` — never commit it.

| Category | Commit prefix | Examples |
|----------|--------------|---------|
| Agent files | `chore(agents)` | `.claude/agents/*.md` |
| Flows | `chore(flows)` | `docs/agents/*/flow/` |
| Knowledge files | `docs(knowledge)` | `docs/{policies,protocols,standards,references}/` |
| Docs / briefs | `docs(analysis)` | `docs/analysis-briefs/` |
| Notebooks | `chore(memory/<agent-id>)` | `docs/agent-memory/notebooks/` — `notebook YYYY-MM-DD` (no trailers) |
| Tasks / archive | `chore(tasks)` | `docs/data/orch/orch-state.json` (task_board mutations) |
| Data / stats | `chore(data)` | `docs/data/*.json` |
| Reports / handoffs | `docs(reports)` | `reports/`, `docs/reports/`, `docs/handoffs/`, `docs/execution-logs/` |
| Source code | `feat` / `fix` / `refactor` | `apps/`, `src/` |
| Config / lock | `chore(config)` | `*.lock`, `*.json` config |

## Step 2 — One commit per category

For each non-empty category:
1. `git add <explicit file paths — never git add -A or git add .>`
2. Commit using HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
<prefix>: <concise summary of what changed and why>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

## Step 3 — Push to main

Use the bounded rebase-retry guard (same semantics as `.claude/skills/commit-mutex/SKILL.md`
Step 3d-PUSH, which is the SSOT — see it for full guard rationale and conflict semantics):

```bash
# Bounded rebase-retry push — MAX 2 total push attempts; abort on conflict
git push origin main
PUSH_EXIT=$?
if [ $PUSH_EXIT -ne 0 ]; then
  git pull --rebase origin main
  REBASE_EXIT=$?
  if [ $REBASE_EXIT -ne 0 ]; then
    # Rebase conflict — abort cleanly; never auto-resolve
    git rebase --abort 2>/dev/null || true
    send_telegram(channel="bug",
      "[<agent>] commit: push rebase CONFLICT — rebase aborted; commit local-only. \
       Paths: <staged_paths>. Manual reconcile required.")
    # Commit is preserved locally; EXIT push step
  else
    git push origin main
    PUSH2_EXIT=$?
    if [ $PUSH2_EXIT -ne 0 ]; then
      send_telegram(channel="bug",
        "[<agent>] commit: push retry FAILED after rebase; commit local-only. \
         Paths: <staged_paths>.")
    fi
  fi
fi
```

## Step 4 — Merge and clean branch (only if NOT on main)

1. `git checkout main`
2. `git merge <branch> --no-ff -m "merge(<branch>): finish"`
3. `git push origin main`
4. `git branch -d <branch>`

## Rules

- Never commit `.DS_Store` or secrets
- Never use `git add -A` or `git add .` — always stage files explicitly by path
- Never skip hooks (`--no-verify`)
- Use HEREDOC for all commit messages
- Prefer many focused commits over one large commit
- Do NOT ask the user to run anything — execute autonomously
