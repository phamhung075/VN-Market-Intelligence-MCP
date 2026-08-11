---
sprint: CHORE-COMMIT-OVERHEAD
branch: task/chore-commit-2-dbintegrity-payload-narrow
size: S
priority: P1
depends_on: []
blocks: []
---

## TLDR

Narrow the `--payload-ref` hardcoded in `scripts/db-integrity-history-append.sh:98` from the entire 745KB `db-integrity-history.json` accumulator to the specific finding that triggered the signal. Use the existing `#fragment` parsing support in `scripts/agents-flow/drain-signals.js:467` to scope the ref.

## [PM] Planning Context

**Root Cause:** `scripts/db-integrity-history-append.sh:98` hardcodes `--payload-ref docs/data/db-integrity-history.json` (the whole accumulator). Every `db_integrity_breach` signal drains with a pointer to the entire 161-entry/745KB file, instead of just the specific finding. This is inefficient and loses granularity.

**Design Constraint (PO-Flagged):** The hardcode was deliberate — it closed a prior 3x `to=po`+`payload_ref=null` routing defect — so this fix must narrow granularity (point at the specific finding/fragment), never revert to agent-supplied refs. The fix must remain structurally safe: `to`/`payload_ref` are still HARDCODED on the `emit-audit-signal.sh` call, not sourced from agent input.

**Acceptance Criteria:**
- [ ] AC-1: Update `scripts/db-integrity-history-append.sh:98` — change `--payload-ref docs/data/db-integrity-history.json` to `--payload-ref docs/data/db-integrity-history.json#<fragment>` where `<fragment>` identifies the specific finding (e.g., `finding_index_<i>` or `table_<table>_<timestamp>`)
- [ ] AC-2: Implement fragment encoding: on line ~92-98, compute a deterministic fragment identifier from the finding (table name + severity + timestamp, or table index in the findings array). Document the scheme clearly
- [ ] AC-3: Verify `scripts/agents-flow/drain-signals.js:467` already parses `#fragment` in payload_ref — confirm no changes needed there. If changes ARE needed, update the script to extract and use the fragment when reading the ref
- [ ] AC-4: Updated prose in `scripts/db-integrity-history-append.sh` header documents the new narrowed-ref behavior and fragment scheme
- [ ] AC-5: No reversal to agent-supplied refs — `to` and `payload-ref` remain HARDCODED throughout the call chain. The narrowing is purely structural (whole→fragment), not a policy change

**Files to read first:**
- `scripts/db-integrity-history-append.sh` — line 88-98 (emit-audit-signal.sh call, current hardcode)
- `scripts/agents-flow/drain-signals.js` — line 467 (fragment parsing, confirm it works)
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` — §3 (finding about hardcode), §6 R4 (recommendation)
- `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md` — PO's note on keeping hardcoding structural-safe

**Files to modify:**
- `scripts/db-integrity-history-append.sh` — update emit-audit-signal.sh call with narrowed payload-ref + fragment encoding logic
- (Possibly) `scripts/agents-flow/drain-signals.js` — if fragment parsing missing/broken, fix it

**Files to verify (read-only):**
- `scripts/agents-flow/drain-signals.js:467` — confirm fragment parsing implemented and callable

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § Finding 1 & Recommendation R4
- `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md` § Finding 3 & PO's detail on narrowing requirement

---

## Architecture Reference

From `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § R4:

> **FIX-DBINTEGRITY-SIGNAL-PAYLOADREF-WHOLE-ACCUMULATOR:** `scripts/db-integrity-history-append.sh:98` hardcodes `--payload-ref docs/data/db-integrity-history.json` (whole 745KB file, not the specific finding). This hardcode was deliberate — it closed a prior 3x `to=po`+`payload_ref=null` routing defect — so the fix must narrow granularity (point at the specific finding/fragment, `payload_ref` already supports `#fragment` parsing per `scripts/agents-flow/drain-signals.js:467`), never revert to agent-supplied refs.

### Fragment Parsing Support

The script `scripts/agents-flow/drain-signals.js` already has fragment parsing at line 467. Confirm this works:
```javascript
// pseudo-code — actual implementation to be verified
const parsePayloadRef = (ref) => {
  const [path, fragment] = ref.split('#');
  return { path, fragment };
};
```

If not implemented or broken, this task includes fixing it.

---

## Scope Boundary

**IN SCOPE:**
- Narrowing the payload-ref from whole file to specific finding
- Implementing fragment identifier scheme (deterministic, based on finding metadata)
- Updating prose documentation in script header
- Verifying fragment parsing works in drain-signals.js

**OUT OF SCOPE (don't touch):**
- Changing the structural hardcoding (to/payload-ref remain hardcoded, safe)
- Altering the dedup-check logic (that is a separate issue handled by TASK_CHORE-COMMIT-1)
- Modifying the accumulator file itself or its retention policy
- Changing write/readback crash-safety

---

## Fragment Scheme Options

Choose ONE of the following and document clearly in the script header:

**Option A: Array Index**
```
docs/data/db-integrity-history.json#findings[2]
```
Simplest; requires that finding order is stable.

**Option B: Table + Severity + Timestamp**
```
docs/data/db-integrity-history.json#finding_daily_ohlcv_REAL_20260811T1523Z
```
More stable across array reorderings; requires encoding scheme.

**Option C: Content Hash Fragment**
```
docs/data/db-integrity-history.json#finding_<sha256-of-finding-content>
```
Most robust; can distinguish duplicates in the same tick.

Document your choice clearly in `scripts/db-integrity-history-append.sh` header so future readers understand the scheme.

---

## Success Criteria

1. Payload-ref narrowed from whole file to specific finding
2. Fragment scheme clearly documented
3. Drain-signals.js fragment parsing verified working
4. Structural safety maintained (no agent-supplied refs)
5. On merge: individual findings can be tracked/routed separately instead of entire accumulator
