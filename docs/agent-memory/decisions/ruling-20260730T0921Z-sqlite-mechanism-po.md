# PO Ruling — sqlite-corruption-mechanism-20260730 · po

**Scope:** land the verified `sqlite_sequence` mechanism where hardening can use it; triage the defects it exposed.
**Agent:** po · **Written:** 2026-07-30T09:21Z · **Remediation NOT re-run** (live `quick_check`=ok, `journal_mode`=delete, `synchronous`=2).

---

### STEP po-S1 · po · 2026-07-30T09:21Z
**task-id:** SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING
**what-done:** Verified the mechanism independently, attached it plus a 4-part AC addendum, raised high→P0, `recurring_bug_count` 3→4.
**what-considered:**
- Accept the brief's mechanism as given and just paste it.
- Re-derive it against the frozen `.corrupt-*` artifact with `immutable=1`.
**why-decision:** Chose re-derivation. `quick_check` lists `Tree 3 page 3` and `sqlite_master` resolves rootpage 3 to `sqlite_sequence`; 66/99 tables are AUTOINCREMENT, far wider than the ~11 the brief named. Re-derivation also produced the load-bearing proof the brief lacked — `intraday_ohlcv_5m` (plain PK) wrote ~1350 rows/hour straight through hours 04-07 while `agent_signals`/`system_logs`/`cron_job_runs` (AUTOINCREMENT) hold zero — establishing SELECTIVE failure by primary-key kind, not a write outage.
**why-change:** AC-B/AC-C are mine, not the brief's: the shipped fix covers market.db only (`coordination.db` still WAL at `coordinationStore.ts:78`), and `journal_mode=DELETE` makes read-only observers fail intermittently with SQLITE_READONLY(8) on a hot journal — reproduced live.

### STEP po-S2 · po · 2026-07-30T09:21Z
**task-id:** FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER
**what-done:** Minted the class fix P0; hand-moved two stranded P0 rows ready[]→backlog[] as acute containment.
**what-considered:**
- Trust the brief's routing premise (row lacks `plan_only`+`supervised`).
- Read the four picker scripts and the lane each one walks.
**why-decision:** Chose reading the scripts. The brief's premise was false — both flags were already `true`. The real dead lane is one over: SLS-promote walks `backlog[]` only, SLS-claim needs a stamp only SLS-promote writes, RLC rejects both flags, so supervised+plan_only rows reaching `ready[]` match no picker. Three P0s were sitting there, and `bounded1-supervised-lane-report.sh` also scans `backlog[]` only, so it exited 0 with them unlisted.
**why-change:** Left `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` in place — 6 `children` means the epic-wrapper gate would reject it in `backlog[]` too; moving it would have looked like a fix and changed nothing.

### STEP po-S3 · po · 2026-07-30T09:21Z
**task-id:** FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS
**what-done:** Minted P1 for the fail-silent signal write, scoped to the caller's counter rather than to `post_agent_signal`.
**what-considered:**
- Mint as briefed: "`post_agent_signal` is fail-silent".
- Read the handler first, then scope.
**why-decision:** Read it first. `agentSignalTools.ts:486-497` catches and returns an `Error:` string; only the optional audit write is deliberately swallowed (:459-461). So the tool is not unconditionally fail-silent and blaming it would have sent a dev after correct code. AC-1 now requires establishing which side lost the write before any change. The 03:48→08:34 gap is real and is not a recovery artifact — rows exist on both sides, so `.recover` salvaged the table.
**why-change:** Batched (not merged) with `FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED` — same narrated-count class, different actuator.

### STEP po-S4 · po · 2026-07-30T09:21Z
**task-id:** FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION
**what-done:** Minted P1 for `bctcEvalBackfillRunner.ts:49` setting `journal_mode=WAL` on `data/market.db`.
**what-considered:**
- Fold into the hardening SPIKE.
- Separate dispatchable FIX.
**why-decision:** Separate. `journal_mode` is a persistent file property, so this path silently reverts the mitigation that shipped hours earlier and re-creates the `-shm` file it exists to eliminate. That is a scope-completeness bug, not a design question, so it belongs in the lane that dispatches — ungated, BOUNDED-1-eligible. Folding it into a plan-only P0 SPIKE would have queued a one-line fix behind an architecture review.
**why-change:** no change from plan.

### STEP po-S5 · po · 2026-07-30T09:21Z
**task-id:** SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING
**what-done:** Consolidated three 07:09Z Tier-2 CRITICALs into the SPIKE as symptoms; refused to consolidate B-06; minted nothing for any of them.
**what-considered:**
- Track three independent freshness incidents.
- Fold all four into the root cause.
- Fold three, keep B-06 separate.
**why-decision:** Third option, on table-level evidence: `sbv_rates_history`, `vps_service_health`, `vps_push_log` are all AUTOINCREMENT (B-01 and the five-VPS finding are frozen INSERTs, not dead services); `intraday_foreign_flow_5m` has zero rows at hours 04-07 and resumes at 08, so B-03 is the same fault on the read path. B-06 stays out — `vps_service_health` records `vn-bctc-fetch` last push `2026-07-28 10:35:02`, about two days before onset.
**why-change:** Declined to mint for the bctc gap. The brief called it unowned for ~27 days; `FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH` is `DONE_VERIFIED` in `archive/2026-06.json`, and the live enrich-fail mass (128 `enrich_failed`, 328 `deferred_infra`) is already owned by `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` — which I un-stranded instead. Zero 2026-Q2 rows in `financial_reports` on the Q2 deadline is recorded there as evidence, not as a fourth row.
