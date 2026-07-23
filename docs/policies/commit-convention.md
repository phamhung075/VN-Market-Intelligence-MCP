# Commit Convention — SSOT

<!-- size-justification: single-file SSOT after Wave-5 consolidation (UC-GCP-P1, 2026-07-23) — folds the former 4-file split (format+exemptions+examples children) back into one file per docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#git-ci-publish-P1. Format/type/scope/trailers/exemptions/examples are read together on every commit — one load beats the 2-read-per-lookup cost of the split it replaces. -->

**Load when:** writing a commit, reviewing PRs, automated validation.

**Enforced by:** every commit-authoring agent (`developer`, `fixer`, `qa`, `po`, etc.) at commit time. No blocking commit-msg hook exists — the only installed hook is pre-push (`tsc` only, via `scripts/audits/c2-alert.sh` Control 4 for the `-a`/`-am` rule). `scripts/audits/commit-convention-audit.sh` is DEPRECATED (§ below) — do not treat it as enforcement.

---

## Format

```
<type>(<scope>): <title>

<optional body — wrap ~72 cols>

Task: <TASK-SLUG>
AC: <terse criterion 1> / <terse criterion 2> / <terse criterion N>
```

`<scope>` is a zone/domain token, the task slug itself (lowercase-kebab), or both combined `<zone>/<task-slug>`. `<title>` is a short present-tense summary; lead with the TASK-SLUG (uppercase) when the scope doesn't already carry it — e.g. `chore(tasks): BOUNDED-1 pickup UC-GCP-P1 → in_progress`.

### Shell Pattern (heredoc — MANDATORY mechanism)

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <title>

<optional body>

