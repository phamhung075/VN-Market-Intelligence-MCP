# Decision Journal — Sprint CADENCE-RATIONALIZATION-20260804 · developer

**Sprint goal:** Implement §8 items 1/2/4/6/7 of docs/architecture-briefs/2026-08-04-cadence-rationalization.md (user-greenlit), rows CADRAT-1/2/4/5/6. Zero CronCreate calls, fleet stays dormant.
**Agent:** developer
**Started:** 2026-08-04T20:15:00Z

**Note:** `sprint_goal.entries[status=active]` resolves to an unrelated stale sprint (COWORK-GUARANTEED-SLOT-CATCHUP, whose own developer journal is already over the 600L/36000B cap at 112L/40166B). Using this row-batch's own `.sprint` field (CADENCE-RATIONALIZATION-20260804, from the orch-state ready[] rows) as SPRINT_ID instead — matches prior-practice precedent of task/sprint-scoped journal files (e.g. sprint-FIX-SWEEPGUARD-*-developer.md) and avoids compounding an already-overcap unrelated file.

---

### STEP developer-S1 · developer · 2026-08-04T20:15:00Z
**task-id:** CADRAT-1-ALERT-COMMANDER-CADENCE-POLICY-ROWS
**what-done:** Appended 10 rows (alert-commander-market/critical × 5 calendar_status) verbatim from brief §8 item 1 to docs/data/cadence-policy.json; added T-11b/T-11c (10 cases) to DWF-phase1-cadence.test.ts mirroring T-11.
**what-considered:**
- only path: brief gives exact JSON, PO reconciliation note on FIX-COWORK-CADENCE-DANGLING-POLICY-ID explicitly overrides that row's conflicting 15/240 spec — copied brief verbatim, not the conflicting row.
**why-decision:** null+_cron_fallback:true is a strict no-op on live behavior (cron already governs, agent self-gates); 15/240 would be an unmeasured design change out of scope.
**why-change:** AC-6 (pin stale_warning=false) does not literally apply — evaluateCadence() is a pure table lookup with no stale/legacy branch of its own (that branch is one layer up in matchSlots()); documented this in a test-file comment instead of a no-op pin.

### STEP developer-S2 · developer · 2026-08-04T20:45:00Z
**task-id:** CADRAT-2-DB-INTEGRITY-PROBE-PREGATE-AND-SCHEDULE-SPLIT
**what-done:** New scripts/agents-flow/db-integrity-probe.sh (COUNT(*)-diff SKIP-SPAWN/SPAWN pre-gate, 17 tables, one docker sidecar call) + paired db-integrity-probe.test.sh (27 cases, 4/4 fail-open triggers); prepended brief's gate line verbatim to cron-db-data-integrity.md prompt; split its single job into Job A (15,45 2-9 * * 1-5) + Job B (15 22 * * *), 336/wk->87/wk.
**what-considered:**
- one docker invocation for all 17 tables (chosen) vs 17 separate invocations — chose one: matches cron prompt's "cheap AGGREGATE queries" framing, less docker overhead, order-checked parse so a schema drift/missing table fails closed into SPAWN not silent misalignment.
- write snapshot on every tick vs only on change/first-run/malformed (chosen the latter) — never overwrite on a sidecar-failure tick (nothing trustworthy to persist, mirrors auditor-tier1-probe.sh's own heartbeat rule).
**why-decision:** jq -n was NOT compact by default — caught via the "verdict is the ONLY stdout line" test (AC-4), fixed with -nc across all 4 emit sites before this was a real live defect.
**why-change:** no change from plan; live docker env in this session has no market_data volume mounted (different host context) — verified via docker-compose test-stub only, per AC's own test-seam design; noted as environment observation, not a script defect (script uses the exact sidecar command the cron doc already documents).

### STEP developer-S3 · developer · 2026-08-04T21:05:00Z
**task-id:** CADRAT-4-CRON-STANDALONE-TEAM-REARM-SKILL
**what-done:** New .claude/skills/cron-standalone-team/{SKILL.md,register.md} — 5-entry idempotency guard mirroring cron-cowork-team's thin shape; register.md Jobs 1/2 (db-data-integrity, post-CADRAT-2 2-job schedule) hold the probe-gated prompt spliced verbatim (diff-verified byte-for-byte against cron-db-data-integrity.md, not hand-retyped); Jobs 3-5 (agent-father/claude-manager-helper/code-janitor) ported from their own authoring docs. CLAUDE.md gained the /cron-standalone-team pointer line (AC-5). cron-detect-loop/{SKILL.md,register.md} untouched (git status clean, AC-4).
**what-considered:**
- extend cron-detect-loop (rejected, per PO's own pre-decision in the row) vs new skill (chosen) — row already resolved this; only remaining design choice was HOW to splice the long db-integrity prompt into register.md without hand-transcription risk.
- hand-retype the ~140-line db-integrity prompt into a register.md CronCreate call vs script-extract+splice from the live (CADRAT-2-updated) authoring doc (chosen) — hand-porting is the exact drift mechanism the row's own AC-2 warns against; used sed extraction + diff-verification instead.
**why-decision:** diff-verification (not just visual read) is the only way to actually prove "verbatim, zero hand-rewritten" for a 140-line block — ran it for both Job 1 and Job 2 splices, both byte-identical.
**why-change:** no change from plan. HARD CONSTRAINT compliance: zero CronCreate calls made — register.md's CronCreate blocks are markdown code-fence CONTENT (file bytes), never invoked as a tool call this session; grep-verified.

### STEP developer-S4 · developer · 2026-08-04T21:35:00Z
**task-id:** CADRAT-5-DEVTEAM-EXTENDED-IDLE-POLL-WIDEN
**what-done:** New verdict SKIP-WIDENED in dev-team-tick-preflight.sh — fires before ANY lock claim when a persisted consecutive-RUN-IDLE counter (new sole-written docs/data/dev-team-idle-widen-state.json) >= WIDEN_N=16 AND calendar_status (pressure-state.json, ENUM-gated vs the 5-value domain) is weekend/holiday; idle predicates re-read fresh every tick so real work always overrides. Wired into main.md's JUMP-TO table. Test file extended T37-T43 (7 cases, exceeds the 5 named ACs).
**what-considered:**
- literal 16x run_preflight loop to build the counter vs pre-seeding the state file via jq (chosen) — pre-seeding mirrors the existing signals-stale.db mtime fixture idiom and is far faster/clearer than looping.
- reuse RUN-IDLE's verdict string with a conditional exit code vs a NEW distinct verdict string (chosen) — silently changing RUN-IDLE's documented always-exit-1 contract would break existing callers; a new string is explicit and independently testable.
**why-decision:** WIDEN_N=16 chosen to equal gatherer-standard's own existing 480min weekend/holiday adaptive rate (cadence-policy.json) / 30min tick spacing — reuses an already-approved benchmark rather than inventing a new number.
**why-change:** caught + fixed a real regression DURING implementation, not after: moving the idle-check earlier (Step 1.5) meant _widen_write_counter now runs on every tick, including every pre-existing test — first full-suite run leaked a real write to the LIVE repo's docs/data/dev-team-idle-widen-state.json (confirmed via `ls`, then deleted). Fixed by adding WIDEN_STATE_PATH/PRESSURE_STATE_PATH tmpdir defaults to run_case() so ALL 43 cases are hermetic, not just the 7 new ones. Also caught a bash `A || B && C` precedence bug (is_extended_calendar was dead-true on the OR's short-circuit) via a self-review re-read before writing tests — fixed with an explicit if/then before any test ran against it.

### STEP developer-S5 · developer · 2026-08-04T21:55:00Z
**task-id:** CADRAT-6-ORCH-SENTINEL-LITE-PREGATE
**what-done:** New scripts/agents-flow/orch-sentinel-lite-probe.sh — sources auditor-tier1-probe.sh and calls its OWN run_probe("suppress_heartbeat") verbatim for the ALL_GREEN check (zero re-invented predicate), layers a read-only freshness check against orch-sentinel-scorecard.md's EXISTING trailing OH-STATE run_ts field (no new write path added to orch-sentinel's own flow). Paired .test.sh (18 cases). Prepended the gate line to cron-orch-sentinel.md's MODE=LITE prompt only; MODE=FULL untouched, both cron exprs byte-unchanged (diff-verified).
**what-considered:**
- duplicate the 6 docker/curl/df/launchctl checks into a new script (rejected) vs source+call the existing run_probe() function directly (chosen) — sourcing is zero-drift by construction (literally the same function) and avoids ~600 lines of duplication.
- add a NEW heartbeat-write step to orch-sentinel's own flow (rejected, out of this row's file scope) vs reuse the scorecard's ALREADY-EXISTING run_ts field it writes on every real cycle (chosen) — zero new state, zero new writer, matches "not a re-invented predicate."
**why-decision:** fresh_threshold_minutes=2880 reused directly from auditor-tier1-probe.sh's own Tier-3 threshold (same daily cadence) rather than re-derived from scratch.
**why-change:** no change from plan. Live-smoke-tested the script against the real environment (read-only) before writing the mock test — caught a genuine live infra signal (rag-service mem-creep, unrelated pre-existing condition, not touched) confirming the sourced run_probe() wiring actually works end-to-end, not just against mocks.
