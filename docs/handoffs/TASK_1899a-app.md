# TASK 1899a-app — Application Layer: Use Cases

**Sprint:** 1899a | **Branch:** `task/1899a-app-usecases` | **Size:** S | **Zone:** apps/news-fetch/

---

## TLDR

Implement application layer (orchestration, no business logic): FetchReutersHeadlinesUseCase and FetchBloombergHeadlinesUseCase. Each takes a port interface via constructor injection and delegates to it. Thin wrappers with maxItems passthrough.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §5: Application Use Cases — two use cases, one per source

**DDD Layer Rules:**
- `application/` imports from `domain/` only (inward)
- No infrastructure or interface layer code
- Single responsibility: port delegation, no business calculations

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/application/use-cases.ts` | FetchReutersHeadlinesUseCase, FetchBloombergHeadlinesUseCase classes | ~50 |

**Dependencies:** Depends on 1899a-domain (imports ReutersNewsPort, BloombergNewsPort, FetchResult).

**Files to Modify:** None.

**Knowledge Needed:**
- Brief §5 (use case specs)
- `docs/policies/dev-standards.md` (DDD layer rules)

---

## Acceptance Criteria

- [ ] **src/application/use-cases.ts created**:
  - Imports `{ FetchResult, NewsSource }` from ../domain/models
  - Imports `{ ReutersNewsPort, BloombergNewsPort }` from ../domain/repositories
  - No imports from infrastructure, interface, or scheduler layers

- [ ] **FetchReutersHeadlinesUseCase class**:
  - Constructor: `constructor(private readonly repo: ReutersNewsPort) {}`
  - Method: `async execute(maxItems: number = 15): Promise<FetchResult>`
    - Calls `this.repo.fetchHeadlines(maxItems)`
    - Returns FetchResult directly (no transformation)
  - Type-safe (all params/returns fully typed)

- [ ] **FetchBloombergHeadlinesUseCase class**:
  - Constructor: `constructor(private readonly repo: BloombergNewsPort) {}`
  - Method: `async execute(maxItems: number = 10): Promise<FetchResult>`
    - Calls `this.repo.fetchHeadlines(maxItems)`
    - Returns FetchResult directly
  - Type-safe

- [ ] **No domain layer violations**:
  - `tsc --noEmit` passes
  - No infrastructure imports (no fetch, playwright, database, etc.)
  - No circular dependencies

- [ ] **Typescript strict mode compliance**:
  - All types explicit, no implicit any
  - Constructor properties declared with private readonly

- [ ] **Commit message**:
  - Format: `feat(1899a-app): application layer — FetchReutersHeadlinesUseCase, FetchBloombergHeadlinesUseCase`
  - Trailers: `Task: 1899a-app`

---

## [Developer] Notes

**Exact use-case structure from brief:**

```typescript
// use-cases.ts
import { FetchResult } from '../domain/models';
import { ReutersNewsPort, BloombergNewsPort } from '../domain/repositories';

export class FetchReutersHeadlinesUseCase {
  constructor(private readonly repo: ReutersNewsPort) {}

  async execute(maxItems: number = 15): Promise<FetchResult> {
    return this.repo.fetchHeadlines(maxItems);
  }
}

export class FetchBloombergHeadlinesUseCase {
  constructor(private readonly repo: BloombergNewsPort) {}

  async execute(maxItems: number = 10): Promise<FetchResult> {
    return this.repo.fetchHeadlines(maxItems);
  }
}
```

**Pattern note:**
- No business logic (no calculations, no filtering, no conditional routing)
- Pure delegation to port interface
- Constructor injection enables unit testing (mock ports in tests)
- Default maxItems match brief (Reuters 15, Bloomberg 10)

**Testing locally:**
```bash
cd apps/news-fetch
tsc --noEmit
# Should compile with 0 errors
```

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service).
- All files in src/application/
- Next task (1899a-routes) will instantiate these use cases with concrete adapters
