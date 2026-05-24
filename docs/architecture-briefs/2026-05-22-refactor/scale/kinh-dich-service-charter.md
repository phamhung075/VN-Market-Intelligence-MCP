---
title: "Scale Charter — kinh-dich-service"
date: "2026-05-24"
author: "po"
status: "READY"
service: "kinh-dich-service"
owner: "dev-kinh-dich"
language: "Go (PIVOTED from TS/Bun — see decision doc)"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
pivot_decision: "docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md"
---

# Scale Charter — `kinh-dich-service`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `kinh-dich-service` for `technical-analysis` and `dev-kinh-dich` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking:** `docs/data/refactor-status-kinh-dich-service.json`
→ **Language pivot ratification:** `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-kinh-dich` |
| **Language** | **Go — PIVOTED from TS/Bun.** Mirrors the TA Option-B pivot. See `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md`. |
| **Anti-scope-creep boundary** | `apps/kinh-dich-service/` ONLY. |

### Current state — MONOLITH-ish TS DDD → TS→Go REBOOT

`apps/kinh-dich-service/` is pure TypeScript/Bun today with a full DDD `src/` tree (`primitive/`, `module/`, `application/`, `domain/`, `infrastructure/`, `interface/`, `__tests__/`, `_deprecated/`). It is **NOT** yet a Go service.

This service is a **TS→Go reboot** (mirrors the TA Phase-1 reboot, where 6 TS commits were reverted and Phase 1 restarted in Go). The existing TS implementation is the **behavioral oracle** — it defines exactly what the Go primitives must reproduce — but no TS file ships in the final service.

**Existing TS primitives (rewrite as Go primitives, charter G1):**
`hao-encoder`, `hexagram-resolver`, `ngu-hanh-classifier`, `nuclear-hexagram-computer`, `reading-scorer`.

**Existing TS module (rewrite as Go module, charter G2):**
`reading_composer`.

Full reboot mapping table: see decision doc §TS→Go Reboot Scope. Behavioral parity vs the TS tests + the Kinh Dich logic reference is the gate.

### Candidate primitives (target-state §Kinh Dich primitives)
`kinh-dich-hexagram-resolver`, `kinh-dich-hao-encoder`, `kinh-dich-nuclear-computer`, `kinh-dich-transformed-computer`, `kinh-dich-ngu-hanh-classifier`, `kinh-dich-formatter`, `kinh-dich-hexagram-library`. Module candidate: `kinh-dich` (reading composer).

### Key risks
1. **TS→Go behavioral parity.** Hexagram resolution, Hao encoding, nuclear/transformed computation, and Ngu Hanh classification are intricate deterministic logic. A subtle Go port error silently produces a wrong reading. Mitigation: scenario JSON derived from the TS test vectors (charter G1 ≥3 scenarios incl. failure per primitive) IS the parity proof — exactly the trust contract this refactor exists to provide.
2. **Hexagram static data migration.** `domain/hexagram-data.ts` is a large static store. Migrate the data faithfully; rewrite only the accessor. Data-transcription error is a distinct risk from logic error.
3. **Pivot prerequisites.** The Go reboot cannot start until agent-father flips `dev-kinh-dich` language → Go and `system-map.json` kinh-dich-service.language → go (signal dropped — see decision doc §Operational State Changes). Until then the owner specialist is still TS-shaped.

### Pure-function fit
Kinh-dich is pure deterministic computation with zero external-API dependency — the ideal sandbox profile (Security Clause trivially satisfied: no creds, no keys ever needed).
