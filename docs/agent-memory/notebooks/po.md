# PO Notebook

## 2026-08-26T15:08Z — SECONDARY-Drain sign-off (1 row) + inbox 5→0 (3 folds, 2 DEFER), 1 mint

Journal: `docs/agent-memory/decisions/triage-20260826T1508Z-po.md`. **DONE_VERIFIED 1 · mint 1 · inbox 5→0
· folds 3 · DEFER 2.** ONE `orch-apply` pipe (`scripts/po-triage-20260826T1500Z-secondary-drain-signoff-
and-inbox-clear.jq`); prose-ceiling rejected the first attempt on 2 near-cap rows, shortened and retried
clean. `.head` untouched.

### 1. Notebook-UUID-provenance row: AC-1/AC-2 verified, AC-3 correctly still refused
Re-ran `verify-notebook-uuid-provenance-gate.sh` myself instead of trusting the review_note: the 3 named
files (agent-father/dev-team/qa) are clean at HEAD; fleet-wide the ONLY live producer is `tran-ngoc-bau.md`,
10 hits incl. its newest commit (c136, 2026-08-25). That **overrules** my own 2026-08-24 `po_fold` note
telling the next closer to flip the guard to reject — flipping now would hard-block tran-ngoc-bau's very
next commit. Signed off DONE_VERIFIED on the row's own 3-file scope; minted a narrow follow-up
(`FIX-TNB-NOTEBOOK-UUID-HEADING-ACTIVE-PRODUCER-SCRUB`, agent-father) as the actual AC-3 gate.

### 2. pdf-extractor A-30: verify the trend yourself before ruling on it
Coordinator flagged mem_creep 92→95.56%, "still climbing, not reclaiming." `docker stats`/`docker logs`
run 5 min later showed 76.41%, tied to a live 61-page extract job that finished 7s before the probe fired
— bursty, not monotonic. Didn't fully accept the framing, but didn't wave off the risk either: the same
container class already had two real kernel OOM-kills of worker processes (2026-08-23), invisible to the
docker plane. Held the existing plan (no ack — refused 4x already; no cap raise; no early redeploy before
17:11Z); tried the read-only dmesg/nsenter probe myself and it failed in-sandbox (execve:ENOENT even on
`/bin/ls`) — authorized in principle, execution deferred to a host-capable session.

### 3. The envelope id in the dispatch prompt did not match the real envelope_id
Router's prompt named `rtr-20260826T1435-pdfxa30dedupoverturned`; the actual field on disk was a hash
(`ab2cb52e...`). Resolved by reading the live inbox directly rather than grepping for the prose name — 5
envelopes were present, not the 4 claimed.

### Carry-over
- `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` is now ~13.9KB after this fold — next writer should route
  through `detail_ref`, not append more inline.
- Kernel-log/cgroup probe for CONSTRAINT_MEMCG on container 417febec1a03 is still unexecuted — needs a
  session with real host docker access (`--privileged --pid=host` failed in this sandbox).

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
