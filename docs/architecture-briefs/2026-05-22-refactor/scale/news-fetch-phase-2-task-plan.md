---
title: "Phase 2 Task Plan (TypeScript) — news-fetch SCALE Pilot"
date: "2026-05-24"
author: "po (skeleton — architect may expand per-task ACs)"
pilot: "news-fetch"
phase: "2"
status: "PO-SKELETON-INLINE (dispatchable; architect AC-expansion optional, non-blocking)"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
language: "TypeScript"
runtime: "bun"
service_port: 5008
service_zone: "apps/news-fetch"
service_specialist: "developer (generic — no dev-news-fetch specialist; routed via .claude/flows/dev-news-fetch/main.md)"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
ssot_ref: "docs/data/pilot-status-news-fetch.json"
phase1_gate: "QA APPROVED Round 2 @c8a2f7cb (sandbox 13/13, tsc exit 0, DDD+security PASS, G12 streak 3/3); signal docs/signals/qa-news-fetch-p1-approved-20260524T000001Z.json; handoff docs/handoffs/TASK_P1-NF-QA.md"
anchor_tag: "news-fetch-pre-refactor @ 31483c8c (local-only — INTACT, no retag/push)"
fence_spec_ref: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md §5 (SI-3 FINAL, Option A, commit 388703b7)"
structural_precedent: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md (TS sibling pilot — same SI-3 ESLint fence path)"
---

# Phase 2 Task Plan (TypeScript) — news-fetch SCALE Pilot

**Phase 1 CLOSED/APPROVED** 2026-05-24 (QA gate PASS @c8a2f7cb). 5 goals remain for Phase 2: **G4, G8, G9, G10, G11**. The 7 evidence-locked goals (G1, G2, G3, G5, G6, G7, G12) carry forward as EARNED-PENDING in `pilot-status-news-fetch.json` `goals[].phase1_state` — they are re-confirmed at the Phase-2 close-gate (P2-NF-Z), NOT re-earned.

> **IMPORTANT — no goal flips in Phase 2.** Task completion does NOT flip any G-goal state. All goal flips (including EARNED-PENDING → YES) are PO-only, in ONE atomic Phase-3 commit, after ALL 12 goals reach terminal state simultaneously. §4.5 matrix-authorship rule is binding and inviolable. `decisionMatrix.{speed,trust,scale}` stays TBD; `goalsEarned` stays 0.

---

## Service Facts (system-map.json — never hardcode)

```
id: news-fetch | language: ts | runtime: bun
port: 5008 (internal == external) | zone: apps/news-fetch
specialist: developer (generic) via .claude/flows/dev-news-fetch/main.md
src layers: SINGULAR — src/primitive/ src/module/ src/infrastructure/ src/application/ src/interface/ src/domain/
```

---

## SI-3 Dependency Finding (G4 prerequisite — RESOLVED)

**SI-3 STATUS: LANDED.** The TS ESLint architecture-fence design (the gate for G4 AC on all TS pilots) is COMPLETE:

- **Chosen option:** A — `eslint-plugin-boundaries` v6.0.2 (ESLint flat config).
- **Commit:** `388703b7`. **Signal:** `docs/signals/architect-si3-ts-fence-done-20260523T220332Z.json`.
- **Design (FINAL):** `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md`. The verbatim G4 AC text for TS pilots is in §5 (substitute `<svc>` = `news-fetch`).
- **Already proven on the sibling TS pilot:** kinh-dich (pilot-4) executed the same §5 spec in its Phase-2 P2-KD-B/C/D.

**Owner decision:** Owner = `developer` (fence config + deliberate-violation execution) + `qa` (independent violation reproduction + AC-4c freeze confirm). **NO architect SI-3 re-design is needed — the spec is FINAL and locked. NO new task to author SI-3.** G4 is fully unblocked.

**Element-pattern gotcha:** news-fetch source layer dirs are **singular** (`src/primitive/`, `src/module/`) — which matches SI-3 §3.2 `boundaries/elements` patterns (`src/primitive/**/*`, `src/module/**/*`) verbatim. The `.claude/flows/dev-news-fetch/main.md` Fence note uses **plural** (`src/primitives/`, `src/modules/`) which is STALE. Use SI-3 §5 (singular) as the locked AC — do not copy the flow's plural note.

**R-2 fallback (pre-documented):** If `eslint-plugin-boundaries` fails to match `.js`-suffixed ESM imports in the AC-4b proof (SI-3 §6.3 R-2), add `@typescript-eslint/parser` devDep + `languageOptions: { parser: tsParser }` inline. Stays Option A. No new task. Never drop to Option C.

---

## Task Ledger (WIP=1 sequential)

| ID | Title | Owner | Goals | Blocked by | Blocks | Est |
|----|-------|-------|-------|-----------|--------|-----|
| **P2-NF-A** | Create `news-fetch-pre-ci` tag (pre-revert anchor before G4 fence work) | developer | G4-setup | — | P2-NF-B | 5m |
| **P2-NF-B** | `eslint.config.mjs` Fence-A/B/C (verbatim SI-3 §3.2) + `eslint`+`eslint-plugin-boundaries` devDep + `lint:ci` script | developer | G4-partial | P2-NF-A | P2-NF-C | 1h |
| **P2-NF-C** | G4 deliberate-violation proof (AC-4b) — Fence-A breach → exit non-zero + "Fence-A" → revert → exit 0, NEVER committed | developer + qa | G4-full | P2-NF-B | P2-NF-D | 30m |
| **P2-NF-D** | G4 freeze anchor confirm (AC-4c) — `git log eslint.config.mjs` most-recent = P2-NF-B; QA compiles G4 evidence + signal | qa | G4-finalized | P2-NF-C | P2-NF-E, P2-NF-G | 15m |
| **P2-NF-E** | G8 honest-red — 1 deliberate broken primitive + 5 known-bad scenarios → 6 RED cards → revert GREEN; QA honesty_table + test_a/test_b | qa + developer | G8 | P2-NF-D | P2-NF-Z | 30m |
| **P2-NF-F** | G9 dashboard trust contract — Path B PO Playwright headless (Day-0 default). file:// render → 3 panels + 6 cards + honest status + console_errors=0 | po | G9 | — | P2-NF-Z | 30m |
| **P2-NF-G** | Create `news-fetch-pre-inject` tag + G10 bug injection (single-literal in `published-at-parser` — RFC-date timezone/off-by-one). Sandbox card RED before dispatch. Cycle counter starts | qa | G10-setup | P2-NF-D | P2-NF-H | 20m |
| **P2-NF-H** | G10 AI-fixability — developer fixes `published-at-parser` bug in ≤2 cycles (baseline 1.5) from dashboard-RED signal ONLY (no spec/file pointer). Dashboard GREEN. G12 DoD enforced | developer + qa | G10 | P2-NF-G | P2-NF-I | 1h |
| **P2-NF-I** | G11 regression alarm — 2-trial coupling. Trial-1 = `published-at-parser` (G10 alias). Trial-2 = `headline-normalizer` (or `source-dedup-key`). Each ≥1 coupled scenario RED + single-edit fix. Outcome-(a) × 2 = PASS | qa + developer | G11 | P2-NF-H | P2-NF-Z | 1.5h |
| **P2-NF-Z** | Phase 2 close-gate (QA) — confirm G4(A-D) + G8 + G10 + G11 chains; re-confirm 7 EARNED-PENDING + G12 streak; sandbox all-green; emit close-gate signal. NO goal flips | qa | close-gate | P2-NF-F, P2-NF-I | Phase 3 PO matrix | 30m |

**Total tasks:** 10 (A, B, C, D, E, F, G, H, I, Z — Z is the close-gate per fleet convention).

---

## Sequencing

```
P2-NF-A (news-fetch-pre-ci tag)
  ↓
P2-NF-B (eslint.config.mjs Fence-A/B/C + devDeps)
  ↓
P2-NF-C (G4 deliberate-violation proof — reverted, never committed)
  ↓
P2-NF-D (G4 freeze anchor AC-4c)
  ↓
  ├─ P2-NF-E (G8 honest-red — 6 red cards)
  └─ P2-NF-G (news-fetch-pre-inject tag + G10 inject)
        ↓
     P2-NF-H (G10 AI-fix ≤2 cycles)
        ↓
     P2-NF-I (G11 2-trial regression)

P2-NF-F (G9 PO Playwright — async PO track, runs anytime, NO blocking dependency)

P2-NF-Z (close-gate) ← after P2-NF-F + P2-NF-I (+ P2-NF-E)
```

