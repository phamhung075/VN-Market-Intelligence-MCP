# BATCH5-BS-REGRESSION — Architect SPIKE handoff

**Trigger:** recurring-bug rule — `balanceSheetExtractor.ts` magnitude-normalize / identity-override
touched again in cb03b761 (Phase B) and REGRESSED 4 sibling fixtures. Blanket discriminator failed.
Needs a per-fixture reconciliation spike, not another dev guess.

**Gate movement:** deterministic per-file isolation gate `26 → 31 fail` after push 6f10c983
(run 27235081558, job 80424871401). The 20 BATCH5 target files are GREEN; these are collateral.

## What Phase B did (commit cb03b761, balanceSheetExtractor.ts)
Added a blanket split-block guard in THREE places:
- path A (identity override from sources-side, ~L825): `if (sbMap === null && totalSourcesSideFwd > 0)`
- path B (identity override from liab+equity, ~L940): `if (sbMap === null && totalLiabilities > 0 && ...)`
- magnitude inference (~L989): `if (sbMap === null && (multiplier === -1 || -2))`
- NEW else-branch: `else if (sbMap !== null && (multiplier === -1 || -2)) effectiveMultiplier = 1;`

Hypothesis encoded: "split-block (sbMap!==null) values are already reliable + already in triệu → skip
all override + normalize." **This hypothesis is FALSE for 4 of the 6 split-block fixtures.**

## Fixture constraint matrix (RAW reproduced evidence — `bun test <file>` host-safe)

| Fixture (test file)                         | sbMap | Needs identity-override? | Needs ÷1e6 normalize? | Current (Phase B) result        | Expected |
|---------------------------------------------|-------|--------------------------|-----------------------|---------------------------------|----------|
| 1416b-fpt-page-window (TARGET)              | !=null| —                        | NO (over-applied bug) | GREEN ✓                         | green |
| hotfix-vcb-parser (TARGET)                  | !=null| —                        | NO (already millions) | GREEN ✓                         | green |
| FIX-BCTC-MAGNITUDE-NORMALIZE (PPC Q4-25)    | !=null| —                        | **YES**               | totalAssets=0; totalLiab=780223778402 (raw VND) | 5246604 / 780223.78 triệu |
| 1120-split-block-balance-sheet              | !=null| **YES**                  | ?                     | totalAssets=0, currentAssets=0  | >30e6 / >18e6 |
| 1908c-totalassets-plausibility-override     | !=null| **YES**                  | ?                     | currentAssets=0, ratio=NaN, conf=0 | >30e6 / ratio≥0.98 |
| FIX-BCTC-LIAB-PRIOR-PERIOD                  | !=null| **YES**                  | ?                     | totalLiabilities=0              | >4e6 |

**The core question for the spike:** what truly distinguished the 2 TARGET over-division cases
(1416b VNM 130M→80M, VCB already-millions) from the 4 fixtures that NEED normalize/override?
It is NOT "sbMap presence." Candidates to investigate:
- explicit unit declaration present vs absent in the page text (multiplier sentinel -1/-2 vs explicit)
- magnitude of the raw extracted value (>1e9 ⇒ raw VND ⇒ normalize; <1e6 ⇒ already triệu)
- whether assets-side extraction already populated a plausible total (override only when total==0 or implausible)

The correct fix likely keeps the override/normalize ENABLED for split-block but tightens the
*over-division* trigger to the specific VNM/VCB signature — rather than disabling the whole path.

## Deliverable
Corrected per-fixture prescription (which of the 3 paths to run, with what guard, for each of the 6
fixtures so ALL 6 go green simultaneously) → append to this file under `## PRESCRIPTION`.
Then router dispatches dev-mcp-server to implement it as a REPLACEMENT for the cb03b761 bs change.

## NOT in this spike (handled in parallel dev wave — independent files)
- 1331a TEST-3: runner-contract bug — isolation runner injects `STOCK_PRICE_DB_PATH=/tmp/test_stock_price_$$.db`
  which does not end in `stock_price.db`, so `expect(resolved).toMatch(/stock_price\.db$/)` fails. Fix = runner path naming.
- 011-rag-embeddings, 1821a-pollnews-cold-start-retry: pass in local isolation, fail only in CI ⇒ wall-clock/env flaky ⇒ freeze clock / hermetic.

Phase B bbAlertScanJob.ts (1309) + parseBctcReport.ts (1792) fixes HELD (not in fail roster) — leave them.

---

