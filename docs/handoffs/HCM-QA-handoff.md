---
sprint: HCM-DISAMBIG
task_id: HCM-QA
title: Acceptance gate — extraction + dish narrative
zone: apps/mcp-server/ + docs/agents/unified-agent/
size: M
priority: HIGH
owner: qa
depends_on: ["HCM-OPS", "HCM-D2"]
blocks: ["HCM-EXIT"]
---

## TLDR

Verify the HCM extraction hardening (D1) and chef.md narrative rule (D2) are working correctly via: (1) unit test suite pass (existing 1788 + new HCM-DISAMBIG + other ticker tests), (2) live extractor injection tests (4 negative geographic cases + 1 positive ticker case), (3) chef.md rule presence, (4) post-rebuild signal file audit.

## [PM] Planning Context

### Zone
- D1 verification: `apps/mcp-server/src/__tests__/` and live extraction via `normalizeNews()`
- D2 verification: `docs/agents/unified-agent/flow/chef.md` presence check
- Post-rebuild audit: `docs/signals/news_impact_*.json` fresh file verification

### Acceptance Criteria

From `docs/REQ_HCM-DISAMBIG.md` §AC Table — QA Gate:

| ID | Action | Pass Criterion |
|---|---|---|
| AC-QA-01 | Inject exact string `"Vietnam Airlines TPHCM-Phuket strategic expansion"` through live `normalizeNews()` after mcp-server rebuild | `affectedActions` empty or `["HVN"]` — no `HCM` |
| AC-QA-02 | Inject `"Tp.HCM mở rộng metro line 3"` through live `normalizeNews()` | `affectedActions` does not contain `HCM` |
| AC-QA-03 | Inject `"TP-HCM họp về quy hoạch kinh tế"` through live `normalizeNews()` | `affectedActions` does not contain `HCM` |
| AC-QA-04 | Inject `"Chứng khoán HCM (HCM) báo lãi quý 1"` through live `normalizeNews()` | `affectedActions` contains `HCM` — over-block check |
| AC-QA-05 | Verify test file `HCM-DISAMBIG-*.test.ts` is picked up by `bun test` glob | Inject deliberate failing assertion to confirm test runner sees the file before confirming green (per `feedback_fence_false_green`) |
| AC-QA-06 | After ops force-recreate of mcp-server, read a fresh `docs/signals/news_impact_*.json` produced AFTER rebuild | File `fetched_at` timestamp is after rebuild; `affected_stocks` shows correct extraction (per `project_mcp_server_write_wedge`) |

### Files to read first

- `docs/REQ_HCM-DISAMBIG.md` (full spec, §3 AC Table — QA Gate)
- `docs/architecture-briefs/2026-05-28-hcm-disambig.md` (architect expectations)
- `docs/SPRINT_GOAL_HCM-DISAMBIG.md` (Success Metric items 1–6)
- `apps/mcp-server/src/__tests__/1788-hcm-geographic-false-positive.test.ts` (pattern for live injection)
- `docs/agents/unified-agent/flow/chef.md` (Block A "Format rules" — verify new rule is present)

### Files to monitor

- `docs/signals/news_impact_*.json` (after rebuild, check for no false HCM in `affected_stocks`)
- `apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts` (verify test file exists and is picked up)

### Knowledge needed

- Memory: `feedback_fence_false_green` (test file glob pickup MUST be verified; deliberate-fail proof)
- Memory: `feedback_scale_pilot_done_bar` (live verification via function call, not just unit test)
- Memory: `project_mcp_server_write_wedge` (post-rebuild signal file verification — read actual files, not just container health)
- `docs/policies/commit-convention.md` (AC trailer format in test names)

## [QA] Implementation Guidance

### Step 1: Unit Test Suite Pass

```bash
cd apps/mcp-server/

# Run extraction + regression tests
bun test 1788 HCM-DISAMBIG 1198 1206 1322

# Expected: all pass
# - 1788-hcm-geographic-false-positive.test.ts: 10 cases GREEN
# - HCM-DISAMBIG-extraction.test.ts: 15 cases GREEN + regression smoke GREEN
# - 1198, 1206, 1322: baseline regression GREEN
```

### Step 2: Verify test file glob pickup (AC-QA-05 — Fence-false-green gate)

