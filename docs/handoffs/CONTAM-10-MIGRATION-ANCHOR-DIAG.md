---
sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
task_id: CONTAM-10-MIGRATION-ANCHOR-DIAG
branch: task/CONTAM-10-MIGRATION-ANCHOR-DIAG
size: S
zone: scripts/migrations/
depends_on: []
blocks: []
priority: low
optional: true
---

## TLDR

Add a diagnostic annotation to the repair script's per-ticker dry-run report: flag when the selected `anchor_close` row is itself a flat seed bar (O=H=L=C with volume>0). This is cosmetic only — the predicate is already safe by design, and flat seed bars ARE correct-scale anchors. The annotation prevents manual reviewers from being misled into thinking an organic trading day's close price is shown.

## [PM] Planning Context

- **Zone:** `scripts/migrations/` — repair tooling
- **Priority:** Low (cosmetic/diagnostic, no correctness impact)
- **Optional:** Yes — can be deferred if WRITER-H or EXEC-2 pressures mount
- **Acceptance Criteria:**
  - [ ] Dry-run output per ticker includes anchor_close value (already does)
  - [ ] When anchor_close row satisfies O=H=L=C predicate, append " (flat seed bar)" to the report line
  - [ ] Flat seed bar detection uses the same predicate: `open=high AND high=low AND low=close AND open>=1000 AND volume>0`
  - [ ] Live example: "VHM: 155 candidate rows, anchor_close=146000 (flat seed bar)" vs current "VHM: 155 candidate rows, anchor_close=146000"
  - [ ] Dry-run still passes with annotation added (no logic change, only cosmetic label)
  - [ ] Live repair run (CONTAM-10-EXEC-2) still produces same candidate count and corrections

- **Files to read first:**
  - `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts` (dry-run report output, likely lines ~200–250 for per-ticker summary)
  - `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md` §10 Round-2 (PO anchor-hazard investigation + predicate validation)

- **Files to modify:**
  - `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts` — add flat-seed-bar detection to the dry-run report

- **Files to create:** None

- **Dependencies:** None (can ship in parallel with CONTAM-10-WRITER-H; purely cosmetic)

- **Knowledge needed:**
  - Repair script structure (already understood from CONTAM-10 prior phases)
  - No new architecture or design concepts

## Implementation Notes

**Scope limit (from architect):** Annotation only — do NOT redesign the anchor selection predicate. The predicate `close>=1000 AND volume>0` is inherently robust to flat-bar hazards because it never has to decide "where clean data starts"; it only needs the row's *value* to be correct-scale (which flat seed bars are, per verified LIVE-PROBE from architect Round 2: VHM seed row anchor_close=146000 is numerically correct).

**Rationale:** A brand-new operator eyeballing the dry-run report might see "anchor_close=146000" and assume it's an organic trading day's price, when in fact it's a synthetic flat seed row (O=H=L=C). The annotation makes this explicit without changing any math.

**Design rationale from architect:** The seed bars (2026-04-30 / 2026-05-01 flat rows for VHM/VIC) have:
- `volume > 0` (not the `volume=0` FR-G3 signature of actual stubs)
- Correct scale (146000 VND for VHM is right)
- Both days identical (not noise)
- Used successfully as anchor references by the repair algorithm (verified live)

→ They ARE safe anchors; the annotation just makes it obvious to human reviewers.

---

## Success Criteria

- [ ] Dry-run report shows "flat seed bar" label where applicable
- [ ] Live repair run unchanged (same candidate count, same corrections)
- [ ] Commit message references this task (`CONTAM-10-MIGRATION-ANCHOR-DIAG`)
- [ ] Can defer if WRITER-H or EXEC-2 encounter blockers (low priority)
