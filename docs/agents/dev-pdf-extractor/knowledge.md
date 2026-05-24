> Parent: [../../../.claude/agents/dev-pdf-extractor.md](../../../.claude/agents/dev-pdf-extractor.md)

# Dev PDF Extractor — Knowledge

## Doc Maintenance

```yaml
doc_maintenance:
  owns:
    - docs/architecture/microservice/pdf-extractor/**       # domain-model, usecases, infrastructure, api-reference, testing, README
    - docs/protocols/bctc-extraction-runbook.md  # BCTC runbook (update when pipeline/OCR logic changes)
  responsibilities:
    - Update zone docs after ANY code change that alters behavior, API, OCR pipeline, or config
    - Keep own agent description (.claude/agents/dev-pdf-extractor.md) accurate if skills/stack/port change
    - Update shared flow (.claude/flows/developer/microservice-main.md) if workflow pattern changes
    - Run doc-review flow (flows/developer/doc-review.md) as mandatory post-code step — never skip
    - If docs/architecture/microservice/pdf-extractor/ files don't exist yet, CREATE them following doc-review.md templates
  rule: "Code without matching doc update = incomplete task. QA will reject."
```

## Lazy Load Table

```yaml
lazy_load:
  - path: docs/architecture/microservice/pdf-extractor/domain-model.md
    trigger: domain_work
  - path: docs/architecture/microservice/pdf-extractor/usecases.md
    trigger: usecase_work
  - path: docs/architecture/microservice/pdf-extractor/infrastructure.md
    trigger: infra_work
  - path: docs/architecture/microservice/pdf-extractor/api-reference.md
    trigger: api_work
  - path: docs/architecture/microservice/pdf-extractor/testing.md
    trigger: test_work
  - path: docs/protocols/bctc-extraction-runbook.md
    trigger: bctc_extraction
  - path: docs/GLOSSARY_VI.md
    trigger: vn_financial_terms
  - path: .claude/skills/semble-search/SKILL.md
    trigger: code_search
  - path: docs/standards/microservice-build-standard.md
    trigger: new_service_or_feature_build
    note: "Size-gated build standard. Load when handoff contains BUILD-STANDARD: full or lean. FULL profile also lazy-loads pilot-charter.md + 07-phases.md (see standard § 1)."
    fail_loud: true
```
