# PO Notebook

## 2026-08-24T16:53Z — 2 auditor-tier1 defects ruled: 1 mint, 1 promote, 2 handed-me premises corrected

Prior 14:40Z section dropped whole (OVERWRITE class, preamble+1 section, ≤50L).

### Both rulings ACTED, not narrated
One `orch-apply.sh` pipe, both mutations in a single candidate (short read→transform gap, per the CAS-window lesson). `backlog 537→536`, `ready 109→111`, task_total `833→834`, no dup ids, `.head` untouched and still idle (it named neither row).
- **MINTED** `FIX-AUDITOR-TIER1-PROBE-TEST-INVERTED-ASSERTION-L1422-FALSE-GREEN` → `ready[]`, P1, FIX/S, zone `cross-service/`, next_agent=**developer**.
- **PROMOTED** `FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED` `backlog→ready`, held P1, next_agent=**architect**.

### The inverted assertion is real, and I re-derived every number
`check()` (L30-39) increments PASS **only** on the literal string `"true"`. `grep -c '^check "'` = **264**; `grep -c '&& echo true || echo false'` = **263**; the sole `|| echo true` without a preceding `&& echo true` is **L1422**. So when the timestamps DIFFER (healthy) the substitution is empty → FAIL; when IDENTICAL (broken) → PASS. Exact negation of its own label.
Consequence that matters: `FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT` went DONE_VERIFIED on a **264/264 run whose greenness depended on the inversion**. The **263/1** run was the correct one. The flakiness IS the bug.
Exculpatory evidence I recorded in the row so nobody re-derives it: live `auditor-tier1-spawn-debounce.json` entry[0] has `first_seen_at=12:42:19Z` ≠ `last_seen_at=12:45:14Z` — production **does** advance it. Test-only defect; the label is the right expectation.

### I refused the one-character fix
Un-inverting alone re-arms a REAL flake — both ticks can land in the same wall-clock second, making `!=` legitimately false. So AC-2 mandates de-flaking (not just un-inverting), AC-3 mandates **3 consecutive identical-count runs** (one green run proves nothing about a same-second race), AC-4 an opt-IN idiom lint, AC-5 a re-run of the **corrected** suite against the approval it corrupted — filing a NEW row if the ledger misbehaves, never silently reopening the DONE_VERIFIED one.

### Corrected 2 premises I was handed (neither changed the verdict)
1. **Timeline inverted.** The prompt framed the 16:40:57Z tick as post-ack-removal evidence. It is the reverse: `auditor-tier1-last-trigger.json` `written_at=16:40:57Z` still carries the `elif`/`STALE-ACK(tracked_by=FIX-SIZELINT-…,status=DONE_VERIFIED)` branch, while commit `930297f37` landed **16:44:23Z, 3m26s later**. That tick is a PRE-removal observation; the post-removal prediction is sound by code reading but **has not been observed live**.
2. **"The ack was the only thing SUPPRESSING the not-loaded line"** — not quite. Only `ack_rc -eq 0` suppresses. The removed ack was *stale*, so it sat in the `elif` branch and was already emitting the entity line; removal was a **no-op on both signature and verdict**. Conclusion survives: `auditor-tier1-probe.sh` L719-731 shows `elif` and `else` emit the byte-identical `printf 'launchd_agents\t%s\n' "$label"`.

### Coverage absence re-proven my own way, not inherited
Resolved `[paths(objects with id and (status or title))]` → **12** row-bearing containers (incl. `active_sprints[].tasks[]`, `closed_sprints[].tasks[]`, `signal_queue.rows`), then matched `id+title+description+status_note+acceptance_criteria+files+notes` — 4 fields wider than the prompt. Zero open owners. The 3 file-naming rows are all DONE_VERIFIED, and one of them (`TASK-CRON-LIVENESS-PROBE-TESTS`) is actually scoped to a **different** file, `cron-marker-liveness-probe.test.sh`. The two `deflake` backlog rows are **not** class-level owners — `FIX-RAG-TEMPORAL-DECAY-TEST-JITTER` pins `135-rag-temporal-decay.test.ts` (zone `apps/mcp-server/`, priority low). `signal_queue.rows[]` created ≥16:00Z = **0**, so the auditor's "recommend minting" recommendation had indeed gone nowhere.

### Constraints written INTO the promoted row, not just obeyed here
An architect picking that row up could "helpfully" re-arm the job, so `status_note` carries: never re-arm (`plutil -p` verified live — `"Disabled" => 1`, `StartInterval => 1800`, absent from `launchctl list`; the plist is **BINARY** so `grep -i disabled` false-negatives), never add/retarget an ack, don't conflate with `docker-events`(exit 143). Design *hint* only, left to architect: the probe's `obsolete_labels` (L696, single entry `com.vn-market.socat-bridge`) is the wrong semantics — a deliberately-disabled job isn't obsolete; read the plist's own `Disabled` key as EXPECTED-DISABLED and it generalises.

### Carry-over
- **Promotion was not cosmetic:** `ready[]` holds only **2** rows with `next_agent=architect`, so this is a shallow queue, not the 109-deep lane the raw count implies.
- Promoted row carries `owner=developer` but `next_agent=architect` (pre-existing mismatch, inherited from backlog). Dispatch reads `next_agent`, so I left it rather than churn the board a second time — worth a sweep if this shape is common.
- **Did NOT push** (PUSH-AUTONOMY-1 unsatisfied) and did NOT touch fleet-push, per standing user decision.
- T1 stays FAILURE ~1 spawn/hour until the architect row ships; debounce window expires 17:40:57Z, then re-arms at spawn_count 1. Bounded, never zero.
