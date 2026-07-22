# Decision Journal — cron-audit push/deploy sequencing · po

**Tick:** po/cron-audit-push-deploy-sequencing-20260722
**Input:** dev-mcp-server RETURN (~17:00Z) + `docs/agent-memory/decisions/sprint-cron-audit-server-fixes-dev-mcp-server.md`
**Started:** 2026-07-22T17:01Z

---

### STEP po-D1 · 2026-07-22 · PUSH GATE — withheld
**task-id:** BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA
**what-done:** Applied CANONICAL:PUSH-AUTONOMY-1 literally (`docs/policies/dev-standards.md` § Push Policy). Its gate is a 3-way AND. RAW-verified each rather than taking the dispatch summary's word: (a) supervised cascade dev+QA+PO — **FAIL**, no QA leg existed; (b) targeted/merge-gate suite 0 fail — PASS; (c) pre-push `bun tsc --noEmit` — PASS, re-run independently, rc=0, zero diagnostics.
**what-considered:**
- Push anyway on the strength of strong green evidence (tsc clean + zero net new failures). Rejected: PUSH-AUTONOMY-1 removed the USER from the loop, not QA. Substituting PO judgement for the QA leg re-invents an unwritten gate, which is the exact failure PUSH-AUTONOMY-1 was written to stop — in the opposite direction.
- Treat 42 full-suite failures as an absolute bar. Rejected: gate text says "targeted/merge-gate suite", not full-suite; a literal full-suite reading is permanently unsatisfiable here and would deadlock every future push.
**why-decision:** Exactly one condition hard-fails, and it is the one that would have caught the defect I found in STEP po-D3. Withholding is load-bearing, not ceremonial.
**why-change:** dev-mcp-server itself withheld and deferred to router/PO; I concur with its instinct but on the gate's own terms rather than "ad-hoc dispatch" discretion.

### STEP po-D2 · 2026-07-22 · Verified the load-bearing "41 pre-existing" claim
**task-id:** BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA
**what-done:** Did not accept the claim. Ran the FULL suite at both ends of an isolated `git worktree` pinned to base `3509a3974`. BASE 14600 pass / 42 fail / 1205 files; HEAD `752d76477` 14651 pass / 42 fail / 1209 files. Fail sets 41/42 byte-identical; the one swap is bidirectional flake (`1288-poll-news-shape` passes 4/4 isolated, twice). Separately A/B'd the highest-risk cluster — tool-REGISTRATION tests — because the change touched `debugTriggerRoutes.ts` + 5 `*DebugTriggerTool.ts`, i.e. the registration surface: 39 pass / 0 fail at BOTH.
**what-considered:**
- Name-check failing tests against touched files (what dev-mcp-server did). Rejected as sufficient: a regression can surface in a test file that is not itself touched but imports touched code — precisely the registration cluster's shape.
- Trust the reported 41. Rejected: my count was 42, so the figure is not reproducible and no exact-count argument is admissible.
**why-decision:** A full-suite red count is the ideal hiding place for one new regression. Only a base-vs-head A/B of the whole suite can exclude it. Verdict: characterisation CONFIRMED, arithmetic not; **zero** net new regressions, +51 passing tests, +4 test files.
**why-change:** none — this is the check the dispatch asked me to satisfy myself on.

