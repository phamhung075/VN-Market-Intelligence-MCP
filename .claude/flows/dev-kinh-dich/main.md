# dev-kinh-dich — Main (Pointer)

**Zone:** `apps/kinh-dich-service/`
**Specialist for:** Hexagram readings, trading signals, I-Ching market logic

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `kinh-dich-service`
- `<agent-id>` = `dev-kinh-dich`
- zone restriction: only `apps/kinh-dich-service/` files

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/kinh-dich-service/`. Agent definition: `.claude/agents/dev-kinh-dich.md`. Logic reference: `docs/references/kinh-dich-layer.md`.
