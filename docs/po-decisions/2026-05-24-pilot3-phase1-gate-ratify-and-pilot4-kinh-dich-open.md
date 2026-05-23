---
title: "stock-price (pilot-3) Phase-0→Phase-1 gate RATIFIED + kinh-dich (pilot-4) WIP-2 slot OPENED"
date: "2026-05-24"
author: "po"
status: "DECIDED"
program: "fleet-factory-rollout"
decisions:
  - "Decision 1 — Ratify stock-price Phase-0→Phase-1 gate (architect GATE-PASS confirmed)"
  - "Decision 2 — OPEN kinh-dich pilot-4 in the WIP=2 second slot (both gate conditions met)"
parent_ratification: "docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md"
stock_price_charter: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md"
stock_price_ssot: "docs/data/pilot-status-stock-price.json"
phase1_task_plan: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md"
gate_pass_signal: "docs/signals/architect-p0-exit-gate-stock-price-20260523T223331Z.json"
si3_design: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc"
---

# stock-price Phase-1 Gate Ratification + kinh-dich Pilot-4 Open

Two linked rulings for the microservice factory fleet. Decision 1 ratifies the
technical gate the architect has already verified; Decision 2 exercises the
WIP=2 second slot the moment both of its preconditions are satisfied. **No user
approval required** (full autonomy; user set the fleet factory + per-service
dashboard as a program-level goal).

