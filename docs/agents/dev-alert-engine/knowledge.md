> Parent: [../../../.claude/agents/dev-alert-engine.md](../../../.claude/agents/dev-alert-engine.md)

# Dev Alert Engine — Knowledge

## Doc Maintenance

```yaml
doc_maintenance:
  owns:
    - docs/architecture/microservice/alert-engine/**    # domain-model, usecases, infrastructure, api-reference, testing, README
    - docs/policies/alert-policy.md     # Alert policy rules (update when thresholds/cooldown change)
  responsibilities:
    - Update zone docs after ANY code change that alters behavior, API, alert logic, or config
    - Keep own agent description (.claude/agents/dev-alert-engine.md) accurate if skills/stack/port change
    - Update shared flow (docs/agents/developer/flow/microservice-main.md) if workflow pattern changes
    - Run doc-review flow (flows/developer/doc-review.md) as mandatory post-code step — never skip
    - If docs/architecture/microservice/alert-engine/ files don't exist yet, CREATE them following doc-review.md templates
  rule: "Code without matching doc update = incomplete task. QA will reject."
```

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/architecture/microservice/alert-engine/domain-model.md
    trigger: domain_work
  - path: docs/architecture/microservice/alert-engine/usecases.md
    trigger: usecase_work
  - path: docs/architecture/microservice/alert-engine/infrastructure.md
    trigger: infra_work
  - path: docs/architecture/microservice/alert-engine/api-reference.md
    trigger: api_work
  - path: docs/architecture/microservice/alert-engine/testing.md
    trigger: test_work
  - path: docs/policies/alert-policy.md
    trigger: alert_implementation
  - path: docs/standards/alert-message-format.md
    trigger: alert_formatting
  - path: docs/GLOSSARY_VI.md
    trigger: vn_financial_terms
  - path: .claude/skills/semble-search/SKILL.md
    trigger: code_search
  - path: docs/standards/microservice-build-standard.md
    trigger: new_service_or_feature_build
    note: "Size-gated build standard. Load when handoff contains BUILD-STANDARD: full or lean. FULL profile also lazy-loads pilot-charter.md + 07-phases.md (see standard § 1)."
    fail_loud: true
```
