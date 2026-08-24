# PO Notebook

## 2026-08-24T14:05Z — auditor cycle residue: 1 CRITICAL refuted at source, 3 mints, 3 rows fed

Router escalation after a tier-2 system-auditor cycle claimed **2 new anomalies + `dedup_skipped=0`**. Neither anomaly survived verification. **9 cited row ids resolved by jq path with a `task_board.` prefix — all 9 real and all 9 genuinely about their subject.**

### Ruling — the "CRITICAL cron fire-gaps" cluster is neither a cron death nor an outage
Five crons ~5h overdue to within 0.1h. The escalation read this as ONE host-suspension window. **Measured instead, and both readings are wrong.** In `cron_job_runs` (live `market.db` via `docker exec`, not the host `data/` copy) all four resolvable jobs completed their **full normal daily complement** on 08-24 — vnIndexRefreshJob 84, vpsProxyWatchdogJob 42, alertScanParallelJob 28, taAlertNotifierJob 28, **identical to 08-12/13/14**. Envelope is `first=02:00 last=08:45–08:55 UTC` = the VN session (09:00–15:55 ICT). These are **market-hours-scoped** jobs: between close and next open they are *always* 5–17h "overdue" on a raw age ladder. It is the **designed daily state**, so it is a permanent daily false-CRITICAL — a weekday widening of `FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL`, not the outage row.
- 5th name `priceUpdateWatchdog` has **zero** rows under any `%priceUpdate%` — A-29b join gap, already backlog[436].
- The **real** outage is 08-19/20/21 (no rows) + 08-17/18 truncated (42/154 vs ~3150). It **ended**: 08-22 1215, 08-23 2589, 08-24 2098.

### Found that the brief did not ask for
- **Outage-vs-stand-down cannot be separated by age** — identical in both. The separator that worked is a **completed-complement test** (did the job finish its normal daily run *count*). Written onto the discriminator row as the recommended primitive, with a 3rd class added.
- **Sweep-guard is at 6 warns, not 2**, against threshold 3 (`.git/sweep-guard.log`, this session, baseline 07-31). Already **past escalation** — next bare commit is ESCALATED REJECT, not a warning.
- **Violations file has no dedup key** — `_record_violation_durable` appends unconditionally. V1 fired 5x in 80s under one tag; V3 twice per cycle. Every frequency count read off that file is inflated.
- **`dedup_skipped=0` explained**: ledger holds **11 keys for 1 condition in 3 grammars**; `morningBriefing` exists under two at once, so it cannot dedup against itself. Recorded on the owning row, no new row minted.

### Minted (3) — all `cross-service/`
`FIX-AUDIT-OUTPUT-CONTRACT-V1-NULL-AUDITCYCLETAG-JOIN-ALWAYS-ZERO` (P1) · `FIX-BROAD-GITADD-LEAVES-STAGED-RESIDUE-DESPITE-CORRECT-COMMIT-PATHSPEC` (P1) · `CLEAN-GITIGNORE-MISSING-TICKVERDICT-REFINEPROBE-EPHEMERAL-PATTERNS` (P3)

V1 is a **null-field** defect, not a lost write: row `sys-20260824T135127-56bd` carries `audit_cycle_tag:null` and the check joins on exact equality (`audit-output-contract.sh:549-550`), so the join returns 0 by construction. **Refused to assert a root cause** — tested and rejected the provenance hypothesis (`detector` = 23 tagged vs 5 null).

### Mechanical note — prose ceiling blocked the first write
`orch-apply.sh` aborted the atomic 7-mutation write: 2 co-mutated rows already exceed `ORCH_ROW_PROSE_CEILING_BYTES=12000`. Re-routed their evidence to the **cold** store and touched hot with `detail_ref`/`updated_at`/`updated_by` only (all in `STRUCTURAL_FIELDS`) → zero prose growth, write landed. Under-ceiling rows kept their evidence inline.

### Carry-over
- **Do not re-mint the A-29 cluster.** Any future ~5h five-cron gap after 08:55Z is the session stand-down. Check the daily run *count* first.
- V1 row's AC-5 asks the specialist to name the null-tag emit sites — deliberately unresolved, do not let it be answered by assumption.
- NOT pushed (232+ ahead, deliberate). Board committed by me this tick.

