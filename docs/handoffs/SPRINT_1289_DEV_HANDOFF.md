# Sprint 1289 Dev Handoff — Foreign Flow Validation + 8Q Historical BCTC

**Sprint:** 1289
**From:** Architect / Tech Lead
**To:** Dev Team (tasks 1289c–e) + Ops Team (Phase 2 deployment)
**Date:** 2026-04-22
**Status:** PHASE 1 Design + RED tests ready for GREEN implementation

---

## TL;DR

**Phase 1 (Tasks 1289c–e):** Implement strict validation to eliminate foreign flow parse cascade (784 errors/24h)
- Root cause: `isValidForeignFlowItem()` silently filters invalid items instead of failing loudly
- Fix: Call `validateForeignFlowPayload()` from both entry points (fetcher + POST endpoint), fail loud with HTTP 400 + diagnostics
- RED tests: ✅ Complete (11 test cases, 40 assertions, commit 79f920b6)
- GREEN implementation: Modify 2 files (`foreignFlowFetcher.ts` + `server.ts`)
- Expected outcome: Parse errors < 5/day after fix

**Phase 2 (Ops + Dev):** Design 8-quarter historical BCTC downloader
- Download Q1-2024 → Q4-2025 for 30+ watchlist stocks (~240 PDFs)
- VPS discovers URLs from HOSE → HNX → UPCOM → SSC (fallback)
- Daily systemd timer (02:00 UTC = 09:00 VN)
- Deploy Phase 1 + Phase 2 jobs to VPS
- Expected outcome: Historical BCTC data available for backtesting

---

## Phase 1: Foreign Flow Validation Implementation

### Background

**The Bug:**
```
VPS sends 30 items with 3 schema violations
→ isValidForeignFlowItem() silently filters them
→ Returns 27 items as "success"
→ Logs "changes: 27" ✓ success
→ Caller thinks all data processed
→ Missing 3 rows per cycle accumulates over days
→ After 10 days: ~30 missing rows
→ No diagnostic to show why
```

**Why prior fixes failed:**
- Sprint 228: Added validation to POST endpoint, but fallback fetcher uses different path
- Sprint 1288: Added fallback chain, which masks problem instead of fixing it

**Why this fix works:**
- Unifies validation across **both** entry points
- Uses existing domain validator (`validateForeignFlowPayload()`) everywhere
- Fails loudly (HTTP 400 / throw) instead of filtering silently
- Logs diagnostics (item index + field + reason) for VPS debugging

---

### Task 1289c: Modify foreignFlowFetcher.ts

**File:** `src/infrastructure/fetchers/foreignFlowFetcher.ts`

**Change 1: Replace silent filter with validation** (lines ~344–355)

**Current code (BROKEN):**
```typescript
async function fetchPrimaryVpsEndpoint(...): Promise<WriteForeignFlowItem[] | null> {
  const json = (await response.json()) as { data?: unknown };
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid response format: expected .data array");
  }

  // ← SILENT FILTER (silently discards invalid items)
  return json.data
    .filter((item: unknown) => isValidForeignFlowItem(item))
    .map((item: any) => ({
      code: item.code,
      date: item.date,
      foreignBuyVol: item.foreignBuyVol,
      foreignSellVol: item.foreignSellVol,
      putThroughVol: item.putThroughVol ?? 0,
    }));
}
```

**New code (FIXED):**
```typescript
async function fetchPrimaryVpsEndpoint(...): Promise<WriteForeignFlowItem[] | null> {
  const json = (await response.json()) as { data?: unknown };
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid response format: expected .data array");
  }

  // ← STRICT VALIDATION (fail loud with diagnostic details)
  const { validateForeignFlowPayload } = await import("../../domain/services/market-data/foreignFlowValidator.js");
  const validationResult = validateForeignFlowPayload(json.data);

  if (validationResult.errors.length > 0) {
    // Fail loudly with diagnostic details
    const errorSummary = validationResult.errors
      .slice(0, 5) // Limit to first 5 errors
      .map(e => `Item ${e.itemIndex}: ${e.field} — ${e.reason}`)
      .join("; ");
    throw new Error(`VPS payload validation failed: ${errorSummary}. Total errors: ${validationResult.errors.length}`);
  }

  // All items validated; no filtering needed
  return validationResult.valid;
}
```

