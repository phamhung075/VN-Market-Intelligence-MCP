# Decision Journal — Sprint FB-POSTER-LAUNCHD-FIRER · developer

**Sprint goal:** OS-level launchd firer for fb-daily 09:15Z guaranteed slot
**Agent:** developer
**Started:** 2026-06-30T18:30:00Z

---

### STEP developer-S1 · developer · 2026-06-30T18:35:00Z
**task-id:** FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL
**what-done:** Authored wrapper script (scripts/cowork-fb-daily-firer.sh) + plist (launchd/com.vn-market.fb-daily-firer.plist) to fire fb-market-poster headlessly at 09:15Z Mon-Fri without a live CLI session.
**what-considered:**
- StartCalendarInterval (precise fire time) — DST-sensitive on France machine; requires manual update at each DST transition
- StartInterval=900 + internal UTC date -u gate — DST-invariant; same pattern as fleet-push; most runs sub-second no-ops
**why-decision:** StartInterval + UTC gate is DST-invariant and matches the cowork */15 cadence; fleet-push plist proves the pattern works in this project
**why-change:** No change from task plan; scope expanded to also cover fb-weekend (13:13Z Sat-Sun, also guaranteed+last_fired:null) in same script/plist since it's same agent/flow
