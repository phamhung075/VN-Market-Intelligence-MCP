---
sprint: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER
task-id: TASK-CWKSCH-1, TASK-CWKSCH-2
agent: qa
date: 2026-06-18
---

## QA Decision Entry — TASK-CWKSCH-1 + TASK-CWKSCH-2

**verdict:** APPROVED

**what-considered:**
1. Targeted test run: 51 pass / 0 fail (DWF-phase1-cadence.test.ts --no-cache).
2. T-14b RED-without-guard independently reproduced: removed guard from batchWriteLastFired, ran test → 50 pass / 1 fail (T-14b: received STALE_A "2026-06-18T06:03:09.104Z", expected FIRED_B "2026-06-18T06:03:14.104Z"). ONLY T-14b failed. Guard restored → 51/0 GREEN.
3. Full CI per-file isolation (bash ../../scripts/ci-per-file-isolation.sh 16): 13159 pass / 42 skip / 40 fail. 12 failing files — ALL DISJOINT from commit 30b9a7f8 changed files (DWF-phase1-cadence.test.ts, last-fired.md, orch-state.json). Failures are pre-existing.
4. tsc: exit 0 (no errors).
5. DDD scan: no forbidden domain→infrastructure imports in test file.
6. Security scan: no process.env, no secrets/passwords/tokens in modified files.
7. Smart-Skip: test-only + flow-doc change — no production source modified, mock-guard skipped.
8. last-fired.md diff verified: guard is 3 lines applied to WON_SLOTS loop only; null branch explicit (`currentLastFired === null OR FIRED_AT > currentLastFired`); fresh-read at top of try block NOT touched; atomic temp→rename NOT touched.
9. Verification gate: T-14 (Writer-A owns slot-a only → slot-b=FIRED_B unchanged) + T-14b (adversarial stale stamp on slot-b blocked) = both-slots-persist + monotonic confirmed.

**why-change:** No change from plan — all checks green, no architecture impact.
