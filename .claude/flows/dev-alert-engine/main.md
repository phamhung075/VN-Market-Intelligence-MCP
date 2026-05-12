# dev-alert-engine — Main (Pointer)

**Zone:** `apps/alert-engine/`
**Specialist for:** Multi-source signals, dedup, cooldown, Telegram distribution

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `alert-engine`
- `<agent-id>` = `dev-alert-engine`
- zone restriction: only `apps/alert-engine/` files

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/alert-engine/`. Owns `alert-engine.db`. Agent definition: `.claude/agents/dev-alert-engine.md`.
