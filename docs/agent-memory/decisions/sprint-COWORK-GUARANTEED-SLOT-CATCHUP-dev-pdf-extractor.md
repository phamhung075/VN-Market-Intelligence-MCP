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
