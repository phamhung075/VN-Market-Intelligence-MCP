# TASK 1303i — Developer Handoff: Cascade Rule Gaps

tech_ref: TECH_1303i.md
req_ref: REQ_1303i.md
layer_touches: domain, scheduler, tests

---

## Pre-Confirmed Locations (skip brownfield, use these directly)

| File | Exact anchor | Action |
|---|---|---|
| `src/domain/services/cascadeEngine.ts` | Line 1337 — `// ── Geopolitical DE-ESCALATION` comment | Insert Taiwan DE-ESCALATION block BEFORE this comment |
| `src/domain/services/cascadeEngine.ts` | Line ~1420 — AFTER `gold_mining` escalation rule, BEFORE `// ── FDI` comment | Insert Taiwan ESCALATION block |
| `src/domain/services/tradeRelationships.ts` | Line 64 — after `uk:` entry, before closing `}` of `COUNTRY_KEYWORDS` | Insert `taiwan:` entry |
| `src/domain/services/tradeRelationships.ts` | Line 144 — after `VEA` profile closing `},`, before closing `}` of `TRADE_PROFILES` | Insert DHG/GMD/CTD/NKG profiles |
| `src/domain/services/tradeRelationships.ts` | Line 232 — after `VEA:` entry in `STOCK_RELEVANCE_KEYWORDS` | Insert DHG/GMD/CTD/NKG keyword arrays |
| `src/scheduler/financial-reports/bctcOverdueCheckJob.ts` | Line 277 — AFTER logger block (lines 270–276), BEFORE `return` | Insert fire-and-forget `runImpactChain` loop |

---

## Step-by-Step Checklist

### STEP 0 — Create RED test file (write before any implementation)

- [ ] Create `src/__tests__/1303i-cascade-gaps.test.ts`
- [ ] Write 3 RED `describe` blocks per TECH doc test strategy section
- [ ] Run `bun test src/__tests__/1303i-cascade-gaps.test.ts` — confirm ALL 3 tests FAIL
- [ ] Commit: `test(1303i): RED — taiwan geo/bctc-overdue/trade-map gaps`

---

### STEP 1 — G3a: taiwan entry in COUNTRY_KEYWORDS

File: `src/domain/services/tradeRelationships.ts`

- [ ] After line 64 (`uk: ["united kingdom", ...],`), insert:
  ```typescript
  taiwan: [
    "taiwan", "taiwanese", "đài loan", "taipei", "tsmc",
    "taiwan strait", "eo biển đài loan",
  ],
  ```
- [ ] Run `bun test src/__tests__/1303i-cascade-gaps.test.ts` — RED-3 `detectCountries` sub-test now passes
- [ ] Run full suite: `bun test` — confirm no regression

---

### STEP 2 — G3b: TRADE_PROFILES 4-sector seeds

File: `src/domain/services/tradeRelationships.ts`

- [ ] After the closing `},` of the `VEA` profile (line ~144), insert DHG/GMD/CTD/NKG profiles exactly as specified in TECH doc `## Gap-by-Gap Design > G3 > TRADE_PROFILES seeds`
- [ ] Note: `NKG` profile includes `{ market: "taiwan", revenuePct: 15, type: "import", ... }` — this requires `taiwan` to exist in `COUNTRY_KEYWORDS` (done in Step 1)
- [ ] Run `bun test src/__tests__/1303i-cascade-gaps.test.ts` — RED-3 `getTradeProfile` assertions now pass
- [ ] Run full suite: `bun test` — confirm no regression

---

### STEP 3 — G3c: STOCK_RELEVANCE_KEYWORDS 4-sector entries

File: `src/domain/services/tradeRelationships.ts`

- [ ] After the `VEA:` entry in `STOCK_RELEVANCE_KEYWORDS` (line ~232), insert:
  ```typescript
  DHG: ["dược", "pharma", "pharmaceutical", "thuốc", "api", "dược hậu giang", "dhg"],
  GMD: ["logistics", "cảng", "vận tải biển", "container", "gemadept", "gmd", "freight"],
  CTD: ["xây dựng", "construction", "coteccons", "ctd", "nhà thầu"],
  NKG: ["thép", "steel", "hrc", "nam kim", "nkg", "cuộn cán nguội"],
  ```
