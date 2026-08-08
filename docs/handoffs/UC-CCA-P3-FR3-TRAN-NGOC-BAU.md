# UC-CCA-P3-FR3-TRAN-NGOC-BAU — Wire published-marker-gate into tran-ngoc-bau (multi-file)

**Task ID:** UC-CCA-P3-FR3-TRAN-NGOC-BAU · **Priority:** P0 · **Zone:** docs/agents/tran-ngoc-bau/  
**Assigned to:** dev-tran-ngoc-bau  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL  
**Handoff from:** pm

---

## Acceptance Criteria

1. **main.md (lines 53-66):** Replace inline `task_claim` with skill Phase-1 probe call
   - `PROBE = call_tool(server="vn-market", tool="task_list_held", arguments={kind:"cowork-slot", owner_agent:"tran-ngoc-bau"})`
   - Client-side scan for marker (`published:tnb:DATE`)
   - If held, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - No claim in Phase 1
   - Pass forward: MARKER_KEY, MARKER_TTL, OWNER_AGENT, OWNER_CLIENT_SESSION to auto-cure-and-handoff.md

2. **auto-cure-and-handoff.md (line 15), immediately before `send_telegram(channel="work", ...)`:** Add skill Phase-2 claim call
   - Receive MARKER_KEY/MARKER_TTL/SESSION from main.md session state
   - `CLAIM = call_tool(server="vn-market", tool="task_claim", ...)`
   - If not claimed, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - On success, proceed to send_telegram(work)
   - **NEVER release on success** — TTL sole expiry

3. Atomic multi-file commit (both files modified together)

---

## Technical Spec

**Files to modify:**
- `docs/agents/tran-ngoc-bau/flow/main.md` (Phase-1 probe, lines 53-66)
- `docs/agents/tran-ngoc-bau/flow/auto-cure-and-handoff.md` (Phase-2 claim before send_telegram, line 15, Step 7)

**Multi-file coordination:**
- **main.md** runs Phase-1 probe before the 4 audit phases (audit-market.md, audit-signals.md, audit-methodology.md, audit-chef-coverage.md)
- **auto-cure-and-handoff.md** receives session state and runs Phase-2 claim in Step 7, immediately before send_telegram(work)

**Marker key:** `published:tnb:DATE` (date-scoped, TTL ~86400s = ~1d)

---

## Pseudocode Reference

From architect brief §3 and §4:

**main.md (Phase-1 probe only, lines 53-66):**
```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={kind:"cowork-slot", owner_agent:"tran-ngoc-bau"})

HELD = PROBE.locks contains {task_id=="published:tnb:"+DATE, expires_at>now}
if HELD:
  log "[tran-ngoc-bau] publish blocked (Phase-1 probe) — already held key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  proceed with the 4 audit phases
  pass MARKER_KEY, MARKER_TTL, OWNER_CLIENT_SESSION forward to auto-cure-and-handoff.md
```

**auto-cure-and-handoff.md Step 7 (Phase-2 claim before send_telegram, line 15):**
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "published:tnb:" + DATE,
  task_kind: "cowork-slot",
  owner_agent: "tran-ngoc-bau",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: 86400
})

if CLAIM.claimed != true:
  log "[tran-ngoc-bau] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  send_telegram(channel="work", ...)
  # NEVER release; TTL sole expiry
```

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§1.1 gate shape, §4 wiring table)
- Skill spec: `docs/handoffs/UC-CCA-P3-FR1-FR2-SKILL.md` (Phase-1/Phase-2 contract)
- Sibling flow-doc tasks: UC-CCA-P3-FR3-{CHEF,ALERT-COMMANDER,BCTC-ANALYST,FB-MARKET-POSTER,DIGEST-PREDICT,SPAWN-FANOUT}

---

## QA Gate

- [ ] main.md lines 53-66 have Phase-1 probe call (read-only, no claim)
- [ ] Client-side filtering logic present (API has no task_id filter)
- [ ] Phase-1 EXIT block uses "duplicate-publish blocked" wording
- [ ] Phase-1 passes MARKER_KEY/TTL/SESSION forward to auto-cure-and-handoff.md
- [ ] auto-cure-and-handoff.md line 15 (Step 7, before send_telegram(work)) has Phase-2 claim call
- [ ] Phase-2 EXIT block uses "duplicate-publish blocked" wording
- [ ] "NEVER release" comment present
- [ ] TTL ≈ 86400s (~1d)
- [ ] Both files committed together (atomic multi-file commit)
- [ ] Both files still parse as valid flow docs

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL

---

## Follow-on Tasks

None specific. Parallel with 5 other FR-3 wiring tasks.
