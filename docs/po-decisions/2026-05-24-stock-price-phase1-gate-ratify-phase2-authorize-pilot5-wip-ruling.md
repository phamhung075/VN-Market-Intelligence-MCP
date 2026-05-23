---
title: "PO Decision — stock-price Phase-1 GO ratified + Phase-2 authorized + pilot-5 WIP ruling"
date: "2026-05-24"
author: "po"
status: "DECIDED"
pilot: "stock-price (fleet pilot 3)"
phase_event: "Phase-1 close-gate ratification"
qa_signal: "docs/signals/qa-stock-price-phase1-close-gate-20260523T234229Z.json"
qa_commit: "56fab996"
head_at_decision: "9534c117"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — ancestor of HEAD, 0 tags)"
charter: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md (v2.0, ACTIVE)"
authority: "PO full autonomy (feedback_po_autonomy). RATIFY + AUTHORIZE only — does NOT implement, does NOT mutate PM-owned SSOT."
---

# PO Decision — stock-price Phase-1 GO ratified + Phase-2 authorized + pilot-5 WIP ruling

QA returned a **GO verdict** on the stock-price (fleet pilot 3) Phase-1 close-gate. This doc records three rulings. I RATIFY and AUTHORIZE; I do not implement. The only SSOT I ever author is `decisionMatrix`, and only at the 12/12 terminal close — **NOT now**.

---

## Decision 1 — stock-price Phase-1 close-gate: **RATIFIED (GO sound)**

I independently re-verified the QA close-gate signal (`qa-stock-price-phase1-close-gate-20260523T234229Z.json`, QA commit `56fab996`). The GO is sound. All four exit criteria + R-CGO fence + anchor + matrix-discipline check out:

| Check | QA evidence | PO re-verification | Verdict |
|---|---|---|---|
| **AC-1 — Sandbox 3-tier all-green** | primitive 9/9, module 2/2, all 11/11, exit 0 under `CGO_ENABLED=0` | Internally consistent (9 primitive + 2 module = 11); per-scenario breakdown present | PASS |
| **AC-2 — Dashboard 5/5 cards** | 100% render, 0 console errors, self-contained `file://`, honest NOT-RUN (9+2 badges), edit-rerun panel, CGO_ENABLED=0 badge, env-audit cmd | Line-cited evidence, zero live external loads | PASS |
| **AC-3 — G12 streak 3/3** | P1-B1 (3 scenarios), P1-B2 (6), P1-B3 (9) — each sandbox-GREEN before DONE | Three handoff RETURN blocks confirm DoD-Gate satisfied per task | CONFIRMED |
| **AC-4 — R-CGO fence final** | 0 `mattn/go-sqlite3` / 0 `import "C"` in pkg/primitive, pkg/module, cmd/sandbox; CGO confined to pkg/infrastructure | grep exit 1 (0 real matches); lone "cgo" hit is a code comment, not an import | PASS |
| **Frozen anchor** | `debba8e…` ancestor of HEAD, 0 tags | Re-ran `git merge-base --is-ancestor` → exit 0; `git tag --points-at` → empty | INTACT |
| **decisionMatrix** | present-but-empty (all TBD) | Charter §4.5 compliant; PO-only, terminal-only | COMPLIANT |

**Ruling: RATIFIED.** Phase 1 is CLOSED with verdict GO.

### What ratification does NOT do (explicit)

Phase-1 GO does **not** flip any G-goal to YES. The 12/12 terminal atomic close is a separate, later event (Phase 3) where PO flips all goals + populates the decisionMatrix in one atomic commit. At Phase-1 close the G-goal posture is:

**EARNED-PENDING (mechanism demonstrated in Phase 1, flips YES only at 12/12 terminal):**
- **G1** — primitives ship with scenarios: 3 primitives × ≥3 scenarios, all PASS (9/9 sandbox). Mechanism shown; full count/edge-coverage finalized in Phase 2.
- **G2** — module composes via ports: `price_resolution` module sandbox 2/2 GREEN, CGO-free. Port discipline demonstrated.
- **G6** — three-level dashboard: 3-panel (primitive/module/microservice) renders from JSON traces, `file://`, zero network/CGO. Stub-level demonstrated; SI-2 fleet index still owed (Phase 2).
- **G7** — edit-JSON-and-rerun, zero creds/CGO: rerun panel + CGO_ENABLED=0 badge + env-audit command present in dashboard. Mechanism demonstrated.
- **G8** — honest red/green: NOT-RUN honesty shown at cold start (zero false greens). Deliberate-broken-primitive RED proof is a Phase-2 verification.
- **G12** — DoD-Gate flow rule: 3/3 streak CONFIRMED. **Candidacy held as EARNED-PENDING per Charter §4.5 — PO does NOT flip YES now.**

**STILL-UNMET (require Phase-2 work — explicitly NOT earned):**
- **G3** — clean composition root (`cmd/server/main.go` wiring + OpenAPI contract): Phase-2.
- **G4** — depguard fence + deliberate-violation proof + `.golangci.yml` freeze + `stock-price-pre-ci` tag: Phase-2.
- **G5 (a/b/c)** — deprecate superseded domain logic + rewire MCP tools to HTTP port 5010 + zero migrate-TODOs + `stock-price-pre-delete` tag: Phase-2.
- **G9** — dashboard trust contract (PO Playwright Path B default, or user verbal Path A): Phase-2.
- **G10** — AI fixes injected primitive bug ≤2 cycles + `stock-price-pre-inject` tag: Phase-2.
- **G11** — regression alarm 2-trial coupling proof: Phase-2.

**Posture summary:** 6 EARNED-PENDING (G1/G2/G6/G7/G8/G12) · 6 STILL-UNMET (G3/G4/G5/G9/G10/G11). goalsEarned remains **0** in SSOT (no terminal flips). I author **nothing** in `pilot-status-stock-price.json` — PM owns it. PM may record Phase-1 CLOSED + phase2 status transition; that is PM's SSOT step, not mine.

---

## Decision 2 — stock-price Phase-2 entry: **AUTHORIZED**

Per the charter Phase Skeleton, Phase 2 = remaining primitives + module wiring + composition root + `.golangci.yml` fence + dashboard finalization + G5 rewire + SI-2 fleet index + the G1–G12 chain, owners dev-stock-price + qa + po.

**Finding:** No Phase-2 task plan exists yet. The factory brief dir
(`docs/architecture-briefs/2026-05-23-stock-price-factory/`) holds only `pilot-charter.md`, `p0-brownfield-inventory.md`, and `phase-1-task-plan-go.md`. There is **no `phase-2-task-plan-go.md`**.

**Ruling: Phase-2 entry AUTHORIZED.** Next dispatch → **architect** to draft the Phase-2 atomic task plan (`docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md`), mirroring the Phase-1 plan format (atomic tasks, per-task AC, WIP=1). I do NOT author the plan — that is the architect's step. I authorize and point.

**Phase-2 scope the architect must decompose (from charter + prior briefs):**
- **G4** — `.golangci.yml` depguard fence (Fence-A/B/C); AC-4b deliberate-violation proof (reverted, never committed); AC-4c freeze anchor; `stock-price-pre-ci` tag created at the commit BEFORE CI work.
- **G5a/b/c** — move superseded `domain`/`application` logic to `pkg/_deprecated/` under `stock-price-pre-delete` tag; rewire mcp-server market-data tool handlers to HTTP port **5010** (external) with zero direct domain imports; zero `TODO.*migrat`.
- **G6 / SI-2** — finalize 3-panel dashboard; **dev-stock-price OWNS the SI-2 fleet dashboard index** (`docs/dashboards/index.html`) — first fleet pilot to reach G6, per ratification Decision 3.
- **G8 / G9 / G10 / G11** — honest-red deliberate-break proof; G9 PO Playwright (Path B default, L6); G10 single-literal bug-injection ≤2-cycle fix under `stock-price-pre-inject` tag; G11 2-trial coupling proof.
- **G3 / G7 / G12 finalization** — composition root + OpenAPI; rerun-handler end-to-end; G12 streak already 3/3.

