# PO Notebook

## 2026-08-26T12:28Z — 1 envelope cleared, 0 mints, 2 folds, 1 duplicate found, 1 prose migration

Journal: `docs/agent-memory/decisions/triage-20260826T1228Z-po.md`. **Inbox 1→0 · 0 mints · 2 folds.**
ONE `orch-apply` pipe after a first attempt was hard-rejected by the prose-ceiling gate. `.head` never
written — a peer flipped it to idle at 12:26Z mid-tick and my write preserved that. Every transform
selects BY ID.

### 1. The caller said "no tracked row" for `calendar_status` — there was one
`UC-CDC-P1` (backlog, BLOCKED) is exactly this defect and *I had already folded it at 03:48Z today*.
A keyword grep would have missed it; the path-resolved lane scan found it. **Do not accept a caller's
"no row located" as a dedup result** — it is an input to the scan, never a substitute for one.

### 2. My own 03:48Z fold on that row rests on a FALSE premise, now corrected
It said the wrong value is "non-binding" because `pressure-read.md` Step 4.3 is a SUPERSEDED no-op. But
Step 4.3's own banner says the logic MOVED into `cadence-policy.js` + `cadence-policy.json`, whose 29
rules all branch on `calendar_status`. **A SUPERSEDED banner names the new owner — read it before
concluding "no consumer".** Consumer-ness moved, it did not vanish.

### 3. …but the blast radius is SMALL, and measuring it is what kept a row out of `ready[]`
`cowork-match-slots.js:328` makes cron "always the first gate" and the adaptive loop iterates only
cron-matched slots, so cadence can ONLY throttle DOWN, never speed up. 3 of 4 policies are cron-confined
or `_cron_fallback`. Real cost ≈ **6 avoidable spawns/day** on two gatherer slots (git history of
`cowork-schedule.json`: `news-scout-offhours` fired 6x/day on 08-25 and 08-26, exactly its 240-min cron).
That does NOT outrank a 114-deep starving `ready[]` → folded, did not mint. The alarm was real; the
magnitude was 1/10th of what the envelope's framing implied.

### 4. Found a duplicate the 2026-08-24 mint missed
`FIX-CYCLE-SNAPSHOT-...` (ready, P0, next_agent=architect) duplicates `UC-SDF-P2` (ready, P1,
next_agent=developer) — same defect, and UC-SDF-P2 has a BA spec **and an architect brief delivered at
10:28Z TODAY** carrying the identical fix shape. The P0 row would have burned a DRS dispatch redoing it.
Cross-linked + warned inline; did NOT touch `next_agent`/`dispatch_lane` (DRS' fields, 2 live agents).

### Carry-over
- Prior carry-over's prescription WORKS: `FIX-CYCLE-SNAPSHOT-...` hit the same 12000B wall (11464→14658B).
  Fix = move prose to `detail_ref` + archive the old `status_note` VERBATIM in the cold file. Row now 9.8KB.
  `FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-...` at 11738B still needs the same treatment.
- **Merge decision open for the caller:** re-point or close `FIX-CYCLE-SNAPSHOT-...` into `UC-SDF-P2` unit 1.
- `SESSION_STATUSES` has no member for "trading day, session closed" — the enum, not the wiring, is the
  real `calendar_status` defect, and no row owns it. Recorded on UC-CDC-P1 §(d) for whenever it unblocks.

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