This verifies that the new `HCM-DISAMBIG-extraction.test.ts` file is actually being picked up by the bun test runner:

```bash
# Check file exists
ls -la apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts
# Should exist

# Run the test file explicitly
bun test src/__tests__/HCM-DISAMBIG-extraction.test.ts

# Expected: all 15 AC cases + regression smoke PASS
```

**Fence-false-green proof:** If the file doesn't exist or isn't picked up, the test suite returns green even though nothing ran. Verify this by:
- Running with the correct glob pattern
- Checking test output includes a line count for HCM-DISAMBIG tests (>0)

### Step 3: Live Injection Tests (AC-QA-01 through AC-QA-04)

Inject the exact headlines through the live `normalizeNews()` function to verify extraction works on the running mcp-server:

```typescript
// Load the live extraction function (after mcp-server rebuild)
import { normalizeNews } from "apps/mcp-server/src/domain/services/newsNormalizer";

// Test helper to create RSS item
function makeTestItem(title: string, description: string) {
  return {
    title,
    description,
    pubDate: new Date().toISOString(),
    source: "test-source",
    sourceUrl: "http://test.local",
    guid: `test-${Date.now()}`,
    isLatest: true,
  };
}

describe("HCM-DISAMBIG live injection", () => {
  // AC-QA-01: TPHCM-Phuket (negative)
  it("AC-QA-01: Vietnam Airlines TPHCM-Phuket should NOT extract HCM", () => {
    const item = makeTestItem(
      "Vietnam Airlines TPHCM-Phuket strategic expansion",
      "..."
    );
    const result = normalizeNews(item);
    expect(result.affectedActions).not.toContain("HCM");
    // Should be ["HVN"] or empty
  });

  // AC-QA-02: Tp.HCM (negative)
  it("AC-QA-02: Tp.HCM metro expansion should NOT extract HCM", () => {
    const item = makeTestItem("Tp.HCM mở rộng metro line 3", "...");
    const result = normalizeNews(item);
    expect(result.affectedActions).not.toContain("HCM");
  });

  // AC-QA-03: TP-HCM (negative)
  it("AC-QA-03: TP-HCM planning meeting should NOT extract HCM", () => {
    const item = makeTestItem("TP-HCM họp về quy hoạch kinh tế", "...");
    const result = normalizeNews(item);
    expect(result.affectedActions).not.toContain("HCM");
  });

  // AC-QA-04: HCM ticker positive (positive)
  it("AC-QA-04: Chứng khoán HCM (HCM) báo lãi should extract HCM", () => {
    const item = makeTestItem(
      "Chứng khoán HCM (HCM) báo lãi quý 1",
      "..."
    );
    const result = normalizeNews(item);
    expect(result.affectedActions).toContain("HCM");
  });
});
```

Expected output:
- AC-QA-01: `affectedActions` does NOT contain `HCM` (empty or only HVN)
- AC-QA-02: `affectedActions` does NOT contain `HCM`
- AC-QA-03: `affectedActions` does NOT contain `HCM`
- AC-QA-04: `affectedActions` CONTAINS `HCM` (positive control — over-block check)

### Step 4: Chef.md Rule Presence (AC-D2-01 verification)

```bash
# Read chef.md Block A "Format rules"
cat docs/agents/unified-agent/flow/chef.md | grep -A 5 "Format rules" | head -20

# Look for the new rule:
# "- Khi nhắc đến cổ phiếu HCM, lần đầu tiên trong tin phải viết `HCM (cổ phiếu)` 
#    hoặc `HCM (mã CK)` để phân biệt với thành phố; khi nhắc đến thành phố luôn dùng `TP. HCM`."

# Expected: rule is present within the "Format rules" list block, before `**Send:**`
```

### Step 5: Post-Rebuild Signal File Audit (AC-QA-06)

After HCM-OPS rebuild, wait for the next 1-2 news-scout cycles (~2-5 minutes), then verify:

```bash
# Find the most recent news_impact signal
ls -lt docs/signals/news_impact_*.json | head -1

# Check the file's fetched_at timestamp
cat docs/signals/news_impact_<LATEST>.json | jq '.meta.fetched_at'

# Compare to rebuild time:
# The fetched_at should be AFTER the ops force-recreate timestamp

# Check for false HCM in affected_stocks:
cat docs/signals/news_impact_*.json | jq '.[] | select(.affected_stocks[] == "HCM") | .'

# Expected: 
# - If HCM appears, the signal should be a legitimate HCM ticker mention (not geographic context)
# - No signals like "TPHCM-Phuket" with HCM in affected_stocks
# - No signals like "Tp.HCM" with HCM in affected_stocks
```

### Step 6: Document QA results

Create a signal file: `docs/signals/qa-hcm-disambig-<ISO_TIMESTAMP>.json`

```json
{
  "sprint": "HCM-DISAMBIG",
  "task": "HCM-QA",
  "executed_at": "<ISO_TIMESTAMP>",
  "verdict": "APPROVED",
  "evidence": {
    "AC-QA-01_tphcm_phuket": {
      "headline": "Vietnam Airlines TPHCM-Phuket strategic expansion",
      "result": "affectedActions does NOT contain HCM",
      "status": "PASS"
    },
    "AC-QA-02_tp_dot_hcm": {
      "headline": "Tp.HCM mở rộng metro line 3",
      "result": "affectedActions does NOT contain HCM",
      "status": "PASS"
    },
    "AC-QA-03_tp_hyphen_hcm": {
      "headline": "TP-HCM họp về quy hoạch kinh tế",
      "result": "affectedActions does NOT contain HCM",
      "status": "PASS"
    },
    "AC-QA-04_positive_ticker": {
      "headline": "Chứng khoán HCM (HCM) báo lãi quý 1",
      "result": "affectedActions CONTAINS HCM",
      "status": "PASS"
    },
    "AC-QA-05_test_file_pickup": {
      "test_file": "apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts",
      "result": "bun test picked up the file; deliberate-fail proof confirmed",
      "status": "PASS"
    },
    "unit_test_suite": {
      "tests": ["1788-hcm-geographic-false-positive", "HCM-DISAMBIG-extraction", "1198", "1206", "1322"],
      "result": "all GREEN",
      "status": "PASS"
    },
    "chef_md_rule": {
      "file": "docs/agents/unified-agent/flow/chef.md",
      "block": "Block A Format rules",
      "rule_present": true,
      "status": "PASS"
    },
    "post_rebuild_signal_audit": {
      "latest_signal_fetched_at": "<ISO_TIMESTAMP after rebuild>",
      "false_hcm_in_geographic_context": "none found",
      "status": "PASS"
    }
  },
  "all_acs_green": [
    "AC-QA-01", "AC-QA-02", "AC-QA-03", "AC-QA-04", "AC-QA-05", "AC-QA-06"
  ],
  "notes": "All 6 QA gate ACs verified PASS. HCM extraction hardening confirmed live. Chef.md rule in place."
}
```

### Exit Criteria

- [ ] `bun test 1788 HCM-DISAMBIG 1198 1206 1322` — ALL GREEN
- [ ] AC-QA-05 fence-false-green proof confirmed (test file IS picked up)
- [ ] AC-QA-01 through AC-QA-04 live injection tests — ALL PASS
- [ ] Chef.md Block A rule verified present
- [ ] AC-QA-06 post-rebuild signal file audit — no false HCM in geographic contexts
- [ ] QA signal file created: `docs/signals/qa-hcm-disambig-<timestamp>.json`

---

## [PM] Task Completion

**Ship only when ALL exit criteria GREEN and ALL ACs pass.**

This task unblocks HCM-EXIT (PO sprint sign-off).

---

## RETURN (to main terminal after completion)

```
DONE: HCM-QA acceptance gate completed — all 6 ACs verified PASS
UNIT_TESTS: 1788/HCM-DISAMBIG/1198/1206/1322 all GREEN
LIVE_INJECTION_TESTS: 4 negative cases + 1 positive case — all PASS
FENCE_FALSE_GREEN: AC-QA-05 deliberate-fail proof confirmed
CHEF_MD_RULE: Block A format rule present and verified
POST_REBUILD_AUDIT: No false HCM in geographic contexts
QA_SIGNAL: docs/signals/qa-hcm-disambig-<timestamp>.json
NEXT: HCM-EXIT | PO sprint sign-off
BLOCKED_BY: HCM-OPS, HCM-D2 (both now released)
```
