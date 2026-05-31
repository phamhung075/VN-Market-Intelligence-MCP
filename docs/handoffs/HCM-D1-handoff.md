---
sprint: HCM-DISAMBIG
task_id: HCM-D1
title: Extend GEOGRAPHIC_CONTEXT_MAP + add HCM-DISAMBIG test suite
zone: apps/mcp-server/
size: M
priority: HIGH
owner: dev-mcp-server
depends_on: []
blocks: ["HCM-OPS"]
---

## TLDR

Extend the `GEOGRAPHIC_CONTEXT_MAP["HCM"]` array in `apps/mcp-server/src/domain/services/newsNormalizer.ts` to cover two missing geographic surface forms (`tp. hcm` and `tp-hcm`), then create a comprehensive test file `apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts` covering all 15 ACs from the sprint goal (negative cases suppressing HCM in geographic contexts + positive cases correctly extracting HCM as a ticker).

## [PM] Planning Context

### Zone
`apps/mcp-server/` — extraction domain service only. No ops rebuild required for this task alone (rebuild deferred to HCM-OPS after commit).

### Acceptance Criteria

From `docs/REQ_HCM-DISAMBIG.md`:

**AC Table — Extraction Layer (D1) — 15 cases**

| ID | Headline / Input | Expected `affectedActions` | Status |
|---|---|---|---|
| AC-D1-01 | `"Vietnam Airlines TPHCM-Phuket strategic expansion"` | MUST NOT contain `HCM` | Extraction |
| AC-D1-02 | `"Giá vàng tại TP. HCM hôm nay"` | MUST NOT contain `HCM` | Extraction |
| AC-D1-03 | `"Tp.HCM mở rộng metro line 3"` | MUST NOT contain `HCM` | Extraction |
| AC-D1-04 | `"TP-HCM họp về quy hoạch"` | MUST NOT contain `HCM` | Extraction |
| AC-D1-05 | `"Cổ phiếu HCM đóng cửa tăng 2%"` | MUST contain `HCM` | Extraction |
| AC-D1-06 | `"HCM (mã CK) công bố LNST quý 1"` | MUST contain `HCM` | Extraction |
| AC-D1-07 | `"Chứng khoán Hồ Chí Minh báo lãi"` | MUST contain `HCM` | Extraction |
| AC-D1-08 | `"Mua HCM, bán SSI"` | MUST contain `HCM` | Extraction |
| AC-D1-09 | `"Đề xuất mua HCM)"` | MUST contain `HCM` | Extraction |
| AC-D1-10 | `"Chứng khoán HCM (HCM) báo lãi quý 1"` | MUST contain `HCM` | Extraction |
| AC-D1-11 | `"Hội nghị kinh tế TP. HCM năm 2026"` | MUST NOT contain `HCM` | Extraction |
| AC-D1-12 | `"Dự án BĐS TP-HCM và khu vực lân cận"` | MUST NOT contain `HCM` | Extraction |
| AC-D1-13 | `"HPG đặt nhà máy tại TP.HCM nhưng HCM hôm nay tăng 1.5%"` | MUST contain `HCM` (ticker second mention) | Extraction |
| AC-D1-14 | `"Mã HCM trên sàn HOSE tăng mạnh"` | MUST contain `HCM` | Extraction |
| AC-D1-15 | `"khớp lệnh HCM cao bất thường"` | MUST contain `HCM` | Extraction |

**AC Table — Regression (must stay green)**

| ID | Source test | Cases | Requirement |
|---|---|---|---|
| AC-REG-1 | `1788-hcm-geographic-false-positive.test.ts` AC-1 through AC-10 | 10 cases | ALL GREEN, zero delta |
| AC-REG-2 | Task 1198 VND currency guard | existing | GREEN |
| AC-REG-3 | Task 1206 false-match guards | existing | GREEN |
| AC-REG-4 | Task 1322 alias tests (VJC "viet jet") | existing | GREEN |

### Files to read first

- `docs/REQ_HCM-DISAMBIG.md` (full spec, §3 Acceptance Criteria)
- `docs/architecture-briefs/2026-05-28-hcm-disambig.md` (architect decisions, D1/D2/D3 split)
- `apps/mcp-server/src/domain/services/newsNormalizer.ts` (lines 547–633, GEOGRAPHIC_CONTEXT_MAP + extractStockTickers Pattern 2)
- `apps/mcp-server/src/__tests__/1788-hcm-geographic-false-positive.test.ts` (existing test pattern to mirror)

### Files to modify

1. **`apps/mcp-server/src/domain/services/newsNormalizer.ts:547`**
   - Locate `GEOGRAPHIC_CONTEXT_MAP["HCM"]` array
   - Current entries (9): `"tp.hcm", "tp hcm", "tphcm", "tp.", "tp ", "thành phố hồ chí minh", "thanh pho ho chi minh", "thành phố hcm", "thanh pho hcm"`
   - **Add exactly 2 new entries:** `"tp. hcm"` (belt-and-suspenders for dot-space variant) and `"tp-hcm"` (genuine gap for hyphen variant)
   - Window length stays at 10 chars (NFR-1 per architect D3 decision)

### Files to create

1. **`apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts`**
   - Import `normalizeNews` from `../domain/services/newsNormalizer.js`
   - Import `detectStocksInText` from `../domain/services/stockAliases.js` (verify alias path is safe, per architect R-2)
   - Use `makeItem()` factory matching `1788-hcm-geographic-false-positive.test.ts` pattern (same `RssItem` shape)
   - Cover all 15 AC-D1-* cases (lines 1–15 above) + regression smoke check (re-import 1788 cases inline or cross-reference — do NOT modify `1788-hcm-geographic-false-positive.test.ts`)
   - **Fence-false-green gate (AC-QA-05):** inject one deliberate `expect(true).toBe(false)` assertion, run `bun test`, confirm non-zero exit, then **remove it before final commit** (this is a dev-run gate, not a merged gate)
   - File name `HCM-DISAMBIG-extraction.test.ts` (will be picked up by bun test glob in `apps/mcp-server/`)

