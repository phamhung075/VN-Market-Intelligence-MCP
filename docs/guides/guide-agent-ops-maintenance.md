> Parent: [guide-agent-ops.md](./guide-agent-ops.md)

# Reports, Maintenance & Responsibility (Sections 9-12)

---

## Section 9: Actionable Reports

Every WORK/BUG message must help another agent or user make a decision.

### WORK Channel

```
[<Agent Name>] HH:MM UTC — <headline: what happened>
  Found: <key finding other agents can use>
  For: <who should care> (<why>)
  Regime: <context> | Next: <when/what>
```

### BUG Channel

```
[<Agent Name>] SEVERITY
  What: <tool/step that failed>
  Impact: <what's degraded, which agents affected>
  For: <ops|developer> — <specific action needed>
```

---

## Section 10: Document Self-Maintenance

Each agent maintains their own zone. Like an employee who keeps their processes documented.

### What Agents Self-Maintain

| Document | Action | When |
|----------|--------|------|
| Own `.claude/agents/<id>.md` | Update version, fix capabilities | Doc self-heal |
| Own `docs/agents/<id>/flow/*.md` | Fix tool names, steps, add missing steps | Doc self-heal |
| Own notebook | Overwrite with fresh lessons | End of cycle |
| Own session logs | Append cycle entry | Every cycle |
| Own service docs | Update README | After code tasks |

### Scoped to Own Zone

Doc self-heal only edits files in `document_zone.owns_controlled` and `owns_autonomous`. If a doc **outside** your zone needs fixing -> post to WORK:
```
[<Agent Name>] Doc fix needed: <file> — <what's wrong>. Owner: <owning-agent>
```

---

## Section 11: Document Registry — No Ghosts

Every file an agent creates must be tracked. No phantom files.

```yaml
document_registry:
  static:
    - path: .claude/agents/<agent-id>.md
      type: definition
    - path: docs/agents/<agent-id>/flow/cycle.md
      type: flow

  dynamic:
    - pattern: docs/agent-memory/notebooks/<agent-id>.md
      type: notebook
      lifecycle: persistent, append-per-cycle
```

### Anti-Ghost Rules

1. **Before creating any file:** Check if a `dynamic` pattern covers it. If not -> the agent MUST NOT create it.
2. **End-of-cycle registry check:** Verify all files created this cycle match a `static` or `dynamic` pattern.
3. **If an unregistered file is found:** Add pattern to `document_registry.dynamic` or report to WORK channel.

---

## Section 12: Agent Responsibility Model

Each agent = responsible enterprise employee. Behaviors: prepares before working, loads minimum context, learns from experience, communicates usefully, maintains workspace, respects boundaries, shares knowledge, fails gracefully, doesn't repeat mistakes, tracks all files, stays lean, validates before sending, grounds every claim, rates own confidence, degrades gracefully, explains decisions, reviews own quality.
