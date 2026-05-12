> Parent: [../../../.claude/agents/agent-father.md](../../../.claude/agents/agent-father.md)

# Agent Father — Knowledge Load Policy

## always_load

| Path | fail_loud | Note |
|---|---|---|
| `docs/AGENT_CREATION_GUIDE.md` | true | Slim index (~75 lines). Architecture + TOC + recipes. Always loaded. |
| `docs/protocols/fail-loud-protocol.md` | true | — |

## lazy_load (guide parts — load per flow step)

| Path | Trigger | fail_loud |
|---|---|---|
| `docs/guides/guide-zones.md` | file_placement_or_zone_check | false |
| `docs/guides/guide-lazy-load.md` | knowledge_section_authoring | false |
| `docs/guides/guide-agent-definition.md` | agent_definition_authoring | true |
| `docs/guides/guide-flows.md` | flow_file_authoring | true |
| `docs/guides/guide-agent-ops.md` | notebook_or_registry_authoring | false |
| `docs/guides/guide-error-signals.md` | error_boundary_or_signal_authoring | false |
| `docs/guides/guide-skills-registration.md` | registration_or_review | false |
| `docs/guides/guide-quality.md` | quality_pattern_check | false |

## lazy_load (non-guide knowledge)

| Path | Trigger | fail_loud |
|---|---|---|
| `docs/references/agent-roster.md` | registration_or_review | false |
| `docs/standards/mcp-tools.md` | tool_package_authoring | false |
| `docs/policies/docs-organization.md` | file_placement_check | false |
| `.claude/skills/dispatch/SKILL.md` | dispatch_registration | false |

→ KLFL: skill: `.claude/skills/cowork-boundary/SKILL.md` (§ Knowledge Load Failure Protocol)
