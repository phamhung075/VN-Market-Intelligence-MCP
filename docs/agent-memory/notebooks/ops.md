# Ops — Notebook

Zone: Docker/VPS/DB operations, incident response, close-gate verification.

### Pointer to Prior Cycles
→ Cycles 2026-08-06 through 2026-08-06T18:50Z archived to `docs/agent-memory/sessions/ops-cycles-archive-20260808.md`
→ Cycles 2026-08-12 (RAG-service incidents and rebuild) archived to `docs/incidents/ops-cycle-20260812-rag-service-below-floor.md`
→ Cycle 2026-08-13T21:16Z (FACTORY-INFRA-split-agentSignalStore rebuild) archived to `docs/incidents/ops-cycle-20260813-mcp-server-rebuild.md`
→ Cycle 2026-08-14 (RAG restart + durability window setup) archived to `docs/incidents/ops-rag-durability-window-2026-08-14.md`

---

## Cycle 2026-08-15T09:15Z — RAG + PDFX P0/P1 BATCH DISPATCH

**Row 1: UNBLOCK-RAG-OPS-DEPLOY-AND-DURABILITY-MEASUREMENT-WINDOW (P0)**

Task: Run D1-D5 durability measurement on already-deployed fix.

**Result: AC-1/AC-2 PASS, AC-3/AC-4 FAIL** → Move to review[]/BLOCKED for PO

Detailed findings: `docs/incidents/ops-rag-durability-2026-08-15-d1d5-measurement.md`

Summary:
- D1: Baseline OK (fix deployed, malloc_trim present)
- D3 VERDICT: **FAIL** — Memory oscillates severely
  - Peak: 97.87% (7.87% margin to OOMKill)
  - Volatility: 2.368pp/min avg (118x threshold)
  - 46% of 13h measurement samples exceed 85% cap bar
- AC-5 fail-path: Escalate to FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED

**Row 2: UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT (P1)**

Task: Rebuild pdf-extractor with malloc_trim fix, then measure burst headroom.

Status: **IN PROGRESS** (Docker build running, blocked on pip install completion)

Current image: sha256:b5db1296ae85 (7 days stale, fix not present)
Build start: 2026-08-15T09:40Z
Expected completion: ~2026-08-15T10:00Z

Next: Verify AC-1 (image differs), AC-2 (malloc_trim present), measure burst via AC-4

---

**Session**: 632721c2-41e4-4aff-8d06-a47cf80dc0d7 (ops agent tier-1, router batch dispatch)


---

**PDFX REBUILD COMPLETION**:

AC-1 (Image differs): **PASS** ✓
- Old: sha256:b5db1296ae853d9667c62765214a0b26099c9f8eb765bea051294c49b1088a1b
- New: sha256:4ee7f1c3598ed8508697a1db638e6f5a3ed2ef25b5e9c77e0b7e4a69565ac997

AC-2 (malloc_trim present): **PASS** ✓
- grep -rl malloc_trim /app returns: /app/interface/pek_run_helper.py

AC-3 (Peer containers): **PASS** ✓
- mcp-server: Up 1h (healthy)
- rag-service: Up 14h (healthy)
- pdf-extractor: Up 1min (healthy)

AC-4/AC-5/AC-6 (Burst measurement): **PENDING** 
- Container is healthy and ready for POST /pek-extract burst testing
- Measure and hand off to PO with findings


---

## Cycle 2026-08-23T13:55Z — TASK-BCTC-INSPECT-UI-FILTERS MCP-SERVER REBUILD

**Task:** Rebuild mcp-server Docker image to deploy BCTC inspector quarter+ticker filter UI enhancements (code landed on main commit 2e66153fd).

**Root Cause:** apps/mcp-server/src is baked into Docker image at build time. Running image sha256:c8322d2 (built 2026-08-15T08:44Z) was 8 commits behind main.

**Action:**
```bash
# Build: docker compose build mcp-server (138.6s, succeeded)
# Deploy: docker compose up -d --no-deps mcp-server (no bare down/up — killed peers guard)
# Prune: docker builder prune -f (reclaimed 15.13GB)
```

**Verification:**
- ✅ Image changed: old sha256:c8322d2 → new sha256:de8e753...
- ✅ Container healthy: StartedAt 2026-08-23T13:55:15Z (post-dispatch)
- ✅ Port 3000 /health: 200
- ✅ Port 3000 /api/bctc-inspect: 200, HTML contains id="quarter-filter" and id="ticker-filter"
- ✅ Port 4004 /api/bctc-inspect: 200, same new HTML
- ✅ All 12 containers Up (post-rebuild health check per docker.md § MANDATORY)

**Deployment Evidence:**
```
date -u: 2026-08-23 13:55:24 UTC
StartedAt: 2026-08-23T13:55:15.509066584Z
Image: sha256:de8e753cb52dd62eef768c85d9c6d17892574fd8518cb4be6c7abe4b1f63d4ed
```

**Orch Update:**
- Row: task_board.review[21] id=TASK-BCTC-INSPECT-UI-FILTERS
- next_agent: ops → qa
- status_note: Updated with rebuild completion details and endpoint verification
- Applied via: scripts/orch-apply.sh (validation OK)