- [ ] Run `bun test src/__tests__/1303i-cascade-gaps.test.ts` — RED-3 `analyzeTradeImpact` DHG/china assertion now passes
- [ ] Run full suite: `bun test` — confirm no regression

---

### STEP 4 — G1: Taiwan rules in cascadeEngine

File: `src/domain/services/cascadeEngine.ts`

**4a — Taiwan DE-ESCALATION block**

- [ ] Locate line 1337: `// ── Geopolitical DE-ESCALATION (MUST be before escalation — first match wins) ──`
- [ ] Insert Taiwan DE-ESCALATION block (3 rules: tech/securities/retail) BEFORE that comment line
- [ ] Keywords for de-escalation: `["taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue", "taiwan strait reopen", "taiwan ceasefire", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan"]`
  - tech: direction `"up"`, confidence `0.80`
  - securities: direction `"up"`, confidence `0.75`
  - retail: direction `"up"`, confidence `0.68`

**4b — Taiwan ESCALATION block**

- [ ] Locate the `// ── FDI / foreign investment` comment (line ~1421)
- [ ] Insert Taiwan ESCALATION block (3 rules: tech/securities/retail) BEFORE that comment
- [ ] Keywords for escalation: `["taiwan strait", "taiwan military", "taiwan conflict", "taiwan invasion", "china taiwan", "tsmc disruption", "semiconductor supply", "taiwan blockade", "eo biển đài loan", "đài loan", "xung đột đài loan", "phong tỏa đài loan"]`
  - tech: direction `"down"`, confidence `0.80`
  - securities: direction `"down"`, confidence `0.75`
  - retail: direction `"down"`, confidence `0.68`

- [ ] Run `bun test src/__tests__/1303i-cascade-gaps.test.ts` — RED-1 Taiwan geo test now passes
- [ ] Run full suite: `bun test` — confirm Hormuz regression tests still pass

---

### STEP 5 — G2: BCTC overdue → runImpactChain trigger

File: `src/scheduler/financial-reports/bctcOverdueCheckJob.ts`

**5a — Add imports at top of file** (after existing imports):

- [ ] Add:
  ```typescript
  import { runImpactChain } from "../../application/usecases/runImpactChain.js";
  import type { WatchlistEntry } from "../../domain/services/cascadeEngine.js";
  ```

**5b — Insert fire-and-forget block**

- [ ] Locate line ~277: the block ends at `}` closing the `if (alertsInserted > 0)` logger (lines 270–276). Insert AFTER that closing `}`, BEFORE the `return {` statement.
- [ ] Insert exactly:
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

**5c — Verify non-blocking contract**

- [ ] Confirm there is NO `await` before `runImpactChain(...)` call
- [ ] Confirm `return { alertsInserted, stocksChecked, overdueFound }` is AFTER the fire-and-forget block and is unchanged

- [ ] Run `bun test src/__tests__/1303i-cascade-gaps.test.ts` — RED-2 BCTC test now passes
- [ ] Run full suite: `bun test`

---

### STEP 6 — TypeScript check

- [ ] `bun tsc --noEmit` — zero errors

---

### STEP 7 — Full regression pass

- [ ] `bun test` — all pre-existing cascade + trade-impact tests pass
- [ ] Manually verify: `bun test --grep "hormuz"` — Hormuz rules unaffected
- [ ] Manually verify: `bun test --grep "middle east"` — Middle East rules unaffected

---

### STEP 8 — Commit and branch hygiene

- [ ] Commit: `feat(1303i): close cascade gaps — taiwan geo rules, bctc-overdue chain, 4-sector trade map`
- [ ] `git checkout main` + merge branch + delete local + remote branch

---

## Critical Gotchas

1. **De-escalation BEFORE escalation** — Taiwan de-escalation rules must be inserted BEFORE the existing `// ── Geopolitical DE-ESCALATION` comment, not after. The existing comment block covers Hormuz/generic peace keywords. Taiwan de-escalation sits above it as a separate named group. The ordering principle (de-escalation first) is maintained across the entire block.