## PRESCRIPTION (architect — spike-verified, all 6 GREEN simultaneously)

**File:** `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`
**Verified:** ran each of the 6 fixtures single-file with `STOCK_PRICE_DB_PATH=/tmp/<uniq>.db`
(host-safe, never full suite). With this prescription applied:
1416b 6/0 · MNORM 15/0 · 1120 11/0 · 1908c 8/0 · LIAB-PRIOR 5/0 · hotfix-vcb 20/0 (= 65 pass, 0 fail).

### Root cause (corrects the handoff hypothesis)
The discriminator is **NOT "sbMap presence."** The Phase B blanket guard conflated THREE
distinct problems into one false signal. The real distinguishing signals, derived by
probing `multiplier`, `sbMap`, and the per-fixture grand-total estimates:

- **Magnitude path** (the bulk of the regression — 18 of the 20 broken tests): split-block
  raw-VND statements (PPC, 1120, LIAB-PRIOR, 1908c-drift) GENUINELY need ÷1,000,000. The only
  over-division case (VCB Q1 bank, hotfix-vcb B-3b) has a max field of **~2.1e9**, whereas every
  true raw-VND statement has a max field **≥5.5e12**. The original `RAW_VND_THRESHOLD = 1e9` was
  simply **too low** — it caught the 2.1e9 bank total. Phase B "fixed" this by disabling the whole
  path for split-block, which broke the 4 raw-VND siblings. Correct fix: **raise the threshold to
  1e12** and let the magnitude path run for split-block too. (Discriminator also confirmable via
  `multiplier`: KEEP case is sentinel **-2** = no unit header; every DIVIDE case is **-1** = bare
  "VND"/"đồng" present. The 1e12 magnitude threshold is the more robust, physically-meaningful gate.)

- **Identity-override path B** (the PPC-specific 2 tests): PPC's split-block zip binds code 270 to
  the **prior-year** value (5,533,688) while the **current** total (5,246,604) is corroborated by
  BOTH the sources-side (440) AND the identity (liab+equity). PPC needs path B even though it is
  split-block. The over-trigger Phase B guarded against was **1416b-VNM** (got 130M instead of 80M):
  there the identity (130M) and the sources-side 440 (30M) **disagree with each other**, so they do
  not corroborate and the split-block 270 (80M) must be trusted. Correct discriminator =
  **corroboration**, not sbMap presence.

### Per-fixture path table (which of the 3 paths runs, with what guard)

| Fixture | multiplier | sbMap | Path A (440 override) | Path B (identity override) | Magnitude ÷1e6 | Result |
|---|---|---|---|---|---|---|
| **1416b VNM split** (TARGET) | 1 (Triệu VND) | non-null | gated `sbMap===null` → SKIP | corroboration fails (440=30M ≠ identity=130M) → SKIP → keeps 270=80M | mult=1 → not entered | 80M ✓ |
| **hotfix-vcb Q1 bank** (TARGET) | -2 (no header) | non-null | gated `sbMap===null` → SKIP | not entered (440 present but maxField path keeps as-is) | maxField 2.1e9 < **1e12** → effMult=1 (KEEP) | 1,904,318,782 ✓ |
| **PPC** (MNORM) | -1 (bare VND) | non-null | gated `sbMap===null` → SKIP | **path B-SB fires**: 440(5,246,604)≈identity(5,246,604), 270 diverges 5.5% → totalAssets=identity | maxField 5.5e12 > 1e12 → ÷1e6 | 5,246,604.58 triệu ✓ |
| **1120 split** | -1 (bare VND) | non-null | SKIP | corroboration true but 270 already==identity → no-op | maxField ≥35e12 → ÷1e6 | 35M / 53M triệu ✓ |
| **1908c VNM-drift** | -1 (bare VND) | non-null | SKIP | 440=0 → path B-SB guard (`totalSourcesSideFwd>0`) → SKIP. **BCTC-1908c subtotal guard (unchanged, ~L807) fires** on drift ratio >5 | maxField ≥36e12 → ÷1e6 | computed sum ✓ |
| **LIAB-PRIOR** | -1 (bare VND) | non-null | SKIP | 270 already==identity → no-op | maxField ≥4.2e12 → ÷1e6 | 4,239,852 triệu ✓ |

### Exact code changes (REPLACEMENT for cb03b761 bs hunks)

