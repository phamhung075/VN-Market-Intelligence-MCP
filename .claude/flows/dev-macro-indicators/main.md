# dev-macro-indicators — Main (Pointer)

**Zone:** `apps/macro-indicators/`
**Specialist for:** SBV FX rates, commodity prices, macro trend analysis

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `macro-indicators`
- `<agent-id>` = `dev-macro-indicators`
- zone restriction: only `apps/macro-indicators/` files

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/macro-indicators/`. Agent definition: `.claude/agents/dev-macro-indicators.md`.
