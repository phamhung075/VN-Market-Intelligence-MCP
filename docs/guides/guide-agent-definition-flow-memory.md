> Parent: [guide-agent-definition.md](./guide-agent-definition.md)

# Flow Assignment & Memory Configuration

---

## Flow Assignment

```yaml
  flow:
    default: .claude/flows/<agent-id>/cycle.md
```

**With multiple flows (dev agents):**
```yaml
  flow:
    default: .claude/flows/developer/microservice-main.md
    catalog:
      - name: main
        path: .claude/flows/developer/microservice-main.md
        trigger: task_assigned_by_pm
        input: [TASK_NNN.md, task/NNN branch]
        output: impl committed | tests pass | handoff^ | qa notified
      - name: doc-review
        path: .claude/flows/developer/doc-review.md
        trigger: post_code_change
        input: [changed files list]
        output: docs updated | graphify run
```

---

## Memory Configuration

```yaml
  memory:
    notebook: docs/agent-memory/notebooks/<agent-id>.md
    append_every_cycle: true
    # Notebooks to read for cross-team context (L3 lazy-load) [PLANNED]
    reads_notebooks:
      - <agent-id-1>    # Why: <reason>
      - <agent-id-2>    # Why: <reason>
```
