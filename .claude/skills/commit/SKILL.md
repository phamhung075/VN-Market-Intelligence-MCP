---
name: commit
description: Update docs, commit changes by category under a per-commit mutex, push to main
trigger: /commit
---

# /commit

Commit all changes grouped by category, update related docs, and push each category to
main under its own `commit-mutex:main` critical section. All work stays on `main` —
there is no feature branch to merge or clean up (no-branches invariant).

**Context requirement (INV-GATEWAY-1):** `/commit` runs as the dispatcher/team-lead
session — it is the caller with the MCP gateway binding required for `task_claim` on
`commit-mutex:main`. Dev-*/qa/ba/pm/architect specialist sub-agents do not invoke this
skill; they commit directly (explicit paths) per their own flow.

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

**Stranded-peer-file age guard (before staging anything):** check every candidate file
against the declared per-agent zone table in `.claude/skills/commit-boundary/SKILL.md`
§ RULE 2 (agents-architect / agent-father / pm / ops zones). If a file BOTH (a) falls
inside another agent's declared zone AND (b) has `mtime` < 2h old —
`age_h = (now() - mtime(f)) / 3600` (macOS: `stat -f %m <f>`; Linux: `stat -c %Y <f>`)
— SKIP it: do not stage it, do not include it in any category below. List every
skipped file in the `/commit` run output for the router to triage next cycle. A peer
may be mid-edit; sweeping their in-flight uncommitted work into this run is exactly the
failure this guard exists to prevent.

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

## Step 2 — One mutex-bound commit per category

For each non-empty category, run ONE `commit-mutex:main` acquire → critical section →
release cycle scoped to that category alone — never one claim spanning the whole
multi-category run. `.claude/skills/commit-mutex/SKILL.md` sizes TTL=90s and its
No-Heartbeat Rule for a single seconds-long critical section; holding the lock across
several categories' worth of doc-scan + stage + commit + push routinely exceeds that
budget and lets the lock silently expire mid-run.

```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: [<explicit paths staged in Step 1 for this category>]
  intent:    "<category prefix>: <one-line summary>"
```

That skill is the SSOT for the full acquire/stage/verify/commit/push/release sequence
(its Steps 1–4, including Step 3d-PUSH's bounded rebase-retry push guard) — do not
duplicate that shell here. Fail-closed paths (C-2 MCP-unavailable, C-2b mechanism-broken,
contention give-up after 6 backoff retries) all resolve to: skip this category's commit,
move to the next category, work stays in the tree for next `/commit` run.

Commit message HEREDOC (paths repeated on the commit line itself, per the skill's
pathspec-scoped commit — never bare):

```bash
git commit -m "$(cat <<'EOF'
<prefix>: <concise summary of what changed and why>

Task: <TASK-SLUG>        # omit if no board task (see commit-convention.md § Exempt Categories)
AC: <criterion 1> / <criterion 2>
EOF
)" -- <same explicit file paths staged in Step 1>
```

Trailer set, type/scope vocabulary, and exemptions (notebook commits, no-board-task
hygiene commits, etc.) are defined in `docs/policies/commit-convention.md` — that
document is the SSOT. Never hardcode a co-author or model-name trailer here; it drifts
out of sync with whatever model authored the change.

## Rules

- Never commit `.DS_Store` or secrets
- Never use `git add -A` or `git add .` — always stage files explicitly by path
- Never commit bare — always pass the SAME explicit paths from Step 1 to the commit line itself as `-- <paths>` (Step 2)
- Never skip hooks (`--no-verify`)
- Use HEREDOC for all commit messages
- Prefer many focused commits over one large commit
- Skip stranded peer-zone files younger than 2h (Step 1 guard) — never sweep another agent's in-flight work
- One `commit-mutex:main` acquire/release per category commit (Step 2) — never span the whole run
- Do NOT ask the user to run anything — execute autonomously
- All work stays on `main` — there is no feature branch to merge or delete (no-branches invariant)
