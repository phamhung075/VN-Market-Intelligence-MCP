<!-- size-justification: 140L — task handoff atomic unit; input arch blueprint + spec; output JSON config file + acceptance criteria + 1 DV test proof; no code or script logic -->

# TASK P1-DEV-1 — Create `docs/data/cadence-policy.json`

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-1
**Assigned zone:** cross-service (SSOT config)
**Estimated:** ~1h (JSON table transcription + validation)
**Status:** READY
**Precondition:** Architect design complete (`docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md`)

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § Cadence Policy Table
- `docs/REQ_DYN-WF-PHASE1.md` § FR-P1-1 (policy structure + tiers)

---

## Deliverable

**File:** `docs/data/cadence-policy.json`

A JSON policy table with the following structure:

```json
{
  "_ssot": "docs/data/cadence-policy.json",
  "_description": "DWF-PHASE1 cadence policy table. First-match wins (array order). interval_minutes: null = suppress. guaranteed=true slots bypass this table entirely (cron governs).",
  "_staleness_threshold_minutes": 20,
  "policies": [
    // Full policy rules array (see blueprint § Cadence Policy Table)
    // Order matters: first-match wins
    // All 28 rules must be transcribed exactly as in the blueprint
  ]
}
```

**Policy rules to include (from blueprint):**

1. **gatherer-standard** (8 rules):
   - `open/high/low/240` → `open/medium/*/60` → `open/low/high/60` → `open/low/low/240` → `half_day/*/*/60` → `holiday/*/*/480` → `weekend/*/*/480` → `unknown/*/*/240`

2. **chef-intraday** (6 rules):
   - `open/*/high/60` → `open/*/low/120` → `half_day/*/*/120` → `holiday/*/*/null` → `weekend/*/*/null` → `unknown/*/*/120`

3. **bctc-offmarket** (5 rules with `_cron_fallback` semantics):
   - `holiday/*/*/null` → `weekend/*/*/1440` → `open/*/*/null (_cron_fallback: true)` → `half_day/*/*/null (_cron_fallback: true)` → `unknown/*/*/null (_cron_fallback: true)`

---

## Acceptance Criteria

**AC-P1-1-1 (BLOCKING):** Policy lookup with `calendar_status="open"`, `signal_backlog=8` (medium tier), `volatility_tier="high"`, `policy_id="gatherer-standard"` returns `interval_minutes=60`.
- DV proof: Remove the `medium/*` rule → lookup returns `240` → RED. With rule present → GREEN.

**AC-P1-1-2 (BLOCKING):** Policy lookup with `calendar_status="holiday"`, `policy_id="chef-intraday"` returns `interval_minutes=null` (suppress).
- DV proof: Remove the `holiday` rule → lookup does not return null → RED. With rule present → GREEN.

**AC-P1-1-3 (BLOCKING):** Policy lookup with no matching rule (e.g., unrecognized policy_id or all tiers wildcard-miss) returns safe default `interval_minutes=240` (never `null`).
- DV proof: Assert unmatched rule returns `null` → RED. With default `240` → GREEN.

**AC-P1-3-4:** Output schema includes `due_reason` and `cadence_minutes` fields in slot objects (for observability in Step 4.4). Verified by test T-8 (schema validation).
- No JSON changes needed; this is inherited from the evaluator module (P1-DEV-2).

**Structure validation:**
- `_ssot` field present and value equals file path
- `_staleness_threshold_minutes` present and equals `20`
- `policies` is an array of rule objects
- Each rule has: `policy_id`, `calendar_status`, `signal_backlog_tier`, `volatility_tier`, `interval_minutes` (no nulls in schema, values can be null)
- `bctc-offmarket` rules have optional `_cron_fallback: true` (only 3 of the 5 rules)
- All 28 rules transcribed (exact count from blueprint)

**JSON validation:**
- File is valid JSON (parseable via `JSON.parse()`)
- No trailing commas, no unquoted keys, no comments (plain JSON, not JSONC)

---

## Files to Modify

**CREATE:**
- `docs/data/cadence-policy.json` (new file, 220 lines)

---

## Test Mapping

| AC | DV Test |
|---|---|
| AC-P1-1-1 | T-1 (gatherer-standard lookup) |
| AC-P1-1-2 | T-2 (chef-intraday holiday suppress) |
| AC-P1-1-3 | T-3 (unmatched rule → 240 default) |

**Test suite:** `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (created in P1-DEV-7)

---

## Implementation Notes

1. **Transcription:** Copy the policy rules from the blueprint § Cadence Policy Table. Match indentation and field order exactly.
2. **Validation:** After writing the file, verify:
   - `cat docs/data/cadence-policy.json | jq . > /dev/null` (valid JSON)
   - `wc -l docs/data/cadence-policy.json` outputs line count ≈ 220
   - All 28 rules present (use `jq '.policies | length'` → 28)
3. **Tier encoding:** The file is pure data — tiers are resolved by the evaluator (P1-DEV-2). This file simply stores the rules.
4. **bctc-offmarket `_cron_fallback` field:** Only the three "cron fallback" rules (open/half_day/unknown for bctc-offmarket) have this field set to `true`. The other two bctc rules (holiday/weekend) do NOT have the field (omit it, do not set to false). The evaluator checks `rule._cron_fallback ?? false`.

---

## Zone & Dependencies

**Zone:** cross-service (config file, no microservice code)
**Depends on:** None (independent)
**Blocks:** P1-DEV-2 (evaluator needs the policy file to exist for imports), P1-DEV-7 (test harness)
**Parallel-run with:** P1-DEV-2, P1-DEV-4

---

## Success Criteria

- [ ] File `docs/data/cadence-policy.json` exists
- [ ] Valid JSON (jq parse succeeds)
- [ ] All 28 rules present
- [ ] All three DV proofs (AC-P1-1-1/2/3) set up correctly for test harness
- [ ] Committed to `main` (no branch)

---

## RETURN

```
ZONE: cross-service
FILE_COUNT: 1 (CREATE)
LINES: ~220
BLOCKING_ACS: 3 (AC-P1-1-1/1-2/1-3)
DV_TESTS: 3 (T-1/2/3)
PARALLEL_WITH: P1-DEV-2, P1-DEV-4
SEQUENCE_BEFORE: P1-DEV-3 (must exist for evaluator to load)
```
