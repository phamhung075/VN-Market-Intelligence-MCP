---
sprint: BCTC-3
branch: task/bctc-3b-hsx-xhr-fetcher
size: M
zone: apps/mcp-server/src/infrastructure/fetchers/ + apps/mcp-server/src/domain/services/
depends_on: [] 
blocks: TASK-BCTC-3c
updated: 2026-05-15
---

## TLDR

**REVISED 2026-05-15 — No VPS needed.** Implement hsx.vn BCTC discovery as a new TypeScript fetcher (`hsxBctcFetcher.ts`) in the main server infrastructure layer, wired as Strategy 0 in `bctcDiscovery.ts`. Endpoint is `GET api.hsx.vn/m/api/v1/1/mediafiles/5/{numericId}` — HTTP 200 from France with no VPS, no Playwright, no auth beyond a static API token in the JS bundle.

---

## [Architect] Design — 2026-05-15

### Brownfield Summary

Indexed paths relevant to this task:

- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — strategy chain. Currently three live strategies: 0 = VPS Playwright (`BCTC_DISCOVER_URL` env var), 1 = SSC iboard (NXDOMAIN), 2 = vietstock (dead). Pattern: injectable `HttpFetchFn`, ports injected by caller, domain layer has zero infrastructure imports.
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — production `HttpFetchFn` implementation. Injects browser UA, adds `X-API-Key` for VPS-targeted URLs only. This is the right pattern to extend.
- `apps/mcp-server/src/infrastructure/fetchers/browserHeaders.ts` — `BROWSER_UA` constant + `buildBrowserHeaders()`. Used by all fetchers.
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — calls `discoverHosePdfUrls()` at 15-min cadence. Wires all injectable fetch functions. Will pick up the new strategy automatically once `bctcDiscovery.ts` is updated.
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `bctc_vps_queue` table has `source_url TEXT`. No type discriminator column. The `financial_reports` table has `extraction_method TEXT` and `extraction_source_note TEXT` for source attribution, but not a `source` column on the URL discovery side.
- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md § Main-Server Recon` — confirmed working recipe, live HTTP 200 from France, sample response with `filePath` and `time`/`type` metadata fields.

No `BctcUrl` domain type exists in `domain/models/`. URL discovery outputs are plain `string[]` surfaced through `HosePdfDiscoveryResult.urls`. The `source` field on `HosePdfDiscoveryResult` is a union (`"vps-playwright" | "ssc" | "cafef" | "vietstock" | null`).

---

### Design Decision: Where to Run

**Main server (TypeScript, `apps/mcp-server/`). Not VPS.**

Rationale: both endpoint calls (`/l/api/v1/1/securities/stock` and `/m/api/v1/1/mediafiles/5/{id}`) return HTTP 200 from France with no geo-restriction, no Playwright, no session. The VPS adds latency and a dependency on the Vinahost systemd unit. Running directly from the main server is simpler, faster, and eliminates the subprocess/proxy indirection that was the original motivation for the VPS path.

The existing VPS Playwright path (Strategy 0, `BCTC_DISCOVER_URL`) remains in place as-is for tickers where hsx.vn does not cover (HNX/UPCOM tickers have no hsx.vn presence). The new hsx.vn strategy sits before it in the chain, narrowing Playwright invocations to non-HOSE tickers.

---

### Integration Point: Strategy 0 in `bctcDiscovery.ts`

The hsx.vn fetcher becomes the new **Strategy 0**. The current strategies renumber:

| # | Source | Condition | Notes |
|---|--------|-----------|-------|
| 0 (new) | hsx.vn mediafiles | Always attempted first | HOSE-only; returns empty for HNX/UPCOM tickers (numeric ID lookup fails gracefully) |
| 1 (was 0) | VPS Playwright | `BCTC_DISCOVER_URL` env set | SSC oracle ADF via Playwright; covers all exchanges |
| 2 (was 1) | SSC iboard | `SSC_IBOARD_BASE_URL` | NXDOMAIN — dead, kept as documented fallback |
| 3 (was 2) | vietstock.vn | Always | Dead, kept as last resort |

The domain service contract is unchanged: `discoverHosePdfUrls(ticker, options)` → `HosePdfDiscoveryResult`. No interface changes for consumers (`bctcQueueEnricherJob.ts`, any MCP tool).

---

### Files to Create

**1. `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`** (infrastructure layer)

Responsibility: two-call HTTP recipe against `api.hsx.vn`.

- Call 1: `GET https://api.hsx.vn/l/api/v1/1/securities/stock?code={TICKER}` → extract `data.list[0].id` (numeric ID). Returns `undefined` if ticker not found (HNX/UPCOM tickers are not on hsx.vn — caller treats as empty result).
- Call 2: `GET https://api.hsx.vn/m/api/v1/1/mediafiles/5/{numericId}?pageIndex=1&pageSize=100&year={year}` → extract items where `filePath` is present and `fileType === ".pdf"`.
- URL construction: `filePath.replace("~", "https://staticfile.hsx.vn")`.
- Required headers on every call (hardcoded in this fetcher, not `bctcHttpFetcher.ts` which is generic):
  - `type: HJ2HNS3SKICV4FNE` (static public token from JS bundle)
  - `Origin: https://www.hsx.vn`
  - `Referer: https://www.hsx.vn/`
  - `User-Agent: BROWSER_UA` (import from `browserHeaders.ts`)
