# source_tier Schema Decision — 1881a

**Sprint:** 1881a | **Date:** 2026-05-13 | **Author:** architect
**Spec:** `docs/REQ_1881a.md` | **Resolves:** BLK-1

---

## Decision

### JSON envelope pattern (chosen)

Every affected tool adds `source_tier` as the **first field** of the object serialised into
`content[0].text`:

```typescript
// JSON-output tools (12 tools)
return {
  content: [{ type: "text" as const, text: JSON.stringify({
    source_tier: 2 as const,   // compile-time literal — DDD: interface layer only
    ...existingFields,
  }, null, 2) }],
};

// Text-output tools (4 tools): get_macro_snapshot, get_market_snapshot,
//   get_sentiment_trend, get_policy_signals
return {
  content: [{ type: "text" as const, text: JSON.stringify({
    source_tier: 2 as const,
    text: existingFormattedString,  // verbatim — zero content change
    fetchedAt: new Date().toISOString(),
  }, null, 2) }],
};
```

`source_tier` is a **compile-time integer literal** (`1 | 2 | 3`) per FR-5. It is **never
computed at runtime**, never null, never undefined (NFR-2).

---

## BLK-1 Resolution — Text-output wrapping

**Chosen: option (a) JSON wrapper.** Rejected: option (b) `[source_tier:N]` header line.

### Rationale

| Criterion | Option (a) JSON wrapper | Option (b) Header line |
|-----------|------------------------|----------------------|
| Machine-readable for contract tests | Yes — `JSON.parse(text).source_tier` | Fragile — regex `/^\[source_tier:[123]\]/` |
| TypeScript type enforcement | Yes — object literal checked by tsc | No — string concat, no type |
| Backward compat for LLM consumers | Additive — agents parse `.text` field | Additive — agents strip first line |
| AC-3 test simplicity | `expect(parsed.source_tier).toBe(2)` | Regex assertion only |
| Existing string preserved verbatim | Yes — in `.text` field | Yes — after stripping header |
| Wire format impact | `content[0].text` changes from plain → JSON | `content[0].text` starts with `[source_tier:N]` |

**Deciding factor:** FR-5 mandates compile-time constant. A `[source_tier:N]` prefix is a string
concatenation — no TypeScript type checks it. JSON object literal `{ source_tier: 2 as const }`
is enforced by `tsc --noEmit` and verified by `AC-7`. Option (a) is the only approach that
satisfies both FR-5 and AC-7 together.

**Consumer impact:** LLM agents (financial-analyst, unified-agent, news-scout) receive
`content[0].text`. They currently read it as a display string. After 1881a they should read:
```
const parsed = JSON.parse(content[0].text);
const display = typeof parsed === "object" ? parsed.text : parsed;
```
This is a **one-line agent-prompt update** per consumer agent, not a schema break. No
domain or infrastructure code changes.

**`get_market_context` note:** This compound tool calls domain builder functions directly
(`buildMacroSection`, `buildWatchlistSection`) — it does NOT call other MCP tools via HTTP.
Its own output is plain text (no JSON envelope needed for its sections). `source_tier: 2` goes
on its own envelope as specified in the inventory.

---

## Rejected Alternatives

**Option (b) — `[source_tier:N]` header line**
Preserves the raw string for simple terminal display but cannot be type-checked. Rejected.
See table above.

**Per-record only (no envelope)**
Rejected — FR-1 mandates envelope-level field on ALL 16 tools. Per-record is additive to FR-1
for `get_imf_signals` only (FR-2).

**Dynamic runtime lookup (source_tier computed from data source)**
Rejected explicitly — FR-5 bans runtime computation. Tier is a property of the *tool's
canonical data source*, not of the data returned.

---

## Per-tool Type Interfaces (required changes)

| Tool file | Interface change |
|-----------|-----------------|
| `macroTools.ts` — `MacroSnapshotResponse` | No change to existing interface. Return object is inline in handler. |
| Tools with named response interfaces | Add `source_tier: 1 \| 2 \| 3` as first property. |
| Error paths (AC-8) | `{ source_tier: N, error: "..." }` — same wrapper, no `text` field. |

---

## Versioning Implications

`source_tier` is **additive** — all existing fields remain at their prior paths (NFR-1).
No version bump required. Consumers that do not read `source_tier` continue to work unchanged.

If a future sprint upgrades a tier assignment (e.g. SBV direct REST API → tier 1 for
`get_macro_snapshot`), the constant changes in the handler file only. The field name, type,
and position do not change. No interface version increment needed.

---

## Contract Test Pattern (AC-2 / AC-3)

```typescript
// apps/mcp-server/src/__tests__/1881a-source-tier.test.ts
import { describe, it, expect } from "bun:test";

describe("1881a — source_tier contract", () => {

  // JSON-output tool example
  it("get_carry_trade_signal: source_tier=3 at root", async () => {
    const result = await callTool("get_carry_trade_signal", { _testVndRate: 5.5, _testFedRate: 4.33 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.source_tier).toBe(3);
    expect(typeof parsed.carrySpread).toBe("number"); // backward-compat check
  });

  // Text-output tool example
  it("get_macro_snapshot: source_tier=2, text field present", async () => {
    const result = await callTool("get_macro_snapshot", { _testCommodityClient: null, _testSbvClient: null });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.source_tier).toBe(2);
    expect(typeof parsed.text).toBe("string");
    expect(parsed.text.length).toBeGreaterThan(0);
  });

  // Error path (AC-8)
  it("source_tier present even in error envelope", async () => {
    const result = await callTool("get_imf_signals", {});
    const parsed = JSON.parse(result.content[0].text);
    // error path: { source_tier: 1, error: "..." } OR normal path: { source_tier: 1, indicators: [...] }
    expect(parsed.source_tier).toBe(1);
  });

  // Multi-source per-record (AC-4)
  it("get_imf_signals: indicators[].source_tier=1", async () => {
    const result = await callTool("get_imf_signals", {});
    const parsed = JSON.parse(result.content[0].text);
    for (const ind of parsed.indicators ?? []) {
      expect(ind.source_tier).toBe(1);
    }
  });

  // Fallback path (AC-5)
  it("get_foreign_flow: source_note present on fallback", async () => {
    // inject mock that simulates cache fallback
    const result = await callTool("get_foreign_flow", { _testFallback: "cache" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.source_tier).toBe(2);
    expect(parsed.source_note).toBe("fallback:cache");
  });

});
```

---

## See Also

- `docs/REQ_1881a.md` — tool inventory, tier table, AC-1 through AC-8
- `docs/standards/tnb-methodology-layers.md` — Layer 9 source hierarchy