**Critical path:** P2-NF-A → B → C → D → G → H → I → Z (~5 hours wall-clock dev+qa; G9/P2-NF-F runs in parallel on the PO track).

---

## Pre-Revert Tags (created IN the gating task, BEFORE mutation — no retag/--force/push)

| Tag | Created in | Protects |
|-----|-----------|----------|
| `news-fetch-pre-ci` | P2-NF-A Step 0 | rollback point before G4 ESLint fence work |
| `news-fetch-pre-inject` | P2-NF-G Step 0 | rollback point before G10 bug-injection commit |

Note: `news-fetch-pre-delete` (from the dev-flow protocol table) is NOT needed in Phase 2 — G5 was completed in Phase 1 (P1-G5). Only the CI-fence and bug-inject tags apply.

---

## Hard Constraints (every task inherits)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `cd apps/news-fetch && bun run sandbox --tier=all --module=news-fetch` exits 0 (13/13 GREEN baseline) BEFORE DONE on every task producing sandbox-runnable artefacts. |
| **R-FENCE gate** | `cd apps/news-fetch && bunx eslint src/ --max-warnings 0` must catch the Fence-A violation in AC-4b with non-zero exit AND "Fence-A" in output. Single hard gate for the fence system. |
| **R-2 fallback** | `.js`-suffix match failure → add `@typescript-eslint/parser` + `languageOptions:{parser:tsParser}` inline. Stays Option A. |
| **Security clause** | Sandbox env audit: forbidden grep (`DB_|API_KEY|SECRET|TOKEN|PASSWORD|NEWS_API_KEY|NEWSAPI|VPS_PUSH|CLOUDFLARE`) EMPTY in sandbox process. CTX_ADVISOR_* excluded (Claude Code harness vars). |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI. |
| **Anchor INTACT** | `news-fetch-pre-refactor @ 31483c8c` remains ancestor of HEAD before+after every commit. |
| **SSOT freeze** | Do NOT flip any G-goal `status` field. `decisionMatrix` stays TBD. `goalsEarned` stays 0. PO-only at 12/12 terminal (§4.5). |
| **Anti-scope-creep** | `apps/news-fetch/` ONLY. No cowork-agent (news-scout/market-watcher) coverage-sweep work (charter §Risk 4). |

---

## Goal Mapping

| Goal | Phase 2 task(s) | Outcome |
|---|---|---|
| G4 | P2-NF-A → P2-NF-D | `eslint.config.mjs` Fence-A/B/C (SI-3 Option A) + deliberate-violation proof (exit non-zero + "Fence-A" + reverted) + AC-4c freeze anchor |
| G8 | P2-NF-E | 6 RED cards (1 deliberate broken primitive + 5 known-bad scenarios); revert → GREEN; QA honesty_table |
| G9 | P2-NF-F (PO async) | PO Playwright headless file:// render; 3 panels + 6 cards + honest status + console_errors=0 |
| G10 | P2-NF-G → P2-NF-H | `published-at-parser` bug injected; developer fixes in ≤2 cycles (baseline 1.5); dashboard GREEN |
| G11 | P2-NF-I | 2-trial coupling proof: Trial-1 published-at-parser, Trial-2 headline-normalizer; Outcome-(a) × 2 = PASS |

---

## Phase 3 Close (PO-only, after P2-NF-Z)

When all 12 goals are terminal (7 EARNED-PENDING + 5 Phase-2), PO performs ONE atomic Phase-3 commit: flip all 12 `goals[].status` to terminal grade, populate `decisionMatrix.{speed,trust,scale}` mechanically (Speed = G10+G11; Trust = G9+G8; Scale = all 12 YES + sprintCount ≤ 6), set `verdict` (scale | rescope | stop-MVR), set top-level `status` (DONE if 12/12 YES + matrix terminal). Record commit hash in closure block. No partial population before 12/12 (§4.5).
