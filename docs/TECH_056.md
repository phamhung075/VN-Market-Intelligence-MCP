# TECH-056: BCTC Fallback — HOSE/HNX/UPCOM as Primary Source

status: APPROVED_BY_ARCHITECT
req_ref: Task 1085 (PO Decision 2026-04-10: Option 2 — strengthen HOSE/HNX fallback)
sprint: 056

---

## Brownfield Impact

- Files modified:
  - `mcp.config.json` — add `features.disableSscPolling: true`
  - `src/infrastructure/config.ts` — add `FeaturesConfig` interface + `features` property to `McpConfig`
  - `src/infrastructure/fetchers/ssc.ts` — add UPCOM fallback + `disableSscPolling` guard in `listSscDocuments`
- Files created:
  - `src/__tests__/1111-bctc-fallback-primary.test.ts` — 8 acceptance criteria
- Breaking changes: no. `listSscDocuments` signature unchanged; new behaviour guarded behind config flag.

---

## Architecture Decision

The SSC portal permanently returns an Oracle ADF JS-only shell (no table data) for all tickers.
The existing HOSE/HNX fallback in `listSscDocuments` (Task 1025) already handles this, but only
*after* a failed SSC request. With PO approval to disable SSC polling entirely, we skip the SSC
step when `features.disableSscPolling = true` (default `true` until the portal is fixed), going
directly to HOSE + HNX + UPCOM in parallel. This eliminates the ~10 s SSC timeout waste per
ticker per nightly cycle and closes the UPCOM coverage gap for VEA.

The config flag keeps the SSC path available for future re-enablement without code changes.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| FeaturesConfig interface | infrastructure | `src/infrastructure/config.ts` | MODIFY |
| disableSscPolling read | infrastructure | `src/infrastructure/config.ts` | MODIFY |
| UPCOM fetcher | infrastructure | `src/infrastructure/fetchers/ssc.ts` | MODIFY |
| listSscDocuments guard | infrastructure | `src/infrastructure/fetchers/ssc.ts` | MODIFY |
| mcp.config.json flag | config | `mcp.config.json` | MODIFY |
| Acceptance tests | test | `src/__tests__/1111-bctc-fallback-primary.test.ts` | NEW |

---

## Interface Contracts

### Config change

```typescript
// src/infrastructure/config.ts — new interface
export interface FeaturesConfig {
  /**
   * When true, skip SSC portal entirely and go directly to HOSE/HNX/UPCOM.
   * Default: true (SSC portal is JS-only, non-functional without Puppeteer).
   * Set to false to re-enable SSC polling once the portal is fixed.
   */
  disableSscPolling: boolean;
}

// Added to McpConfig:
features: FeaturesConfig;
```

### New UPCOM fetcher

```typescript
// src/infrastructure/fetchers/ssc.ts — new export
export async function fetchUpcomDisclosures(
  ticker: string,
  year: number,
  reportType: "quarterly" | "annual",
  httpClient?: HttpClient,
): Promise<SscDocument[]>
// Endpoint: https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VEA
```

### Modified listSscDocuments

```typescript
// Short-circuit when SSC is disabled:
if (mcpConfig.features.disableSscPolling) {
  // Go directly to HOSE + HNX + UPCOM in parallel
  const [hoseDocs, hnxDocs, upcomDocs] = await Promise.allSettled([...])
  // Return first non-empty result; if all empty log BUG-channel alert
}
// else: existing SSC → fallback logic unchanged
```

---

## Task Breakdown (for PM)

| Task | Description | Layer | Size | Depends |
|------|-------------|-------|------|---------|
| 1111 | BCTC fallback: disableSscPolling flag + UPCOM fetcher + listSscDocuments guard | infrastructure/config | M (~80 LOC) | none |

Single task — all changes are in the infrastructure layer, no new domain logic needed.

---

## Acceptance Criteria (Task 1111)

**AC1:** `mcp.config.json` has `"features": { "disableSscPolling": true }` after merge.

**AC2:** `McpConfig.features.disableSscPolling` reads correctly via `loadMcpConfig()`.

**AC3:** When `disableSscPolling=true`, `listSscDocuments` never calls `client.get(sscUrl)`.

**AC4:** When `disableSscPolling=true` and HOSE returns docs, those docs are returned (no HNX/UPCOM needed).

**AC5:** When `disableSscPolling=true` and HOSE returns empty but HNX returns docs, HNX docs returned.

**AC6:** When `disableSscPolling=true` and HOSE+HNX return empty but UPCOM returns docs (VEA case), UPCOM docs returned.

**AC7:** When `disableSscPolling=true` and all three sources return empty, returns [] (no crash).

**AC8:** When `disableSscPolling=false`, existing SSC-first behaviour is unchanged (backward compat).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| HOSE/HNX portal HTML structure changes | Low | Medium | Existing parsers already validated; HTML tests cover structure |
| UPCOM portal at different URL than HNX | Medium | Low | Test with VEA before deploy; fallback gracefully returns [] |
| disableSscPolling=false forgotten after fix | Low | Low | Config flag named to require conscious opt-in to SSC |

---

## Security Review

- [x] SQL parameterized? N/A — no new SQL
- [x] File paths validated? N/A — URL construction only
- [x] External HTTP rate-limited? Yes — existing `globalRateLimiter` applies
- [x] Secrets via Bun.env only? Yes
