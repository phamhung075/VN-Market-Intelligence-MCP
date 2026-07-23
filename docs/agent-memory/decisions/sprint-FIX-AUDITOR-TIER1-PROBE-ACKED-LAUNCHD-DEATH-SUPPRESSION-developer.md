# Decision Journal — Sprint FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION · developer

**Sprint goal:** Standalone P1 FIX (no active sprint covers this scope) — stop the Tier-1 auditor
probe from re-tripping FAILURE + re-spawning system-auditor every ~30min tick on two already-
tracked, already-backlogged launchd deaths (docker-events exit-1, fleet-push exit-78).
**Agent:** developer
**Started:** 2026-07-23T18:52:00Z

---

### STEP developer-S1 · developer · 2026-07-23T18:57:00Z
**task-id:** FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION
**what-done:** Added a JSON ack ledger (`docs/data/auditor-launchd-ack.json`) + `_check_launchd_agents` label-exact-match suppression in `scripts/agents-flow/auditor-tier1-probe.sh`; a listed label's failure is reported "acknowledged" — if ALL unhealthy labels this pass are acked, the check still PASSes and overall verdict stays ALL_GREEN (detail names the acked labels for transparency).
**what-considered:**
- ALL_GREEN-remap (chosen): acked-only case resolves to `verdict=ALL_GREEN`. Zero change to the already-registered Tier-1 cron prompt (`.claude/skills/cron-detect-loop/register.md` Job 2), which already treats `ALL_GREEN AND heartbeat<=60min` as skip-eligible — takes effect immediately, no cron re-arm needed.
- New `ACKNOWLEDGED_DEGRADED` verdict enum: would require also editing register.md Job 2's prompt body AND re-arming the session's cron before it takes effect — higher risk, no compensating benefit since the task's own brief flags ALL_GREEN-remap as "lower-risk default".
**why-decision:** Task brief explicitly named ALL_GREEN-remap as lower-risk; verified register.md Job 2's live prompt text confirms `verdict=ALL_GREEN` is the exact (and only) trigger it already skip-checks on — no prompt drift risk either way.
**why-change:** No change from plan.

### STEP developer-S2 · developer · 2026-07-23T18:58:00Z
**task-id:** FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION
**what-done:** Verified passive-health valve (heartbeat write mechanics) is untouched — my change only alters `_check_launchd_agents`'s pass/fail predicate and a transparency note in `run_probe`'s ALL_GREEN `detail` string; `_write_heartbeat`, freshness math, and tier-2/3's suppress-heartbeat/read-pre-existing-value logic are byte-identical to before (T31/T32 dead-branch tests still green).
**what-considered:**
- Only path: the task's constraint #2 ("do not defeat ALL_GREEN+heartbeat>60min→spawn") is satisfied by construction — I never touched any code near `_write_heartbeat` or the freshness gate.
**why-decision:** Minimizing blast radius — the fix's whole purpose is "stop re-tripping FAILURE", not "change what counts as fresh"; touching the heartbeat/freshness logic would be scope creep with real regression risk to the tier-2/3 dead-branch fix that shipped 2026-07-16.
**why-change:** No change from plan.

### STEP developer-S3 · developer · 2026-07-23T18:59:00Z
**task-id:** FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION
**what-done:** Added `LAUNCHD_ACK_PATH` test seam; extended `auditor-tier1-probe.test.sh` with a default nonexistent-ledger override (keeps T1-T35 byte-identical since the real repo now ships a live ack ledger the default fallback would otherwise pick up) + T36-T39 covering acked-only/mixed/uncovered-ledger/all-healthy-with-ledger. 120/120 total PASS.
**what-considered:**
- Only path: same test-seam pattern the file already uses for `LAUNCHD_DIR_PATH`/`HEARTBEAT_FILE_PATH` — no new convention invented.
**why-decision:** Without the default-seam guard, T33 (fleet-push exit-78 fixture) would have silently flipped from FAILURE to ALL_GREEN the moment the real ack ledger file existed on disk — caught this via first full-suite run before adding new tests, confirmed 102/102 baseline green first.
**why-change:** No change from plan.
