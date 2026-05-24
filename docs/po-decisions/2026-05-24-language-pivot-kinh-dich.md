---
title: "Language Pivot Decision — kinh-dich-service pilot (TS/Bun → Go reboot)"
date: "2026-05-24"
author: "po"
status: "FINAL"
pilot: "kinh-dich-service"
authority: "USER DIRECTIVE (explicit, 2026-05-24) — overrides PO prior recommendation"
precedent: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md (TA Option-B Go pivot)"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md"
canonical_charter: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
supersedes:
  - "docs/architecture-briefs/2026-05-22-refactor/scale/README.md §kinh-dich Go-pivot REJECTED (now RATIFIED, user override)"
pilot_status_ssot: "docs/data/pilot-status-kinh-dich.json"
---

# Language Pivot Decision — `kinh-dich-service` Pilot

**Decision is FINAL. This is a USER-DIRECTIVE ratification, not a PO re-evaluation. No re-litigation.**

---

## Verdict

**Pivot `kinh-dich-service` from TypeScript/Bun → Go. TS → Go reboot.**

The completed TypeScript kinh-dich pilot (12/12 goals YES, verdict=`scale`, ~900 files) is reopened. The hexagram-resolver + four sibling primitives, the `reading_composer` module, the composition root, and the sandbox dashboard are re-implemented in Go from scratch. The 12-goal charter (G1–G12) is language-agnostic and unchanged — the Go reboot must re-earn each goal on Go evidence.

This mirrors the **technical-analysis Option-B Go pivot** (`docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md`) exactly: same reboot pattern, same charter, same anti-scope-creep clause (kinh-dich-service only).

---

## Authority

**USER DIRECTIVE, explicit, 2026-05-24.** The user was shown the full cost of this pivot — that kinh-dich is a *completed* TS pilot and a Go reboot discards ~900 files of earned, working, dashboard-green code — and directed the PO to **force the Go reboot anyway**.

This is recorded as a user-authority decision. It supersedes the PO's prior reservation (see §PO Reservation below) and the "REJECTED" entry in `docs/architecture-briefs/2026-05-22-refactor/scale/README.md`, which is updated to "RATIFIED (user override 2026-05-24)" as part of this decision.

---

## Rationale (as given by the user)

**Consistency.** All core compute services standardize on Go + a single Go sandbox toolchain. With technical-analysis, macro-indicators, stock-price, and alert-engine already on Go, kinh-dich-service is the last TypeScript core compute service. Pivoting it to Go gives the fleet one language, one test runner, one sandbox harness, and one fence tooling story across every compute service — removing the dual TS/Bun + Go maintenance surface for the agent fleet.

---

## PO Reservation (acknowledged + overridden)

For the record, in the prior groundwork cycle the PO **declined** this pivot on ground-truth: `pilot-status-kinh-dich.json` showed kinh-dich was an already-closed pilot (verdict=`scale`, completed in TypeScript, `language_locked: true`, "no rewrite step"). The PO's reasoning was that rebooting a successfully-scaled service to Go for consistency alone discards a completed pilot and rewrites ~900 files of working, dashboard-green code — not a sound PO trade on its own merits.

**That reasoning was sound and remains on record.** The reservation is hereby:

