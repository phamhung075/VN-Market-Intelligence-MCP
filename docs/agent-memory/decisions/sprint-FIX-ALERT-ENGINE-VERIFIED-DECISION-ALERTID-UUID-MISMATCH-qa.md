# Decision Journal — Sprint FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH · qa

**Sprint goal:** Replace UUID alert ids with semantic ids in scan-job emitters; stop orphan verified_decision signal growth
**Agent:** qa
**Started:** 2026-06-25T15:10:00Z

---

### STEP qa-S1 · qa · 2026-06-25T15:30:00Z
**task-id:** FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH
**what-done:** APPROVED fix; confirmed all 4 verify criteria and DoD independently.
**what-considered:**
- Whether 1307/1309 pre-existing failures could be caused by the semantic-id change
- Whether fingerprint dedup path is still intact with new id format
**why-decision:** 1307/1309 failures are schema-drift ("confidence_score column missing") in old test buildDb(); last touched b3ea96fa (Jun 19), 6 days before fix; failure root is storeAlerts signal-insert path, not id generation. All 4 verify criteria confirmed: (a) semantic format in both jobs; (b) UUID writer eliminated (pre-fix parent confirmed crypto.randomUUID); (c) alertStore.ts:194 propagates alert.id→alert_id; (d) fingerprint unchanged in alertDedup.ts. 5/5 new TCs pass. tsc EXIT 0.
**why-change:** no change from plan — straight APPROVED path
