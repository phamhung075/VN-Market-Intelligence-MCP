<!-- size-justification: 227L — cap 120; UC-MDH-P3 added the Memory Prune Sweep section (script invocation + FLOW-vs-script signal_queue boundary, ~35L) which is tightly coupled to the adjacent Memory + State section it precedes; splitting into a child doc would orphan a 6-step sequential procedure that must run in one pass every scan. TE-T17 2026-07-23: added Notebook Line-Cap Sweep (script pointer, ~20L) — same every-scan cadence, precedes Memory + State for the same reason. TE-T33 2026-07-23: added Cold Archive Sweep (script pointer, ~26L) — internally monthly-guarded, same every-scan cron invocation pattern, precedes Memory + State for the same reason. CADRAT-3 2026-08-04: added Pre-Check gate (git diff --name-only HEAD~3..HEAD, ~10L) between Step 0b and Decision Tree — skips the DRY scan on cycles with zero src/ or apps/*/src/ changes, mirroring claude-manager-helper/flow/main.md's precedent; the 3 every-scan sweeps stay unconditional. 2026-08-22 (router relay, same shape as CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT's digest-predict fix, commit 0225479e0): corrected Memory + State's notebook-write from mislabeled "(OVERWRITE)" + invisible `### Scan NNN` template to the AC-6-canonical APPEND class (dated `## ` section/cycle) + RETIRED note explaining the root cause (~21L net) — doc-fix only, notebook itself (`## 2026-08 Sessions` + `### Session N` history) not touched, archive-split tracked separately. -->

# Code Janitor — Main Flow

**Tools:** `docs/agents/tools/package/code-janitor.md`

## Input
Codebase diff (last 3 commits) or full scan trigger

## Output
Direct fixes committed | Backlog tasks created | `docs/data/code-janitor-known-findings.json` updated

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `code-janitor`)

## Pre-Check (gates ONLY the Decision-Tree DRY scan below — CADRAT-3)
```bash
git diff --name-only HEAD~3..HEAD
```
Scope: `src/**` | `apps/*/src/**` — the DRY-duplication scan's input surface (source code only).

**Routing:**
- Zero files under `src/` or `apps/*/src/` → SKIP the Decision-Tree DRY scan this cycle — skip straight to **Memory Prune Sweep** (below). The 3 every-scan sweeps (Memory Prune / Notebook Line-Cap / Cold Archive) stay UNCONDITIONAL on this gate — they sweep `docs/agent-memory/`/`docs/handoffs/`, not source code, and already carry their own internal no-op guards.
- Any match under `src/` or `apps/*/src/` → fall through to Decision Tree as normal.

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
Idempotent — safe every cycle. For each file over EITHER the line cap OR the byte cap
(dual-axis, `docs/data/file-size-caps.json`-driven — FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP,
2026-07-29), delegates to `scripts/agents-flow/notebook-auto-prune.sh` (same drop-oldest section
logic the PostToolUse hook uses — single source of truth, no duplicated pruning code) via
synthetic PostToolUse JSON.
Emits the same `notebook-unparseable-*`/`notebook-single-section-breach-*` safe-fail signals to
`docs/signals/` on the rare cases the hook itself cannot safely auto-prune (no `## ` sections,
or only 1 section left and still over cap) — those require manual review, not auto-action here.
Reusable-Scripts pointer: `docs/policies/dev-standards.md` § Script Persistence.
Test: `scripts/agents-flow/notebook-linecap-sweep.test.sh`.

---

## Cold Archive Sweep (every scan; internally monthly-guarded — TE-T33)

Caps the unbounded growth of `docs/handoffs/` (707+/1026 files >30d before this sweep
existed) and the non-`.md` leftovers in `docs/agent-memory/sessions/` that
`memory-prune-sweep.sh` (above) deliberately leaves alone, plus rotates
`docs/agent-memory/decisions/po-decisions.md` at the same 200L cap notebooks use. The
script self-guards to a no-op on every day except the 1st of the month — safe to run on
this cron's 6h cadence, costs one cheap date-check the other ~119 fires/month.

**CANONICAL SCRIPT:**
```bash
bash "$PROJECT_ROOT/scripts/agents-flow/cold-archive-sweep.sh"
```
Idempotent — safe every cycle. Three legs: (1) `docs/handoffs/*.md` >30d AND not
referenced by any OPEN `task_board` lane (backlog/ready/in_progress/review/qa) →
`docs/handoffs/archive/YYYY-MM/`; (2) `docs/agent-memory/sessions/*` non-`.md` files >30d
→ `docs/agent-memory/sessions/archive/YYYY-MM/` (the `.md` leg is already owned by
`memory-prune-sweep.sh` at a tighter 14d, flat-archive threshold — no overlap); (3)
`po-decisions.md` rotated via the SAME drop-oldest-`## ` algorithm as
`notebook-auto-prune.sh`, delegated through its opt-in
`NOTEBOOK_PRUNE_EXTRA_GOVERNED_PATH` governed-path hook — no duplicated prune logic.
Decision-journal archival (`docs/agent-memory/decisions/sprint-*.md`) is explicitly
OUT of scope here — SUPERSEDED by `scripts/agents-flow/decision-journal-archive.sh`
(status-based, not mtime-based; see that script's own header). Reusable-Scripts
pointer: `docs/policies/dev-standards.md` § Script Persistence.
Test: `scripts/agents-flow/cold-archive-sweep.test.sh`.

Commit any moved/pruned paths with explicit pathspecs (old AND new paths for the
handoffs/sessions moves, per feedback_pathspec_commit_drops_rename_deletion) alongside
the notebook commit below.

---

## Memory + State (every scan)
- **Notebook write** — APPEND class (per AC-6 canonical table — `code-janitor` is NOT an
  OVERWRITE agent) → skill: `.claude/skills/notebook-write/SKILL.md` (AC-1 dated `## `
  section; AC-2 3-section retention; AC-3 settled-write; AC-5 gate; AC-4 blank-state
  fallback). Body template for this agent — level-2 `## ` heading, ≤60L (`### Scan NNN`
  used previously is INVISIBLE to `notebook-auto-prune.sh`'s `^## ` boundary parser —
  never use `### ` for this heading):
```
## <YYYY-MM-DD>T<HH:MM>Z Scan NNN
- Checks: [which] | Findings: N new, M recurrent | Action: shipped X | backlog Y | clean
```
**RETIRED (this was the flow-doc-contradiction root cause, same shape as
CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT's digest-predict fix — do not
reproduce):** this section previously said "(OVERWRITE)" and templated a `### Scan NNN`
sub-heading, and cycles through 2026-08-22 in practice appended a `### Session NN (...)`
sub-heading under ONE permanent, undated `## 2026-08 Sessions` heading instead of opening a
`## ` section per cycle. An undated heading sorts to the pruner's MAX sentinel key —
permanently exempt from drop-oldest selection yet still byte-counted, so `section_count`
stayed pinned at 1 while the file kept growing byte-for-byte (confirmed live in this agent's
own Notebook Line-Cap Sweep log above, e.g. Session 59: "dev-rag-service.md 127L/23244B ...
0 pruned (safe-fail: unparseable or single-section constraint)" — `code-janitor.md` itself
hit the same 194L/15662B-and-climbing state in the 2026-08-15 sweep before this fix).
`notebook-linecap-sweep.sh` could only safe-fail (`notebook_single_section_overage_breach`,
no truncation — correct hook behavior, not a hook defect) on a file shaped like this. Every
cycle forward opens its OWN `## ` section per the template above. Migrating existing history
(`## 2026-08 Sessions` + its `### Session N` sub-blocks) to
`docs/agent-memory/notebooks/archive/code-janitor-*.md` is separate, tracked work — not done
from this flow (see notebook-write SKILL AC-2a for the archive-then-drop pattern).

- **Commit notebook**:
**Commit (pathspec-scoped)** — code-janitor is invoked by cron (not dispatcher), so uses direct pathspec commit instead of commit-mutex (dispatcher-only per INV-GATEWAY-1):
```bash
git add docs/agent-memory/notebooks/code-janitor.md
git commit -m "chore(memory/code-janitor): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/code-janitor.md
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits
- State: `docs/data/code-janitor-known-findings.json`:
```json
{"scan_date":"2026-04-26","findings":[{"id":"DRY-1","pattern":"...","status":"shipped|proposed"}]}
```

**DJ-GATE-1** (before any task DONE/REVIEW flip): run skill `.claude/skills/decision-journal/SKILL.md` § Write Entry — gate: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

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
