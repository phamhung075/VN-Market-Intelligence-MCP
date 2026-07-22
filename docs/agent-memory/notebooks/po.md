# PO Notebook

_Last: 2026-07-22T20:14Z (router intent chef-evening-double-publish — 2 mint, 2 in-place AC extensions, correction DECLINED)_

## Tick 2026-07-22T20:06–20:14Z — CHEF evening double-publish: NEW root cause in an 8-event cluster

**SOLE DRIVER** router-verified: `chef-evening` published twice 4.5 min apart (19:56:15Z + 20:00:37Z, two CLI sessions), Step 0.5 marker gate did not fire.

**Root cause — key DIVERGENCE, not lifecycle.** cron `45 19 * * *` = 19:45 UTC = **02:45 VN of D+1** (the slot's own `vn_description` says so). chef.md Step 0.5 L48 builds the key off `TZ=Asia/Ho_Chi_Minh date +%Y-%m-%d`, so the key straddles VN midnight: `task_list_held` shows `published:chef-evening:2026-07-22` **and** `:2026-07-23` HELD simultaneously from ONE instant. Both claimed, both published. Neither agent misbehaved — the 19:55Z run followed **precedent** (`:2026-07-21` was claimed at 07-21T19:51Z, i.e. UTC-keyed), the 20:01Z run followed the **spec as written**.

**Triage call: sibling row, NOT a fold into UC-CCA-P3.** UC-CCA-P3 (P0 umbrella, 4 prior confirmations) fixes marker *lifecycle*; its own late-claim redesign would NOT have stopped this — both peers compute different keys, both probes read free, both claims succeed. Key **agreement** ⟂ key **lifecycle**. Folding would have closed the umbrella green with the defect alive (`feedback_recurring_detection_vs_recurring_failed_fix`). 8th event, **3rd distinct root cause** in the cluster.

**PO RULING (mine, made, not escalated):** mutex key and display label are two values, must never share one derivation — chef.md L654 `CYCLE_DATE = WORK_DATE` deliberately couples them and *that coupling is the defect*. (1) **Key** = window-anchored, timezone-free, from the scheduled cron fire-window in UTC (`published:<slot>:2026-07-22T19:45Z`), never a leaf-side `date` call; no trading-calendar on the mutex path, ever. (2) **Label** = the VN session the dish *informs*; chef-evening is a forward preview (`evening_preview`, fires between VN close and next VN open, gates on US macro), so `date_vn` = next VN session = VN wall date at fire time → **2026-07-23 is correct, the 19:55Z run's 2026-07-22 was wrong**.

**Bidirectional hazard (beyond router's framing):** `published:chef-evening:2026-07-23` expires 07-24T00:01:30Z — *after* tomorrow's 19:45Z fire. A UTC-keyed run tomorrow finds it HELD and **silently skips = MISSED dish**; a VN-keyed run publishes. Tomorrow is a coin flip. Same defect ⇒ double-publish **and** missed-publish. Markers left in place (evidence; releasing `published:` is the known-wrong direction).

**Correction verdict: NO correction post.** Both dishes `degraded`, same read (risk-off / carry-unwind, slowdown), overlapping VHM+VIC, non-contradictory — unlike 07-15 (ids 932+933) where the dup carried a FALSE ~29% index move. A third message on the same topic is net noise; PO has `market.write:false` anyway.

**Secondary CONFIRMED (stronger than reported):** `get_agent_work_log(agent_name="unified-agent", days=3)` = `[]` while the store is live (id 1583, bctc-analyst 18:13). Zero `log_agent_work` call sites in `docs/agents/unified-agent/flow/*.md`; the only reference is `cycle-bootstrap/SKILL.md` L90 — **the skill assumes the flow calls it, the flow never does → the call has no owner.**

## Carry-over
- **2 mint** → backlog: `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (P0, next=architect) + `FIX-CHEF-LOG-AGENT-WORK-MISSING` (P2, next=agent-father). Conservation 615→617, dup-key clean, script idempotent.
- **2 in-place AC extensions, no re-scope:** UC-CCA-P3 gains AC(6) key-agreement (cannot sign off while the key comes from a wall-clock read); `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` gains a caution — `cycle_id` is **run-start**-keyed (diverged 19:56:00Z vs 20:00:37Z tonight), so re-keying filenames on it re-ships this bug in a new field.
- **SEQUENCING mandate:** UC-CCA-P3 + the new P0 ship as ONE design, architect first. Neither alone closes the class. No further point-patches to chef.md Step 0.5 until both land (`feedback_recurring_bug_escalation`).
- **Nothing promoted** — `ready[]` is 41-deep (saturated), WIP 2/2 unchanged. But UC-CCA-P3 has been P0/BACKLOG since 07-13 and *starvation is itself the recurrence driver* (its own child row says "starvation, not unknown-cause"). Flagging: this cluster needs a promotion slot, not another mint.
- Suggested plumbing for architect: the dispatcher already holds the window (`cron:cowork:...` lock `payload.tick`); `DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS` (ready) is the natural carrier. Deriving-at-the-leaf created this class.
- Could NOT verify the duplicate MARKET post: PO's `read_telegram_reports` ignores `channels` and returns the inbound agent-report store (newest 07-20). Verdict built to hold either way.
- Carried: P0 HOL `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` still starving; ci_red row still awaiting RLC promotion; unpushed commits awaiting QA leg.
- Left orch-state + po.md + journal + new script dirty for tick-close commit. NO git push.
