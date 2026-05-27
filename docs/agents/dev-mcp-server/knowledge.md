> Parent: [../../../.claude/agents/dev-mcp-server.md](../../../.claude/agents/dev-mcp-server.md)

# Dev MCP Server — Knowledge Load Policy

## always_load

| Path | fail_loud |
|---|---|
| `docs/policies/dev-standards.md` | true |
| `docs/protocols/fail-loud-protocol.md` | true |

## lazy_load

| Path | Trigger |
|---|---|
| `docs/architecture/microservice/mcp-server/domain-model.md` | domain_work |
| `docs/architecture/microservice/mcp-server/usecases.md` | usecase_work |
| `docs/architecture/microservice/mcp-server/infrastructure.md` | infra_work |
| `docs/architecture/microservice/mcp-server/api-reference.md` | api_work |
| `docs/architecture/microservice/mcp-server/testing.md` | test_work |
| `docs/GLOSSARY_VI.md` | vn_financial_terms |
| `docs/standards/cron-jobs.md` | scheduler_work |
| `docs/standards/mcp-tools.md` | mcp_tool_change |
| `docs/policies/alert-policy.md` | alert_implementation |
| `docs/references/kinh-dich-layer.md` | hexagram_integration |
| `.claude/skills/semble-search/SKILL.md` | code_search |
| `docs/standards/microservice-build-standard.md` | new_service_or_feature_build — fail_loud: true — Size-gated build standard. Load when handoff contains BUILD-STANDARD: full or lean. FULL profile also lazy-loads pilot-charter.md + 07-phases.md (see standard § 1). |

---

## Step 0-b: Handle Bootstrap Errors

Decision tree for bootstrap errors at agent startup:

- `market_context` error → STOP. Do not proceed. Market context is critical; operating without it produces invalid analysis.
- `agent_signals`-only error → CONTINUE. Proceed without signals. Signal data is supplementary; core work can continue.

→ KLFL: skill: `.claude/skills/cowork-boundary/SKILL.md` (§ Knowledge Load Failure Protocol)

---

## doc_maintenance

**Owns:**
- `docs/architecture/microservice/mcp-server/**` (domain-model, usecases, infrastructure, api-reference, testing, README)
- `docs/standards/mcp-tools.md` — MCP tool catalog (update when tools added/removed/renamed)
- `docs/standards/cron-jobs.md` — Scheduler catalog (update when jobs added/removed/changed)

**Responsibilities:**
- Update zone docs after ANY code change that alters behavior, API, schema, or config
- Keep own agent description (.claude/agents/dev-mcp-server.md) accurate if skills/stack/port change
- Update shared flow (docs/agents/developer/flow/microservice-main.md) if workflow pattern changes
- Run doc-review flow (flows/developer/doc-review.md) as mandatory post-code step — never skip
- If docs/architecture/microservice/mcp-server/ files don't exist yet, CREATE them following doc-review.md templates

**Rule:** Code without matching doc update = incomplete task. QA will reject.
