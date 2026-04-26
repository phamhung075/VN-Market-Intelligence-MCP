# TASK_1335b — GREEN: Insert VPBankS/OKX cascade rules into SECTOR_RULES

**Sprint:** 1335
**Phase:** GREEN (make 1335a tests pass)
**Depends on:** TASK_1335a (RED tests must exist and fail)
**File to modify:** `apps/mcp-server/src/domain/services/cascadeEngine.ts`
**Tests to pass:** `apps/mcp-server/src/__tests__/1335a-vpb-okx-cascade.test.ts`

---

## Context

Three rules insert into `SECTOR_RULES` at line 2295 (before the closing `];`).
Order is load-bearing — first-match-wins per domain (`cascadeEngine.ts:2705`).
Required insertion order: FR-3 first, then FR-1, then FR-2 (anywhere in securities block).

---

## Exact insertion point

**File:** `apps/mcp-server/src/domain/services/cascadeEngine.ts`
**Line 2280–2296 context (current last two rules before `];`):**

```typescript
  {
    keywords: [
      "nhà đầu tư cá nhân mua ròng",
      ...
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.62,
    title: "Nhà đầu tư cá nhân mua ròng — thanh khoản tăng hỗ trợ hoạt động ngân hàng (retail_netbuy_banking)",
  },
];   // ← line 2296: array end. Insert new rules immediately before this line.
```