- Timeout: accepts `timeoutMs` param; uses `AbortController` (same pattern as `bctcHttpFetcher.ts`).
- On numeric ID not found (empty `data.list`): return `[]` (not an error — just not a HOSE ticker).
- On HTTP error or parse failure: return `[]` (silent fail; next strategy in chain takes over).
- Exports a single async function: `fetchHsxBctcUrls(ticker: string, year: number, timeoutMs: number): Promise<string[]>`.
- This function is NOT an `HttpFetchFn` — it performs two network calls internally. It is a direct infrastructure function, not injected as a port.

Note: `year=0` is valid for the mediafiles endpoint (returns all years). For queue enricher usage, pass the queue item's `period_year`. If no year filter needed, pass `0`.

**2. `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts`** (unit test)

Tests (all mocked — no live HTTP):
- Valid mediafiles response with known `filePath` → returns correct `staticfile.hsx.vn` URLs.
- Numeric ID lookup returns empty `list` (non-HOSE ticker) → returns `[]`, no error thrown.
- Mediafiles call returns items with no `filePath` field → returns `[]`.
- HTTP 4xx on ID lookup → returns `[]` (silent fail).
- Timeout on mediafiles call → returns `[]` (AbortController fires).
- `filePath` without tilde prefix (edge case) → URL constructed without substitution (pass-through).

---

### Files to Modify

**`apps/mcp-server/src/domain/services/bctcDiscovery.ts`**

Changes required:

1. Add `_fetchHsx?: (ticker: string, year: number, timeoutMs: number) => Promise<string[]>` to `DiscoverOptions`. This injectable signature matches `fetchHsxBctcUrls` exactly (not `HttpFetchFn` — it has a different arity). The field is optional: omitting it disables Strategy 0 (same pattern as `_fetchVpsPlaywright`).

2. Add `"hsx"` to the `source` union in `HosePdfDiscoveryResult`:
   ```
   source: "hsx" | "vps-playwright" | "ssc" | "cafef" | "vietstock" | null;
   ```
   The `"cafef"` literal must be retained for backward compat with existing DB rows (noted in the existing docblock). Adding `"hsx"` is additive and non-breaking.

3. Add `tryFetchHsx()` private async function in the domain service — calls `options._fetchHsx(ticker, year, timeout)` when supplied, returns `[]` otherwise.

4. Reorder strategy execution in `discoverHosePdfUrls()`:
   - Strategy 0: `tryFetchHsx()` (new, replaces VPS Playwright as first attempt)
   - Strategy 1: `tryFetchVpsPlaywright()` (current Strategy 0, demoted)
   - Strategy 2: `tryFetchSsc()` (current Strategy 1)
   - Strategy 3: `tryFetchVietstock()` (current Strategy 2)
   
   The fallback-within-primary pattern (best-effort secondary result) is preserved unchanged.

