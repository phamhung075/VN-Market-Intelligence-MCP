# TECH-019: Know What You're Watching — Alias Resolution + Market-Wide Broadcast

status: APPROVED_BY_ARCHITECT
req_ref: REQ-019
sprint: 019

---

## Brownfield Impact

- Files created:
  - `src/domain/services/stockAliases.ts`
  - `src/__tests__/160-stock-aliases.test.ts`
  - `src/__tests__/161-alias-wiring.test.ts`
  - `src/__tests__/162-market-wide-broadcast.test.ts`

- Files modified:
  - `src/domain/services/cascadeEngine.ts` — alias fallback in Step 3 + market-wide broadcast after Step 3 + `broadcastMinImpact` parameter
  - `src/application/usecases/pollNews.ts` — Gate 3 alias extension + `broadcastMinImpact` injection
  - `src/application/usecases/runImpactChain.ts` — `broadcastMinImpact` injection from config
  - `mcp.config.json` — new key `alerts.marketWideCascadeMinImpact`

- Files deleted: none

- Breaking changes: no. `buildCausalChain` gains one optional parameter appended at position 6. All existing callers omitting it receive the default of `6`, which is behaviorally identical to the current absence of broadcast logic. `CausalChain`, `WatchlistImpact`, `Signal`, and `Alert` type shapes are unchanged.

---

## Architecture Decision

The alias resolution gap and the market-wide broadcast gap both live in the cascade engine's Step 3 action-entry loop, which currently requires a domain-rule match to produce a watchlist impact. The fix for aliases is a same-layer pure function lookup (domain → domain) that operates as a fallback after the primary ticker scan; no type changes are needed because `reasoning` is a free-form string that already carries annotations. The market-wide broadcast is a post-Step-3 pass over stocks not yet covered, parameterised by an injected threshold so the domain function stays free of I/O. Both changes follow the existing pattern of injecting configuration values from the application layer, exactly as `macroContext` and `macroStats` are already injected.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `stockAliases.ts` — alias dictionary + pure detection functions | domain | `src/domain/services/stockAliases.ts` | NEW |
| Alias fallback in `buildCausalChain` Step 3 | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| `isMarketWide()` helper + broadcast pass in `buildCausalChain` | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| `broadcastMinImpact` parameter on `buildCausalChain` | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| Gate 3 alias extension | application | `src/application/usecases/pollNews.ts` | MODIFY |
| `broadcastMinImpact` injection in `pollNews` | application | `src/application/usecases/pollNews.ts` | MODIFY |
| `broadcastMinImpact` injection in `runImpactChain` | application | `src/application/usecases/runImpactChain.ts` | MODIFY |
| `alerts.marketWideCascadeMinImpact` config key | infrastructure config | `mcp.config.json` | MODIFY |
| Task 160 tests | test | `src/__tests__/160-stock-aliases.test.ts` | NEW |
| Task 161 tests | test | `src/__tests__/161-alias-wiring.test.ts` | NEW |
| Task 162 tests | test | `src/__tests__/162-market-wide-broadcast.test.ts` | NEW |

---

## Interface Contracts

### Task 160 — `src/domain/services/stockAliases.ts`

This file exports two public functions and one private helper. No imports from
infrastructure or application. No side effects. No runtime I/O.

```typescript
/**
 * Normalise a string for alias comparison:
 *   1. Unicode NFD decomposition (separates base chars from combining marks)
 *   2. Strip all Unicode combining marks (diacritics) via regex category \p{M}
 *   3. Lowercase
 *
 * Private — not exported.
 */
function normalizeText(s: string): string

/**
 * Return all known aliases for a ticker, already normalised via normalizeText().
 * Returns [] for unknown codes. Never throws.
 *
 * @param code - Uppercase ticker, e.g. "VNM"
 */
export function getAliasesForCode(code: string): string[]

/**
 * Detect which watchlistCodes have an alias appearing in text.
 * Alias detection is purely substring-based (consistent with the
 * existing ticker scan in newsNormalizer.ts).
 *
 * Normalises text once, then checks each alias as a substring.
 * Returns deduplicated list of matched codes. Order is not significant.
 * Returns [] for empty text, empty watchlist, or no match. Never throws.
 *
 * @param text           - Article title + summary concatenated
 * @param watchlistCodes - Ticker codes to check, e.g. ["VNM", "FPT"]
 */
export function detectStocksInText(text: string, watchlistCodes: string[]): string[]
```

**Static alias map structure:**

