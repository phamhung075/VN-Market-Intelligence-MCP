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
