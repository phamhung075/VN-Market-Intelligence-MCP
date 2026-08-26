# PO Notebook

## 2026-08-26T17:34Z — PDFX 17:11Z freeze released (4 rows), AC-7 ruled, chain head named

**Did:** one `orch-apply.sh` write, 5 rows stamped. All 4 rows at `next_recheck_not_before=2026-08-26T17:11:00Z`
flipped BLOCKED→BACKLOG, gate key deleted. Actuator: `scripts/po-release-20260826T1734Z-pdfx-ac7-gate.jq`.

**Ruling per row** (status=BLOCKED reinstated NOWHERE; every residual gate is a real dep edge):
- `FIX-BCTC-CTG-BALANCE-SHEET-REFINE` → **fully released, dispatchable now.** Both stale gates dead: gateway
  probed live 17:32Z (real payload, `blocked_on` field deleted); archived dep resolves DONE_VERIFIED via
  `dep_status_map($archive)`. `deps_satisfied=true`, dev-role next_agent, not supervised/plan_only/epic.
- `MEASURE-PDFX-…-BASELINE` → released, **new dep on `UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT`.**
  AC-3 needs image id + git_sha (label reads `unknown`) and po_correction_20260826T0604Z needs the rescue
  budget constant, which ships in 1db5f9f81 — not in the running image. Rebuild first, then measure.
- `DECIDE-PDFX-OCRWORKER-…` → released; its existing dep on MEASURE is the real gate. DEFERRED-NOT-DECLINED
  stands. Added the measured headroom as a hard AC-5 input.
- `FIX-PDFOCR-ORIENTATION-CORPUS-…` → released from the clock only. Added
  `FIX-SQLITE-DOCKER-VIRT-CORRUPTION-ROOT-CAUSE-INVESTIGATION` (READY, open) to `.depends`. The sweep is the
  probable proximate trigger of the 08-26 corruption; the restore closed, the root cause did not.

**AC-7 RESULT (window closed, series intact — 148 samples, one container, RestartCount=0):** peak
2,681,626,624 B at 14:04:15Z = **2.6 MiB under the 2,684,354,560 B cap (99.90%)**. oom=0/oom_kill=0 on all 148.
The +894 `memory.events.max` increments are NOT diffuse — flat 1645 until 13:59Z, all increments inside
14:04–14:49Z, flat 2539 after. anon fell to 1.384 GiB at 14:54Z, BELOW the 1.577 GiB pre-burst rest → pages
fully returned, no leak (my first hypothesis, falsified before it reached a row). Cause found in `docker logs`:
`/extract` burst 14:02–14:15Z with **8× 429 Too Many Requests** + 61-page `pek-extract` at 14:46:18Z. So the
window was NOT passive. **0 OOM kills ≠ headroom**: an ordinary workload took 99.90% of cap.

**Caller premises corrected:** (1) `FIX-PDFOCR-ORIENTATION` was reported `depends_on null` — it carries a live
`.depends` edge, which `effective_depends_on()` honours. (2) The "ocr_worker.py emits zero log lines" signal was
handed to me as a blocking prerequisite; it was RETRACTED BY ITS OWN PRODUCER on 08-26 and my own
`po_regate_20260826T0650Z` already says so. MEMORY.md still carries the stale version.

**Not done / not mine:** did not kill the sampler (PID 86980, `while true`, no stop condition, re-resolves the
container id each loop → will silently follow a rebuild into the same CSV). Freeze boundary recorded as
`ts <= 2026-08-26T17:25:12Z`; killing it belongs to the ops row that owns the measurement.

### Carry-over
- **Chain head is NOT one of the four rows.** `UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT` is `ready[]`,
  READY, deps clean, re-routed `next_agent` po→ops (AC-1 is a rebuild; PO charter excludes infra). Dispatch it
  tonight — 17:3xZ→02:00Z is the clear runway; MEASURE and DECIDE unblock only behind it.
- `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` (backlog, P1, dev-pdf-extractor, deps clean) now has a real
  measured burst to explain: 1.76 GiB rest → 99.90% of cap under one ordinary concurrent workload.
- Permanent, invisible to every picker: pdf-extractor rows must not run 02:00–08:59Z weekdays. No dispatch gate
  reads prose. Tracked at `FIX-PDFX-MARKET-HOURS-GUARD-ONLY-ON-PEK-EXTRACT-FOUR-OCR-ROUTES-UNGUARDED`.

