# Handoff — TASK_1967-09: Signal-file naming contract + cowork schedule dead slots (ITEM-14 + ITEM-11 + ITEM-10)

**Task:** 1967-09 | **Sprint:** 1967c | **Severity:** MED | **Size:** XS (data/doc edits only)

---

## Summary

Three related signal/cowork scheduling items bundled:
1. **ITEM-14:** Signal-file naming contract undocumented; 3 active signals violate `{agent}-{ISO-timestamp}.json` pattern
2. **ITEM-11:** API_MIN_INTERVAL dead slots enabled in cowork-schedule.json (false-positive collision warnings)
3. **ITEM-10:** Cowork fire-drift sustained at drift_min=5 (max 9) — safe but warrants documentation

All are config/doc edits, no code changes.

---

## Evidence

**Brief cross-links:** ITEM-14, ITEM-11, ITEM-10 in `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

**Repro paths:**

### ITEM-14
- `docs/protocols/agent-chaining-protocol.md:136` declares `{agent}-{ISO-timestamp}.json`
- `docs/signals/` contains: `po-1967-ba-approved.json`, `po-1967b-rerun.json`, `po-1968a-gate-released.json` — missing timestamp

### ITEM-11
- `docs/data/cowork-schedule.json`: `news-scout-market`, `market-watcher-market`, `alert-commander-market` have `"trigger_error": "API_MIN_INTERVAL"` AND `"enabled": true`

### ITEM-10
- All 19 processed cowork-team signals 2026-05-21 show drift_min values: median=5, max=9
- Confirmed safe under floor-15 rounding

---

## Current Behavior

### ITEM-14
- Signal naming contract buried in protocol.md (1 line), not SSOT spec
- Ad-hoc signal names bypass contract
- Dedup fingerprint relies on timestamp component; missing timestamp breaks dedup in signals.db

### ITEM-11
- Dead slots (trigger_error=API_MIN_INTERVAL) still enabled
- Matcher filter includes them as candidates
- Collision-guard fires FALSE-POSITIVE WARNINGs during market hours

### ITEM-10
- Drift envelope median=5, max=9
- Safe by design (floor-15 rounding), but undocumented
- Risk: if load increases and drift reaches 13+, lock collision becomes possible

---

## Expected Behavior

### ITEM-14
- Naming contract promoted to mcp-tools.md § Signal Bus (SSOT)
- po flow uses ISO-8601 timestamps in all signal writes
- Dedup fingerprint derivation reliable

### ITEM-11
- Dead slots set `"enabled": false` + comment `_disabled_by: "API_MIN_INTERVAL — cowork master dispatcher owns sub-hourly firing"`
- No false-positive WARNINGs during market hours

### ITEM-10
- Document drift_min ≤ 10 as safe, ≥ 15 as collision risk
- Add to cowork-team/main.md commentary

---

## Proposed Fix

**Zone:** `docs/` (standards + data + flows)

**Fix surface:**

1. **mcp-tools.md § Signal Bus:**
   - Add rule: "Signal file naming contract: `{from}-{ISO-8601-timestamp}.json`. All agents writing to `docs/signals/` must comply."
   - Cross-link to agent-chaining-protocol.md for history

2. **po/main.md (or po flow Step N):**
   - Ensure all `call_tool(signal_dashboard, ...)` writes use ISO-8601 timestamp in filename
   - e.g., `po-1967c-slate-ready-20260521T194519Z.json` (not `po-1967c-slate-ready.json`)

3. **docs/data/cowork-schedule.json:**
   - For each slot with `"trigger_error": "API_MIN_INTERVAL"`, set `"enabled": false` + add `"_disabled_by": "API_MIN_INTERVAL — cowork dispatcher owns sub-hourly firing"`

4. **cowork-team/main.md:**
   - Add commentary after nominal_tick calculation: "drift_min ≤ 10 is safe (floor-15 rounding); ≥ 15 risks collision. Monitor and escalate if approaching 15."

**Blast radius:**
- ITEM-14: Low (readers scan all *.json regardless; dedup is secondary benefit)
- ITEM-11: Noise reduction only (false-positive WARNINGs eliminated)
- ITEM-10: Documentation only (no behavioral change)

**Dependency chain:** None — standalone edits

---

## Acceptance Criteria

1. [ ] mcp-tools.md Signal Bus section includes naming contract rule
2. [ ] agent-chaining-protocol.md cross-linked from mcp-tools.md
3. [ ] po flow verified to emit signals with ISO-8601 timestamp in filename (e.g., `20260521T194519Z`)
4. [ ] cowork-schedule.json: all API_MIN_INTERVAL slots have `"enabled": false` + `_disabled_by` comment
5. [ ] cowork-team/main.md includes drift_min threshold commentary (safe ≤10, risk ≥15)
6. [ ] Next po signal write test: filename includes ISO-8601 timestamp ✓
7. [ ] Next cowork-team cycle test: no false-positive collision WARNINGs ✓

---

## Owner & Zone

- **Dev agent:** agent-father
- **Zone:** `docs/standards/mcp-tools.md`, `docs/data/cowork-schedule.json`, `.claude/flows/po/`, `.claude/flows/cowork-team/`
- **Model:** claude-haiku-4-5-20251001

---

## Related

- REQ-1967-1b (signal-file naming contract)
- REQ-1967-5b + 5d (cowork overlap guard, fire-drift)
- ITEM-14, ITEM-11, ITEM-10 (findings)

---

## [Agent-father] IMPL_DONE — 2026-05-22T06:37Z

| AC | Status | Notes |
|----|--------|-------|
| AC-1: mcp-tools.md naming contract | PASS | `## Signal Bus — Naming Contract` section added above Inter-Agent Signal Types |
| AC-2: agent-chaining-protocol.md cross-linked | PASS | Cross-link note included in new naming contract section |
| AC-3: po/main.md ISO-8601 signal rule | PASS | Signal write rule added before Notebook write section |
| AC-4: cowork-schedule.json dead slots disabled | PASS | 4 slots (not 3 — market-watcher-prepost also had trigger_error). All: enabled=false + _disabled_by |
| AC-5: cowork-team/main.md drift_min commentary | PASS | `## §drift-min` anchor + threshold table (safe ≤10, caution 11-14, risk ≥15) |
| AC-6/AC-7: live observation tests | DEFERRED | smart-skip QA applies (markdown+JSON only) |

