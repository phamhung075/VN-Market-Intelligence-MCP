# TECH-101: DDD Boundary Fix — Move Shared Infra Types to domain/models

status: APPROVED_BY_ARCHITECT
req_ref: REQ-101

---

## Brownfield Impact

- Files created: `src/domain/models/shared-types.ts`, `src/__tests__/1321-ddd-boundary-no-infra-import.test.ts`
- Files modified (domain — import path only): `src/domain/services/intradayAnalyzer.ts`, `src/domain/services/catalystCalendar.ts`, `src/domain/services/orderBookAnalyzer.ts`, `src/domain/services/supplyChainAnalyzer.ts`, `src/domain/services/climateImpactMapper.ts`, `src/domain/services/recencyWeighter.ts`, `src/domain/services/newsNormalizer.ts`
- Files modified (infra — re-export shim only): `src/infrastructure/fetchers/vnstockBridge.ts`, `src/infrastructure/fetchers/shippingIndex.ts`, `src/infrastructure/fetchers/weatherVn.ts`, `src/infrastructure/rag/retriever.ts`, `src/infrastructure/fetchers/rss.ts`
- Files modified (test): `src/__tests__/122-domain-services.test.ts` (line 34 import path only)
- Files modified (barrel): `src/domain/models/index.ts` (add barrel re-export)
- Files deleted: none
- Breaking changes: no — all 5 infra files continue to export the same type names via re-export shims

---

## Architecture Decision

All 9 shared types are pure data shapes with zero runtime dependencies — they belong in `domain/models` where they can be compiled and tested without any infrastructure present. The infra files keep exporting the same names via `export type { X } from "../../domain/models/shared-types.js"` shims so every caller in `application/`, `interface/`, and `scheduler/` resolves identically without any import-path change. This is a zero-impact structural fix: no logic moves, no signatures change, no tests change beyond the import lines specified in FR-2/FR-5.

---

## SearchResult re-export shim — authoritative decision

**Question from task brief:** shim goes on `retriever.ts`, `vectorstore.ts`, or both?

**Findings from brownfield scan:**
- `vectorstore.ts` defines `SearchResult` (line 49). Its only import is `@lancedb/lancedb` — no domain imports, no circularity risk.
- `retriever.ts` line 22 has `export type { SearchResult } from "./vectorstore.js"` — the existing re-export is already there.
- `recencyWeighter.ts` imports from `"../../infrastructure/rag/retriever.js"` (confirmed by grep).
- No domain file imports directly from `vectorstore.ts`.

**Decision: shim goes on `retriever.ts` only. `vectorstore.ts` is untouched.**

Rationale:
1. `recencyWeighter.ts` (the sole domain consumer) imports from `retriever.ts`, not `vectorstore.ts` — so only `retriever.ts` needs the shim to satisfy FR-4.
2. `vectorstore.ts` is pure infrastructure with a single external dependency. Making it import from domain would introduce an infra→domain dependency in the wrong direction (infra reading from domain is fine in DDD, but it is unnecessary here — adding it would couple the two layers bidirectionally for no gain).
3. The "two definitions of same shape" option from REQ-101 edge cases is explicitly rejected: having two definitions of `SearchResult` (one in `shared-types.ts`, one in `vectorstore.ts`) creates drift risk. `vectorstore.ts` keeps its own `SearchResult` definition as the authoritative infra-internal copy; `shared-types.ts` gets a separate copy for domain use. This is safe because `SearchResult` contains only primitive types — no circular shape dependency exists. The TypeScript structural type system treats them as compatible.
4. `retriever.ts` shim: replace the current `export type { SearchResult } from "./vectorstore.js"` with `export type { SearchResult } from "../../domain/models/shared-types.js"`. The internal `import type { SearchResult } from "./vectorstore.js"` on line 19 of `retriever.ts` stays as-is (it is used internally for the return type annotation of `searchContext`). Only the re-export line changes.