```typescript
// Internal only — not exported
const STOCK_ALIASES: Record<string, string[]> = {
  // Each value: pre-normalised aliases (already NFD-stripped, lowercase)
  // The normalizeText() helper is applied to all values at module load time
  // so call-time normalisation only needs to be applied to the input text.
  VNM: [
    "vinamilk",
    "cong ty co phan sua viet nam",
    "sua vinamilk",
    "viet nam dairy",
    "vietnam dairy products",
    // ... additional forms
  ],
  FPT: [
    "fpt corporation",
    "tap doan fpt",
    "cong ty fpt",
    "fpt software",
    "fpt telecom",
    // ...
  ],
  // ... all 20+ required stocks
};
```

**Required stock coverage (minimum 20 stocks, minimum 3 aliases each):**

| Ticker | Required aliases (Vietnamese full name / short trade name / English + diacritic-free) |
|---|---|
| VNM | vinamilk, cong ty co phan sua viet nam, viet nam dairy |
| FPT | fpt corporation, tap doan fpt, fpt software |
| VCB | vietcombank, ngan hang vietcombank, bank for foreign trade of vietnam |
| VEA | veam, tong cong ty may dong luc va nong nghiep viet nam, vietnam engine |
| HPG | hoa phat, tap doan hoa phat, hoa phat group, hoa phat steel |
| VIC | vingroup, tap doan vingroup, vingroup corporation |
| VHM | vinhomes, cong ty cp vinhomes, vinhomes corporation |
| MSN | masan, tap doan masan, masan group |
| MWG | the gioi di dong, mobile world, cong ty cp dau tu the gioi di dong |
| TCB | techcombank, ngan hang techcombank, technological commercial bank |
| BID | bidv, ngan hang bidv, bank for investment and development |
| CTG | vietinbank, ngan hang vietinbank, vietnam joint stock commercial bank |
| ACB | acb, ngan hang a chau, asia commercial bank |
| VPB | vpbank, ngan hang vpbank, vietnam prosperity bank |
| HDB | hdbank, ngan hang hdbank, ho chi minh city development bank |
| STB | sacombank, ngan hang sacombank, sai gon thuong tin commercial bank |
| GAS | petrovietnam gas, pvgas, tong cong ty khi viet nam |
| PLX | petrolimex, tap doan xang dau viet nam, vietnam national petroleum group |
| SAB | sabeco, tong cong ty cp bia ruou nuoc giai khat sai gon, saigon beer |
| REE | ree corporation, cong ty co phan co dien lanh ree |
| PNJ | pnj, cong ty cp vang bac da quy phu nhuan, phu nhuan jewelry |
| DHG | duoc hau giang, cong ty co phan duoc hau giang, hau giang pharmaceutical |

Note for Developer: each ticker must include the accent-free form explicitly because
`normalizeText()` strips NFD combining marks but does NOT transliterate fully unaccented
spellings (e.g. "Hoa Phat" → after NFD strip remains "Hoa Phat"; the alias map must
contain "hoa phat" explicitly alongside the accented form "hoa phat" which NFD
normalisation produces from "Hòa Phát"). The normaliseText() function only strips
*combining marks* — it does not convert `ò → o` without decomposition. Since the alias
map itself is normalised at load time (all entries passed through `normalizeText()`), a
developer writing the alias as "Hòa Phát" will get the NFD-stripped form "Hoa Phat" at
runtime. The accented form and the NFD-stripped form are therefore one and the same after
normalisation. The only edge case is sources that emit fully unaccented strings like
"Hoa Phat" where no combining marks ever existed — these are handled automatically
because NFD of "Hoa Phat" == "Hoa Phat" after mark stripping.

---

### Task 161 — Changes to `cascadeEngine.ts`

#### 1. New import (same layer)

```typescript
import { detectStocksInText } from "./stockAliases.js";
```

#### 2. Updated `buildCausalChain` signature

```typescript
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
  macroContext?: MacroContext | null,
  macroStats?: MacroStats[],
  broadcastMinImpact?: number,   // NEW — optional, default 6
): CausalChain
```

No changes to return type `CausalChain`.

#### 3. Step 3 alias fallback (within the watchlist loop)

Location: inside the `for (const stock of deduplicatedWatchlist)` loop in Step 3, after
the existing `domainEntry` lookup.

Current behaviour (pseudocode):
```
if (!domainEntry) continue;   // skip if no domain rule fired
create actionEntry using domainEntry
```

