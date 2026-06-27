# Decision Journal — Sprint BCTC-REFINE-STALL-RETRIGGER · po

**Sprint goal:** Resolve the 20-day VHM/VIC Q1-2026 BCTC data-integrity escalation (c075).
**Agent:** po
**Started:** 2026-06-27T19:30:00Z

---

### STEP po-S1 · po · 2026-06-27T19:28:00Z
**task-id:** BCTC-REFINE-STALL-RETRIGGER (disposition of A1 diagnosis; A1 itself DONE)
**what-done:** Chose OPTION-B — RE-SCOPED the sprint to a focused THROUGHPUT-DRAIN; re-scoped the ready[] board row + set head→architect via orch-apply.sh.
**what-considered:**
- Option A (close as NO-BUG/phantom): rejected — a real consumer is RAW-verified starved NOW, not make-work.
- Option B (re-scope to throughput): chosen — but only after RAW-proving a starved consumer.
**why-decision:** RAW probe `get_bctc_full{code:VHM}` = "Chua co du lieu BCTC" (19:24Z, AFTER the A1 diagnostic tick) — still no data; `get_bctc_pending_refine` = 47 docs incl every major watchlist Q1-2026 BCTC. get_bctc_full only serves a ticker post-finalize_bctc_refine (gates total_pushed==windows.length), so at 2 fires/day × REFINE_CHUNK_SIZE=7 = 14 windows/day the consumer stays starved for weeks. The drain rate is a real, fixable throughput constraint — levers RAW-verified real (REFINE_CHUNK_SIZE=7 hardcoded slice(0,7) in refine flow main.md L8/L48 + init.md; 2 cowork slots in cowork-schedule.json).
**why-change:** A1 falsified the architect's "dispatcher dark" premise; this disposition cancels the dead re-trigger machinery (A1 DONE) and B1/B2 (VIC discovery gap RESOLVED — VIC_2026_Q1.pdf is now IN the pending-refine queue, 40 windows), demotes A2/C1 observability to backlog P2 (T3), and mints the two real levers T1 (raise chunk size → agent-father) + T2 (add cowork slots → ops) as the active work. Did NOT run /cron-cowork-team (dispatcher proven alive).

---
