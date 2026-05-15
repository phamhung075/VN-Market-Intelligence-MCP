# TASK_1918b — News Scout Macro Snapshot Package

**Task ID:** 1918b-news-scout-macro-snapshot-package
**Type:** FIX | **Priority:** HIGH | **Size:** S
**Zone:** `apps/mcp-server/` (agentBootstrap.ts, SKILL_MANIFEST.md, news-scout.md) + `.claude/flows/news-scout/stage-bootstrap.md`
**Branch:** main

---

## Problem

TNB c55 cycle-1 (02:19 UTC) and cycle-2 (06:20 UTC): news-scout logs `"get_macro_snapshot not in package, [SKIP]"` during Step 0b regime extraction. Regime defaults to news-inferred TIGHTENING at market open, producing discordance with the authoritative NEUTRAL declared by unified-agent (05:00 UTC) and alert-commander (04:03 UTC via live `get_macro_snapshot`). Downstream consequence: impact score multiplier (`TIGHTENING + bearish → ×1.3`) suppresses signals that would have fired under NEUTRAL threshold (0.60 vs 0.75).

---

## [Architect] Brownfield Findings

### Zone

`apps/mcp-server/`
- Single zone. No cross-service HTTP involved. Pure interface-layer registration + flow doc update.

### Path Decision: Path A

**Path A chosen. Path B rejected.**

**Path A:** Add `get_macro_snapshot` to news-scout's SKILL_MANIFEST array in `agentBootstrap.ts`, mirror in `docs/SKILL_MANIFEST.md`, add tool entry to `.claude/tools/package/news-scout.md`, and update `.claude/flows/news-scout/stage-bootstrap.md` Step 0b to call the tool directly.

**Path B rejected** for these reasons:

1. **Signal bus carries stale regime.** `get_agent_signals` is not a live regime source — it surfaces the most recent signal posted by any agent with a `regime`-tagged payload. That signal may be several hours old relative to the current cycle. The regime-extraction skill SSOT (`regime-extraction/SKILL.md`) already states: "If `get_macro_snapshot` not in bootstrap context → call it once now." This implies direct tool access is the correct model.

2. **Coupling without isolation.** Path B introduces a dependency on the bus's regime signal being present, correctly typed, and within TTL at every news-scout cycle. This is fragile: if no agent has posted a regime signal recently (e.g., unified-agent silence or 1913 gateway issue), news-scout falls back to news-inferred TIGHTENING anyway — the same failure mode we are trying to fix, now harder to debug.

3. **Pattern already proven.** `financial_analyst`, `market_watcher`, `alert_commander`, `digest_predict`, and `unified_coordinator` all carry `get_macro_snapshot` directly in their SKILL_MANIFEST arrays. news-scout is the sole omission. Extending the proven pattern is architecturally correct; diverging to a bus-coupling model for one agent without a broader regime-SSOT redesign would be a DDD violation (introducing infrastructure coupling in what should be a simple tool authorization list).

4. **Shape guard available.** Task 1918a delivered `isMacroSnapshotValidShape()` in `macroSnapshotGuard.ts`. The flow update for Stage 0b must reference this guard (identical to the alert-commander pattern) so that system_status bleed returns news-fallback rather than crashing regime extraction.

**Risk flag — shape guard coupling:** `macroSnapshotGuard.ts` lives in `apps/mcp-server/src/interface/mcp/tools/macro/`. The news-scout flow doc must reference it by name (text instruction), not import it — flow docs are prompt text, not TypeScript. The guard is only relevant to alert-commander (already patched) and now news-scout (to be documented). No new code file needed.

### Verified Paths

| File | Status | Change |
|------|--------|--------|
| `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` | EXISTS L29-47 `news_scout` array | ADD `"get_macro_snapshot"` to `news_scout` array |
| `docs/SKILL_MANIFEST.md` | EXISTS — SSOT mirror of agentBootstrap.ts | ADD `"get_macro_snapshot"` to `news_scout` JSON array |
| `.claude/tools/package/news-scout.md` | EXISTS — Market Intelligence section | ADD `get_macro_snapshot` row to Market Intelligence table |
| `.claude/flows/news-scout/stage-bootstrap.md` | EXISTS — Step 0b calls `regime-extraction` skill | UPDATE Step 0b: call `get_macro_snapshot` directly with shape guard + news-fallback, then pass text to regime-extraction skill |

