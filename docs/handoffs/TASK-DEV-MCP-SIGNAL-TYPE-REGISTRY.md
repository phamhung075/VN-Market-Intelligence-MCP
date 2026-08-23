# TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY

**Zone:** `scripts/` · **Owner:** `dev-mcp-server` · **Size:** S (~2h) · **Priority:** P0

**Handoff from:** PM (decomposition of FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES per architect brief 2026-08-23)

---

## Mission

Extend `scripts/audits/guard-signal-type-coverage.sh` to parse **both** Pipeline-A and Pipeline-B signal routing tables, closing the split-table blind spot and converting the unrouted-type fallback from CI-log-only to a self-filing work item in `task_board.backlog[]`.

**Why this matters:** The current guard only checks Pipeline-B (`.signal_queue.rows[]`). When a new signal type arrives on Pipeline-A (`.dev_team_idle_chain.pending_triage_inbox[]`), a routing rule in Pipeline-B is wrongly considered "covering" it, even though Pipeline-B rules structurally cannot fire for Pipeline-A signals. This has caused the 2026-08-23 CI red (audit-handoff type routed in Pipeline-A only, Pipeline-B signal fails silently). Additionally, an unrouted type currently only produces a CI-log line that requires manual intervention to diagnose and schedule — no assignable work item is auto-minted.

---

## Acceptance Criteria

1. **Dual-pipeline parsing:** Guard parses the routing tables for BOTH pipelines
   - Pipeline-A: from `pending_triage_inbox[]` in `docs/data/orch/orch-state.json` (live inbox)
   - Pipeline-B: from `signal_queue.rows[]` in `docs/data/orch/orch-state.json` (live inbox)
   - Table sources: `docs/agents/po/flow/triage-signals.md` (both pipeline sections) + `docs/agents/po/flow/triage-signals-longtail.md`

2. **Pipeline tagging:** Each parsed routing rule is tagged by source pipeline (A or B) in the derived registry

3. **Cross-pipeline check:** A signal is routed **only if it has a rule for the PIPELINE it arrived on**
   - Example: `audit-handoff` with a Pipeline-A rule is NOT considered covered for a Pipeline-B signal
   - This mechanically forecloses the "routed in the other table" false-pass class

4. **Self-filing unrouted types:** On unrouted type detection
   - Mint or update a `task_board.backlog[]` row via `orch-apply.sh` (not just CI log exit 1)
   - Dedup-keyed on the type string (same type arriving again updates the existing row, not duplicated)
   - Use the existing `routing-gap` type-vocabulary slot for the signal row
   - Keep the `exit 1` forcing-function (CI red is the correct call to action)

5. **Schema integrity:** `orchStateSchema.ts` diff is empty (no schema changes, all writes via existing `orch-apply.sh` gate)

6. **Synthetic coverage proof:** A synthetic new type present only on Pipeline-A (not B) is caught by the extended guard
   - This proves the cross-pipeline check works, not just today's specific instance

---

## Files to Modify

- `scripts/audits/guard-signal-type-coverage.sh` — extend to parse both pipelines, tag by source, add orch-apply.sh mint on unrouted
- `.github/workflows/ci.yml` — amend job description/step if the script is split into two files; no new job required
- No changes to `docs/agents/po/flow/triage-signals.md` (that is TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION)
- No changes to `orchStateSchema.ts` (schema-untouched design constraint)

---

## Dependencies

- **Related task:** TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION (doc fixes + tactical audit-handoff Pipeline-B rule)
- **Sequence:** These two can run in parallel; audit-handoff rule from the related task unblocks the CI red

---

## Technical Notes

- **Current state:** Guard currently only parses Pipeline-B via `pipeline_b_section()` awk block (lines ~98)
- **orch-apply.sh contract:** All writes to `docs/data/orch/orch-state.json` route through the script's validation gate (Zod schema, conservation checks)
- **Dedup semantics:** Type-based dedup means the same unrouted type re-minted on a later signal updates the existing row (appends to the same backlog item, not duplication)
- **Parsing scope:** Reuse the existing `extract_type_column()` function, generalized to both pipelines. awk-scoped section extraction already proven for Pipeline B; apply the same pattern to Pipeline-A section in triage-signals.md

---

## Baseline Pass / Test Plan

- [ ] `bash scripts/audits/guard-signal-type-coverage.sh --check` against `docs/data/orch/orch-state.json` PASSES after the tactical audit-handoff Pipeline-B rule from TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION lands
- [ ] Run guard on a fixture orch-state with a synthetic unrouted type on Pipeline-A only (not B) → guard detects it as unrouted
- [ ] Confirm an unrouted-type CI run mints a real `task_board.backlog[]` row (dedup-keyed) — visible on next board read, not CI log only
- [ ] Verify `orchStateSchema.ts` has zero diffs (schema-untouched constraint held)

---

## Session / Coordination

- **Session:** 007e33e4-b453-4bb3-8ab1-ef31495906a3
- **Dispatch context:** Architect brief `docs/architecture-briefs/2026-08-23-signal-type-registry-open-namespace-vs-closed-allowlist.md` (decision: (b) registry-derived routing + self-filing fallback, not closed enum)
- **Board context:** `.task_board.ready=104, .signal_queue.rows[]=29 hot`

---

## Related Reading

- Architect brief: `docs/architecture-briefs/2026-08-23-signal-type-registry-open-namespace-vs-closed-allowlist.md` (§3 Design, Parts 1-2)
- Current guard: `scripts/audits/guard-signal-type-coverage.sh` (full script, 125 lines)
- Routing tables: `docs/agents/po/flow/triage-signals.md` (both Pipeline-A and -B sections)
- orch-apply contract: `docs/policies/dev-standards.md` § CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER
