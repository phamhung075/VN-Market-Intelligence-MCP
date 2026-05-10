# Claude Manager Helper — Main Flow (10 Passes)

**Tools:** `.claude/tools/package/claude-manager-helper.md`

## Input
`git diff --name-only HEAD~3..HEAD` → changed file groups

## Output
Fixed violations | pass report | `send_telegram(channel="bug")` on issues

---

## Pre-Check
```bash
git diff --name-only HEAD~3..HEAD
```
Groups:
- `GROUP_KNOWLEDGE` = `.claude/knowledge/*.md` | `docs/data/*.json` | `docs/*.md`
- `GROUP_AGENTS` = `.claude/agents/*.md` | `cowork-workspace-team-claude-desktop/*.md`
- `GROUP_TOOLS` = `apps/mcp-server/src/interface/mcp/tools/*.ts`
- `GROUP_ROOT` = `CLAUDE.md` | `docs/TASKS.md` | `docs/SPRINT_GOAL.md`
- `GROUP_MEMORY` = `memory/MEMORY.md`

**ALL empty → "No changes. Skip." EXIT.**

## Pass 0: File Location Audit (ALWAYS runs — not skippable)
Detect files created in wrong locations. Auto-move violations:
```bash
ls *.md | grep -vE "^(CLAUDE|README)\.md$"                                  # root .md violations
find . -name "TASK_REPORT_*.md" -not -path "./reports/*" -not -path "./.claude/worktrees/*"
find apps/mcp-server -name "*.md" -not -path "*/node_modules/*" -not -name "README.md"
find . -name "*-session*.md" -not -path "./docs/agent-memory/sessions/*" -not -path "./.claude/*"
```
For each violation → move to correct location per `.claude/knowledge/docs-organization.md` → log in Pass 10 report.

## Pass 1: Tree-Map Integrity
**SKIP IF** `GROUP_KNOWLEDGE` empty.
Verify nodes exist | check orphans | dependency direction (no child→parent)

## Pass 2: Volatile vs Logic Split
**SKIP IF** `GROUP_KNOWLEDGE` + `GROUP_AGENTS` both empty.
Grep knowledge+agents for hardcoded volatile values → replace with pointers
**SKIP IF** `GROUP_TOOLS` empty. Else update `docs/data/*.json` counts.

## Pass 3: Agent Pointer Validation
**SKIP IF** `GROUP_AGENTS` empty.
All pointer targets exist | follow tree-map paths | summaries present.

## Pass 4: CLAUDE.md Bloat
**SKIP IF** `GROUP_ROOT` empty OR `wc -l CLAUDE.md` ≤ 120.
> 120 lines → move bloat to knowledge/docs.

## Pass 5: Size Caps
**SKIP IF** `GROUP_ROOT` empty OR (docs/TASKS.md ≤ 80 AND docs/SPRINT_GOAL.md ≤ 30).
docs/TASKS.md > 80 → archive Done. docs/SPRINT_GOAL.md > 30 → delete old goals.

## Pass 6: Memory Hygiene
**SKIP IF** `GROUP_MEMORY` + `GROUP_KNOWLEDGE` both empty.
`memory/MEMORY.md` entries: accurate + not stale. Delete knowledge-file entries.

## Pass 7: Boilerplate Dedup
**SKIP IF** `GROUP_AGENTS` empty.
Repeated blocks (>3 lines in 3+ files) → extract to `.claude/knowledge/`

## Pass 8: Telegram Compliance
**SKIP IF** all of `GROUP_AGENTS` + `GROUP_KNOWLEDGE` + `GROUP_ROOT` empty.
Channel rules: MARKET=user alerts (Commander+06+07) | WORK=dev status (dev team+unified) | BUG=ALL errors
Grep `send_telegram` calls | errors→"work" must be "bug" | legacy "chat"/"report" → replace
Auto-fix ALL safe violations. Unresolvable → launch `architect` subagent.

## Pass 9: Tool-Agent Alignment
**SKIP IF** `GROUP_TOOLS` + `GROUP_AGENTS` both empty.
Compare agents vs `docs/data/tool-registry.json` → MISSING/invisible/duplicate/overlapping
Issues → `architect` subagent + `reports/TOOL_AGENT_AUDIT_<YYYY-MM-DD>.md` + BUG

## Pass 10: Report
```
Pre-check:      N groups (or "no changes — exited")
Pass 0 Location:   OK | N moved (file → correct path)
Pass 1 Tree-map:   OK | SKIPPED | N fixed
Pass 2 JSON drift: OK | SKIPPED | N updated
Pass 3 Dangling:   OK | SKIPPED | N repaired
Pass 4 CLAUDE.md:  OK | SKIPPED | N trimmed
Pass 5 Size caps:  OK | SKIPPED | archived N
Pass 6 Memory:     OK | SKIPPED | N removed
Pass 7 Dedup:      OK | SKIPPED | N extracted
Pass 8 Telegram:   OK | SKIPPED | N fixed | N → architect
Pass 9 Tool-Agent: OK | SKIPPED | N → architect
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook**:
```bash
git add docs/agent-memory/notebooks/claude-manager-helper.md
git commit -m "chore(memory/claude-manager-helper): notebook YYYY-MM-DD"
```
Convention: `.claude/knowledge/commit-convention.md` § Notebook Commits

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: Critical misalignment (Passes 8-9) → escalate to architect BEFORE auto-fixing.

## RETURN

```
DONE: 10-pass audit complete — N passes run | M auto-fixes applied | K escalated to architect
NEXT: user | architect (if critical issues escalated)
PIPELINE: complete
QUALITY: full | partial (if passes skipped due to no changes)
```