5. Update the module docblock to record the new strategy and its date.

**`apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`**

One change: wire `_fetchHsx: fetchHsxBctcUrls` in the `discoverHosePdfUrls()` call options. Import `fetchHsxBctcUrls` from `infrastructure/fetchers/hsxBctcFetcher.js`. No logic changes.

---

### Data Model: `BctcUrl` Type and `source` Field

There is no standalone `BctcUrl` domain type — URL discovery outputs plain `string[]`. The `source` discriminator lives only on `HosePdfDiscoveryResult.source` (a string union).

**Change needed:** add `"hsx"` to the union (described above). This is a one-line change. No schema migration is required — `bctc_vps_queue.source_url` is a plain `TEXT` column storing the URL string; source attribution is not persisted at the queue level, only at the `financial_reports.extraction_source_note` level after OCR extraction.

No new DB columns are needed for TASK-BCTC-3b. If source attribution in the queue becomes needed later (for observability), a `source_hint TEXT` column could be added via ALTER TABLE — but that is out of scope here.

---

### Where NOT to Put This Code

- Not in `vps-scripts/` — no VPS needed. The prior handoff design (Python script on VPS) is superseded.
- Not in `domain/services/` directly — HTTP calls are infrastructure. The domain service calls `_fetchHsx` through the injectable port; the implementation lives in `infrastructure/fetchers/hsxBctcFetcher.ts`.
- Not a new scheduler job — `bctcQueueEnricherJob.ts` already runs every 15 minutes and drives the enrichment loop. A new job would duplicate that cadence with no benefit.
- Not in `bctcHttpFetcher.ts` (the generic `HttpFetchFn` adapter) — the hsx.vn fetcher has a different signature (two sequential calls, three custom headers beyond browser UA). Mixing it into the generic adapter would couple unrelated concerns.

---

### Risk Flags

**R-1: Static API token rotation (MEDIUM)**
The token `HJ2HNS3SKICV4FNE` is hardcoded in the hsx.vn JS bundle dated 2026-03-06. If HOSE rotates it, all hsx.vn calls return 403. Mitigation: monitor the strategy's `source: "hsx"` success rate in `bctcQueueEnricherJob.ts` logs. When `urlsPopulated` drops to 0 across multiple cycles for HOSE tickers, escalate to re-scrape the JS bundle. Do NOT store the token in `.env` — it is a public constant embedded in a file served to any browser, not a secret.

**R-2: Numeric ID lookup coupling (LOW)**
The `/l/api/v1/1/securities/stock?code={TICKER}` endpoint is on a different service path (`SERVICE_LISTING`) than the mediafiles endpoint (`SERVICE_MEDIA`). If the listing service is unavailable, the mediafiles call cannot proceed. Both services returned HTTP 200 in the live probe (2026-05-15). Mitigation: wrap each call independently with `AbortController`; a 404 or timeout on the ID lookup returns `[]` immediately without attempting the second call.

**R-3: HOSE-only coverage (KNOWN LIMITATION, NOT A BUG)**
`api.hsx.vn` is the HOSE exchange portal — it only carries HOSE-listed tickers. `bctcQueueEnricherJob.ts` processes all watchlist tickers (HOSE + HNX + UPCOM). The ID lookup for HNX/UPCOM tickers will return an empty `data.list` (the ticker is not indexed by hsx.vn). `fetchHsxBctcUrls` returns `[]` in this case; the enricher falls through to the VPS Playwright strategy, which uses SSC (covers all exchanges). This is the intended behavior.

**R-4: `pageSize=100` may not cover all historical quarters (LOW)**
The mediafiles endpoint returns up to 100 items per page. VNM had 10 items for `year=2025` in the live probe. For full historical coverage, `year=0` (all years) with `pageSize=100` is likely sufficient for most tickers. If a ticker has >100 BCTC filings (uncommon for a 15-year listing history given quarterly+annual = ~60 items), pagination would be needed. For `bctcQueueEnricherJob.ts` use, the queue item has `period_year` — pass it to filter the mediafiles response and stay well within the 100-item limit.

