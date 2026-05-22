# TASK_1968d-P03 — L-14 Per-Zone Caveman Dictionaries (5 Zones)

**Sprint:** 1968d | **Wave:** 2 (GATED on P01 QA APPROVED + P02 QA APPROVED) | **Owner:** agent-father
**Zone:** `.claude/skills/caveman/SKILL.md`
**Est. savings:** 10–15% extra compression on zone-scoped signals + DASHBOARD rows (~5 KB/trading-day)
**DDD layer:** Infrastructure (compression convention layer, no domain logic)
**Size:** S | **Priority:** MED | **NFR-3:** BCTC-freeze not triggered
**Depends on:** 1968d-P01 QA APPROVED AND 1968d-P02 QA APPROVED (Wave 2 gate)

---

## § 1 — Problem Statement

Current caveman SKILL.md defines base compression rules (ULTRA/FULL/LITE tiers) but uses only generic abbreviations that apply identically across all zones.
Zone-scoped signals (e.g., a dev-mcp-server signal about a handler malfunction, or a dev-stock-price signal about an OHLCV scanner) repeat full terms like "handler", "scanner", "scheduler" despite these being predictable within their zone context.
Per-zone dictionaries add an additive compression layer: when the batch entry carries `zone: apps/mcp-server/`, the encoder also applies the mcp-server zone dictionary on top of base caveman. Decode is symmetric: receiver knows zone from the same `zone:` field.

Gating rationale: L-14 zone dictionary may reference the L-10 delta-read pattern in its examples (e.g., showing a compressed signal carrying `last_read_anchor`). Landing P01 first eliminates re-work risk in P03.

---

## § 2 — Scope

**Files to UPDATE (1 file of dev work):**
- `.claude/skills/caveman/SKILL.md` — append `## Zone Dictionaries` section with 5 zone maps

**OUT of scope:**
- Any `apps/*` code
- Any agent `.md` or flow `.md` file (caveman skill is the SSOT; all agents reference it)
- Any change to base ULTRA/FULL/LITE tier rules (additive-only, backward-compatible)
- BCTC zone dictionary content (NFR-3 freeze applies — bctc zone dictionary listed but marked FROZEN, no bctc extractor logic referenced)

Note: 1-file task, well within the ≤2-file split policy.

---

## § 3 — Acceptance Criteria

**AC-1 (section exists):** `.claude/skills/caveman/SKILL.md` contains a `## Zone Dictionaries` section appended after the existing `## Boundaries` section. No existing content modified.

**AC-2 (5 zone maps present):** The section defines all 5 zone dictionaries exactly as specified in `docs/SPRINT_GOAL.md § Sprint 1968d` Scope row for 1968d-P03:

| Zone | Abbreviations |
|------|--------------|
| `apps/mcp-server/` | tool→t, server→s, handler→h, store→st, scheduler→sch |
| `apps/stock-price/` | fetcher→f, scanner→sc, ohlcv→o, ticker→tk |
| `apps/alert-engine/` | verdict→v, evaluator→ev, alert→a |
| `apps/bctc-extractor/` | extractor→ex, pdf→p, ocr→oc, queue→q |
| `.claude/` | agent→ag, flow→fl, skill→sk, signal→sg |

**AC-3 (activation rule):** The section documents: "Zone dictionary activates when the batch entry or signal carries `zone: <zone-path>` field. When zone is unset or unrecognized, base caveman applies unchanged. Zone abbreviations are ADDITIVE — they stack on top of whichever ULTRA/FULL/LITE tier is active."

**AC-4 (round-trip example):** The section includes a round-trip example for the `apps/mcp-server/` zone:
- Encode: `"handler in mcp-server scheduler crashed"` → `"h in s sch crashed"` (with `zone: apps/mcp-server/`)
- Decode: receiver sees `zone: apps/mcp-server/` → expands `h=handler, s=server, sch=scheduler` → `"handler in mcp-server scheduler crashed"`

**AC-5 (no regression on existing tests):** Existing caveman SKILL behavior for signals WITHOUT a `zone:` field is unchanged. A grep of `zone:` in all existing signal files in `docs/signals/processed/` returns 0 matches → confirms no live signals currently carry this field → backward compat is trivially preserved.

---

## § 4 — Smoke Test (1-cycle verification)

1. Construct a sample batch entry: `{ "zone": "apps/mcp-server/", "msg": "handler in mcp-server scheduler crashed, store corrupted" }`.
2. Apply zone dictionary encoding (manually, as agent-father would in a signal write step): assert output is `{ "zone": "apps/mcp-server/", "msg": "h in s sch crashed, st corrupted" }`.
3. Apply zone dictionary decoding on the encoded output: assert reconstruction is `"handler in mcp-server scheduler crashed, store corrupted"` (lossless round-trip).
4. Construct a sample batch entry WITHOUT `zone:` field: `{ "msg": "scheduler task failed" }`. Apply caveman skill — assert base caveman applies and zone dictionary does NOT activate. Output: `{ "msg": "sch task fail" }` (base ultra) NOT zone-specific encoding.
5. Verify `.claude/skills/caveman/SKILL.md` line count after update: `wc -l .claude/skills/caveman/SKILL.md` → assert ≤100L (current is 72L; new section adds ~20L → total ~92L, within cap).

Pass condition: steps 2–5 all assert correctly. No existing caveman behavior altered.

---

## § 5 — Rollback (1-step revert)

```bash
git revert HEAD --no-edit
```

The `## Zone Dictionaries` section is removed from `caveman/SKILL.md`. All agents revert to base caveman (no zone dictionary). Any signals written during the task window that carry zone abbreviations will be slightly harder to read but remain functionally correct (base caveman still applies; zone abbreviations are a strict subset of readable English fragments, not binary encoding). No data loss, no operational impact.

---

## Implementation Notes (for agent-father, not BA work)

- The `## Zone Dictionaries` section must be clearly marked as ADDITIVE. Add a comment: "Do not edit base ULTRA/FULL/LITE tier rules above. Zone dictionaries are append-only extensions."
- NFR-3 BCTC-freeze: the `apps/bctc-extractor/` zone dictionary is listed for completeness (future use) but must carry a `# FROZEN — NFR-3 active` comment. No bctc extractor flow or logic is referenced from this task.
- The `.claude/` zone dictionary (`agent→ag, flow→fl, skill→sk, signal→sg`) directly benefits the `post_agent_signal` payloads emitted by cowork agents in the `.claude/` zone — the most frequent signal type in the system. This is the highest-ROI entry of the 5.
- Cross-ref: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md § L-14` + `docs/SPRINT_GOAL.md § Sprint 1968d` Scope row for 1968d-P03.
- If agent-father references the L-10 delta-read anchor convention in the zone dictionary examples (e.g., showing a compressed signal that carries `last_read_anchor`), use the anchor format defined in TASK_1968d-P01 (`## §<N>-<slug>`) — this is why P03 is gated on P01 completion.

---

## [BA] Spec Record

**BA:** ba | **Cycle:** c250 | **Timestamp:** 2026-05-22T05:10Z
**Blockers for PO:** none
**DDD layer:** Infrastructure (compression convention layer, no domain entity change)
**Wave:** 2 — GATED on 1968d-P01 QA APPROVED AND 1968d-P02 QA APPROVED
**Gate rationale:** L-14 zone dict examples may reference L-10 delta-read anchor format; gating prevents rework if P01 changes anchor convention during QA.
