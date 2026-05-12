# dev-mcp-server — Main (Pointer)

**Zone:** `apps/mcp-server/`
**Specialist for:** MCP tools, schedulers/crons, market data orchestration (gateway service)

This is a thin pointer — the actual flow is shared across all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions when reading the shared flow:
- `<service>` = `mcp-server`
- `<agent-id>` = `dev-mcp-server`
- zone restriction enforced: only `apps/mcp-server/` files

For spike tasks (`mode: "spike"`), use `.claude/flows/developer/feature-spike.md` instead.

Service docs: `docs/architecture/microservice/mcp-server/`. Owns `market.db`. See agent definition: `.claude/agents/dev-mcp-server.md`.