### Reuse Patterns

- **Do not duplicate** the shape guard logic inline. Reference `macroSnapshotGuard.ts` by name in the flow prose, identical to the 1918a alert-commander pattern in `.claude/flows/alert-commander/stage-bootstrap.md`.
- **Do not add** `get_macro_snapshot` to `ALWAYS_ON_TOOLS` in `agentBootstrap.ts` — it is not universally needed (e.g., `dev_team`, `qa_responder`, `report_analyzer` have no regime inference step).
- The `regime-extraction/SKILL.md` already handles the "parse regime from macro snapshot text block" logic. The flow update only needs to add the call + guard before the skill reference.

### DDD Layer Assignment

All changes are in the **interface layer** only:
- `agentBootstrap.ts` — interface/mcp/bootstrap (tool authorization map)
- `SKILL_MANIFEST.md` — docs mirror of the same
- `news-scout.md` — agent tool package doc
- `stage-bootstrap.md` — flow prompt doc

No domain, application, or infrastructure code changes. No new test file required (the shape guard is already tested by 1918a; the manifest addition is a pure array append with no logic).

### Design Decisions

1. **Placement in `news_scout` array:** append `"get_macro_snapshot"` after `"get_ism_subcomponents"` (last entry at L46 in agentBootstrap.ts). Matches the ISM and FED liquidity spread pattern (both added as trailing entries in Task 1910a/1910b).

2. **Stage-bootstrap.md Step 0b update:** insert a tool call block before the `regime-extraction/SKILL.md` line that:
   - Calls `get_macro_snapshot`
   - Applies `isMacroSnapshotValidShape()` guard
   - On valid shape: sets `MACRO_SNAPSHOT_TEXT` → passes to regime-extraction skill
   - On invalid shape (system_status bleed): sets `REGIME_SOURCE=news-fallback`, logs `[WARN] get_macro_snapshot returned wrong shape — TIGHTENING/EASING/NEUTRAL via news-fallback`, continues (non-fatal, same news-fallback path as call failure)

3. **SKILL_MANIFEST.md update:** `news_scout` array must stay in sync with agentBootstrap.ts per the SSOT comment at the top of that file. Update the `Last updated` line to `2026-05-15 (Task 1918b — added get_macro_snapshot to news_scout)`.

4. **news-scout.md tool package doc:** add row to "Market Intelligence" table:
   `| get_macro_snapshot | Macro regime snapshot for 0b regime detection | source?: string, regimeType?: string |`
   This mirrors the financial-analyst.md entry verbatim (same purpose text).

### Risk Flags

- **RISK-1 (LOW): Manifest drift.** Two files must be updated atomically: `agentBootstrap.ts` + `docs/SKILL_MANIFEST.md`. If only one is updated, the SSOT mirror comment warning fires. Mitigate: developer updates both in the same commit.
- **RISK-2 (LOW): Stage-bootstrap step ordering.** The `get_macro_snapshot` call must happen at Step 0b — after `get_cycle_bootstrap` but before any sentiment or impact scoring. The current Step 0b already references the regime-extraction skill; the fix inserts the tool call at the top of that step, not as a new step. Ordering preserved.
- **RISK-3 (LOW): Cowork token cost.** Adding one tool call per cycle to news-scout is ~300 tokens (one MCP roundtrip). Acceptable for the regime accuracy gain.
- **RISK-4 (LOW-MEDIUM): system_status bleed still possible.** Task 1918a fixed alert-commander's shape guard. news-scout now needs identical guard in its flow doc. If shape guard is omitted from the flow update, the TIGHTENING-from-wrong-shape bug will be transplanted from alert-commander to news-scout. Mitigate: developer must explicitly add the guard block in stage-bootstrap.md (AC requirement).

### Scan Clean

true — no DDD violations, no duplicate interfaces, no production footguns identified.

---

## [PM] Planning Context

**Zone:** Single zone — `apps/mcp-server/` (interface layer only). No cross-service HTTP, no infrastructure refactoring.

**WIP Status:** 0/2 CLEAN. Task ready for immediate dispatch.

