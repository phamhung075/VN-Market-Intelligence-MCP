# Sprint Goal

## Sprint 1293 — Alert Signal Payload Schema Hardening (Signal Quality Fix) — IN PLANNING

**Goal:** Restore high-confidence opportunity alerts by adding required numeric verification fields to chain_catalyst and price_confirmation payloads. Enable Alert Commander to verify 4-AND watchlist-opportunity criteria.

**Scope — Analysis:**
- **Root cause:** News Scout (01) and Market Watcher (04) emit chain_catalyst/price_confirmation signals without numeric fields (newsSentiment -1..1, kinhDichConfidence 0-100, agentSignalsMajority BUY/SELL/NEUTRAL)
- **Impact:** 5 high-conviction bullish signals (VIC 9.5, NVL 8, BSR 7.5 impact, 75-95% confidence) suppressed on 2026-04-23 02:36 UTC cycle because Alert Commander lacked structured verification fields
- **User impact:** Valid 4-AND opportunities not reaching market channel; users miss actionable insights despite strong analysis

**Solution:**
- Update `chain_catalyst` and `price_confirmation` signal type definitions to include required numeric fields
- Modify News Scout `send_signal()` calls to populate newsSentiment, kinhDichConfidence, agentSignalsMajority
- Modify Market Watcher `send_signal()` calls to populate same fields from price validation data
- Add validation gate: signals without all 4 fields rejected pre-send with logging

**Acceptance Criteria (AC):**
- AC-1: chain_catalyst payloads include newsSentiment, kinhDichConfidence, agentSignalsMajority fields
- AC-2: price_confirmation payloads include same 4 fields with correct numeric types
- AC-3: Alert Commander 4-AND verification uses all 4 fields (not parsed from narrative)
- AC-4: Test suite validates payload completeness (RED test covering the 2026-04-23 02:36 suppression case)
- AC-5: All 6325 tests passing, no regressions
- AC-6: Same VIC/NVL/BSR signals with complete payloads now fire 4-AND alerts correctly

**Size:** M (affects 2 analysis agents + signal schema + Alert Commander parser, requires full BA→Arch→PM pipeline)

**Priority:** HIGH (blocks alert quality, user confidence in signal analysis)

**Status:** AUTO-INITIATED (2026-04-23 05:45 UTC) — awaiting BA requirement spec

---

> Completed sprints (208–230, 239–240, 1276) archived → `docs/archive/SPRINT_GOAL_ARCHIVE.md`. This file = active goals only.
