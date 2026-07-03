# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · developer

**Sprint goal:** Merge Money Radar workstream into Momentum (ambient sprint at time of this entry; entry below is for an unrelated ad-hoc FIX task, no active sprint owns it).
**Agent:** developer
**Started:** 2026-07-03T00:00:00Z

---

### STEP developer-S1 · developer · 2026-07-03T00:00:00Z
**task-id:** FIX-FB-DAILY-FIRER-CLI-FLAG
**what-done:** Deleted line 138 of scripts/cowork-fb-daily-firer.sh (`--no-update-notification \`) — flag unrecognized by installed claude CLI, caused hard-exit before `-p` prompt ran on every launchd fire.
**what-considered:**
- only path: delete the unsupported flag (root cause confirmed via signal doc + `claude --dangerously-skip-permissions --help` showing no `--no-update-notification` option and no parse error after removal)
**why-decision:** minimal 1-line deletion restores the guaranteed-slot backstop with zero behaviour change to the remaining valid flags; no alternative flag/env-var suppression needed since update-notification noise was never the actual blocker.
**why-change:** no change from plan — task spec's proposed fix matched root cause exactly.
