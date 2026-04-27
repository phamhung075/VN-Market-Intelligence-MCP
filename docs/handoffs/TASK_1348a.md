# Task 1348a — Cascade Engine: FR-3 affected_actions + Brokerage Outlook Broadcast

**Sprint:** 1348
**Branch:** task/1348a-cascade-brokerage-competitive
**Status:** DONE — committed, ready for QA
**Related bugs:** 1314, 1315

---

## Problem Statement

Two cascade gaps caused missing or incorrect bearish signals:

**Bug 1315:** FR-3 rule (banking NEUTRAL for generic crypto/OKX headlines) had no
`affected_actions`. Banks without digital-asset strategy (VCB, BID, EIB, HDB) were
only reached via market-wide cascade fallback — not via the specific competitive-threat
`[RuleAffected:]` path with `direction: "down"`.

**Bug 1314:** Brokerage-sector CEO/analyst outlook articles (e.g., "Tổng Giám đốc DSC:
triển vọng ngành môi giới...") were not triggering market-wide broadcast when
`impactScore < 6` (below `broadcastMinImpact`). Two reasons:
1. No SECTOR_RULES entry for brokerage-outlook keywords.
2. `ANALYST_WARNING_PATTERNS` and `ANALYST_WARNING_PATTERNS_BROADCAST` did not include
   brokerage NFD-stripped patterns, so the impactScore gate bypass was not firing.

---

## Solution

### Edit 1 — FR-3 `affected_actions` (Bug 1315)

File: `apps/mcp-server/src/domain/services/cascadeEngine.ts` ~line 2328

Added `affected_actions` to the FR-3 rule:
```
{ code: "VCB", direction: "down" }
{ code: "BID", direction: "down" }
{ code: "EIB", direction: "down" }
{ code: "HDB", direction: "down" }
```
These banks have no digital-asset strategy → competitive threat from VPBankS/OKX → bearish.

### Edit 2 — New SECTOR_RULES BK-1 entry (Bug 1314)

File: `apps/mcp-server/src/domain/services/cascadeEngine.ts` ~line 2389 (before closing `];`)

New entry for brokerage-outlook keywords → `domain: "securities"`, `direction: "down"`:
- Keywords include NFD-stripped forms: `"trien vong nganh moi gioi"`, `"ap luc canh tranh moi gioi"`, `"canh tranh moi gioi"`, etc.
- `affected_actions`: SSI, VCI, VIX, VND direction "down"

### Edit 3 — `ANALYST_WARNING_PATTERNS` + `ANALYST_WARNING_PATTERNS_BROADCAST` (Bug 1314)

Both arrays extended with the same 3 NFD-stripped brokerage patterns:
- `"trien vong nganh moi gioi"`
- `"ap luc canh tranh moi gioi"`
- `"canh tranh moi gioi"`

NFD normalization already applied at both call sites — patterns are pre-stripped.
Both arrays kept in sync (comment added to enforce this).

---

## Tests

File: `apps/mcp-server/src/__tests__/1348a-cascade-brokerage-competitive.test.ts`

- TC-1a–d: VCB/BID/EIB/HDB each get a `[RuleAffected:]` bearish entry from OKX/crypto article (BULLISH seed — market-wide fallback won't be bearish, only rule path proves fix)
- TC-1e: VCB rule entry has `sentiment: "bearish"` and `watchlistImpacts` carries `impactDirection: "down"`
- TC-2a: brokerage-outlook article produces securities domain entry + VCI action entry
- TC-2b: DSC brokerage CEO article with `impactScore=4` still broadcasts market-wide (bypass gate)
- TC-2c: broadcast reaches cross-sector tickers (HPG steel, VNM retail)
- TC-2d: NFD normalization strips diacritics before matching (with and without pre-stripped)

**Result:** 14/14 pass. 43 existing cascade tests unaffected. 0 regressions vs baseline.

---

## Commits

1. `test(1348a): RED — failing tests for FR-3 affected_actions + brokerage broadcast patterns`
2. `fix(1348a): cascade gaps — FR-3 affected_actions + brokerage outlook broadcast`

---

## QA Checklist

- [ ] Run `bun test src/__tests__/1348a-cascade-brokerage-competitive.test.ts` → 14/14 pass
- [ ] Run `bun test src/__tests__/1335a-vpb-okx-cascade.test.ts` → 16/16 pass (FR-1/FR-2 not broken)
- [ ] Run `bun test src/__tests__/1334b-ceo-broadcast.test.ts` → 3/3 pass (original CEO scenario)
- [ ] Confirm no new failures vs baseline 106 (was 114 pre-task)
