# Signal-Type/Severity Open Producer Namespace — Registry-Derived Routing, Not a Closed Schema Enum

**Task ID:** FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES (P0) · **Companion (same defect surface, fold together, do not fix separately):** FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (P1, backlog[])
**Agent:** architect · **Date:** 2026-08-23
**Trigger:** CI RED on HEAD (`3dc53eb7`, `b485aa3c7`) — `signal-type-coverage-guard` job fails on unrouted `to=po` type `audit-handoff`; row `tra-20260822T203234` deliberately left open by PO as evidence, not closed to game the guard.

---

## 0. TL;DR

**Recommend direction (b) — registry-derived routing + self-filing fallback. Reject direction (a) — closed `type`/`severity` enum in `SignalRowSchema`.**

(a) is rejected on a measured, not assumed, mechanism risk: `orch-apply.sh` validates the **entire** candidate document with one all-or-nothing `OrchStateSchema.safeParse` (`scripts/orch-validate.mjs`, Stage 1) — a hard `z.enum()` on `type` or `severity` would reject the **whole write transaction** the first time any agent's flow doc emits a value outside the enum, not just misroute that one signal. Live measurement this session: `severity="WARN"` — not a member of the already-defined `SignalSeverityEnum` — is **65-69% of all live signal rows right now** (WARN 15/23 `to=po`, 20/29 all rows). Enforcing the canonical enum today would reject roughly two-thirds of current traffic outright. `type` is worse in kind: ~101 distinct historical tokens (PO's 2026-08-13 measurement, corroborated below), authored ad hoc by dozens of independently-owned flow docs with no ratification step, growing organically — new detector types are the *normal* output of adding a detector, not drift to be stamped out.

(b) already exists in part and is proven: `scripts/audits/guard-signal-type-coverage.sh` (2026-08-22) derives its allowed-type set by **parsing the routing tables themselves** (no hand-maintained duplicate array) and is wired into CI. What's unfixed is that the routing *surface* is still split across disjoint, independently-authored tables with no cross-pipeline check, and an unrouted type still only produces a CI-log line — no assignable, dedup-able work item. This brief closes both gaps without touching the Zod schema.

---

## 1. Verified premise

**Producer namespace is unconstrained by design, confirmed at the schema:**
```ts
// apps/mcp-server/src/infrastructure/orchStateSchema.ts:272-289
export const SignalSeverityEnum = z.enum(["CRITICAL", "HIGH", "MED", "LOW", "INFO"]);
export const SignalRowSchema = z.object({
  ...
  severity: z.string(),   // ← SignalSeverityEnum defined above, never referenced here
  ...
  type: z.string().optional(),
}).passthrough();
```
`SignalSeverityEnum` exists and is exported but is dead code with respect to `SignalRowSchema` — declared, never enforced. `type` has no enum at all. Same shape, same file, same root cause.

**Write path confirmed all-or-nothing (read `scripts/orch-apply.sh` + `scripts/orch-validate.mjs` headers):** every write to `docs/data/orch/orch-state.json` — from any agent, any flow doc — routes through `orch-apply.sh`, which runs `bun scripts/orch-validate.mjs` (`OrchStateSchema.safeParse` on the **whole candidate document**) as Stage 1. Exit 2 = schema violation → **entire write rejected**, atomic rename never happens. Nothing partially applies. This is the correct, deliberate design for corruption-prevention (`TaskSchema.status` uses exactly this gate as "the primary corruption guard," per the schema's own comment) — but it means any field promoted to a hard enum becomes a live-traffic-wide kill switch the moment a producer emits a value the enum doesn't yet have, since board writes are typically compound (`jq '<transform>'` bundling multiple unrelated mutations in one call).

**Live measurement, this session, `.signal_queue.rows[]` (hot ~24h window):**
| slice | type distribution | severity distribution |
|---|---|---|
| `to=="po"` (n=23) | `auditor_cycle_missing` 11, `cron_fire_gap` 3, `signal_feedback` 3, `narrative_contradiction` 2, `audit-handoff` 1, `auditor_cycle_loss` 1, `db_freshness` 1, `system-issue` 1 | WARN 15, CRITICAL 4, MED 3, LOW 1 |
| all rows (n=29) | — | WARN 20, CRITICAL 5, MED 3, LOW 1 |

`WARN` appears in neither `SignalSeverityEnum` (`CRITICAL/HIGH/MED/LOW/INFO`) — it is not a rare legacy straggler, it is the plurality value in the live window, right now. **This is the identical defect class the router asked me to measure, not assume — confirmed live, and more acute than `type` by non-conformance rate.**

**Precedent that closed enums work in this exact pipeline — and why it doesn't transfer:** `TaskSchema.status: StatusEnum` (13 values, `orchStateSchema.ts:109-125`) is a hard `z.enum()` and is explicitly "the primary corruption guard." It works because task status is a small, centrally-ratified (PO decides new values — 2 added over months, `READY`/`DEGRADED`), slow-growing vocabulary every agent already knows before writing. Signal `type` fails all three properties: ~101 historical distinct tokens (PO 2026-08-13 measurement; independently corroborated below at smaller scale), authored per-emission by whichever flow doc needs to escalate something, with no ratification gate, and growing on a roughly weekly cadence (`auditor_cycle_loss`, `auditor_cycle_missing`, `cron_fire_gap`, `db_freshness`, `narrative_contradiction` all first appeared 2026-08-01→2026-08-22 per `guard-signal-type-coverage.sh`'s own header — 5 new types in 3 weeks).

