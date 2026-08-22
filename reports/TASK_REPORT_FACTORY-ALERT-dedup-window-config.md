# Task Report: FACTORY-ALERT-dedup-window-config — Replace hardcoded 60-min dedup window with a config-sourced DedupWindowMinutes

date: 2026-08-06
outcome: **CHANGES_REQUESTED** (not a code defect — a runtime deployment gap)
mode: verify-committed (dev-team Review-Lane QA-Drain, head-decoupled, `branch:null`)
scope: `apps/alert-engine/` (Go microservice) — direct commit to `main`, no task branch.

## What changed (commit `43f4e3add`, + `60c3272b2` memory)

`domain.CooldownConfig` gains a named `DedupWindowMinutes int` field (default 60),
separate from the pre-existing `CooldownMinutes` (30). `pkg/module/alert_pipeline/pipeline.go`'s
`HasDuplicateFingerprint` call now passes `p.cfg.DedupWindowMinutes` instead of
`p.cfg.CooldownMinutes` — the fix's actual defect. The dedup-suppressed reason string is
now built via `fmt.Sprintf("duplicate: fingerprint seen within %dmin", ...)` instead of the
prior static string. New `models_test.go` pins `DefaultCooldownConfig.DedupWindowMinutes == 60`
(and asserts it stays distinct from `CooldownMinutes`); `pipeline_test.go` now captures the
`withinMinutes` arg the pipeline passes and asserts it against the named field. 4 architecture
docs updated (`domain-model.md`, `usecases.md`, `api-reference.md`, `testing.md`).

## Independent re-verification (code — all re-run, not trusted from `review_note` prose)

- `go build ./...` → exit 0
- `go vet ./...` → exit 0
- `go test ./...` → 8/8 packages pass; 60 top-level `RUN` / 70 `PASS` incl. subtests — **matches the claimed count exactly**
- `golangci-lint run ./...` → 0 issues
- `scripts/audits/mock-guard.sh --files "...models.go .../pipeline.go"` → PASS
- DDD scan: `domain/models.go` has no infra imports; `pipeline.go` imports only `domain` + primitives
- Security scan: no `process.env`, no secret literals in touched production files
- Default `60` cross-checked against `mcp.config.json:215` `alertQuality.dedupWindowMinutes` and
  `apps/mcp-server/src/infrastructure/config.ts:663` `numVal(aq, "dedupWindowMinutes", 60)` — confirmed real, not invented
- Decision journal present with `**task-id:** FACTORY-ALERT-dedup-window-config` (DJ-GATE-1 satisfied)

**Code verdict: correct, fully tested, well-documented.**

## Why CHANGES_REQUESTED anyway — RAW live-service verification

This row's own DoD explicitly requires: *"RAW-verify the served suppression decision after
rebuild uses the configured window"* (`rebuild_required: true` in `backlog-detail.json`, not
carried onto the board row). RAW-verified the **live container**, not the source:

```
docker inspect vn-market-intelligence-mcp-alert-engine-1
  → image sha256:e24163c13428 created 2026-07-15T15:13:50Z
  → container StartedAt   2026-07-15T15:16:48Z
commit 43f4e3add committer-date 2026-07-28T21:25:42Z (UTC)
```

The running image is **13 days older** than the fix commit. Binary marker check on the live
container:

```
docker exec vn-market-intelligence-mcp-alert-engine-1 sh -c "grep -ac 'seen within' /app/server; grep -ac 'seen recently' /app/server"
→ 0
→ 1
```

The deployed binary still contains the **pre-fix** string (`"duplicate: fingerprint seen
recently"`) and zero occurrences of the new `fmt.Sprintf`-built reason — definitive proof the
service currently in production still passes `CooldownMinutes=30` into the dedup check, not the
new `DedupWindowMinutes=60`. `/health` confirms the container is up and serving; it is simply
running stale code. Same gap covers 4 sibling alert-engine FACTORY commits landed since 07-24
(`314461cbd`/`9d91af5bb`/`0a961e255`/`fb5fc9d4c`) — systemic, not unique to this row.

This is the same defect class PO escalated **today**, P2→P1, as
`FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` (3 live occurrences already: mcp-server
memleak / stock-price WAL / rag-embedder idle-unload) — *"qa live-verifies apps/<svc>/ code
fixes against the un-rebuilt running image"*. That row's own stated fix routes to **ops first,
then qa**. Applying that here: routing to `developer`/`fixer` for "a new commit" would
misdirect — no code fix is owed, the defect is *undeployed*, not unwritten.