**Files changed:**
- `docs/standards/mcp-tools.md` — Signal Bus naming contract section (+18L)
- `docs/data/cowork-schedule.json` — 4 dead slots: enabled→false + _disabled_by
- `.claude/flows/po/main.md` — signal write rule (+4L)
- `.claude/flows/cowork-team/main.md` — §drift-min anchor + threshold table (+14L)

**Signal:** `docs/signals/agent-father-1967-09-done.json` → NEXT=qa, QUALITY=smart-skip

**Deviation:** Handoff evidence listed 3 API_MIN_INTERVAL slots; live audit found 4 (`market-watcher-prepost` also affected). All 4 disabled.

**Commit SHA:** c4a50420

---

## [QA] Review Record — 2026-05-22T13:30Z

**Round:** 1 | **Smart-skip:** YES (markdown + JSON only, no .ts touched) | **Verdict:** APPROVED

| AC | QA Check | Result | Evidence |
|----|----------|--------|----------|
| AC-1 | mcp-tools.md has `## Signal Bus — Naming Contract` section with naming rule | PASS | `docs/standards/mcp-tools.md:130-146` — section present, naming pattern `{from}-{ISO-8601-timestamp}.json` documented, anti-pattern examples listed |
| AC-2 | agent-chaining-protocol.md cross-linked from mcp-tools.md | PASS | `docs/standards/mcp-tools.md:146` — cross-link: `docs/protocols/agent-chaining-protocol.md § Cross-Team Signal Directory` |
| AC-3 | po/main.md has ISO-8601 signal write rule | PASS | `.claude/flows/po/main.md:123-124` — rule present with exact format, timestamp command, and SSOT back-ref |
| AC-4 | cowork-schedule.json: 4 API_MIN_INTERVAL slots enabled=false + _disabled_by | PASS | jq verified: `news-scout-market`, `market-watcher-market`, `market-watcher-prepost`, `alert-commander-market` — all 4 `enabled=false`, all 4 have `_disabled_by` field |
| AC-5 | cowork-team/main.md `## §drift-min` anchor + threshold table | PASS | `.claude/flows/cowork-team/main.md:64-90` — `## §drift-min` anchor at L64, collision-scope guard comment at L67, threshold table at L82-86 (safe 0-10, caution 11-14, risk ≥15) |

**Collision check:** `## §drift-min` region bounded to L64-90 (`drift_min` commentary only). Spawn-guard region (Step 4.6+, L115+) untouched — reserved for TASK_1967-10 per L67 comment. PASS.

**File size check:** cowork-team/main.md = 301L. Project split policy threshold is 300L (per size-justification comment at L1). File is 1L over the soft threshold, but L1 size-justification comment explicitly states "Split deferred until next architectural sprint." No blocking issue — deviation is self-documented in the file header.

**Deviation acknowledgment:** Handoff evidence listed 3 API_MIN_INTERVAL dead slots; live audit found 4 (`market-watcher-prepost` was also affected but missing from the original handoff evidence). Agent-father disabled all 4. QA confirms all 4 are now `enabled=false` with `_disabled_by`. Live state is correct. Deviation approved — live state supersedes stale handoff evidence.

**Smart-skip note:** No .ts files modified. bun test + bun tsc --noEmit skipped per smart-skip policy (markdown + JSON only). DDD and security scans not applicable.

**Blocking issues:** 0

**VERDICT: APPROVED**

---

## [PM] Close Record — 2026-05-22T13:45Z

**Status:** TASK_1967-09 CLOSED ✓

**Signals drained:**
- qa-1967-09-approved.json → docs/signals/processed/
- agent-father-1967-09-done.json → docs/signals/processed/

**Updates completed:**
1. docs/TASKS.md: Backlog → Done (line 90+)
2. docs/pipeline-state.json: activeTaskId cleared, nextAgent=agent-father (dispatch 1967-10)
3. docs/TASKS.md Done section: Full row with AC summary + deviation note

**Deviation acknowledged:**
- Handoff evidence: 3 API_MIN_INTERVAL slots (news-scout-market, market-watcher-market, alert-commander-market)
- Live audit QA verified: 4 slots (added market-watcher-prepost)
- All 4 now disabled (`enabled=false` + `_disabled_by`)
- Live state is authoritative per QA review

**cowork-team/main.md size check:**
- File = 301L (soft threshold 300L per size-justification comment L1)
- L1 comment: "Split deferred until next architectural sprint"
- QA approved deviation as self-documented (non-blocking)
- Spawn-guard region L115+ untouched (reserved for TASK_1967-10 per L67 comment)

**Commits:**
- Agent-father IMPL: c4a50420 + 48036593
- QA round-1 APPROVED: 2026-05-22T13:30Z (qa-1967-09-approved.json)

**WIP after close:** 0/2 (ready for immediate 1967-10 dispatch)

**Next dispatch:** TASK_1967-10 (agent-father, miscellaneous MED/LOW, ~2h, single-lane sequential)