**Blocker Status:** NONE. All dependencies resolved:
- `isMacroSnapshotValidShape()` guard delivered by 1918a (DONE 2026-05-15)
- `regime-extraction/SKILL.md` SSOT already exists
- news-scout flow doc exists and ready for Step 0b update

**Sequencing:** Independent task. Can start immediately. 1918a completion is prerequisite (satisfied).

**Files to Read/Create/Modify:**
1. Read: `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (L29-47, `news_scout` array)
2. Read: `docs/SKILL_MANIFEST.md` (top: SSOT comment, L78-85, `news_scout` JSON array)
3. Modify: `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (append to `news_scout` array)
4. Modify: `docs/SKILL_MANIFEST.md` (mirror append to `news_scout` array + update "Last updated" comment)
5. Modify: `.claude/tools/package/news-scout.md` (Market Intelligence table)
6. Modify: `.claude/flows/news-scout/stage-bootstrap.md` (Step 0b: insert `get_macro_snapshot` call + guard)

**Dependencies:**
- **Blocking:** None
- **Blocked by:** None
- **Related:** Task 1918a (alert-commander shape guard, DONE, provides pattern reference)

**Risk flags (copied from Architect):**
- R-1 (LOW): Manifest drift — two files must be updated atomically in same commit
- R-2 (LOW): Step ordering — call must happen at Step 0b, not new step
- R-3 (LOW): Token cost — ~300 tokens acceptable
- R-4 (LOW-MEDIUM): Shape guard omission — must be explicit in flow doc

**Test strategy:** No new test file required (pure array append + flow prose). Verify:
- tsc 0 errors (no type changes)
- Flow step ordering preserved
- Manifest pair in sync

---

## Acceptance Criteria

- [ ] `agentBootstrap.ts` `news_scout` array contains `"get_macro_snapshot"`
- [ ] `docs/SKILL_MANIFEST.md` `news_scout` array contains `"get_macro_snapshot"` (mirror in sync)
- [ ] `.claude/tools/package/news-scout.md` Market Intelligence table has `get_macro_snapshot` row
- [ ] `.claude/flows/news-scout/stage-bootstrap.md` Step 0b calls `get_macro_snapshot` with shape guard before regime-extraction skill
- [ ] On valid macro snapshot: REGIME sourced from `get_macro_snapshot` text (not news-fallback)
- [ ] On invalid shape (system_status bleed): `[WARN]` log + `REGIME_SOURCE=news-fallback` (non-fatal, identical to call failure path)
- [ ] tsc 0 errors (interface-layer-only change; no type errors expected)
- [ ] No new test file required (pure array append + flow doc text update)

---

## [Developer] Implementation Record

- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:46` — appended `"get_macro_snapshot"` to `news_scout` array after `"get_ism_subcomponents"`
  - `docs/SKILL_MANIFEST.md:6,30-31` — mirrored append to `news_scout` JSON array; updated "Last updated" to Task 1918b
  - `.claude/tools/package/news-scout.md:45` — added `get_macro_snapshot` row to Market Intelligence table
  - `.claude/flows/news-scout/stage-bootstrap.md:13-24` — replaced bare Step 0b regime-extraction reference with explicit `get_macro_snapshot` call + `isMacroSnapshotValidShape()` guard + news-fallback path (mirrors alert-commander 1918a pattern)
- **Tests written:** NONE — pure interface-layer array append + flow doc text update; no new logic
- **Git commits:**
  - `8d4df7a2` fix(1918b/mcp): 1918b add get_macro_snapshot to news_scout SKILL_MANIFEST (SSOT pair, atomic)
  - `f6918cc9` fix(1918b/flow): 1918b news-scout stage-bootstrap 0b get_macro_snapshot + shape guard
- **tsc status:** clean (0 errors)
- **Full suite:** not run (no production code changed; tsc clean confirms no type regressions)
- **Docs updated:**
  - `docs/SKILL_MANIFEST.md` — news_scout array + Last updated line
  - `.claude/tools/package/news-scout.md` — Market Intelligence table row
  - `.claude/flows/news-scout/stage-bootstrap.md` — Step 0b regime block
  - `docs/TASKS.md` — task status → Review
- **Graphify:** skipped (flow/package doc changes; no domain knowledge files impacted)