New behaviour (pseudocode):
```
const seedText = seedEntry.sourceTitle + " " + seedEntry.summary;
const aliasHits = detectStocksInText(seedText, [stock.actionCode]);
const resolvedViaAlias = aliasHits.length > 0;

if (!domainEntry && !resolvedViaAlias) continue;  // still skip if neither path matched

if (domainEntry) {
  // Existing path — domain rule fired
  create actionEntry using domainEntry (unchanged logic)
} else {
  // Alias fallback path — no domain rule, but trade name found in text
  // Use fallback confidence 0.55 (same as uncoveredDomains pattern)
  // Derive sentiment/direction from seedEntry
  create actionEntry with:
    confidence: 0.55
    sentiment: seedEntry.sentiment
    impactScore: Math.round(seedEntry.impactScore * 0.55)
    reasoning: `[AliasResolved: "<matched alias>" → ${stock.actionCode}] Cổ phiếu được phát hiện qua tên thương hiệu. Không có quy tắc ngành khớp.`
}
```

The `reasoning` annotation must contain the literal string `"AliasResolved"` for log
traceability (tested in AC-7). The matched alias to include in the annotation can be
retrieved by calling `getAliasesForCode(stock.actionCode)` and finding which one
appears in the normalised seed text — or the Developer may embed the match detection
logic directly using `detectStocksInText` with single-stock input and annotate with
the stock code only if the exact alias extraction overhead is not worth the complexity.
The AC only requires `"AliasResolved"` to appear in `reasoning`; the matched alias
string in the annotation is for developer convenience, not tested.

#### 4. `watchlistImpacts` construction (Step 5) — no change needed

Step 5 already maps `actionEntries` to `watchlistImpacts` by reading `affectedActions[0]`,
`affectedDomains[0]`, `sentiment`, and `confidence`. The alias-fallback action entries
created in Step 3 will be picked up automatically by Step 5 with no modifications.

---

### Task 161 — Changes to `pollNews.ts`

#### Gate 3 extension (direct mention check)

Location: the `const directMention = ...` assignment at line ~462 in the current file.

Current:
```typescript
const directMention = titleAndSummary.includes(impact.actionCode.toLowerCase());
```

New:
```typescript
const tickerMatch = titleAndSummary.includes(impact.actionCode.toLowerCase());
const aliasMatch = tickerMatch
  ? false  // short-circuit: if ticker matched, skip alias scan
  : detectStocksInText(titleAndSummary, [impact.actionCode]).length > 0;
const directMention = tickerMatch || aliasMatch;
```

Required import (top of file, domain layer is a permitted downward import):
```typescript
import { detectStocksInText } from "../../domain/services/stockAliases.js";
```

#### `broadcastMinImpact` injection in `pollNews`

Location: the `chain = buildCausalChain(...)` call at line ~424.

Current call:
```typescript
chain = buildCausalChain(entry, watchlist, ragResults, macroContext, macroStats);
```

New call (after Task 162 config key is in place):
```typescript
chain = buildCausalChain(entry, watchlist, ragResults, macroContext, macroStats, broadcastMinImpact);
```

`broadcastMinImpact` is resolved once per `pollNews()` invocation from `loadMcpConfig()`,
defaulting to `6` on config load failure — consistent with the existing `nmCfg` load
pattern already in the function.

---

### Task 162 — Additional changes to `cascadeEngine.ts`

#### Private helper `isMarketWide`

```typescript
/**
 * Returns true when the article text and metadata indicate a market-wide event.
 *
 * An article is market-wide if ANY of the following:
 *   (a) Contains "vn-index" (case-insensitive — handled by normalised input)
 *   (b) Contains ("toan thi truong" OR "thi truong chung khoan") AND at least
 *       one price/movement token ("giam", "tang", "mat diem", "diem", "%")
 *   (c) seedEntry.level is "country" or "global" AND impactScore >= minImpact
 *
 * All string comparisons are on pre-lowercased text; no separate normalisation
 * needed because the caller lowercases seedText before passing it in.
 *
 * Private — not exported.
 */
function isMarketWide(
  seedTextLower: string,
  level: AnalysisLevel,
  impactScore: number,
  minImpact: number,
): boolean
```

Implementation note: the Vietnamese strings in criteria (b) should be compared against
the NFD-normalised (diacritic-stripped) version of `seedTextLower` because news sources
may or may not include diacritics. The `normalizeText` from `stockAliases.ts` is NOT
imported here (different file). The Developer should apply the same inline normalisation
(`s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()`) to `seedTextLower` before
the market-wide string checks, or inline the NFD strip within `isMarketWide`. This avoids
a dependency on `stockAliases.ts` for a different concern.

