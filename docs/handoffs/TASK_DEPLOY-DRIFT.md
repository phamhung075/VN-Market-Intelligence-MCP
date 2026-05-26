# TASK DEPLOY-DRIFT — Deployed container images lag latest commit (MCP tools 404)

**Filed:** 2026-05-25T07:08Z by PO (from user incident report via main terminal)
**Incident origin:** 2026-05-25 macro + kinh-dich outage. Both microservice containers were unreachable for MCP tool access.
**Priority:** HIGH (reliability tier — top of PO order). NOT a SCALE pilot; does NOT consume the WIP=2 fleet cap; does NOT touch any `pilot-status-*.json`.

---

## Incident context — what is ALREADY fixed vs. what is LEFTOVER

The **connectivity root cause is FIXED + committed** — these tasks are the residual deployment drift, NOT the outage:

- `a5b6203d` fix(ops): MCP server Docker network hostname resolution — added explicit Docker-network hostname env vars to `docker-compose.yml` for mcp-server (mcp-server was using `localhost:5004`/`localhost:5005` which, inside a container, resolves to itself, not peer services).
- `3bd9e6ae` fix(ops): correct macro-indicators env var — `MACRO_INDICATORS_URL` not `MACRO_SERVICE_URL`. `macroHttpClient.ts` reads `Bun.env.MACRO_INDICATORS_URL`; the first fix set the wrong name → undefined → localhost fallback → connection refused.

**The 3bd9e6ae commit message itself documents the two leftover items below** (`get_macro_calendar: HTTP 404 — endpoint /macro-calendar not implemented in [deployed] macro-indicators handlers`).

---

## DRIFT-1 — get_macro_calendar 404 (macro image drift)

- **Symptom:** `get_macro_calendar` MCP tool returns 404. It is DEAD until resolved. `get_macro_snapshot` works (verified 200 end-to-end in `3bd9e6ae`).
- **Root cause:** `/macro-calendar` route is NOT implemented in the deployed macro-indicators container image (older TS build).
- **The route EXISTS in the Go rewrite:** `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` (P2 macro-indicators pilot).
- **The env-var connectivity bug is NOT this task** — already fixed in `3bd9e6ae`. This task is ONLY the missing route.
- **Fix options (dev-macro-indicators decides, then executes):**
  - (a) deploy the Go macro-indicators image (preferred if Go service is otherwise deploy-ready), OR
  - (b) backport the `/macro-calendar` route to the deployed TS service.
- **Owner:** dev-macro-indicators (path decision + any backport code) + ops (deploy). **Zone:** `apps/macro-indicators/`.
- **DONE:** `get_macro_calendar` returns 200 with real calendar data **end-to-end through mcp-server** (not a direct-service curl — see false-green guard below).

## DRIFT-2 — kinh-dich-service running stale May-20 TS image

- **Symptom:** basic tools (`get_market_hexagram`, `get_kinhdich_reading`) work, but 4 newer endpoints 404: `/readings/{code}/history`, `/hexagram/{number}/transitions`, `/backtest/{code}`, `/hexagram/{number}/explain`.
- **Root cause:** deployed container runs a stale May-20 TS image. Predates the 2026-05-24 TS→Go reboot and the P2-KD-G commit.
- **The fix is a REDEPLOY, not a code change** — repo HEAD already carries the Go reboot: `apps/kinh-dich-service/Dockerfile` (header "Go reboot from TS/Bun", CGO_ENABLED=0 pure-Go), `cmd/server/main.go`, latest commits `746dee48` (KD-QREF-LANG) / `0b401124` (KD-QREF).
- **Fix:** rebuild + redeploy the kinh-dich-service container to the latest commit (Go binary per the reboot).
- **Owner:** ops (rebuild + redeploy). dev-kinh-dich on standby ONLY if the rebuild surfaces a genuine code defect. **Zone:** `apps/kinh-dich-service/`.
- **DONE:** all 4 endpoints return 200 end-to-end; basic tools still work (non-regression).

## DRIFT-3 — Systemic guard (dev-kinh-dich recommendation)

