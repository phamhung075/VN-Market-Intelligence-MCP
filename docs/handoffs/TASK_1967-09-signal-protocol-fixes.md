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