**AC-2 doc-accuracy claims, independently re-verified this session (not merely cited) — both false:**
`docs/agents/po/flow/triage-signals.md:59` (line drifted from the router's cited `:35` due to intervening edits; content matches):
> "the remaining ~40 cold-archive types are ≤1-2 fires each... `system_issue` underscore predates the live `system-issue` hyphen form... historical artifact, not a live routing gap"

Directly measured via `grep -c '"type":"system_issue"'` / `'"type":"system-issue"'` across `docs/data/orch/archive/2026-0{6,7,8}.json` + hot file:
| form | 2026-06 | 2026-07 | 2026-08 | total |
|---|---|---|---|---|
| `system_issue` (underscore) | 20 | 86 | 6 | **112** |
| `system-issue` (hyphen) | 0 | 51 | 57 | **109** |

Both spellings are concurrently live through August — underscore fired **6 times this month**, not "historical." The claimed precedence is inverted, and at 109-112 fires each these are the two largest classes in the whole namespace, not stragglers. PO's own 2026-08-13 measurement (already on this row's `detail_ref`, cited not re-derived) lists 16 types exceeding "≤1-2 fires," topped by `system_issue` 111 (matches my independent count within rounding), `repair_task_request` 22, `cron_fire_gap` 19, `agent_flow_defect` 9, `audit-handoff` 7. Both AC-2 claims are false and must be corrected, not merely re-verified — a static "these are rare, skip them" assertion in a doc will always go stale against a namespace this active; it should be replaced with an instruction to consult the derived registry (§3) rather than a frozen claim.

**Today's concrete CI-red instance is a correct guard firing on a real gap, not a guard bug:** `audit-handoff` has a Pipeline-A rule (`triage-signals.md`, keyed on `sender=tran-ngoc-bau`) but no Pipeline-B rule; the tripping row `tra-20260822T203234` arrived on Pipeline B (`.signal_queue.rows[]`). The doc's own text already warns "DO NOT assume Pipeline A's table covers these" (line 15) — nothing machine-enforces that warning. This is a **third disjoint hand-curated surface problem**, not just two: independently confirmed a **third and fourth** low-traffic table exist — `.claude/skills/signal-dashboard/SKILL.md` § Signal types (6 rows, explicitly documented as "non-exhaustive quick-reference," not routing-critical) and `.claude/skills/signal-dashboard/reference.md` § Docs-to-read (6 rows, same). Neither blocks CI; both are additional evidence of the surface-multiplication pattern, out of this brief's fix scope.

**Pipeline-A has no machine coverage at all:** grepped `scripts/audits/*.sh` and `.github/workflows/ci.yml` for `pending_triage_inbox` — zero hits. Only Pipeline B (`.signal_queue.rows[]`) is guarded. Pipeline A (`.dev_team_idle_chain.pending_triage_inbox[]`) relies purely on PO's own manual-read discipline.

---

## 2. Decision: (b) registry-derived routing + self-filing fallback. Reject (a).

