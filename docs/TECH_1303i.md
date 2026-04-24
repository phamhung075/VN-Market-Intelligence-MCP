# TECH-1303i: Cascade Rule Gaps — Geo/BCTC-Overdue/Trade-Map

status: APPROVED_BY_ARCHITECT
req_ref: REQ-1303i

---

## Brownfield Impact

- Files modified: 3
  - `src/domain/services/cascadeEngine.ts`
  - `src/domain/services/tradeRelationships.ts`
  - `src/scheduler/financial-reports/bctcOverdueCheckJob.ts`
- Files created: 1
  - `src/__tests__/1303i-cascade-gaps.test.ts`
- Files deleted: none
- Breaking changes: no — all changes are additive insertions into existing data structures

---

## Architecture Decision

Three silent cascade gaps are closed by additive data insertions into existing rule arrays and one fire-and-forget call in the scheduler layer. No new interfaces, no schema changes, no new service files — the existing `buildCausalChain` / `analyzeTradeImpact` / `runImpactChain` pipeline already handles all cases; the gaps are purely missing seed data and one missing trigger call. The scheduler→application import pattern for `runImpactChain` is already established in `intelligenceCycleJob.ts` and is valid per DDD layer order.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| Taiwan SECTOR_RULES (de-escalation + escalation) | domain | `src/domain/services/cascadeEngine.ts:1337–1420` | MODIFY |
| Taiwan COUNTRY_KEYWORDS entry | domain | `src/domain/services/tradeRelationships.ts:~54` | MODIFY |
| DHG/GMD/CTD/NKG TRADE_PROFILES seeds | domain | `src/domain/services/tradeRelationships.ts:~79` | MODIFY |
| DHG/GMD/CTD/NKG STOCK_RELEVANCE_KEYWORDS | domain | `src/domain/services/tradeRelationships.ts:~223` | MODIFY |
| runImpactChain fire-and-forget trigger | scheduler→application | `src/scheduler/financial-reports/bctcOverdueCheckJob.ts:~270` | MODIFY |
| RED + GREEN tests | tests | `src/__tests__/1303i-cascade-gaps.test.ts` | NEW |

---

## Gap-by-Gap Design

### G1: Taiwan geo routing in cascadeEngine

**Insertion point:** `cascadeEngine.ts` line ~1337 — AFTER the Hormuz/VNM retail rule (line 1335) and BEFORE the existing `// ── Geopolitical DE-ESCALATION` block comment (line 1337).

**Rule placement strategy:** Taiwan de-escalation rules are inserted BEFORE Taiwan escalation rules, consistent with the existing Hormuz pattern (de-escalation at ~1337, escalation at ~1398). First-match-wins semantics mean de-escalation fires on ceasefire/peace news before escalation can match.

**Taiwan DE-ESCALATION block** — insert at line 1337 (before existing geo de-escalation comment):

```typescript
// ── Taiwan / semiconductor DE-ESCALATION (before escalation — first match wins) ──
{
  keywords: [
    "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
    "taiwan strait reopen", "taiwan ceasefire", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan",
  ],
  domain: "tech",
  direction: "up",
  confidence: 0.80,
  title: "Hạ nhiệt eo biển Đài Loan — chuỗi cung ứng bán dẫn phục hồi, tích cực tech/FPT",
},
{
  keywords: [
    "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
    "taiwan strait reopen", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan",
  ],
  domain: "securities",
  direction: "up",
  confidence: 0.75,
  title: "Hạ nhiệt Đài Loan — risk-on, dòng vốn quay lại thị trường mới nổi",
},
{
  keywords: [
    "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
    "taiwan strait reopen", "đài loan hòa dịu",
  ],
  domain: "retail",
  direction: "up",
  confidence: 0.68,
  title: "Hạ nhiệt Đài Loan — chi phí linh kiện điện tử giảm, tích cực bán lẻ điện máy",
},
```

**Taiwan ESCALATION block** — insert at line ~1420 AFTER existing escalation block (after the `gold_mining` escalation rule at ~1419, before `// ── FDI` comment at ~1421):

