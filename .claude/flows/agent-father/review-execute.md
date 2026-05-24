> Parent: [./review.md](./review.md)

# Agent Father — Review: Execute + Report Phase (Steps 3–6)

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

**Notebook commit** — append to `docs/agent-memory/notebooks/agent-father.md`:
```
### Review (<target>) HH:MM
- Agents: N reviewed / M total
- Findings: C critical, H high, M medium, L low
- Cross-agent: N issues
- Decision: <which agents need immediate attention>
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

## RETURN

```
DONE: Reviewed N agents — C critical, H high, M medium, L low findings
NEXT: po (if any CRITICAL/HIGH — open fix tasks via dev-team chain) | idle (otherwise — cron will retry)
PIPELINE: complete
QUALITY: full | partial (if agents skipped)
```