**Use Edit tool: replace the closing `},\n];` (last rule's closing brace + array bracket) with the closing `},` + 3 new rules + `];`.**

---

## Rules to insert

Insert these three rules immediately before the closing `];` of `SECTOR_RULES` (after the `retail_netbuy_banking` rule):

```typescript
  // ── FR-3: banking NEUTRAL for crypto/digital-asset headlines (Sprint 1335) ──
  // INSERT FIRST — first-match-wins means this blocks generic banking BULLISH rules
  // from firing on crypto context. Banks without digital-asset strategy are neutral.
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số vietnam",
      "sàn tiền mã hóa",
    ],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title:
      "Crypto partnership/lưu ký tài sản số — ngân hàng truyền thống không có chiến lược digital-asset: tác động trung lập",
  },
  // ── FR-1: VPBankS/OKX → VPB (parent) + TCB (peer) BULLISH (Sprint 1335) ────
  // affected_actions: VPB = direct parent of VPBankS; TCB = peer with digital strategy.
  // requireAnyKeyword: co-occurrence guard prevents false-positive on unrelated OKX headlines.
  {
    keywords: [
      "vpbanks",
      "vp bank securities",
      "vpbank securities",
      "tăng vốn vpbanks",
      "vpbanks tăng vốn",
      "vpbanks.*okx",
      "okx.*vpbanks",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.88,
    requireAnyKeyword: [
      "tăng vốn",
      "vốn",
      "hợp tác",
      "partnership",
      "okx",
      "crypto",
      "digital asset",
      "tài sản số",
    ],
    title:
      "VPBankS tăng vốn/hợp tác OKX — VPB (công ty mẹ) và TCB (chiến lược tương đồng) hưởng lợi trực tiếp",
    affected_actions: [
      { code: "VPB", direction: "up" },
      { code: "TCB", direction: "up" },
    ],
  },
  // ── FR-2: crypto/digital-asset custody → securities brokers BULLISH (Sprint 1335) ──
  // New revenue stream signal for brokers potentially entering crypto custody.
  // requireAnyKeyword: co-occurrence guard prevents BCTC "tài sản số" (balance sheet) false match.
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số",
      "digital asset vietnam",
      "tiền mã hóa hợp pháp",
      "crypto hợp pháp",
      "sàn tiền mã hóa",
      "hợp tác crypto",
      "crypto partnership",
      "tài sản kỹ thuật số",
      "lưu ký crypto",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.72,
    requireAnyKeyword: [
      "chứng khoán",
      "securities",
      "vpbanks",
      "môi giới",
      "broker",
      "lưu ký",
      "custody",
    ],
    title:
      "Hợp tác crypto/lưu ký tài sản số — tín hiệu cạnh tranh/cơ hội mới cho CTCK (SSI/VCI/VIX/VND)",
    affected_actions: [
      { code: "SSI", direction: "up" },
      { code: "VCI", direction: "up" },
      { code: "VIX", direction: "up" },
      { code: "VND", direction: "up" },
    ],
  },
```

---

## Edit tool operation

**old_string** (the current closing of SECTOR_RULES — last rule + closing bracket):

```
    title: "Nhà đầu tư cá nhân mua ròng — thanh khoản tăng hỗ trợ hoạt động ngân hàng (retail_netbuy_banking)",
  },
];
```

**new_string** (same last rule closing + 3 new rules + closing bracket):

```
    title: "Nhà đầu tư cá nhân mua ròng — thanh khoản tăng hỗ trợ hoạt động ngân hàng (retail_netbuy_banking)",
  },
  // ── FR-3: banking NEUTRAL for crypto/digital-asset headlines (Sprint 1335) ──
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số vietnam",
      "sàn tiền mã hóa",
    ],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title:
      "Crypto partnership/lưu ký tài sản số — ngân hàng truyền thống không có chiến lược digital-asset: tác động trung lập",
  },
  // ── FR-1: VPBankS/OKX → VPB (parent) + TCB (peer) BULLISH (Sprint 1335) ──
  {
    keywords: [
      "vpbanks",
      "vp bank securities",
      "vpbank securities",
      "tăng vốn vpbanks",
      "vpbanks tăng vốn",
      "vpbanks.*okx",
      "okx.*vpbanks",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.88,
    requireAnyKeyword: [
      "tăng vốn",
      "vốn",
      "hợp tác",
      "partnership",
      "okx",
      "crypto",
      "digital asset",
      "tài sản số",
    ],
    title:
      "VPBankS tăng vốn/hợp tác OKX — VPB (công ty mẹ) và TCB (chiến lược tương đồng) hưởng lợi trực tiếp",
    affected_actions: [
      { code: "VPB", direction: "up" },
      { code: "TCB", direction: "up" },
    ],
  },
  // ── FR-2: crypto/digital-asset custody → securities brokers BULLISH (Sprint 1335) ──
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số",
      "digital asset vietnam",
      "tiền mã hóa hợp pháp",
      "crypto hợp pháp",
      "sàn tiền mã hóa",
      "hợp tác crypto",
      "crypto partnership",
      "tài sản kỹ thuật số",
      "lưu ký crypto",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.72,
    requireAnyKeyword: [
      "chứng khoán",
      "securities",
      "vpbanks",
      "môi giới",
      "broker",
      "lưu ký",
      "custody",
    ],
    title:
      "Hợp tác crypto/lưu ký tài sản số — tín hiệu cạnh tranh/cơ hội mới cho CTCK (SSI/VCI/VIX/VND)",
    affected_actions: [
      { code: "SSI", direction: "up" },
      { code: "VCI", direction: "up" },
      { code: "VIX", direction: "up" },
      { code: "VND", direction: "up" },
    ],
  },
];
```

---

## Ordering analysis (DDD integrity — first-match-wins)

The `SECTOR_RULES` array is iterated linearly. The first rule whose `keywords` match AND passes `excludeKeywords`/`requireAnyKeyword` guards wins per domain.

Current banking rules near the end of the array include `retail_netbuy_banking` (direction: "up", confidence: 0.62). If a generic banking BULLISH rule earlier in the array matches "okx" (e.g. by containing "vốn" or financial sector keywords), FR-3 must appear BEFORE it to win.

**Confirmed safe:** inserting FR-3, FR-1, FR-2 at line 2295 (after `retail_netbuy_banking`) means:
- For banking domain: the array is scanned from position 0 upward. If an earlier banking rule matches the article (e.g. a generic banking BULLISH rule at line ~800), it would fire FIRST before FR-3.
- **Risk:** If any existing banking rule has keywords overlapping with "okx" or "tài sản số", it could win before FR-3.

**Developer must verify:** Search for existing `domain: "banking"` rules with overlapping keywords before inserting at the end. If overlap found, FR-3 must be moved earlier in the array (before any competing banking rule).

**Verification command:**
```bash
grep -n '"banking"' apps/mcp-server/src/domain/services/cascadeEngine.ts | grep 'domain:' | head -20
```
Then check each banking rule's keywords array for "okx", "tài sản số", "crypto", "lưu ký" overlap.

If a competing banking rule exists at an earlier position, insert FR-3 BEFORE that rule, not at line 2295.

---

## Known constraint — affected_actions require watchlist membership

`cascadeEngine.ts:2936`: `if (!watchlistStock) continue;`

FR-1 affected_actions (VPB, TCB) only produce action entries when those tickers are in the caller's watchlist.
FR-2 affected_actions (SSI, VCI, VIX, VND) only produce action entries when those tickers are in the caller's watchlist.

This is expected behavior. The test watchlists in 1335a include all required tickers.

For the live system: VCI/VIX may not be in the user's watchlist. In that case FR-2 fires the domain entry (securities BULLISH at 0.72 confidence) but no VCI/VIX action entries. SSI and VND likely are in watchlist and will produce action entries.

---

## FR-3 domain direction conflict note

FR-3 fires `direction: "neutral"` for banking domain. Step 2h iterates over `triggeredDomains` to generate `affected_actions` entries. Since FR-3 has no `affected_actions`, Step 2h produces no action entries for banking when FR-3 wins. This is correct — generic banks (VCB, BID, CTG) get NEUTRAL domain-level signal, no dedicated action entries.

FR-1 also maps to `domain: "banking"` with `direction: "up"`. Since first-match-wins, if FR-3 fires for the "okx/lưu ký" article, FR-1 will NOT fire as a domain entry. However FR-1's keywords ("vpbanks", "vpbank securities") are distinct from FR-3's keywords — an article with "vpbanks" will trigger FR-1, not FR-3 (assuming FR-3 does not have "vpbanks" in its keywords). Confirmed: FR-3 keywords are `["okx", "crypto custody", "lưu ký tài sản số", "tài sản số vietnam", "sàn tiền mã hóa"]` — no overlap with FR-1 keywords.

**But:** An article like the original — "vpbanks chính thức tăng vốn lên 10.000 tỷ sau cú bắt tay với okx" — contains BOTH "vpbanks" (FR-1 trigger) and "okx" (FR-3 trigger). Array scan hits FR-3 first if FR-3 is at a lower index. This would block FR-1 from firing as a domain entry, preventing VPB/TCB action entries.

**Resolution:** FR-1 must appear BEFORE FR-3 in the array so FR-1 wins the banking domain for vpbanks+okx articles. VPB/TCB get BULLISH. FR-3 only wins when no "vpbanks" keyword is present (pure OKX-only or generic crypto articles).

**Corrected insertion order:**
1. FR-1 (banking BULLISH, vpbanks keywords) — insert FIRST among the three new rules
2. FR-3 (banking NEUTRAL, okx/crypto keywords) — insert AFTER FR-1
3. FR-2 (securities BULLISH, crypto custody keywords) — separate domain, order within securities block

```
... existing rules ...
retail_netbuy_banking  (existing, direction: up)
FR-1  ← NEW: banking up, vpbanks keywords, requireAnyKeyword
FR-3  ← NEW: banking neutral, okx/crypto keywords
FR-2  ← NEW: securities up, lưu ký/crypto keywords
];
```

This ensures: vpbanks+okx article → FR-1 wins banking domain (VPB/TCB BULLISH). Pure okx-only article → FR-3 wins banking domain (NEUTRAL, no affected_actions).

**Developer must update the Edit tool operation above accordingly** — FR-1 before FR-3 in the new_string.

---

## Acceptance criteria for GREEN phase

- [ ] `bun test 1335a` — all tests pass
- [ ] TC-1a, TC-1b, TC-1c pass (VPB + TCB BULLISH from vpbanks/okx keywords)
- [ ] TC-2a, TC-2b pass (banking domain NEUTRAL for pure crypto article)
- [ ] TC-3a, TC-3b, TC-3c, TC-3d pass (SSI/VCI/VIX/VND BULLISH from lưu ký tài sản số)
- [ ] TC-4 passes (NER fallback for direct VPB mention — was already passing)
- [ ] `bun test` full suite: no regressions beyond pre-existing failures
- [ ] `bun tsc --noEmit` passes (no TypeScript errors)
- [ ] `SectorRule` interface already has `affected_actions`, `requireAnyKeyword`, `direction: "neutral"` — no interface changes needed

---

## Files to touch

| Action | File |
|---|---|
| MODIFY | `apps/mcp-server/src/domain/services/cascadeEngine.ts` (SECTOR_RULES, insert before line 2296) |
| NO CHANGE | Any other file |