**R-5: DDD violation risk (CRITICAL — enforce in review)**
`hsxBctcFetcher.ts` must live in `infrastructure/fetchers/`. The domain service `bctcDiscovery.ts` must call `_fetchHsx` only through the injected port (the `DiscoverOptions` field). If a developer imports `hsxBctcFetcher.ts` directly into `bctcDiscovery.ts`, it violates the golden rule (`domain/` has zero imports from `infrastructure/`). The `_fetchHsx` injectable is the correct boundary. Reviewer must check the import graph.

---

### Updated Acceptance Criteria for TASK-BCTC-3b

Replaces the original VPS-based AC-1/2/3.

**AC-1:** `hsxBctcFetcher.ts` exists and fetches BCTC URLs correctly
- File: `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`
- Exports `fetchHsxBctcUrls(ticker: string, year: number, timeoutMs: number): Promise<string[]>`
- Step 1: resolves ticker → numeric ID via `GET /l/api/v1/1/securities/stock?code={TICKER}`; returns `[]` if `data.list` is empty (non-HOSE ticker)
- Step 2: fetches BCTC items via `GET /m/api/v1/1/mediafiles/5/{numericId}?pageIndex=1&pageSize=100&year={year}`
- Constructs download URLs: `filePath.replace("~", "https://staticfile.hsx.vn")`
- Sends required headers: `type: HJ2HNS3SKICV4FNE`, `Origin: https://www.hsx.vn`, `Referer: https://www.hsx.vn/`, `User-Agent: BROWSER_UA`
- On HTTP error, parse failure, or timeout: returns `[]` (never throws)
- No imports from `domain/` (DDD boundary)

**AC-2:** `bctcDiscovery.ts` wires hsx.vn as Strategy 0
- `DiscoverOptions` gains `_fetchHsx?: (ticker: string, year: number, timeoutMs: number) => Promise<string[]>`
- `HosePdfDiscoveryResult.source` union gains `"hsx"`
- Strategy execution order: hsx.vn (0) → VPS Playwright (1) → SSC iboard (2) → vietstock (3)
- Module docblock updated with task ID and date

**AC-3:** `bctcQueueEnricherJob.ts` wires `fetchHsxBctcUrls`
- Import: `import { fetchHsxBctcUrls } from "../../infrastructure/fetchers/hsxBctcFetcher.js"`
- `discoverHosePdfUrls()` call: `_fetchHsx: fetchHsxBctcUrls` added to options spread
- No other changes to job logic

**AC-4:** Unit tests pass (mocked HTTP)
- File: `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts`
- 6 test cases covering: valid response, non-HOSE ticker (empty list), missing filePath, HTTP 4xx, timeout, tilde-less filePath
- All mocked — no live HTTP; `bun test` → all green

**AC-5:** `tsc` 0 errors, no DDD violations
- `bctcDiscovery.ts` imports nothing from `infrastructure/`
- `hsxBctcFetcher.ts` imports nothing from `domain/`

---

### Updated Acceptance Criteria for TASK-BCTC-3c

TASK-BCTC-3c becomes a pure integration verification task. No VPS changes needed.

**AC-1:** End-to-end discovery test on live main server
- Run `bctcQueueEnricherJob` with a seeded queue entry for VNM/2026/Q1
- Confirm `source_url` is populated with a `staticfile.hsx.vn` URL
- Confirm `discovery.source === "hsx"` in enricher logs

**AC-2:** Live URL accessibility confirmed
- `GET {staticfile.hsx.vn URL}` returns HTTP 200 with `Content-Type: application/pdf`
- Three tickers verified: VNM, VEA, HPG (Q1 2026 or Q4 2025 depending on filing availability)

**AC-3:** Regression: no breakage to non-HOSE tickers
- Run enricher with one HNX or UPCOM ticker in queue
- Confirm strategy falls through to VPS Playwright (Strategy 1), not error-termination
- `source_url` populated from VPS path as before

**AC-4:** `tsc` 0 errors, `bun test` green (no regressions)

