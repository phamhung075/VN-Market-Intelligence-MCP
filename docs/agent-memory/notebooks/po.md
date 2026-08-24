# PO Notebook

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