**Circular dependency check:** `shared-types.ts` → no imports. `retriever.ts` → imports from `./vectorstore.js` (infra, allowed) and now re-exports from `../../domain/models/shared-types.js` (domain, allowed — infra may read domain). `vectorstore.ts` → imports only `@lancedb/lancedb`. No cycle.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| shared-types | domain/models | `src/domain/models/shared-types.ts` | NEW |
| domain/models barrel | domain/models | `src/domain/models/index.ts` | MODIFY |
| intradayAnalyzer import | domain/services | `src/domain/services/intradayAnalyzer.ts` line 21 | MODIFY |
| catalystCalendar import | domain/services | `src/domain/services/catalystCalendar.ts` line 17 | MODIFY |
| orderBookAnalyzer import | domain/services | `src/domain/services/orderBookAnalyzer.ts` line 20 | MODIFY |
| supplyChainAnalyzer import | domain/services | `src/domain/services/supplyChainAnalyzer.ts` line 25 | MODIFY |
| climateImpactMapper import | domain/services | `src/domain/services/climateImpactMapper.ts` line 18 | MODIFY |
| recencyWeighter import | domain/services | `src/domain/services/recencyWeighter.ts` line 20 | MODIFY |
| newsNormalizer import | domain/services | `src/domain/services/newsNormalizer.ts` line 18 | MODIFY |
| vnstockBridge shim | infrastructure/fetchers | `src/infrastructure/fetchers/vnstockBridge.ts` | MODIFY |
| shippingIndex shim | infrastructure/fetchers | `src/infrastructure/fetchers/shippingIndex.ts` | MODIFY |
| weatherVn shim | infrastructure/fetchers | `src/infrastructure/fetchers/weatherVn.ts` | MODIFY |
| retriever shim | infrastructure/rag | `src/infrastructure/rag/retriever.ts` line 22 | MODIFY |
| rss shim | infrastructure/fetchers | `src/infrastructure/fetchers/rss.ts` | MODIFY |
| test 122 import | test | `src/__tests__/122-domain-services.test.ts` line 34 | MODIFY |
| TDD boundary test | test | `src/__tests__/1321-ddd-boundary-no-infra-import.test.ts` | NEW |

---

## Interface Contracts

### src/domain/models/shared-types.ts (new — zero imports)

```typescript
// Ordering rule: dependent types must follow their dependencies in the file.
// WeatherEventType → WeatherSeverity → WeatherEvent (satisfies circular guard).

export interface VnstockIntradayTick {
  code: string;
  time: string;       // ISO datetime
  price: number;      // VND (vnstock raw × 1000)
  volume: number;
  matchType: string;  // "Buy" | "Sell" | "Unknown"
}

export interface VnstockEvent {
  code: string;
  eventName: string;
  eventDate: string;  // ISO date "YYYY-MM-DD"
  eventType: string;
  description: string;
}

export interface VnstockOrderBook {
  code: string;
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
  bidTotal: number;
  askTotal: number;
}

export interface ShippingIndex {
  name: string;
  value: number;
  change: number;
  changePct: number;
  date: string;  // "YYYY-MM-DD"
}

export type WeatherEventType =
  | "typhoon" | "flood" | "drought"
  | "heat_wave" | "cold_snap" | "el_nino" | "la_nina";

export type WeatherSeverity = "low" | "medium" | "high" | "critical";

export interface WeatherEvent {
  type: WeatherEventType;
  severity: WeatherSeverity;
  regions: string[];
  forecastDate: string;
  impactDuration: string;
  description: string;
}

export interface SearchResult {
  id: string;
  level: string;
  title: string;
  summary: string;
  tags: string[];
  actionCode: string;
  createdAt: string;
  distance: number;
}

export interface RssItem {
  title: string;
  url: string;
  publishedAt: string;
  content: string;
  source: string;
}
```

**Field note — VnstockOrderBook:** `imbalanceRatio` and `fetchedAt` exist in `vnstockBridge.ts` but are infra-internal computed fields. They are NOT included in the domain copy — domain consumers (`orderBookAnalyzer.ts`) do not use them. Dev must verify this against the actual usage in `orderBookAnalyzer.ts` before omitting; if used, add them back.

### src/domain/models/index.ts (modify — add one line)

Replace `export {};` with:

