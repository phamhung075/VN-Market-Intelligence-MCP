---
title: "Language Pivot Decision — technical-analysis pilot"
date: "2026-05-22"
author: "po"
status: "FINAL"
pilot: "technical-analysis"
supersedes:
  - "docs/architecture-briefs/2026-05-14-go-migration-3-services.md §7 (TA-stay categorization)"
  - "Architect Option C recommendation in docs/architecture-briefs/2026-05-22-language-pivot-evaluation.md"
authority: "user direct verdict 2026-05-22 — verbatim message: \"B\""
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
evaluation_ref: "docs/architecture-briefs/2026-05-22-language-pivot-evaluation.md"
---

# Language Pivot Decision — `technical-analysis` Pilot

**Decision is FINAL. Multi-option debate is CLOSED.**

---

## Verdict

**Option B — Full rewrite in Go.**

The `technical-analysis` pilot will be re-implemented in Go from day one. All 6 TypeScript commits landed during Phase 1 will be reverted. Phase 1 reboots in Go on the same charter (G1-G12 unchanged, deadline 2026-07-03 unchanged).

---

## Authority

User direct verdict on 2026-05-22. Verbatim user message: **"B"**.

This message was given in response to the architect's Option-A/B/C/D evaluation in `docs/architecture-briefs/2026-05-22-language-pivot-evaluation.md` and supersedes:

1. **Architect Option C recommendation** (finish TS, defer Go to next service) — overridden by the user verdict.
2. **2026-05-14 Go-migration brief §7** (which categorized TA as low-crash-risk / TS-stay) — overridden because user signal now treats Go as a structural requirement, not a crash-risk hedge.

The PO records this verdict as binding. No further options are evaluated. No counter-proposal is opened.

---

## Sign-off on the architect's three open questions

The evaluation brief §5 ("Open Questions PO Must Weigh") posed three questions. The PO records the following sign-offs:

### Q1 — Is "prefer Go if possible" a direction or a hard requirement?
**Sign-off: BLOCKING for this pilot.** The user clarified the signal by selecting Option B over Option C. Selecting B explicitly accepted the 3-4 day revert/rework cost over a zero-rework TS path. That choice means "prefer Go" is operative as a blocking requirement for the technical-analysis pilot, not a directional preference. Future fractals (macro-indicators, etc.) inherit the same default: Go-first unless a stronger constraint overrides.

### Q2 — Is macro-indicators the correct Go pilot target?
**Sign-off: Macro-indicators stays in Go scope.** It remains the next fractal target after the TA pilot closes. The decision matrix in `pilot-charter.md` §Outcome continues to name macro-indicators as the scale target. Go is now the implementation language for that fractal as well — no separate brief required, this decision generalizes.

### Q3 — Does the readonly `bun:sqlite` handle in TA need to be eliminated before Phase 2?
**Sign-off: moot.** The question was framed as a Phase-2 trigger for migrating TA from TS to Go. Since TA is now Go from day one, no migration trigger remains. The Go re-implementation will use whatever SQLite driver pattern the architect's composition-root.go spec specifies (likely `mattn/go-sqlite3` or `modernc.org/sqlite` — architect to decide). Readonly contract preserved.

---

## Sunk-cost ledger (accepted)

Six commits landed during Phase 1 in TypeScript. All six will be reverted. PO accepts this sunk cost as the price of the language pivot.

| Commit | Scope | Revert action |
|---|---|---|
| `16a04a00` | created `apps/technical-analysis/composition-root.ts` | delete file |
| `a22acdf3` | updated `apps/technical-analysis/package.json` entry point | restore prior entry-point field |
| `3f522dc3` | updated `apps/technical-analysis/Dockerfile` CMD + COPY | restore prior CMD + COPY lines |
| `241631af` | created `apps/technical-analysis/src/interface/openapi.yaml` | delete file (OR keep — language-agnostic; see §Note below) |
| `20ed83d5` | deleted `apps/technical-analysis/src/index.ts` | restore the deleted file from git history |
| `6248f3da` | created `packages/primitives/technical-analysis/calculate-rsi.ts` + test + 3 scenario JSONs | delete the `.ts` + `.test.ts`; **scenario JSONs are rescuable** (language-agnostic) |

**Note on rescue:**
- The 3 scenario JSON files from `6248f3da` are language-agnostic by design (charter §G1, evaluation brief §2 Scoring Table "Scenario-JSON portability" row). Developer should attempt to preserve them through the revert (e.g., by checking them out into a holding location before `git revert`, then re-committing them after the Go scaffold lands). If preservation is mechanically too risky, regenerate from scratch — Wilder's RSI test vector is documented in `p0-4-composition-root-plan.md`.
- The `openapi.yaml` from `241631af` is also language-agnostic. Developer SHOULD preserve it. The Go composition root will serve the same HTTP contract.

