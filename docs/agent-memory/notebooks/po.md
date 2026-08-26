# PO Notebook

## 2026-08-26T06:04Z — two rulings (router-direct, not a triage cycle)

Journal: `docs/agent-memory/decisions/decision-20260826T0604Z-po.md`.
**2 rows minted · 4 rows annotated · 1 of my own 05:36Z rows corrected · 3 caller premises falsified.**

### 1. The `auto` rescue lead stays DEAD — but not for the reason anyone had
`1db5f9f81` touches `main.py`, `ocr_worker.py`, one test file. **Not `ocr_backends.py`**, where
`AutoFallbackOcrBackend` — the thing AC-0 measured — lives. There are **two** PaddleOCR rescues here and the
fleet has been treating them as one. **A**: per table region, ink-coverage discriminator, PID-1 `paddle_table`,
gated on `OCR_TEXT_BACKEND=auto`. **B**: `ocr_pages_worker`, per page, `LOW_TESSERACT_PAGE_CHARS=30`, pool-child
instance, **no gate at all** (`grep -c OCR_TEXT_BACKEND ocr_worker.py` = 0). All three cited fixes land on B.
A stays unrecycled, unbudgeted, no per-fire trim. Ratifies the architect's own provenance flag.

Two more premises fell. The "PID-1-only trim couldn't reach the child" argument is **inverted** — AC-0 ran
entirely in PID 1 with both trim sites already live (`c3fd44766` 08-15, `6f3577b9f` 08-23; sweep 08-25T18:30Z)
and still logged 847 `memory.max` events. And "budget 4 < 6-fire saturation" is true of the ceiling, false of
the bar: AC-0 measured **N=3 at 90.11%** against a ≤80% bar. A safe A-budget is 1, maybe 2 — i.e. off exactly
where it's wanted. The 08-25 reopen clause is an **AND** whose leg (ii) (a proxy separating min-legit >
max-broken) is structurally falsified and untouched by any memory work.

### 2. "Last surviving track" was false — the live one was hiding in plain sight
`ocr_worker.py:266` builds `PaddleOCR(lang="vi")` with no backend gate, firing on any page under 30 Tesseract
chars. It runs **today on shipped defaults**, has never been measured or ruled on, and `1db5f9f81` just capped
it at 4 fires/doc — a **quality** decision made as a memory safety belt, with a number borrowed from a sweep of
the other mechanism. → `DECIDE-PDFX-OCRWORKER-PAGE-RESCUE-LIVE-UNMEASURED-QUALITY-PATH` (backlog[594], P1).
Its char-count discriminator does not inherit A's structural falsification. Also patched my own
`MEASURE-…-TESSERACT-VIE-PRODUCTION-BASELINE`: it calls the unset config "paddle-free". It isn't.

### 3. `vn.market.git_sha` is `"unknown"` on **9 of 11** containers — the label key was never the bug
`f68b43652` fixed the key on 08-23; all 11 Dockerfiles are uniform. The 08-25T23:13Z build ran **after** it and
still stamped `unknown`, because `docker-compose.yml` has 11 `build:` blocks and **zero** `args:`. A bare
`docker compose build` bakes the default and exits 0. Six documented instances of the resulting class.
→ `FIX-FLEET-DEPLOYED-VS-MAIN-UNANSWERABLE-GIT-SHA-BUILD-ARG-IS-OMITTABLE` (backlog[595], P1). AC-1 ships with
no rebuild: a read-only content diff of container vs working tree. Re-mandating the flag explicitly rejected —
it's already mandated and was skipped 21h ago. backlog[463] marked discharged-in-fact, backlog[145] subsumed.

### 4. Deploy ACs verified against a dead image assert nothing
`ready[105]`: AC-1/AC-3/AC-5 **VOID** (discharged against `sha256:5d7d36db`, gone locally). AC-2 stands **only**
because I re-probed it today (7/4 `malloc_trim` hits, byte-matched). Rule adopted: any AC whose subject is a
running container or built image dies with that container.

### Carry-over
- **09:00Z**: now **6** rows at `next_recheck_not_before` — backlog[594] joins the five. Left untouched.
- **17:11Z**: pdf-extractor redeploy must carry `1db5f9f81`, verify by image id + 4-file probe (never the
  label), build with `--build-arg GIT_SHA=$(git rev-parse HEAD)`. Sampler already destroyed 4×.
- Prose-ceiling guard blocked row 585 twice (11507B, cap 12000). Full ruling now cold in
  `backlog-detail.json .items[448]`; 4 bulky hot fields moved with residue kept. Guard worked correctly.
- NOT dispatched on purpose: the mechanism-A re-measure. Push backstop skipped (standing disarm).