2. **Fire-and-forget contract** — The `void runImpactChain(...).catch(...)` pattern is intentional. Do NOT change to `await`. Do NOT wrap in `Promise.allSettled`. The return statement must be reached without waiting for any impact chain to complete.

3. **`ragRetriever: async () => []`** — Pass this explicitly in the BCTC trigger call. Without it, the default retriever hits LanceDB I/O in the scheduler context, adding latency and a failure surface that should not affect overdue alert insertion.

4. **NKG `taiwan` exposure** — NKG profile has `market: "taiwan"` (15% HRC import). This is valid only after Step 1 adds `taiwan` to `COUNTRY_KEYWORDS`. Do Steps 1 → 2 in order.

5. **`WatchlistRow` vs `WatchlistEntry`** — `WatchlistRow` (SQLite query result, from `bctcOverdueCheckJob.ts`) has `code` + `domain` fields matching `WatchlistEntry` shape. The explicit map `{ code: w.code, domain: w.domain }` is required — do not spread `...w` as `WatchlistRow` may have extra fields that violate strict typing.

---

## [Architect] Brownfield Findings

interfaces_found:
- `/abs/src/domain/services/cascadeEngine.ts`   # REUSE — `SectorRule` array, `buildCausalChain`, `WatchlistEntry` type
- `/abs/src/domain/services/tradeRelationships.ts`  # REUSE — `COUNTRY_KEYWORDS`, `TRADE_PROFILES`, `STOCK_RELEVANCE_KEYWORDS`, `analyzeTradeImpact`
- `/abs/src/application/usecases/runImpactChain.ts`  # REUSE — `runImpactChain`, `RunCascadeInput` with injectable `ragRetriever`

interfaces_to_create:
- none

decisions:
- "Taiwan rules placed as named block before existing Hormuz de-escalation block — preserves first-match-wins semantics and makes intent explicit"
- "BCTC trigger uses void+catch pattern not Promise.allSettled — order irrelevant, results not needed, error isolation per ticker"
- "ragRetriever injected as empty fn in BCTC scheduler context — skips LanceDB I/O, cascade fires on text pattern alone which is correct for governance-risk seed text"
- "NKG added with taiwan import exposure — creates live dependency on taiwan COUNTRY_KEYWORDS, Step ordering enforced in checklist"

brownfield_scan_clean: true

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts   # Taiwan de-escalation block (3 rules) before existing geo de-escalation comment; Taiwan escalation block (3 rules) before FDI comment
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/tradeRelationships.ts   # taiwan COUNTRY_KEYWORDS entry; DHG/GMD/CTD/NKG TRADE_PROFILES; DHG/GMD/CTD/NKG STOCK_RELEVANCE_KEYWORDS
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/financial-reports/bctcOverdueCheckJob.ts   # runImpactChain+WatchlistEntry imports; fire-and-forget block after alertsInserted logger; WatchlistRow→WatchlistEntry map uses actionCode+domain+exchange

tests_written:
- src/__tests__/1303i-cascade-gaps.test.ts   # 12 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 6592 pass, 16 fail (all 16 pre-existing; baseline was 6582 pass, 26 fail)

correction_vs_handoff:
- WatchlistEntry shape: handoff said code+domain but actual interface is actionCode+domain+exchange — map fixed in bctcOverdueCheckJob and tests
- CausalChain shape: handoff used chain.domainEntries+direction but actual is chain.entries (filter level=domain)+sentiment — tests updated
- Taiwan escalation test: both bearish and bullish tech entries coexist (generic FDI rule also fires tech_up) — assertion changed to find() bearish specifically

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- bctcOverdueCheckJob.ts:285 — exchange hardcoded "HOSE" (WatchlistRow has no exchange field; acceptable default for fire-and-forget context)

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/tradeRelationships.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/financial-reports/bctcOverdueCheckJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1303i-cascade-gaps.test.ts

merge_commit: (fill after merge)
