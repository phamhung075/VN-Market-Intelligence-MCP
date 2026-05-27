# Documentation Review Flow

**Triggered by:** microservice developer agent after code passes, before QA handoff.

**Input:** `SERVICE=<service-name>` (e.g. `stock-price`, `pdf-extractor`)

**Output:** Updated docs in `docs/architecture/microservice/<service>/`

---

## Step 1 — Identify changed DDD layers

Scan `git diff --name-only task/NNN...HEAD -- apps/<service>/` to identify which layers were touched:
- `domain/` → domain-model.md
- `application/` → usecases.md
- `infrastructure/` → infrastructure.md
- `interface/` → api-reference.md
- `__tests__/` → testing.md

Only update docs for layers that actually changed. Skip unchanged layers.

## Step 2 — Generate/update layer-specific docs

For each changed layer, read the current source files and update the corresponding doc.

### domain-model.md — Domain Layer Documentation
Document with concrete details:
- **Entities & Value Objects:** class/type name, fields with types, validation rules, invariants
- **Repository Interfaces:** method signatures, return types, query contracts
- **Domain Services:** function names, business logic description, edge cases handled
- **Business Rules:** thresholds, formulas, calculation logic with actual values
- **Error Types:** domain error classes, when they're thrown

### usecases.md — Application Layer Documentation
Document with concrete details:
- **Use Case Catalog:** each use case class/function, its purpose, when it's invoked
- **Input/Output DTOs:** field names, types, required/optional, validation
- **Orchestration Logic:** what domain services are called, in what order, transaction boundaries
- **Side Effects:** events emitted, notifications sent, caches invalidated

### infrastructure.md — Infrastructure Layer Documentation
Document with concrete details:
- **Database Schema:** table names, columns, types, indexes, constraints
- **External API Contracts:** endpoints called, auth method, rate limits, response format
- **Fetcher Configs:** URLs, retry policies, timeout values, fallback tiers
- **Repository Implementations:** SQL queries used, caching strategy, connection pooling
- **Configuration:** environment variables, default values, feature flags

### api-reference.md — Interface Layer Documentation
Document with concrete details:
- **HTTP Endpoints:** method, path, request body schema, response schema, status codes
- **MCP Tools** (if mcp-server): tool name, description, input schema, output format
- **Serializers:** transformation logic, field mappings, format conversions
- **Error Responses:** error codes, messages, HTTP status mapping

### testing.md — Test Documentation
Document with concrete details:
- **Test Strategy:** unit vs integration vs e2e split for this service
- **Key Test Fixtures:** what data they set up, why
- **Mocking Approach:** what's mocked, what hits real dependencies
- **Coverage Notes:** which paths are tested, known gaps
- **Run Commands:** exact commands to run tests for this service

## Step 3 — Update service README

Update `docs/architecture/microservice/<service>.md` if any of these changed:
- Service dependencies (new external API, new DB table)
- Port or configuration changes
- New domain concepts introduced
- Architecture decisions made

## Documentation Rules

1. **Specific, not generic** — include real function names, actual threshold values, concrete SQL queries
2. **File references** — every section must reference source files as `apps/<service>/src/<path>:<line>`
3. **Real examples** — show actual request/response payloads, not placeholder `{...}`
4. **Incremental updates** — update only sections affected by changes, preserve existing content
5. **No duplication** — if something is in code comments, reference the file instead of copying
6. **Vietnamese financial terms** — use terms from `docs/GLOSSARY_VI.md` where applicable

## Step 4 — Graphify update

If any docs were created or updated:
```
/graphify docs --update --no-viz
```

Skip if no documentation changes were made.
