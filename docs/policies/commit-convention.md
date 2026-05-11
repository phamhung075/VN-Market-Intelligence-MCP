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
- `<area>` = domain noun — canonical list (kept in sync with audit script VOCAB):
  `agent-doc`, `agents`, `agents-architect`, `alert-accuracy`, `alerts`, `api-gateway`,
  `arch`, `architecture`, `audit`, `cleanup`, `commit-convention`, `crons`, `cycle`,
  `data`, `db`, `deploy-verification`, `dev-team`, `docker`, `flow`, `flows`,
  `infra`, `janitor`, `knowledge`, `market-watcher`, `mcp`, `mcp-server`, `mcp-tool`,
  `memory`, `merge`, `microservice`, `notebooks`, `pm`, `qa`, `rag`, `readme`,
  `registry`, `routing`, `scan-market`, `scheduler`, `sessions`, `signals`, `skill`,
  `skills`, `ssot`, `state`, `system-auditor`, `ta-alert-notifier`, `tasks`,
  `telegram`, `tree-map`, `types`, `vps`
- Sprint/task IDs used as sole area token (e.g. `1872a`, `1864b`) are accepted
  but discouraged — prefer `<sprint>/<area>` (e.g. `feat(1872a/flows):`).

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

## C3-Exempt Commit Categories

These commit types carry `Task:` trailer for tracking but are **not required** to carry `AC:` trailer — the auditor skips them:

| Pattern | Example | Reason |
|---|---|---|
| `chore(memory/<id>): ...` | `chore(memory/qa): notebook 2026-05-11` | Notebook commit, no task delivery |
| `chore(state...): ...` | `chore(state): 1877c → In Progress` | Pipeline bookkeeping |
| Subject contains `merge task/` | `chore(1869/mcp-server): merge task/1869a-...` | AC lives on the feat/fix commit |

---

## C2-Exempt Commit Categories

These commit types are excluded from the C2 denominator — they contain a digit in scope but do not deliver sprint tasks:

| Pattern | Example | Reason |
|---|---|---|
| `chore(cycle-NN): ...` | `chore(cycle-28): persist 1872a artifacts` | Digit is cycle number, not sprint ID |
| `chore(pm/cNN): ...` | `chore(pm/c26): add Done rows from TNB c36` | Digit is cycle reference |
| `chore(pm/NNNN*): ...` | `chore(pm/1862c): decompose RCA brief` | PM sprint bookkeeping, no code delivery |
| Sprint-scoped chore containing `merge task/` | `chore(1869/mcp-server): merge task/1869b-...` | AC lives on the feat/fix commit |

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
