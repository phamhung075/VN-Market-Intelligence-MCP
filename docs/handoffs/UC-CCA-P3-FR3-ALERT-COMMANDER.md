# UC-CCA-P3-FR3-ALERT-COMMANDER — Wire published-marker-gate into alert-commander

**Task ID:** UC-CCA-P3-FR3-ALERT-COMMANDER · **Priority:** P0 · **Zone:** docs/agents/alert-commander/  
**Assigned to:** dev-alert-commander  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL  
**Handoff from:** pm

---

## Acceptance Criteria

1. **stage-dispatch-log.md line 33:** Replace inline `task_claim` prose with a reference to the skill Phase-2 call
   - No Phase-1 probe needed (alert-commander's pre-gate work is not conditioned on dedup outcome; its Firing Gate decides fire/no-fire before this point)
   - Implement skill Phase-2 call immediately before the MARKET `send_telegram` (already LATE-claim, correct location)
   - `CLAIM = call_tool(server="vn-market", tool="task_claim", ...)`
   - If not claimed, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - **NEVER release on success** — TTL sole expiry

2. Verify task_kind and TTL parameters already match skill contract
   - task_kind: "cowork-slot" (confirmed live)
   - TTL: tick-scoped (matches alert-commander cadence)
   - MARKER_KEY: already window-anchored per FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR

3. Single file modification, atomic commit

---

## Technical Spec

**File to modify:** `docs/agents/alert-commander/flow/stage-dispatch-log.md` (line 33)

**Rationale:**
- **FR-3 gate #2** — alert-commander is one of two gates already correctly using LATE-claim (no redesign needed)
- This task is cosmetic normalization: replacing inline prose with standardized skill reference
- Alert-commander's gate precedes it deciding fire/no-fire, so early probe would add a call with no cost-benefit — skip Phase 1 per design

**Current pattern (LATE-claim, correct):**
- Claim immediately before the first `channel="market"` send this cycle
- Tombstone is tick-scoped (one per fire-cycle)
- task_kind: "cowork-slot"

---

## Pseudocode Reference

From architect brief §3 (Phase-2 only, no Phase 1):
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: MARKER_KEY,
  task_kind: "cowork-slot",
  owner_agent: "alert-commander",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: MARKER_TTL
})

if CLAIM.claimed != true:
  log "[alert-commander] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  proceed to send_telegram(channel="market", ...)
  # NEVER release; TTL is sole expiry
```

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§1.1 gate shape, §3 Phase-2 contract, §7 Q-taskkind)
- Skill spec: `docs/handoffs/UC-CCA-P3-FR1-FR2-SKILL.md` (Phase-2 contract)
- Sibling flow-doc tasks: UC-CCA-P3-FR3-{CHEF,BCTC-ANALYST,FB-MARKET-POSTER,DIGEST-PREDICT,TRAN-NGOC-BAU,SPAWN-FANOUT}

---

## QA Gate

- [ ] stage-dispatch-log.md line 33 has Phase-2 call (no Phase 1)
- [ ] task_claim arguments match skill contract (task_kind="cowork-slot", etc.)
- [ ] EXIT block uses "duplicate-publish blocked" wording
- [ ] "NEVER release" comment present
- [ ] File still parses as valid flow doc

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL

---

## Follow-on Tasks

None specific. Parallel with 5 other FR-3 wiring tasks.
