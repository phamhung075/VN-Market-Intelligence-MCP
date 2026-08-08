# UC-CCA-P3-FR3-DIGEST-PREDICT — Wire published-marker-gate into digest-predict (multi-file)

**Task ID:** UC-CCA-P3-FR3-DIGEST-PREDICT · **Priority:** P0 · **Zone:** docs/agents/digest-predict/  
**Assigned to:** dev-digest-predict  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL  
**Handoff from:** pm

---

## Acceptance Criteria

1. **main.md daily gate (lines 48-54):** Replace inline `task_claim` with skill Phase-1 probe call
   - `PROBE = call_tool(server="vn-market", tool="task_list_held", arguments={kind:"cowork-slot", owner_agent:"digest-predict"})`
   - Client-side scan for daily marker (`published:digest:daily:DATE`)
   - If held, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - No claim in Phase 1
   - Pass forward: MARKER_KEY, MARKER_TTL, OWNER_CLIENT_SESSION

2. **main.md Sunday gate (lines 100-106):** Replace inline `task_claim` with skill Phase-1 probe call
   - Same pattern as daily gate
   - Scan for Sunday/weekly marker (`published:digest:weekly:WEEKKEY`)
   - If held, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - No claim in Phase 1

3. **daily.md (line 77), immediately before `send_telegram(channel="market", ...)`:** Add skill Phase-2 claim call
   - Receive MARKER_KEY/MARKER_TTL/SESSION from main.md session state
   - `CLAIM = call_tool(server="vn-market", tool="task_claim", ...)`
   - If not claimed, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - On success, proceed to send_telegram
   - **NEVER release on success** — TTL sole expiry

4. **weekly.md (line 78), immediately before `send_telegram(channel="market", ...)`:** Add skill Phase-2 claim call
   - Same pattern as daily.md
   - Receive MARKER_KEY/MARKER_TTL/SESSION from main.md session state (for the weekly variant)
   - On success, proceed to send_telegram
   - **NEVER release** — TTL sole expiry

5. Atomic multi-file commit (all 3 files modified together)

---

## Technical Spec

**Files to modify:**
- `docs/agents/digest-predict/flow/main.md` (daily gate lines 48-54, Sunday gate lines 100-106)
- `docs/agents/digest-predict/flow/daily.md` (Phase-2 before send_telegram, line 77)
- `docs/agents/digest-predict/flow/weekly.md` (Phase-2 before send_telegram, line 78)

**Multi-file coordination:**
- **main.md** determines which sub-flow to dispatch (daily or weekly) and runs Phase-1 probe for the appropriate marker
- **daily.md** and **weekly.md** receive the session state (MARKER_KEY, MARKER_TTL, OWNER_CLIENT_SESSION) and run Phase-2 claim before sending
- This is a cross-file threading requirement (like chef/tran-ngoc), but for a different pattern: main.md is a dispatcher that chooses which variant flow to enter

**Marker keys:**
- Daily: `published:digest:daily:DATE` (TTL ~86400s = ~1d)
- Weekly: `published:digest:weekly:ISO_WEEK` (TTL ~691200s = ~8d)

---

## Pseudocode Reference

From architect brief §3 and §4:

**main.md daily gate (Phase-1 probe only):**
```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={kind:"cowork-slot", owner_agent:"digest-predict"})

# Check daily marker
HELD_DAILY = PROBE.locks contains {task_id=="published:digest:daily:"+DATE, expires_at>now}
if HELD_DAILY:
  log "[digest-predict] daily publish blocked (Phase-1 probe)"
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  pass MARKER_KEY, MARKER_TTL, OWNER_CLIENT_SESSION forward to daily.md
  dispatch to daily.md
```

**main.md Sunday gate (Phase-1 probe only):**
```
# Check weekly marker (only on Sunday, or per dispatch table logic)
HELD_WEEKLY = PROBE.locks contains {task_id=="published:digest:weekly:"+ISO_WEEK, expires_at>now}
if HELD_WEEKLY:
  log "[digest-predict] weekly publish blocked (Phase-1 probe)"
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  pass MARKER_KEY, MARKER_TTL, OWNER_CLIENT_SESSION forward to weekly.md
  dispatch to weekly.md
```

**daily.md (Phase-2 claim before send_telegram, line 77):**
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "published:digest:daily:" + DATE,
  task_kind: "cowork-slot",
  owner_agent: "digest-predict",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: 86400
})

if CLAIM.claimed != true:
  log "[digest-predict] daily publish blocked (Phase-2 claim)"
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  send_telegram(channel="market", ...)
  # NEVER release; TTL sole expiry
```

**weekly.md (Phase-2 claim before send_telegram, line 78):**
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "published:digest:weekly:" + ISO_WEEK,
  task_kind: "cowork-slot",
  owner_agent: "digest-predict",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: 691200
})

if CLAIM.claimed != true:
  log "[digest-predict] weekly publish blocked (Phase-2 claim)"
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  send_telegram(channel="market", ...)
  # NEVER release; TTL sole expiry
```

---

## Notes

- **main.md is a dispatcher**, not itself a sending agent (it dispatches to daily/weekly sub-flows)
- **Phase 1 (probe) runs in main.md** to abort early if the appropriate window is already published
- **Phase 2 (claim) runs in each sub-flow** (daily.md / weekly.md) immediately before that sub-flow's own send_telegram
- **Design note:** `digest-predict/flow/monthly.md` also has a `send_telegram(market)` call (line 41) but `digest-monthly` is NOT a registered cowork slot, so it is dead/unscheduled code — flagged for future code-janitor pass, out of scope for this task

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§1.1 gate shape, §4 wiring table for digest-predict, note about monthly.md being unscheduled)
- Skill spec: `docs/handoffs/UC-CCA-P3-FR1-FR2-SKILL.md` (Phase-1/Phase-2 contract)
- Sibling flow-doc tasks: UC-CCA-P3-FR3-{CHEF,ALERT-COMMANDER,BCTC-ANALYST,FB-MARKET-POSTER,TRAN-NGOC-BAU,SPAWN-FANOUT}

---

## QA Gate

- [ ] main.md lines 48-54 have Phase-1 probe for daily marker
- [ ] main.md lines 100-106 have Phase-1 probe for weekly marker
- [ ] Client-side filtering logic present (API has no task_id filter)
- [ ] Phase-1 probes pass MARKER_KEY/TTL/SESSION forward to sub-flows
- [ ] daily.md line 77 (before send_telegram) has Phase-2 claim for daily marker
- [ ] weekly.md line 78 (before send_telegram) has Phase-2 claim for weekly marker
- [ ] Phase-2 EXIT blocks use "duplicate-publish blocked" wording
- [ ] "NEVER release" comments present in both daily.md and weekly.md
- [ ] Daily TTL ≈ 86400s, weekly TTL ≈ 691200s
- [ ] All 3 files committed together (atomic multi-file commit)
- [ ] All 3 files still parse as valid flow docs

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL

---

## Follow-on Tasks

None specific. Parallel with 5 other FR-3 wiring tasks.