Key Vietnamese strings after NFD strip (for reference in implementation):
- `"vn-index"` → `"vn-index"` (no diacritics)
- `"toàn thị trường"` → `"toan thi truong"`
- `"thị trường chứng khoán"` → `"thi truong chung khoan"`
- `"giảm"` → `"giam"`
- `"tăng"` → `"tang"`
- `"mất điểm"` → `"mat diem"`
- `"điểm"` → `"diem"`

#### Broadcast pass (after Step 3, before Step 4 RAG enrichment)

Location: after `entries.push(...actionEntries)` and before the RAG enrichment block.

```
NEW: Compute the set of action codes already covered by actionEntries
     to enforce the no-duplicate rule.

const alreadyCoveredCodes = new Set(actionEntries.map(ae => ae.affectedActions[0] ?? ""));
const effectiveBroadcastMin = broadcastMinImpact ?? 6;

if (isMarketWide(normalised_seed_text, seedEntry.level, seedEntry.impactScore, effectiveBroadcastMin)
    && seedEntry.impactScore >= effectiveBroadcastMin) {

  // Map seedEntry.sentiment to ImpactDirection for broadcast entries
  const broadcastDirection: ImpactDirection =
    seedEntry.sentiment === "bullish" ? "up"
    : seedEntry.sentiment === "bearish" ? "down"
    : "neutral";

  for (const stock of deduplicatedWatchlist) {
    if (alreadyCoveredCodes.has(stock.actionCode)) continue;  // no double broadcast

    const broadcastConfidence = Math.min(0.7, seedEntry.impactScore / 10);

    // Push directly to actionEntries (Step 5 will pick them up automatically)
    actionEntries.push({
      level: "action",
      title: `${stock.actionCode} — ảnh hưởng toàn thị trường`,
      summary: `Cổ phiếu ${stock.actionCode} bị ảnh hưởng theo diễn biến chung của thị trường.`,
      affectedDomains: [stock.domain],
      affectedActions: [stock.actionCode],
      sentiment: seedEntry.sentiment,
      impactScore: Math.round(seedEntry.impactScore * broadcastConfidence),
      confidence: broadcastConfidence,
      reasoning: `market-wide cascade: ${seedEntry.sourceTitle.slice(0, 80)}`,
    });
  }
}
```

Important: the broadcast pass uses `deduplicatedWatchlist` (already built in Step 3) so
stocks are not doubled. The broadcast entries are appended to `actionEntries`, which is
already referenced by the Step 5 `watchlistImpacts` mapping — no change to Step 5.

#### `broadcastMinImpact` default inside `buildCausalChain`

The function body resolves the effective value with:
```typescript
const effectiveBroadcastMin = broadcastMinImpact ?? 6;
```

---

### Task 162 — Changes to `runImpactChain.ts`

Location: Step 3, the `return buildCausalChain(...)` call.

Current:
```typescript
return buildCausalChain(seedEntry, input.watchlist, ragResults, macroContext, macroStats);
```

New:
```typescript
// Load broadcast threshold from config (best-effort; default 6 on failure)
let broadcastMinImpact = 6;
try {
  const { loadMcpConfig } = await import("../../infrastructure/config.js");
  const cfg = loadMcpConfig();
  broadcastMinImpact = cfg.alerts?.marketWideCascadeMinImpact ?? 6;
} catch { /* use default */ }

return buildCausalChain(seedEntry, input.watchlist, ragResults, macroContext, macroStats, broadcastMinImpact);
```

---

### `mcp.config.json` addition

Under the `alerts` object, alongside the existing `newsMention` sub-object:

```json
"marketWideCascadeMinImpact": 6
```

Full `alerts` section structure after the change:

```json
"alerts": {
  "defaultDropPct": -3,
  "defaultRisePct": 5,
  "defaultImpactScoreMin": 7,
  "volumeSpikeMultiplier": 2,
  "reportFreshHours": 24,
  "severityEscalation": { ... },
  "newsMention": { ... },
  "marketWideCascadeMinImpact": 6,
  "telegramOnSeverity": [...],
  ...
}
```

---

## Task Breakdown (for PM)

Dependencies and suggested implementation order:

