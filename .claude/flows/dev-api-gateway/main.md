# dev-api-gateway — Main (Pointer)

**Zone:** `apps/api-gateway/`
**Specialist for:** HTTP routing, health aggregation, service discovery

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `api-gateway`
- `<agent-id>` = `dev-api-gateway`
- zone restriction: only `apps/api-gateway/` files

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/api-gateway/`. Agent definition: `.claude/agents/dev-api-gateway.md`.