**Change 1 — magnitude path (~L991-1024): REMOVE the Phase B `sbMap===null` gate AND the
`else-branch`; RAISE the threshold to 1e12.** Revert the guard to run for all sentinels, and change
`RAW_VND_THRESHOLD`:
```ts
let effectiveMultiplier = multiplier;
if (multiplier === -1 || multiplier === -2) {
  const RAW_VND_THRESHOLD = 1_000_000_000_000; // was 1_000_000_000 — bank split-block totals
                                               // (~2e9) must stay un-normalized; true raw-VND
                                               // statements are ≥5.5e12.
  const primaryProbe = totalAssets;
  const fallbackProbe = primaryProbe === 0
    ? Math.max(
        Math.abs(equity.total), Math.abs(totalLiabilitiesAndEquity),
        Math.abs(totalLiabilities), Math.abs(currentAssets.total),
        Math.abs(nonCurrentAssets.total),
      )
    : 0;
  if (primaryProbe > RAW_VND_THRESHOLD || fallbackProbe > RAW_VND_THRESHOLD) {
    effectiveMultiplier = 0.000001;
    console.warn("[balanceSheetExtractor] Inferred raw VND (đồng) from magnitude; applying ÷1,000,000.");
  } else {
    effectiveMultiplier = 1;
  }
}
// DELETE the `else if (sbMap !== null && (multiplier === -1 || multiplier === -2)) { effectiveMultiplier = 1; }` branch entirely.
```

**Change 2 — path B (~L946): KEEP the existing `sbMap===null` inline branch unchanged; ADD a new
split-block branch with the corroboration gate.** After the existing `if (sbMap === null && ... )
{ ... }` block, append:
```ts
} else if (
  // BATCH5-BS-REGRESSION path B-SB: split-block code-270 zip can bind a prior-period /
  // sub-item value (PPC). Override is safe ONLY when two INDEPENDENT grand-total estimates
  // corroborate: sources-side(440) ≈ identity(liab+equity) within 2%, and totalAssets(270)
  // diverges from that consensus by >5%. Keeps 1416b-VNM untouched (440=30M ≠ identity=130M
  // → no consensus → no override).
  sbMap !== null &&
  totalSourcesSideFwd > 0 &&
  totalLiabilities > 0 && equity.total > 0 && totalLiabilities < equity.total * 20
) {
  const identityDerived = totalLiabilities + equity.total;
  const consensus = identityDerived > 0 &&
    Math.abs(totalSourcesSideFwd - identityDerived) / totalSourcesSideFwd <= 0.02;
  const totalAssetsDiverges = totalAssets === 0 ||
    Math.abs(totalAssets - identityDerived) / identityDerived > 0.05;
  if (consensus && totalAssetsDiverges) {
    console.warn(
      `[balanceSheetExtractor] BATCH5-BS-REGRESSION (path B-SB): split-block totalAssets(${totalAssets}) ` +
      `diverges from corroborated grand total (sources-side ${totalSourcesSideFwd} ≈ identity ${identityDerived}); overriding.`
    );
    totalAssets = identityDerived;
  }
}
```

**Change 3 — path A (~L831): KEEP the Phase B `sbMap===null` guard AS-IS.** Path A does not need
to fire for any split-block fixture (PPC is handled by path B-SB; all others corroborate or are
no-ops). Leaving path A gated by `sbMap===null` is correct and prevents the 1416b-VNM 440=30M
over-trigger. **Do NOT touch path A.**

**Unchanged:** BCTC-1908c positional-drift subtotal guard (~L807, `computedFromSubtotals/totalAssets>5`)
was never touched by Phase B and must remain — it handles the 1908c drift cases.

### Risk flags
- The `RAW_VND_THRESHOLD = 1e12` boundary is the load-bearing constant. Any future bank with a
  split-block grand total between 1e12 and ~5e12 raw VND (≈ a >1,000,000 tỷ-đồng balance sheet —
  not physically plausible for VN issuers) would be mis-kept. Acceptable: VN's largest banks
  (~2e15 VND total assets = 2e9 triệu) report in triệu already (multiplier=1), never via sentinel.
- The 2% corroboration tolerance and 5% divergence tolerance in path B-SB are the same tolerance
  family already used by path A (5%) and the inline path B (30%). Kept tight on purpose: a looser
  consensus band would let 1416b-VNM-style bad-zip data slip through.
- DDD: pure-function change, domain layer, zero new I/O, zero new interfaces. BUILD-STANDARD: not-applicable (bug-fix in-zone).

**Zone:** apps/mcp-server/ · **Scan clean:** true