1. **Task 160** — `stockAliases.ts` + `160-stock-aliases.test.ts`
   - Depends on: nothing. Can start immediately.
   - Deliverable: stable `getAliasesForCode` and `detectStocksInText` API with >= 30 tests passing.

2. **Task 161** — Alias wiring in `cascadeEngine.ts` and `pollNews.ts` + `161-alias-wiring.test.ts`
   - Depends on: Task 160 (imports `detectStocksInText`).
   - Also introduces the `broadcastMinImpact?: number` 6th parameter on `buildCausalChain` (as prep for Task 162).
   - Deliverable: AC-7, AC-8, AC-12 pass; no regression on existing cascade tests.

3. **Task 162** — Market-wide broadcast + `runImpactChain` injection + `mcp.config.json` + `162-market-wide-broadcast.test.ts`
   - Depends on: Task 160. Can be developed in parallel with Task 161 after Task 160 merges.
   - Note: Task 161 adds the `broadcastMinImpact` parameter to `buildCausalChain`; Task 162 implements the broadcast logic that uses it. If developed in parallel, coordinate on the parameter addition.
   - Deliverable: AC-9, AC-10, AC-11 pass; config key live.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Alias substring causes false positives (e.g. "acb" matching unrelated English text) | Medium | Low | Aliases must be trade-name specific (min 7 chars for short aliases). "ACB" as a 3-letter alias is risky; use "ngan hang a chau" or "asia commercial bank" as the canonical form. The ticker scan in `newsNormalizer.ts` already handles "ACB" as a token. |
| Performance: `detectStocksInText` called in inner loop with large alias map | Low | Low | The alias map is a static `const` object (no I/O). The inner loop iterates at most 20 watchlist codes × ~6 aliases = 120 substring checks per article. At ~500 chars per text, this is <0.1 ms per invocation. No regex compilation at call time. |
| Broadcast spam: market-wide fires for low-quality articles with `impactScore >= 6` | Low | Medium | Threshold default is 6 (upper half of 1-10 scale). The noise filter in `pollNews` Gate 2 (non-neutral sentiment) still applies after `buildCausalChain` — broadcast entries must still pass Gate 2 and Gate 3 (Gate 3 is now met by the broadcast entries, since they are alias or direct matches). The 0.7 confidence cap also constrains severity escalation. |
| `broadcastMinImpact` missing from config on first deploy | Low | Low | Both callers (`runImpactChain`, `pollNews`) use `?? 6` fallback. No throw on missing key. |
| Alias collision between two tickers sharing a name fragment | Low | Medium | Developer must audit the alias map at PR time. No two tickers should share the same short alias. Use company-specific forms only. |
| Task 161 and Task 162 developed in parallel — parameter conflict on `buildCausalChain` | Low | Medium | Task 161 adds the 6th parameter stub (optional, unused internally until Task 162). Task 162 implements the body. If truly parallel, the Developer on Task 162 should branch from Task 161's branch or coordinate via a shared stub. PM should serialise if the team is small. |

---

## Security Review

- SQL parameterized? Yes — no new SQL queries introduced.
- File paths validated (no `../`)? Yes — no new file I/O introduced.
- External HTTP rate-limited? Yes — no new HTTP calls introduced.
- Secrets via Bun.env only? Yes — no new secrets introduced.
- Alias map static data: read-only `const`, no runtime mutation, no injection surface.

---

## Test Strategy

### Task 160 — `src/__tests__/160-stock-aliases.test.ts` (>= 30 tests)

Required test groups:

| Group | Count | What to test |
|---|---|---|
| `getAliasesForCode` — known tickers | 4 | VNM, FPT, VCB, HPG each return >= 3 lowercase strings |
| `getAliasesForCode` — unknown code | 1 | "ZZZZ" returns [] without throwing |
| `getAliasesForCode` — lowercase input | 1 | "vnm" vs "VNM" behaviour (specify: normalise input to uppercase or document that code must be uppercase) |
| `detectStocksInText` — exact trade name | 4 | VNM/"Vinamilk", HPG/"Hòa Phát", VCB/"Vietcombank", FPT/"FPT Corporation" |
| `detectStocksInText` — sentence context | 4 | Trade name embedded in a realistic Vietnamese sentence per AC-1, AC-2 |
| `detectStocksInText` — accent-normalised | 2 | "Hoa Phat" (no diacritics) → HPG; "vinamilk" typo variant |
| `detectStocksInText` — no false positive | 3 | Generic news text with no trade names → [] (AC-4) |
| `detectStocksInText` — multi-stock | 2 | Two trade names in one article → both codes returned (AC-5) |
| `detectStocksInText` — edge: empty text | 1 | "" → [] |
| `detectStocksInText` — edge: empty watchlist | 1 | Any text, [] watchlist → [] |
| `detectStocksInText` — watchlist filter | 2 | Article mentions VNM alias but watchlist only has FPT → [] |
| `detectStocksInText` — deduplication | 1 | Alias appears twice → single code in result |
| `detectStocksInText` — case insensitivity | 2 | "VINAMILK" and "Vinamilk" both match |
| Performance smoke test | 1 | 500-char text, 20-stock watchlist, completes < 5 ms |
| `getAliasesForCode` output format | 2 | All returned strings are lowercase; no empty strings |

