# dev-pdf-extractor — Main (Pointer)

**Zone:** `apps/pdf-extractor/`
**Specialist for:** BCTC parsing, OCR, Vietnamese financial statement extraction (Python/FastAPI)

Thin pointer — shared flow for all 9 dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `pdf-extractor`
- `<agent-id>` = `dev-pdf-extractor`
- zone restriction: only `apps/pdf-extractor/` files
- TDD: `pytest` (not bun test) — see microservice-main.md "TDD workflow — Python/FastAPI" section

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/pdf-extractor/`. See `docs/protocols/bctc-extraction-runbook.md`. Agent definition: `.claude/agents/dev-pdf-extractor.md`.
