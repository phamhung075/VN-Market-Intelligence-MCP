# TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION

**Zone:** `docs/agents/po/flow/` · **Owner:** `agent-father` / `po` · **Size:** S (~2h) · **Priority:** P0

**Handoff from:** PM (decomposition of FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES per architect brief 2026-08-23)

---

## Mission

Correct two falsified AC-2 claims in `docs/agents/po/flow/triage-signals.md` (Cold-archive cross-check section) and add the missing Pipeline-B routing rule for `audit-handoff` type to unblock the 2026-08-23 CI red.

**Why this matters:** The doc asserts that `system_issue`/`system-issue` are "≤1-2 fires each" and that one is a "historical artifact predating the live form." These claims are directly contradicted by live data: both spellings have 100+ fires each and both are concurrently live through August (6 and 57 fires respectively in 2026-08). The frozen prose framing ("not a live routing gap") will silently go stale again as the namespace continues to grow. Additionally, the current CI red is caused by `audit-handoff` arriving on Pipeline-B with no routing rule (only Pipeline-A has it) — adding the tactical rule unblocks the immediate CI failure while the broader registry work (TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY) closes the split-table blind spot that made this class of misrouting possible in the first place.

---

## Acceptance Criteria

1. **AC-2 correction:** Replace the Cold-archive cross-check claims with measured figures
   - Remove: `system_issue` underscore and `system-issue` hyphen are "≤1-2 fires each" (FALSE)
   - Add measured counts:
     - `system_issue` (underscore): 112 total fires (20 in 2026-06, 86 in 2026-07, 6 in 2026-08) — **concurrently live**
     - `system-issue` (hyphen): 109 total fires (0 in 2026-06, 51 in 2026-07, 57 in 2026-08) — **concurrently live**
     - Both are the two largest type classes in the ~100+ historical namespace (top 2)
   - Remove the inverted-precedence claim that underscore "predates" the hyphen form
   - Replace the "historical artifact, not a live routing gap" framing

2. **Framing replacement:** Instead of frozen prose claims, instruct readers to consult the derived registry
   - Reference the registry output from TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY as the source of truth
   - Example framing: "For current type distribution, run `scripts/audits/guard-signal-type-coverage.sh` against docs/data/orch/orch-state.json to derive the live routing registry. The Cold-archive tables below show historical context; live values may differ."

3. **Tactical audit-handoff rule:** Add Pipeline-B routing entry for `audit-handoff` type
   - Follows the same pattern as Pipeline-A rule (keyed on `from=tran-ngoc-bau` or matched via summary pattern)
   - Row `tra-20260822T203234` (the CI-red signal) is triaged through this normal rule once it lands (do NOT close beforehand)
   - This is the immediate unblocking action; TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY closes the broader split-table blind spot

4. **Prose integrity:** Prose size stays under 12000B ceiling (current file is 77 lines, well below)

---

## Files to Modify

- `docs/agents/po/flow/triage-signals.md` — Section "Cold-archive cross-check" (current ~line 59) + Pipeline-B routing table
- No changes to `triage-signals-longtail.md` (no new low-traffic types in scope here)
- No changes to `.claude/skills/signal-dashboard/SKILL.md` (out of scope for this task)

---

## Dependencies

- **Related task:** TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY (guard extension that derives the live registry)
- **Sequence:** These two can run in parallel. Audit-handoff rule from this task unblocks CI red; registry extension from the related task prevents recurrence

---

## Technical Notes

### Measurement Source

Architect brief § 1 independently re-verified via grep across the archive files:

```
| form | 2026-06 | 2026-07 | 2026-08 | total |
|---|---|---|---|---|
| system_issue (underscore) | 20 | 86 | 6 | 112 |
| system-issue (hyphen) | 0 | 51 | 57 | 109 |
```

**Verification command (documented in brief):**
```bash
grep -c '"type":"system_issue"' docs/data/orch/archive/2026-0{6,7,8}.json + hot file
grep -c '"type":"system-issue"' docs/data/orch/archive/2026-0{6,7,8}.json + hot file
```

Both spellings appear in 2026-08, confirming they are concurrently live, not sequential (predating/replaced) as the doc claims.

### Routing Rule Pattern

The audit-handoff rule in Pipeline-A (line ~24 of triage-signals.md) is:

```
| audit-handoff | sender=tran-ngoc-bau | Route per action_ref | summary contains "NEEDS_ATTENTION" → FIX |
```

The Pipeline-B rule should follow the same pattern, ensuring `tra-20260822T203234` (a Pipeline-B `audit-handoff` signal) routes through normal triage logic.

---

## Baseline Pass / Test Plan

- [ ] Triage-signals.md no longer contains the phrase "≤1-2 fires each" in the Cold-archive section
- [ ] Triage-signals.md no longer contains the "underscore predates hyphen" or inverted-precedence claim
- [ ] Measured figures (112 / 109) appear in the file with the month-by-month breakdown
- [ ] Pipeline-B routing table includes an `audit-handoff` row (or explicit alias)
- [ ] Prose size of triage-signals.md remains under 12000B ceiling
- [ ] When `tra-20260822T203234` is re-queued, it routes through the normal `audit-handoff` rule (not closed beforehand)

---

## Session / Coordination

- **Session:** 007e33e4-b453-4bb3-8ab1-ef31495906a3
- **Dispatch context:** Architect brief `docs/architecture-briefs/2026-08-23-signal-type-registry-open-namespace-vs-closed-allowlist.md` (decision: (b) registry-derived routing + self-filing fallback)
- **Board context:** `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES` moved from `ready[]` to two separate subtasks for parallel dispatch

---

## Related Reading

- Architect brief: `docs/architecture-briefs/2026-08-23-signal-type-registry-open-namespace-vs-closed-allowlist.md` (§1 Verified Premise, AC-2 claims)
- Current routing doc: `docs/agents/po/flow/triage-signals.md` (Cold-archive section, Pipeline-A/B routing tables)
- CI-red signal: `tra-20260822T203234` in `.signal_queue.rows[]`
- Measurement evidence: `docs/data/orch/archive/2026-0{6,7,8}.json` for system_issue/system-issue counts

---

## Notes for Implementer

The architect brief explicitly names this as **Part 3 (doc-accuracy correction, AC-2)** from the three-part design. This is not proposing a new architectural approach — it is **correcting the documentation to match measured reality** and adding the missing routing rule. The broader registry work (TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY) ensures that new types will be caught automatically; this task fixes the stale prose that let two known types go mismeasured in the doc itself.

The phrase "historical artifact, not a live routing gap" is the load-bearing falsehood — it justifies not routing a type that is actually live and firing. Replace it with a practice-oriented instruction to consult the derived registry instead.
