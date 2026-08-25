# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · agent-father (continuation 4)

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** agent-father
**Started:** 2026-08-23T16:10:00Z
**Rolled from:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-3.md` (byte cap 36000B breached at 37804B; see its CAP-REACHED marker)
**STEP numbering continues across the chain** — next id is `agent-father-S64`, not S1.

---

### STEP agent-father-S64 · agent-father · 2026-08-25T03:05:00Z
**task-id:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW
**what-done:** Wired § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation into dev-team's main.md at the Session-Gate→Step-1 anchor (FIRST of ILC→SECONDARY-Drain→QA-Drain→Step1), calling the already-shipped `.jq` claim script verbatim per architect brief §4d; committed 94716bfe6, flipped REVIEW/next_agent=qa, `.head` idle-reset (commit c677e3ac9).
**what-considered:**
- Copy SECONDARY-Drain's readback (`.task_board.review[]`-only) verbatim — REJECTED: dispatcher flagged it live-caught this same tick missing a `done[]`-origin claim (its own script's candidate set is `review[] UNION done[]`).
- Copy SECONDARY-Drain's hardcoded spawn-text premise ("status=REVIEW, branch:null") — REJECTED: false for a non-review-origin pick.
- Generic all-lane readback + row-derived spawn text (own row's status/lane/claimed_by, never hardcoded) — CHOSEN.
**why-decision:** Both neighbour-section defects were reproduced live by the dispatching session minutes before this task started; copying them into a brand-new section would ship the identical silent-lane-miss/false-premise class a 3rd time. Brief's own bash sample (`.task_board.in_progress[]`-only) is not actually in conflict — the shipped script's SOLE destination lane is `in_progress[]` (verified by reading it), so the generic scan and the brief's narrower query return an identical result set.
**why-change:** No change from brief's design — SECONDARY-Drain's own two defects were NOT retrofitted (out of this row's scope), flagged in RETURN for a follow-up row instead.

### STEP agent-father-S65 · agent-father · 2026-08-25T18:55:00Z
**task-id:** FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW
**what-done:** Router hand-dispatch (off DRS-allowlist). Added a keepalive renewal to S2 dispatcher-wrap's AND ILC's own `claimed:false` (peer-held) branch — `task_heartbeat(resume_key, owner_client_session=current_holder.owner_client_session, ttl_seconds=3600 unchanged)` — committed `faf84a6f6`. Did NOT flip the board row (orch-state.json is outside agent-father's commit_zone.allowed per FU-AGENT-FATHER-ORCH-SCOPE); reported BOARD recommendation via RETURN for router/PO to land.
**what-considered:**
- Raise `ttl_seconds` — REJECTED outright, AC-4's own explicit trap (moves the cliff, doesn't remove it).
- Have S2 heartbeat using `$CLAUDE_CODE_SESSION_ID` of the renewing tick — REJECTED: each cron fire is a brand-new session (`task-lock-protocol.md` § Session-Singleton Subclass confirms cross-tick session-id churn); Rung A match would fail, `hb.ok=false`.
- Sweep ALL of ILC's own previously-claimed batch rows (INCIDENT_CAP=2, only the "top" is `.head`-narrated) — CONSIDERED then REJECTED: traced that a non-`.head`-narrated row is never re-evaluated for dispatch by ANY code path (not S2, not any claim script — those only select from `ready[]`), so its lock's eventual expiry is inert, not a duplicate-spawn vector; would have been unjustified scope growth.
- Mirror the SAME renewal at SLS/RLC/DRS/QA-Drain (identical code shape) — REJECTED: out of this row's own named `files`/AC-3 scope (S2 + ILC only); flagged as an identical, unfixed residual in-file, same "cited not fixed" convention as prior entries.
- Renew using `current_holder.owner_client_session` read verbatim off the SAME failed-claim response, at BOTH S2's and ILC's own peer-held branch — CHOSEN: only tool-contract-compliant cross-tick renewal path (Rung A requires exact `owner_client_session` match; this supplies the row's own recorded value, never forged), satisfies AC-3's "both call sites, independently."
**why-decision:** Once the peer-held branch renews on every tick that observes it, `resume_key` cannot organically expire while `.head`/task_status still shows the row genuinely in flight and dev-team keeps ticking (AC-1) — WF-3/WF-4 (byte-unchanged) remain the sole authority for a genuinely-abandoned pin, so a cron that truly stops ticking still recovers exactly as before (AC-2). AC-2's "proven not asserted" bar is met by control-flow inspection (this file's own established verification standard for the Idle-Tick Rotation Selection's single-writer guarantee), NOT by an empirical 60+min live run — infeasible to execute as agent-father with no gateway-bound live specialist to observe for an hour.
**why-change:** No architect brief exists for this row (PO ruling ac-authored directly, `triage-20260825T1815Z`) — design derived directly from reading `coordinationStore.ts`/`taskHeartbeatTool.ts`/`taskClaimTool.ts` source (Rung A match semantics, `current_holder` shape) rather than following a pre-set spec, flagged in RETURN as UNVERIFIED-empirically/VERIFIED-by-construction.