**Change 2: Update error handling in `fetchForeignFlowWithFallback()`** (around line 267)

When `fetchPrimaryVpsEndpoint()` throws a validation error, catch and log with context:

```typescript
try {
  const result = await breakers.foreignFlow.execute(async () => {
    return await fetchPrimaryVpsEndpoint(overrides?.fetchFn ?? fetch, 5000);
  });
  // ... (success path unchanged)
} catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);

  // ← Log diagnostic if it's a validation error
  if (errMsg.includes("validation failed")) {
    logger.warn("[fallback] VPS payload schema validation failed", {
      error: errMsg,
      timestamp,
      hint: "Check VPS API response format — schema may have changed",
    });
  } else {
    logger.warn("[fallback] primary endpoint failed", { error: errMsg });
  }

  // Continue with fallback chain (cache → SSE → none)
  // ... (rest of fallback logic unchanged)
}
```

**Acceptance Criteria:**
- ✅ Call `validateForeignFlowPayload()` before returning
- ✅ Throw error with item index + field + reason if validation fails
- ✅ Return only validated items (no filtering)
- ✅ All 11 tests in `src/__tests__/1289b-foreign-flow-validation.test.ts` pass
- ✅ No TypeScript errors

---

### Task 1289d: Modify server.ts POST /api/push-foreign-flow

**File:** `src/interface/mcp/server.ts:677–735` (POST /api/push-foreign-flow handler)

**Change 1: Add validation to request handler**

**Current code (BROKEN):**
```typescript
// Current code doesn't validate items; just passes to upsert
const json = (await response.json()) as { data?: unknown };
if (!Array.isArray(json.data)) {
  return res.writeHead(400), res.end(JSON.stringify({ error: "expected .data array" }));
}

const { changes } = await writeForeignFlowToOhlcv(json.data.map(item => ({...})));
logVpsPush({ service: "foreign-flow", itemsCount: changes, status: "ok" });
```

**New code (FIXED):**
```typescript
const json = (await response.json()) as { data?: unknown };
if (!Array.isArray(json.data)) {
  return res.writeHead(400), res.end(JSON.stringify({ error: "expected .data array" }));
}

// ← STRICT VALIDATION (new code)
const { validateForeignFlowPayload } = await import("../../domain/services/market-data/foreignFlowValidator.js");
const validationResult = validateForeignFlowPayload(json.data);

if (validationResult.errors.length > 0) {
  const errorSummary = validationResult.errors
    .slice(0, 5)
    .map(e => `Item ${e.itemIndex}: ${e.field} — ${e.reason}`)
    .join("; ");

  logVpsPush({
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    errorMsg: `Validation failed (${validationResult.errors.length} errors): ${errorSummary}`,
  });

  return res.writeHead(400), res.end(JSON.stringify({
    error: "Validation failed",
    details: errorSummary,
    totalErrors: validationResult.errors.length,
  }));
}

// All items validated
const { changes } = await writeForeignFlowToOhlcv(validationResult.valid);
logVpsPush({ service: "foreign-flow", itemsCount: changes, status: "ok" });
```

**Acceptance Criteria:**
- ✅ Call `validateForeignFlowPayload()` on incoming data
- ✅ Return HTTP 400 on validation error (not 200)
- ✅ Log validation errors to vps_push_log with errorMsg field
- ✅ Pass only validated items to writeForeignFlowToOhlcv
- ✅ All 11 tests in 1289b pass
- ✅ No TypeScript errors

---

### Task 1289e: GREEN Phase — All Tests Pass

