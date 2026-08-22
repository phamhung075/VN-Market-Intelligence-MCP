<!-- size-justification: 159L — atomic maintenance flow with inline 15-check audit table + 6-check sweep matrix (DEBUG-LOGGER-ROLLOUT-CHECK6 2026-08-22: sweep-fixes.md Check #5→#6, +1L, debug-logger-protocol wiring auto-fix); splitting individual check rows yields no token benefit. CADRAT-3 2026-08-04: added Pre-Check gate (git diff --name-only HEAD~3..HEAD, ~10L) before Steps 1-2 — skips the orphan+roster sweep on cycles with zero .claude/agents/*.md or docs/agents/*/flow/*.md changes, mirroring claude-manager-helper/flow/main.md's precedent; Steps 3-5 stay reachable and run with empty scan-orphans output. CHORE-TEAM-TOOL-RECHECK-LOCAL-CRON 2026-08-06 (+4L): new Step 5b dispatches to `flow/team-tool-recheck.md` (own artifact family, `docs/agent-memory/health/team-tool-recheck-*.md`) — re-establishes the dead cloud-RemoteTrigger writer's static, gateway-free subset on this file's existing daily cron cadence; runs unconditionally, independent of the Pre-Check gate above. Doc self-heal 2026-08-06T13:18Z keep cycle (+14L total): (1) the "Commit (mutex-guarded)" step prescribed `task_claim` via `mcp__gateway__call_tool`, a tool agent-father's own grant (`Read, Edit, Write, Glob, Grep, Bash`) does not include — confirmed live, call errored "No such tool available"; added a documented direct-pathspec-commit fallback (same `INV-GATEWAY-1` precedent commit-mutex/SKILL.md already carves out for gateway-less specialists). (2) Step 7's "Spawn PO agent" is equally unreachable — no `Agent` grant, same class as `feedback_devteam_flow_needs_nested_agent_spawn_subagent_cannot`; documented that findings go in RETURN instead and the spawning router owns the actual `po` dispatch. Both fixes make the step match what actually happens instead of prescribing an unreachable protocol. -->
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

**Pre-Check (gates ONLY the orphan+roster sweep below — CADRAT-3)**
```bash
git diff --name-only HEAD~3..HEAD
```
Scope: `.claude/agents/*.md` | `docs/agents/*/flow/*.md` — the orphan+roster scan's input surface.

**Routing:**
- Zero files under `.claude/agents/*.md` or `docs/agents/*/flow/*.md` → SKIP Steps 1-2 this cycle (no ORPHAN/MISSING/UNREGISTERED/PHANTOM findings possible without a change to the scanned surface) — go straight to **Step 3-5** with empty scan-orphans output.
- Any match → fall through to Steps 1-2 as normal.

**1-2. Scan orphans + roster** → run sub-flow: `docs/agents/agent-father/flow/scan-orphans.md`

Output: ORPHAN_FLOW / ORPHAN_NOTEBOOK / ORPHAN_PACKAGE / MISSING_FLOW / MISSING_NOTEBOOK lists; UNREGISTERED / PHANTOM sets.

**3-5. Top-6 checks + auto-fix + stale notebook report** → run sub-flow: `docs/agents/agent-father/flow/sweep-fixes.md`

Output: auto-fix log (mechanical/cosmetic only); escalation list (anything requiring manual authoring); stale notebook counts.

**5b. Team tool-grant vs declared-boundary recheck (CHORE-TEAM-TOOL-RECHECK-LOCAL-CRON)** → run sub-flow: `docs/agents/agent-father/flow/team-tool-recheck.md`

Writes `docs/agent-memory/health/team-tool-recheck-<date>-<time>.md` (own artifact family, separate from this agent's notebook). Runs every cycle (daily, this cron) — do not skip even when Steps 1-2 were skipped by the Pre-Check gate above, since a tool-grant drift is independent of `.claude/agents/*.md`/flow-file changes in the last 3 commits.

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
git commit -m "chore(memory/agent-father): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/agent-father.md
```
**Gateway-less exception (confirmed live 2026-08-06):** `.claude/agents/agent-father.md`'s tool
grant is `Read, Edit, Write, Glob, Grep, Bash` — no `mcp__gateway__call_tool` binding, so
`task_claim`/`task_release` above are unreachable (same gap `team-tool-recheck.md` already names
for its own live-probe subset). Fall back to a direct pathspec-scoped commit — no `task_claim`
wrapper, no bare/`-A` add — same `git add <own_paths>` → verify staged paths → `git commit --
<own_paths>` sequence, just without the lock. Same precedent as `commit-mutex/SKILL.md`'s own
`INV-GATEWAY-1` note ("specialists commit directly" for agents that lack the gateway binding).

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

**Nested-spawn limitation (confirmed 2026-08-06):** agent-father's own tool grant has no
`Agent`/spawn capability (same structural gap as `feedback_devteam_flow_needs_nested_agent_spawn_subagent_cannot`)
— a spawned subagent cannot literally perform step 2 above. Compile the findings table (step 1)
and surface it verbatim in the RETURN block below instead; the caller that spawned this
agent-father session (router) is the one with real `Agent` access and owns actually spawning
`po`. Do not silently skip the findings for lack of a spawn — put them in RETURN either way.

Skip this step ONLY if zero escalations and all checks passed.

## RETURN

```
DONE: Maintenance sweep — N agents, M auto-fixes, K escalations
NEXT: po (spawned with findings) | idle (if clean — next cron will sweep)
PIPELINE: complete
QUALITY: full | partial
```
