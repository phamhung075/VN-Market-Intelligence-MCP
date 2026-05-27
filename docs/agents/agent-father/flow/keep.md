<!-- size-justification: 127L — atomic maintenance flow with inline 15-check audit table + 5-check sweep matrix; splitting individual check rows yields no token benefit. -->
# Agent Father — Keep (Maintenance) Flow — Thin Dispatcher

**Tools:** `docs/agents/tools/package/agent-father.md`

## Input

- `trigger` — `manual` (user-invoked) or `scheduled` (periodic)

## Output

Maintenance report with: orphan scan, roster accuracy, top-5 checks, auto-fixes applied, escalations.

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: **Graceful degradation** — SKIP failed checks, continue. Tag `PARTIAL` if >20% skipped. EXIT only if guide/roster unloadable.

---

## Steps

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`
- Check carry-over from last maintenance run (known issues, deferred fixes)

**1-2. Scan orphans + roster** → run sub-flow: `docs/agents/agent-father/flow/scan-orphans.md`

Output: ORPHAN_FLOW / ORPHAN_NOTEBOOK / ORPHAN_PACKAGE / MISSING_FLOW / MISSING_NOTEBOOK lists; UNREGISTERED / PHANTOM sets.

**3-5. Top-5 checks + auto-fix + stale notebook report** → run sub-flow: `docs/agents/agent-father/flow/sweep-fixes.md`

Output: auto-fix log (mechanical/cosmetic only); escalation list (anything requiring manual authoring); stale notebook counts.

**6. Generate maintenance report**

```markdown
# Agent Maintenance Report — YYYY-MM-DD

## Summary
- Agents scanned: N
- Auto-fixes applied: M
- Escalations (manual needed): K
- Orphans found: O
- Roster accuracy: N/M agents registered

## Orphans
| Type | Path | Recommendation |
|------|------|---------------|
| ORPHAN_FLOW | docs/agents/old-agent/flow/ | Delete or create matching agent |
| MISSING_NOTEBOOK | agent-x | Auto-created scaffold |

## Roster Issues
| Issue | Agent | Action |
|-------|-------|--------|
| UNREGISTERED | dev-new | Auto-added to Dev Team table |
| PHANTOM | old-agent | Remove from roster (no matching file) |

## Auto-Fixes Applied
| Agent | Fix | Guide Ref |
|-------|-----|-----------|
| dev-foo | Added fail-loud-protocol to always_load | 5.8 |
| dev-bar | Updated version from 2026-02-01 to 2026-05-07 | 5.1 |

## Escalations (Manual Action Required)
| Agent | Issue | Severity | Guide Ref |
|-------|-------|----------|-----------|
| dev-baz | Missing Error Boundary in flow | HIGH | 6.2 |
| dev-qux | No boundary_rules section | CRITICAL | 5.7 |

## Session Log Health
- Active (last 30 days): N agents
- Stale (>30 days): M agents
- No session logs: K agents
```

---

**Notebook commit** — append to `docs/agent-memory/notebooks/agent-father.md`:
```
### Keep (maintenance) HH:MM
- Trigger: <manual|scheduled>
- Agents scanned: N
- Auto-fixes: M
- Escalations: K
- Orphans: O
- Lesson: <any pattern noticed across agents>
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/agent-father.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/agent-father.md
git commit -m "chore(memory/agent-father): notebook YYYY-MM-DD"
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Step 7 — PO Handoff if Findings Require Dev Work

If maintenance found escalations, broken agents, missing critical sections, structural issues, or orphans needing attention:

1. Compile findings summary for PO with:
   - Each issue: what's wrong, which agent/file, severity, guide reference
   - Suggested fix category: `fix` | `chore` | `refactor`
   - Affected area: agent name, flow path, or knowledge file

2. **Spawn PO agent** with prompt:
   ```
   run docs/agents/po/flow/main.md

   ## Agent-Father Maintenance Findings (cycle N)
   {paste findings table here}

   Create sprint tasks for these issues. Prioritize by severity.
   ```

Skip this step ONLY if zero escalations and all checks passed.

## RETURN

```
DONE: Maintenance sweep — N agents, M auto-fixes, K escalations
NEXT: po (spawned with findings) | idle (if clean — next cron will sweep)
PIPELINE: complete
QUALITY: full | partial
```
