---
title: "Pilot Charter — pdf-extractor microservice refactor (Factory v3)"
date: "2026-05-24"
author: "architect (pdf-extractor phase-0)"
status: "ACTIVE"
pilot: "pdf-extractor"
deadline_sprints: 6
deadline_iso: "2026-07-05"
version: "3.0"
parent_factory_close_1: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (v1.0, TA pilot closed 2026-05-23 verdict=scale)"
parent_factory_close_2: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md (v2.0, macro pilot ACTIVE)"
thin_scale_charter: "docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
lessons_carryover: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/01-lessons-from-ta-pilot.md (L1–L7)"
status_ssot: "docs/data/pilot-status-pdf-extractor.json"
language: "Python"
language_lock_source: "OCR/PDF ecosystem constraint — stays Python. docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md §Deltas"
---

# Pilot Charter — `pdf-extractor` Microservice Refactor (Factory v3)

**Binding contract for the third three-tier architecture pilot. Inherits the 12-G-goal factory pattern proven on `technical-analysis` (v1.0) and extended on `macro-indicators` (v2.0).**

**Scope:** `apps/pdf-extractor/` only. No other microservice is in scope during this pilot.

→ **Canonical G1–G12:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` — all 12 goals apply verbatim; service-specific calibration is in `docs/data/pilot-status-pdf-extractor.json` goal calibration fields.

→ **L1–L7 lessons:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/01-lessons-from-ta-pilot.md` — all 7 baked in from Day 0 (no Amendments expected).

---

## Language Lock (Day 0)

**Python.** No pivot possible. OCR/PDF ecosystem (pdfplumber, pytesseract, aiohttp) has no Go equivalent in this service. Language was locked at scale charter creation 2026-05-24 and confirmed in `docs/data/pilot-status-pdf-extractor.json` §languageLockSource.

**Impact on goals:** All 12 G-goals are language-agnostic. The sandbox runner, primitive package paths, and fence tool differ from Go pilots:
- Sandbox: `python apps/pdf-extractor/sandbox/runner.py` (not `go run cmd/sandbox/`)
- Primitives: `domain/primitives/<name>/` (not `pkg/primitive/<name>/`)
- Module: `domain/modules/financial_reports/` (not `pkg/module/<name>/`)
- G4 fence: `import-linter` (not depguard/ESLint)
- G7 sandbox env audit includes: `DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD`

---

## Why This Pilot Exists

`technical-analysis` (v1.0) and `macro-indicators` (v2.0) proved the factory pattern works in Go. `pdf-extractor` is the first Python pilot — it proves the pattern is language-agnostic and applies to services with impure I/O adapters (OCR, VPS, SQLite) where the primitive boundary is especially important.

The "single most important boundary" (per thin scale charter §Key risks R-1): OCR calls + VPS PDF pulls are ADAPTERS in `infrastructure/`; primitives are deterministic post-OCR transforms (normalize, score, compute ratios). The sandbox must never touch the VPS or OCR model.

---

## Lessons L1–L7 Carried Over (Day 0)

All 7 lessons from `01-lessons-from-ta-pilot.md` are baked in:

| Lesson | PDF-Extractor Implementation |
|---|---|
| **L1** — Language pivot mid-Phase-1 wastes 1 sprint | Language LOCKED Python at charter creation. Impossible to pivot. |
| **L2** — Whole-project CI as G4 evidence was noisy | G4 uses offline `import-linter` scoped to `apps/pdf-extractor/`. Deliberate-violation proof is local CI only. |
| **L3** — `PHASE-2` was a charter-invalid status label | Status enum strictly `ACTIVE \| DONE \| FAILED` in `pilot-status-pdf-extractor.json`. No operational labels. |
| **L4** — decisionMatrix authorship was undefined | §Constraints binds PO-only authorship, atomic with 12/12 terminal grade. |
| **L5** — Pre-revert tags missing | Three pre-revert tags mandated Day 0: `pdf-extractor-pre-ci` (before G4 CI), `pdf-extractor-pre-delete` (before G5 _deprecated/ move), `pdf-extractor-pre-inject` (before G10 bug injection). |
| **L6** — Synchronous user verbal confirm blocked G9 for 4 cycles | G9 Path B (PO Playwright headless) is Day-0 default. PO does not wait for user schedule. |
| **L7** — SSOT discipline, L84 staging, anchor retroactively enforced | All baked Day 0: L84 explicit-file staging, no --force/--no-verify, anchor discipline, one active dispatch per task. |