**What to do:**
1. Implement changes from 1289c + 1289d
2. Run full test suite: `bun test`
3. Verify no TypeScript errors: `bun tsc --noEmit`
4. Verify specific test passes: `bun test src/__tests__/1289b-foreign-flow-validation.test.ts`

**Expected:**
- ✅ All tests pass (6305+ baseline, no failures)
- ✅ No TypeScript errors
- ✅ No regressions in existing tests

**What NOT to do:**
- ❌ Don't modify the test file (1289b is RED phase, must pass as-is)
- ❌ Don't add new tests (1289b covers validation, 1289f will cover integration)
- ❌ Don't change the validation schema (use foreignFlowValidator as SSOT)

---

### Task 1289f: QA Verification

**What QA will verify:**
1. Full test suite passes with all changes merged
2. Parse errors in logs < 5/day (check vps_push_log)
3. Validation errors are logged with diagnostics
4. No silent filtering (confirm error messages appear)
5. Historical comparison: before fix ~100 errors/day → after fix <5 errors/day

**What NOT to verify:**
- ❌ Don't test portal discovery yet (Phase 2)
- ❌ Don't test 8Q historical download (Phase 2)

---

## Phase 2: 8-Quarter Historical BCTC Downloader

### Background

**Current state:**
- VPS URL enrichment service deployed (Phase 0, already complete)
- Discovers direct PDF URLs from HOSE/HNX/UPCOM portals
- Main server saves URLs to `bctc_vps_queue.source_url`
- VPS fetch script downloads PDFs using direct URLs
- Status: 3 test PDFs done, 29 pending

**Gap:**
- Only Q4-2025 being enriched
- Need Q1-2024 → Q4-2025 (8 quarters) for backtesting + trend analysis
- Expected: ~240 PDFs (30 stocks × 8 quarters)

### Design Overview

**See:** `docs/BCTC_HISTORICAL_DOWNLOAD.md` (complete 347-line spec)

**Quick reference:**

| Phase | Owner | Duration | What |
|-------|-------|----------|------|
| 1 | Dev | 2–3h | Write portal discovery functions (try_hose, try_hnx, try_upcom) |
| 2 | Dev | 2h | Deploy `/root/bctc-historical-downloader.sh` to VPS, test |
| 3 | Ops | 1h | Create systemd .service + .timer, enable + start |
| 4 | QA | 3h | Verify ~240 PDFs in correct structure, check extraction quality |
| 5 | Analysis | ongoing | Use 8Q data for backtesting + trend detection |

### Key Points

1. **Portal discovery runs on VPS** (Vietnam IP, not geo-blocked from SSC)
2. **Uses fallback chain:** HOSE → HNX → UPCOM → SSC
3. **Rate limiting:** 2s delay between requests (avoid IP ban)
4. **Daily execution:** 02:00 UTC = 09:00 VN (via systemd timer)
5. **Monitoring:** Logs to `/var/log/bctc-historical.log` + vps_push_log table
6. **Success:** ≥80% discovery, ≥90% download success, ≥85% extraction confidence

### Files to Create

**VPS-side:**
- `/root/bctc-historical-downloader.sh` — Main downloader script (bash)
- `/etc/systemd/system/vn-bctc-historical.service` — Systemd service (one-shot)
- `/etc/systemd/system/vn-bctc-historical.timer` — Daily timer (02:00 UTC)

**Main server (already exist):**
- `src/interface/mcp/server.ts` — POST /api/push-bctc-pdf endpoint (no changes needed)
- `data/pdfs/{CODE}/` — Folder structure (created by VPS script)

---

## Reference Materials

### For Phase 1 Implementation

**Read these in order:**

1. **TECH-1289** (`docs/TECH_1289.md`)
   - Part 1 (lines 50–82): Silent Filter Bug identification
   - Part 2 (lines 83–107): Cascading Failure explanation
   - Part 3 (lines 108–128): Solution Design
   - Section: "Proposed Solution Details > Option A" (lines 144–280): Exact code changes

