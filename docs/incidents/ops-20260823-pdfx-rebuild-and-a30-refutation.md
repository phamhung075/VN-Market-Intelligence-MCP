# ops 2026-08-23 — pdf-extractor rebuild (FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE) + A-30 refutation

**Agent:** ops · **Session:** 7be6b4cd-057e-419b-a967-4810daf2b646
**Rows:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE (review, ops→qa) ·
OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE (ready) · TASK-COWORK-PMSET-WAKE-ADJUNCT (ready, blocked)

## 1. Rebuild — qa blocker (a) cleared

| | value |
|---|---|
| old image | `sha256:4ee7f1c3598e…` (built 2026-08-15T09:45Z, container Up 8 days) |
| new image | `sha256:e5d36a387b74…` (built 2026-08-23T14:10:42Z) |
| build | `docker compose build --build-arg GIT_SHA=5a7a873cc pdf-extractor` |
| deploy | `docker compose up -d --no-deps pdf-extractor` (single service; peers untouched) |
| container StartedAt | 2026-08-23T14:15:02Z (after dispatch 14:04Z) |
| builder prune | run, 62.23 MB reclaimed |
| fleet after | 12/12 `host_runtime_set` Up |

**Pre-rebuild proof REBUILD_REQUIRED was true:** in-container source line 657 read
`acquire(blocking=False)`; `grep -c PEK_SEMAPHORE_WAIT_SECONDS` = 0; env knob absent.

**Post-rebuild proof the RUNNING PROCESS carries the fix** — live module introspection,
not a file grep (a file on disk is not the module the interpreter loaded):

```
CLASS: PekEngineAdapter
  signature: (self, pdf_path: 'str', report_id: 'str', wait_s: 'Optional[float]' = None) -> 'Dict'
  acquire in LOADED source: ['acquired = _extraction_semaphore.acquire(blocking=True, timeout=wait)']
  wait resolution:          ['wait = _SEMAPHORE_WAIT_SECONDS if wait_s is None else wait_s']
  _SEMAPHORE_WAIT_SECONDS = 1800   (env PEK_SEMAPHORE_WAIT_SECONDS=1800, compose plumbing live)
```

## 2. Traffic — qa blocker (b) cleared

`bctc_vps_queue` had `pek_triggered=0`, so AC-8 had nothing to observe. Ran the already-authored
`reset-bctc-enricher-stuck-backlog-2026-04.ts` (the action plan of the OPS-BCTC row): 21/21 rows
`url_not_found` → `pending`, RAW-verified (histogram `url_not_found` 44→23, `pending` 0→21).
Sequenced deliberately AFTER the rebuild so the batch would hit the post-fix image.

**AC-8 early evidence (qa certifies, ops does not self-certify):** 14:39–14:51Z, 6 concurrent PEK
extractions queued — `SemaphoreContendedError` = **0**, `_run_pek_extract: FAILED` = **0**.
Pre-fix baseline for a comparable batch: 30 raises / 39 FAILED. No contended drops.
Not yet complete: `bctc_layout_units` (5905) and `bctc_table_rows` (4940) unchanged — extractions
still in flight. Re-probe with `scripts/ops-bctc-2025q4-cohort-probe.sh` after the :05/:35 ticks.

## 3. AC-9 — REFUTED, not confirmed

A-30 did **not** quiet. On the POST-fix image:

- memory pinned **99.99 %** of the 2.5 GiB cgroup cap (peak 100 % at 14:25:16Z)
- process **silently exited — ExitCode 0, OOMKilled false** — at 14:27:10Z; RestartCount 0→1
- 7 health probes returned HTTP 000 during the pin

**Decisive attribution:** that episode sat in the 14:15–14:39Z window, where `/pek-extract` was
~0 while `POST /extract` carried 127 requests and `ocr_gateway` logged 41 errors. The burst the
architect blamed had not started. So sustained-memory is **not** downstream of PEK semaphore
contention — it tracks the legacy scalar `/extract` + `ocr_gateway` path. Needs a follow-up row.

Note on the 3 auditor signals at 14:12:28/38/45Z: they **predate** the swap at 14:15:02Z by ~2.5 min,
so they describe the OLD image and are **not** a regression from this rebuild. Confounder worth
naming: the build ran 14:04–14:10:42Z and its image export/unpack is host-I/O heavy, which can
inflate health-probe latency; the container-internal memory metric is not inflatable that way.

## 4. Three new defects, none owned by any row

1. **A-30 re-attribution** (§3) — `/extract` + `ocr_gateway`, not the PEK semaphore.
2. **`ocr_gateway` self-declared bug, 59 hits since rebuild:**
   `ocr_gateway.inflight: semaphore=1 != os_children=0 — bookkeeping disagrees with OS ground
   truth (this mismatch is, by definition, a bug)`. 90 of 199 `/extract` posts returned 429.
   Prime suspect for (1). Zone `apps/pdf-extractor/infrastructure/ocr_gateway.py`.
3. **Deploy SHA gate is blind to pdf-extractor:** `apps/pdf-extractor/Dockerfile:19` emits
   `LABEL git_sha=` but `scripts/verify-deploy-sha.sh` reads `vn.market.git_sha`, which all 10
   sibling Dockerfiles use. The gate therefore always reports "label absent. Rebuild required."
   even on a correctly deployed image. One-line Dockerfile fix. Ops verified this deploy by
   image-ID change + runtime introspection instead.

## 5. Two false-DONE anomalies (OPS-BCTC row)

- **GAS** queue 255878 → `done`, `source_url` resolved, yet `financial_reports` has **zero** rows
  for GAS 2025. `ensureFinancialReportShellRow` did **not** auto-create the shell as predicted.
- **GVR** `b1cd4d07` → `done`, FR row present, `pdf_path` set, `text_status=COMPLETE`, yet
  `net_revenue=0`, `total_assets=0`, layout/rows/md all 0.

Both reached `done` at 14:40:3x–4x, not a `:05/:35` reconcile minute — so `done` came from
`bctcPdfPullJob` on scalar `/extract` success, not from `bctcExtractReconcileJob`. If the pull job
terminalises on the scalar leg without waiting for the async table leg, the lifecycle reports
`done` while `bctc_table_rows` stays 0 forever — a **third** root cause stacked on the fallback-id
and stuck-queue causes. Ops observation, not a design ruling → architect/po.

Good news: **D2D's `pdf_path` self-healed** NULL → `/app/data/pdfs/…` with no manual sync, exactly
as the architect predicted, confirming the reset genuinely unstuck the lifecycle.

## 6. Two probe false-read traps (encoded in the probe script)

`scripts/ops-bctc-2025q4-cohort-probe.sh` now guards both, each hit live today:

1. `financial_reports.period_quarter` is INTEGER `4`; `bctc_vps_queue.period_quarter` is the
   STRING `"Q4"`. Matching `"Q4"` against `financial_reports` silently returns `NO_FR_ROW` for
   all 12 tickers — a total false negative that looked like a real finding.
2. The `bun -e` program is a single-quoted shell string, so an inlined SQL string literal
   truncates it and the whole probe returns zero rows with exit 0
   (`reference_bun_eval_silent_exit0_swallows_errors`).

Also note for anyone reading `docs/agents/ops/flow/docker.md`: its health-check recipe curls
`.project.microservices[].port`, but for `stock-price` that is the **container** port 5000, whose
host counterpart is 5010 — and host :5000 is macOS ControlCenter/AirPlay, which answers **403**.
That 403 is not a service failure. `frontend` has no `/health` route and answers 404 on it, 200 on `/`.
