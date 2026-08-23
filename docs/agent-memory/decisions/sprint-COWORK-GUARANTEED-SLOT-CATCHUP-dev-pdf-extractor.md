# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-pdf-extractor

**Sprint goal:** Cowork guaranteed-slot catch-up (ambient sprint bucket; this entry is task-scoped, not sprint-goal-scoped)
**Agent:** dev-pdf-extractor
**Started:** 2026-07-30T19:XXZ

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-30T20:10:00Z
**task-id:** FIX-BCTC-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK
**what-done:** Confirmed `/extract-layout-first` (ops's "missing trigger" suspect) is genuinely uncalled dead code; the real live PEK-layout trigger is `POST /pek-extract`, correctly registered (`bctcPdfPullJob` + `bctcExtractReconcileJob`, `schedulerJobTable.ts`) and firing on cron cadence (RAW `cron_job_runs` reads). Live-refired `/pek-extract` for DPM 2025-Q4 (terminal `enrich_failed` row) end-to-end; confirmed via raw DB COUNT: `bctc_layout_units` 1193→1245 rows, fresh `2026-07-30 20:05:13`.
**what-considered:**
- Fix/rewire `/extract-layout-first` caller in mcp-server — rejected: that endpoint is a parallel, never-shipped Tier0-3 pipeline (`ExtractLayoutFirstUseCase`), not what ever produced `bctc_layout_units` rows; wiring it would not address the actual dormancy and is out of zone.
- Restart containers again — rejected: already restarted 07-28/07-30, no code change; would not prove anything new.
- Live end-to-end re-fire of the ACTUAL wired endpoint (`/pek-extract`) against a real terminal backlog row — chosen: directly falsifiable, produces a raw DB-verified result, matches task's own step-4 ask.
**why-decision:** cron_job_runs + bctc_vps_queue RAW reads showed both real trigger jobs firing correctly with zero eligible rows (0 `pending`, 0 `pek_triggered` — all 128 already exhausted to terminal `enrich_failed` by 2026-07-28 21:35Z); dormancy was queue-depletion + already-exhausted retries, not a missing/unregistered trigger. `FIX-PDFX-TESSERACT-CONCURRENCY` (commit 4bac2b85d) — the real root-cause fix for the original 07-28 11:06-18:04 stall — was already deployed in the running image before I started.
**why-change:** Handoff assumed the fix belonged in pdf-extractor's/mcp-server's trigger-wiring layer; investigation found no code defect in either — the pipe was already fixed and just needed live re-validation, which I performed. No code change landed in `apps/pdf-extractor/`.

---

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-07-31T00:00:00Z
**task-id:** FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE
**what-done:** Trimmed `extraction_engine.py` 237L→226L by deduplicating the FIX-PDFX-TESSERACT-CONCURRENCY/FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW propagation rationale, which commit 200eabcf3 had restated near-verbatim in 3 places (2 docstrings + 1 inline comment); no functional change. Committed `d808a6a11`.
**what-considered:**
- Add a current size-justification header — rejected: would bypass the baseline check entirely rather than address the actual drift; AC-3 prefers trimming.
- Re-baseline `docs/data/size-lint-baseline.json` to 237L — rejected: AC-2 landmine forbids touching it without a stated justification, and the +29L since the 208L baseline was 100% redundant prose (git-show confirmed), not new load-bearing content — no genuine justification existed.
- Trim genuine redundant documentation (chosen): git-blame'd the 208→237 delta to a single commit, confirmed the entire +29L was 3x-repeated rationale for the same 3 exceptions, collapsed to 1 canonical paragraph + 2 pointer references.
**why-decision:** File-level AC-1 only requires `--check` to stop listing the file; deduping redundant docs achieves that with zero behavior risk and no baseline mutation, satisfying AC-2/AC-3 by construction. Verified: `--check` no longer lists the file (1 unrelated macro-indicators offender remains, out of scope); full pytest suite 1058 pass / 1 pre-existing env-only fail (missing `/app/data/pdfs/...` fixture, confirmed identical on `git stash` — unrelated to this change).
**why-change:** No change from plan.

---
### STEP dev-pdf-extractor-S3 · dev-pdf-extractor · 2026-08-23T12:50:00Z
**task-id:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE
**what-done:** Replaced `_extraction_semaphore.acquire(blocking=False)` with `acquire(blocking=True, timeout=wait)` + `wait_s: Optional[float] = None` override and a new `PEK_SEMAPHORE_WAIT_SECONDS` env knob (default 30min), plumbed into `docker-compose.yml` beside the sibling `PDFX_OCR_QUEUE_WAIT_S`; rewrote 4 docstrings/comments that claimed contention maps to HTTP 429. Commit `3db7a8dc8`.
**what-considered:**
- Reuse `ocr_gateway._acquire_slot_blocking`'s shape in place (chosen) — AC-3 mandates reuse-only; the shape is already shipped and proven in the same service.
- Extract a shared bounded-acquire helper used by both `_OCR_SLOTS` and `_extraction_semaphore` — rejected: AC-3 says reuse, not refactor; the two guards have different exception types/telemetry and a shared helper is a new abstraction the row does not authorise.
- Add reconcile-job pacing so the batch never contends — rejected: explicitly `out_of_scope` (a), different zone (`apps/mcp-server/`), P2 follow-up only if post-fix telemetry still shows backlog.
**why-decision:** Bounded-blocking is the minimal change that converts a silent drop into either a success or a genuinely-rare loud failure, and blocking is free of new risk because the method is only ever reached via `asyncio.to_thread` from `pek_run_helper.py` — the worker thread is already expected to block for up to `_EXTRACTION_TIMEOUT_SECONDS`, so queueing extends an existing window rather than introducing one. Default wait == extraction timeout so a caller queued behind exactly one normal extraction always outlasts it.
**why-change:** No change from the architect brief's §2 design.

### STEP dev-pdf-extractor-S4 · dev-pdf-extractor · 2026-08-23T13:05:00Z
**task-id:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE
**what-done:** Proved the tests are honest-RED against the old acquire (AC-7 reported "contended batch LOST 2 of 3 members"); then established that AC-8/AC-9 are structurally unverifiable now — container is 8d old and still runs `blocking=False` at :657 with no `PEK_SEMAPHORE_WAIT_SECONDS` in env, AND `bctc_vps_queue` has ZERO `pek_triggered` rows (histogram: deferred_infra 328 / done 186 / enrich_failed 56 / url_not_found 44; all 56 enrich_failed are at reconcile_attempts>=8).
**what-considered:**
- Report AC-8 PASS on the quiet 08-23 log window — rejected: that is exactly the false-read PO recorded on 2026-08-15 (1068 lines, zero pek-extract requests); absence of the error where there is no traffic is not evidence.
- `docker cp` the fixed file into the live container for an authentic probe (the precedent this agent set in sprint-FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK S3) — rejected here: it would prove the code loads but still cannot produce a reconcile batch, because the selection query has zero eligible rows. The blocker is queue state, not deployment.
- Requeue rows myself to manufacture traffic — rejected: `bctc_vps_queue` is `apps/mcp-server/` zone, and out_of_scope (c) fences the counter-reset defect that a requeue would collide with.
**why-decision:** Reported AC-8/AC-9 as NOT-RUN with the mechanism named, rather than closing quietly on absent evidence. Captured a hard pre-fix baseline instead (30 distinct SemaphoreContendedError raises on 2026-08-22, all in 30-min tick bursts of 3-4; HUT `dab264ae` lost at 14:38:19Z and BSR `d332bf35` at 13:14:03Z, both to SemaphoreContendedError) so QA has a real before-side to diff against.
**why-change:** PO's AC-8 caveat assumed the 3 named ids would never be re-selected; the live log refutes that for 2 of 3 — they WERE re-fired on 08-22 and lost the race again. The real blocker is different (queue now fully drained to zero `pek_triggered`), so the caveat's remedy ("substitute currently-live pek_triggered rows") is also unavailable.

---