```typescript
// ── Taiwan / semiconductor ESCALATION ──────────────────────────────────────
{
  keywords: [
    "taiwan strait", "taiwan military", "taiwan conflict", "taiwan invasion",
    "china taiwan", "tsmc disruption", "semiconductor supply", "taiwan blockade",
    "eo biển đài loan", "đài loan", "xung đột đài loan", "phong tỏa đài loan",
  ],
  domain: "tech",
  direction: "down",
  confidence: 0.80,
  title: "Căng thẳng eo biển Đài Loan — gián đoạn chuỗi cung ứng bán dẫn (bearish tech/FPT)",
},
{
  keywords: [
    "taiwan strait", "taiwan military", "taiwan conflict", "china taiwan",
    "tsmc disruption", "eo biển đài loan", "đài loan căng thẳng",
  ],
  domain: "securities",
  direction: "down",
  confidence: 0.75,
  title: "Căng thẳng Đài Loan — risk-off toàn cầu, dòng vốn rút khỏi thị trường mới nổi",
},
{
  keywords: [
    "taiwan strait", "taiwan military", "taiwan conflict", "tsmc disruption",
    "semiconductor supply", "eo biển đài loan", "đài loan",
  ],
  domain: "retail",
  direction: "down",
  confidence: 0.68,
  title: "Căng thẳng Đài Loan — chi phí linh kiện điện tử tăng, tác động bán lẻ điện máy",
},
```

---

### G2: BCTC overdue → runImpactChain trigger

**Insertion point:** `bctcOverdueCheckJob.ts` line ~270 — AFTER the `if (alertsInserted > 0)` logger block (lines 270–276), BEFORE the `return` statement (line 278).

**Fire-and-forget pattern** (non-blocking, no `await`):

```typescript
// ── FR-3: Cascade chain per overdue ticker (fire-and-forget) ─────────────
if (overdueTickers.length > 0) {
  const watchlistEntries: WatchlistEntry[] = watchlist.map((w) => ({
    code: w.code,
    domain: w.domain,
  }));
  for (const t of overdueTickers) {
    const seedText =
      `BCTC filing overdue: ${t.code} has not filed Q${t.quarter}-${t.year} BCTC. ` +
      `Deadline was ${t.deadline.toISOString().slice(0, 10)}, ${t.daysOverdue} days ago. ` +
      `Impact: governance risk, potential earnings uncertainty.`;
    void runImpactChain({
      newsText: seedText,
      watchlist: watchlistEntries,
      ragRetriever: async () => [],
    }).catch((err) => {
      logger.warn("[bctcOverdueCheck] runImpactChain failed for overdue ticker", {
        code: t.code,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
```

**Import to add at top of file:**

```typescript
import { runImpactChain } from "../../application/usecases/runImpactChain.js";
import type { WatchlistEntry } from "../../domain/services/cascadeEngine.js";
```

**Key design notes:**
- `void promise.catch(...)` pattern: fire-and-forget + error isolation. Does NOT use `Promise.allSettled` (order irrelevant, no need to collect results).
- `ragRetriever: async () => []` injected to skip RAG I/O in the scheduler context (RAG retrieval not needed for governance-risk seed text; cascade rules fire on text pattern alone).
- The `if (overdueTickers.length > 0)` guard already exists at line 224; the new block is a SECOND guard inside the same condition, after the batch alert insert. It does NOT replace the existing guard.
- `watchlist` variable (type `WatchlistRow[]`) is already in scope at line 142. Map to `WatchlistEntry[]` inline (code + domain fields exist on both types).

---

### G3: Trade map seeds — 4 sectors

**COUNTRY_KEYWORDS taiwan entry** — insert after `uk` entry at line ~65:

```typescript
taiwan: [
  "taiwan", "taiwanese", "đài loan", "taipei", "tsmc",
  "taiwan strait", "eo biển đài loan",
],
```

**TRADE_PROFILES seeds** — insert after `VEA` entry (line ~144), before closing `}`:

```typescript
DHG: {
  code: "DHG",
  companyName: "Dược Hậu Giang",
  exposures: [
    { market: "vietnam",  revenuePct: 85, type: "export",  products: "Dược phẩm nội địa" },
    { market: "china",    revenuePct: 40, type: "import",  products: "API/nguyên liệu dược từ TQ (~40% chi phí)" },
    { market: "india",    revenuePct: 20, type: "import",  products: "API/nguyên liệu dược từ Ấn Độ (~20% chi phí)" },
  ],
  keySensitivities: ["china", "india"],
  summaryVi: "DHG: 85% doanh thu nội địa. Phụ thuộc nhập khẩu API từ TQ (40%) và Ấn Độ (20%). TQ/Ấn Độ siết xuất khẩu dược → rủi ro chi phí.",
},
GMD: {
  code: "GMD",
  companyName: "Gemadept",
  exposures: [
    { market: "asean",   revenuePct: 25, type: "export",  products: "Vận tải biển khu vực ASEAN" },
    { market: "china",   revenuePct: 15, type: "export",  products: "Port calls TQ" },
    { market: "korea",   revenuePct: 5,  type: "import",  products: "Nhập thiết bị cảng từ Hàn Quốc" },
    { market: "japan",   revenuePct: 5,  type: "import",  products: "Nhập thiết bị cảng từ Nhật" },
    { market: "vietnam", revenuePct: 50, type: "export",  products: "Cảng nội địa, kho bãi logistics" },
  ],
  keySensitivities: ["asean", "china"],
  summaryVi: "GMD: 25% ASEAN sea freight, 15% TQ port calls. Xung đột biển Đông / Đài Loan ảnh hưởng trực tiếp tuyến vận chuyển.",
},
CTD: {
  code: "CTD",
  companyName: "Coteccons",
  exposures: [
    { market: "vietnam", revenuePct: 90, type: "export",  products: "Xây dựng dân dụng và công nghiệp nội địa" },
    { market: "china",   revenuePct: 8,  type: "import",  products: "Thép xây dựng, máy móc từ TQ" },
    { market: "korea",   revenuePct: 2,  type: "import",  products: "Máy móc thiết bị từ Hàn Quốc" },
  ],
  keySensitivities: ["china"],
  summaryVi: "CTD: 90% nội địa. Nhập vật liệu xây dựng từ TQ (8%). Ít nhạy cảm với địa chính trị, chủ yếu rủi ro chi phí thép/vật liệu.",
},
NKG: {
  code: "NKG",
  companyName: "Nam Kim Steel",
  exposures: [
    { market: "vietnam", revenuePct: 55, type: "export",  products: "Thép cuộn cán nguội, tôn mạ nội địa" },
    { market: "asean",   revenuePct: 20, type: "export",  products: "Xuất khẩu thép sang ASEAN" },
    { market: "eu",      revenuePct: 10, type: "export",  products: "Xuất khẩu tôn mạ sang EU (rủi ro chống bán phá giá)" },
    { market: "china",   revenuePct: 35, type: "import",  products: "Nhập HRC coil từ TQ (~35% chi phí)" },
    { market: "taiwan",  revenuePct: 15, type: "import",  products: "Nhập HRC coil từ Đài Loan (~15% chi phí)" },
  ],
  keySensitivities: ["china", "taiwan", "asean", "eu"],
  summaryVi: "NKG: 20% ASEAN + 10% EU xuất khẩu. Nhập HRC từ TQ (35%) và Đài Loan (15%). Căng thẳng Đài Loan → gián đoạn nguồn cung HRC.",
},
```

**STOCK_RELEVANCE_KEYWORDS entries** — insert after `VEA` entry at line ~232:

```typescript
DHG: ["dược", "pharma", "pharmaceutical", "thuốc", "api", "dược hậu giang", "dhg"],
GMD: ["logistics", "cảng", "vận tải biển", "container", "gemadept", "gmd", "freight"],
CTD: ["xây dựng", "construction", "coteccons", "ctd", "nhà thầu"],
NKG: ["thép", "steel", "hrc", "nam kim", "nkg", "cuộn cán nguội"],
```

---

## Interface Contracts

No new interfaces. All changes use existing types:

| Type | File | Used by |
|---|---|---|
| `SectorRule` (existing) | `cascadeEngine.ts` | Taiwan SECTOR_RULES entries |
| `StockTradeProfile` (existing) | `tradeRelationships.ts` | DHG/GMD/CTD/NKG profiles |
| `WatchlistEntry` (existing) | `cascadeEngine.ts` | fire-and-forget cast from `WatchlistRow` |
| `RunCascadeInput` (existing) | `runImpactChain.ts` | BCTC trigger call |