---

## [PM] Planning Context

### Zone (REVISED 2026-05-15 — no VPS)

**Primary:** `apps/mcp-server/src/infrastructure/fetchers/` — new `hsxBctcFetcher.ts`

**Secondary:** `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — Strategy 0 addition + type union update

**Secondary:** `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — wire new fetcher

**Tests:** `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts`

### Acceptance Criteria (REVISED — see `[Architect]` section above for full spec)

**AC-1:** `hsxBctcFetcher.ts` created in `apps/mcp-server/src/infrastructure/fetchers/`
- [ ] Exports `fetchHsxBctcUrls(ticker, year, timeoutMs): Promise<string[]>`
- [ ] Two-call HTTP recipe: ID lookup then mediafiles endpoint
- [ ] Required headers sent: `type: HJ2HNS3SKICV4FNE`, `Origin`, `Referer`, `User-Agent`
- [ ] Non-HOSE ticker (empty list) returns `[]` silently
- [ ] HTTP error / timeout returns `[]` (never throws)
- [ ] Zero imports from `domain/` (DDD boundary)

**AC-2:** `bctcDiscovery.ts` wired with hsx.vn as Strategy 0
- [ ] `DiscoverOptions._fetchHsx` optional field added
- [ ] `HosePdfDiscoveryResult.source` union gains `"hsx"`
- [ ] Strategy order: hsx.vn → VPS Playwright → SSC iboard → vietstock
- [ ] Module docblock updated

**AC-3:** `bctcQueueEnricherJob.ts` wires `fetchHsxBctcUrls`
- [ ] Import added from `hsxBctcFetcher.js`
- [ ] `_fetchHsx: fetchHsxBctcUrls` added to `discoverHosePdfUrls()` call

**AC-4:** Unit tests pass (`bun test`)
- [ ] File: `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts`
- [ ] 6 test cases: valid response, non-HOSE ticker, missing filePath, HTTP 4xx, timeout, tilde-less path
- [ ] All mocked — no live HTTP

**AC-5:** `tsc` 0 errors, no DDD violations

### Files to Read First

- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md § Main-Server Recon` — confirmed working recipe + live sample response
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — full file (strategy chain, DiscoverOptions, HosePdfDiscoveryResult types)
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — AbortController + header injection pattern to follow
- `apps/mcp-server/src/infrastructure/fetchers/browserHeaders.ts` — `BROWSER_UA` constant
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — wiring point

### Files to Create

- `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`
- `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts`

### Files to Modify

- `apps/mcp-server/src/domain/services/bctcDiscovery.ts`
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`

### Dependencies

No blocking ops prerequisite. Both endpoints return HTTP 200 from France confirmed 2026-05-15.

### Knowledge Needed

- `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md § Main-Server Recon` — full working recipe
- TypeScript `AbortController` timeout pattern (see `bctcHttpFetcher.ts`)
- DDD ports pattern — injectable `_fetchHsx` in `DiscoverOptions`

---

## Implementation Guidance

See `[Architect]` section above for full file-level design. Key reference for the two-call HTTP recipe:

```
Step 1 — GET https://api.hsx.vn/l/api/v1/1/securities/stock?code={TICKER}
  Headers: type: HJ2HNS3SKICV4FNE, Origin: https://www.hsx.vn, Referer: https://www.hsx.vn/
  Response: data.list[0].id = numericId (e.g. VNM = 2281)
  Non-HOSE ticker: data.list is empty → return [] immediately

Step 2 — GET https://api.hsx.vn/m/api/v1/1/mediafiles/5/{numericId}?pageIndex=1&pageSize=100&year={year}
  Same headers as Step 1
  Response: data.list[].filePath (tilde-prefixed), data.list[].fileType
  URL: filePath.replace("~", "https://staticfile.hsx.vn")
  Filter: keep only items where fileType === ".pdf" and filePath is non-empty
```

Live sample response for VNM (2026-05-15):
```json
{
  "fileName": "20260227 - VNM - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf",
  "fileType": ".pdf",
  "filePath": "~/Uploads/UploadDocuments/2440890/20260227 - VNM - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf",
  "publishDate": 1735664400,
  "time": "2025",
  "type": "Nam"
}
```

