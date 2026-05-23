---
decision_id: p2-c1-g9-playwright-trust-contract
pilot: macro-indicators
cycle: c282-cycle-51 (PO leg, post-PM-dispatch)
date: 2026-05-23T15:05:01Z
decision_type: playwright_headless_verification
path: Path B (PO Playwright short-circuit — no synchronous user wait, L6 lesson)
verdict: NO
g9_ready_for_flip: false
gap_blocking_flip: dashboard-data-out-of-sync
remediation_task_suggested: P2-X4 (dashboard data refresh — embed P2-X1 5 new primitives + P2-X2 module expansion into PRIMITIVES_DATA/MODULE_DATA inline JSON)
charter_ref: docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G9
handoff_ref: docs/handoffs/TASK_P2-C1-macro.md
dispatch_signal: docs/signals/pm-cycle51-dispatch-po-p2-c1-20260523T164802Z.json
precondition_signal: docs/signals/qa-p2-f1-macro-GREEN-20260523T164502Z.json (G8 honest-red FLIPPED YES)
ta_precedent: docs/po-decisions/2026-05-23-g9-user-confirmation.md (Path A author + Path B short-circuit precedent established cycle-19)
anchor: 1776df8e (held pre+post)
---

# P2-C1 — G9 Dashboard Trust Contract via Playwright (Path B)

## Trust contract statement

I, the Product Owner, **CANNOT yet** declare the macro-indicators dashboard fully trustworthy as the G9 trust contract — because while the dashboard executes cleanly with zero errors and honest NOT-RUN status, it currently renders **only 1 of the 6 primitives the microservice has shipped**. The 5 primitives added by P2-X1 (oil/gold/usdvnd/carry/yield) and the module expansion delivered by P2-X2 are not visible on the dashboard. A user opening the dashboard today would see a partial picture of the service and reasonably ask "where are the other 5 primitives?" — that question alone disqualifies G9 PASS under charter §G9 Path B ("all primitives + module + microservice cards rendered").

I declare PARTIAL trust now and set `g9_ready_for_flip = false`. A small follow-on task (P2-X4 below) will flip this to YES without re-running the full G9 ceremony.

## Why I can declare PARTIAL trust now (and what's solid)

1. **G8 honest-red contract holds — proven cycle-51** (`docs/signals/pm-cycle51-p2-f1-closed-g8-FLIPPED-20260523T164802Z.json`, QA green `docs/signals/qa-p2-f1-macro-GREEN-20260523T164502Z.json`). Corruption → RED + restore → GREEN demonstrated on real primitives; the dashboard's red/green semantics are honest. That is the precondition for trusting any G9 verdict at all.

2. **Sandbox baseline 20/20 GREEN — independently verified this cycle**.
   - Command: `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all`
   - Exit: 0
   - Final line: `total=20 pass=20 fail=0 status=OK`
   - Captured: `/tmp/sandbox-baseline.json`

