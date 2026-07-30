# scripts/po-triage-20260730T0918-sqlite-mechanism.jq
#
# PO triage 2026-07-30T09:18Z — sqlite-corruption-mechanism-20260730.
# Lands the VERIFIED sqlite_sequence mechanism on the hardening SPIKE, mints the
# three defects it exposed, and un-strands two P0 rows that no automated picker
# can see.
#
# Idempotent: every mint is guarded by an id-presence check; every field write is
# an assignment, not an append.
#
# Usage (NEVER raw mv/cp/>):
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/po-triage-20260730T0918-sqlite-mechanism.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def has_id($lane; $id): ((.task_board[$lane] // []) | map(.id) | index($id)) != null;

# ── Evidence strings (verified live 2026-07-30T09:09-09:15Z) ─────────────────
"VERIFIED MECHANISM (po triage 2026-07-30, read-only against the frozen artifact data/live/market.db.corrupt-2026-07-30T08:21:24Z opened with immutable=1, plus mode=ro reads of the recovered live DB).
ROOT BTREE: `PRAGMA quick_check` on the corrupt artifact lists `Tree 3 page 3: btreeInitPage() returns error code 11`, and `SELECT rootpage,name FROM sqlite_master` resolves rootpage 3 to `sqlite_sequence`. SQLite must read AND update sqlite_sequence on every INSERT into an AUTOINCREMENT table, so a corrupt tree 3 fails every such INSERT while leaving plain-INTEGER-PRIMARY-KEY tables writable.
SCOPE: 66 of 99 tables in market.db carry AUTOINCREMENT — materially wider than the ~11 tables named in the originating report. Includes the system's own observability tables (`system_logs`, `cron_job_runs`, `agent_signals`, `vps_service_health`, `vps_push_log`, `sbv_rates_history`, `telegram_reports`) and the whole `bctc_*` ingestion family.
SELECTIVE-FAILURE PROOF (this is the load-bearing observation): across the fault window `intraday_ohlcv_5m` (plain PK, tree not corrupt) kept writing continuously — hours 04/05/06/07 UTC each hold ~1350 rows, no interruption — while over the SAME hours `agent_signals`, `system_logs` and `cron_job_runs` (all AUTOINCREMENT) hold ZERO rows and resume only at 08:34Z, the corrective-swap minute. The fault was therefore SELECTIVE by primary-key kind, not a global write outage, and it silently erased the system's own audit trail for ~4h while every container stayed up and Tier-1 read ALL_GREEN.
ALSO DIRECTLY CORRUPT (own btree, independent of tree 3): tree 57 `cron_job_runs`, tree 59 `daily_ohlcv`, tree 96 `pdf_extracted_text`, tree 132 `system_logs`, plus 10 of their indexes. `daily_ohlcv` is a PLAIN table — it froze because its own tree was damaged, NOT via sqlite_sequence. Do not conflate the two paths.
NON-DESTRUCTIVE DISCRIMINATION TECHNIQUE worth keeping: to separate REAL corruption from a read-only-vs-WAL visibility artifact with no `docker exec` and no `integrity_check`, run quick_check against a copy whose `-wal` is 0 bytes. `market.db.backup` reported identical trees and pages; a WAL-visibility artifact cannot reproduce identically in a file with no WAL to be blind to." as $mech
|
"AC ADDENDUM (po 2026-07-30) — four requirements the current question does not cover:
AC-A sqlite_sequence-SPECIFIC TEST. The mitigation MUST be exercised against corruption of tree 3 (`sqlite_sequence`) specifically, not only generic page corruption. A mitigation that survives page damage elsewhere but not in tree 3 leaves the exact silent-insert-failure class open: 66/99 tables stop accepting INSERTs while the DB still answers SELECTs and every healthcheck stays green.
AC-B MITIGATION SCOPE IS ONE DB OF FOUR. The shipped fix (`apps/mcp-server/src/infrastructure/db/schema.ts:115`, journal_mode=DELETE + synchronous=FULL) covers market.db ONLY. Verified still WAL in the SAME bind mount, SAME container, SAME macOS virt layer: `coordination.db` (live `-wal` observed growing 506KB->556KB with `-shm` mtime tracking now, set at `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:78` WAL + synchronous=NORMAL), `alert_engine.db` (61KB -wal), `macro_indicators.db`. coordination.db is the task_claim/task_release + scheduled_tasks store: corruption there takes out the cross-session mutex, whose failure mode is silent double-dispatch across the whole fleet — arguably a wider blast radius than market.db. It also already carries its own documented WAL recurrence class (TASK_1989 / FIX-COORD-WAL-CHECKPOINT-POST-MIGRATION) and mitigates it with a startup `wal_checkpoint(TRUNCATE)`. Decide DELETE-vs-WAL per DB on evidence; do NOT blanket-convert a high-frequency lock store without measuring lock contention.
AC-C THE MITIGATION INTRODUCED A READER REGRESSION — measure it. Under journal_mode=DELETE a reader that opens the DB while a write transaction is in flight must roll back the hot rollback-journal to get a consistent read, which requires WRITE access; a read-only opener therefore fails with SQLITE_READONLY(8) 'attempt to write a readonly database'. Reproduced live during this triage: one `mode=ro` SELECT returned error 8, and an immediate 10x retry of the same query returned clean — i.e. INTERMITTENT, load-correlated. Under WAL readers never needed write access. Every read-only observer is now flappy: host-CLI integrity probes, auditor freshness harnesses, `scripts/check-foreign-flow-freshness.sh`. Quantify the new SQLITE_BUSY/READONLY rate before declaring the mitigation proportionate — synchronous=FULL lengthens every commit's lock window on a 400MB DB.
AC-D RESIDUAL FROM THE RECOVERY ITSELF. Post-`.recover` the live DB has 22 rows in `sqlite_sequence` against 66 AUTOINCREMENT tables, so 44 tables lost their monotonic high-water mark and will resume at max(rowid)+1. Any table whose rows were deleted can now REUSE a previously-issued rowid. Assess whether any external consumer persisted those ids as references." as $ac
|
"CONSOLIDATION RULING (po 2026-07-30) — folded into this row as SYMPTOMS of the tree-3 mechanism, NOT tracked as independent freshness incidents, and NOT re-minted:
(1) Tier-2 B-01 sbv_fx 'stale 3.4h' — `sbv_rates_history` is AUTOINCREMENT; frozen INSERTs.
(2) Tier-2 'all five VPS services last poll 3h ago' — `vps_service_health` and `vps_push_log` are both AUTOINCREMENT; the probe writes froze, not the VPS services. `vps_service_health` verified writing again every 5 min (latest rows 09:05Z, 09:10Z).
(3) Tier-2 B-03 foreign-flow 'stale 189m' + `scripts/check-foreign-flow-freshness.sh` verdict=ERROR with the tool reporting 'database disk image is malformed' while `vn-foreign-flow` itself read healthy — `intraday_foreign_flow_5m` holds rows at hours 02 and 03 UTC, ZERO at 04-07, resuming 08. Same root cause on the READ path rather than the AUTOINCREMENT path. 189m before 07:09Z lands at ~04:00Z, matching onset.
NOT CONSOLIDATED — genuinely separate, pre-dates the fault: Tier-2 B-06 / `vn-bctc-fetch`. Live `vps_service_health` shows it unhealthy with last push `2026-07-28 10:35:02` (~167,700s stale vs an 86,400s threshold) — roughly two days before this fault began. Keep it on its own track." as $consol
|

# ── A. Land mechanism + ACs on the existing hardening SPIKE, raise to P0 ──────
.task_board.backlog = [ .task_board.backlog[]
  | if .id == "SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING" then
      .priority = "P0"
      | .recurring_bug_count = 4
      | .po_mechanism_triage_20260730 = ($mech + "\n\n" + $ac + "\n\n" + $consol
          + "\n\nOCCURRENCE 4 (2026-07-30T~03:30-08:34Z). Onset between the last pre-fault AUTOINCREMENT write (03:48Z) and 04:00Z; router detected 04:07Z; peer dev-team->ops chain detected 08:19Z and remediated by 08:35Z. ~4.5h of silent selective write loss. REMEDIATED — do not re-run recovery: live `PRAGMA quick_check` = `ok`, `journal_mode` = `delete`, `synchronous` = 2 (FULL), no `-wal`/`-shm` on market.db, `SELECT count(*) FROM sqlite_sequence` answers. Recovery chain: 157335892 (mitigation), c5101f376 (RAW-verify caught the first attempt as a secondary data-loss event), 48a89fdd8 (corrected `.recover` salvage). Lossy first-attempt artifact preserved at data/live/market.db.impoverished-backup-2026-07-30T08:33:51Z. Deliberately quoting NO data-loss figure: counts taken during the fault came off a corrupt btree and the backfill was still running at triage time.")
      | .po_priority_raise_20260730 = "high -> P0. Justification: 4th occurrence of this class in ~3 months and the first with a MEASURED silent-write-loss window; and two live UNMITIGATED exposures verified today (AC-B coordination.db still WAL; the separate FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION row can silently revert market.db itself to WAL). NOTE ON THE ORIGINATING BRIEF: its claim that this row 'appears to lack plan_only+supervised' is FALSE — both were already `true` and `scripts/audits/bounded1-supervised-lane-report.sh` resolves its dispatch_lane to `architect`, so it sits in the working SLS lane, NOT the residual dead lane. The real constraint is throughput: that PRIMARY class is 35 rows deep and SLS dispatches ONE per head-idle tick, and at priority `high` (priority_rank 1, tied with P1) this row ranked 6th behind two P0s and a 51-day-old peer. P0 moves it to rank 0. supervised/plan_only DELIBERATELY LEFT `true` — clearing them would hand a plan-only architecture question to BOUNDED-1 as an autonomous code fix, which is the FIX-MCP-MEMORY-CODE-LEAK near-miss shape."
    else . end ]
|

# ── E/F. Un-strand ready[] rows invisible to all four pickers ────────────────
# Verified against the scripts, not their prose: BOUNDED-1 and SLS-promote both
# scan .task_board.backlog[] ONLY (promote :105, header :29); SLS-claim (:48-49)
# only takes ready[] rows whose promoted_by == "dev-team (supervised-lane sweep)";
# RLC (:124-125) rejects effective_supervised/effective_plan_only == true.
# A supervised+plan_only row sitting in ready[] with promoted_by=null therefore
# matches NO picker, and SLS-promote — the only writer of that stamp — can never
# reach it. Returning it to backlog[] is a provenance CORRECTION (promoted_by is
# null: it was never legitimately promoted), not a demotion. status is set to
# BACKLOG: SLS-promote's gate is `status IN {BACKLOG,TODO}`, but orchStateSchema's
# Stage-1b lane-coherence check allows only BACKLOG|BLOCKED in the backlog lane
# (TODO was rejected on first apply), so BACKLOG is the only value satisfying both.
( [ "SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD",
    "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS" ] ) as $unstrand
| ( [ .task_board.ready[] | select( (.id | IN($unstrand[])) ) ] ) as $moved
| .task_board.ready = [ .task_board.ready[] | select( (.id | IN($unstrand[])) | not ) ]
| .task_board.backlog = ( .task_board.backlog + [ $moved[]
    | .status = "BACKLOG"
    | .po_unstrand2_20260730 = ("LANE CORRECTION by po 2026-07-30T09:18Z — moved ready[] -> backlog[]. WHY THE 2026-07-30 ONE-FIELD 'UNSTRAND' DID NOT LAND: the prior PO cycle read the SLS predicate (promote :108-109, the supervised AND plan_only pair) but not the LANE that predicate is applied to. SLS-promote iterates `.task_board.backlog[]` (:105; its own header :29 states 'candidate lane: .task_board.backlog[]'). This row is in `ready[]`, so setting plan_only=true could not make it visible to SLS. Full picker audit at that moment: BOUNDED-1 backlog-only -> blind; SLS-promote backlog-only -> blind; SLS-claim requires promoted_by == 'dev-team (supervised-lane sweep)' and this row's promoted_by is null -> blind; RLC rejects supervised/plan_only -> blind. Four pickers, zero coverage, priority P0. Known-failure-shape matched without reading which collection the predicate walks. Now in backlog[] with status TODO, no children, no depends_on, no backlog-detail entry, so SLS-promote can legitimately resolve its lane and stamp it. Flags left `true` — the point is to reach the supervised lane, not to bypass it. Class fix: FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER.") ] )
|

# ── G. Epic wrapper: record why it is NOT moved ───────────────────────────────
.task_board.ready = [ .task_board.ready[]
  | if .id == "FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION" then
      .po_strand_note_20260730 = "STRANDED, DELIBERATELY NOT MOVED (po 2026-07-30). Same ready[]+supervised+plan_only+promoted_by=null shape as the two rows moved to backlog this tick and equally invisible to all four pickers, BUT this row carries 6 `children`, so SLS-promote's EPIC-WRAPPER gate would reject it in backlog[] too — moving it would have looked like a fix and changed nothing. Decomposition containers are never auto-promoted by design; its CHILDREN are the dispatchable unit. Left for FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER to handle as part of the class, which must state where epic children in a gated lane get swept."
    else . end ]
|

# ── B. Mint: WAL re-arm defeats the just-shipped DELETE mitigation ────────────
( if has_id("backlog"; "FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION") then .
  else .task_board.backlog += [{
    id: "FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION",
    status: "BACKLOG", type: "FIX", priority: "P1", size: "S",
    zone: "apps/mcp-server/", next_agent: "dev-mcp-server", owner: "dev",
    title: "market.db mitigation is reversible by a peer code path: bctcEvalBackfillRunner sets PRAGMA journal_mode=WAL on data/market.db, silently re-arming the corruption vector the 2026-07-30 permanent fix removed",
    desc: "`apps/mcp-server/src/interface/mcp/routes/bctcEvalBackfillRunner.ts` opens `resolve(projectRoot,'data/market.db')` (:44, `new Database(dbPath)` :48) and then executes `db.exec(\"PRAGMA journal_mode=WAL\")` (:49). journal_mode is a PERSISTENT property of the database FILE, not of a connection: converting to WAL from any connection re-creates the `-wal`/`-shm` pair and the setting survives that connection and the process. The permanent mitigation shipped hours earlier (157335892, `apps/mcp-server/src/infrastructure/db/schema.ts:115` journal_mode=DELETE + synchronous=FULL) was adopted specifically to remove the macOS-Docker-virt SHM torn-write vector that has now corrupted this DB four times. So a single backfill invocation silently undoes the fix for the duration of that run, and re-introduces the `-shm` file the fix exists to eliminate, with no alert and no log line saying the mode changed. `schema.ts` re-asserting DELETE on the next `getDb()` does not help: the window is the backfill's own runtime, which is long by construction.\n\nAC-1 no code path may set journal_mode on market.db except the single owner in `schema.ts`; `bctcEvalBackfillRunner.ts:49` uses the shared accessor or drops the PRAGMA.\nAC-2 sweep every other market.db opener for the same shape and fix or justify each. Grep evidence at triage time — `journal_mode` is set outside `schema.ts` in `bctcEvalBackfillRunner.ts:49`, `coordinationStore.ts:78` (different DB, see AC-B on the hardening SPIKE) and 8 `scripts/` call sites (`smoke-task-lock*.ts`, `migrations/*.ts`) that also open project DBs.\nAC-3 a regression guard that FAILS if journal_mode on market.db is anything but `delete` at runtime — assert through the running container, not by reading source (the source-vs-container distinction is what separated 'fixed' from 'fixed and shipped' earlier today).\nAC-4 same guard must catch a `-wal`/`-shm` pair appearing next to market.db.\n\nNOT plan_only and NOT supervised on purpose: this is a scope-completeness bug in a fix that already landed, not a design question, so it belongs in the lane that actually dispatches (BOUNDED-1). The DELETE-vs-WAL policy question per DB stays on SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING AC-B.",
    created_at: $now, created_by: "po-triage-20260730T0918Z (sqlite-corruption-mechanism-20260730)",
    related: ["SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING"]
  }] end )
|

# ── C. Mint: audit output contract counts calls, not confirmed rows ───────────
( if has_id("backlog"; "FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS") then .
  else .task_board.backlog += [{
    id: "FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS",
    status: "BACKLOG", type: "FIX", priority: "P1", size: "S",
    zone: "cross-service/", next_agent: "developer", owner: "dev",
    title: "Auditor OUTPUT-CONTRACT reported signals_posted=3 while zero rows reached agent_signals — the counter must count rows read back, not post_agent_signal calls issued",
    desc: "EVIDENCE (verified live 2026-07-30, mode=ro read of the recovered market.db). The 07:09Z Tier-2 auditor returned `[OUTPUT-CONTRACT] signals_posted=3`. `agent_signals` has a HARD GAP with zero rows between `2026-07-30T03:48` and `2026-07-30T08:34` — nothing at or near 07:09Z. Rows on BOTH sides of the gap are present, so `.recover` salvaged this table successfully and the absence is not a recovery artifact: those three writes never landed and the audit reported success anyway.\n\nSCOPE — READ THIS BEFORE BLAMING THE TOOL. `post_agent_signal` is NOT unconditionally fail-silent: `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` wraps the handler in try/catch and returns a literal `Error: <message>` string on throw (:486-497), and only the OPTIONAL signal-quality-audit write is deliberately swallowed (:459-461, commented 'Fire-and-forget: any error is swallowed'). An INSERT into `agent_signals` (AUTOINCREMENT) during the fault had to touch the corrupt `sqlite_sequence` btree and should therefore have surfaced as an error string. So the likely defect is on the CALLER side: the auditor increments its counter per call issued rather than per success observed, and an MCP tool that reports failure in its text payload rather than as a transport error is easy to count as a success. FIRST TASK is to establish which of the two it is — instrument or replay before changing code.\n\nAC-1 determine empirically whether the tool returned an error string that the caller ignored, or the INSERT truly succeeded-and-vanished. State which, with evidence.\nAC-2 `signals_posted` must be derived from a read-back (count of ids confirmed present in `agent_signals`), never from a call tally.\nAC-3 a mismatch between attempted and confirmed must fail loudly in the audit output, not be silently rounded up.\nAC-4 caller must treat an `Error:`-prefixed text payload as a failure.\n\nSIBLING — BATCH, DO NOT MERGE: `FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED` (review, P1, next=qa) is the same narrated-count class on the dashboard-append surface. Same discipline, different actuator; QA should review them together.\nWHY THIS MATTERS BEYOND THIS INCIDENT: during any DB write fault an agent's own success counters are not evidence a row exists, and here the signal table is the very channel the fault should have escalated through — the failure silenced its own alarm.",
    created_at: $now, created_by: "po-triage-20260730T0918Z (sqlite-corruption-mechanism-20260730)",
    related: ["SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING","FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED"]
  }] end )
|

# ── D. Mint: the ready[]/review[] residual picker lane (class fix) ────────────
( if has_id("backlog"; "FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER") then .
  else .task_board.backlog += [{
    id: "FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER",
    status: "BACKLOG", type: "FIX", priority: "P0", size: "M",
    zone: "cross-service/", next_agent: "developer", owner: "dev",
    title: "supervised+plan_only rows that reach ready[] or review[] are invisible to all four dev-team pickers — SLS-claim needs a stamp only SLS-promote writes, and SLS-promote only ever reads backlog[]",
    desc: "STRUCTURAL DEAD LANE, verified against the scripts themselves on 2026-07-30 (not against their prose). For a row with `effective_supervised == true` AND `effective_plan_only == true` sitting in `ready[]`:\n  - BOUNDED-1 (`scripts/devteam-backlog-promote-bounded1.jq`) iterates `.task_board.backlog[]` -> never sees it, and rejects supervised anyway.\n  - SLS-PROMOTE (`scripts/devteam-backlog-promote-supervised-lane-sweep.jq`) iterates `.task_board.backlog[]` (:105; header :29 'candidate lane: .task_board.backlog[]') -> never sees it.\n  - SLS-CLAIM (`scripts/devteam-backlog-claim-supervised-lane-sweep.jq`:48-49) takes ready[] rows only where `promoted_by == \"dev-team (supervised-lane sweep)\"` -> a row that reached ready[] by any OTHER route (PO hand-placement, PM decomposition, an earlier manual promote) has `promoted_by: null` and is rejected.\n  - RLC (`scripts/devteam-backlog-claim-ready-lane-consumer.jq`:124-125) requires `effective_supervised != true` AND `effective_plan_only != true` -> rejected.\nThe stamp SLS-claim requires can ONLY be written by SLS-promote, and SLS-promote structurally cannot reach ready[]. The lane is unreachable by construction, not by misconfiguration.\n\nLIVE BLAST RADIUS AT MINT TIME: 3 rows in `ready[]`, ALL THREE P0 — `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` (next=ops), `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (next=developer, 6 children), `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` (next=pm) — plus 5 more in `review[]`. Two were hand-moved to backlog[] as an acute containment this tick; the third is an epic wrapper the wrapper gate would reject in backlog[] too.\n\nWHY IT STAYED INVISIBLE: this is NOT the documented supervised-XOR-plan_only residual gap. `scripts/audits/bounded1-supervised-lane-report.sh` is the instrument meant to surface this class and it also scans `backlog[]` only, so it exits 0 with these P0 rows unlisted — the detector shares the blind spot of the thing it audits. It is the same shape as FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (2026-07-21), one lane over.\n\nAC-1 every (lane x supervised x plan_only x epic-wrapper) combination resolves to exactly one named picker or an explicit, documented no-picker verdict — no combination may be silently uncovered. Produce the matrix.\nAC-2 close the ready[] hole at the root: either SLS-promote also considers ready[] rows lacking the stamp, or SLS-claim accepts an unstamped supervised+plan_only ready[] row and resolves the lane itself. Do NOT fix it by forging `promoted_by` — that falsifies provenance.\nAC-3 decide and document review[] (5 rows live). If deliberately unswept, say so in `dev-team/flow/main.md` so it stops reading as an oversight.\nAC-4 state where epic children in a gated lane get swept, or the wrapper gate keeps eating whole subtrees.\nAC-5 extend `bounded1-supervised-lane-report.sh` to scan EVERY lane and exit non-zero on any row matching no picker. Regression-test with a live-derived fixture. Without AC-5 the next occurrence is invisible again.\nAC-6 verify satisfiability, not just lane resolution — `scripts/audits/devteam-dispatch-gate-satisfiability.sh` exists precisely because the sibling sweep once shipped green while its own firing gate was dead.\n\nNOT plan_only and NOT supervised on purpose: making the fix for a dead gated lane itself gated would queue it behind the 35-deep backlog it is meant to unblock.",
    created_at: $now, created_by: "po-triage-20260730T0918Z (sqlite-corruption-mechanism-20260730)",
    related: ["FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER","SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD","FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS","FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION"]
  }] end )
|

# ── H. Triage stamp (never .head — dev-team owns it, WIP=1 in flight) ────────
.task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-triage-20260730T0918Z (sqlite-corruption-mechanism-20260730)"
