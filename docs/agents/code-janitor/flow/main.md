<!-- size-justification: 182L — cap 120; UC-MDH-P3 added the Memory Prune Sweep section (script invocation + FLOW-vs-script signal_queue boundary, ~35L) which is tightly coupled to the adjacent Memory + State section it precedes; splitting into a child doc would orphan a 6-step sequential procedure that must run in one pass every scan. TE-T17 2026-07-23: added Notebook Line-Cap Sweep (script pointer, ~20L) — same every-scan cadence, precedes Memory + State for the same reason. -->

# Code Janitor — Main Flow

**Tools:** `docs/agents/tools/package/code-janitor.md`

## Input
Codebase diff (last 3 commits) or full scan trigger

## Output
Direct fixes committed | Backlog tasks created | `docs/data/code-janitor-known-findings.json` updated

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `code-janitor`)

## Decision Tree
```
Finding found?
  YES → single-file, mechanical, covered by existing tests?
    YES → ship directly (fix + test + commit + log fix)
    NO  → add to `docs/data/orch/orch-state.json .task_board.backlog[]`
  NO  → write Clean Areas section
```

## Direct Fix
1. Read source file → apply minimum fix (canonical source or shared constant)
2. `bun test <affected test>` — pass
3. `bun tsc --noEmit` — pass
4. Commit documenting what duplication removed

## Backlog Task
Append to `docs/data/orch/orch-state.json .task_board.backlog[]` (atomic write per §2.3):
```json
{"id": "JANITOR-NNN", "summary": "DRY: [description]", "priority": "normal"}
```
`send_telegram(channel="bug", message="[code-janitor] Found N DRY violations, proposed M backlog tasks")`

## Escalation Reporting (when sweep finds unfixed doublons)

If the sweep produced any escalation-class findings (doublons / DRY violations NOT auto-fixed, i.e. added to backlog):

1. Verify the payload JSON file exists (it MUST be written before this step — pointer integrity per signal-dashboard Rule 3):
   ```
   ls docs/signals/code-janitor-<slug>-<YYYY-MM-DD>.json
   ```
2. Append one DASHBOARD row per the WRITE protocol → skill: `.claude/skills/signal-dashboard/SKILL.md`
   Append row to `docs/data/orch/orch-state.json .signal_queue.rows[]` per signal-dashboard SKILL § WRITE:
   ```json
   {
     "id": "cj-{YYYYMMDDTHHmmss}",
     "ts": "<ISO-UTC>",
     "from": "code-janitor",
     "to": "po",
     "type": "system-issue",
     "summary": "Doublon sweep: N escalations → docs/signals/code-janitor-<slug>-<date>.json",
     "severity": "LOW",
     "status": "NEW",
     "payload_ref": "docs/signals/code-janitor-<slug>-<date>.json"
   }
   ```

Skip this step entirely if all findings were auto-fixed (nothing escalated).

---

## Memory Prune Sweep (every scan, before Memory + State)