Task: <TASK-SLUG>
AC: <criterion 1> / <criterion 2>
EOF
)" -- <explicit paths>
```

**MANDATORY RULE — carried forward verbatim, non-negotiable:** `git commit -m` (index-only) ONLY.
**NEVER use `git commit -am` or `git commit -a`** — the `-a` flag greedily stages untracked/concurrent-agent index content, violating commit atomicity. Root cause of the c47 incident (SHA `8bec73d3`). Enforced by merge-gate Control 4 (`scripts/audits/c2-alert.sh`). Always stage EXPLICIT pathspecs (`git add <exact paths>`) — never `-A` or `.`.

---

## Type Vocabulary

**Behavior types** (code/doc delivery):

| Type | When |
|---|---|
| `feat` | New capability, tool, or user-visible behaviour |
| `fix` | Bug fix — broken behaviour corrected |
| `chore` | Scaffolding, config, maintenance, bookkeeping — no behaviour change |
| `test` | Test-only change |
| `docs` | Documentation only |
| `refactor` | Internal restructure — no behaviour change, no new tests |

**Role types** (process/housekeeping authored under an agent's own identity — equally valid, not a vocabulary violation; live usage: `qa`, `ops`, `pm`, `po`, `arch`, `ba`, `incident`, `review`, `design`, `data`, `recon`): use when the commit's actor and content ARE that role's own output — e.g. `ops(incident): ...`, `qa(cron-audit-push-gate): ...` — instead of a generic `chore(...)` wrapper. Either style is acceptable; do not flip-flop within one agent's own commit stream.

---

## Scope Rules

- Lowercase-kebab. No fixed enforced vocabulary — the old `commit-convention-audit.sh` VOCAB list is deprecated (§ below); pick the token that best names the zone/domain touched.
- Common live tokens: `mcp-server`, `system-auditor`, `cross-service`, `dev-team`, `tasks`, `signals`, `memory/<agent-id>`, `<agent-id>`, `skills/<skill-name>`, `<zone>/<task-slug>`.
- Notebook commits: always `memory/<agent-id>` — agent ID must match the notebook filename.

---

## Task Slug Format

- Task IDs are UPPERCASE-KEBAB slugs matching the `docs/data/orch/orch-state.json` `.task_board` `task_id` (e.g. `UC-GCP-P1`, `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE`). The old numeric `NNNN<a-z>` era (`1863b`, `1866a`) is dead — 0/300 recent commits use it.
- When embedded in scope, lowercase the slug (`uc-mdh-p4`); in title/trailer, keep it uppercase.
- Multiple tasks in one commit: comma-separate the `Task:` trailer.

---

## Trailers

- `Task: <TASK-SLUG>` — **required** on `feat`/`fix` commits that deliver a board task.
- `AC: <criterion 1> / <criterion 2> / ...` — **required** alongside `Task:`; terse, slash-separated, no trailing slash.
- `Sprint: <label>` — **optional**. No numeric sprints exist anymore; use only to group multi-task epics under a slug label (e.g. `Sprint: ULTRACODE-AUDIT-FIXALL`). Omit by default.
- `Claude-Session: <url>` — auto-appended by the CLI environment. Not authored by convention; informational only, never required or forbidden.

Query after the fact:
```bash
git log --grep="Task: UC-GCP-P1" --pretty="format:%h %s%n%(trailers:key=Task)%(trailers:key=AC)"
```

---

## Exempt Categories (no `Task:`/`AC:` expected)

| Pattern | Example | Reason |
|---|---|---|
| `chore(memory/<agent-id>): notebook YYYY-MM-DD` | `chore(memory/qa): notebook 2026-07-23` | Memory update, not task delivery |
| `chore(tasks): ...` / `chore(dev-team): tick ...` / `chore(signals): drain ...` | `chore(tasks): cold-evict terminal sprints/done lanes → archive/2026-07.json` | Board/pipeline bookkeeping, no code delivered |
| No board-task context (hotfix, doc tweak, repo maintenance) | `fix(infra/docker): correct volume mount path` | Nothing to trail — omit `Task:`/`AC:` entirely, carry context in scope+title instead |

---

## Notebook Commits

Agents commit their notebook at end of each work cycle. No `Task:`/`AC:`/`Sprint:` trailers — memory update, not task completion.

Format: `chore(memory/<agent-id>): notebook YYYY-MM-DD`

```bash
git add docs/agent-memory/notebooks/<agent-id>.md
git commit -m "chore(memory/<agent-id>): notebook YYYY-MM-DD"
```

Rules: scope is always `memory/<agent-id>` matching the notebook filename; date is session date, not commit timestamp; one commit per agent per cycle — do not batch multiple agents into one commit.

---

## Worked Examples (live, from git log)

```
fix(cross-service/uc-mdh-p4): implement promised decision-journal archival for pm task-archive

New scripts/agents-flow/decision-journal-archive.sh moves closed-sprint
docs/agent-memory/decisions/sprint-*.md journals into docs/archive/decisions/.

Task: UC-MDH-P4
AC: script-implements-rescope-contract/test-proves-idempotency-and-status-based-selection/pm-flow-wired/canonical-pointer-added
```

```
chore(qa/uc-mdh-p4): verify-committed APPROVE decision-journal-archive.sh + task-archive Step 5.5 wiring

Direct-commit verify of 48e6bf250/880c28f43 — re-ran test suite live, 26/26 PASS.

Task: UC-MDH-P4
AC: DoD met — test-re-run-green/sandboxing-independently-proven/ssot-w1-boundary-grep-confirmed/contract-fidelity-cross-checked, zero blocking issues.
```

---

## `commit-convention-audit.sh` — DEPRECATED

`scripts/audits/commit-convention-audit.sh` was a one-time Phase-B (2026-05-10 → 05-17) C1–C4 greenlight gate built on the now-dead numeric-sprint / `Sprint:`-trailer / digit-in-scope heuristics this doc replaces. It is not wired into any live flow, cron, or skill (verified zero references outside its own file). Do not run it as a live validator and do not treat its VOCAB or thresholds as current — superseded by this file.