**Why not (a) (closed `z.enum()` on `type`, and by the same argument `severity`):**
- Confirmed structural risk, not hypothetical: `orch-apply.sh`'s Stage-1 gate is whole-document and all-or-nothing. A hard enum converts "this signal is silently misrouted" (today's defect — bad, but bounded to that one signal) into "this write is entirely rejected" (a defect that can strand unrelated board mutations bundled in the same `jq` transform, fleet-wide, the instant any producer emits a new value). For `severity`, this is not a future risk — it would reject ~65-69% of *today's* traffic immediately.
- No governance mechanism exists to gate new type creation before first use, and building one is a materially larger, ongoing coordination cost (every one of dozens of independently-owned flow docs would need a "register before you emit" step) for a namespace whose growth is closer to a designed extensibility point (new detector → new type, by definition) than to accidental drift.
- Migration cost if attempted anyway: enumerate ~101 historical tokens, decide current-vs-dead, update the schema, and add a hard failure mode for every future new type across the whole fleet — large, ongoing, and the wrong shape for solving "the routing *table* is incomplete," which is a documentation/dispatch problem, not a data-integrity problem the way task-status corruption is.

**Why (b), and why it is not "another `$routed` table patch":**
The 2026-08-22 fix (`guard-signal-type-coverage.sh`) already solved the *specific* failure mode that sank the 2026-08-07 and 2026-08-13 patches — a hand-copied `$routed` array going out of sync with the table it mirrors. That array no longer exists; the guard parses the tables directly. What still causes red CI is a **different, still-open** structural gap: the tables themselves are disjoint per pipeline with no cross-check, and an unrouted type produces no actionable artifact, only a CI-log line someone must notice and manually diagnose (measured: this exact manual-diagnosis loop has now run at least 7 times — 08-06, 08-07, 08-08, 08-11, 08-12, 08-13, 08-23 — without converging, because the type namespace grows faster than any one pass closes it). Direction (b) targets that mechanism, not the current red's specific missing row.

---

## 3. Design — three parts, ship together (none touch `orchStateSchema.ts`)

**Part 1 — Unify pipeline-scoped coverage into one generated, self-verifying registry.**
Extend `scripts/audits/guard-signal-type-coverage.sh` (or split into a new `scripts/audits/derive-signal-type-registry.sh` that the guard calls) to:
- Parse **both** `triage-signals.md` tables (Pipeline-A *and* Pipeline-B — today only Pipeline-B is parsed) + `triage-signals-longtail.md`, tagging every row `{type, pipeline: "A"|"B", from, action_ref}`.
- Check each pipeline's live inbox (`.signal_queue.rows[]` for B, `.dev_team_idle_chain.pending_triage_inbox[]` for A — new coverage, Pipeline A currently has none) against **only its own pipeline's** tagged subset. This mechanically forecloses the "routed in the *other* table" class that caused today's `audit-handoff` red — a type can no longer be considered covered by a rule that structurally cannot fire for the pipeline it actually arrived on.
- Same extraction technique already proven live (awk-scoped section + backtick-column regex) — no new parsing approach, generalized to two tables instead of one.

**Part 2 — Convert the unrouted-type fallback from CI-log-only into a self-filing artifact.**
On an unrouted type, in addition to the existing `exit 1` (keep — CI-red-as-forcing-function has correctly worked every time it fired), mint or update (dedup-keyed on the type string) a `task_board.backlog[]` row via the same `orch-apply.sh` gate every other writer uses, using the existing `routing-gap` type-vocabulary slot (already a live signal type, presently itself unrouted — the correct existing name for this class of finding). This closes the specific complaint already recorded twice in this row's own history (2026-08-13 verdict R2(ii); repeated in today's CI-red fold note): "the guard exists and correctly fires, but nothing schedules the follow-up work" — the detector already runs every push; a detection still doesn't yet produce a queued, assignable work item without a human separately reading the CI log.

**Part 3 — Doc-accuracy correction (AC-2), same file, same pass.**
Replace `triage-signals.md`'s two falsified Cold-archive cross-check claims (§1 above) with the measured figures, and replace the "historical artifact, not a live routing gap" framing (which will itself go stale again) with an instruction to consult the Part-1 registry output rather than a frozen prose claim.

**Immediate, separate, tactical bridge (necessary but explicitly NOT the fix):** the live CI red also needs one Pipeline-B table row added for `audit-handoff` so the fleet's push path unblocks now, while Parts 1-3 land. This is exactly the "$routed table patch" class the router said not to *propose as the solution* — it is not proposed as the solution here; it is named as a same-pass prerequisite that must ship *together with* Parts 1-2, or the guard goes red again on the next new type exactly as it has 7 times already. Row `tra-20260822T203234` should be triaged normally once the Pipeline-B rule exists — not specially closed beforehand to quiet the guard (per router's explicit instruction; this brief does not close it).