---

## Test Strategy

**File:** `src/__tests__/1303i-cascade-gaps.test.ts`

### RED tests (write first, must fail before implementation)

**RED-1: Taiwan strait escalation → tech domain entry**

```typescript
describe("1303i — cascade gap: Taiwan geo routing", () => {
  it("RED: taiwan strait escalation → tech domain entry in chain", async () => {
    const text = "Taiwan strait military exercises escalate — TSMC warns supply chain disruption";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [{ code: "FPT", domain: "tech" }],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });
    const techEntry = chain.domainEntries.find((e) => e.affectedDomains.includes("tech"));
    expect(techEntry).toBeDefined();
    expect(techEntry?.direction).toBe("down");
    const matchedRule = chain.matchedRules?.find((r) => r.sector === "tech");
    expect(matchedRule).toBeDefined();
  });
});
```

**RED-2: BCTC overdue → runImpactChain called**

```typescript
describe("1303i — cascade gap: BCTC overdue → runImpactChain", () => {
  it("RED: runBctcOverdueCheck calls runImpactChain for each overdue ticker", async () => {
    // Mock DB with 2 overdue stocks past deadline
    // Spy on runImpactChain import
    // Assert spy called twice (once per ticker)
    // Assert RunResult returned normally even if runImpactChain rejects
  });
});
```

**RED-3: Trade map 4 sectors**

```typescript
describe("1303i — cascade gap: trade map 4 sectors", () => {
  it("RED: DHG/GMD/CTD/NKG have trade profiles; china triggers DHG impact", () => {
    const text = "China restricts API pharmaceutical exports to curb drug shortages";
    const impacts = analyzeTradeImpact(text, ["DHG", "GMD", "CTD", "NKG"]);
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts.some((i) => i.code === "DHG" && i.country === "china")).toBe(true);
    expect(getTradeProfile("DHG")).not.toBeNull();
    expect(getTradeProfile("GMD")).not.toBeNull();
    expect(getTradeProfile("CTD")).not.toBeNull();
    expect(getTradeProfile("NKG")).not.toBeNull();
  });

  it("RED: detectCountries returns taiwan for tsmc/taiwan strait text", () => {
    const countries = detectCountries("tsmc taiwan strait tensions escalate");
    expect(countries).toContain("taiwan");
  });
});
```

### GREEN regression tests (must stay passing)

- Hormuz escalation → oil_gas up (existing rule, no keyword overlap with Taiwan)
- Middle East peace → aviation up (existing de-escalation rule intact)
- `analyzeTradeImpact` with VNM + middle_east text → still returns VNM impact
- `detectCountries("iran attack hormuz")` → returns `["middle_east"]`, NOT `["taiwan"]`

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Taiwan escalation keywords overlap with generic "war"/"conflict" rules | Low | Medium | Taiwan block uses specific keywords ("taiwan strait", "tsmc", "eo biển đài loan") — no overlap with generic "war"/"conflict" at line 1400 |
| `void runImpactChain(...)` silently swallows errors in prod | Low | Low | `.catch((err) => logger.warn(...))` ensures errors are logged, not silently dropped |
| `WatchlistRow` → `WatchlistEntry` cast missing fields | Low | High | Both types have `code` + `domain`; explicit map `{ code: w.code, domain: w.domain }` prevents type drift |
| NKG `taiwan` import exposure triggers spurious STOCK_RELEVANCE gate | Low | Low | `STOCK_RELEVANCE_KEYWORDS.NKG` uses `["thép","steel","hrc","nam kim","nkg"]` — relevance gate correctly filters non-steel articles |
| `"pharma"` vs `"pharmaceutical"` DomainType collision | None | None | `tradeRelationships.ts` uses `market` (country string) on profiles, not domain type — no collision possible |

---

## Security Review

- SQL parameterized? Yes — no new SQL; existing parameterized queries unchanged
- File paths validated? Yes — no file I/O added
- External HTTP rate-limited? Yes — `runImpactChain` commodity/SBV fetchers already rate-limited; fire-and-forget call injects `ragRetriever: async () => []` to skip RAG I/O
- Secrets via Bun.env only? Yes — no new env vars