3. **Playwright headless verification — clean on every safety dimension**.
   - Tool: Playwright 1.60.0 + chromium 1223 (headless, file:// protocol)
   - Script: `/tmp/verify-macro-dashboard.mjs` (self-contained ESM, ~110 lines)
   - URL: `file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators/dashboard/index.html`
   - Page title: `macro-indicators — Scenario Trust Dashboard`
   - Screenshot: `/tmp/macro-dashboard-green-20260523T150356Z.png` (1280×1831, full page)
   - **console errors: 0**
   - **pageerror events: 0**
   - **requestfailed events: 0** (file:// protocol, zero network)
   - **dot-red count: 0** (no false reds)
   - **dot-green count: 0** (no false greens — by design, dashboard is static NOT-RUN until user pastes sandbox output)
   - **dot-pending count: 6** (honest NOT-RUN dots, P1-E1 design intent)
   - **not-run-badge count: 1** (microservice panel honestly labeled NOT-RUN)
   - All 3 panel containers present: `#primitives-panel` `#module-panel` `#microservice-panel` (panel skeleton 100% rendered)

## Why I CANNOT declare full YES (the gap)

The dashboard's inline `PRIMITIVES_DATA` array (defined in `apps/macro-indicators/dashboard/index.html` line 928) contains scenarios for **only one primitive: `macro_investment_clock`** (3 scenarios — golden / edge / failure). It was authored at P1-E1 (single primitive), and the data block was never refreshed when P2-X1 added 5 more primitives (oil/gold/usdvnd/carry/yield, each with 3 scenarios = 15 additional fixtures in `docs/scenarios/macro-indicators/primitives/`).

Playwright observation:
- `primitive_groups_rendered: 1`
- `primitive_group_labels: ["macro_investment_clock — Investment Clock Classifier NOT-RUN"]`
- `expected_primitives_matched: 1` of 6 expected (handoff AC-3 spec)

Charter §G9 Path B verbatim: "all primitives + module + microservice cards rendered, NOT-RUN status honestly displayed". Cards must be **rendered**. 1 of 6 ≠ all.

This is not a dashboard bug and not a backend bug — it is a missing **data-refresh task** that should have been queued when P2-X1 / P2-X2 expanded the surface. No prior Phase 2 task owned it (verified against `phase2.tasks` keys in pilot SSOT: A1/A2/B1/B2/B3/X1/X2/X3/G1/F1/C1 — no `X4` or dashboard-data task exists).

## Recommended remediation: P2-X4 (dashboard data refresh)

**Task scope (~30 min for dev-macro-indicators):**

1. Read all 15 new primitive scenario JSON files under `docs/scenarios/macro-indicators/primitives/macro-{oil-impact-classifier,gold-direction-classifier,usdvnd-direction-classifier,carry-trade-signal,yield-spread-signal}-{golden,edge,failure}.json`.
2. Append corresponding objects (same shape as the existing `macro_investment_clock` entries) into `PRIMITIVES_DATA` in `apps/macro-indicators/dashboard/index.html` (inline script, line ~928).
3. Read the additional module scenarios (if any beyond `macro-signals-golden.json` and `macro-signals-edge.json`) and append to `MODULE_DATA`.
4. Populate the `#microservice-panel` body (currently `<p>Loading…</p>`) with a single microservice card showing `macro-indicators` HTTP service status NOT-RUN — mirroring the TA pattern.
5. Re-open dashboard, verify 6 primitive-group headers + 18 scenario-card buttons (6×3) render.
6. Sandbox stays 20/20 (no backend touch). R-1 grep still exits 1 (deterministic).
7. No mutations to `pkg/`, `cmd/`, `.golangci.yml`, scenario JSON files, or `_deprecated/`.
8. Re-run **this exact same Playwright recipe** (see below). On clean re-verify, PO flips G9 → YES atomically (no further ceremony needed).

**Why this is small:** the data is already in the repo (P2-X1 wrote the JSON files); we're only mirroring it into the dashboard's inline data block so the static file:// asset reflects current backend surface. Zero new logic, zero new tests.

## Future PO trust-verification recipe (re-usable, copy-paste)

```bash
# 1. Anchor + activeTask + G8 precondition guard
git merge-base --is-ancestor 1776df8e HEAD && echo "anchor=OK"
grep '"activeTask"' docs/data/pilot-status-macro-indicators.json
grep -A2 '"G8"' docs/data/pilot-status-macro-indicators.json | head -3

# 2. Sandbox baseline (must end with total=20 pass=20 fail=0 status=OK)
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
cd -

# 3. Playwright headless (Path B — PO drives, no user wait)
#    Requires: Playwright 1.60+ installed at /tmp/macro-g9-verify/ (npm install playwright@1.60.0)
#    Or any equivalent path; update the import line in the script if needed.
node /tmp/verify-macro-dashboard.mjs > /tmp/macro-dashboard-result.json
# Exit 0 + verdict=PASS in the JSON => G9 ready_for_flip=true
```

**Acceptance thresholds (Path B, charter §G9):**
- console_errors = 0
- page_errors = 0
- request_failed = 0
- dot-red = 0 (no false reds)
- dot-green = 0 OR all-explained (static NOT-RUN by design unless user has pasted sandbox results)
- panels: primitives-panel + module-panel + microservice-panel all present
- primitive_groups_rendered ≥ 6 (one per shipped primitive)
- microservice panel body NOT "Loading…" placeholder

## Path B rationale (no user async-wait per L6 lesson)

Cycle 15-18 of the TA pilot were burned waiting on a synchronous user "YES, I trust the RSI dashboard". L6 was burned in: PO drives Playwright headless verification themselves; verdict carries equal weight to user verbal per cycle-19 precedent (`docs/po-decisions/2026-05-23-g9-user-confirmation.md`). This decision honors that lesson — I did NOT ask the user to open the dashboard. I drove headless chromium myself. The verdict is mine to record.

The fact that I'm declaring NO does **not** mean Path B failed; Path B worked exactly as designed — it surfaced a real gap (1/6 primitives rendered) in seconds, with zero user interruption, on a critical-path goal. That is the L6 lesson paying dividends.

## Out of scope (explicit non-actions this cycle)

- No production deploy (this is offline verification only).
- No live data (file:// protocol, embedded fixtures only).
- No mutations to `apps/macro-indicators/pkg/`, `cmd/`, `dashboard/index.html`, or any scenario JSON.
- No `decisionMatrix` writes (Charter §4.5 — PO populates only after 12/12 terminal in atomic commit; this cycle does not earn that authority).
- No flip of G9 to YES (waiting on P2-X4 remediation per above).
- No screenshot committed into the repo (kept at `/tmp/macro-dashboard-green-20260523T150356Z.png` per Hard Gates: "NO commits of /tmp screenshots into repo").
- No Playwright test files committed into `apps/macro-indicators/` (per charter §Anti-Scope-Creep + handoff out-of-scope clause; script kept at `/tmp/verify-macro-dashboard.mjs`).

## Constraints held

- L84 explicit-file staging (2 files: this decision doc + one signal — no `-A`, no `.`).
- No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push`.
- Anchor `1776df8e` held pre+post (exit 0 both checks).
- `apps/macro-indicators/` and `docs/scenarios/macro-indicators/` untouched (verified `git status -s` clean on those paths post-commit).
- Charter §4.5 decisionMatrix UNTOUCHED (G9 status field stays TBD; PM flips on cycle-52 ONLY after P2-X4 ships AND PO re-runs this recipe with PASS).
- No work on `apps/technical-analysis` (TA pilot CLOSED DORMANT; ignored any stale TA dispatch reminders).
- One active dispatch per task (no shadow signals).

## Next agent + recommended action

**Next agent: pm (cycle-52)** with the following recommended dispatch:

1. Close P2-C1 as VERDICT=NO with `g9_ready_for_flip=false` (do NOT flip G9; do NOT trigger 7/12 yet).
2. Author handoff `docs/handoffs/TASK_P2-X4-macro.md` for dashboard data refresh (~30 min, AC-1..AC-5 above).
3. Dispatch P2-X4 to `dev-macro-indicators` with WIP=1.
4. On dev DONE + QA GREEN, re-dispatch P2-C1 (re-verify only, no new decision doc — append to this same doc) for the final PO Playwright re-run.
5. On PASS, PO atomically flips G9 → YES + advances goals-earned 6 → 7.

**Alternative (PM judgment call):** if PM disagrees with the gap interpretation and reads charter §G9 more loosely ("dashboard cards render = panels render"), PM may unilaterally flip G9 → YES and document the looser reading. I document my verdict as NO precisely so PM has the audit trail to make that judgment with full evidence.

---

## Rerun (cycle-53, after P2-X4 dashboard data refresh)

**Trigger:** PM cycle-53 commit `85bb1cce` re-dispatched P2-C1 to po after dev P2-X4 (`535e7bdc`) + qa P2-X4 GREEN (`442cf944`) resolved the dashboard data gap that caused the first-run NO.

**What changed since first run:**
- PRIMITIVES_DATA extended 3 → 18 entries (all 6 primitives × 3 scenarios each).
- MODULE_DATA wired to `macro_signals` module with golden + edge scenarios (BuildMacroSignals shape, 6 primitives per scenario).
- Microservice panel "Loading…" placeholder replaced with NOT-RUN service card (Level-3 badge, port 5004, 4 HTTP endpoints `/health` `/macro/snapshot` `/macro/carry-trade` `/macro/calendar`, DDD layer tree, P1-E2 edit-rerun instructions).

**Recipe used:** Identical to first run (Path B, Playwright 1.60.0 + chromium-headless-shell 1223 at `/tmp/macro-g9-verify/node_modules/playwright`, browser cache at `~/Library/Caches/ms-playwright`). Script `/tmp/verify-macro-dashboard-rerun.mjs` is a strict expansion of first-run `/tmp/verify-macro-dashboard.mjs` (settle bumped to 1800ms per handoff; new selectors for module-card top-level count + microservice card / port / DDD / endpoints; verdict logic tightened to charter §G9 L230 verbatim). Path B was used at first run; reused here.

**Measurements (this run):**
- console errors: 0
- pageerrors: 0
- requestfailed: 0
- primitive group headers rendered: 6 (expected 6) — investment_clock, oil_impact, gold_direction, usdvnd_direction, carry_trade, yield_spread
- primitive scenario cards rendered: 18 (expected 18) — 3 per group × 6
- module cards rendered: 2 (expected 1 logical module `macro_signals` with 2 scenario subcards golden+edge — dashboard renders one `.module-card` div per scenario subcard, both for the same `macro_signals` module; distinct module names = 1, scenario subcards = 2, AC met)
- module scenario subcards rendered: 2 (golden `macro-signals-golden.json` + edge `macro-signals-edge.json`, each carrying all 6 primitive tags)
- microservice cards rendered: 1 (NOT-RUN, port 5004, 4 endpoints, DDD layer tree visible; placeholder "Loading…" absent)
- card dot status distribution: NOT-RUN (dot-pending)=21 | GREEN=0 | RED=0
- not-run-badge count: 1 (microservice panel honestly labeled NOT-RUN)
- Screenshot: `/tmp/macro-g9-verify/p2-c1-rerun.png` (1280×~1830, full page, 3 panels + endpoint table + DDD tree visible)
- Sandbox precondition: still 20/20 GREEN per QA P2-X4 GREEN signal `docs/signals/qa-p2-x4-macro-GREEN-20260523T172900Z.json` (no PO re-run needed; QA proved cycle-53)

**Charter §G9 acceptance (L230 verbatim):** "ZERO console errors, ZERO pageerrors, ZERO requestfailed, all primitives + module + microservice cards rendered, NOT-RUN status honestly displayed"

Clause-by-clause:
- "ZERO console errors" → 0. PASS.
- "ZERO pageerrors" → 0. PASS.
- "ZERO requestfailed" → 0 (file:// protocol, no network). PASS.
- "all primitives ... cards rendered" → 6/6 groups + 18/18 scenario cards. PASS.
- "all ... module ... cards rendered" → macro_signals module with 2 scenario subcards (golden + edge), both populated with 6 primitive tags + full BuildMacroSignals input/output. PASS.
- "all ... microservice cards rendered" → 1 microservice card (NOT-RUN, port 5004, 4 endpoints, DDD layer tree). Placeholder "Loading…" absent. PASS.
- "NOT-RUN status honestly displayed" → all 21 status dots are dot-pending (NOT-RUN); zero false greens, zero false reds; microservice panel summary chip = NOT-RUN. PASS.

All seven clauses satisfied.

**Verdict:** YES

**Rationale:** Every clause of charter §G9 L230 verbatim is satisfied by the post-P2-X4 dashboard build (commit `535e7bdc` rendered, no further mutations between dev DONE and PO rerun). The single gap that caused cycle-52 NO (PRIMITIVES_DATA 1/6 + microservice "Loading…" placeholder) is fully closed: 6/6 primitives + 18/18 scenarios + 1 macro_signals module (2 subcards) + 1 NOT-RUN microservice card now render with zero errors. The endpoint count (4 vs the "5" mentioned in the cycle-53 dispatch description) is not a charter §G9 acceptance clause — charter L230 requires the microservice card be "rendered" with "NOT-RUN status honestly displayed", both satisfied. PM dispatch text was descriptive, not normative.

**On YES:** PM cycle-54 will atomic-flip G9 = YES in `docs/data/pilot-status-macro-indicators.json` (6 → 7/12 goals earned). Anchor `1776df8e` held throughout (verified exit 0 both pre and post Playwright run; post-commit re-check below).

**On NO:** Not applicable (this run is YES).

**Audit trail preserved:** First-run NO section above (cycle-52 PO Playwright Path B) is intact and unmodified. Reader can trace the full arc: first run NO (1/6 primitives) → PM Path A close + P2-X4 dispatch → dev `535e7bdc` (data refresh) → qa `442cf944` (GREEN + G8 re-proven) → PM `85bb1cce` (close + rerun re-dispatch) → this PO rerun YES.
