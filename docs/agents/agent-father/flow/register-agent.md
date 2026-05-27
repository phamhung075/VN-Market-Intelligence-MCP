# Agent Father — Register Agent (Step 8)

**Parent flow:** `docs/agents/agent-father/flow/create.md` (Step 8 — registration)

Wire the newly-scaffolded agent into the 3 visibility surfaces. Without this, dispatcher cannot route, roster doesn't show it, CLAUDE.md doesn't mention it.

## 3 Registration Locations

| Target | Action |
|--------|--------|
| `docs/references/agent-roster.md` | Add row to appropriate team table (Analysis Team or Dev Team) |
| `CLAUDE.md` | Add routing entry to Agent Routing table |
| `.claude/skills/dispatch/SKILL.md` | Add row to Dispatch Table |

Read each file first to understand current format before inserting.

## Roster row schema

```markdown
| <agent_name> | <role> | <trigger> | <reads> | <writes> | <model> |
```

Pick the team table (Analysis Team for cowork, Dev Team for dev / dev-microservice). For dev-microservice, also add the `zone` and `database.owns` columns if the table tracks them.

## CLAUDE.md routing row

```markdown
| <intent keyword> | <agent_name> | <main.md or sub-flow> |
```

Add to the Agent Routing table near the other rows of the same team.

## Dispatch SKILL row

```markdown
| <intent> | `<agent_name>` | `main` | <notes> |
```

Add to `## Dispatch Table — User Intent → Agent` in `.claude/skills/dispatch/SKILL.md`. Keep one row per intent — if the new agent overlaps an existing intent, split that row by adding a condition (see existing splits like "bug / broken (code) — tracked fix" vs "explicit one-shot patch").

For dev-microservice agents: usually NO new dispatch row — they're zone-routed inside dev-team Step 3, not user-spawned. Document the zone in roster instead.

Output: 3 files modified. Feed Step 9 (validate) inside create.md.
