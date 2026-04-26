# TASK_1335a — RED: Failing tests for VPBankS/OKX cascade rules

**Sprint:** 1335
**Phase:** RED (TDD — write failing tests first)
**Test file to create:** `apps/mcp-server/src/__tests__/1335a-vpb-okx-cascade.test.ts`
**Depends on:** Nothing (pure domain, no infra)
**Handoff to:** TASK_1335b (GREEN — insert rules so tests pass)

---

## Context

Three cascade rule gaps identified in REQ-1315:
1. FR-1 — VPBankS subsidiary maps to VPB+TCB BULLISH via `affected_actions`
2. FR-2 — Crypto/digital-asset custody keywords trigger BULLISH for securities brokers
3. FR-3 — Generic banking domain gets NEUTRAL (not BULLISH) for crypto partnership headlines

All three rules insert into `SECTOR_RULES` in `cascadeEngine.ts`. No schema changes, no new domain types, no cross-layer changes.

---

## Architectural note — affected_actions watchlist requirement

Step 2h (`cascadeEngine.ts:2936`) checks:
```
const watchlistStock = watchlist.find((w) => w.actionCode === affected.code);
if (!watchlistStock) continue; // Skip if ticker not in watchlist
```

**VCI, VIX, VND are NOT guaranteed in the user's live watchlist.** For test purposes, the test watchlist must include them explicitly. The REQ's statement "bypass watchlist check" is INCORRECT — `affected_actions` still require watchlist membership in the current implementation. Tests must include all target tickers in the test watchlist.

---

## Test file to create

**Path:** `apps/mcp-server/src/__tests__/1335a-vpb-okx-cascade.test.ts`

```typescript
/**
 * Task 1335a — VPBankS/OKX crypto partnership cascade rules (RED phase)
 *
 * Three gaps in SECTOR_RULES (REQ-1315):
 *   FR-1: VPBankS→VPB+TCB BULLISH via affected_actions (domain: banking)
 *   FR-2: crypto/lưu ký tài sản số → SSI/VCI/VIX/VND BULLISH (domain: securities)
 *   FR-3: banking domain NEUTRAL for crypto headlines (fires before generic banking BULLISH)
 *
 * These tests FAIL before 1335b inserts the three rules.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(
  summary: string,
  opts: { impactScore?: number; sentiment?: "bullish" | "bearish" | "neutral" } = {}
): AnalysisEntry {
  return {
    id: `test-1335-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-25T09:00:00Z",
    summary,
    level: "country",
    sentiment: opts.sentiment ?? "bullish",
    impactScore: opts.impactScore ?? 9,
    impactDirection: "up",
    confidence: 0.85,
    timeHorizon: "short",
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-25T09:00:00Z",
  };
}

// ─── TC-1 watchlist ────────────────────────────────────────────────────────
const watchlistTC1: WatchlistEntry[] = [
  { actionCode: "VPB", domain: "banking", exchange: "HOSE" },
  { actionCode: "TCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
];

// ─── TC-2 watchlist ────────────────────────────────────────────────────────
const watchlistTC2: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
];

// ─── TC-3 watchlist ────────────────────────────────────────────────────────
const watchlistTC3: WatchlistEntry[] = [
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
];

// ─── TC-4 watchlist ────────────────────────────────────────────────────────
const watchlistTC4: WatchlistEntry[] = [
  { actionCode: "VPB", domain: "banking", exchange: "HOSE" },
];