### Dependencies
None — this task is a self-contained extraction + test task.

### Knowledge needed

- `docs/policies/dev-standards.md`
- `docs/protocols/fail-loud-protocol.md` (test failure expectations)
- Memory: `feedback_fence_false_green` (AC-QA-05 deliberate-fail proof)
- Memory: `feedback_concurrent_commit_race` (serialize commits, no overlapping edits)

## [Dev] Implementation Guidance

### Step 1: Extend GEOGRAPHIC_CONTEXT_MAP

Edit `apps/mcp-server/src/domain/services/newsNormalizer.ts` line 547 area:

Current:
```
"HCM": [
  "tp.hcm", "tp hcm", "tphcm",
  "tp.", "tp ",
  "thành phố hồ chí minh", "thanh pho ho chi minh",
  "thành phố hcm", "thanh pho hcm"
],
```

Add to the array (keep existing, add only new entries):
```
"tp. hcm",   // dot-space variant — belt-and-suspenders for TP. HCM
"tp-hcm",    // hyphen variant — genuine gap
```

Result: 11 entries total.

**Verify:** The window logic (lines 621–629) reads `text.slice(matchStart - 10, matchStart + code.length).toLowerCase()` — no change needed; 10-char window is sufficient per architect D3.

### Step 2: Create HCM-DISAMBIG-extraction.test.ts

Pattern (mirror from `1788-hcm-geographic-false-positive.test.ts`):

```typescript
import { describe, it, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer";
import { makeItem } from "./factories"; // or inline if factories not exported

describe("HCM-DISAMBIG-extraction", () => {
  describe("AC-D1-01 through AC-D1-15", () => {
    // Test each case:
    // - input headline
    // - call normalizeNews(item)
    // - assert affectedActions contains or does not contain "HCM"
  });

  describe("AC-REG-1 through AC-REG-4 smoke check", () => {
    // Re-run 1788 cases inline OR cross-reference the 1788 test suite
    // Ensure existing guards still pass
  });
});
```

**Fence-false-green gate (do this DURING dev, before final commit):**
1. Add one deliberate failing assertion: `expect(true).toBe(false);`
2. Run `bun test HCM-DISAMBIG-extraction` → confirm non-zero exit
3. Remove the deliberate assertion
4. Run `bun test HCM-DISAMBIG-extraction` again → confirm green
5. Run full `bun test 1788 HCM-DISAMBIG 1198 1206 1322` → all green
6. Commit only the passing version

### Step 3: Verify regressions

```bash
# In apps/mcp-server/:
bun test 1788 HCM-DISAMBIG 1198 1206 1322
# Expected: all GREEN, no new failures
```

### Step 4: Commit

Use explicit-file staging (no `-A`):
```bash
git add apps/mcp-server/src/domain/services/newsNormalizer.ts
git add apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts
git commit -m "feat(hcm-disambig/D1): extend GEOGRAPHIC_CONTEXT_MAP + HCM-DISAMBIG test suite

- Add 'tp. hcm' (dot-space) and 'tp-hcm' (hyphen) to HCM geographic suppression map
- New test file covers AC-D1-01..AC-D1-15 (15 extraction cases)
- Regression guard: 1788/1198/1206/1322 all green

Task: HCM-D1
AC: AC-D1-01, AC-D1-02, ..., AC-D1-15, AC-REG-1, AC-REG-2, AC-REG-3, AC-REG-4
"
```

### Exit Criteria

- [ ] `newsNormalizer.ts` GEOGRAPHIC_CONTEXT_MAP["HCM"] includes both `"tp. hcm"` and `"tp-hcm"`
- [ ] `HCM-DISAMBIG-extraction.test.ts` created with all 15 AC-D1 cases covered
- [ ] `bun test 1788 HCM-DISAMBIG 1198 1206 1322` all GREEN
- [ ] Fence-false-green gate proven (deliberate fail injected + removed)
- [ ] Commit landed on main, explicit-file staging, commit message includes all ACs

---

## [PM] Task Completion

**Ship only when all exit criteria GREEN.**

After commit:
1. Handoff to HCM-OPS (force-recreate mcp-server, dependency HCM-D1)
2. Return to main terminal with RETURN block (below)
3. HCM-D2 (chef.md) may run in parallel if WIP allows

---

## [Notebook] Attachments

**Dev-mcp-server session notes:** [to be filled by dev after task completion]

- [ ] Fence-false-green proof pasted (deliberate fail → non-zero exit → revert → green)
- [ ] Test file glob pickup confirmed (`bun test HCM-DISAMBIG` picks it up)
- [ ] Regression baseline (1788/1198/1206/1322) re-verified green

---

## RETURN (to main terminal after commit)

```
DONE: HCM-D1 extraction hardening + test suite completed and committed
FILES_MODIFIED:
  - apps/mcp-server/src/domain/services/newsNormalizer.ts (GEOGRAPHIC_CONTEXT_MAP HCM array)
  - apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts (new)
COMMIT: [sha to be filled by dev]
ACS_COMPLETED: AC-D1-01 through AC-D1-15, AC-REG-1 through AC-REG-4
TEST_RESULTS: bun test 1788 HCM-DISAMBIG 1198 1206 1322 — ALL GREEN
NEXT: HCM-OPS | force-recreate mcp-server (blocks HCM-QA)
BLOCKED_BY: HCM-PM (now released)
WIP_ZONE: dev-mcp-server (1/2 — D2 can run in parallel)
```
