# Architecture Brief — 1918b: News Scout Macro Snapshot Package

**Date:** 2026-05-15
**Task:** 1918b-news-scout-macro-snapshot-package
**Author:** Architect
**Status:** DESIGN COMPLETE

---

## Problem Statement

news-scout's tool package omits `get_macro_snapshot`. At Step 0b regime detection, the agent falls through to news-inferred TIGHTENING/EASING when it cannot call the macro snapshot tool. This produces regime discordance with financial_analyst, alert-commander, and unified-agent, all of which call `get_macro_snapshot` directly and arrive at the authoritative NEUTRAL regime. Two consecutive cycles of evidence (c55 02:19 UTC, c56 06:20 UTC) confirm this is a structural gap, not a transient failure.

---

## Path Decision: A over B

### Path A — Add `get_macro_snapshot` to news-scout

Add the tool to news-scout's SKILL_MANIFEST array in `agentBootstrap.ts` (and its mirror in `docs/SKILL_MANIFEST.md`), add the tool entry to `.claude/tools/package/news-scout.md`, and update `.claude/flows/news-scout/stage-bootstrap.md` Step 0b to call the tool directly with the 1918a shape guard before passing the text to the `regime-extraction` skill.

**Chosen.**

### Path B — Derive regime from signal bus

news-scout reads the most recent regime-tagged payload from `get_agent_signals` (filtered to source that posts regime signals, e.g. unified-coordinator) instead of calling `get_macro_snapshot` directly.

**Rejected.** Reasons:

1. **Staleness.** `get_agent_signals` returns the most recently posted signal, which may be several hours old. news-scout's regime inference must be as fresh as the current cycle. The `regime-extraction/SKILL.md` already states: "If `get_macro_snapshot` not in bootstrap context → call it once now" — this is the existing design intent, and Path B contradicts it.

2. **Fragile availability.** The signal bus regime entry depends on another agent (unified-coordinator or market-watcher) having posted it recently. If that agent is silent (see: 1913 substrate outage) or the TTL has expired, news-scout falls back to news-inferred TIGHTENING anyway — the exact failure mode being fixed, now with an additional point of failure.

3. **Pattern violation.** Five agents (`financial_analyst`, `market_watcher`, `alert_commander`, `digest_predict`, `unified_coordinator`) all take `get_macro_snapshot` directly. news-scout is the single omission. Introducing a bus-coupling detour for one agent, without a broader regime SSOT redesign, is an architectural inconsistency.

4. **Infrastructure coupling in tool manifest.** Filtering the signal bus for a regime payload requires knowledge of the signal schema at the flow level — coupling the agent to signal bus implementation details. This is an unnecessary dependency for what is fundamentally a "which tools can this agent call" decision.

---

## Design (Path A)

### Files to modify

| File | Layer | Change |
|------|-------|--------|
| `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` | interface | Append `"get_macro_snapshot"` to `news_scout` array (after `"get_ism_subcomponents"` at L46) |
| `docs/SKILL_MANIFEST.md` | docs | Mirror: append `"get_macro_snapshot"` to `news_scout` JSON array; update Last updated line |
| `.claude/tools/package/news-scout.md` | docs | Add `get_macro_snapshot` row to Market Intelligence table |
| `.claude/flows/news-scout/stage-bootstrap.md` | flow | Step 0b: insert direct `get_macro_snapshot` call + `isMacroSnapshotValidShape()` guard before `regime-extraction/SKILL.md` reference |

### Stage-bootstrap.md Step 0b logic

```
call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})

Apply isMacroSnapshotValidShape() guard:
  - Valid:   MACRO_SNAPSHOT_TEXT = response.text → pass to regime-extraction/SKILL.md
  - Invalid: [WARN] get_macro_snapshot returned wrong shape — regime via news-fallback
             REGIME_SOURCE=news-fallback (same path as call failure, non-fatal)
```

The shape guard reuses `macroSnapshotGuard.ts` (Task 1918a) by reference in prose — no import needed in flow docs.

### No new code, no tests

The change is entirely in the SKILL_MANIFEST authorization arrays (TypeScript array literals, no logic) and in flow prose docs. The shape guard logic (`isMacroSnapshotValidShape`) is already tested by Task 1918a (10/10 GREEN). No new test file needed.

---

## Risk Summary

| Risk | Level | Mitigation |
|------|-------|-----------|
| Manifest drift (agentBootstrap vs SKILL_MANIFEST.md out of sync) | LOW | Update both in same commit; SSOT comment in agentBootstrap.ts warns on drift |
| Shape guard omitted from stage-bootstrap.md update | LOW-MEDIUM | AC gate: explicit check that shape guard block present |
| system_status bleed propagates wrong regime | LOW | Shape guard prevents; on mismatch falls to news-fallback (non-fatal) |
| Token cost of one extra MCP call per cycle | LOW | ~300 tokens; acceptable for regime accuracy |

---

## Broader Context

This fix is one of three 1918-series tasks addressing the macro snapshot gap:

- **1918a** (In Review): `isMacroSnapshotValidShape()` guard for alert-commander stage-bootstrap shape bleed. DONE.
- **1918b** (this task): news-scout tool package registration + flow update. Structural fix.
- Both tasks are independent; 1918b can ship without waiting for 1918a QA closure (the shape guard code is already in the codebase at `macroSnapshotGuard.ts`).

Once 1918b ships, news-scout at market open will call `get_macro_snapshot` with the same flow as alert-commander 04:03 UTC (which correctly resolved NEUTRAL), eliminating the TIGHTENING-at-open discordance observed in c55/c56.