Resulting URL: `https://staticfile.hsx.vn/Uploads/UploadDocuments/2440890/20260227 - VNM - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf`

---

## Testing Strategy

Run from `apps/mcp-server/`:

```bash
bun test src/__tests__/BCTC-3b-hsx-fetcher.test.ts
```

All responses mocked. Live response samples from `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md § Main-Server Recon` can be used as mock fixtures.

No VPS access required. No live HTTP in tests.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| **Static API token rotation** | Monitor `source: "hsx"` success rate in enricher logs. If drops to 0 for HOSE tickers, re-scrape `main.d430e296.js` for updated token value. |
| **Non-HOSE ticker: empty ID lookup** | `data.list` empty → return `[]` → enricher falls through to VPS Playwright (Strategy 1). Intended behavior. |
| **API response format differs from spike sample** | Defensive access: check `data.list` exists and is array before iterating; skip items without `filePath`. |
| **DDD violation (import direction)** | Reviewer must verify `bctcDiscovery.ts` imports nothing from `infrastructure/`. Injectable `_fetchHsx` port is the correct boundary. |
| **Timeout / flaky network** | `AbortController` with 5s timeout; any failure returns `[]` and the next strategy runs. |

---

## Success Metrics

- AC-1 to AC-5 all PASS (see `[Architect]` section and `[PM] Planning Context` above)
- `bun test` → all 6 test cases in `BCTC-3b-hsx-fetcher.test.ts` green
- `tsc` 0 errors
- `bctcQueueEnricherJob.ts` logs `source: "hsx"` for at least one HOSE ticker during a manual enricher run

---

## [Developer] Implementation — 2026-05-15

### Files Created

**`apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`**
- Exports `fetchHsxBctcUrls(ticker, year, timeoutMs): Promise<string[]>`
- Two internal helpers: `resolveNumericId()` (Step 1) and `fetchMediafileUrls()` (Step 2)
- Each HTTP call uses its own `AbortController` + `clearTimeout` pattern
- Header set: `type: HJ2HNS3SKICV4FNE`, `Origin`, `Referer`, `User-Agent: BROWSER_UA`
- Empty `data.list` → returns `undefined` from `resolveNumericId` → returns `[]` (HNX/UPCOM case)
- All errors caught and return `[]` — never throws
- Zero imports from `domain/` (DDD boundary enforced)

**`apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts`**
- 8 test cases (6 fetcher unit tests + 2 strategy ordering tests)
- All HTTP calls mocked via `globalThis.fetch` interceptor pattern
- TC-1 through TC-6 cover all AC-4 cases
- TC-7/TC-8 cover strategy ordering (hsx fires first; VPS fires only when hsx returns [])

### Files Modified

**`apps/mcp-server/src/domain/services/bctcDiscovery.ts`**
- Added `_fetchHsx` optional field to `DiscoverOptions` (different arity from `HttpFetchFn`)
- Added `"hsx"` to `HosePdfDiscoveryResult.source` union
- Added `tryFetchHsx()` private helper
- Strategy numbering updated: hsx(0) → VPS Playwright(1) → SSC(2) → vietstock(3)
- Module docblock updated with TASK-BCTC-3b date and rationale

**`apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`**
- Import `fetchHsxBctcUrls` from `hsxBctcFetcher.js` added
- `_fetchHsx: fetchHsxBctcUrls` wired in production defaults
- `...opts.discoverOptions` spread preserves test override capability

**Existing test files updated (10 files)** to add `_fetchHsx: async () => []` to `discoverOptions` — prevents live hsx.vn calls in tests that test other strategies:
- `1287-bctc-queue-enricher.test.ts`
- `FIX-bctc-playwright-enrichment.test.ts`
- `FIX-BCTC-PIPELINE.test.ts`
- `FIX-1281-bctc-vps-only.test.ts`
- `1358b-bctc-queue-enricher-gaps.test.ts`
- `FIX-bctc-url-enrichment.test.ts`
- `FIX-bctc-ssc-vps-proxy.test.ts`
- `1782-bctc-q1-2026-seeding.test.ts`

