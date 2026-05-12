# dev-stock-price — Main (Pointer)

**Zone:** `apps/stock-price/`
**Specialist for:** 3-tier price fallback, VPS bridge, price aggregation

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `stock-price`
- `<agent-id>` = `dev-stock-price`
- zone restriction: only `apps/stock-price/` files

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/stock-price/`. Agent definition: `.claude/agents/dev-stock-price.md`.
