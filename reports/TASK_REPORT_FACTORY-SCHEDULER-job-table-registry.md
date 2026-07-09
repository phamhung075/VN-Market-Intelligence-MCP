## Task Report FACTORY-SCHEDULER-job-table-registry

**Gate:** Docker Microservice Code-Change Close Gate, Step 5 (docs/protocols/docker-deployment-runbook.md)
**Commit under review:** a25bdc617 — 79 `scheduleCron` blocks consolidated into declarative `schedulerJobTable.ts` (57 generic-loop + 22 bespoke via `registerBespokeJobs`) + `walEscalation.ts` extraction; `startScheduler.ts` 1257L→305L.
**Session:** gateway-blind (no `mcp__gateway__*` tools bound this turn) — all verification below is direct docker/git/sqlite/curl, no MCP mediation used.

### Verified (independently, not relayed)
- **Live job execution (not just registration):** queried `cron_job_runs` table directly (docker cp + host sqlite3). `askQueueCheckJob` (bespoke, non-generic-loop path) fired+succeeded 2x post-restart (00:12:00Z/00:12:01Z). 6 generic-loop jobs (vpsServiceHealthJob — real payload "polled=5 stored=5", intelligenceCycleJob, restartCadenceAlertJob, bctcQueueEnricherJob, deepFetchVpsJob, deepFetchMainJob) fired+succeeded 00:15:00-01Z. 18/18 runs since restart = `status=success`, 0 errors/crashed.
- **tests/lint/build re-run on current HEAD (not re-trusted):** `bun tsc --noEmit` 0 errors; `bunx eslint` clean on all 3 touched production files; `FACTORY-SCHEDULER-job-table-registry.test.ts` 15/15; all 6 directly-modified test files re-run fresh: 53/53 pass.
- **Equivalence re-verification:** re-ran dev-mcp-server's own scratch equivalence script (verified its `startScheduler.OLD.ts` baseline first byte-matches `a25bdc617~1`'s real git blob) — reproduced the single flagged non-literal-identifier case (`JOB_NAME_BREADTH_PERSISTER`), traced it to source myself: same imported constant (`"breadthHistoryPersisterJob"`), same single-source-of-truth file, used identically old and new. 79/79 confirmed.
- **No regression:** `/health` toolCount=183 unchanged; `/api/cron-status` 200 (layer_a_count=85, correctly cross-references `cron_job_runs`); `/dashboards/news-fetch/` + `/api/bctc-inspect` 200; container file content (`docker exec cat`) byte-identical to `git show a25bdc617:<path>` for all 3 touched scheduler files; `docker compose ps` 11/11 healthy, zero peer impact (only mcp-server restarted).
- **WAL health / signal closure:** WAL currently 4.0MB (grew naturally since ops's 1.2MB reading — normal sawtooth between `*/30` checkpoint marks), well under the 10MB HIGH threshold. `wal-escalation-1783551601546` (29.8MB origin) confirmed genuinely resolved.

### Blocking issue found (routes to ops, NOT developer — no code defect)
- `bash scripts/verify-deploy-sha.sh mcp-server` — **exit 1**, deployed `vn.market.git_sha` label = literal `"unknown"`. Reconfirmed against the explicit code-commit SHA (`a25bdc6172b6dcf7ad401dfc598d3cf872a01441`), not just default-HEAD — same failure either way, ruling out the benign HEAD-drift pattern seen in prior QA cycles on this project. Root cause: `docs/agent-memory/notebooks/ops.md`'s entry for this task's Step 1 ran `docker compose build mcp-server` with **no** `--build-arg GIT_SHA=...`, unlike every other task entry in the same file.
- Per `docs/protocols/docker-deployment-runbook.md`: "Any non-zero exit (SHA drift or label absent) = deploy is **BLOCKED**; do NOT declare the deploy complete."
- Functional risk: **none** — deployed code independently confirmed byte-identical to the target commit via direct content diff. This is an audit-trail/labeling gap only.
- Remediation (mechanical, ops-owned): `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" mcp-server && docker compose up -d --no-deps mcp-server && bash scripts/verify-deploy-sha.sh mcp-server` → confirm exit 0 → route straight to po (no re-qa needed, functional correctness already independently established here).

### verdict: CHANGES_REQUESTED → ops (process-gate fix, not a code/functional regression)

tests: 53/53 pass (all directly-touched files, re-run) + 15/15 (targeted registry test) | tsc: 0 errors | eslint: clean | equivalence: 79/79 confirmed
ddd: PASS (scheduler/ is the composition-root/interface layer — infra imports there are expected, not a domain→infra violation) | security: PASS (no process.env, no hardcoded secrets, env-var *names* only appear in log strings)

### Board state
`docs/data/orch/orch-state.json` `.task_board.review[]` id=`FACTORY-SCHEDULER-job-table-registry`: `status:"REVIEW"`, `next_agent:"ops"`, `rebuild_required:true`, `qa_verified_at`/`qa_verified_by` set. `.head` synced (`next_agent:"ops"`, `next_action` states exact remediation). Written via `scripts/orch-apply.sh` (Zod-validated, CAS-guarded).

Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-qa.md` §qa-S28.
Notebook: `docs/agent-memory/notebooks/qa.md` cycle-407.