Architect must keep pre-revert tag discipline (L5), L84 staging, no-force/no-push, all on `main`.

---

## Decision 3 — pilot-5 (alert-engine) WIP-cap: **HOLD (Option a)**

**The judgment call.** The prior ratification gate ("no pilot-5 until pilot-3 clears Phase 1") is now MET. But the **WIP=2 fleet cap is a separate, binding constraint**, and it counts **ACTIVE charters**, not phases-cleared.

State of the world after Decision 1+2:
- stock-price: Phase 1 CLOSED, **now entering Phase 2 → still ACTIVE.** Clearing Phase 1 does NOT make it dormant.
- kinh-dich (pilot 4): Phase 1 in flight → **ACTIVE.**
- **Active set = {stock-price (Phase 2), kinh-dich (Phase 1)} = 2 ACTIVE = AT cap.**

Opening pilot-5 (alert-engine — Go, port 5006, zone `apps/alert-engine`, specialist `dev-alert-engine`) now would make **3 ACTIVE = OVER cap.**

**Why I reject Option (b) "Phase-2 is a lighter slot":** The cap's *intent* is bounded concurrent cognitive/agent load across the program — not a phase-weighted budget. Phase 2 is the **heaviest** phase of the factory: G4 fence + violation proof, G5 deletion+rewire chain (touches mcp-server), SI-2 fleet-index ownership, plus G8/G9/G10/G11 verification — far more agent traffic and PO/QA involvement than Phase 1. Treating it as "light" inverts reality and would breach the very load bound the cap exists to protect. There is no honest justification for the lighter-slot reading.

**Ruling: HOLD pilot-5.** No alert-engine charter is authored, no `apps/alert-engine` factory dir created, no SSOT instantiated.

**Precise unblock condition (single, unambiguous):**

> pilot-5 (alert-engine) opens ONLY when **stock-price OR kinh-dich reaches terminal 12/12 close** (status flips to `DONE`, decisionMatrix populated, charter CLOSED — i.e. truly DORMANT). Reaching Phase-2 entry, Phase-2 close-gate, or any non-terminal phase boundary does NOT free a slot. The cap counts ACTIVE charters; a Phase-2 pilot is still ACTIVE.

When that condition fires, the freed slot triggers: PO charters pilot-5 (alert-engine) per the same factory v2 12-G-goal pattern, language Go (system-map: `go1.22+cgo`, like stock-price → same depguard/CGO mechanism, zero new tooling risk; plus the Telegram-creds gate noted as the alert-engine analog of the FRED/CGO gates).

---

## What I did NOT touch (boundary compliance)

- Did NOT mutate `docs/data/pilot-status-stock-price.json` — PM-owned. No goal flips; goalsEarned stays 0.
- Did NOT populate decisionMatrix — stays present-but-empty (TBD) until 12/12 terminal (§4.5).
- Did NOT author the Phase-2 task plan — architect's step (Decision 2 points to it).
- Did NOT touch app source: `apps/stock-price/**`, `apps/technical-analysis/**`, `apps/macro-indicators/**`, `apps/kinh-dich-service/**`, `apps/alert-engine/**`.
- Did NOT retag/rewrite/push the frozen anchor `debba8e…`.
- Did NOT open pilot-5 / create any `apps/alert-engine` factory artifact.
- No `--force`, `--no-verify`, `--no-gpg-sign`, no `git push`. L84 explicit-file staging. All local on `main`.

---

## Dispatch signals emitted

1. `docs/signals/po-stock-price-phase2-authorize-{ISO}.json` → **architect** (draft Phase-2 task plan).
2. `docs/signals/po-pilot5-alert-engine-wip-hold-{ISO}.json` → fleet record (HOLD ruling + unblock condition).