All facts verified against the SSOT and git this cycle:
- HEAD = `208935c1` (matches the gate signal's referenced commit).
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` — confirmed ancestor of
  HEAD (`git merge-base --is-ancestor … HEAD` exit 0), **zero tags** point at it
  (`git tag --points-at … | wc -l` = 0). Freeze discipline intact.
- kinh-dich service facts via jq on `docs/data/system-map.json`: port **5005**
  (internal == external 5005), zone `apps/kinh-dich-service`, language `ts`,
  runtime `bun`. Never hardcoded.
- No `docs/data/pilot-status-kinh-dich.json` yet, no
  `docs/architecture-briefs/2026-05-23-kinh-dich-factory/` dir yet — correctly
  absent; the architect/charter step creates them (NOT this decision cycle).

---

## Decision 1 — stock-price Phase-0 → Phase-1 gate: **RATIFIED (gate OPEN)**

The architect emitted GATE-PASS
(`docs/signals/architect-p0-exit-gate-stock-price-20260523T223331Z.json`,
`overall_verdict: GATE-PASS`, `ready_for_po_review: true`,
`anchor_frozen: true`). PO holds gate-open authority and ratifies independently.

### Independent ratification checklist (PO)

| Check | Source | Result |
|---|---|---|
| All 6 Phase-0 deliverables PASS | gate signal `deliverable_verdicts` (P0-SP-1…6) | **PASS** — all 6 verdict=PASS, ac_gaps=None on the five hard items; P0-SP-5 AC-5 by-design deferral to P1-B1 |
| Anchor SHA recorded in SSOT | `pilot-status-stock-price.json.anchor` | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` — 40-hex, valid |
| Anchor is ancestor of HEAD | `git merge-base --is-ancestor` | exit 0 (confirmed) |
| Anchor frozen (no tags / no rewrite) | `git tag --points-at` = 0; gate signal `freeze_discipline_check` | **frozen** |
| SSOT phase advanced | `pilot-status-stock-price.json` | phase=`1`, phase0.status=`CLOSED`, phase0.closedBy=`pm`, closedAt=`2026-05-24T00:00:00Z` |
| decisionMatrix present-but-empty | SSOT `decisionMatrix` + gate signal `ssot_invariants` | all TBD, charter §4.5 compliant (populates ONLY at 12/12 terminal) |
| No code in fences yet | gate signal `no_code_in_pkg_yet` | pkg/primitive=false, pkg/module=false (Phase 1 creates them) |
| R-CGO confirmed feasible at Phase 0 | P0-SP-5 `r_cgo_verdict=CLEAR` + brownfield FEASIBLE | CGO confined to `pkg/infrastructure/fetchers.go`; sandbox builds CGO_ENABLED=0 |

**Ruling: the stock-price Phase-0 → Phase-1 gate is RATIFIED and OPEN.**

### Phase 1 authorization (binding)

- **Phase 1 is authorized to begin**, per
  `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md`
  (9 tasks P1-A…P1-G, 55 ACs).
- **WIP=1 sequential** throughout (charter `wip_limit`, task-plan §WIP Policy).
  PM dispatches ONE task at a time; next task only after current DONE signal.
- **Execution starts at P1-A** (`cmd/sandbox/main.go` — CGO_ENABLED=0 sandbox
  runner; AC-5 hard gate: `CGO_ENABLED=0 go build … ./cmd/sandbox` exit 0 before
  P1-B1 dispatched) **→ then P1-B1** (first primitive `price-quote-normalizer`
  + the **R-CGO gate**).
- **R-CGO hard-blocker in P1-B1 (AC-8) acknowledged:** if AC-5/AC-6/AC-7 do not
  all pass, R-CGO is BLOCKED — Phase 1 stops at P1-B1 and PM escalates to
  architect before any further primitive extraction. This is the Phase-1
  critical chokepoint.
- **G12 streak = P1-B1 (#1) · P1-B2 (#2) · P1-B3 (#3)** per the task plan;
  G12 may only reach EARNED-PENDING after the streak, and PO flips it YES only
  at 12/12 terminal atomic close.
- **Frozen anchor for this pilot's contracts:** `debba8ea…` — no retag, no
  rewrite, no push.

### What I do NOT touch (Decision 1)

The stock-price SSOT (`pilot-status-stock-price.json`) is **PM-owned** and is
already correctly at phase=1 / phase0.status=CLOSED. I do **not** modify it here.
The phase1 block fields (openedAt/openedBy/gate…) are PM's to populate at Phase-1
open per the SSOT authorship pattern. This ruling is the gate-open authority; the
SSOT mutation belongs to PM on dispatch. decisionMatrix stays empty (§4.5).

### Dispatch

Signal `docs/signals/po-pilot3-stock-price-phase1-open-20260523T223738Z.json`
names **PM → dev-stock-price** to begin Phase 1 at **P1-A** per the phase-1 task
plan, WIP=1.

---

## Decision 2 — kinh-dich (pilot-4) WIP=2 second slot: **OPEN**

### Prior binding ruling (the gate)

Per `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md`
(Decision 1 + Decision 4): kinh-dich is pilot 4 (TS); its charter may be drafted
but its **G4 cannot be locked until SI-3 resolves**; and the WIP=2 cap means the
second ACTIVE slot opens only once SI-3 lands AND stock-price clears Phase 0.

### Both conditions are now MET

| Condition | Evidence | Status |
|---|---|---|
| SI-3 (TS fence) complete | `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` — `status: FINAL`, `chosen_option: A`, `within_one_sprint: true`, `g4_ac_text_ready: true`. Option A = `eslint-plugin-boundaries` v6.0.2; §5 G4 AC text locked; §4 deliberate-violation recipe concrete. | **MET** |
| stock-price clears Phase 0 | Decision 1 above — gate RATIFIED, stock-price now in Phase-1 execution (SSOT phase=1). | **MET** |
| WIP=2 cap | First WIP pair was {stock-price}; now {stock-price (Phase 1), kinh-dich (Phase 0)} — 2 ACTIVE charters, at the cap, not over. No pilot 5 charter opens until pilot 3 clears Phase 1. | **WITHIN CAP** |

**Ruling: OPEN kinh-dich pilot-4 now.** Holding would waste the freed slot —
SI-3 (the single highest-risk prework item) is resolved with the strong option
(A, not the Option-C fallback), the G4 AC text is ready for verbatim transcription,
and stock-price has de-risked the program start exactly as intended. There is no
blocker. The Go-first / TS-second sequencing has done its job.

### Authorization to the architect (charter draft)

The **architect is authorized to draft the kinh-dich pilot-charter**
(`docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md`) by:

1. **Cloning the proven charter structure** — macro v2.0 / stock-price v2.0
   charter shape (12 G-goals across Tracks A/B/C, Phase 0 exit gate, §4.5
   decision-matrix authorship rule, §Hard Deadline status-enum L3, all carry-over
   lessons L1-L7 baked Day 0). kinh-dich is **pilot 4, charter version 2.0**.
2. **Service facts via jq on system-map.json** (never hardcode): port **5005**
   (internal == external 5005), zone `apps/kinh-dich-service`, language
   **TypeScript** / runtime **Bun**, specialist **dev-kinh-dich**.
3. **Language Lock (Day 0) = TypeScript.** kinh-dich is natively TS/Bun — no
   rewrite step. L1 (no mid-pilot pivot) applies.
4. **G4 — transcribe SI-3 §5 verbatim (TS fence, NOT Go depguard).** Copy the
   §5 G4 AC block verbatim, replacing `<svc>` → `kinh-dich-service` throughout.
   The fence is **`eslint-plugin-boundaries` (Option A)** in
   `apps/kinh-dich-service/eslint.config.mjs` — **NOT** Go `.golangci.yml` /
   depguard. Substitute the deliberate-violation primitive path with an actual
   primitive that will exist at G4 time (SI-3 §8 names
   `src/primitive/hexagram-resolver/index.ts` as the example). AC-4a/4b/4c carry
   the SI-3 §5 text exactly (eslint.config.mjs exists + eslint &
   eslint-plugin-boundaries in devDependencies + `bunx eslint src/
   --max-warnings 0` exit 0; deliberate Fence-A violation → non-zero exit with
   "Fence-A" in output → reverted → never committed; eslint.config.mjs freeze
   anchor at G4 close). **G4 is no longer gated** — SI-3 has landed, so the G4
   section may be LOCKED at charter v1 (no architect Amendment, per SI-3 §5
   "spec is final at charter v1").
5. **Pre-revert tag naming** — per-service: `kinh-dich-pre-ci`,
   `kinh-dich-pre-delete`, `kinh-dich-pre-inject` (L5, clone the stock-price
   tag-protocol shape; TS variant uses `bunx eslint` for the CI/violation step).
6. **SI-2 fleet dashboard index is NOT kinh-dich's** — ratification Decision 3
   corrected the SI-2 owner to **stock-price** (first fleet pilot to reach G6).
   The kinh-dich charter must NOT re-claim SI-2; kinh-dich G6 builds only its own
   `apps/kinh-dich-service/dashboard/index.html`.

### kinh-dich per-service risk gate equivalent

Each pilot carries a binding correctness gate analogous to TA's language-lock,
macro's **R-1 (math/rand → security)** / **FRED_API_KEY** gate, alert-engine's
**Telegram-creds** gate, and stock-price's **R-CGO** (`mattn/go-sqlite3`) gate.

**For kinh-dich, the architect must identify the per-service risk gate at Phase 0.**
My read for the architect to confirm or refine in the Phase-0 brownfield:

- **No CGO/native-DB risk** — kinh-dich is TS/Bun, no `mattn/go-sqlite3`, so
  there is **no R-CGO analog**. That removes stock-price's hard chokepoint.
- **Candidate risk gate = TS fence resolution (R-FENCE).** kinh-dich's
  novel-tooling risk is precisely the SI-3 ESLint fence — the first TS service to
  exercise `eslint-plugin-boundaries`. SI-3 §6.2 R-2 flags the one empirical
  unknown: whether `.js`-suffixed ESM imports are matched by the
  `src/<layer>/**/*` element patterns. **The Phase-0/Phase-1 risk gate is the
  AC-4b deliberate-violation proof actually producing a non-zero exit with
  "Fence-A" in output on this service's real import style.** If R-2 bites, SI-3
  §6.3 gives a 5-minute in-Option-A fallback (add `@typescript-eslint/parser`) —
  it does NOT drop to Option C. The architect bakes this as the kinh-dich Phase-0
  feasibility confirmation (the TS analog of stock-price's R-CGO Phase-0 confirm).
- **Zero-credentials sandbox gate (G7)** carries over unchanged: the kinh-dich
  sandbox process must have zero DB creds / API keys / secrets — hexagram logic
  is pure compute, so this should be naturally clean, but it remains the binding
  G7 gate.

The architect is the authority on the final per-service gate wording in the
charter; the above is the PO framing to transcribe/refine, not a freeze.

### SSOT note (NOT created this cycle)

The architect/charter step will instantiate
`docs/data/pilot-status-kinh-dich.json` from
`docs/data/pilot-status-schema.json` (macro v2 field shape) with all 12 goals =
TBD, decisionMatrix present-but-empty, status=ACTIVE, phase=0, language=TypeScript
locked Day 0. **`docs/data/` is gitignored** — that new file will require
`git add -f docs/data/pilot-status-kinh-dich.json` when it is committed (separate
from this decision; I do NOT create it here). I flag it so the charter step does
not silently drop the SSOT from version control.

### Dispatch

Signal `docs/signals/po-pilot4-kinh-dich-open-20260523T223738Z.json` names
**architect → draft kinh-dich pilot-charter** (TS stack, port 5005, clone macro
v2.0 / stock-price structure, transcribe SI-3 §5 G4 verbatim with TS fence,
confirm the R-FENCE per-service gate at Phase 0).

---

## Constraints held

L84 explicit-file staging (per-path `git add`, no `-A`/`.`); no `--force`,
no `--no-verify`, no `--no-gpg-sign`; no `git push`; all on `main`. Did NOT touch
`apps/technical-analysis/**` (DORMANT), `apps/macro-indicators/**` (CLOSED),
`pilot-status.json` / `pilot-status-macro-indicators.json` (FROZEN/CLOSED SSOTs),
or the stock-price SSOT (PM-owned, already phase=1). decisionMatrix stays empty
until 12/12 terminal (§4.5) on every active pilot. System facts via jq on
`system-map.json`, never hardcoded. `docs/data/*.json` gitignore noted for the
future kinh-dich SSOT (`git add -f`).

**Decision owner:** PO. **No user approval required.**
**Recorded:** 2026-05-24 (UTC instant 2026-05-23T22:37:38Z).