Total: ~31 tests.

### Task 161 — `src/__tests__/161-alias-wiring.test.ts`

Required test cases (covering AC-7, AC-8, AC-12):

- AC-7: `buildCausalChain` with "Vinamilk lên kế hoạch..." → `watchlistImpacts` contains VNM entry with `reasoning` containing `"AliasResolved"`.
- AC-8: Same article with no SECTOR_RULE keyword for `retail` domain → VNM entry has `confidence === 0.55`.
- AC-8 variant: Article that DOES trigger a SECTOR_RULE for retail domain → VNM entry uses domain-rule confidence (not 0.55).
- AC-12 simulation: `directMention` computation in Gate 3 — mock `detectStocksInText` return; verify a VNM impact passes Gate 3 when alias matches.
- Regression: article with no alias and no domain rule → watchlistImpacts does NOT contain that stock (existing behaviour preserved).
- Regression: article with ticker in text (existing path) still works after the alias fallback addition.

Total: ~6–8 tests.

### Task 162 — `src/__tests__/162-market-wide-broadcast.test.ts` (>= 10 tests)

Required test cases (covering AC-9, AC-10, AC-11):

- AC-9: VN-Index article, impactScore 8, bearish, watchlist [VNM, FPT, VCB, VEA], `broadcastMinImpact` 6 → 4 watchlistImpacts, all with `confidence <= 0.7`, all reasoning starting with `"market-wide cascade:"`, all `impactDirection === "down"`.
- AC-9 variant: bullish article → all entries have `impactDirection === "up"`.
- AC-9 variant: neutral article → all entries have `impactDirection === "neutral"`.
- AC-10: Market-wide article with impactScore 5, `broadcastMinImpact` 6 → zero broadcast entries.
- AC-10 variant: impactScore exactly 6 → broadcast fires (boundary value).
- AC-11: HPG in watchlist, "thép" keyword fires steel SECTOR_RULE → HPG gets exactly ONE entry in `watchlistImpacts`.
- AC-11 variant: all 4 watchlist stocks already covered by SECTOR_RULES → broadcast adds zero entries.
- Empty watchlist: broadcast with 0 watchlist stocks → zero entries, no crash.
- Non-market-wide article (no "vn-index", no market keywords, level "domain") → no broadcast.
- `broadcastMinImpact` omitted (undefined) → defaults to 6, broadcast fires for impactScore 8.
- `isMarketWide` criteria (b): "thi truong chung khoan giam" (with normalisation) → classified as market-wide.

Total: ~11 tests.

### Full regression check

After all three tasks merge, run:
```bash
bun test && bun tsc --noEmit
```

Specific regression targets:
- `src/__tests__/126-macro-cascade.test.ts` — existing cascade chain tests must not change
- `src/__tests__/131-alert-quality.test.ts` — dedup/cooldown pipeline unaffected
- `src/__tests__/134-sentiment-classifier.test.ts` — sentinel — cascadeEngine imports it
- `src/__tests__/137-fix-alert-pipeline.test.ts` — Gate 3 logic must not regress Sprint 017 noise filter behaviour (AC-13)

---

## Integration Points Summary

```
stockAliases.ts (NEW domain)
   ↑ imported by
cascadeEngine.ts (Step 3 alias fallback + broadcast)
   ↑ called by
pollNews.ts (Gate 3 alias + broadcastMinImpact injection)
runImpactChain.ts (broadcastMinImpact injection)

mcp.config.json alerts.marketWideCascadeMinImpact
   ↑ read by
pollNews.ts → passed to buildCausalChain
runImpactChain.ts → passed to buildCausalChain
```

No new MCP tools. No Telegram format changes. No Alert/Signal/CausalChainEntry type shape changes.