```typescript
export type * from "./shared-types.js";
```

### Infra re-export shim pattern (same for all 5 files)

Remove the `export interface` / `export type` definition block. Replace with:

```typescript
export type { TypeName } from "../../domain/models/shared-types.js";
```

For `retriever.ts` specifically — line 22 only:

```typescript
// Before:
export type { SearchResult } from "./vectorstore.js";

// After:
export type { SearchResult } from "../../domain/models/shared-types.js";
```

Line 19 (`import type { SearchResult } from "./vectorstore.js"`) is NOT changed — it serves the internal return type annotation.

### Domain service import pattern (all 7 files)

```typescript
// Before (example from recencyWeighter.ts line 20):
import type { SearchResult } from "../../infrastructure/rag/retriever.js";

// After:
import type { SearchResult } from "../models/shared-types.js";
```

---

## Task Breakdown (for Dev)

Dependency order — implement sequentially:

| Task | Work | Depends on |
|------|------|-----------|
| 1321 (write test first) | Create `1321-ddd-boundary-no-infra-import.test.ts` — must be RED | nothing |
| 1320-A | Create `src/domain/models/shared-types.ts` | 1321 written |
| 1320-B | Update `src/domain/models/index.ts` barrel | 1320-A |
| 1320-C | Update 7 domain service import lines | 1320-A |
| 1320-D | Add re-export shims to 5 infra files | 1320-A |
| 1320-E | Update test 122 line 34 | 1320-A |
| verify | `bun tsc --noEmit` + `bun test` full suite | all above |

---

## Test Specification — 1321-ddd-boundary-no-infra-import.test.ts

| TC | Description | Assertion | Red before 1320? |
|----|-------------|-----------|-----------------|
| TC-1 | Glob `src/domain/**/*.ts`, readFileSync each, grep `^import[^(].*from.*infrastructure` | `matches.length === 0` | yes (7 violations found) |
| TC-2 | `import type { VnstockIntradayTick } from "../domain/models/shared-types.js"` | `satisfies` check with `{ code: "", time: "", price: 0, volume: 0, matchType: "" }` | yes (file does not exist) |
| TC-3 | `import type { RssItem } from "../domain/models/shared-types.js"` | fields `title`, `url`, `publishedAt` exist (structural check) | yes |
| TC-4 | `import type { WeatherEvent } from "../domain/models/shared-types.js"` | fields `type`, `severity`, `regions` exist — NOT `eventType`, NOT `region` | yes |

**REQ-101 edge case corrections applied (mandatory):**
- TC-3: fields are `url` and `publishedAt` (NOT `link` / `pubDate` as misstated in TASKS.md 1321)
- TC-4: field is `type` (NOT `eventType`), field is `regions` (NOT `region`)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| `VnstockOrderBook.imbalanceRatio` / `fetchedAt` used in domain — omitted from shared-types.ts | Low | Medium | Dev checks `orderBookAnalyzer.ts` actual field usage before finalizing the interface; add fields if used |
| `retriever.ts` internal import (line 19) inadvertently changed to domain | Low | Low | TECH spec is explicit: only line 22 (re-export) changes; line 19 (import) stays pointing to vectorstore |
| `domain/models/index.ts` `export type *` syntax unsupported in target TS version | Low | Low | Fallback: use `export type { VnstockIntradayTick, ... } from "./shared-types.js"` explicit named re-export |
| Test 1321 TC-2/TC-3/TC-4 fail if `satisfies` keyword not available (TS < 4.9) | Low | Low | Check `tsconfig.json` target; if needed replace `satisfies` with explicit typed variable assignment |
| Drift between `vectorstore.ts` `SearchResult` and `shared-types.ts` copy | Low | Low | Both definitions are stable; `distance` field meaning is identical. Document that `vectorstore.ts` copy is infra-internal and `shared-types.ts` copy is the domain contract |

---

## Security Review

- SQL parameterized? N/A — no SQL changes
- File paths validated? N/A — no file I/O added
- External HTTP rate-limited? N/A — no new HTTP calls
- Secrets via Bun.env only? N/A — no env access added