## 2026-08-26T18:08Z — inbox 10→0, 7 folds, 1 mint, 2 cancels, 2 rulings, WIP slot freed

Self-read inbox matched the caller copy exactly (same 10 ids). Pipeline-B dashboard: 0 NEW `to=po`.

**Folds (7).** CCATO SHB+VIX → `FIX-CCATO-NULLMARKER-SET-INCOMPLETE-…`, raised P2→P1. Not a fabrication and
not probe-substitution: `compare_financials` returned `current:null`, so both absence-claims were TRUE.
Mechanism read from source, not inferred — `verdictClassifier.ts` `flattenText()` JSON.stringify()s the object,
`classifyVerdict()` then only substring-matches 10 prose literals, and `JSON.stringify(null)==="null"" is not one
of them. Third tool. This makes that row's AC-(2) (structured null discriminator) mandatory rather than optional:
the marker list *cannot* be extended here — adding "null" would match any response containing the substring.
Others: HPG `operating_profit=0` (41+ cycles, now disabling ESC-4) · DXG (45+ cycles, an AVOID verdict now rests
on a substituted EY input) · ESC-1 tool-grant (4/4 of this tick's cycles — the gate is inert, not degraded) ·
cycle-snapshot (2nd+3rd consecutive, 16:00Z was predicted then observed) · janitor dead-writer premise.

**Mint (1).** `FIX-COWORK-MUTEX-DROPPED-SLOTS-DISCARDED-BY-FINISH-META-DIVERGES-FROM-SLOTS` (P2, backlog).
The originating envelope's own hypothesis was WRONG and I refuted it before minting: the dropped
`market-watcher-offhours` slot was removed BY DESIGN — `cowork-schedule.json` declares `market-watcher-eod`
with `supersedes:["market-watcher-offhours"]`, owning brief 2026-08-14. No fire was lost. The real defect is
that `finish()` keeps only the `*_mutex_applied` booleans and discards both mutexes' exact `dropped[]` lists,
while `due_reasons`/`cadence_minutes` are built PRE-mutex and `slots[]` is POST-mutex. Cost is measured: one
full cowork tick spent reaching a false mechanism because the right answer was computed and thrown away.

**Cancels (2), not in the inbox — surfaced by verifying the janitor envelope's premise.** The premise was TRUE
(writer active: 15 files, newest written 14:58Z today, commits 08-08→08-26). That exposed
`CLEAN-RETIRE-TEAM-TOOL-RECHECK-HEALTH-DOC-FAMILY-…` sitting BACKLOG/owner=developer/next_agent=developer —
fully dispatchable — instructing permanent deletion of a doc family written to daily, on a premise its own
sibling had been RETRACTED for 5 hours earlier the same day. Both cancelled to `archive[]`, `do_not_reopen`.

**Rulings (2).** (a) dev-team's HIGH → folded onto `FIX-DISPATCH-GATES-BLIND-TO-PROSE-DISPOSITION` with the
scope WIDENED: the 08-23 incident's carrier was `status_note`; this one's is a bespoke key with `status_note`
NULL, so a fix built literally against `status_note` would pass its own AC and still miss it. Exposure is 4
rows, not 1. New second-order finding: `po-board-dedup-search.sh` shares the blindness — it prints NO MATCH
for `po_consolidation_ruling_20260728` while jq finds 4 non-terminal rows carrying it. (b) The stranded
`in_progress[]` row: block is VALID (`TASK-COWORK-MUTEX-001` is live at review[10]) so NOT cleared, but the
LANE was wrong → moved to backlog[] BLOCKED, freeing the board's only WIP slot, and `depends_on` ADDED because
the gates read `depends_on` while `blocked_by` is read by NO predicate in the repo.

**Verified, not inherited:** subsumed-by epic exists (backlog[208], BACKLOG) — my first jq said otherwise and
had a precedence bug; I re-ran before trusting it. AC-7 sampler PID 86980 still alive at 12h54m, 54 min past
its window, last CSV row 18:05:24Z.

### Carry-over
- **BATCH returned: PDFX UNBLOCK (ops) + UC-SDF-P2 (developer).** I RATIFY the 17:34Z po→ops re-route — AC-1 is
  a rebuild and infra is outside dev-pdf-extractor charter. Ops MUST kill PID 86980 and snapshot the 157-row
  CSV BEFORE AC-1: the loop re-resolves the container id, so it will follow the rebuild into the new container
  and contaminate the pre/post comparison AC-4/AC-6 depend on.
- **UC-SDF-P2 and `FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-…` are one root cause in two ready[] rows.**
  Reconcile or subsume before implementing. Archive checked by SUBJECT: no re-ship.
- **Row prose ceiling is now a triage blocker, not a nuisance.** 4 rows refused new evidence this tick (HPG 16B
  headroom, UC-SDF-P2 63B, the mutex row 20197B). I moved 4 fields verbatim to the decision journal rather than
  edit anyone's evidence, but rows that cannot receive corroboration silently stop accumulating it.
- Supervised-goahead: 6 candidates lack a `po_goahead_*` stamp (2 live: `FIX-RAG-COMPACTION-DISK-AMPLIFICATION`
  review/next_agent=po, `FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58` done/next_agent=po). NOT stamped — each needs
  a substantive read and blind-stamping would be a fabricated go-ahead. Next tick.

## 2026-08-26T18:25Z — SECONDARY-Drain sign-off (1 row): BCTC-dormancy SPIKE closed + own ruling retracted

Journal: `docs/agent-memory/decisions/signoff-20260826T1825Z-po.md`. **DONE_VERIFIED 1 · mint 0 · correction 1.**
ONE `orch-apply` pipe (2nd attempt — the 1st was ABORTED by the prose-ceiling guard, live file untouched).
`.head` was already `idle`, never written.

### 1. The recommendation was right; its stated reason was already stale
`dev-mcp-server` recommended DONE_VERIFIED on 08-25 and correctly refused to self-certify (row reserves
close for PO, `supervised:true`). Verdict upheld — but one supporting claim was **falsified 24h later**:
"every post-fix `enrich_failed` termination lands at `reconcile_attempts` EXACTLY 8, the >8 outliers all
have `last_attempt<=2026-08-22`, never reprocessed — benign". HUT 2025-Q2 is at **11 passes, last_attempt
`2026-08-26 03:05:02`**, with a fresh BUG at 03:05:05 saying "after 11 reconciliation passes (cap 8)".
The measurement was true when taken; the *"benign / never reprocessed"* **inference** is what rotted.
Lesson: a review note's freshness is part of its truth value — re-measure any time-indexed "never happens
again" claim, don't inherit it. Evidence handed to `FIX-BCTC-VPSINGEST-REQUEUE-NO-RECONCILE-COUNTER-RESET`
(live, P1) — not a close-blocker, cap enforcement is not an AC of this SPIKE.

### 2. A null from a key that no longer exists is blindness, not evidence
The row's `close_caveat` demanded proof the mass-terminalised backlog **re-extracts**, not just that
`MAX(extracted_at)` advanced. Probing the two `report_id`s the caveat names returned `count=0` in
`bctc_layout_units` — which *reads* like "never recovered". It is vacuous: **both ids are gone from
`financial_reports` entirely**, so the query could not distinguish "not extracted" from "not asked".
Re-probed by `action_code`+period: 18 of 28 rows in the caveat's own 2024 cluster are now `done`, SHB
recovered all four quarters, `done=220` vs `enrich_failed=39`. Caveat satisfied, no false-green.
Same shape as `feedback_probe_aggregated_coarser_than_the_phenomenon` — ask what ELSE yields this output.

### 3. I contradicted myself inside 36 minutes, and the rationale never landed anyway
At 17:26Z PO wrote the correct fact (`devteam-eligibility.jq:232` unions `.depends_on + .depends +
.blocked_by`). At 18:02Z PO ruled the opposite — "no eligibility predicate anywhere reads `blocked_by`" —
by borrowing `FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE`'s conclusion about **`blocks`** (the
reverse edge, genuinely decorative) and pinning it on **`blocked_by`** (live to all four pickers). Acting
on it would invite *stripping* `blocked_by`, silently releasing real dependencies. Retracted in
`triage-20260826T1737Z-po.md#5b`. Two things fell out: the cited key `po_ruling_20260826T1802Z` **was
never written to orch-state** (`grep -c` → 0) — actions landed, rationale did not; and the inline fix was
refused by `orch-row-prose-ceiling-check` (11865B→13787B vs 12000B), so the text went to the cold store
whole and only `detail_ref` was re-pointed. The guard was right both times.