- **Acknowledged** — the cost is real: a completed TS pilot is discarded; ~900 files are rewritten in Go; G1–G8, G10–G12 evidence must be re-earned; the TS earned-history is retired (preserved in archive, not destroyed).
- **Overridden** — the user holds final product authority (per PO-full-autonomy: user is non-technical, trusts PO to improve product, but the user's *explicit* directive is binding). The user weighed the discard cost explicitly and chose fleet consistency. The PO executes the directive without further counter-proposal.

No further options are evaluated. The multi-option debate is closed by user authority.

---

## Sunk-cost ledger (accepted, preserved not destroyed)

The TS pilot reached terminal 12/12 (verdict=`scale`) on 2026-05-24. Its earned history is **archived, not deleted**:

| Asset | Disposition |
|---|---|
| TS pilot completion record (goals, decisionMatrix, phase history) | Moved under `tsCompletionArchive` in `pilot-status-kinh-dich.json` — preserved verbatim for traceability |
| 5 TS primitives (`src/primitive/*`) | Re-implemented in Go; TS sources revert/replace per charter |
| `reading_composer` module (TS) | Re-implemented in Go (Go ports/DI) |
| TS composition root (`src/index.ts`) | Replaced by Go `cmd/server/main.go` |
| TS sandbox dashboard (`dashboard/index.html`) | Rebuilt to render from Go sandbox traces |
| Scenario JSON files (`docs/scenarios/kinh-dich/`) | **Language-agnostic — rescuable.** Dev SHOULD preserve through the reboot. |
| OpenAPI YAML (`src/interface/openapi.yaml`) | **Language-agnostic — preserve.** Go composition root serves the same HTTP contract on port 5005. |
| ESLint fence (`eslint.config.mjs`) | Obsolete — Go uses `depguard` via golangci-lint (G4 Go path, per schema `_title_note`). |

**Schedule impact:** a full TS→Go reboot of a ~900-file completed pilot. The user accepted this cost explicitly. PO will not re-litigate schedule risk.

---

## Charter alignment

**Charter goals G1–G12 are unchanged.** All twelve are language-agnostic (they gate on scenario JSON pass/fail, dashboard red/green, and AI fix-cycle count — none depend on Go vs TS). The canonical goal definitions live in `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`. The Go reboot is a Phase-1 restart on the same charter, not a charter amendment.

**Deadline / sprint count / decision matrix / anti-scope-creep clause:** unchanged. Scope stays **`apps/kinh-dich-service/` only**.

The G4 fence tool changes language by necessity: TS used `eslint-plugin-boundaries`; Go uses `depguard` via golangci-lint (per `pilot-status-schema.json` G4 `_title_note`). This is a tooling consequence of the language lock, not a goal change.

---

## Operational state changes (separate deliverables in this decision)

1. **`docs/data/pilot-status-kinh-dich.json`** — `status` DONE → ACTIVE; `language` TypeScript → Go; `languageLockSource`/`languageLockedAt` repointed to this doc; `userDirected: true`; `pivotEvent` block added (mirrors TA); prior TS completion record archived under `tsCompletionArchive`; G1–G8 + G10–G12 reset to TBD; G9 held with re-confirm note. Conforms to `docs/data/pilot-status-schema.json`.
2. **`docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md`** — NEW thin, delta-only reboot charter; points to canonical `pilot-charter.md` for G1–G12.
3. **`docs/architecture-briefs/2026-05-22-refactor/scale/README.md`** — §kinh-dich "REJECTED" → "RATIFIED (user override 2026-05-24)".
4. **agent-father signal** (`docs/signals/po-{ts}.json`, via DASHBOARD `## agent-father`) — flip `.claude/agents/dev-kinh-dich.md` language TS/Bun → Go; reconcile `docs/data/system-map.json` for three services (kinh-dich-service ts→go + technical-analysis ts→go drift + macro-indicators ts→go drift). PO cannot edit agent files or system-map directly.

---

## Out-of-scope follow-ups (architect / agent-father responsibility — PO does not block)

- **`.claude/flows/dev-kinh-dich/main.md` Go-awareness.** Flow is TS-shaped (`bun test`, `tsc --noEmit`, ESLint fence). Go reboot needs `go test ./...`, `go vet`, `staticcheck`, `golangci-lint`/`depguard`. agent-father owns (signal D4 covers the agent file; flow revision is the architect/agent-father follow-up).
- **Composition-root.go spec + Go primitive layout** (`pkg/primitive/` vs `internal/`). Architect to author, mirroring the TA Go reboot pattern.
- **system-map.json language reconciliation** for the two already-Go-pivoted drift services (TA + macro) — routed to agent-father in D4 because PO does not edit system-map directly.

---

## Sign-off

- **Decided by:** user (explicit directive 2026-05-24 — force Go reboot), recorded by `po`.
- **PO reservation:** acknowledged + overridden by user authority.
- **Date:** 2026-05-24.
- **Status:** FINAL. No re-litigation. Closure.
