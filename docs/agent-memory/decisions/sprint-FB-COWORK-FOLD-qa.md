# Decision Journal — Sprint FB-COWORK-FOLD · qa

**Sprint goal:** Fold fb-market-poster into the cowork master dispatcher, eliminating standalone-cron evaporation failure.
**Agent:** qa
**Started:** 2026-06-29T00:00:00Z

---

### STEP qa-S1 · qa · 2026-06-29T00:00:00Z
**task-id:** TASK_1996
**what-done:** APPROVED TASK_1996 (add fb-daily + fb-weekend slots to cowork-schedule.json + Team Boundary). All 4 checks GREEN via independent live execution.
**what-considered:**
- Check 1 (matcher): ran cronMatches() with 13 controlled-now probes. fb-daily fires at actualM=15/H=9/DOW=1-5, misses Sat/Sun/other-ticks. fb-weekend fires at actualM=15/H=13/DOW=6,0 (minute 13 within ±2 of nominal tick 15). OLD :07 silently misses ALL 4 dispatcher ticks (:00/:15/:30/:45). Negative injection CONFIRMED.
- Check 2 (JSON): both fb-daily+fb-weekend have exact field set as digest-sunday (19 keys each, no missing/extra). No duplicate slot_ids across 21 slots.
- Check 3 (boundary): fb-market-poster present in cowork-team/flow/main.md scheduled list line 9.
- Check 4 (dedup): TASK_1997 DONE + STEP 0a in fb-flow with published:fb-daily:<VN-DATE>/cowork-slot/ttl=100800 verified. TASK_1998 standalone-cron retire DONE.
**why-decision:** All 4 checks PASS including real negative case (:07 miss); sprint seam complete (1996+1997+1998+1999 all DONE); verdict APPROVED.
**why-change:** no change from plan — implementation matches TASK_1996 note verbatim; comma-DOW 6,0 and ±2-of-floored-tick logic pre-verified by PO and now independently confirmed.

---

### STEP qa-S2 · qa · 2026-07-01T03:10:00Z
**task-id:** TASK_1996
**what-done:** APPROVED TASK_1996 re-verification (stranded REVIEW row — board flip missed in cycle-349).
**what-considered:**
- Committed state at 3f8f07ae: fb-daily (cron `15 9 * * 1-5`, guaranteed=true, agent_id=fb-market-poster) + fb-weekend (cron `13 13 * * 6,0`, guaranteed=true) both present in cowork-schedule.json (HEAD also confirmed, 21 slots).
- cowork-team/flow/main.md Team Boundary line 9 scheduled list includes fb-market-poster — confirmed via git show 3f8f07ae grep.
- Board row status was REVIEW with done_at 2026-06-29T16:46:36Z (qa update from cycle-349) + next_agent=qa — stranded due to missed DONE_VERIFIED flip; re-verification confirms original APPROVED verdict correct.
**why-decision:** Both deliverable checks GREEN RAW. No new code changes since cycle-349 APPROVED. DONE_VERIFIED flip applied.
**why-change:** No implementation change — board-only state correction (stranded REVIEW → DONE_VERIFIED).
