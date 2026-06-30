# Decision Journal — Sprint FB-POSTER-LAUNCHD-FIRER · po

**Sprint goal:** OS-level, all-local launchd firer for the guaranteed FB slots (fb-daily 09:15Z, fb-weekend 13:13Z), independent of any live Claude CLI session.
**Agent:** po
**Started:** 2026-06-30T17:28:32Z

---

### STEP po-S1 · po · 2026-06-30T17:28:32Z
**task-id:** FB-POSTER-LAUNCHD-FIRER (sprint kickoff)
**what-done:** Minted sprint_goal entry + a 4-row cascade (developer LEAD → ready[]; cowork-fix, ops, qa → backlog[] with depends) via scripts/po-s136-*.jq | orch-apply.sh; head left on the live OHLCV epic.
**what-considered:**
- BA-spec-first cascade (slower) vs direct decompose (router gave the breakdown + this is cross-service scripting, not a feature spec)
- Route flow .md edit to generic developer vs cowork-refactory-expert
**why-decision:** Router supplied the dev/ops/qa decomposition + zone is cross-service/ scripting → direct mint, no BA hop. Flow .md edits route to cowork-refactory-expert per dispatch table (cowork-agent maintenance lane), so that fix is a separate router-dispatched row, not dev-team-cron auto-adopt.
**why-change:** Added a 4th row (FIX-FB-WEEKEND-DEDUP-GATE) not in the router's 3-part breakdown — see po-S2.

### STEP po-S2 · po · 2026-06-30T17:28:32Z
**task-id:** FIX-FB-WEEKEND-DEDUP-GATE
**what-done:** Folded a discovered latent gap into the sprint as a blocking prerequisite for the weekend firer.
**what-considered:**
- Trust main.md STEP 0a's claim that the weekend dedup key "is inserted in the respective sub-flows"
- RAW-grep the sub-flows
**why-decision:** RAW-grep of weekly-recap.md + weekly-prediction.md found ZERO task_claim / `published:` marker — the claimed `published:fb-weekend:<VN-DATE>` gate does NOT exist. MODE ROUTER jumps to the sub-flows BEFORE main.md STEP 0a, so weekend has NO double-post protection today. Shipping a weekend launchd firer without it would re-create the exact double-post class (feedback_guaranteed_slot_week_key_double_post). Hard prerequisite for weekend enable; fb-daily firer can ship without it (daily dedup exists).
**why-change:** Gap discovered during design RAW-verify, not in the original ask.

### STEP po-S3 · po · 2026-06-30T17:28:32Z
**task-id:** FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL
**what-done:** Specced the DST-robustness "hard part" as AC3 with developer latitude (UTC self-gate vs dual-local-entry), and the double-post guard as INHERITED (wrapper invokes the same flow → existing period-keyed task_claim dedups launchd-fire vs cowork-*/15-fire; wrapper must NOT add a divergent key).
**what-considered:**
- Wrapper implements its own dedup vs reuse the flow's STEP 0a marker
- StartCalendarInterval local-time entries vs StartInterval poll + UTC gate
**why-decision:** Reusing the flow's `published:<slot>:<VN-DATE>` marker is the canonical week-key dedup (whichever firer wins, other no-ops) — a second wrapper key would DEFEAT the guard. DST decision left to developer (genuine design call) but bounded by AC3 + the proven fleet-push.plist pattern. Pinned claude binary path /Users/admin/.local/bin/claude + SSOT slot times (cowork-schedule.json, NOT the stale 13:07Z in the flow doc).
**why-change:** no change from plan.