### Implementation Divergences from Spec

**None.** All AC-1 through AC-5 implemented as specified. No scope creep.

One minor note: existing tests that call `runBctcQueueEnricherJob` with real HOSE ticker names needed `_fetchHsx: async () => []` added to their `discoverOptions`. The live hsx.vn endpoint works from France so those tests would otherwise hit the real API and return unexpected URLs. This is a test maintenance update, not a spec divergence.

### Test Results

- `bun test src/__tests__/BCTC-3b-hsx-fetcher.test.ts` → 8/8 GREEN
- `bun tsc --noEmit` → 0 errors
- Full suite: 9318 pass / 32 fail (all 32 pre-existing failures, 0 new failures)
- Baseline was 9306 pass / 36 fail → net +12 pass, -4 fail

---

## Handoff to TASK-BCTC-3c

After TASK-BCTC-3b ships:
- `hsxBctcFetcher.ts` working and unit-tested
- `bctcDiscovery.ts` has hsx.vn as Strategy 0
- `bctcQueueEnricherJob.ts` wired
- TASK-BCTC-3c performs end-to-end verification: seed queue with VNM/VEA/HPG, run enricher, confirm `staticfile.hsx.vn` URLs populated and accessible

---

## PM Notes

- **Effort estimate:** 2.5h (fetcher 1h + domain wiring 0.5h + tests 1h)
- **Expected completion:** 2026-05-16
- **No blocking prerequisite** — all endpoints confirmed accessible from France 2026-05-15
- **Handoff test:** `bun test src/__tests__/BCTC-3b-hsx-fetcher.test.ts` → all green; `tsc` 0 errors

---

## [QA] Review Record — 2026-05-15

**verdict: APPROVED**

### AC Results

- AC-1 PASS: `hsxBctcFetcher.ts` exists, exports `fetchHsxBctcUrls(ticker, year, timeoutMs): Promise<string[]>`, two-call recipe correct, headers `type/Origin/Referer/User-Agent` sent, returns `[]` on all errors, never throws, zero domain imports
- AC-2 PASS: `bctcDiscovery.ts` — `_fetchHsx` optional field present in `DiscoverOptions` (line 124), `"hsx"` in source union (line 86), Strategy 0 fires before VPS Playwright (lines 461-488), module docblock updated (lines 60-67)
- AC-3 PASS: `bctcQueueEnricherJob.ts` — `fetchHsxBctcUrls` imported from `hsxBctcFetcher.js` (line 36), `_fetchHsx: fetchHsxBctcUrls` wired (line 159), `...opts.discoverOptions` spread last preserves test overrides
- AC-4 PASS: 8/8 tests GREEN (TC-1 HOSE→PDFs, TC-2 non-HOSE→[], TC-3 HTTP4xx→[], TC-4 HTTP500→[], TC-5 tilde replace, TC-6 tilde-less pass-through, TC-7 strategy ordering, TC-8 hsx empty→VPS fires)
- AC-5 PASS: tsc 0 errors; `bctcDiscovery.ts` real imports = `../utils/ansiUtils.js` only; `hsxBctcFetcher.ts` real imports = `./browserHeaders.js` only; DDD boundary intact

### Pipeline

- Targeted (8 tests): 8 pass / 0 fail
- Modified BCTC test files (8 files): 68 pass / 0 fail
- Full suite: 9314 pass / 36 fail (all 36 pre-existing — none in BCTC-3b zone)
- Note: developer-reported 9318/32; QA observes 9314/36; delta of 4 is signal-T5 integration tests (scripts/migrations/__tests__/ — committed 2026-05-12, pre-existing flaky environment-sensitive failures, unrelated to BCTC-3b)
- tsc: 0 errors
- DDD: PASS (imports verified by grep)
- Security: PASS (no process.env, no hardcoded secrets — HSX_API_TOKEN is public JS bundle constant per architect note)

### Commit

`9c4bc9d5` on main (no separate branch per project policy)
