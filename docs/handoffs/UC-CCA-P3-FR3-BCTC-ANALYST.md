# UC-CCA-P3-FR3-BCTC-ANALYST — Wire published-marker-gate into bctc-analyst (late-claim + task_kind fix)

**Task ID:** UC-CCA-P3-FR3-BCTC-ANALYST · **Priority:** P0 · **Zone:** docs/agents/bctc-analyst/  
**Assigned to:** dev-bctc-analyst  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL  
**Handoff from:** pm

---

## Acceptance Criteria

1. **stage-log-notify.md lines 40-41:** Replace inline `task_claim` prose with skill Phase-2 call
   - No Phase-1 probe (same reasoning as alert-commander: pre-gate work is core deliverable independent of dedup outcome)
   - Implement Phase-2 call immediately before the WORK channel `send_telegram` (already LATE-claim, correct location)
   - `CLAIM = call_tool(server="vn-market", tool="task_claim", ...)`
   - If not claimed, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - **NEVER release on success** — TTL sole expiry

2. **Normalize task_kind from "sprint-task" to "cowork-slot"**
   - Current (wrong): task_kind:"sprint-task"
   - Change to: task_kind:"cowork-slot"
   - Rationale: unifies all 6 gates under the same kind; allows a clean `task_list_held(kind="cowork-slot")` sweep for future system-auditor orphan sweep
   - **Migration risk:** ≤1h bounded, self-healing via natural TTL drain (bctc-analyst's TTL is shortest of all 6 gates at 3600s = 1h)

3. Single file modification, atomic commit

---

## Technical Spec

**File to modify:** `docs/agents/bctc-analyst/flow/stage-log-notify.md` (lines 40-41)

**Changes:**
1. Replace inline task_claim with skill Phase-2 call
2. Change `task_kind: "sprint-task"` to `task_kind: "cowork-slot"`

**Rationale:**
- **FR-3 gate #3** — bctc-analyst is the second gate already using LATE-claim correctly
- **Q-taskkind resolution:** normalize bctc-analyst to match the other 5 gates
- Future orphan-sweep (FIX-CHEF-MIDFLOW-BAIL-DETERMINISM FOLLOW-UP-2) will use `task_list_held(kind="cowork-slot")` to find all published markers; leaving bctc-analyst as "sprint-task" would silently miss its markers
- **Migration window:** any in-flight "sprint-task"-kind marker claimed under the old kind remains functionally correct for bctc-analyst's own dedup for its remaining TTL (1h max). External queries (e.g., future orphan sweep) might miss it for ≤1h — low severity, not a correctness break for bctc-analyst's own gate

---

## Pseudocode Reference

From architect brief §3 (Phase-2 only):
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: MARKER_KEY,
  task_kind: "cowork-slot",  # <— CHANGED from "sprint-task"
  owner_agent: "bctc-analyst",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: MARKER_TTL
})

if CLAIM.claimed != true:
  log "[bctc-analyst] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  proceed to send_telegram(channel="work", ...)
  # NEVER release; TTL is sole expiry
```

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§1.1 gate shape, §7 Q-taskkind resolution with migration risk analysis)
- Skill spec: `docs/handoffs/UC-CCA-P3-FR1-FR2-SKILL.md` (Phase-2 contract)
- Sibling flow-doc tasks: UC-CCA-P3-FR3-{CHEF,ALERT-COMMANDER,FB-MARKET-POSTER,DIGEST-PREDICT,TRAN-NGOC-BAU,SPAWN-FANOUT}

---

## QA Gate

- [ ] stage-log-notify.md lines 40-41 have Phase-2 call (no Phase 1)
- [ ] task_kind changed from "sprint-task" to "cowork-slot"
- [ ] task_claim arguments otherwise match skill contract
- [ ] EXIT block uses "duplicate-publish blocked" wording
- [ ] "NEVER release" comment present
- [ ] File still parses as valid flow doc

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL

---

## Follow-on Tasks

None specific. Parallel with 5 other FR-3 wiring tasks. Note: after this task completes, any in-flight "sprint-task"-kind markers will naturally drain within 1h (natural migration window).