## Board action taken (round 1, 2026-08-06)

`.task_board.qa[]` → `.task_board.review[]`, `status: QA → REVIEW`, `next_agent`/`owner: ops`,
`rebuild_required: true` (added, was missing), `redispatch_count: 0 → 1`. Applied via
`jq | scripts/orch-apply.sh` (conservation OK, `task_total` 791→791). Next action: ops
single-service rebuild+redeploy `alert-engine` only, then RAW re-verify (image build ts >
commit ts AND binary marker flip) before re-submitting to qa.

---

## Round 2 — 2026-08-22: ops redeploy independently re-verified

date: 2026-08-22
outcome: **APPROVED — DONE_VERIFIED**
mode: verify-committed round 2 (ops rebuild/redeploy re-check)

ops (this cycle) rebuilt+redeployed `alert-engine` only (`docker compose build alert-engine &&
docker compose up -d --no-deps alert-engine`, no `--force-recreate`/`down`/`stop`) and reported
RAW evidence in `status_note`. Independently re-ran every check myself, not trusted from prose:

**Image / container (re-run myself):**
```
docker inspect vn-market-intelligence-mcp-alert-engine-1
  → .Created (image)     = 2026-08-22T17:56:29.56Z   (> commit 43f4e3add, 2026-07-28T23:25:42+02:00) ✓
  → .State.StartedAt     = 2026-08-22T17:56:38.47Z
  → ContainerID           = cd90ef25d547 (new, RestartCount=0 — genuine recreate, not in-place restart)
  → .State.Health.Status = healthy
```

**Binary marker (re-run myself, `docker exec ... grep -a /app/server`):**
```
grep -a "seen within"   → 1 hit: "duplicate: fingerprint seen within %dmin"   (NEW, present) ✓
grep -a "seen recently" → 0 hits                                              (OLD, absent) ✓
```
Health endpoint `{"port":5006,"service":"alert-engine","status":"ok"}` — serving.

**Peer-isolation check (new this round, not in ops's own claim):** enumerated `StartedAt` for
all 12 running `vn-market-intelligence-mcp-*` containers — only `alert-engine-1` changed
(2026-08-22T17:56:38Z); every other container's `StartedAt` is unchanged/older (rag-service
8/15, mcp-server 8/15, stock-price 8/6, etc.). `grep depends_on` across `docker-compose.yml`
confirms no service declares `depends_on: alert-engine` — `--no-deps` recreate is provably
isolated, matching the "single-service, no peer disruption" claim.

**Functional-intent check (new this round):** re-read `backlog-detail.json`'s own `dod` field —
"config-sourced" means the value flows through a *named* `domain.CooldownConfig.DedupWindowMinutes`
field (distinct from `CooldownMinutes` reuse), confirmed against the live TS
`alertQuality.dedupWindowMinutes` default — NOT a runtime env/file load inside the Go binary
(no such requirement in the DoD; `main.go` wires `domain.DefaultCooldownConfig` directly, by
design for this task's scope). The served suppression decision now uses `DedupWindowMinutes=60`
distinctly from `CooldownMinutes=30`, matching the original defect this task was scoped to close.

**Code re-verify (host, static Go binary — no image/host dependency-drift risk unlike
interpreted-language zones):** `go build ./...` exit 0; `go test ./pkg/domain/...
./pkg/module/alert_pipeline/...` 10/10 pass (`TestDefaultCooldownConfig_DedupWindowMinutes` +
9 pipeline tests incl. `TestRun_DedupHit_ShortCircuits`); `mock-guard.sh` PASS; commit ancestry
`git merge-base --is-ancestor 43f4e3add main` confirmed.

**Verdict: APPROVED.** Round-1 deployment gap is genuinely closed — code (verified 2026-08-06),
deployment (verified 2026-08-22), and functional intent (verified 2026-08-22) all independently
reproduced. `.task_board.review[]` → `.task_board.done_verified[]`, `status: REVIEW →
DONE_VERIFIED`, `qa_verified_at`/`qa_verified_by: qa` stamped, `[QA] Review Record` appended to
`status_note`.
