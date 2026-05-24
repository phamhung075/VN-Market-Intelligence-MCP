---
title: "PO Decision — kinh-dich Phase-1 close-gate: CONDITIONAL-GO → fix-then-clean-GO (authorize P1-KD-H dashboard completion)"
date: "2026-05-24"
author: "po"
status: "DECIDED"
pilot: "kinh-dich (fleet pilot 4)"
phase_event: "Phase-1 close-gate ruling"
qa_signal: "docs/signals/qa-kinh-dich-phase1-close-gate-20260524T060000Z.json"
qa_evidence: "docs/handoffs/TASK_P1-KD-G-evidence.md"
qa_verdict_received: "CONDITIONAL-GO (3/4 exit criteria met)"
po_verdict: "fix-then-clean-GO — authorize one dashboard-completion task (P1-KD-H), then QA AC-2-only spot re-verify, then Phase-1 clean full GO"
head_at_decision: "2474b873f63a30719b5e08080f777c909427e2e8"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — ancestor of HEAD, verified exit 0)"
charter: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md (v2.0, ACTIVE)"
serialization: "INTERIM FLEET-WIDE SINGLE-COMMITTER active — PO is sole file-committing worker in flight; explicit-path staging only (L84)."
authority: "PO full autonomy (feedback_po_autonomy). RULE + AUTHORIZE only — does NOT implement, does NOT mutate PM-owned SSOT, does NOT spawn agents."
---

# PO Decision — kinh-dich Phase-1 close-gate ruling

QA returned **CONDITIONAL-GO** (3/4 exit criteria met) on the kinh-dich (fleet pilot 4) Phase-1 close-gate. I independently re-verified the evidence and the one failing criterion. My ruling is **fix-then-clean-GO**: I authorize a single, tightly-scoped dashboard-completion task (P1-KD-H), gate it on a QA AC-2-only spot re-verify, after which Phase 1 is a clean **full GO**. I RULE and AUTHORIZE; I do not implement, I do not mutate PM-owned SSOT, I do not spawn agents.

---

## Decision 1 — kinh-dich Phase-1 close-gate: **CONDITIONAL-GO accepted, routed as fix-then-clean-GO**

### Independent re-verification of the QA verdict

| Check | QA evidence | PO re-verification (this cycle) | Verdict |
|---|---|---|---|
| **AC-1 — Sandbox 3-tier all-green** | primitive 12/12, module 2/2, all 14/14, exit 0 (QA-independent run) | Internally consistent (12 primitive incl. reading-scorer ×3 + 2 module = 14); per-scenario breakdown present | PASS |
| **AC-3 — G12 streak 6/6** | B1, B2, B3, D, E, F all DoD-gated sandbox-green before RETURN | 6 completion signals cited + R-FENCE recorded; exceeds required 3/3 (bonus +3) | PASS |
| **AC-4 — R-FENCE discovery recorded** | `TASK_P1-KD-B1.md §R-FENCE Discovery`: `.js`-suffixed ESM style confirmed, deliberate-violation pair calibrated for Phase-2 G4, status RECORDED | Present per evidence doc lines 164-177 | PASS |
| **AC-5 — Sandbox evidence clean** | 14/14 PASS, 0 fail, 0 skip, exit 0 | Derived from AC-1; consistent | PASS |
| **AC-6 — Dashboard honesty (cold-open NOT-RUN)** | all 11 embedded scenarios `status: not-run`; JS renders NOT-RUN badge cold; G8 deliberate-break proven in P1-E (reverted) | Structural contract confirmed; live browser transition correctly deferred to G9 PO Playwright | PASS (structural) |
| **AC-2 — Dashboard ≥90% render** | 5/6 card groups = **83% < 90% gate**. reading-scorer 4th primitive absent | **CONFIRMED by direct file read** (see root-cause box below) | **honest-RED** |
| **Frozen anchor** | — | `git merge-base --is-ancestor debba8e… HEAD` → exit 0 (ANCESTOR-OK); HEAD = `2474b873…` | INTACT |
| **decisionMatrix / goal states** | not mutated (QA read-only) | Charter §4.5 — PO-only at 12/12 terminal; not touched this cycle | COMPLIANT |

### Root cause — independently verified at HEAD `2474b873…`

I read the dashboard file directly. Every QA claim is true:

- `grep -c "reading-scorer" apps/kinh-dich-service/dashboard/index.html` → **0** (exit 1). The 4th primitive appears **zero** times.
- Line **855**: `"3 pure TypeScript functions: hao-encoder, …"` — stale label, must read **4**.
- `window.__PRIMITIVES_DATA__` (line 1059) holds only the 3 original primitives' scenarios — reading-scorer's 3 scenarios are omitted.
- P1-F commit `43158e5c` (`feat(kinh-dich/P1-F): extract reading-scorer primitive — 4th primitive ships`) confirmed present. The primitive shipped; its dashboard card never did.

**Why this is material, not cosmetic.** The standing program directive is: *"complete all microservice factory and make dashboard of each service working revealing functions of his microservice server."* A dashboard that silently omits a shipped primitive is the exact failure mode the user is trying to eliminate — the trust layer would under-report the service's own functions. It also fails the P1-G handoff's **own** acceptance bar: the handoff (lines 37, 57, 70-78, 172) was authored expecting **6/6 cards = 100%** and explicitly lists reading-scorer in the AC-2 checklist. This is not a moving goalpost — it is a known deliverable that fell through a scope seam (P1-F carried zero dashboard requirements; the dashboard was frozen at P1-E's 3 primitives).

### Why fix-then-clean-GO, not CONDITIONAL-GO-into-Phase-2

I weighed the two paths the close-gate rule permits (handoff §Exit Criteria: "3 of 4 met → CONDITIONAL-GO — cap Phase 2 at 1 task/sprint, re-evaluate"):

- **Path A — CONDITIONAL-GO into Phase 2 (1 task/sprint cap):** legal, but it carries a known, honest-RED trust defect *forward* into Phase 2. Phase 2's first deliverables (G4 fence, G5 rewire) do not touch this gap, so it would persist for multiple sprints — a dashboard that misrepresents the service's primitives during the very phase that builds the AI-fixability proof on top of that dashboard. This violates **"ship completion, not slices"** (feedback_ship_completion): drive the task to *done*, do not ship the smallest passing slice and move on.
- **Path B — fix-then-clean-GO (chosen):** the gap's root cause is concrete, verified, and bounded (~15 min, one dev-kinh-dich task, one file). Closing it now yields a clean 6/6 = 100% dashboard and a **full GO** with zero carried debt, before Phase 2 even opens. The cost is one short task + an AC-2-only QA spot re-verify. The benefit is that the user's trust artifact is honest from the moment Phase 1 closes.

The asymmetry is decisive: a ~15-min fix vs. carrying a goal-violating defect across Phase 2. **Ruling: fix-then-clean-GO.** Phase-1 remains in `READY_FOR_CLOSE_GATE` (not yet `APPROVED`) until P1-KD-H lands and QA re-verifies AC-2; the close-gate verdict flips to clean **GO** at that point.

---

## Decision 2 — authorize task **P1-KD-H** (dashboard completion)

I authorize a single Phase-1 finalization task. I do **not** write the handoff — that is the PM's step. I specify it crisply so the PM can author `docs/handoffs/TASK_P1-KD-H.md`.

**Task: P1-KD-H — add reading-scorer to the kinh-dich dashboard**

| Field | Value |
|---|---|
| **id** | `P1-KD-H` |
| **owner** | `dev-kinh-dich` (specialist; zone-locked) |
| **zone** | `apps/kinh-dich-service` |
| **type** | FIX (Phase-1 finalization; closes the AC-2 gap) |
| **scope (single file)** | `apps/kinh-dich-service/dashboard/index.html` ONLY |
| **blocks** | Phase-1 clean-GO close (`APPROVED`) |
| **blocked_by** | none (P1-F already landed) |
| **size** | XS (~15 min, single file) |

**Acceptance criteria (the PM copies these verbatim):**

1. **AC-H1 — reading-scorer card group renders.** Dashboard renders **6/6 card groups**: 4 primitive (hao-encoder, hexagram-resolver, ngu-hanh-classifier, **reading-scorer**) + 1 module (reading_composer) + 1 microservice (kinh-dich-service, port 5005). `grep -c "reading-scorer" apps/kinh-dich-service/dashboard/index.html` ≥ 1.
2. **AC-H2 — real scenarios embedded.** reading-scorer's **3 actual scenarios** (`reading-scorer-golden.json`, `reading-scorer-edge.json`, `reading-scorer-failure.json`) are added to `window.__PRIMITIVES_DATA__` with the SAME shape as the existing 3 primitives — real scenario names/inputs, not placeholders. Its 4 functions (extractOutcomeScore / extractTrendScore / extractAction / majorityVote) are reflected in the card narrative.
3. **AC-H3 — label corrected.** Line ~855 panel description updated from `"3 pure TypeScript functions"` → `"4 pure TypeScript functions"` (and the listed function/primitive names extended to include reading-scorer).
4. **AC-H4 — honesty contract preserved.** reading-scorer's embedded scenarios MUST be `status: "not-run"` on cold open (consistent with the other 11 — no false greens). Dashboard stays self-contained `file://` (no `fetch`/XHR/CDN added).
5. **AC-H5 — sandbox still 14/14 green.** `bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all` → `[sandbox] PASS 14/14 (0 failed, 0 skipped)`, exit 0. **G12 DoD Gate applies** — dashboard-green / sandbox-green evidence in the RETURN block before DONE.
6. **AC-H6 — no scope bleed.** Touches ONLY `apps/kinh-dich-service/dashboard/index.html`. Does NOT touch `window.__MODULE_DATA__` semantics, does NOT touch SI-2 fleet index (`docs/dashboards/index.html`), does NOT touch foreign pilots' files.

**Then: QA AC-2-only spot re-verify** (separate short QA task, PM sequences after P1-KD-H DONE) — confirm 6/6 = 100% render, honest cold-open NOT-RUN preserved, file still self-contained. On QA PASS, kinh-dich Phase-1 close-gate = **clean full GO**, Phase-1 status → `APPROVED`. (No re-run of AC-1/AC-3/AC-4/AC-5/AC-6 needed — only AC-2 was the failing criterion and only the dashboard file changes.)

This keeps the existing CONDITIONAL-GO Phase-2 1-task/sprint cap moot: Phase 2 is not authorized in this doc. Phase-2 entry is a **separate later ruling** once Phase-1 is clean-GO `APPROVED` (and subject to the standing WIP=2 fleet cap — see boundary note).

---

## What this ruling does NOT do (Charter §4.5 + boundary compliance)

- **No G-goal flips. `goalsEarned` stays 0.** A Phase-1 GO (clean or conditional) does NOT flip any G-goal to YES. G-goals flip **PO-only at the TERMINAL 12/12 close** in one atomic commit. I flip nothing.
- **`decisionMatrix` stays all-TBD.** I do not populate speed/trust/scale. That is the 12/12 terminal step.
- **Did NOT edit `docs/data/pilot-status-kinh-dich.json`** — PM-owned. The PM updates SSOT on this signal (records close-gate routed fix-then-clean-GO, adds P1-KD-H, holds phase1 in `READY_FOR_CLOSE_GATE`).
- **Did NOT author the P1-KD-H handoff** — PM's step (Decision 2 hands it the spec).
- **Did NOT spawn any agent** — I emit a signal; the main router fans out.
- **Did NOT touch app source** of any pilot: `apps/technical-analysis/**`, `apps/macro-indicators/**`, `apps/stock-price/**`, `apps/kinh-dich-service/**`.
- **Did NOT retag / rewrite / push the frozen anchor** `debba8e…` (re-verified ancestor of HEAD, untouched).
- **No `--force`, `--no-verify`, `--no-gpg-sign`, no `git push`.** L84 explicit-path staging. All local on `main`. Single-committer serialization respected: only my own paths staged.

### G-goal posture snapshot (informational — NOT written to SSOT)

- **EARNED-PENDING** (mechanism demonstrated in Phase 1; flips YES only at 12/12 terminal): G1 (4 primitives × ≥3 scenarios, 12/12), G2 (reading_composer module 2/2 via ports), G6 (3-level dashboard — completes at P1-KD-H), G7 (edit-rerun handler present from P1-E), G8 (honest NOT-RUN cold-open + P1-E deliberate-break), G12 (DoD streak 6/6).
- **STILL-UNMET** (Phase-2 work): G3 (composition root + HTTP contract), G4 (ESLint fence + AC-4b deliberate-violation proof on `.js`-ESM style), G5 (delete old domain logic + rewire MCP→HTTP 5005), G9 (dashboard trust contract — PO Playwright), G10 (AI fixes injected bug ≤2 cycles), G11 (regression alarm).

`goalsEarned` = **0**. `decisionMatrix` = all **TBD**. Unchanged.

---

## Dispatch — next actor

**next_actor: `pm`.** **next_action:** (1) update PM-owned SSOT `docs/data/pilot-status-kinh-dich.json` — record close-gate ruling = fix-then-clean-GO, phase1 held at `READY_FOR_CLOSE_GATE`, add task `P1-KD-H` (+ the QA AC-2 re-verify follow-up); (2) author `docs/handoffs/TASK_P1-KD-H.md` from the spec in Decision 2 (owner dev-kinh-dich, AC-H1…AC-H6, G12 DoD applies). Then the **main router fans out `dev-kinh-dich`** on the P1-KD-H handoff; on DONE → QA AC-2 spot re-verify → PO records clean full GO.

Signal: `docs/signals/po-kinh-dich-phase1-fix-then-clean-go-{ISO}.json`.