## 2026-08-24T13:21:23Z — board corrections: tier-1 half-stale P0, orphan-signal class, ack ledger, 86-row READ backlog

Router dispatch: 5 findings + 2 mid-task escalations. **3 of 7 router readings corrected at source.**

### Corrections issued (evidence, not opinion)
1. **FINDING 1 "split or supersede the P0"** — REFUSED. Architect already split it 07:41:35Z; row carries `children[]`, `depends[]` and "DO NOT IMPLEMENT AGAINST THIS ROW". The "NEW, not in the row" wiring gap *is* child 2. Executing as written would have minted duplicates of live work. Cause of misread: the row TITLE is a mint-time diagnosis never rewritten as children land.
2. **FINDING 2 "commit the file, but its value is also wrong"** — half REFUSED. `auditor-tier1-last-healthy.json` = 08:42:12Z is **correct by contract** (sole writer `_write_heartbeat()` on ALL_GREEN; last-trigger.json shows verdict=FAILURE at 12:45:14Z). Hand-refreshing it is the class already at 4 fires. Also: 5 files stranded, not 1, and there is **no pathspec to restore** — `grep -c 'git commit|git add'` on the probe = **0**. No committer exists at all.
3. **FINDING 4 "PO cited a nonexistent row"** — REFUTED. `FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE` was real and OPEN when cited (15:27:38Z, review[] HELD); it reached done_verified at 2571bd92c ~5h later and cold-evicted. Correct-when-written, stale after — **not** the known cited-id defect, needs a different fix.
4. **"permanent cold-eviction / rows die"** — eviction is **ARCHIVAL** to `archive/2026-08.json .signal_rows[]` (493 already there). Harm is discoverability, not data loss.

### Found that nobody reported
- **ready[20] would have REVERTED child 2.** Router called it "dispatchable NOW". Its AC-1 demands the Job-2 spawn decision be "verdict-only" — exactly what child 2 deletes — and deletes the freshness wording child 2 requires byte-preserved. Authored 2026-07-21, 34d pre-debounce. Triple-gated (backlog + depends + supervised) using **structural fields only**: the row is 15216B, already over the prose ceiling, so it may not grow by one byte.
- **Size-lint fully GREEN** (`--check` exit 0, 0 offenders/1431 files). All 3 P0 rows falsified; one held the **only** in_progress slot on a 252L premise for a file now 85L.
- **fleet-push disarm is NON-DURABLE (P0).** `diff` of repo vs installed plist = exactly one line, `> "Disabled" => 1`. Repo copy still RunAtLoad=1/StartInterval=1800. Any re-install silently re-arms an unattended **224**-commit push, and both pre-push gates are now green. Trap: installed plist is **binary** — `grep -i disabled` reads as absent; I hit that false negative before re-checking with `plutil -p`.
- **A-30's "stable VmHWM" refuted.** 14:12Z signal: VmHWM **pinned at the cgroup limit**, 15min before the 14:27:11Z OOM kill.

### Rulings
- Ack ledger: signature now false; **not** retargeted (forbidden), **not** removed yet — ship child 2 first to bound churn, then remove per STALENESS RULE. That is the ledger's own protocol from `expiry_hazard_20260824T0716Z`, not a new one. Caveat 111→**224** corrected.
- to=ops: 3 rows rerouted to=po with provenance; bug5468's standing mitigation **rehoused into a task row** (signals are transport, rows are durable) — that is what made it safe to close.
- 86 READ rows: content rehoused, dispositions written, archive-out now a decision.

### Carry-over
- **Dispatch child 2 (`FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT`, ready[], P0, agent-father)** — it unblocks the ack removal, the freshness row, and stops the 30min respawn loop.
- QA: do **not** close the pushBctcLayoutHandler row before child 2 ships (ack auto-un-suppresses on DONE_VERIFIED → ~48 respawns/day).
- Could not verify `reconcile_attempts` — **no SQL tool in the 184-tool registry**. Structural limit, recorded on the owning row.
- NOT pushed. origin/main stays ab5087296.
