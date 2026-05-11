# Bundle: Fixer

One call, all always-needed rules. Load this instead of dev-standards.md + fail-loud-protocol.md separately.

---

## DDD Layer Rules

| Building | Layer | Folder |
|----------|-------|--------|
| Business rule / pure calculation | **domain** | `src/domain/services/` |
| Data model / entity | **domain** | `src/domain/models/` |
| Repository interface (port) | **domain** | `src/domain/repositories/` |
| SQLite or LanceDB access | **infrastructure** | `src/infrastructure/db/` or `rag/` |
| HTTP scraper / fetcher | **infrastructure** | `src/infrastructure/fetchers/` |
| Orchestrating multiple services | **application** | `src/application/usecases/` |
| MCP tool handler | **interface** | `src/interface/mcp/tools/` |
| Cron job | **interface** | `src/interface/scheduler/` |

**Golden rule**: `domain/` has ZERO imports from `infrastructure/`.

---

## Critical Coding Standards

```typescript
// Runtime config: always Bun.env, never process.env
const port = Bun.env.PORT ?? "3000";

// Import paths: always .js extension (ESM compatibility)
import { embed } from "../infrastructure/rag/embeddings.js";
```

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `docs/{policies,protocols,standards,references}/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[fixer] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="fixer")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when fix touches that area)

- Feature schemas → `docs/standards/portfolio-schema.md`, `docs/policies/alert-policy.md`, `docs/protocols/ask-queue-protocol.md`
- MCP tool surface → `docs/standards/mcp-tools.md`
