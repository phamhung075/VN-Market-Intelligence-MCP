<!-- size-justification: 194L — 10-pass audit dispatcher with JUMP-TO anchors per pass + Mon/Thu Pass-9b gate + Pass 5b context-bloat signal consumer; each pass body is a ≤8-line SKIP-IF stub, splitting per pass would explode file count for no gain. +1L: FIX-CMH-NOTEBOOK-WRITE-SELFCAP-200L APPEND class annotation. FIX-CMH-OBSOLETE-FILE-CLEANUP 2026-07-20: new Pass 0b (always-runs sibling of Pass 0, calls scripts/audits/clean-obsolete-files.sh — quarantine-first delete) + Pass 0 disposition-gate fix (stop relocating pattern-A/B garbage into committable docs/archive/) + Pass 10 report line (+22L). Still under the flow-file's non-agent-specific 200L soft ceiling used elsewhere in this repo (agent-notebook/skill-file class); no split point below this — each pass is a single load-bearing SKIP-IF/ALWAYS-RUNS stub. -->
# Claude Manager Helper — Main Flow (10 Passes)

**Tools:** `docs/agents/tools/package/claude-manager-helper.md`

## Input
`git diff --name-only HEAD~3..HEAD` → changed file groups · weekday (Mon/Thu = full-subtree day)

## Output
Fixed violations | pass report | `send_telegram(channel="bug", message=...)` on issues

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO |
|---|---|
| Cron tick (any) | `precheck` |
| Mon/Thu cron, no diff | `pass-9b` (skip Passes 1–9, full-subtree heal only) |
| Memory-only diff (`GROUP_MEMORY` only) | `pass-6` |
| Tools-only diff (`GROUP_TOOLS` only) | `pass-2` (JSON drift) then `pass-9` |
| Root-only diff (`GROUP_ROOT` only) | `pass-4` (CLAUDE.md bloat) |
| Empty groups, non-Mon/Thu | `end` |

After any in-flow pass, continue linearly to the next pass — SKIP-IF stubs inside each pass auto-skip irrelevant work. Use JUMP TO only at the top dispatcher or to fast-exit.

---

<!-- jump:precheck -->
## Pre-Check
```bash
git diff --name-only HEAD~3..HEAD
date +%u   # 1=Mon ... 7=Sun → Pass 9b gate = 1 or 4
```
Groups:
- `GROUP_KNOWLEDGE` = `docs/{policies,protocols,standards,references}/*.md` | `docs/data/*.json` | `docs/*.md`
- `GROUP_AGENTS` = `.claude/agents/*.md` | `docs/agents/*/flow/*.md`
- `GROUP_TOOLS` = `apps/mcp-server/src/interface/mcp/tools/*.ts`
- `GROUP_ROOT` = `CLAUDE.md` | `docs/data/orch/orch-state.json`
- `GROUP_MEMORY` = `memory/MEMORY.md`

**Routing:**
- ALL groups empty AND weekday ∈ {Mon, Thu} → JUMP TO `pass-9b` (full-subtree heal always runs Mon/Thu).
- ALL groups empty AND other days → JUMP TO `end` ("No changes. Skip.").
- Any group non-empty → fall through to Pass 0.

<!-- jump:pass-0 -->
## Pass 0: File Location Audit (ALWAYS runs — not skippable)
Detect files created in wrong locations. Auto-move violations:
```bash
ls *.md | grep -vE "^(CLAUDE|README)\.md$"                                  # root .md violations
find . -name "TASK_REPORT_*.md" -not -path "./reports/*" -not -path "./.claude/worktrees/*"
find apps/mcp-server -name "*.md" -not -path "*/node_modules/*" -not -name "README.md"
find . -name "*-session*.md" -not -path "./.claude/*"
```
**Disposition gate (FIX-CMH-OBSOLETE-FILE-CLEANUP §1b):** before `mv`-ing a violation, check it against the
pattern-A/B allow-list in `docs/policies/obsolete-file-cleanup.md` § 2 (unexpanded-shell-var names,
`*.tmp`/`*.json.tmp` leftovers). A match is **excluded from relocation** — leave it at its current path for
Pass 0b to quarantine. NEVER `mv` pure garbage into `docs/archive/` or any other committable path (it is
NOT gitignored — that just launders garbage from one committable location to another). Only genuine
misplacements (not allow-list matches) are relocated per `docs/policies/docs-organization.md` → log in
Pass 10 report.

