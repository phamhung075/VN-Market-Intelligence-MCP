---
task_id: P2-KD-J
title: "G6 Finalization — Dashboard Contract-Linking + nuclear-hexagram-computer 5th Primitive"
owner: dev-kinh-dich
phase: 2
goal_advanced: ["G6", "G1"]
date_created: 2026-05-24
blocked_by: P2-KD-I
blocks: P2-KD-K
est_hours: 2.0
ac_count: 7
---

# TASK_P2-KD-J: G6 Finalization — Dashboard Contract-Linking + nuclear-hexagram-computer 5th Primitive

**Owner:** dev-kinh-dich  
**Blocked by:** P2-KD-I DONE (composition root and OpenAPI in place — microservice panel can show real endpoint facts)  
**Blocks:** P2-KD-K  
**Est:** 2h  
**ACs:** 7

---

## Background

kinh-dich ALREADY has a working dashboard from Phase-1 (6/6 cards, DASHBOARD-LIVE in SI-2 era).
Phase-2 G6 is **FINALIZATION**, not genesis. Finalization adds:

1. The **5th primitive card** (`nuclear-hexagram-computer` — deferred from Phase-1 per plan OQ-1)
2. **Link to OpenAPI contract** in the microservice panel (created in P2-KD-I)
3. A **"Deprecated" notice section** listing `src/_deprecated/services_v1.ts` (trust-layer visibility of G5a)
4. **Update microservice panel port facts** to cite `openapi.yaml` (not hardcoded)

The `nuclear-hexagram-computer` primitive computes nuclear (hộ quẻ) and transformed (biến quẻ) hexagram numbers from signals + HaoReading data. Maps to `computeHoQue()` + `computeBienQue()` (L283-L295 in legacy domain/services.ts).

