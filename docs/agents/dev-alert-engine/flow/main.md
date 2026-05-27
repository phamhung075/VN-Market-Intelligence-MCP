# dev-alert-engine — Main (Pointer)

**Zone:** `apps/alert-engine/`
**Specialist for:** Multi-source signals, dedup, cooldown, Telegram distribution

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `alert-engine`
- `<agent-id>` = `dev-alert-engine`
- zone restriction: only `apps/alert-engine/` files

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.

Service docs: `docs/architecture/microservice/alert-engine/`. Owns `alert-engine.db`. Agent definition: `.claude/agents/dev-alert-engine.md`.