2. **Test Specification** (`docs/handoffs/TASK_1289b.md`)
   - Test spec with 11 test cases and 40 assertions
   - Shows expected behavior of `validateForeignFlowPayload()`

3. **Test File** (`src/__tests__/1289b-foreign-flow-validation.test.ts`)
   - Actual RED tests (must pass after 1289c–d implementation)
   - Shows ValidationResult and ValidationError structures

4. **Validator Spec** (`src/domain/services/market-data/foreignFlowValidator.ts`)
   - SSOT for validation rules
   - ValidationResult and ValidationError interfaces

### For Phase 2 Implementation

**Read these in order:**

1. **Design Doc** (`docs/BCTC_HISTORICAL_DOWNLOAD.md`)
   - Complete 8Q strategy with portal URLs, folder structure, risk mitigation
   - Implementation phases (1–5)

2. **Architecture** (`docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround`)
   - Context on VPS proxy setup
   - Why Phase 0 (URL enrichment) needed VPS

3. **Prior Implementation** (commits 326cbe59 → 4243c190)
   - Phase 0 already complete: URL enrichment service
   - Shows how to deploy scripts to VPS

---

## Testing Checklist

### Phase 1 (Tasks 1289c–e)

```bash
# Run specific test file
bun test src/__tests__/1289b-foreign-flow-validation.test.ts
# Expected: 11 tests pass, 0 fail

# Run full test suite
bun test
# Expected: 6305+ tests pass, 0 fail

# Check TypeScript
bun tsc --noEmit
# Expected: 0 errors

# Spot-check implementation
grep -n "validateForeignFlowPayload" src/infrastructure/fetchers/foreignFlowFetcher.ts
grep -n "validateForeignFlowPayload" src/interface/mcp/server.ts
# Expected: 2 imports found (one per file)
```

### Phase 2 (Portal discovery)

```bash
# After deploying to VPS, test portal discovery
ssh root@$VINAHOST_IP

# Test HOSE discovery for BID
curl -s "https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=BID" | grep -i "\.pdf" | head -3

# Test HNX discovery for FPT
curl -s "https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=FPT" | grep -i "\.pdf" | head -3

# Run downloader manually
/root/bctc-historical-downloader.sh

# Check logs
tail -20 /var/log/bctc-historical.log

# Check vps_push_log on main server
sqlite3 market-intelligence.db "SELECT COUNT(*), status FROM vps_push_log WHERE service='bctc-pdf' GROUP BY status;"
```

---

## Common Pitfalls to Avoid

### Phase 1

❌ **Don't:** Modify the test file (1289b is RED, must pass as-is)
✅ **Do:** Implement code to make tests pass

❌ **Don't:** Filter items in the validator (validator should return ALL valid items + error list)
✅ **Do:** Call validator once, check errors, return valid items

❌ **Don't:** Swallow errors with try/catch (fail loudly)
✅ **Do:** Throw on validation error with diagnostic details

❌ **Don't:** Log at info level (errors are important)
✅ **Do:** Log at warn/error level with full context

### Phase 2

❌ **Don't:** Try to discover URLs from main server (geo-blocked)
✅ **Do:** Run discovery jobs on VPS (Vietnam IP)

❌ **Don't:** Download all 240 PDFs in one shot (risk of timeout)
✅ **Do:** Run daily with rate limiting (2s between requests)

❌ **Don't:** Skip the fallback chain (if HOSE fails, try HNX next)
✅ **Do:** Try all portals before giving up (HOSE → HNX → UPCOM → SSC)

❌ **Don't:** Redownload existing PDFs
✅ **Do:** Check if PDF exists before downloading

---

## Questions? Contact

- **Architecture/Design questions:** Read TECH_1289.md + BCTC_HISTORICAL_DOWNLOAD.md
- **Test failures:** Check src/__tests__/1289b-foreign-flow-validation.test.ts comments
- **VPS deployment:** See docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround
- **Validator schema:** Check src/domain/services/market-data/foreignFlowValidator.ts

---

**Ready to start? Begin with Task 1289c. Good luck!**
