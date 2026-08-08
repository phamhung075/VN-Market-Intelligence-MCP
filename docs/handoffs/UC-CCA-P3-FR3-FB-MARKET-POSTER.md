# UC-CCA-P3-FR3-FB-MARKET-POSTER — Wire published-marker-gate into fb-market-poster (EARLY + file Write)

**Task ID:** UC-CCA-P3-FR3-FB-MARKET-POSTER · **Priority:** P0 · **Zone:** docs/agents/fb-market-poster/  
**Assigned to:** dev-fb-market-poster  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL  
**Handoff from:** pm

---

## Acceptance Criteria

1. **daily.md STEP 0a (lines 40-58):** Replace inline `task_claim` with skill Phase-1 probe call
   - `PROBE = call_tool(server="vn-market", tool="task_list_held", arguments={kind:"cowork-slot", owner_agent:"fb-market-poster"})`
   - Client-side scan: check if any lock has `task_id == MARKER_KEY` and `expires_at > now`
   - If held, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - No claim in Phase 1 (read-only only)
   - Pass forward: MARKER_KEY, MARKER_TTL, OWNER_AGENT, OWNER_CLIENT_SESSION to the flow

2. **daily.md STEP 5 (line 791), immediately before `Write(FILEPATH, ...)` call:** Add skill Phase-2 claim call
   - `CLAIM = call_tool(server="vn-market", tool="task_claim", ...)`
   - If not claimed, EXIT with "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
   - On success, proceed to the file Write call (this is the irreversible publish action for fb-market-poster, not send_telegram)
   - **NEVER release on success** — TTL sole expiry

3. **Weekend variant:** Apply the same Phase-1 and Phase-2 calls to the `published:fb-weekend:` marker in the same daily.md file
   - Identify the weekend sub-flow variant code path
   - Apply Phase-1 probe and Phase-2 claim identically
   - Ensure both use their own window-anchored MARKER_KEY values (daily: `published:fb-daily:DATE`, weekend: `published:fb-weekend:WEEK`)

4. Atomic commit for both daily-key and weekend-key changes

---

## Technical Spec

**Files to modify:** `docs/agents/fb-market-poster/flow/daily.md` (2 gates: daily key + weekend variant)

**Critical difference from other gates (R2 risk):**
- **Other 5 gates use:** "immediately before `send_telegram` call"
- **fb-market-poster has NO MARKET `send_telegram` call anywhere in its flow**
- **Correct placement:** immediately before the irreversible publish action = the STEP 5 file `Write(docs/social/fb-post-{DATE}.md)`
- If Phase-2 is implemented using the generic "before send_telegram" language, it will silently fail to find any send_telegram in this flow and regress the gate entirely

**Daily marker (current working case):**
- Claimed before STEP 1 data-gather (early claim defect, same as chef/digest/tran-ngoc)
- Now: Phase-1 probe at STEP 0a, Phase-2 claim at STEP 5 line 791 before Write

**Weekend variant:**
- A separate `published:fb-weekend:` marker with different window-anchor (ISO week period, not calendar date)
- Both daily and weekend variants are in the same file and use the same STEP 0a probe location
- But they claim at the same STEP 5 location (both before the Write call, which produces the same fb-post file but with different content labeling)
- Ensure TTL values match cadence: daily = 86400s (~1d), weekend = ~691200s (~8d, ISO week period)

---

## Pseudocode Reference

From architect brief §3 and §4:

**daily.md STEP 0a (Phase-1 probe for daily marker):**
```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={kind:"cowork-slot", owner_agent:"fb-market-poster"})
HELD_DAILY = PROBE.locks contains {task_id=="published:fb-daily:"+DATE, expires_at>now}

if HELD_DAILY:
  log "[fb-market-poster] publish blocked (Phase-1 probe) — already held key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  # Also check weekend if applicable
  HELD_WEEKEND = PROBE.locks contains {task_id=="published:fb-weekend:"+WEEK, expires_at>now}
  if HELD_WEEKEND:
    log "[fb-market-poster] weekend publish blocked (Phase-1 probe)"
    EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  else:
    proceed with STEP 1 gather
```

**daily.md STEP 5, before Write (Phase-2 claim for daily marker):**
```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "published:fb-daily:" + DATE,
  task_kind: "cowork-slot",
  owner_agent: "fb-market-poster",
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds: 86400  # ~1d
})

if CLAIM.claimed != true:
  log "[fb-market-poster] daily publish blocked (Phase-2 claim)"
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
else:
  # Proceed to the irreversible Write call (NOT send_telegram)
  Write(docs/social/fb-post-{DATE}.md, ...)
  # NEVER release; TTL is sole expiry
```

**Same location, Phase-2 claim for weekend marker (if applicable for this slot):**
```
# Only if weekend flag is set for today
if isWeekendPost():
  CLAIM_WEEKEND = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: "published:fb-weekend:" + ISO_WEEK,
    task_kind: "cowork-slot",
    owner_agent: "fb-market-poster",
    owner_client_session: OWNER_CLIENT_SESSION,
    ttl_seconds: 691200  # ~8d
  })
  if CLAIM_WEEKEND.claimed != true:
    log "[fb-market-poster] weekend publish blocked (Phase-2 claim)"
    EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # Proceed (same Write call, just with weekend labeling in content)
```

---

## Risk Flags

**R2 (fb-specific generalization footgun):**
- Any implementer who copy-pastes "immediately before `send_telegram`" verbatim onto fb-market-poster will fail to find one
- The irreversible publish action for fb is a file Write, not a Telegram send
- Phase-2 MUST land before line 791 (the Write call), not anywhere else
- Explicitly flagged in this handoff to prevent regressing the gate during implementation

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§1.1 finding about fb having no send_telegram, §4 wiring table note about file Write, §10 R2 risk flag)
- Skill spec: `docs/handoffs/UC-CCA-P3-FR1-FR2-SKILL.md` (Phase-1/Phase-2 contract)
- Sibling flow-doc tasks: UC-CCA-P3-FR3-{CHEF,ALERT-COMMANDER,BCTC-ANALYST,DIGEST-PREDICT,TRAN-NGOC-BAU,SPAWN-FANOUT}

---

## QA Gate

- [ ] daily.md STEP 0a (lines 40-58) has Phase-1 probe call for both daily and weekend keys
- [ ] Client-side filtering logic present (API has no task_id filter)
- [ ] Phase-1 EXIT block uses "duplicate-publish blocked" wording
- [ ] daily.md STEP 5 line 791 (before Write) has Phase-2 claim for published:fb-daily: marker
- [ ] Same location has Phase-2 claim for published:fb-weekend: marker (if flow includes weekend logic)
- [ ] Phase-2 EXIT blocks use "duplicate-publish blocked" wording
- [ ] "NEVER release" comments present for both daily and weekend claims
- [ ] Daily TTL ≈ 86400s (~1d), weekend TTL ≈ 691200s (~8d)
- [ ] File still parses as valid flow doc

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL

---

## Follow-on Tasks

None specific. Parallel with 5 other FR-3 wiring tasks.
