# TASK_003 — domain-model.md Watchlist Count Documentation Fix

**Parent Task:** FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58  
**Owner:** generic-developer (documentation, no code)  
**Depends:** none  
**Blocked By:** none  
**Sprint:** COWORK-RELIABILITY  
**Size:** XS  
**Priority:** P1

---

## Summary

Fix a single stale line in the frontend architecture documentation. Update the watchlist count from the outdated "33 entries (30 active + 3 inactive)" to the current "34 entries (33 active + 1 inactive — VEA)".

This is a mechanical, one-line fix with no code changes. It can be done independently and first (no dependency on TASK_001 or TASK_002).

---

## Acceptance Criteria

### AC-1: Single Stale Line Correction
- [ ] File: `docs/architecture/microservice/frontend/domain-model.md`
- [ ] Current line (~72): `"Compiled constant array of 33 entries (30 active + 3 inactive)"`
- [ ] Updated line: `"Compiled constant array of 34 entries (33 active + 1 inactive — VEA)"`
- [ ] Context: this docstring describes the `WATCHLIST_STOCKS` constant in `apps/frontend/app/domain/market.ts`

### AC-2: Verify Against Live Source
- [ ] Before committing, manually verify the count against `docs/data/system-map.json`:
  - [ ] Count total `.project.watchlist[]` entries
  - [ ] Count active entries (where `active !== false`)
  - [ ] Identify the single inactive ticker (should be VEA)
- [ ] Assert: `jq '[.project.watchlist[] | select(.active == false)] | length' docs/data/system-map.json` = 1
- [ ] Assert: `jq '[.project.watchlist[] | select(.active != false)] | length' docs/data/system-map.json` = 33

### AC-3: Verify Against Frontend Constant
- [ ] Check `apps/frontend/app/domain/market.ts` line 293 `WATCHLIST_STOCKS` constant
- [ ] Confirm it has exactly 34 entries
- [ ] Spot-check: VEA should be marked with `active: false`; all others `active: true`

### AC-4: No Other Changes
- [ ] This commit touches ONLY `docs/architecture/microservice/frontend/domain-model.md`
- [ ] No other files modified (this is a documentation-only fix)
- [ ] Commit message: "docs: fix domain-model.md stale watchlist count 33→34" (or similar one-liner)

---

## Files Changed

**Modified:**
- `docs/architecture/microservice/frontend/domain-model.md` (1 line)

**Verified (no changes, just spot-checks):**
- `docs/data/system-map.json` (confirm count)
- `apps/frontend/app/domain/market.ts` (confirm count)

---

## Context & Constraints

### Why This Matters
- The frontend architecture documentation is a contract: other developers and tools rely on it being accurate
- Stale docs are worse than no docs — they actively mislead
- This specific lie ("33 entries") was a symptom of the larger watchlist divergence problem (FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58)
- Fixing it now closes the feedback loop: the architecture docs match the reality that TASK_001/TASK_002 will keep durable going forward

### Why It's Not Harder
- The count is now verifiably correct (architect Blocker Q1 resolved it: DB=file=frontend, all 34)
- No guesswork, no conditional logic, just facts
- This fix survives future divergences too (the write-through in TASK_001 keeps the count true)

### Scope Out
- Do NOT edit other parts of the file (e.g., related docs on technical-analysis, CLAUDE.md rewording)
- Those are either already accurate (architect verified in the brownfield pass) or belong to different rows
- This is a surgical one-liner only

---

## Dependencies & Ordering

- **Blocks:** nothing
- **Blocked By:** nothing
- **Can be done:** before, during, or after TASK_001/TASK_002 (completely independent)
- **Recommendation:** do this first (it's the fastest and lowest-risk way to start the row)

---

## Handoff Notes for Developer

1. **Verify raw, not from memory:** Do not trust the architect's stated count (34/33/1). Run the `jq` commands yourself to confirm before writing:
   ```bash
   jq 'length' <<< "$(jq '.project.watchlist' docs/data/system-map.json)"
   jq '[.project.watchlist[] | select(.active != false)] | length' docs/data/system-map.json
   jq '[.project.watchlist[] | select(.active == false)] | length' docs/data/system-map.json
   jq '.project.watchlist[] | select(.active == false) | .ticker' docs/data/system-map.json
   ```
   
   The last one should return exactly one ticker (VEA).

2. **Commit discipline:** This is a documentation-only change, so it does NOT need the full commit-boundary protocol (RULE 1-3 from `.claude/skills/commit-boundary/SKILL.md`). However, it still needs to be a real commit on main (not mixed into another commit).

3. **Spot-check the frontend constant:** Open `apps/frontend/app/domain/market.ts`, find the `WATCHLIST_STOCKS` constant (line 293 per architect notes), and manually count the entries. It should be 34. Verify VEA is in there with `active: false`.

4. **One-liner commit:** Keep the commit message terse:
   ```
   docs: fix domain-model.md stale watchlist count 33→34
   ```
   No long body needed — the change is self-documenting.

5. **Timeline:** This should take <5 minutes total (verify + edit + commit). Do it first to clear a quick win and build confidence before tackling the larger TASK_001/TASK_002.

---

## Related Reading

- **BA Spec:** `docs/handoffs/FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58-BA-spec.md` — see §2 (FR-7, lists the stale docs)
- **Architect Brief:** appended to BA spec (Blocker Q1 resolution confirming 34/34/34)
- **Frontend Domain Model:** `docs/architecture/microservice/frontend/domain-model.md` (full context)
- **System Map:** `docs/data/system-map.json` (the SSOT)
- **Frontend Constant:** `apps/frontend/app/domain/market.ts` line 293

---

## Closure Checklist

Before marking this task DONE:

- [ ] AC-1 and AC-2 verified raw (jq commands run)
- [ ] AC-3 spot-check completed (frontend constant count confirmed)
- [ ] AC-4: only 1 line changed in 1 file
- [ ] Commit pushed to origin/main
- [ ] Ready to hand off to QA

Then:
- Update orch-state.json: `status: DONE_VERIFIED`, `verified_at: <timestamp>`, `verified_by: generic-developer`
- No pairing with other tasks needed
