# Handoff: TASK_1315a — RED: Cascade cost-push rules (domain)

phase: RED
sprint: 1315
layer: domain
depends_on: none
tech_ref: docs/TECH_1315.md

---

## Objective

Add cascade rules (FR-1..FR-4), sentiment patterns (FR-5), and ClimateImpactMapper (FR-6) with failing test stubs. No GREEN assertions yet — stubs only in test file.

---

## Files to create/modify

| File | Action | Section |
|------|--------|---------|
| `src/domain/services/cascadeEngine.ts` | MODIFY | Insert 3 rule blocks (logistics fuel-cost, utilities coal/gas, construction input-cost) |
| `src/domain/services/sentimentClassifier.ts` | MODIFY | Append cost-push entries to VN_BEARISH + EN_BEARISH |
| `src/domain/services/climateImpactMapper.ts` | CREATE | New pure-domain lookup file |
| `src/__tests__/1315-cascade-cost-push-integration.test.ts` | CREATE | Failing stubs for AC-1..AC-8 |

---

## cascadeEngine.ts — 3 insertion blocks

### Block A: Logistics fuel-cost (FR-1, FR-2)

Find this existing line in cascadeEngine.ts:
```
  // ── Logistics: high oil price → cost pressure (bearish) ──────────────────
  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "fuel cost"],
```

INSERT BEFORE that comment + rule:

```typescript
  // ── Logistics: VN fuel-cost-specific phrases (FR-1, Task 1315a) ──────────
  // First-match-wins: VN fuel phrases more specific than generic "giá dầu tăng".
  // Insert BEFORE generic oil rule. GMD/VVN fuel ~30-40% trucking/maritime OPEX.
  {
    keywords: [
      "chi phí xăng dầu tăng",
      "cước nhiên liệu tăng",
      "phí nhiên liệu tăng",
      "giá xăng tăng",
      "xăng dầu tăng giá",
      "fuel surcharge",
      "bunker fuel cost",
      "trucking fuel cost",
    ],
    domain: "logistics",
    direction: "down",
    confidence: 0.72,
    title: "Chi phí xăng dầu tăng — áp lực OPEX nhiên liệu cho logistics (GMD, VVN)",
  },
  // ── Logistics: VN fuel-cost-down (FR-2, Task 1315a) ──────────────────────
  // Insert BEFORE generic "giá dầu giảm" rule. Symmetric inverse of FR-1.
  {
    keywords: [
      "giá xăng giảm",
      "chi phí nhiên liệu giảm",
      "xăng dầu giảm giá",
      "fuel cost down",
      "bunker fuel down",
    ],
    domain: "logistics",
    direction: "up",
    confidence: 0.68,
    title: "Chi phí xăng dầu giảm — OPEX giảm, tích cực cho logistics (GMD, VVN)",
  },
```

### Block B: Utilities coal/gas (FR-3)

Find this existing block in cascadeEngine.ts:
```
  // ── Energy transition ──────────────────────────────────────────────────────
  {
    keywords: ["renewable energy", "solar", "wind power", "năng lượng tái tạo", "điện mặt trời", "điện gió"],
    domain: "utilities",
    direction: "up",
    confidence: 0.65,
    title: "Chuyển đổi năng lượng — tích cực cho REE, PC1, GEG (năng lượng sạch)",
  },
```

INSERT AFTER that closing `},`:

```typescript
  // ── Utilities: coal price → thermal power COGS (FR-3, Task 1315a) ─────────
  // POW (Petrovietnam Power): coal ~60-70% fuel COGS. First utilities commodity-input rule.
  {
    keywords: [
      "giá than tăng",
      "than đá tăng giá",
      "chi phí than tăng",
      "giá than nhiệt điện tăng",
      "coal price rise",
      "coal price up",
      "thermal coal surge",
    ],
    domain: "utilities",
    direction: "down",
    confidence: 0.75,
    title: "Giá than tăng — chi phí nhiên liệu điện tăng (POW bị ảnh hưởng)",
  },
  // ── Utilities: gas price → gas-fired + city gas distribution COGS (FR-3) ──
  // HNG (Hà Nội Gas): city gas distribution — gas is primary input cost.
  {
    keywords: [
      "giá khí đốt tăng",
      "giá LNG tăng",
      "giá khí tự nhiên tăng",
      "chi phí khí đốt tăng",
      "gas price rise",
      "LNG price rise",
      "natural gas price up",
      "gas price surge",
    ],
    domain: "utilities",
    direction: "down",
    confidence: 0.70,
    title: "Giá khí đốt/LNG tăng — áp lực chi phí điện khí và phân phối khí (HNG)",
  },
  // ── Utilities: coal fall (FR-3) ───────────────────────────────────────────
  {
    keywords: [
      "giá than giảm",
      "than đá giảm giá",
      "coal price fall",
      "coal price down",
    ],
    domain: "utilities",
    direction: "up",
    confidence: 0.68,
    title: "Giá than giảm — giảm chi phí nhiên liệu, tích cực cho điện than (POW)",
  },
  // ── Utilities: gas fall (FR-3) ────────────────────────────────────────────
  {
    keywords: [
      "giá khí đốt giảm",
      "giá LNG giảm",
      "LNG price fall",
      "gas price fall",
    ],
    domain: "utilities",
    direction: "up",
    confidence: 0.65,
    title: "Giá khí đốt giảm — tích cực cho điện khí và phân phối khí (HNG)",
  },
```

### Block C: Construction input-cost (FR-4)

Find this existing block:
```
  {
    keywords: ["đầu tư công", "infrastructure spending", "public investment", "xây dựng hạ tầng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.65,
    title: "Đầu tư công tăng — tích cực cho bất động sản khu vực hạ tầng",
  },
  // ── Seafood / agriculture: USD/VND rate → export revenue impact ──────────
```

INSERT BETWEEN the `real_estate` rule closing `},` and the `// ── Seafood` comment:

```typescript
  // ── Construction: input-cost squeeze (FR-4, Task 1315a) ──────────────────
  // Insert AFTER demand-side rules (above = "đầu tư công" → infrastructure demand).
  // These rules target commodity price keywords — no overlap with demand rules.
  // CTD/HTI: steel rebar ~20-25% project COGS; cement ~10-15%. Fixed-price contracts.
  {
    keywords: [
      "giá thép xây dựng tăng",
      "giá sắt thép tăng",
      "chi phí thép tăng",
      "thép xây dựng tăng giá",
      "vật liệu xây dựng tăng giá",
      "construction steel price rise",
      "rebar price rise",
      "steel input cost rise",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.73,
    title: "Giá thép xây dựng tăng — thu hẹp biên lợi nhuận nhà thầu (CTD, HTI)",
  },
  {
    keywords: [
      "giá xi măng tăng",
      "xi măng tăng giá",
      "chi phí xi măng tăng",
      "cement price rise",
      "cement price up",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.68,
    title: "Giá xi măng tăng — tăng chi phí đầu vào hợp đồng cố định (CTD, HTI)",
  },
  {
    keywords: [
      "giá thép xây dựng giảm",
      "giá xi măng giảm",
      "vật liệu xây dựng giảm giá",
      "construction material cost fall",
      "rebar price fall",
      "cement price fall",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.65,
    title: "Vật liệu xây dựng giảm — mở rộng biên lợi nhuận hợp đồng cố định (CTD, HTI)",
  },
```

---

## sentimentClassifier.ts — FR-5

Find the closing `];` of `VN_BEARISH` (after Task 1308a block, ~line 214):

```typescript
  { word: "tăng phòng thủ tiền mặt", weight: 3 },
];
```

Change to:

```typescript
  { word: "tăng phòng thủ tiền mặt", weight: 3 },
  // Task 1315a: Cost-push compound patterns (FR-5)
  // Weight 3: beats generic "tăng"(w1)+"chi phí"(w2) in mixed text.
  // Weight 4 (compound): net-bearish even with "tăng mạnh"(w2) co-firing.
  { word: "giá đầu vào tăng", weight: 3 },
  { word: "chi phí nguyên liệu tăng", weight: 3 },
  { word: "giá than tăng gây áp lực", weight: 4 },
  { word: "giá khí đốt tăng gây áp lực", weight: 4 },
  { word: "giá xăng tăng gây áp lực", weight: 4 },
  { word: "vật liệu xây dựng tăng giá", weight: 3 },
];
```

Find the closing `];` of `EN_BEARISH` (after Task 1308a block, ~line 290):

```typescript
  { word: "flight to safety", weight: 3 },
];
```

Change to:

```typescript
  { word: "flight to safety", weight: 3 },
  // Task 1315a: English cost-push patterns (FR-5)
  { word: "cost-push", weight: 3 },
  { word: "input cost inflation", weight: 3 },
  { word: "commodity cost pressure", weight: 3 },
  { word: "margin compression", weight: 2 },
];
```

---

## climateImpactMapper.ts — FR-6 (NEW FILE)

Create `src/domain/services/climateImpactMapper.ts`:

```typescript
/**
 * climateImpactMapper.ts — Task 1315a (FR-6)
 * Pure domain lookup: commodity + direction → affected sector cost structure.
 * ZERO imports from infrastructure/ or application/.
 * Standalone — NOT imported by cascadeEngine.ts in this sprint.
 */
import type { DomainType } from "../../../bctc-schema";

export interface CostImpactMap {
  commodity: string;
  direction: "up" | "down";
  domain: DomainType;
  costDriver: string;
  confidence: number;
  rationale: string;
}

const COST_IMPACT_TABLE: CostImpactMap[] = [
  {
    commodity: "oil", direction: "up", domain: "logistics",
    costDriver: "fuel OPEX ~30-40%",
    confidence: 0.72,
    rationale: "Giá dầu tăng → chi phí xăng dầu tăng → biên lợi nhuận vận tải giảm (GMD, VVN). Oil rise → fuel surcharge → trucking/maritime margin pressure.",
  },
  {
    commodity: "oil", direction: "down", domain: "logistics",
    costDriver: "fuel OPEX ~30-40%",
    confidence: 0.68,
    rationale: "Giá dầu giảm → chi phí nhiên liệu giảm → biên lợi nhuận vận tải mở rộng (GMD, VVN). Oil fall → lower fuel cost → logistics margin expansion.",
  },
  {
    commodity: "coal", direction: "up", domain: "utilities",
    costDriver: "fuel COGS ~60-70% thermal",
    confidence: 0.75,
    rationale: "Giá than tăng → chi phí nhiên liệu điện than tăng → biên lợi nhuận POW giảm. Coal rise → thermal power COGS spike → POW margin compression.",
  },
  {
    commodity: "coal", direction: "down", domain: "utilities",
    costDriver: "fuel COGS ~60-70% thermal",
    confidence: 0.68,
    rationale: "Giá than giảm → chi phí nhiên liệu điện than giảm → tích cực cho POW. Coal fall → lower thermal COGS → POW margin expansion.",
  },
  {
    commodity: "gas", direction: "up", domain: "utilities",
    costDriver: "fuel COGS ~50% gas-fired",
    confidence: 0.70,
    rationale: "Giá khí đốt/LNG tăng → chi phí điện khí và phân phối khí tăng (HNG, điện khí). Gas rise → gas-fired plant + city gas distribution margin squeeze.",
  },
  {
    commodity: "gas", direction: "down", domain: "utilities",
    costDriver: "fuel COGS ~50% gas-fired",
    confidence: 0.65,
    rationale: "Giá khí đốt giảm → chi phí đầu vào giảm → tích cực cho điện khí và HNG. Gas fall → lower input cost → utilities margin expansion.",
  },
  {
    commodity: "steel", direction: "up", domain: "construction",
    costDriver: "rebar ~20-25% project COGS",
    confidence: 0.73,
    rationale: "Giá thép xây dựng tăng → chi phí rebar/sắt thép tăng → biên lợi nhuận nhà thầu giảm (CTD, HTI). Steel rise → fixed-price contract margin squeeze.",
  },
  {
    commodity: "steel", direction: "down", domain: "construction",
    costDriver: "rebar ~20-25% project COGS",
    confidence: 0.65,
    rationale: "Giá thép giảm → chi phí đầu vào hạ → biên lợi nhuận nhà thầu mở rộng (CTD, HTI). Steel fall → fixed-price contract margin expansion.",
  },
  {
    commodity: "cement", direction: "up", domain: "construction",
    costDriver: "cement ~10-15% project COGS",
    confidence: 0.68,
    rationale: "Giá xi măng tăng → chi phí xây dựng tăng → áp lực lên nhà thầu hợp đồng cố định (CTD, HTI). Cement rise → contractor cost pressure.",
  },
  {
    commodity: "cement", direction: "down", domain: "construction",
    costDriver: "cement ~10-15% project COGS",
    confidence: 0.62,
    rationale: "Giá xi măng giảm → chi phí giảm → tích cực cho nhà thầu (CTD, HTI). Cement fall → lower input cost → contractor margin improvement.",
  },
];

/**
 * Returns all cost impact entries matching commodity + direction.
 * Returns empty array if no match (not an error).
 */
export function getCostImpactMaps(
  commodity: string,
  direction: "up" | "down"
): CostImpactMap[] {
  return COST_IMPACT_TABLE.filter(
    (e) => e.commodity === commodity && e.direction === direction
  );
}
```

---

## Test file: 1315-cascade-cost-push-integration.test.ts (STUBS only in 1315a)

Create `src/__tests__/1315-cascade-cost-push-integration.test.ts` with stubs that fail.
Developer writes failing `it.todo` or `expect(false).toBe(true)` stubs for AC-1..AC-8.
GREEN assertions go in TASK_1315b.

```typescript
import { describe, it, expect } from "bun:test";

describe("1315: Cost-push cascade rules", () => {
  it.todo("AC-1: logistics fuel-cost rule fires for GMD on 'chi phí xăng dầu tăng'");
  it.todo("AC-2: utilities coal-cost rule fires for POW");
  it.todo("AC-3: utilities gas-cost rule fires for HNG");
  it.todo("AC-4: construction steel input-cost rule fires for CTD");
  it.todo("AC-5: sentimentClassifier returns bearish for 'giá đầu vào tăng mạnh, biên lợi nhuận bị thu hẹp'");
  it.todo("AC-6: getCostImpactMaps('coal','up') returns utilities entry confidence 0.75");
  it.todo("AC-7: no existing cascade tests regress");
  it.todo("AC-8: climateImpactMapper.ts has zero infra imports");
});
```

---

## DDD compliance check (run before commit)

```bash
grep -r "from.*infrastructure" src/domain/services/climateImpactMapper.ts
grep -r "from.*application" src/domain/services/climateImpactMapper.ts
# Both must return empty
```

---

## [Architect] Brownfield Findings

interfaces_found:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts` — REUSE: SectorRule structure, SECTOR_RULES array, DomainType import pattern
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/sentimentClassifier.ts` — REUSE: VN_BEARISH/EN_BEARISH arrays, SentimentKeyword type, weight system

interfaces_to_create:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/climateImpactMapper.ts` — NEW: CostImpactMap interface + getCostImpactMaps function

decisions:
- "Logistics FR-1/FR-2 inserted BEFORE generic oil rules (line ~979/988) — first-match-wins requires more specific VN phrases first"
- "Utilities FR-3 inserted AFTER energy-transition rule (~line 1572) — first utilities commodity-input block, no prior ordering conflict"
- "Construction FR-4 inserted AFTER real_estate demand rule (~line 1028) — keyword isolation confirmed, no overlap with đầu tư công rules"
- "climateImpactMapper.ts NOT imported by cascadeEngine.ts — standalone lookup to avoid circular dep and keep cascadeEngine bounded"
- "Sentiment weights 3-4 (not 2) — matches Task 1308a rationale for compound phrases competing with tăng(w1)+tăng mạnh(w2)"

brownfield_scan_clean: true

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts   # Block A (FR-1/FR-2 before line ~979), Block B (FR-3 after energy-transition ~line 1572), Block C (FR-4 after real_estate demand rule ~line 1029)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/sentimentClassifier.ts   # FR-5: 6 VN patterns appended to VN_BEARISH, 4 EN patterns appended to EN_BEARISH
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/climateImpactMapper.ts   # FR-6: CostImpactMap interface + COST_IMPACT_TABLE (10 entries) + getCostImpactMaps() appended to existing file (file was not new — pre-existing weather mapper at Task 259)

files_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1315-cascade-cost-push-integration.test.ts   # 8 RED stubs (expect(false).toBe(true)), all fail as expected

brownfield_note: climateImpactMapper.ts was NOT a new file — it contained existing weather event mapper from Task 259. FR-6 content was appended rather than overwriting. The CostImpactMap interface uses `domain: string` (not `DomainType`) to avoid needing the bctc-schema import in the appended section.

tests_written:
- src/__tests__/1315-cascade-cost-push-integration.test.ts   # 8 RED stubs, all FAILING (expected for RED phase)

tests_skipped: []   # GREEN assertions go in TASK_1315b

tsc_clean: true
full_suite_pass: false   # 8 new RED stubs fail (expected). 9 pre-existing failures unrelated to this task. 6722 pass.
