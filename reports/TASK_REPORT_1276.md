## Task Report 1270/1276 (Re-review: macro cooldown block restore)

**Branch:** fix/usdvnd-alert-quality
**Merge commit:** b831258d
**Date:** 2026-04-25
**Reviewer:** QA

---

### Changed files (branch delta vs main)

| File | Lines | Change |
|------|-------|--------|
| `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` | 838-890 | Macro cooldown block restored: baseCooldownConfig/macroCooldownConfig split, isMacroAlert check, dynamic historyWindowHours, parameterized SQL |
| `apps/mcp-server/src/infrastructure/config.ts` | 206-224 | `macroCooldownMinutes: number` added to AlertQualityConfig interface + loader default 360 |
| `apps/mcp-server/src/__tests__/FIX-1270-usdvnd-alert-quality.test.ts` | new file | 7 AC tests for 50 VND guard + 6h macro cooldown |

**Pre-existing on main (not re-introduced by branch):**
- `apps/mcp-server/src/domain/services/macroThresholds.ts:139` — `minAbsDeviation = 50` (main commit 952e011c)
- `mcp.config.json:215` — `macroCooldownMinutes: 360` (main commit 952e011c)

---

### Tests

| Suite | Pass | Fail |
|-------|------|------|
| FIX-1270-usdvnd-alert-quality.test.ts | 7 | 0 |
| 106-intelligence-cycle.test.ts | 25 | 0 |
| Full regression | 6981 | 0 |

Baseline (main after 1269): 6970 pass. Delta: +11 (7 FIX-1270 + 4 FIX-1265 tests).

---

### TypeScript

0 errors. Pre-push hook confirmed clean.

---

### DDD compliance: PASS

- intelligenceCycleJob.ts (scheduler layer): dynamic import of alertCooldown (domain/services) — inward only.
- config.ts (infrastructure): no cross-layer imports.

---

### Security: PASS

- Bun.env used throughout config.ts. No process.env.
- SQL line 867: parameterized binding via `?` placeholder. No string interpolation of user input.

---

### Key findings

1. **macroThresholds.ts 50 VND guard** — Branch did not touch this file. Git 3-way merge preserved main's `50` value. Post-merge verified: line 139 = `50`. PASS.

2. **mcp.config.json macroCooldownMinutes** — Absent in branch and merge base; present on main. Preserved by merge. Post-merge verified: `"macroCooldownMinutes": 360`. PASS.

3. **historyWindowHours fix (core 1276 regression):** Line 857 computes `Math.ceil(360/60) + 1 = 7h` query window, covering the full 6h macro cooldown. Previous 2h window was shorter than the cooldown, causing MACRO alerts to always appear as "no recent history" and fire every 15-min cycle. FIXED.

4. **isMacroAlert routing:** Line 883 — `alert.actionCode === "MACRO"` correctly gates macroCooldownConfig vs baseCooldownConfig. PRESENT.

---

### verdict: APPROVED

Merged to main at b831258d. Branch fix/usdvnd-alert-quality deleted (local + remote).
