# dev-technical-analysis — Main (Pointer)

**Zone:** `apps/technical-analysis/`
**Specialist for:** RSI, MACD, Bollinger Bands, indicator math

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `technical-analysis`
- `<agent-id>` = `dev-technical-analysis`
- zone restriction: only `apps/technical-analysis/` files

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/technical-analysis/`. Agent definition: `.claude/agents/dev-technical-analysis.md`.
