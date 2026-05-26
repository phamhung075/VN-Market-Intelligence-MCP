# DRIFT-3-A3 — Update Docker Deployment Runbook (Step 4)

**Task ID:** DRIFT-3-A3
**Phase:** Phase A (parallel-safe)
**Brief:** `docs/architecture-briefs/2026-05-26-ci-cd-image-sha-drift-guard.md`
**Owner:** dev-cross-service (ops/runbook)
**Zone:** `cross-service/` (docs/protocols/)

---

## Scope

Update `docs/protocols/docker-deployment-runbook.md` §Step 4 to replace the existing timestamp-based comparison check with the new SHA-based verification script.

**Current Step 4 language (to be replaced):**
- Relies on comparing `docker inspect --format '{{.Created}}'` (container creation timestamp) against git commit timestamp
- This is imprecise (build cache can produce later timestamps with old code) and manual (no script enforces it)

**New Step 4 language:**
- Replaces timestamp check with call to `scripts/verify-deploy-sha.sh <service>`
- Script exits 0 iff deployed SHA matches `git rev-parse HEAD`
- Any exit 1 = deploy BLOCKED

---

## Acceptance Criteria

- AC-1: Runbook §Step 4 title/description reflects "SHA gate" or "SHA verification"
- AC-2: Old timestamp-comparison language (`{{.Created}}` vs commit time) is REMOVED
- AC-3: Step 4 calls `scripts/verify-deploy-sha.sh <service>` and asserts exit code 0
- AC-4: Example command in runbook includes the full sequence:
  ```bash
  docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc>
  docker compose up -d <svc>
  scripts/verify-deploy-sha.sh <svc>   # must exit 0
  ```
- AC-5: Runbook documents that on first run, containers built before this guard will fail (label absent) → rebuild required — this is expected behavior
- AC-6: Runbook notes that `flaresolverr` (pulled image) is skipped (no local Dockerfile to patch)

---

## Old Step 4 (example context)

Typical old text like:
> "Step 4: ops compares `docker inspect --format '{{.Created}}' <container>` against the commit timestamp. If creation time ≥ commit time, deploy is valid. Otherwise, rebuild."

This must be replaced with SHA verification.

---

## New Step 4 (template)

| Step | Actor | Action |
|------|-------|--------|
| 1 | ops | Check free Docker memory (`docker stats --no-stream` + `free -m`). If > 7 GB, hold. |
| 2 | ops | Rebuild: `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc>` then `docker compose up -d <svc>` |
| 3 | ops | Container started: `docker compose ps <svc>` → `running (healthy)` |
| **4** | **ops** | **SHA gate:** `scripts/verify-deploy-sha.sh <svc>` — **MUST exit 0**. Any non-zero = deploy BLOCKED. If label absent (first-run post-deployment), container must be rebuilt; this is correct behavior, not an error. |
| 5 | qa | Hit `/health` + verify behaviour (endpoint / tool response, not just 200). |
| 6 | po | Mark DONE only after Steps 1–5 pass. |

---

## Files to Modify

| Path | Owner | Change |
|------|-------|--------|
| `docs/protocols/docker-deployment-runbook.md` | dev-cross-service | Replace Step 4 timestamp check with SHA verification script call |

---

## Dispatch

Single-zone task (cross-service). Can be parallelized with DRIFT-3-A1 and DRIFT-3-A2 (all Phase A). Documentation-only change — no rebuild needed.

---

## Binding Day-0 Notes

- Explicit-file staging only: `git add docs/protocols/docker-deployment-runbook.md`
- No `--force`, `--no-verify`, `--no-gpg-sign`
- NO `git push` (main terminal owns the final commit)
- Stay on main branch
- Do NOT touch `apps/pdf-extractor/`, any `LF-*` task, any `pilot-status-*.json`, or `docs/pipeline-state.json` BCTC fields