### STEP po-D3 · 2026-07-22 · accept-new ADJUDICATED — premise disproved
**task-id:** FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION
**what-done:** `sshExec.ts` justifies relaxing `StrictHostKeyChecking` yes→`accept-new` with "could never have succeeded for ANY caller since inception". Git says otherwise: `b741c5634` (task-1779c, **QA APPROVED**, 2026-04-30) shipped BOTH `openssh-client` AND `ENTRYPOINT ["/entrypoint.sh"]`, which ssh-keyscan-seeds `known_hosts` at container start. `6165aa3b4` ("rebase Dockerfiles from Debian to Ubuntu") silently deleted both, unmentioned in its message. `apps/mcp-server/entrypoint.sh` is still tracked and clean but referenced by nothing — dead code for ~2.5 months. So it worked at inception and was regressed by an unrelated rebase.
**what-considered:**
- Router's proposal: pre-seed the host key at build time (`ssh-keyscan` in the Dockerfile). Rejected — it couples image builds to VPS reachability, and the VPS is unreachable *right now*, so it would break the very rebuild we need.
- Restore 1779c's entrypoint verbatim. Rejected — it is `set -e` + `exit 1` on keyscan failure; with the VPS down that converts a VPS outage into total mcp-server unavailability (all 88 crons + the whole MCP tool surface).
- Keep `accept-new` permanently. Rejected — `docker-compose.yml` mounts nothing at `/root/.ssh`, so `known_hosts` is ephemeral per container. That makes it TOFU on EVERY recreate (the container restarted twice today), not once — materially weaker than the code comment claims.
**why-decision:** RULING — `accept-new` stands as a **stopgap only** (reverting today just re-breaks the tool and nothing is verifiable while the VPS is dark). Durable fix = restore the already-QA-approved entrypoint wiring and put `yes` back, with one mandatory change: degrade non-fatally on keyscan failure. Also noted dev-mcp-server's "hardcodes the VPS IP" objection is moot — the IP is already hardcoded in `docker-compose.yml` in four places.
**why-change:** Router framed this as a one-Dockerfile-line tradeoff. It is not a tradeoff: the stronger option already existed, was signed off, and was silently reverted. That reframes the work from "new hardening" to "un-revert + add a guard so a rebase cannot drop it again".

### STEP po-D4 · 2026-07-22 · Rebuild dispatch HELD (deviation from dispatch)
**task-id:** OPS-REBUILD-MCP-SERVER-OPENSSH
**what-done:** Minted the ops row with exact single-service commands, the baseline image ID `sha256:c5a2c0f7…`, and the three hard constraints (no `down && up`; never `--force-recreate` without `--build`; must verify the image ID actually changed) — but set it BLOCKED behind QA rather than dispatching.
**what-considered:**
- Dispatch ops now as instructed. Rejected on the dispatch's own logic: its item 3 establishes the SSH probe cannot be satisfied while the VPS is dark, so the rebuild's headline capability is unverifiable today; meanwhile it would deploy 17 un-reviewed source files and restart the container hosting all 88 crons. Deploying un-QA'd code is strictly more invasive than the push I just withheld — refusing one while doing the other is incoherent.
- Next Sunday window is 2026-07-26, so the Sunday-catchup fix has slack; nothing is lost by sequencing QA first.
**why-decision:** Correct order is QA → push → CI green → rebuild → (after the VPS user gate clears) real-data verify. I also have no spawn tool, so I could not have dispatched ops directly regardless — the handoff is `head.next_agent`.
**why-change:** Deviates from dispatch item 2, which said to dispatch ops this tick. Flagged explicitly in the RETURN.

### STEP po-D5 · 2026-07-22 · sscCheckerJob incident minted
**task-id:** FIX-CRON-SSCCHECKERJOB-DEAD-87D
**what-done:** Grepped the board first — no prior art for the staleness (only `BCT-OBS-02-FIX`, a different concern about its WORK-channel notification). Corroborated dev-mcp-server's ~87-day finding independently: live `get_cron_health` (7-day window) lists 80 jobs and `sscCheckerJob` is absent entirely. That absence IS admissible here — unlike the telemetry-blind bespoke jobs flagged in the tracker's `known_unknown` — because the job does call `recordJobRun`, so it would have appeared.
**what-considered:** Filing it as a plain "restart the cron" FIX. Rejected — the dispatch asked what else shares its failure mode, and the answer is a class, not an instance.
**why-decision:** Enabling defect is a NAME-BINDING gap: telemetry recorded under a `job_name` that differs from the `CRONS` key the watchdog and dashboard resolver key on, so the job can die with nothing alarming. dev-mcp-server hand-patched the two known cases into two separate hand-maintained maps that had already drifted apart. Row therefore carries a class-fix clause (assert every CRONS key resolves to a job_name that actually appears in `cron_job_runs`) plus a `do_not_absorb` warning that the manifest widening made the job VISIBLE, not ALIVE.
**why-change:** Also surfaced `dataAuditJob:weekly` as possibly a SECOND live-dead job (absent from the same report while `dataAuditJob:daily` is present) — recorded as verify-before-assuming rather than asserted.