**Schedule impact:** ~3-4 days of rework against the 6-sprint deadline of 2026-07-03. User accepted this cost by selecting Option B over Option C. PO will not entertain re-litigation of the schedule risk.

---

## Charter alignment

This decision re-aligns Phase 1 with the original **2026-04-24 DDD microservices plan** (which named Go as the TA implementation language) and **supersedes the 2026-05-14 de-scope decision** (which had carved TA out of Go migration on crash-risk grounds).

**Charter goals G1–G12 are unchanged.** All twelve goals are language-agnostic (they gate on scenario JSON pass/fail, dashboard red/green, and AI fix-cycle count — none of which depend on Go vs TS). The charter sees the Go re-implementation as a Phase 1 reboot, not a charter amendment. Only the `## Amendments` section of `pilot-charter.md` records the language lock; goal wording stays identical.

**Pilot deadline unchanged:** 2026-07-03.
**Sprint count unchanged:** 6 sprints from kickoff.
**Decision matrix unchanged:** Speed / Trust / Scale, 3-YES = scale, 2-YES = rescope, 0-1-YES = stop-MVR.

---

## Operational state changes

The following SSOT files are updated as part of this decision (separate deliverables):

1. **`docs/data/pilot-status.json`** — `languageDecision` field added, `phase1.status` set to `"PIVOTING"`, `pivotEvent` block added recording the 6-commit revert + decision-doc pointer.
2. **`docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`** — `## Amendments` section receives a 2026-05-22 entry noting the language lock; G1–G12 untouched.
3. **`docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md`** — NEW task plan stub replacing the now-obsolete TS plan. Tasks renumbered P1-*g* suffix for Go variants. Dashboard tasks (P1-E1, P1-E2) keep their IDs since they are language-agnostic.
4. **`docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan.md`** — becomes obsolete reference; not deleted (kept for historical traceability). Architect MAY add an obsolescence banner at the top in a follow-up commit; PO does not block on this.
5. **`docs/handoffs/TASK_pivot-B-revert.md`** — NEW handoff for the developer (or dev-technical-analysis if Go-capable) to execute the 6-commit revert.

---

## Out-of-scope follow-ups (architect responsibility, NOT this decision)

These items are flagged for the architect to address in a follow-up brief — they are NOT in the PO decision scope and PO does not block on them:

- **`.claude/flows/dev-technical-analysis/main.md` Go-awareness.** The dev-technical-analysis agent's flow is currently TypeScript-shaped (refers to `bun test`, `bun tsc --noEmit`, etc.). For the Go reboot the flow will need a revision to call `go test ./...`, `go vet`, `staticcheck`. PO flags this as an architect follow-up. PO does NOT edit the flow file directly (that is agent-father territory per global rules).
- **Composition-root.go specification.** The architect's existing `p0-4-composition-root-plan.md` §5.2 specifies the TS composition root. An equivalent Go spec is needed: `cmd/server/main.go`, `internal/` DDD layout, `go.mod`, Dockerfile multi-stage, OpenAPI contract unchanged. Architect to author after this decision lands.
- **Go primitive layout convention.** Where do Go primitives live? Options: `packages/primitives/technical-analysis/` (mirror TS path, accept `.go` files alongside) or a new `internal/primitives/` inside the TA app. Architect to decide. PO recommendation: keep `packages/primitives/` as the shared home and let language be a file-extension concern, so the three-tier metaphor stays uniform across services. Not binding — architect call.

---

## Next dispatch

> **Next:** main terminal dispatches `developer` (or `dev-technical-analysis` if that agent can handle Go — confirm in `TASK_pivot-B-revert.md`) on the revert handoff. After revert lands as a single atomic commit on `main`, main terminal dispatches `architect` to author the Go composition-root spec (equivalent to `p0-4-composition-root-plan.md` §5.2 but in Go idioms: `cmd/server/main.go`, `internal/`, `go.mod`, multi-stage Dockerfile). Once architect spec is approved by PO, `pm` writes atomic tasks into `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md` referencing that spec. Then main terminal resumes dev dispatch starting at P1-A1g.

---

## Sign-off

- **Decided by:** user (verbatim "B"), recorded by `po`.
- **Date:** 2026-05-22.
- **Status:** FINAL. No re-litigation. Closure.
