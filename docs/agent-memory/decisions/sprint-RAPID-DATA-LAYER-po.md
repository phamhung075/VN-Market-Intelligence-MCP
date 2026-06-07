# Decision Journal — Sprint RAPID-DATA-LAYER · po

**Sprint goal:** daily triage 2026-06-07 (ambient — dispatcher-held task po-triage-20260607)
**Agent:** po
**Started:** 2026-06-07T00:52:34Z

---

### STEP po-S1 · po · 2026-06-07T00:52:34Z
**task-id:** po-triage-20260607
**what-done:** Triaged 6 dispatcher candidates: 2 signals closed (SLA fix live-verified), 3 backlog FIX rows created, TECH-DEBT-LINTING promoted, 1 attribution debunked.
**what-considered:**
- schema drift: ratify task_id vs normalize to id — measured 159/159 active rows task_id (not 4); done[] already 82/84 id
- bloat hook: WONTFIX vs cold-path suppress — suppress is 6L on breach path only, hot-path contract intact
- sqlite3 gap: add to image vs host-side — host DB volume-mounted, image rebuild = peer-kill risk
**why-decision:** Normalize to id (canon authority = TS interface, done[] majority already migrated); host-side DB checks (zero rebuild); suppress = BACKLOG low (loop works, just noisy).
**why-change:** Dispatcher drift count off by 39x (4 vs 159) and brief §7 attribution wrong — verified raw before deciding, per router-verify-raw rule.