Runs the file-ops-only debris sweep over `docs/agent-memory/` — sessions/*.md >14d archived,
dead health rechecks >30d deleted, `session-logs/` folded into `sessions/archive/`,
root-level `scheduled-task-execution-*.md` relocated. Detail: memory-docs-hygiene-P3.

**CANONICAL SCRIPT:**
```bash
bash "$PROJECT_ROOT/scripts/agents-flow/memory-prune-sweep.sh"
```
Idempotent — safe every cycle, no flags needed. Reusable-Scripts pointer:
`docs/policies/dev-standards.md` § Script Persistence.

**Boundary (SSOT-W1):** the script does file-ops ONLY — it never touches
`docs/data/orch/orch-state.json`. It writes at most one payload file to `docs/signals/`
(`janitor-health-recheck-writer-retired-*.json`, skipped on re-run once any prior payload
exists) routing the dead-RemoteTrigger-writer replace-vs-retire decision to PO. Appending the
corresponding `.signal_queue.rows[]` row is THIS FLOW's job, not the script's:

If the script's stdout contains a `SIGNAL-WRITTEN` line (i.e. the payload file was newly
created this run — check for its absence before the run, per pointer-integrity Rule 3):
```json
{
  "id": "cj-{YYYYMMDDTHHmmss}",
  "ts": "<ISO-UTC>",
  "from": "code-janitor",
  "to": "po",
  "type": "system-issue",
  "summary": "team-tool-recheck writer dead since 06-23 — replace-vs-retire decision needed",
  "severity": "LOW",
  "status": "NEW",
  "payload_ref": "docs/signals/janitor-health-recheck-writer-retired-<date>.json"
}
```
Append via skill: `.claude/skills/signal-dashboard/SKILL.md` § WRITE (atomic orch-state.json
write, mandatory read-back). Skip this row entirely if the script logged `SIGNAL-SKIP`
(payload already existed — already routed in a prior cycle).

Commit the sweep's moved/deleted paths with explicit pathspecs (old AND new paths for
renames, per feedback_pathspec_commit_drops_rename_deletion) alongside the notebook commit
below.

---

## Notebook Line-Cap Sweep (every scan, before Memory + State)

Root-cause backstop for the notebook-auto-prune PostToolUse hook (`.claude/settings.local.json`
matcher `Write|Edit`): any notebook write landed via a different tool path — Bash
heredoc/append, direct `mv`, etc — never fires that hook, so a governed notebook can grow
unbounded (ops.md hit 1197L / ~6x the 200L cap, via the 07-11 Docker-incident heredoc dumps,
before this sweep existed — TE-T17). This sweep is write-path-agnostic: it re-checks every
`docs/agent-memory/notebooks/*.md` file on this cron's 6h cadence regardless of how it grew.

**CANONICAL SCRIPT:**
```bash
bash "$PROJECT_ROOT/scripts/agents-flow/notebook-linecap-sweep.sh"
```
Idempotent — safe every cycle. For each file >200L, delegates to
`scripts/agents-flow/notebook-auto-prune.sh` (same drop-oldest section logic the PostToolUse
hook uses — single source of truth, no duplicated pruning code) via synthetic PostToolUse JSON.
Emits the same `notebook-unparseable-*`/`notebook-single-section-breach-*` safe-fail signals to
`docs/signals/` on the rare cases the hook itself cannot safely auto-prune (no `## ` sections,
or only 1 section left and still over cap) — those require manual review, not auto-action here.
Reusable-Scripts pointer: `docs/policies/dev-standards.md` § Script Persistence.
Test: `scripts/agents-flow/notebook-linecap-sweep.test.sh`.

---

## Memory + State (every scan)
- **Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (OVERWRITE). Body template for this agent:
```
### Scan NNN (HH:MM–HH:MM)
- Checks: [which] | Findings: N new, M recurrent | Action: shipped X | backlog Y | clean
```
- **Commit notebook**:
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/code-janitor.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/code-janitor.md
git commit -m "chore(memory/code-janitor): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits
- State: `docs/data/code-janitor-known-findings.json`:
```json
{"scan_date":"2026-04-26","findings":[{"id":"DRY-1","pattern":"...","status":"shipped|proposed"}]}
```

**DJ-GATE-1** (before any task DONE/REVIEW flip): run skill `.claude/skills/decision-journal/SKILL.md` § Write Entry — gate: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: No duplication found → EXIT immediately. Multi-file fix → STOP, create backlog task.

## RETURN

```
DONE: Scan complete — N findings | M shipped | K backlog tasks created
NEXT: po (if backlog tasks created — PO triages into next sprint) | idle (otherwise — cron will retry next cycle)
PIPELINE: complete
QUALITY: full | partial (if knowledge load failed)
```

---

## Reference Commands
```bash
grep -r "VNM\|FPT\|VCB" src/ | grep -v test | grep -v "// " | head -20
grep -r "1000\|3600\|86400" src/ | grep -v test | grep -v "//" | head -10
grep -r "CREATE TABLE\|PRIMARY KEY" apps/mcp-server/src/
grep -r "function.*validate\|export.*validate" src/ | sort | uniq -d
```
