---
title: "Scale Charter — pdf-extractor"
date: "2026-05-24"
author: "po"
status: "READY"
service: "pdf-extractor"
owner: "dev-pdf-extractor"
language: "Python"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `pdf-extractor`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
The 12 goals are language-agnostic — they gate on scenario JSON pass/fail, dashboard red/green, and AI fix-cycle count, none of which depend on Python vs Go. Apply verbatim, substituting `pdf-extractor` for `technical-analysis` and `dev-pdf-extractor` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking (canonical SSOT, schema = docs/data/pilot-status-schema.json):** `docs/data/pilot-status-pdf-extractor.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-pdf-extractor` |
| **Language** | **Python** (stays Python — OCR/PDF ecosystem constraint overrides Go-first default). |
| **Anti-scope-creep boundary** | `apps/pdf-extractor/` ONLY. |

### Current state — CLEAN PYTHON DDD

`apps/pdf-extractor/` already has DDD layers (`domain/`, `application/`, `infrastructure/`, `interface/`, `main.py`, `__tests__/`, `pyproject.toml`, `requirements.txt`). Clean Python service. **No primitive/module subfolders yet** — extraction is the first refactor task.

This is **rewire + extract**, not rebuild. The Python sandbox harness (scenario JSON runner + dashboard) is the analog of the Go `cmd/sandbox` — must be built/confirmed for Python (the pilot's `packages/primitives/sandbox-kit` narrator+renderer concept is language-agnostic; the runner is per-language).

### Candidate primitives (target-state §BCTC / financial-reports primitives)
Pure-function units in the OCR→parse→ratio pipeline: e.g. `confidence-scorer`, `decimal-normalizer` (fixes the decimal-shift bug class), `ratio-computer`, `field-extractor`, `low-confidence-gate`. Module candidate: `financial-reports`.

### Key risks
1. **OCR is impure / heavyweight.** The actual OCR call (Tesseract/model) and VPS PDF pull are NOT primitives — they are adapters. Primitives are the deterministic post-OCR transforms (normalize, score, compute ratios). Keep OCR/IO in `infrastructure/`; primitives stay pure (Security Clause — sandbox runs scenario JSON, never touches the VPS or model). This is the single most important boundary for this service.
2. **Known data-quality bugs.** Decimal-shift (VNM net_profit=0.000051, DHG rev=0.000009), confidence-threshold handling (0 skips insert; <0.2 low-confidence flag; ≥0.2 normal) are realistic G10 injection candidates.
3. **BCTC freeze interaction.** A recurring-bug freeze (1953-G-FAIL / 1954c architect rethink) currently governs the BCTC pipeline. **Coordinate scheduling with that freeze** — do not start refactor tasks that touch frozen BCTC code paths until the freeze lifts or architect clears the overlap. The refactor (structural) and the freeze (behavioral bug-fix block) must not collide. Flag to architect during phase expansion.
4. **Python sandbox tooling gap.** Unlike the Go services, no proven Python scenario runner exists yet. Building it is an early Phase task and a prerequisite for G1.