<!-- jump:pass-0b -->
## Pass 0b: Obsolete-File Cleanup (ALWAYS runs — not skippable, sibling of Pass 0)
Quarantine-first delete for allow-listed garbage (unexpanded-shell-var names, aged atomic-write `.tmp`
leftovers, superseded per-cycle snapshots). Policy SSOT: `docs/policies/obsolete-file-cleanup.md`.
**Canonical script** (SSOT: `docs/policies/dev-standards.md` § Script Persistence):
```bash
scripts/audits/clean-obsolete-files.sh   # dry-run by default — deletes nothing, prints candidate report
```
`--live` (or env `OBSOLETE_CLEANUP_LIVE=1`) moves candidates into `docs/data/.trash/<date>/` with a
`manifest.json` audit trail — never a blind `rm`; a `--dry-run` flag always wins over the env. **Signals
boundary:** `docs/signals/*.json` is DETECT-ONLY here — the script never deletes or moves them; >50
top-level files emits a DRAIN-BEHIND BUG notice for the dev-team drain owner
(`docs/agents/dev-team/flow/drain-signals.md`) instead of touching the directory. Log candidate/moved/
drain-behind counts in Pass 10.

<!-- jump:pass-1 -->
## Pass 1: Tree-Map Integrity
**SKIP IF** `GROUP_KNOWLEDGE` empty.
Verify nodes exist | check orphans | dependency direction (no child→parent)

<!-- jump:pass-2 -->
## Pass 2: Volatile vs Logic Split
**SKIP IF** `GROUP_KNOWLEDGE` + `GROUP_AGENTS` both empty.
Grep knowledge+agents for hardcoded volatile values → replace with pointers
**SKIP IF** `GROUP_TOOLS` empty. Else update `docs/data/*.json` counts.

<!-- jump:pass-3 -->
## Pass 3: Agent Pointer Validation
**SKIP IF** `GROUP_AGENTS` empty.
All pointer targets exist | follow tree-map paths | summaries present.

<!-- jump:pass-4 -->
## Pass 4: CLAUDE.md Bloat
**SKIP IF** `GROUP_ROOT` empty OR `wc -l CLAUDE.md` ≤ 120.
> 120 lines → move bloat to knowledge/docs.

<!-- jump:pass-5 -->
## Pass 5: Size Caps
**SKIP IF** `GROUP_ROOT` empty OR (`orch-state.json .task_board` task count ≤ 80 AND `.sprint_goal.entries[]` count ≤ 15).
`.task_board` task count > 80 → alert PM to run task-archive sub-flow. `.sprint_goal.entries[]` count > 15 → alert PO to close old sprint entries.

<!-- jump:pass-5b -->
## Pass 5b: Context-Bloat Signal Consumer
**SKIP IF** no `docs/signals/context-bloat-*.json` files exist.
```bash
ls docs/signals/context-bloat-*.json 2>/dev/null || true
```
For each breach signal:
1. Read `payload.file`, `payload.class`, `payload.cap`, `payload.line_count`
2. Apply prune action by class:
   - `agent-notebook` → trim to ≤200 L (keep recent entries, archive older to `## Archive` section)
   - `sprint-task-index` → move DONE tasks to `orch-state.json .task_board.archive[]`, target ≤80 active tasks
   - `flow-file` | `skill-file` | `agent-definition` → check for `<!-- size-justification:` comment; if absent AND still over cap → flag to architect via subagent spawn (cannot auto-split safely)
3. Move processed signal: `mv <signal> docs/signals/processed/<signal-filename>`
   (create `docs/signals/processed/` if absent)
4. Log in Pass 10: "Pass 5b context-bloat: N breaches | M pruned | K escalated to architect"