**SI-2 boundary reminder:** kinh-dich MUST NOT create or modify `docs/dashboards/index.html` (stock-price's G6 deliverable). kinh-dich G6 = `apps/kinh-dich-service/dashboard/index.html` only.

---

## Files to Touch

- `apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/index.ts` (CREATE — 5th primitive)
- `apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-failure.json` (CREATE)
- `apps/kinh-dich-service/dashboard/index.html` (MODIFY — finalization: add 5th primitive card, link OpenAPI contract, add G5a deprecated note, update microservice panel endpoint facts)

---

## Acceptance Criteria

### AC-1 — 5th Primitive Exists and Is Fence-A Clean

```bash
test -f apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/index.ts && echo FOUND
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/
```

**Verdict:** First echoes **FOUND**. Second returns **0** (Fence-A clean; cross-primitive imports to `hexagram-resolver` and `hao-encoder` are exempt from Fence-A).

**Primitive spec:**
```typescript
// src/primitive/nuclear-hexagram-computer/index.ts
import { resolveHexagram } from '../hexagram-resolver/index.js'; // cross-primitive OK — not fenced
import type { HaoReading } from '../hao-encoder/index.js';

export function computeHoQue(signals: number[]): number;
export function computeBienQue(haos: HaoReading[]): number;
```

**Evidence:** Paste grep outputs showing zero application/interface/infrastructure imports.

---

### AC-2 — ESLint Fence Still Clean

```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

**Verdict:** Exits **0** (cross-primitive import does not trigger Fence-A — `boundaries/ignore` or Fence-A only disallows module/application/interface/infrastructure layers, not other primitives).

**Evidence:** Paste ESLint exit code and summary.

---

### AC-3 — 3 Scenario JSONs Present

```bash
ls docs/scenarios/kinh-dich/primitives/ | grep nuclear
```

**Verdict:** Must return **3 files:**
- `nuclear-hexagram-computer-golden.json`
- `nuclear-hexagram-computer-edge.json`
- `nuclear-hexagram-computer-failure.json`

**Scenario structure (each JSON):**
```json
{
  "primitive": "nuclear-hexagram-computer",
  "scenario": "golden|edge|failure",
  "inputs": { "signals": [...], "haos": [...] },
  "expectedOutputs": { "hoQue": N, "bienQue": N }
}
```

**Evidence:** Paste file listing and sample from one scenario (first 10 lines).

---

### AC-4 — Dashboard Finalized (G6)

```bash
grep -c "nuclear-hexagram-computer\|_deprecated\|openapi\|Deprecated" \
  apps/kinh-dich-service/dashboard/index.html
```

**Verdict:** Must return **≥3** (5th primitive card + deprecated notice + OpenAPI link are all present in the HTML).

**Dashboard updates required:**
- **5th primitive card:** HTML section rendering nuclear-hexagram-computer with golden scenario data
- **Deprecated notice:** Section explaining `src/_deprecated/services_v1.ts` moved from legacy domain (trust-layer visibility)
- **OpenAPI link:** Microservice panel links to `src/interface/openapi.yaml` (not hardcoded endpoint facts)
- **Panel label update:** Change "4 pure TypeScript functions" → "5 pure TypeScript functions" to reflect new primitive

**Evidence:** Paste grep output. Screenshot or HTML excerpt showing the 3+ sections present.

---

### AC-5 — SI-2 Boundary Held

```bash
git diff --name-only HEAD | grep "docs/dashboards/index.html"
```

**Verdict:** Must return **empty** (kinh-dich did not touch the fleet index).

**Evidence:** Paste git diff output confirming zero touch to SI-2 files.

---

### AC-6 — G12 DoD Gate (Expanded Baseline)

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

**Verdict:** Exits **0** with **≥17 scenarios PASS** (14 Phase-1 baseline + 3 new nuclear-hexagram-computer scenarios).

**Expected:** All primitives + module + new 5th primitive scenarios run green.

**Evidence:** Paste full sandbox output summary showing 17/17 or higher PASS count.

---

### AC-7 — Dashboard Opens file:// with Zero Network Calls

**Manual verification (honest self-check — not scripted):**

Open `apps/kinh-dich-service/dashboard/index.html` via `file://` (double-click in Finder or `open` command):

```bash
open "apps/kinh-dich-service/dashboard/index.html"
```

**Verify:**
- All 5 primitive cards render with data
- Module (reading_composer) card renders
- Microservice card renders with OpenAPI reference
- Deprecated notice visible (trust signal)
- **ZERO external CDN requests** (no fetch to unpkg, cdnjs, etc.)
- **ZERO HTTP fetch to port 5005** or any endpoint

Check browser DevTools Console (Cmd+Option+I on macOS) for any network requests or errors.

**Verdict:** ZERO fetch calls; all HTML/CSS/JS bundled locally.

**Evidence:** Screenshot of browser DevTools Network tab showing no outbound requests OR open command confirmation + manual inspection checklist.

---

## Commit Subject

```
feat(kinh-dich): P2-KD-J — nuclear-hexagram-computer primitive + dashboard G6 finalization (G6 + G1 5th prim)
```

---

## G-Goal Posture

**NO goal flips.** § 4.5 SSOT untouched. G6 advances but does NOT flip to YES until Phase-3 terminal close (12/12 atomic decision matrix population by PO).

---

## Notes

- **Phase-2 §4.5 binding rule:** Never flip `decisionMatrix.{speed,trust,scale}` or `goalsEarned`. All 12 goal flips happen atomically in Phase-3 close by PO only.
- **Cross-primitive imports:** Fence-A does NOT fence cross-primitive imports. `computeHoQue()` and `computeBienQue()` may safely import `hexagram-resolver` and `hao-encoder`.
- **Dashboard file://:// opens:** All scenario data MUST be embedded in the HTML or referenced via relative `file://` JSON paths — ZERO network calls.
- **SI-2 ownership:** Confirm zero modifications to `docs/dashboards/index.html` — that is stock-price's G6 deliverable only.
- **G1 5th primitive:** Adding the 5th primitive (`nuclear-hexagram-computer`) with 3 scenarios advances G1 from 4/5 to 5/5 primitives. G1 flip happens at Phase-3 terminal close only.
