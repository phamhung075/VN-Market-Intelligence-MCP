# Agent Father — Review Flow

**Tools:** `.claude/tools/package/agent-father.md`

## Input

- `target` — agent name(s) or `"all"` for full ecosystem audit

## Output

Structured compliance review report with per-agent findings scored CRITICAL/HIGH/MEDIUM/LOW.

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: **Graceful degradation** — SKIP unreadable agent, continue. Tag `PARTIAL` if >20% skipped. EXIT only if guide cannot be loaded.

---

## Steps

**0a. Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**0b. Read notebook** → `docs/agent-memory/notebooks/agent-father.md`

**1. Build agent list**

If `target = "all"`:
```
Glob: .claude/agents/*.md
```
Exclude: `semble-search.md` (skill, not agent per roster)

If specific names: validate each exists via Glob.

Count total agents for progress tracking.

**2. Load guide compliance checklist**

Load guide index, then load `guide-agent-definition.md` + `guide-quality.md` for the compliance matrix:

| # | Check | Guide Part / Section | Severity if Missing |
|---|-------|---------------------|-------------------|
| 1 | YAML frontmatter complete (name, color, description, tools, model) | `guide-agent-definition.md` 5.1 | CRITICAL |
| 2 | `boundary_rules.scope` + `on_error` + `forbidden_outputs` exist | `guide-agent-definition.md` 5.7 | CRITICAL |
| 3 | `knowledge.always_load` includes `fail-loud-protocol.md` | `guide-agent-definition.md` 5.8 | CRITICAL |
| 4 | `KNOWLEDGE LOAD FAILURE PROTOCOL` inline block exists | `guide-agent-definition.md` 5.13 | CRITICAL |
| 5 | Flow file(s) exist at `flow.default` path | `guide-agent-definition.md` 5.11 | CRITICAL |
| 6 | Each flow has `## Error Boundary` section | `guide-flows.md` 6.x | HIGH |
| 7 | Each flow has `## RETURN` block (dev) or session log step (cowork) | `guide-flows.md` 6.x | HIGH |
| 8 | `permissions.channels` defined with rules | `guide-agent-definition.md` 5.5 | HIGH |
| 9 | `inter_agent` section exists (recv + send) | `guide-agent-definition.md` 5.9b | HIGH |
| 10 | `memory.notebook` + `memory.session_log` defined | `guide-agent-definition.md` 5.12 | HIGH |
| 11 | Tool package file exists at `tools_package` path | `guide-agent-definition.md` 5.4b | MEDIUM |
| 12 | Notebook file exists at `memory.notebook` path | `guide-agent-ops.md` 7 | MEDIUM |
| 13 | Agent registered in `agent-roster.md` | `guide-skills-registration.md` 16 | MEDIUM |
| 14 | `document_zone` section exists | `guide-agent-definition.md` 5.3 [PLANNED] | LOW |
| 15 | `document_registry` section exists | `guide-agent-definition.md` 5.4 [PLANNED] | LOW |

**3. Execute checks per agent**

For each agent in the list:
1. Read agent definition file
2. Determine agent type: `schedule:` present → cowork, `identity.mindset:` → dev, `zone:` → dev-microservice
3. Run all 15 checks, scoring each PASS / WARN / FAIL
4. Record findings with: check #, result, detail (what's missing/wrong), guide ref

Token-efficient approach:
- Use `Grep` to check for key patterns (e.g., `fail-loud-protocol`, `Error Boundary`, `RETURN`) instead of reading entire files
- Only `Read` full file if Grep reveals issues that need context

**4. Cross-agent consistency**

After individual checks, run cross-agent validations:

| Check | Method |
|-------|--------|
| Routing symmetry | For each agent's `inter_agent.send`, verify target agent's `recv` includes sender |
| Roster completeness | Compare Glob agents vs roster entries — find UNREGISTERED (in filesystem, not in roster) and PHANTOM (in roster, not in filesystem) |
| Signal bus coverage | For cowork agents: verify every `signals.produces` has at least one consumer in another agent's `signals.consumes` |
| Dispatch coverage | Verify every agent in roster has a matching dispatch entry (or explicit exclusion reason) |

**5. Generate review report**

Structure:

```markdown
# Agent Compliance Review — YYYY-MM-DD

## Summary
- Agents reviewed: N / M total
- Status: FULL | PARTIAL (N agents skipped)
- CRITICAL findings: N
- HIGH findings: N
- MEDIUM findings: N
- LOW findings: N

## Findings by Severity

### CRITICAL
| Agent | Check | Detail | Guide Ref |
|-------|-------|--------|-----------|
| dev-foo | #3 fail-loud missing | No fail-loud-protocol in always_load | 5.8 |

### HIGH
...

### MEDIUM
...

### LOW
...

## Cross-Agent Issues
| Issue | Agents Involved | Detail |
|-------|----------------|--------|
| Routing asymmetry | developer → qa | developer sends to qa, but qa.recv missing developer |
| Unregistered | dev-new-agent | In filesystem but not in agent-roster.md |

## Recommendations
1. [CRITICAL] Add fail-loud-protocol to dev-foo — Section 5.8
2. [HIGH] Add Error Boundary to dev-bar/main.md — Section 6.2
```

**6. Priority ranking**

Order recommendations by:
1. CRITICAL first (blocks agent from operating safely)
2. HIGH second (degrades agent quality)
3. MEDIUM third (missing optional patterns)
4. LOW last (future-ready patterns)

---

**Session log** → append to `docs/agent-memory/sessions/YYYY-MM-DD-agent-father.md`:
```
### Review (<target>) HH:MM
- Agents: N reviewed / M total
- Findings: C critical, H high, M medium, L low
- Cross-agent: N issues
- Decision: <which agents need immediate attention>
```

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Reviewed N agents — C critical, H high, M medium, L low findings
NEXT: user | address CRITICAL findings first
PIPELINE: complete
QUALITY: full | partial (if agents skipped)
```
