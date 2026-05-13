# TASK 1899a-domain — Domain Layer: Models & Port Interfaces

**Sprint:** 1899a | **Branch:** `task/1899a-domain-models` | **Size:** S | **Zone:** apps/news-fetch/

---

## TLDR

Create the domain layer (pure TypeScript, no infrastructure imports): models.ts (Article, NewsSource enum, FetchResult) and repositories.ts (ReutersNewsPort, BloombergNewsPort port interfaces). These define the service's core contracts—all scrapers implement these ports via constructor injection.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §3: Domain Entities — Article interface, NewsSource enum, FetchResult envelope
- §4: Port Interfaces — ReutersNewsPort, BloombergNewsPort (abstract methods for scrapers)
- §2: Module Layout — domain/ subfolder with two files

**DDD Layer Rules:**
- `domain/` must NOT import from `infrastructure/`, `application/`, or `interface/`
- Pure TypeScript enums and interfaces only
- All infrastructure/app layers import inward (domain is root)

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/domain/models.ts` | NewsSource enum, Article interface, FetchResult interface | ~35 |
| `apps/news-fetch/src/domain/repositories.ts` | ReutersNewsPort interface, BloombergNewsPort interface | ~15 |

**Dependencies:** Depends on 1899a-core (folder structure + tsconfig).

**Files to Modify:** None.

**Knowledge Needed:**
- `docs/policies/dev-standards.md` (DDD layer separation)
- Brief §3, §4 (entity specs)

---

## Acceptance Criteria

- [ ] **src/domain/models.ts created**:
  - Exports `enum NewsSource { REUTERS = 'reuters', BLOOMBERG = 'bloomberg' }`
  - Exports `interface Article` with fields:
    - `source: NewsSource`
    - `headline: string`
    - `url: string | null` (null when RSS omits link)
    - `publishedAt: string | null` (ISO timestamp or null if unparseable)
    - `fetchedAt: string` (ISO timestamp, set by scraper)
    - `confidence: 'HIGH' | 'LOW'` (HIGH for structured DOM/RSS; LOW for heuristic)
  - Exports `interface FetchResult` with fields:
    - `source: NewsSource`
    - `articles: Article[]`
    - `fetchedAt: string` (ISO timestamp)
    - `method: 'rss' | 'playwright-stealth'`
    - `error: string | null` (null on success; populated on partial/full failure)
  - No imports from any other layer (pure TS)

- [ ] **src/domain/repositories.ts created**:
  - Imports `{ FetchResult }` from ./models.ts only
  - Exports `interface ReutersNewsPort`:
    - Method: `fetchHeadlines(maxItems?: number): Promise<FetchResult>`
  - Exports `interface BloombergNewsPort`:
    - Method: `fetchHeadlines(maxItems?: number): Promise<FetchResult>`
  - No implementations (interfaces only)
  - No infrastructure imports (fetch, playwright, database, etc.)

- [ ] **No DDD violations detected**:
  - `tsc --noEmit` passes in apps/news-fetch
  - No circular imports
  - domain/ imports nothing from other layers

- [ ] **TypeScript strict mode compliance**:
  - All types fully specified (no implicit any)
  - Union types explicit (e.g., `string | null` not just string)

- [ ] **Commit message**:
  - Format: `feat(1899a-domain): domain layer — Article model, NewsSource enum, port interfaces`
  - Trailers: `Task: 1899a-domain`, AC compliance noted

---

## [Developer] Notes

**Exact enum/interface structure from brief:**

```typescript
// models.ts
export enum NewsSource {
  REUTERS = 'reuters',
  BLOOMBERG = 'bloomberg',
}

export interface Article {
  source: NewsSource;
  headline: string;
  url: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  confidence: 'HIGH' | 'LOW';
}

export interface FetchResult {
  source: NewsSource;
  articles: Article[];
  fetchedAt: string;
  method: 'rss' | 'playwright-stealth';
  error: string | null;
}

// repositories.ts
import { FetchResult } from './models';

export interface ReutersNewsPort {
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}

export interface BloombergNewsPort {
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}
```

**Testing locally:**
```bash
cd apps/news-fetch
tsc --noEmit
# Should pass with 0 errors
```

**Golden rule check:**
- `grep -n "import.*infrastructure\|import.*application\|import.*interface" src/domain/`
- Should return 0 hits

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service, no cross-zone).
- All files in src/domain/
- Next tasks (1899a-app, adapters) will depend on these interfaces and enums

---

## QA Gate — 2026-05-13

**Outcome:** APPROVED

**Merge SHA:** `d7302f75` (cherry-picked onto main from `b71ba215` on factory branch)

**Branch note:** `fix/1899a-news-fetch-domain` was never advanced by developer — domain commit landed on `fix/1899a-news-fetch-factory` branch instead. Cherry-picked `b71ba215` to main. Domain branch deleted (was empty).

### Test Results
- Unit tests (`bun test apps/news-fetch/src/__tests__/unit/`): **16 pass / 0 fail** (29 expect() calls)
- TypeScript (`bun tsc --noEmit` in apps/news-fetch): **0 errors**

### DDD Compliance: PASS
- `grep -rn "from.*infrastructure\|from.*application\|from.*interface" apps/news-fetch/src/domain/` — 0 hits

### Security: PASS
- No `process.env` (domain files are pure TS interfaces/enums — no runtime code)
- No hardcoded secrets or credentials
- No SQL (domain layer only)

### Issues Found
#### Blocking
None.

#### Non-Blocking
- Branch naming mismatch: developer committed domain work to `fix/1899a-news-fetch-factory` rather than `fix/1899a-news-fetch-domain`. Handled via cherry-pick; no rework needed.

### Merge Status
- Merged to main as `d7302f75`
- Branch `fix/1899a-news-fetch-domain` deleted
- Rebase signal needed for `fix/1899a-news-fetch-reuters-rss`: YES (branch base at merge time = `18c540e7`, now contains `d7302f75` via factory merge)
