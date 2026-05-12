# Commit Convention — Format Rules

> Parent: [commit-convention.md](./commit-convention.md)

**Load when:** writing a commit subject line, picking a type/scope/area, formatting trailers.

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

**Mandatory rule:** Use `git commit -m` (index-only) exclusively. **NEVER use `git commit -am` or `git commit -a`** — the `-a` flag greedily stages untracked index content from concurrent agent writes, violating C2 atomicity. Root cause of c47 incident (`8bec73d3`). Enforced by merge gate Control 4 (`scripts/audits/c2-alert.sh`).

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

## AC Trailer Style

- Terse — enough to recall what passed, not a full spec rewrite
- Slash-separated on a single line: `AC: criterion 1 / criterion 2 / criterion N`
- No trailing slash
