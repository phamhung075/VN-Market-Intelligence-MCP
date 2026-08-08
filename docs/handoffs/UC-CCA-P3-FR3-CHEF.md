# UC-CCA-P3-FR3-CHEF — Wire published-marker-gate into chef flow (cross-file)

**Task ID:** UC-CCA-P3-FR3-CHEF · **Priority:** P0 · **Zone:** docs/agents/unified-agent/  
**Assigned to:** dev-unified-agent  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL (skill must exist first)  
**Handoff from:** pm

---

## Acceptance Criteria

1. **chef.md Step 0.5 (lines 108-119):** Replace the inline `task_claim` call with a skill Phase-1 probe call
   - `PROBE = call_tool(server="vn-market", tool="task_list_held", arguments={kind:"cowork-slot", owner_agent:"unified-agent"})`
   - Client-side scan: check if any returned lock has `task_id == MARKER_KEY` and `expires_at > now`
   - If held, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - No claim in Phase 1 (read-only probe only)
   - Pass forward: MARKER_KEY, MARKER_TTL, OWNER_AGENT, OWNER_CLIENT_SESSION to chef-dish.md session state

2. **chef-dish.md Step 7, immediately before Block A (line 386):** Add skill Phase-2 claim call
   - `CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={...})`
   - If not claimed, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - On success, proceed to Block A (gates both Block A + Block B per existing binary EXIT semantics)
   - **NEVER call `task_release` on success** — TTL is sole expiry

3. **chef-dish.md Input line (19-20):** Fix documentation to reflect cross-file state threading
   - Current text: "...plus the session state accumulated in chef.md Steps 0.5/0/1 (signal groups, qualifying clusters, **published-marker claim**)"
   - Change to: "...plus the session state accumulated in chef.md Steps 0.5/0/1 (signal groups, qualifying clusters, **`MARKER_KEY`/`MARKER_TTL`/`OWNER_CLIENT_SESSION` from the Phase-1 probe — the Phase-2 claim itself now happens in this file, Step 7, immediately before Block A**)"
   - This documents the R1 risk flag explicitly: the claim moved from chef.md to chef-dish.md

4. Both modifications in a single commit (cross-file atomicity)

---

## Technical Spec

**Files to modify:**
- `docs/agents/unified-agent/flow/chef.md` (Step 0.5, lines 108-119)
- `docs/agents/unified-agent/flow/chef-dish.md` (Input line 19-20, Step 7 line 386)

**Rationale:**
- **FR-3 gate #1** implements the two-phase late-claim redesign for the chef marker
- Chef has 4 slots (morning/intraday/eod/evening), all date-scoped, claimed before Step 0 gather (~650L before send)
- The EARLY-claim defect (claimed too far before publish decision) is the root cause of multiple leak incidents (07-02, 07-03, 07-15 class)
- Moving Phase-2 to immediately before Block A (Step 7) shrinks the exposure window and makes the claim timing deterministic

**Cross-file threading (R1 risk):**
- chef.md currently documents: "Phase-2 claim is complete session state inherited from chef.md Steps 0.5/0/1"
- New design: Phase 1 (probe only) in chef.md; Phase 2 (claim) in chef-dish.md
- This is a **new requirement**, not a same-file relocation like the other 5 gates
- **Verification item (QA gate):** Ensure Phase 2 claim stays in chef-dish.md Step 7, never "moved back to chef.md for convenience"

---

## Pseudocode Reference

From architect brief §3 and §4:

**chef.md Step 0.5 (Phase-1 probe only):**
```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={kind:"cowork-slot", owner_agent:"unified-agent"})
HELD = PROBE.locks contains {task_id==MARKER_KEY, expires_at>now}

if HELD:
  log "[unified-agent] publish blocked (Phase-1 probe) — already held key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  proceed with Steps 0/1 gather (MARKER_KEY, MARKER_TTL, OWNER_CLIENT_SESSION remain in session state)
  → chef-dish.md will receive them
```

**chef-dish.md Step 7, before Block A (Phase-2 claim):**
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: MARKER_KEY,
  task_kind: "cowork-slot",
  owner_agent: "unified-agent",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: MARKER_TTL
})

if CLAIM.claimed != true:
  log "[unified-agent] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  # PROCEED TO BLOCK A (never release on any exit path after this claim)
  # Successful send, failed send, exception, process death — marker stays held until TTL expiry
```

---

## Risk Flags

**R1 — Chef cross-file threading:**
- chef-dish.md:19-20 currently documents the published-marker claim as already-complete inherited session state from chef.md
- This design requires threading `MARKER_KEY`/`MARKER_TTL`/`OWNER_CLIENT_SESSION` forward (Phase-1-only state), with the actual claim now happening inside chef-dish.md
- **Mandatory verification item in QA/dev review:** if Phase-2 is (re)placed back in chef.md "for convenience," the whole FR-1/FR-2 redesign silently regresses to the EARLY-claim defect pattern
- Flagged explicitly in the Input line documentation change to make this visible during code review

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§1.1 exact current shape, §4 wiring table, §10 R1 risk flag)
- Skill spec: `docs/handoffs/UC-CCA-P3-FR1-FR2-SKILL.md` (Phase 1/Phase 2 pseudocode contract)
- Sibling flow-doc tasks: UC-CCA-P3-FR3-{ALERT-COMMANDER,BCTC-ANALYST,FB-MARKET-POSTER,DIGEST-PREDICT,TRAN-NGOC-BAU,SPAWN-FANOUT}

---

## QA Gate

- [ ] chef.md Step 0.5 (lines 108-119) replaced with Phase-1 probe call (read-only, no claim)
- [ ] Client-side task_id filtering logic present (API has no task_id filter per design note)
- [ ] Phase-1 EXIT block uses "duplicate-publish blocked" wording
- [ ] chef-dish.md Step 7 (before Block A, line 386) has Phase-2 claim call
- [ ] Phase-2 EXIT block uses "duplicate-publish blocked" wording
- [ ] Phase-2 has "NEVER release on success" comment + "TTL sole expiry" statement
- [ ] chef-dish.md Input line (19-20) updated to document MARKER_KEY/TTL/SESSION threading
- [ ] Both files modified and committed together (atomic cross-file commit)
- [ ] Syntax check: both files still parse as valid flow docs

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL (skill file must exist and be visible for reference)

---

## Follow-on Tasks

None specific to this task. This is one of 6 parallel FR-3 wiring tasks:
- UC-CCA-P3-FR3-ALERT-COMMANDER (sibling, parallel)
- UC-CCA-P3-FR3-BCTC-ANALYST (sibling, parallel)
- UC-CCA-P3-FR3-FB-MARKET-POSTER (sibling, parallel)
- UC-CCA-P3-FR3-DIGEST-PREDICT (sibling, parallel)
- UC-CCA-P3-FR3-TRAN-NGOC-BAU (sibling, parallel)
- UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP (sibling, parallel)

All 6 can proceed in parallel once the skill exists (UC-CCA-P3-FR1-FR2-SKILL is done).
