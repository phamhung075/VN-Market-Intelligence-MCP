# dev-rag-service — Main (Pointer)

**Zone:** `apps/rag-service/`
**Specialist for:** Embeddings, LanceDB, semantic search, temporal decay (Python/FastAPI)

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `rag-service`
- `<agent-id>` = `dev-rag-service`
- zone restriction: only `apps/rag-service/` files
- TDD: `pytest` (not bun test)

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/rag-service/`. Agent definition: `.claude/agents/dev-rag-service.md`.