**Result:** ✅ REBUILD VERIFIED. Ready for QA live dual-origin AC1-AC10 verification.

**Session**: 669e1d9f-6aa0-49b5-bbf3-5aa3f92f55e3 (ops agent, docker rebuild dispatch)


---

## Cycle 2026-08-23T14:15Z — PDFX REBUILD (PEK semaphore fix) + A-30 REFUTATION

Full verified record → `docs/incidents/ops-20260823-pdfx-rebuild-and-a30-refutation.md`

**Rebuild (qa blocker (a) cleared):** image `4ee7f1c3598e` → `e5d36a387b74`, container StartedAt
2026-08-23T14:15:02Z, single-service `build --build-arg GIT_SHA` + `up -d --no-deps`, peers
untouched (12/12 Up), builder prune run.

**LESSON — image-ID change is necessary but NOT sufficient.** What actually cleared qa's hold was
introspecting the LOADED module inside the container (`python3 -c "import …; inspect.signature/
getsource"`), which showed `acquire(blocking=True, timeout=wait)` + the `wait_s` param +
`_SEMAPHORE_WAIT_SECONDS=1800`. A `docker exec grep` of `/app/…py` only proves the file on disk,
not what the interpreter loaded. Use introspection whenever a row asks "is the fix RUNNING".

**AC-8 traffic (blocker (b)) had to be manufactured legitimately.** `pek_triggered` was 0 and all
56 `enrich_failed` were at/over the retry cap, so no organic traffic existed. Ran the already-
authored `reset-bctc-enricher-stuck-backlog-2026-04.ts` (which is the OPS-BCTC row's own action
plan) → 21/21 `url_not_found`→`pending`. One action, two rows. Sequenced AFTER the rebuild on
purpose — firing first would have burned the window on the stale image.
Result: 6× `/pek-extract` 202, **SemaphoreContendedError=0, `_run_pek_extract: FAILED`=0**
(pre-fix baseline 30/39).

**LESSON — a fresh container's healthy numbers prove nothing.** At 14:17Z (2 min old) pdf-extractor
read 18.89 % memory; by 14:25Z it was at 100 % and at 14:27:10Z it **silently exited (ExitCode 0,
OOMKilled=false)** and restarted. Reporting the 18.89 % as "A-30 resolved" would have been
fabrication. Always load the service and re-measure before certifying a memory/reclamation claim.

**AC-9 REFUTED (reported plainly, as the AC itself demands).** The 100 % pin + silent exit happened
in the 14:15–14:39Z window where `/pek-extract` was ~0 and `/extract` carried 127 posts, so
sustained-memory is NOT downstream of PEK semaphore contention — it tracks the legacy `/extract` +
`ocr_gateway` path. Needs its own row.

**LESSON — check signal timestamps against the swap time before accepting blame.** The 3 auditor
CRITICAL/WARN signals at 14:12:28/38/45Z predate the container swap at 14:15:02Z, so they describe
the OLD image, not a regression from the rebuild.

**Three new defects filed to BUG (msg 5466), none owned by a row:** (1) A-30 re-attribution above;
(2) `ocr_gateway.inflight: semaphore=1 != os_children=0` self-declared fail-loud, 59 hits since
rebuild, 90/199 `/extract` posts 429'd — prime suspect for (1); (3) `scripts/verify-deploy-sha.sh
pdf-extractor` can NEVER pass — `apps/pdf-extractor/Dockerfile:19` emits `LABEL git_sha=` while the
gate reads `vn.market.git_sha`, the name all 10 sibling Dockerfiles use.

**LESSON — two false-read traps, both hit live, now encoded in `scripts/ops-bctc-2025q4-cohort-probe.sh`:**
`financial_reports.period_quarter` is INTEGER `4` but `bctc_vps_queue.period_quarter` is STRING
`"Q4"` (matching "Q4" against financial_reports returned NO_FR_ROW for all 12 — a clean false
negative that looked like a finding); and an inlined SQL string literal inside a single-quoted
`bun -e` shell string truncates the program to a silent zero-row exit-0 run.

**Also:** `docker.md`'s health recipe curls `.project.microservices[].port`; for `stock-price` that
is the CONTAINER port 5000, whose host publish is **5010** — host :5000 is macOS ControlCenter and
answers 403. Not a service failure. `frontend` 404s on `/health`, 200s on `/`.

**TASK-COWORK-PMSET-WAKE-ADJUNCT: BLOCKED, not done.** `sudo -n true` → "a password is required";
pmset repeat needs root and an agent shell cannot supply it. Derived (AC-1) from
`cowork-schedule.json`: 8 guaranteed slots span 05:15→20:13, 3 are daily ⇒ day-set MTWRFSU.
Command to run: `sudo pmset repeat wakeorpoweron MTWRFSU 05:10:00`; revert `sudo pmset repeat cancel`;
pre-state `pmset -g sched` was EMPTY. **AC-1/AC-2 conflict found:** `pmset repeat` takes exactly ONE
event, so it cannot cover a union of 8 times; and slot times carry no `tz` field while pmset uses
local — confirm the dispatcher's TZ basis before applying or the wake lands 2h off.

**Session:** 7be6b4cd-057e-419b-a967-4810daf2b646 (ops)
