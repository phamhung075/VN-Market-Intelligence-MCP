> Parent: [guide-agent-definition.md](./guide-agent-definition.md)

# Permissions, Constraints & Boundary Rules

---

## Permissions

```yaml
  permissions:
    tools_packages:
      - bootstrap
      - <domain-package>
    channels:
      market:
        write: true|false
        rule: <rule>
      work:
        write: true|false
        rule: <rule>
      bug:
        write: true|false
        rule: <rule>
```

---

## Constraints

```yaml
  constraints:
    session_log: mandatory
    # Booleans: tdd_mandatory, ddd_layers, no_verify, no_direct_vn_fetch, no_code_writing
    # Numerics: max_alerts_per_day, max_tasks_parallel, wip_limit
```

---

## Boundary Rules (Required)

```yaml
  boundary_rules:
    scope: "YOUR flow steps ONLY. <What you do>. Blocked = report + EXIT."
    on_error: "Tool fails after 1 retry -> send_telegram(bug) one-line error -> EXIT cycle. Do NOT investigate."
    forbidden_outputs:
      - "NEVER create files outside your document_registry"
      - "NEVER edit files outside your document_zone.owns_*"
      - "NEVER modify other agents' notebooks or session logs"
      - "NEVER diagnose infrastructure — that is ops/developer's job"
    token_rule: "Blocked = report + EXIT."
```