<!-- jump:pass-6 -->
## Pass 6: Memory Hygiene
**SKIP IF** `GROUP_MEMORY` + `GROUP_KNOWLEDGE` both empty.
`memory/MEMORY.md` entries: accurate + not stale. Delete knowledge-file entries.

<!-- jump:pass-7 -->
## Pass 7: Boilerplate Dedup
**SKIP IF** `GROUP_AGENTS` empty.
Repeated blocks (>3 lines in 3+ files) → extract to `docs/{policies,protocols,standards,references}/`

<!-- jump:pass-8 -->
## Pass 8: Telegram Compliance
**SKIP IF** all of `GROUP_AGENTS` + `GROUP_KNOWLEDGE` + `GROUP_ROOT` empty.
Channel rules: MARKET=user alerts (Commander+06+07) | WORK=dev status (dev team+unified) | BUG=ALL errors
Grep `send_telegram` calls | errors→"work" must be "bug" | legacy "chat"/"report" → replace
Auto-fix ALL safe violations. Unresolvable → launch `architect` subagent.

<!-- jump:pass-9 -->
## Pass 9: Tool-Agent Alignment
**SKIP IF** `GROUP_TOOLS` + `GROUP_AGENTS` both empty.
Compare agents vs `docs/data/tool-registry.json` → MISSING/invisible/duplicate/overlapping
Issues → `architect` subagent + `reports/TOOL_AGENT_AUDIT_<YYYY-MM-DD>.md` + BUG

<!-- jump:pass-9b -->
## Pass 9b: Full-Subtree Heal (always runs on Mon/Thu cron)
After git-diff passes complete (or directly when reached via Mon/Thu fast-path), invoke **skill: `.claude/skills/doc-heal-system/SKILL.md`** for full-subtree audit (catches drift that git-diff missed: orphan files, tree-map mismatches, hardcoded counts, size caps, factory drift). Skill writes `reports/DOC_HEAL_<YYYY-MM-DD>.md` and escalates semantic drift to architect/agent-father/cowork-refactory-expert.

<!-- jump:pass-10 -->
## Pass 10: Report
```
Pre-check:      N groups (or "no changes — exited" / "Mon/Thu fast-path → pass-9b only")
Pass 0 Location:   OK | N moved (file → correct path) | SKIPPED (fast-path)
Pass 0b Obsolete:  OK | N candidates | M quarantined | DRAIN-BEHIND:<Y|N> | SKIPPED (fast-path)
Pass 1 Tree-map:   OK | SKIPPED | N fixed
Pass 2 JSON drift: OK | SKIPPED | N updated
Pass 3 Dangling:   OK | SKIPPED | N repaired
Pass 4 CLAUDE.md:  OK | SKIPPED | N trimmed
Pass 5 Size caps:  OK | SKIPPED | archived N
Pass 5b Bloat:     OK | SKIPPED | N pruned | K escalated to architect
Pass 6 Memory:     OK | SKIPPED | N removed
Pass 7 Dedup:      OK | SKIPPED | N extracted
Pass 8 Telegram:   OK | SKIPPED | N fixed | N → architect
Pass 9 Tool-Agent: OK | SKIPPED | N → architect
Pass 9b Doc-Heal:  OK | N auto-fixes | K escalated
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
  Notebook-write class: **APPEND** (AC-6) — compose settled ≤200L body in memory (AC-3 drop-oldest loop if > 200L) before single Write. SSOT: `.claude/skills/notebook-write/SKILL.md`.

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/claude-manager-helper.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/claude-manager-helper.md
git commit -m "chore(memory/claude-manager-helper): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: Critical misalignment (Passes 8-9) → escalate to architect BEFORE auto-fixing.

## RETURN

```
DONE: 10-pass audit complete — N passes run | M auto-fixes applied | K escalated to architect
NEXT: agents-architect (if critical issues escalated — they author a brief → agent-father) | idle (otherwise — cron will retry)
PIPELINE: complete
QUALITY: full | partial (if passes skipped due to no changes)
```