describe("Task 1335a — VPBankS/OKX crypto cascade rules", () => {

  // ── TC-1: FR-1 ────────────────────────────────────────────────────────────
  describe("TC-1: FR-1 — VPBankS/OKX article cascades VPB and TCB as BULLISH action entries", () => {
    test("TC-1a: VPB gets a BULLISH action-level entry from vpbanks+okx article", () => {
      const seed = makeSeed(
        "vpbanks chính thức tăng vốn lên 10.000 tỷ sau cú bắt tay với okx"
      );
      const chain = buildCausalChain(seed, watchlistTC1);

      const vpbEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VPB")
      );
      expect(vpbEntry).toBeDefined();
      expect(vpbEntry!.sentiment).toBe("bullish");
    });

    test("TC-1b: TCB gets a BULLISH action-level entry from vpbanks+okx article", () => {
      const seed = makeSeed(
        "vpbanks chính thức tăng vốn lên 10.000 tỷ sau cú bắt tay với okx"
      );
      const chain = buildCausalChain(seed, watchlistTC1);

      const tcbEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("TCB")
      );
      expect(tcbEntry).toBeDefined();
      expect(tcbEntry!.sentiment).toBe("bullish");
    });

    test("TC-1c: FR-1 fires for vpbank securities keyword variant", () => {
      const seed = makeSeed(
        "vpbank securities hợp tác okx tài sản số — vốn tăng mạnh"
      );
      const chain = buildCausalChain(seed, watchlistTC1);

      const vpbEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VPB")
      );
      expect(vpbEntry).toBeDefined();
      expect(vpbEntry!.sentiment).toBe("bullish");
    });
  });

  // ── TC-2: FR-3 ────────────────────────────────────────────────────────────
  describe("TC-2: FR-3 — Generic banking domain is NEUTRAL (not BULLISH) for crypto article", () => {
    test("TC-2a: banking domain entry is neutral for okx/lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "okx hợp tác với công ty chứng khoán việt nam lưu ký tài sản số"
      );
      const chain = buildCausalChain(seed, watchlistTC2);

      const bankingDomainEntry = chain.entries.find(
        (e) => e.level === "domain" && e.affectedDomains.includes("banking")
      );
      // FR-3 must fire first (before generic banking BULLISH rules)
      expect(bankingDomainEntry).toBeDefined();
      expect(bankingDomainEntry!.sentiment).toBe("neutral");
    });

    test("TC-2b: VCB does not get a BULLISH entry from generic banking match on crypto article", () => {
      const seed = makeSeed(
        "okx hợp tác với công ty chứng khoán việt nam lưu ký tài sản số"
      );
      const chain = buildCausalChain(seed, watchlistTC2);

      const bullishVcbEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VCB") &&
          e.sentiment === "bullish"
      );
      expect(bullishVcbEntry).toBeUndefined();
    });
  });

  // ── TC-3: FR-2 ────────────────────────────────────────────────────────────
  describe("TC-3: FR-2 — Securities brokers get BULLISH action entries for crypto custody article", () => {
    test("TC-3a: SSI gets a BULLISH action-level entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const ssiEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("SSI")
      );
      expect(ssiEntry).toBeDefined();
      expect(ssiEntry!.sentiment).toBe("bullish");
    });

    test("TC-3b: VCI gets a BULLISH action-level entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const vciEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VCI")
      );
      expect(vciEntry).toBeDefined();
      expect(vciEntry!.sentiment).toBe("bullish");
    });

    test("TC-3c: VIX gets a BULLISH action-level entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const vixEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VIX")
      );
      expect(vixEntry).toBeDefined();
      expect(vixEntry!.sentiment).toBe("bullish");
    });

    test("TC-3d: VND gets a BULLISH action-level entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const vndEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VND")
      );
      expect(vndEntry).toBeDefined();
      expect(vndEntry!.sentiment).toBe("bullish");
    });
  });

  // ── TC-4: NER fallback ────────────────────────────────────────────────────
  describe("TC-4: Direct ticker NER — VPB fires without vpbanks keyword", () => {
    test("TC-4: VPB appears in action entries from direct VPB mention in summary", () => {
      const seed = makeSeed(
        "VPB công bố kế hoạch lưu ký tài sản kỹ thuật số cùng đối tác nước ngoài"
      );
      const chain = buildCausalChain(seed, watchlistTC4);

      // Direct ticker NER (isDirectTickerMention) catches "VPB" regardless of FR-1 rule
      const vpbEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VPB")
      );
      expect(vpbEntry).toBeDefined();
    });
  });
});
```

---

## Why these tests fail before 1335b

- TC-1a/1b/1c: FR-1 rule does not yet exist. `buildCausalChain` will not produce BULLISH action entries for VPB/TCB from vpbanks/okx keywords.
- TC-2a/2b: FR-3 rule does not yet exist. The first-match-wins banking domain entry will come from a generic banking BULLISH rule (if any banking keyword matches), not a NEUTRAL crypto-specific rule.
- TC-3a/3b/3c/3d: FR-2 rule does not yet exist. Securities domain gets no action entries for VCI/VIX/VND from lưu ký tài sản số keywords without `affected_actions`.
- TC-4: This test should already PASS via the existing direct-ticker NER path. Include it as a regression guard.

---

## Files to touch

| Action | File |
|---|---|
| CREATE | `apps/mcp-server/src/__tests__/1335a-vpb-okx-cascade.test.ts` |
| READ (reference) | `apps/mcp-server/src/__tests__/1268-govt-support-cascade-fix.test.ts` |
| DO NOT MODIFY | `apps/mcp-server/src/domain/services/cascadeEngine.ts` (1335b does this) |

---

## Acceptance criteria for RED phase

- [ ] Test file created at the specified path
- [ ] TC-1a, TC-1b, TC-1c FAIL (FR-1 rule missing)
- [ ] TC-2a, TC-2b FAIL (FR-3 rule missing)
- [ ] TC-3a, TC-3b, TC-3c, TC-3d FAIL (FR-2 rule missing)
- [ ] TC-4 PASSES (existing NER path works)
- [ ] `bun test 1335a` runs without compilation errors
- [ ] Overall test baseline does not drop more than 9 (the new failing tests)