---

## Hard Deadline

**6 sprints from kickoff 2026-05-24 = 2026-07-05.** Per canonical charter §Hard Deadline.

No silent extension. At 2026-07-05 PO calls the decision matrix regardless of goal state.

---

## Security Clause (Python-specific amplification)

The canonical security clause applies. For pdf-extractor the forbidden surface is WIDER:

**Sandbox env audit forbidden grep (must return EMPTY):**
```
env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|PDF_EXTRACTOR_DB|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"
```

**Scenario JSON forbidden content grep (must return 0):**
```
grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password|localhost:8765" apps/pdf-extractor/sandbox/
```

Any credential leak into the sandbox env or scenario JSON = G7 BLOCKED (does not pass).

---

## BCTC Freeze Interaction (pdf-extractor-specific constraint)

**Status (2026-05-24):** Recurring-bug freeze 1953-G-FAIL / 1954c is ACTIVE. BCTC pipeline freeze in force.

**Phase-1 tasks:** ALL CLEAR — no Phase-1 task touches BCTC code paths in mcp-server. Phase-1 scope is Python-side only (scaffold + primitives + module + dashboard within `apps/pdf-extractor/`).

**Phase-2 G5b tasks:** HARD FROZEN — rewiring `fetch_ssc_reports`, `bctc_batch_sweep`, and related MCP tools to call pdf-extractor primitive API endpoints requires touching `fetchParseAndStoreBctc.ts` and related mcp-server BCTC code. PM MUST NOT dispatch G5b rewire tasks until PO explicitly emits a freeze-lift signal for 1954c.

**Architect will re-flag this in Phase-2 task plan.**

---

## Pre-Revert Tags (Day 0 mandate)

| Tag | When created | Who creates | Purpose |
|---|---|---|---|
| `pdf-extractor-pre-ci` | Phase 2 — immediately before import-linter CI job activation | dev-pdf-extractor | Rollback point if CI job causes false positives blocking all pushes |
| `pdf-extractor-pre-delete` | Phase 2 — immediately before G5 `git mv` to `_deprecated/` | dev-pdf-extractor | Rollback point if deletion breaks the service |
| `pdf-extractor-pre-inject` | Phase 2 — immediately before G10 bug injection commit | qa | Rollback point if injected bug corrupts more than target |

All three tags are mandated in Phase-2 handoff specs. PM must reference them.

---

## Constraints (Binding Day 0)

- L84 explicit-file staging: `git add <path>` per file. NEVER `-A` or `.`
- No `--force`, no `--no-verify`, no `--no-gpg-sign`
- No `git push` of source/CI changes (local-only; user owns push)
- All work on `main` (NO branches per CLAUDE.md)
- SSOT: one active dispatch per task. No shadow signals.
- Anchor discipline: once frozen, no retag/rewrite/push
- Charter §4.5 matrix-authorship rule: PO-only, atomic with 12/12 terminal
- Notebook + signal hygiene per cycle-19 naming contract
- WIP=1 per phase (single dev-pdf-extractor agent; sequential tasks)
- BCTC freeze respected: no mcp-server BCTC code touch until 1954c cleared

---

## Status Tracking

SSOT: `docs/data/pilot-status-pdf-extractor.json` (schema: `docs/data/pilot-status-schema.json`).

Pilot is DONE when all 12 G-goals are YES and decisionMatrix is terminal (PO-only atomic commit).
Pilot is FAILED when 0-1 YES verdict is reached OR hard deadline 2026-07-05 is exceeded.