- **Recommendation:** add a CI/CD step that verifies the deployed container image matches the latest commit BEFORE declaring a deployment complete. This image-drift class caused BOTH DRIFT-1 and DRIFT-2.
- **Architect designs first** (cross-service design question, not a single-zone task): is this one verify-step baked per service, or a shared deploy-gate across docker-compose services? Output a design, then route impl to the owning zone or cross-service dev.
- **Include a deliberate-stale-image proof:** intentionally deploy a known-stale image → guard must FAIL the deploy (prove it isn't a false-green no-op, per the `feedback_fence_false_green` lesson).
- **Owner:** architect (design) → owner-zone / cross-service dev (impl). **Zone:** `cross-service/`.
- **Recurring-bug guard:** the deploy-drift CLASS now has 2 instances (macro + kinh-dich), same root cause. DRIFT-3 is the structural-rethink response per `feedback_recurring_bug_escalation.md` — not another one-off patch. A 3rd drift incident before DRIFT-3 lands → PO blocks all deploys until the guard ships.

---

## Binding guards

- **False-green guard (from `3bd9e6ae`):** the prior macro fix gave a false green on a DIRECT `/snapshot` test that bypassed mcp-server. Verify DRIFT-1 + DRIFT-2 **end-to-end THROUGH mcp-server**, not via a direct-service curl.
- **HONEST counts:** verify the deployed image SHA against the latest commit — never assume "should be deployed."
- **Day-0 (every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` zero foreign files; do NOT touch any `pilot-status-*.json`; never ask user to run/deploy — spawn ops/dev.

## Acceptance gate (DRIFT-QA, qa)
End-to-end through mcp-server: `get_macro_calendar` 200 + real calendar data; all 4 kinh-dich endpoints 200; basic kinh-dich tools non-regression; test baseline 9277/34 no new fails. Emit `qa-deploy-drift-<UTC>.json`. DRIFT-3 carries its own deliberate-drift proof (separate from this gate).

---

## [Architect] DRIFT-3 — CI/CD Image SHA Drift Guard

**Design completed:** 2026-05-26T20:30Z
**Brief:** `docs/architecture-briefs/2026-05-26-ci-cd-image-sha-drift-guard.md`

### Zone
`cross-service/` — touches all 11 local Dockerfiles + `scripts/` + `docs/protocols/docker-deployment-runbook.md`

### BUILD-STANDARD: lean
(new scripts + 2-line Dockerfile additions + runbook update; no new service)

### Root Cause (structural)

Both DRIFT-1 and DRIFT-2 share the same mechanism: `docker compose up -d` (without `--build`) relaunches the previously-built image. The health check passes (`/health` 200, `running (healthy)`), the deploy is declared complete, but the committed code is absent. The existing Step 4 in the deployment runbook used a timestamp comparison (`{{.Created}}` vs git commit time) which is (a) imprecise — a cached build can produce a later timestamp with old content — and (b) manual — no script enforces it.

### Mechanism

Bake the git commit SHA into each Docker image as a label at build time (`ARG GIT_SHA + LABEL vn.market.git_sha`). After deploy, `scripts/verify-deploy-sha.sh <service>` reads the label from the running container and compares it to `git rev-parse HEAD`. SHA mismatch or absent label = exit 1 = deploy BLOCKED.

### Key files to create/modify

| Action | Path |
|--------|------|
| CREATE | `scripts/verify-deploy-sha.sh` — main SHA gate |
| CREATE | `scripts/test-sha-drift-guard.sh` — deliberate-stale-image proof |
| CREATE | `scripts/test-sha-comparison-unit.sh` — unit tests (no Docker daemon) |
| MODIFY | All 11 local Dockerfiles (`apps/*/Dockerfile`) — add `ARG GIT_SHA` + `LABEL` to runtime stage last 2 lines |
| MODIFY | `docs/protocols/docker-deployment-runbook.md` — replace Step 4 timestamp check |

### Deliberate-stale-image proof (AC-2 / AC-3)

`scripts/test-sha-drift-guard.sh` builds a minimal Alpine image with label `vn.market.git_sha=0000000...` (known-stale), runs it as a container, invokes `verify-deploy-sha.sh` against it, and asserts the script exits 1 with "SHA drift detected". The proof itself exits 0 only when the guard correctly FAILS. A guard that returns OK on a stale image = false-green = proof exits 1 and implementation is blocked.

### Implementation sequence constraint

`apps/pdf-extractor/Dockerfile` has an active parallel session (BCTC-LAYOUT-FIRST). The 2-line ARG/LABEL addition to that Dockerfile is Phase B, sequenced after pdf-extractor's session closes. All other 10 Dockerfiles + scripts + runbook update are Phase A (parallel-safe, no overlap with active sessions).

### Risk flags

- R-HIGH (mitigated): Docker layer cache can serve stale layers. Mitigation: place `ARG GIT_SHA` + `LABEL` as the LAST two lines of the final runtime stage (after all `COPY --from=builder` instructions) so the label step is never served from a stale cache.
- R-MED: `docker compose ps -q` may return multiple IDs during restart. Mitigation: filter for `running` state only in `verify-deploy-sha.sh`.
- R-LOW: First run after shipping — containers built before this guard have no label. Expected: guard exits 1 "label absent — rebuild required". This is correct behavior.

### Acceptance criteria summary

- AC-1: `verify-deploy-sha.sh` exits 0 on fresh rebuild (SHA matches HEAD)
- AC-2: `verify-deploy-sha.sh` exits 1 on stale image (SHA mismatch)
- AC-3: `test-sha-drift-guard.sh` exits 0 (proof validates the guard)
- AC-4: All 11 Dockerfiles carry the label (`grep` returns 11 paths)
- AC-5: Runbook Step 4 calls `verify-deploy-sha.sh` (timestamp check language removed)
- AC-6: Unit test script passes all 3 cases (match / mismatch / empty label)

### Ops rebuild command (updated — for runbook)

```bash
docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" <svc>
docker compose up -d <svc>
scripts/verify-deploy-sha.sh <svc>   # must exit 0
```
