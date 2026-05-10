# Commit Convention — SSOT

**Load when:** any agent writes a git commit, authors a commit step in a flow, or reviews commit format.

---

## Format

```
<type>(<sprint>/<area>): <task-id> <one-line title>

<optional body — wrap at 72 cols>

Sprint: <number>
Task: <task-id>
AC: <slash-separated acceptance criteria, terse>
```

### Shell Pattern (heredoc — always use this mechanism)

```bash
git commit -m "$(cat <<'EOF'
<type>(<sprint>/<area>): <task-id> <one-line title>

<optional body>

Sprint: <sprint>
Task: <task-id>
AC: <terse criterion 1> / <terse criterion 2> / <terse criterion N>
EOF
)"
```

---

## Type Vocabulary

| Type | When |
|------|------|
| `feat` | New capability, tool, or user-visible behaviour |
| `fix` | Bug fix — broken behaviour corrected |
| `chore` | Scaffolding, config, maintenance — no behaviour change |
| `test` | Test-only change (no production code) |
| `docs` | Documentation only |
| `refactor` | Internal restructure — no behaviour change, no new tests |

---

## Scope Rules

- Scope format: `<sprint>/<area>` — e.g. `feat(1863/scheduler):`
- `<sprint>` = sprint number (integer)
- `<area>` = domain noun: `scheduler`, `mcp`, `knowledge`, `agents`, `infra`, `docker`, `qa`, `rag`, `db`, `alerts`, `telegram`, `vps`, etc.

---

## Task ID Format

- Always `NNNN<a-z>` lowercase — e.g. `1863b`, `1866a`
- Single task: `Task: 1863b`
- Multiple tasks in one commit: comma-separate — `Task: 1863a, 1863h`

---

## Trailers

Three machine-parseable git trailers on all sprint commits:

```
Sprint: <number>
Task: <task-id>
AC: <slash-separated list>
```

Query trailers after the fact:
```bash
git log --grep="Sprint: 1863" --pretty="format:%h %s%n%(trailers:key=Sprint)%(trailers:key=Task)%(trailers:key=AC)"
```

---

## No-Sprint Rule

Commits with no sprint context (hotfix, doc tweak, repo maintenance): **omit Sprint/Task/AC trailers entirely**. Use the scope to carry context instead:

```
fix(infra/docker): correct volume mount path
docs(knowledge/commit-convention): fix worked example typo
chore(vps): rotate Vinahost SSH key
```

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

## AC Trailer Style

- Terse — enough to recall what passed, not a full spec rewrite
- Slash-separated on a single line: `AC: criterion 1 / criterion 2 / criterion N`
- No trailing slash

---

## Merge Commits

Merge commits bundle multiple tasks. Use `chore` or `feat` type, sprint-scoped. `Task:` trailer is optional (use only if merging a single task branch):

```
chore(1863/scheduler): merge task/1863b-verdict-resolution-job
```

Format: follow `.claude/knowledge/commit-convention.md` — type and sprint scope required; `Task:` trailer omitted when merging multi-task branches.