**Severity — same defect class, confirmed, recommend deferred not bundled:** do not hard-enum `severity` for the same write-outage reason as `type` (§2), but extend Part 1's tooling to also *report* (lint-only, non-blocking) severity values outside `SignalSeverityEnum`. Deciding the `WARN` → canonical mapping (most likely folds to `MED`, or `WARN` becomes a 6th canonical value) is a real, small, separate decision — PO/architect should rule on it explicitly rather than have it silently absorbed into this row's already-large scope. Flagged, not fixed here.

---

## 4. Migration cost

- Part 1: extend one existing, already-CI-wired script (`guard-signal-type-coverage.sh`) using its own proven extraction pattern, generalized to a second table + a second live-data source (`pending_triage_inbox`). No new toolchain, no schema change. Zone: `scripts/` + `.github/workflows/ci.yml` (amend existing job, no new job needed).
- Part 2: one additive `task_board.backlog[]` mint path through `orch-apply.sh` (already `.passthrough()`, no schema change), dedup-keyed on type string — small, additive, reuses the existing write gate every other writer already uses.
- Part 3: prose correction, ~10 lines, one file, no code.
- **`apps/mcp-server/src/infrastructure/orchStateSchema.ts` is deliberately untouched.** Not touching the Zod schema is the point — it keeps `orch-apply.sh`'s whole-document validation gate immune to the type/severity namespace's ordinary weekly churn.
- Classification: bug-fix/refactor, in-zone, no new primitives → **BUILD-STANDARD: not-applicable** (Standard Detection matrix). SPRINT-S scale.

---

## 5. Files

- `scripts/audits/guard-signal-type-coverage.sh` — extend to Pipeline-A + `pending_triage_inbox`, tag by pipeline, add self-filing mint on unrouted (dev-mcp-server or wherever fleet-shared audit scripts are zoned — not `apps/mcp-server` application code, no schema touch).
- `.github/workflows/ci.yml` — amend `signal-type-coverage-guard` job description/step only if the script is split into two files; no new job required.
- `docs/agents/po/flow/triage-signals.md` — Part 3 correction at the Cold-archive cross-check section (current line 59) + the tactical Pipeline-B `audit-handoff` row (bridge, ships alongside).
- **Unchanged, deliberately out of scope:** `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (`SignalRowSchema.type`/`.severity` stay `z.string()`/`.optional()` — see §2); `.claude/skills/signal-dashboard/SKILL.md` + `reference.md` (non-exhaustive quick-reference tables, not routing-critical, not blocking CI — noted in §1 as corroborating evidence only).

## 6. DDD / zone

Zone: `cross-service/` — `scripts/audits/` (fleet-shared tooling, not a single microservice) + `docs/agents/po/flow/` (flow-doc prose) + `.github/workflows/`. No `apps/<service>/` application code touched. Per PO's artifact-class routing ruling (2026-07-21, cited on this row's own history): script/tooling changes → zone-matched dev (`dev-mcp-server` owns `scripts/audits/*` in this repo's existing convention — confirmed via `grep -rln` producer-surface scan in §1, same family as `orch-apply.sh`/`orch-validate.mjs`); flow-doc/skill prose → `agent-father` or `po` (triage-signals.md is PO's own flow doc). PM should decompose into these two per-owner subtasks rather than one combined task, since they have different reviewers and different files.

## 7. Acceptance criteria

1. `guard-signal-type-coverage.sh --check` PASSes against the live `orch-state.json` after the tactical `audit-handoff` Pipeline-B row lands (unblocks CI).
2. A synthetic new type present only on Pipeline A (not B) is caught by the extended guard — proves the cross-pipeline blind spot (today's actual defect class) is closed, not just today's specific instance.
3. An unrouted-type CI failure produces a real `task_board.backlog[]` row (dedup-keyed, visible on next board read) — not only a CI log line.
4. `triage-signals.md`'s Cold-archive cross-check no longer asserts "≤1-2 fires each" or the inverted underscore/hyphen precedence claim.
5. `orchStateSchema.ts` diff is empty for this task — confirms the schema-untouched design constraint held.
6. Row `tra-20260822T203234` is triaged through the normal Pipeline-B rule once it exists — not closed as a side-effect of this task before the rule ships.
