> Parent: [../../../.claude/agents/dev-kinh-dich.md](../../../.claude/agents/dev-kinh-dich.md)

# Dev Kinh Dich — Knowledge

## Doc Maintenance

```yaml
doc_maintenance:
  owns:
    - docs/architecture/microservice/kinh-dich/**  # domain-model, usecases, infrastructure, api-reference, testing, README
    - docs/references/kinh-dich-layer.md     # Hexagram logic reference (update when computation changes)
  responsibilities:
    - Update zone docs after ANY code change that alters behavior, API, hexagram logic, or config
    - Keep own agent description (.claude/agents/dev-kinh-dich.md) accurate if skills/stack/port change
    - Update shared flow (docs/agents/developer/flow/microservice-main.md) if workflow pattern changes
    - Run doc-review flow (flows/developer/doc-review.md) as mandatory post-code step — never skip
    - If docs/architecture/microservice/kinh-dich/ files don't exist yet, CREATE them following doc-review.md templates
  rule: "Code without matching doc update = incomplete task. QA will reject."
```

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/architecture/microservice/kinh-dich/domain-model.md
    trigger: domain_work
  - path: docs/architecture/microservice/kinh-dich/usecases.md
    trigger: usecase_work
  - path: docs/architecture/microservice/kinh-dich/infrastructure.md
    trigger: infra_work
  - path: docs/architecture/microservice/kinh-dich/api-reference.md
    trigger: api_work
  - path: docs/architecture/microservice/kinh-dich/testing.md
    trigger: test_work
  - path: docs/references/kinh-dich-layer.md
    trigger: hexagram_integration
  - path: docs/GLOSSARY_VI.md
    trigger: vn_financial_terms
  - path: .claude/skills/semble-search/SKILL.md
    trigger: code_search
  - path: docs/standards/microservice-build-standard.md
    trigger: new_service_or_feature_build
    note: "Size-gated build standard. Load when handoff contains BUILD-STANDARD: full or lean. FULL profile also lazy-loads pilot-charter.md + 07-phases.md (see standard § 1)."
    fail_loud: true
```
