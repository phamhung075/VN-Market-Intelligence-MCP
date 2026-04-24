---
agents: developer, architect, qa
trigger: domain-refactor, writing-code, test-run
---

# Pattern: DDD Layer Violations (Inward-only imports)

**Recurrence**: 7x | **Severity**: High | **Status**: Active (strict enforcement)

---

## What breaks

`src/domain/` importing from `src/infrastructure/` or `src/interface/`.

When domain code depends on infrastructure details (database schemas, HTTP clients, etc.), the test suite fails and you can't test domain logic in isolation.

## Where it happens

- Agent refactoring "clean up" imports → accidentally consolidates up-layer dependencies
- New feature using existing infrastructure service → domain logic codebase grows infrastructure coupling
- Lazy developer importing a utility from interface/ into domain/

## Example violation

```typescript
// ❌ BAD: domain/Stock.ts importing infrastructure
import { prisma } from '@/infrastructure/db/client';
import { fetchNewsAPI } from '@/infrastructure/sources/news';

export class Stock {
  async enrich() {
    const data = await fetchNewsAPI();  // ← breaks DDD
  }
}
```

```typescript
// ✅ GOOD: domain/Stock uses interface (pure logic)
export class Stock {
  constructor(private newsProvider: NewsProvider) {}

  enrich(news: News[]): Stock {
    return new Stock(...news);
  }
}
```

## Prevention checklist

**Before committing any domain/ changes:**

```bash
# Check for infrastructure imports in domain/
grep -r "from.*infrastructure" src/domain/ || echo "✅ Clean"

# Check for interface imports in domain/
grep -r "from.*interface" src/domain/ || echo "✅ Clean"

# Run tests (catches violations fast)
bun test src/domain
```

## How to fix

1. Move concrete implementation to `src/application/`
2. Define interface in `src/domain/` (abstract contract)
3. Domain depends on interface, application injects concrete implementation

**Layer dependency order:**
```
domain/ (pure, no imports from interface or infrastructure)
  ↑ (application/ can import from domain/)
application/ (orchestration, can import domain + interfaces)
  ↑ (interface/ imports application)
interface/ (REST, GraphQL, CLI)
  ↑ (infrastructure/ runs interfaces)
infrastructure/ (DB, HTTP clients, services)
```

## Recent Prevention

**Task 1289 (2026-04-22):** Fixed `WriteForeignFlowItem` type import in domain validator — moved type to domain/models/shared-types.ts, updated 4 files. Caught by test 1321-ddd-no-infra-imports-in-domain.test.ts. Test suite enforces this rule every run.

**Task 1303i (2026-04-24):** Verified clean — cascadeEngine.ts + tradeRelationships.ts (domain) have zero infra/application imports. bctcOverdueCheckJob.ts (scheduler) imports from application (runImpactChain) + domain (WatchlistEntry) — both valid. Last verified: 2026-04-24.

## Related

- `.claude/knowledge/dev-standards.md` → DDD layering rules
- `docs/ARCHITECTURE.md` → Layer descriptions
