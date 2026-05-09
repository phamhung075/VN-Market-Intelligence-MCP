# Agent Father — Keep (Maintenance) Flow

**Tools:** `.claude/tools/package/agent-father.md`

## Input

- `trigger` — `manual` (user-invoked) or `scheduled` (periodic)

## Output

Maintenance report with: orphan scan, roster accuracy, top-5 checks, auto-fixes applied, escalations.

---

## Error Boundary

Uses **graceful degradation** (guide Section 18.4):
- If individual agent check fails → SKIP, continue sweep
- Tag report `PARTIAL` if >20% of agents could not be checked
- EXIT only if guide or roster cannot be loaded

---

## Steps

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`
- Check carry-over from last maintenance run (known issues, deferred fixes)

**1. Orphan detection**

Scan for files that exist without a matching agent definition:

```
# Flow dirs without matching agent
Glob: .claude/flows/*/
Compare against: Glob .claude/agents/*.md

# Notebooks without matching agent
Glob: docs/agent-memory/notebooks/*.md
Compare against: Glob .claude/agents/*.md

# Tool packages without matching agent
Glob: .claude/tools/package/*.md
Compare against: Glob .claude/agents/*.md
```

Classify findings:
- **ORPHAN_FLOW** — flow directory exists but no `.claude/agents/<name>.md`
- **ORPHAN_NOTEBOOK** — notebook exists but no matching agent
- **ORPHAN_PACKAGE** — tool package exists but no matching agent
- **MISSING_FLOW** — agent exists but flow path does not resolve
- **MISSING_NOTEBOOK** — agent exists but notebook does not exist

**2. Roster accuracy**

```
# Filesystem agents
Glob: .claude/agents/*.md → extract filenames → set A

# Roster entries
Grep: "\.md" .claude/knowledge/agent-roster.md → extract filenames → set B
```

Compare:
- `A - B` = **UNREGISTERED** (in filesystem, not in roster)
- `B - A` = **PHANTOM** (in roster, not in filesystem)

**3. Top-5 critical checks per agent**

Lightweight sweep — Grep-based, no full file reads:

| # | Check | Method | Auto-fixable? |
|---|-------|--------|--------------|
| 1 | Has `fail-loud-protocol` reference | `Grep "fail-loud-protocol" <agent>.md` | YES — add to always_load |
| 2 | Has `Error Boundary` in flow | `Grep "Error Boundary" <flow>.md` | NO — needs manual authoring |
| 3 | Has `boundary_rules` section | `Grep "boundary_rules" <agent>.md` | NO — needs manual authoring |
| 4 | Flow path resolves | Read first line of flow file | YES — fix path if obvious typo |
| 5 | Version not >90 days stale | `Grep "version:" <agent>.md`, parse date | YES — update to today |

**4. Auto-fix safe violations**

Apply fixes ONLY for mechanical/cosmetic issues:

| Fix | Action | Condition |
|-----|--------|-----------|
| Missing fail-loud reference | Add `- path: .claude/knowledge/fail-loud-protocol.md` to `always_load` | Check #1 FAIL |
| Stale version date | Update `version: "YYYY-MM-DD"` to today | Check #5 FAIL, >90 days |
| Missing roster entry | Add row to appropriate team table | UNREGISTERED from Step 2 |
| Missing notebook | Create scaffold from template | MISSING_NOTEBOOK from Step 1 |

**DO NOT auto-fix:**
- Missing Error Boundary (requires understanding agent's work)
- Missing boundary_rules (requires understanding agent's scope)
- Missing inter_agent routing (requires understanding agent's partners)
- Structural issues (wrong type, wrong model, wrong tools)

Log every auto-fix with: file, what was changed, guide reference.

**5. Stale session log report**

```
# Find session logs older than 30 days
Glob: docs/agent-memory/sessions/*.md
```

Report count of stale logs per agent. Do NOT delete — information only.

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
| ORPHAN_FLOW | .claude/flows/old-agent/ | Delete or create matching agent |
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

**Session log** → append to `docs/agent-memory/sessions/YYYY-MM-DD-agent-father.md`:
```
### Keep (maintenance) HH:MM
- Trigger: <manual|scheduled>
- Agents scanned: N
- Auto-fixes: M
- Escalations: K
- Orphans: O
- Lesson: <any pattern noticed across agents>
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Step 7 — PO handoff if findings require dev work

If maintenance found escalations, broken agents, missing critical sections, structural issues, or orphans needing attention:

1. Compile findings summary for PO with:
   - Each issue: what's wrong, which agent/file, severity, guide reference
   - Suggested fix category: `fix` | `chore` | `refactor`
   - Affected area: agent name, flow path, or knowledge file

2. **Spawn PO agent** with prompt:
   ```
   run .claude/flows/po/main.md

   ## Agent-Father Maintenance Findings (cycle N)
   {paste findings table here}

   Create sprint tasks for these issues. Prioritize by severity.
   ```

Skip this step ONLY if zero escalations and all checks passed.

## RETURN

```
DONE: Maintenance sweep — N agents, M auto-fixes, K escalations
NEXT: po (spawned with findings) | user (if clean)
PIPELINE: complete
QUALITY: full | partial
```
