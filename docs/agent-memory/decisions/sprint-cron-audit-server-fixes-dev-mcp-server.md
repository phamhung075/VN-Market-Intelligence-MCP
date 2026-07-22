# Decision Journal — Sprint cron-audit-server-fixes · dev-mcp-server

**Sprint goal:** Fix 3 server-plane findings from the 2026-07-22T15:48Z read-only cron audit (VPS data plane and sprint sequencing dispatched separately).
**Agent:** dev-mcp-server
**Started:** 2026-07-22

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-22
**task-id:** cron-audit-item-1 (4 dead Sunday jobs)
**what-done:** RAW-verified live cron_job_runs + mcpServerStartup rows; pinned root mechanism as node-cron's `recoverMissedExecutions` never bridging a process restart (only in-process event-loop lag), so a weekly job whose one window falls before the container comes back up silently loses the whole week — NOT a timezone/DOW bug.
**what-considered:**
- Blind re-register / jitter shift (audit explicitly warned this leaves cause intact)
- Switch cron library (croner/node-cron v4) — rejected, brownfield risk (already rejected in ARCH-CRON-SCHEDULER-RELIABILITY brief)
- Extend the EXISTING task-1430/1958a startup-catchup pattern to weekly cadence (chosen)
**why-decision:** Same mechanism already proven in production for daily jobs; minimal diff; `shouldRunCatchup` only needed one new `requiredUtcDay` param; runners looked up from `jobTable` (single source of truth, no duplicated logic).
**why-change:** no change from audit's ask — implements exactly what item 1 requested.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-22
**task-id:** cron-audit-item-2 (VPS SSH trigger tools fake success)
**what-done:** Found the 5 trigger_*_vps_fetch tools never called sshExec()/Bun.spawn AT ALL (not just blocked by the missing ssh binary) — they only string-built a command and appended false "will be executed/fire-and-forget" prose; bctcDebugTriggerHandler's own docstring said "(future: will SSH-trigger...)", confirming an unfinished feature, not a deliberate boundary.
**what-considered:**
- (a) wire real sshExec() + add ssh client to Dockerfile — VPS-side scripts already exist/tested, env vars already configured with a real mounted key, sshExec() already proven via vpsServiceRestartHandler
- (b) delete the 5 tools + sshExec path — touches ops's live flow docs cross-zone, removes a diagnostic capability with no compensating win
**why-decision:** Chose (a): lower total risk than it first appears (remote command contract already documented/tested), stays in-zone (Dockerfile lives in apps/mcp-server/), no cross-agent doc surgery. Added ticker charset sanitization (defense-in-depth) since wiring real execution would otherwise activate a latent injection risk dormant in the dead code.
**why-change:** discovered a 2nd layer verifying (a): `StrictHostKeyChecking=yes` + no pre-seeded known_hosts refuses every connection regardless of client presence — `restart_vps_service` could never have worked either. Fixed to `accept-new` (TOFU) in sshExec.ts rather than a build-time `ssh-keyscan` (rejected: hardcodes the VPS IP + makes image build depend on VPS network reachability).

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-22
**task-id:** cron-audit-item-3 (watchdog 81% blind)
**what-done:** RAW-verified which of the audit's "5 confirmed bespoke sites" actually lack telemetry — 2 (sscCheckerJob, dataAuditJob:weekly) already record via recordJobRun under a DIFFERENT job_name than the CRONS config-key name the audit used; only 3 (signalOutcomeJob, alertOutcomeJob, signalOutcomeResolution) genuinely have zero telemetry. Wired those 3 through jobRunRepo.wrapRun; added all 9 (4 Sunday + 2 misnamed-but-real + 3 newly-wired) to WATCHDOG_MANIFEST.
**what-considered:**
- Full expansion to all ~65 uncovered jobs — rejected: this file's own history shows wrong-key manifest entries produce false "never ran" alert spam; hand-verifying 65 entries is out of proportion for this session
- Targeted expansion to only the evidenced gap (chosen)
**why-decision:** Proportionate, RAW-verified, zero guessed job_names (WD-10/WD-11 both still green). Full-fleet coverage flagged as a separate follow-up, not silently attempted here.
**why-change:** discovered sscCheckerJob has been stale ~87 days live (unrelated pre-existing incident) — added to manifest (closes the exact "invisible silent death" gap item 3 describes) but did NOT chase its root cause (out of scope), flagged to PO instead.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-22
**task-id:** cron-audit-item-3 (ripple fix, found via full-suite run)
**what-done:** Full-suite run surfaced 5 pre-existing tests broken by the WATCHDOG_MANIFEST 16→25 widening: a hardcoded "exactly 16" sanity check + a SEPARATE, independent dashboard-facing SSOT (`cronStatusCompute.ts`'s `STATIC_JOB_NAME_MAP`, a "CN-1 hybrid 3-tier" CRONS-key→job_name resolver with its OWN hardcoded 16-pair map + a "1:1 exactly CANONICAL_WATCHDOG_JOB_NAMES" test invariant) that I had not touched but is coupled to WATCHDOG_MANIFEST's size.
**what-considered:**
- Add tier-1 entries only for the 2 jobs whose name tier-2's generic normalizer literally can't match (sscCheckerJob, dataAuditJob:weekly) — leave the other 7 to tier-2
- Add tier-1 entries for ALL 9 new jobs
**why-decision:** Chose ALL 9: `job_name_db` is memoized "per CRONS key for the lifetime of the process" (file's own R1 comment) — tier-2 resolution depends on a live DB snapshot at the MOMENT of first computation; if that first call happens before the job has ever recorded a row (fresh boot, or an earlier empty-DB test sharing the process), the WRONG tier-3 fallback gets cached forever. Tier-1 is the only cache-safe path. Verified empirically: my first attempt (2 tier-1 entries only) still failed 3 tests until I added all 9.
**why-change:** this ripple was not predicted by the audit or my own initial plan — found only by running the FULL suite (not just targeted files) before declaring done, per the mandatory G12 gate.
