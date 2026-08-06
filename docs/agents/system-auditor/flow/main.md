<!-- size-justification: ~793L — three-tier dispatcher; Tier-1 detail extracted to tier1-probe.md; Tier-2/Tier-3 bodies remain inline (extraction sprint deferred per PO, see backlog T-06); full change history in git log. +2L: TIER=4 PILOT row added to AUDIT_TIER extraction + Tier Dispatch tables (2026-07-18), per brief docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md §8 EDIT-2 — dispatches to handlers.md §Step D-FLEET, own one-off claim, bypasses §Step 0d tick-boundary election. +6L (2026-07-25): TIER=5 row added to AUDIT_TIER extraction + Tier Dispatch tables + Step 0d fire-election branch — dispatches to flow/page-freshness.md (D-PAGE, kept fully out of this file per lazy-load discipline, unlike Tier-2/3's still-deferred inline extraction). +7L (2026-07-25, coordinator review #2): Step 0d TIER=5 FIRE_TICK comment expanded — CronCreate fires machine-local not UTC, the literal cron expression must not be hardcoded here (drifts at DST changeover); Tier-3's own 02:00Z label (line ~111) carries the same unverified-against-that-defect risk, flagged but NOT fixed here — out of scope, that cron is already live-armed. FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1 2026-07-29: Tier-2/3 Heartbeat Write section — added SOLE-WRITER + SHAPE CONTRACT callout (cites `docs/policies/dev-standards.md` CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER, states the tier-1-vs-tier-2/3 semantic split, points at the new `scripts/git-hooks/pre-commit` enforcement) (+6L). FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED 2026-07-29 (+~50L): DASHBOARD.md append is now a script actuator (`scripts/emit-dashboard-row.sh`, write+read-back, wired into the Tier-2/Tier-3 emit sites) instead of unscripted prose; OUTPUT-CONTRACT counters (`signals_posted`/`telegram_sent`/`signal_queue_rows_written`/`dashboard_rows`) are now mechanically parsed from a per-cycle marker log by `scripts/audit-output-contract.sh` instead of hand-composed, with an independent `.signal_queue` cross-check and a symmetric RETURN-headline consistency check; corrects the stale `signal-dashboard` skill pointer (that skill governs `.signal_queue`, not DASHBOARD.md, and was never a real write path for this artifact). FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD 2026-07-30 (+~18L): new §CALLER-INSTRUCTION PRECEDENCE (AUD-CP-1) block before Tier Dispatch + mandatory RETURN-block CONTRACT-CONTRADICTION line. UC-ASL-P6 2026-07-31 (0 new lines): RETURN-block `NEXT: po (via DASHBOARD.md)` corrected to `NEXT: po (via orch-state.json .signal_queue row)` — grep confirmed no po flow file ever reads DASHBOARD.md; po's real consumer path is the `.signal_queue` row per this file's own §Anomaly Reporting → DASHBOARD Append (721-723) and the agent's `inter_agent.sends_to`. Rest of this file's DASHBOARD.md mentions were already correctly disambiguated by the prior FIX-AUDITOR-DASHBOARD-APPEND fix, verified live, no further edits needed here. FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH 2026-08-05 (+5L): all 5 `emit-audit-signal.sh`/`audit-output-contract.sh` call sites in this file now pass `--cycle-tag "$FIRE_TASK_ID"` — closes the V1 cross-check's two structural bugs (minute-vs-second `.ts` compare; shared default `from="system-auditor"` picking up a peer tier's row), see `docs/policies/dev-standards.md` CANONICAL "Audit OUTPUT-CONTRACT parser" entry. FIX-SYSAUDITOR-NOTEBOOK-COMPOSE-ACTUATOR 2026-08-06 (+~40L): commit `0fcc6a5d2` deleted a retained `## c44` heading and never wrote the claimed `c45` section (real data loss, hand-repaired `7628a878d`) — added Step 1a deterministic PRE-write heading-count snapshot + new Step 2a POST-write heading-count corruption check (BLOCKING, reverts via `git checkout --` on mismatch, independent of the compose step's own narration) as an interim backstop pending `scripts/notebook-compose.sh` (out of agent-father's `commit_zone`, flagged to developer via `docs/signals/2026-08-06-fix-system-auditor-notebook-compose-actuator-handoff.json`); added an explicit MANDATORY/NEVER-raw-git-commit callout at the Commit step (a bare `git commit` bypassing `auditor-notebook-commit.sh` tripped sweep-guard 3s before the corrupting commit, same cycle). Full analysis: `docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-blindspot.md`. FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR 2026-08-06 (+1L): AUDIT_TIER extraction list gets one new bullet cross-referencing the new writer-provenance discriminator spec (`flow/data-writer-provenance.md`) for the previously-undocumented `AUDIT_TIER=DATA` cron family — policy-only pointer, no dispatch-table rewire (the actual actuator lives out-of-zone in `cron-db-data-integrity.md`, see that new file §4). FIX-AUDITOR-DURABILITY-STEP0B-DETECTION 2026-08-06 (+~72L net, actual total 1058L — base "~793L" figure above has drifted across many prior deltas and is NOT renumbered here, same accepted convention as this header's own precedent): po_occurrence_7 correction — Step 0b gains Step 0b.1 (stale `.auditor-cycle-markers-*.tmp` orphan sweep, mtime>20min, reuses `scripts/emit-audit-signal.sh`'s existing 7-day dedup ledger, catches "won fire-election then died mid-run") + Step 0b.2 (schedule-based missing-cycle detection via `auditor-tier{2,3}-last-healthy.json` staleness for Tier-2/3, a conservative WARN-only OR'd heartbeat/notebook-heading check for Tier-1 with an explicitly documented residual gap on isolated single-tick Tier-1 losses, catches "died before the fire-election ever completed") + Step 0b.3 (stub sweep for the not-yet-existent `.auditor-cycle-draft-*.md` self-heal file, structure only, actuator lands in `FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL`). Also relocates the entire Notebook Write/Commit block (timestamp guard, Notebook Append Gate, compose Steps 1/2/2a, commit script call) from after OUTPUT-CONTRACT/Anomaly-Reporting to immediately after Tier-3 WORK Notification (§3b.1 of `docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md`) — pure reorder, EXCEPT Notebook Append Gate condition (b) was rewired from reading the (now-later-running) OUTPUT-CONTRACT line to a direct `$MARKERS_FILE` grep, an unavoidable consequence of the reorder, not a scope change. -->
# System Auditor — Main Flow

## PLAN-ONLY INVARIANT — NO DESTRUCTIVE OPS (AUD-ND-1)

This agent is a DETECTOR. It MUST NEVER perform infrastructure remediation.

### Forbidden operations (absolute, no exceptions)
- docker stop / docker kill / docker rm / docker restart (any service, any argument)
- docker compose down / docker compose up (any flags)
- kill / pkill / killall (any PID or process name)
- rm -rf of ANY live data directory (/app/data/, /root/, any DB path, any volume mount)
- Any shell command that terminates, removes, or restarts a running container or process

### Positive contract — the ONLY permitted response to any CRITICAL/WARN finding
1. Emit a typed signal row via `post_agent_signal` (signal_type: signal_feedback — live enum contract; carry check_id + severity + dedup_key in payload).
2. Append a DASHBOARD.md row via `scripts/emit-dashboard-row.sh` (status=OPEN, severity, zone_owner, check_id) — full contract at §Anomaly Reporting (all tiers) → DASHBOARD Append below. Target is `docs/data/DASHBOARD.md`, the LIVE, tracked dashboard — NOT `docs/handoffs/DASHBOARD.md` (a stale phantom, untouched since 2026-07-20, chartered for removal under UC-ASL-P6) and NOT `.claude/skills/signal-dashboard/` (that skill's name is misleading: it governs `.signal_queue.rows[]` in orch-state.json, a wholly different artifact, and has no DASHBOARD.md write path at all).
3. Send a BUG channel Telegram alert (dedup 7d per dedup_key, severity ≥ WARN).
4. EXIT the cycle.

Detection is the job. Remediation is ops/developer's job, triggered via DASHBOARD/BUG.

### Incident anchor (do not remove)
AUD-ND-1 regression history:
- 2026-05-31 21:08Z: false ENOSPC → docker stop mcp-server → 9 min outage (commit 9c381ed3)
- 2026-06-01 09:00–15:19 UTC: false-positive docker stop during VN trading hours → Monday intraday price data PERMANENTLY DESTROYED (irreversible — live-only pipeline, no backfill)

---

**Tools:** `docs/agents/tools/package/system-auditor.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
- `AUDIT_TIER` variable: `1` | `2` | `3` (default: `3` if not set)
- Live system state (docker daemon, DB files, MCP server)

## Output
- Typed signals via `post_agent_signal`
- BUG channel alerts (severity ≥ WARN, dedup 7d per dedup_key)
- DASHBOARD.md rows for all WARN/CRITICAL findings — via `scripts/emit-dashboard-row.sh`, target `docs/data/DASHBOARD.md` (§Anomaly Reporting → DASHBOARD Append)
- Notebook section-append + prune (skill: notebook-write, ≤200L hard cap)
- `[OUTPUT-CONTRACT]` line — mechanically computed by `scripts/audit-output-contract.sh`, never hand-composed (§OUTPUT-CONTRACT below)

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `system-auditor`)

**Step 0b.1 — Stale-marker orphan sweep (FIX-AUDITOR-DURABILITY-STEP0B-DETECTION §3a — D-CYCLE-1, catches "won fire-election, then died mid-run"):**
Runs on EVERY tier's EVERY cycle, before any tier-specific work, mechanically, independent of which tier this invocation itself is running as. `$MARKERS_FILE` for THIS cycle does not exist yet at this point (created only after Step 0d below wins its own election) — this sweep only ever finds a PRIOR cycle's abandoned scratch file:
```bash
STALE_MARKERS=$(find "$PROJECT_ROOT/docs/agent-memory" -maxdepth 1 \
  -name '.auditor-cycle-markers-*.tmp' -mmin +20 2>/dev/null)
```
`+20` minutes comfortably exceeds Tier-1's own normal cycle time (observed: single-digit minutes even for extended multi-probes) while staying well under Tier-2's 4h gap — never fires on an in-progress sibling tier's cycle. Each `FIRE_TICK` is parsed directly from the filename `.auditor-cycle-markers-<FIRE_TICK>.tmp` — no reconstruction needed. For each hit:
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "D-CYCLE-1" \
  --category-type "auditor_cycle_loss" \
  --severity "WARN" \
  --summary "auditor cycle lost tick=<FIRE_TICK> — orphaned marker, mid-run death" \
  --detail-json '{"title":"auditor_cycle_loss: <FIRE_TICK>","detail":"orphaned .auditor-cycle-markers-<FIRE_TICK>.tmp found stale (mtime > 20min) — a prior cycle won its fire-election and never reached its own final step","fire_tick":"<FIRE_TICK>","dedup_key":"auditor-cycle-loss:<FIRE_TICK>"}'
```
Reuses the SAME `docs/data/auditor-dedup-ledger.json` 7-day ledger every other check in this flow already goes through — a retried sweep on the same orphaned tick within 7 days is a `SKIP-dedup`, not a re-alert (no new dedup bookkeeping invented here). On any non-`ABORT` marker outcome (`OK`/`SKIP-dedup`/`OK-escalation-bypass`) → `rm -f` the stale marker file (the loss is now durably recorded in the signal_queue row; safe to reclaim the scratch file). On `ABORT` → leave the file in place for the next cycle's sweep to retry — never delete the only evidence of a loss on a failed emit. This sweep is NOT itself an entry in THIS cycle's own `$MARKERS_FILE` and does not count toward this cycle's own `signals_posted` in §OUTPUT-CONTRACT below (it is bookkeeping about a PAST cycle) — paste its `[emit-signal]` marker into THIS cycle's notebook entry only if one gets written anyway.

**Step 0b.2 — Schedule-based missing-cycle detection (po_occurrence_7 correction — D-CYCLE-2, catches "died before the fire-election ever completed"):**
This is the shape Step 0b.1's marker sweep is structurally blind to, since a cycle that dies before Step 0d ever runs never creates a marker file at all — confirmed live 2026-08-06: a 7th occurrence did 233s of real Tier-1 probe work and reached a correct verdict, then died leaving ZERO artifact of any kind, not even an orphaned marker.

For Tier-2 and Tier-3, `docs/data/auditor-tier{2,3}-last-healthy.json`'s `last_healthy_at` is a reliable "a real cycle completed" signal — per §Tier-2/3 Heartbeat Write below it advances on EVERY Tier-2/3 cycle regardless of HEALTHY/DEGRADED/CRITICAL verdict, so its staleness is unambiguous evidence of a gap:
```bash
NOW_EPOCH=$(date -u +%s)
for N in 2 3; do
  HB_FILE="$PROJECT_ROOT/docs/data/auditor-tier${N}-last-healthy.json"
  HB_EPOCH=$(jq -r 'try (.last_healthy_at | fromdateiso8601) catch empty' "$HB_FILE" 2>/dev/null)
  [ -z "$HB_EPOCH" ] && continue   # no baseline file yet — never alarm on a missing file
  CADENCE=14400; [ "$N" = "3" ] && CADENCE=86400   # tier-2: 0 */4 * * * ; tier-3: 0 2 * * * (fixed daily)
  GAP=$(( NOW_EPOCH - HB_EPOCH ))
  [ "$GAP" -gt $(( CADENCE * 2 )) ] && echo "[SCHEDULE-GAP] tier-${N} last_healthy_at stale by ${GAP}s (cadence ${CADENCE}s) — flag D-CYCLE-2"
done
```
For Tier-1, no equivalent UNCONDITIONAL per-cycle marker exists yet — `docs/data/auditor-tier1-last-healthy.json` is written exclusively by `scripts/agents-flow/auditor-tier1-probe.sh`'s pre-spawn gate and ONLY on its own `ALL_GREEN` verdict (§Tier-2/3 Heartbeat Write SOLE-WRITER contract below); a sustained-but-alive DEGRADED streak legitimately leaves it stale for hours without any cycle ever having been lost. Treat it as a wide, conservative, WARN-only secondary signal, OR'd with the most recent `### Audit Run Tier-1` entry already loaded from the notebook at Step 0b above (also legitimately silent on ALL_GREEN, per §Notebook Append Gate) — take its paired `## c<NNN> · <YYYY-MM-DDThh:mmZ>` heading timestamp, convert via the same `fromdateiso8601` idiom, and use whichever of the two sources is MORE RECENT as `T1_LAST_EPOCH` (either source refreshing suppresses the alarm; BOTH absent → no baseline yet, skip, never alarm):
```bash
T1_HB_EPOCH=$(jq -r 'try (.last_healthy_at | fromdateiso8601) catch empty' "$PROJECT_ROOT/docs/data/auditor-tier1-last-healthy.json" 2>/dev/null)
# T1_NB_EPOCH: parse the most recent "## c<NNN> · <ts>" heading paired with a "### Audit Run Tier-1"
# sub-heading in the notebook text already read at Step 0b — same fromdateiso8601 idiom, empty if none.
T1_LAST_EPOCH="${T1_NB_EPOCH:-}"
[ -n "${T1_HB_EPOCH:-}" ] && { [ -z "$T1_LAST_EPOCH" ] || [ "$T1_HB_EPOCH" -gt "$T1_LAST_EPOCH" ]; } && T1_LAST_EPOCH="$T1_HB_EPOCH"
[ -n "$T1_LAST_EPOCH" ] && [ $(( NOW_EPOCH - T1_LAST_EPOCH )) -gt 10800 ] && echo "[SCHEDULE-GAP] tier-1 stale by $(( NOW_EPOCH - T1_LAST_EPOCH ))s (6x 30min cadence = 3h) — flag D-CYCLE-2"
```
**Known, accepted limitation (do not silently over-claim coverage):** this Tier-1 check only reliably catches a SUSTAINED gap (multiple consecutive dead ticks, ~3h+). An ISOLATED single lost Tier-1 tick sandwiched between two healthy neighbours — the exact po_occurrence_7 shape — is NOT detectable from state alone: no per-tick append-only log exists, only overwriting heartbeat/notebook snapshots, so the immediately-following healthy tick erases the only evidence a gap existed. Closing that residual gap needs a per-tick append-only attempt log — out of scope for this task, flagged as a candidate follow-on, not implemented here.

**Emit (one call per flagged tier — reuses the SAME dedup-ledger as Step 0b.1 above):**
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "D-CYCLE-2" \
  --category-type "auditor_cycle_missing" \
  --severity "WARN" \
  --summary "auditor tier-<N> cycle possibly missing — no completion evidence in <gap_hours>h (cadence <cadence_hours>h)" \
  --detail-json '{"title":"auditor_cycle_missing: tier-<N>","detail":"no auditor-tier<N>-last-healthy.json / notebook evidence of a completed tier-<N> cycle in <gap_hours>h (expected cadence <cadence_hours>h)","tier":"<N>","dedup_key":"auditor-cycle-missing:tier<N>:<current-expected-tick-boundary-per-Step-0d-formula>"}'
```
`dedup_key` is rounded to the CURRENT expected tick boundary for tier N (same `*/30` / `0 */4` / fixed-`02:00`-daily arithmetic already defined in §Step 0d below — reused here, not a new mechanism) so a persisting gap re-alerts once per newly-missed tick, never every single Step 0b invocation within the same tick.

**Step 0b.3 — Stale-draft-file sweep (STRUCTURE ONLY, D-CYCLE-3 reserved — actuator lands in `FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL`):**
Scaffolds the sweep for the future `.auditor-cycle-draft-<FIRE_TICK>.md` self-heal scratch file (§3b.2 of `docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md`, written by `.claude/skills/notebook-write/SKILL.md` once `FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST` lands). That write path does not exist yet, so this is currently a guaranteed no-op:
```bash
STALE_DRAFTS=$(find "$PROJECT_ROOT/docs/agent-memory" -maxdepth 1 -name '.auditor-cycle-draft-*.md' -mmin +20 2>/dev/null)
[ -n "$STALE_DRAFTS" ] && echo "[STALE-DRAFT] found (no actuator yet, logged only): $STALE_DRAFTS"
```
`FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL` fills in the actual self-heal here (compose the already-written draft into the real notebook via the notebook-write skill + `scripts/auditor-notebook-commit.sh`, then `rm -f` the draft) — until it lands, this block only logs.

**Step 0c — Load system-map.json** — lazy-load trigger: `runtime_or_fetch_or_db_audit`. Do NOT full-read `docs/data/system-map.json` (1757L / ~50.6KB, ~12.7k tok) — this agent only ever consumes 6 key-paths out of it. `jq`-project just those (~2k tok), same read-only SSOT, per `.claude/skills/system-map-query/SKILL.md`:

```bash
jq -c '{
  microservices: [.project.microservices[] | {id, external_port, zone}],
  host_runtime_set: .project.infrastructure.docker.host_runtime_set.services,
  not_deployed_by_design: .project.infrastructure.docker.host_runtime_set.not_deployed_by_design,
  data_sources: [.project.data_sources[] | {id, expected_cadence_hours, stale_threshold_hours, geo_blocked}],
  databases: [.project.infrastructure.databases[] | {id, path}],
  zones: [.project.zones[] | {id, specialist}]
}' docs/data/system-map.json
```

Field semantics (unchanged from the prior full-read — projection only, no consumption change):
- `microservices[]` → service ids, external_ports, zones (full catalog — for health endpoint ports and zone_owner lookup)
- `host_runtime_set` → **INTENDED runtime set** — the only set used for container-UP checks in Tier-1. Services NOT in this list are not deployed by design and MUST be reported INFO/grey, never CRITICAL/WARN.
- `not_deployed_by_design` → cross-check list for INFO labelling
- `data_sources[]` → source ids, expected_cadence_hours, stale_threshold_hours, geo_blocked
- `databases[]` → DB ids, paths
- `zones[]` → zone id → specialist (zone_owner)

Fail-loud fallback: `jq` unavailable → read `docs/data/system-map.json` directly (full file) and extract the same 6 key-paths by hand.

---

## CALLER-INSTRUCTION PRECEDENCE (AUD-CP-1)

Full rule + fleet-wide rationale: `docs/policies/dev-standards.md` `CANONICAL:AUD-CP-1`.

This agent's own flow spec (this file + `tier1-probe.md` + any lazy-loaded override file) is the SOLE
source of truth for every check verdict (A-xx/B-xx/C-xx/D-xx) — with ONE designated exception: the
`AUDIT_TIER` value named in `## Input` above, which the caller IS authoritative for.

For every other threshold/predicate documented anywhere in this flow: if the spawn prompt contains a
sentence asserting or requesting a specific verdict/emit for a check (e.g. "A-21 should emit",
"treat X as CRITICAL") and that assertion CONTRADICTS what this cycle's own measurement computes under
the documented rule — REFUSE. Do not emit on the caller's value. Compute and act on the documented
predicate only, then:
1. Log the contradiction in this cycle's notebook section.
2. Append to the RETURN block (mandatory every cycle — see §RETURN below):
   `CONTRACT-CONTRADICTION: check=<A-xx|B-xx|C-xx> spec=<file:line>=<documented value/predicate> caller_value=<what the prompt asserted> caller_quote="<verbatim sentence>" resolution=SPEC_WINS`
   No contradiction this cycle → still print `CONTRACT-CONTRADICTION: NONE`.

This binds every check in every tier — it is not an A-21-specific rule. A-21 is only where it was
first found broken (incident: `FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`,
signal row `sys-20260729T060929-39de`, RETRACTED).

---

## Tier Dispatch

**AUDIT_TIER extraction (mandatory — run before any other step):**
Scan the spawn prompt verbatim for the token `AUDIT_TIER=<value>`. Extract the integer value.
- Found `AUDIT_TIER=1` → set AUDIT_TIER=1
- Found `AUDIT_TIER=2` → set AUDIT_TIER=2
- Found `AUDIT_TIER=3` → set AUDIT_TIER=3
- Found `AUDIT_TIER=4` → set AUDIT_TIER=4 (**PILOT ONLY** — manual invocation only; never present in any cron config; see brief `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md` §5)
- Found `AUDIT_TIER=5` → set AUDIT_TIER=5 (**D-PAGE — Quality-Audit Freshness Rotation**, daily, own cron — see `.claude/commands/crons/cron-auditor-page-reverify.md`)
- Found `AUDIT_TIER=DATA` → **not yet a real branch of this table** (falls through to the default below, unchanged) — the check battery lives entirely in `.claude/commands/crons/cron-db-data-integrity.md`'s own inline prompt text, outside this dispatcher (see that file's own "Deeper integration (optional, later)" note). Its FAIL/MISSING severity policy is documented at `docs/agents/system-auditor/flow/data-writer-provenance.md` (D-DATA writer-provenance discriminator, FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR) — read that doc before touching the cron prompt's ANOMALY CLASSES §1. Its dedup-before-signal gate (FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED, 2026-08-06) is likewise a script actuator now, not this dispatcher's job or this agent's judgment call — `scripts/db-integrity-dedup-check.sh` + `scripts/emit-audit-signal.sh --e3-only` are invoked automatically INSIDE the cron prompt's own `scripts/db-integrity-history-append.sh` RECORD call; see that cron prompt's own "SIGNAL WRITE + DEDUP-ENFORCEMENT" section, never re-implement dedup logic here.
- Not found or unrecognized value → **default AUDIT_TIER=3** (log: `"[TIER-DISPATCH] AUDIT_TIER not set — defaulting to 3"`)

The extracted tier value MUST propagate to:
1. The tier-dispatch branch below (determines which checks run)
2. The notebook cycle entry heading (the `Tier-N` label in `### Audit Run Tier-N` MUST match this value, not an assumed value)
3. The RETURN line (`tier-N` token)

- **TIER=1** → run §Tier-1 Runtime Ping only → skip all other steps → notebook (label: Tier-1, gated — see §Notebook Append Gate) → RETURN
- **TIER=2** → run §Tier-2 Freshness Sweep only → skip all other steps → notebook (label: Tier-2, gated — see §Notebook Append Gate) → RETURN
- **TIER=3** → run §Tier-1 + §Existing Doc/Memory Audit (steps 1–6) + §Tier-3 DB Integrity → notebook (label: Tier-3, gated — see §Notebook Append Gate) → RETURN
- **TIER=4** → **PILOT ONLY, manual invocation — not present in any cron config.** Skip §Step 0d Fire-Time Election below (tier-4 pilot uses its own one-off `pilot-run-<N>` claim inside the handler instead — see `docs/agents/system-auditor/handlers.md` §Step D-FLEET Trigger, not the tick-boundary election) → run §Step D-FLEET handler (`docs/agents/system-auditor/handlers.md` §Step D-FLEET) only → skip all other steps → notebook (label: Tier-4-PILOT, gated — see §Notebook Append Gate) → RETURN
- **TIER=5** → run §Step 0d Fire-Time Election (tier=5 branch, fixed daily UTC tick) → lazy-load `docs/agents/system-auditor/flow/page-freshness.md` (D-PAGE — Quality-Audit Freshness Rotation) only → skip all other steps → notebook (label: Tier-5-D-PAGE, gated — see §Notebook Append Gate) → RETURN

---

## Step 0d — Fire-Time Election (P3 — TASK_1994)

<!-- P3-FIRE-ELECTION: runs AFTER AUDIT_TIER extraction, BEFORE any tier-specific work.
     Each tier has its own cron expression → its own TICK boundary → its own cron task_id.
     task_kind="sprint-task" (consistent with SF-1 and existing sprint-task enum).
     TTL=600s; no heartbeat. Explicit release at end of each tier's work body.
     On election LOSS: EXIT cleanly (another session already leads this tick for this tier).
     Spec: addendum §A.5 (tier flow-slugs), §C (P3-AF-1-c), §D (TTL + no heartbeat). -->

```
# Compute FIRE_TICK and audit_task_id based on AUDIT_TIER:

if AUDIT_TIER == 1:
  # cron expression: */30 * * * * (boundary minutes: :00, :30)
  CURRENT_MIN_SA=$(date -u +%M)
  BOUNDARY_MIN_SA=$(( (CURRENT_MIN_SA / 30) * 30 ))
  FIRE_TICK=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' $BOUNDARY_MIN_SA)Z")
  FIRE_TASK_ID = "cron:auditor-t1:" + FIRE_TICK

elif AUDIT_TIER == 2:
  # cron expression: 0 */4 * * * (boundary hours: 00, 04, 08, 12, 16, 20)
  CURRENT_HR_SA=$(date -u +%H)
  BOUNDARY_HR_SA=$(( (CURRENT_HR_SA / 4) * 4 ))
  FIRE_TICK=$(date -u +"%Y-%m-%dT$(printf '%02d' $BOUNDARY_HR_SA):00Z")
  FIRE_TASK_ID = "cron:auditor-t2:" + FIRE_TICK

elif AUDIT_TIER == 3:
  # FIRE_TICK target: fixed 02:00 UTC daily (this line is UTC-native, trustworthy
  # regardless of scheduler mechanics — same pattern as Tier-5 below). The underlying cron
  # expression that achieves this real UTC time is machine-local (⚠️ CronCreate fires local,
  # NOT UTC) and lives in .claude/commands/crons/cron-system-auditor.md (CEST/CET dual form,
  # switches at DST changeover) — do not hardcode a bare "H M * * *" here, it would silently
  # go stale twice a year. FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS (2026-08-06):
  # before this fix a bare `0 2 * * *` cron literal fired ~00:00 UTC (CEST) / ~01:00 UTC (CET),
  # so this FIRE_TICK stamped a tick-id 2h AFTER the sweep actually ran — now corrected, the
  # cron and this literal are in sync.
  FIRE_TICK=$(date -u +"%Y-%m-%dT02:00Z")
  FIRE_TASK_ID = "cron:auditor-t3:" + FIRE_TICK

elif AUDIT_TIER == 5:
  # FIRE_TICK target: fixed 03:30 UTC daily (this line is UTC-native, trustworthy
  # regardless of scheduler mechanics). The underlying cron expression that achieves
  # this real UTC time is machine-local (⚠️ CronCreate fires local, NOT UTC) and lives
  # in .claude/commands/crons/cron-auditor-page-reverify.md (CEST/CET dual form,
  # switches at DST changeover) — do not hardcode a bare "H M * * *" here, it would
  # silently go stale twice a year. Offset-from-Tier-3/D4-N framing was dropped:
  # those siblings' 02:00Z/03:00Z labels originally carried no machine-local disclaimer;
  # Tier-3's own has since been fixed (FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS,
  # 2026-08-06, see the Tier-3 branch above) — D4/D-N's 03:00Z label is derived from Tier-3's
  # process and inherits that same fix; not independently re-verified here.
  FIRE_TICK=$(date -u +"%Y-%m-%dT03:30Z")
  FIRE_TASK_ID = "cron:auditor-t5:" + FIRE_TICK

fire_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              FIRE_TASK_ID,
  task_kind:            "sprint-task",
  owner_agent:          "system-auditor",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tier": AUDIT_TIER, "tick": FIRE_TICK}
})

if fire_result.claimed == false:
  fire_peer = fire_result.current_holder.owner_client_session
  if fire_peer == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant (restart within same session mid-tick) — renew + proceed
    log "[system-auditor] fire-election RE-ENTRANT tier=" + AUDIT_TIER + " tick=" + FIRE_TICK
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: FIRE_TASK_ID, owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # proceed with tier work
  else:
    log "[system-auditor] fire-election SKIP tier=" + AUDIT_TIER + " tick=" + FIRE_TICK + " — peer=" + fire_peer
    call_tool(server="vn-market", tool="send_telegram", arguments={
      channel: "work",
      message: "[system-auditor] Tier-" + AUDIT_TIER + " fire-election SKIP tick=" + FIRE_TICK + " (peer session leads)"
    })
    EXIT   # clean exit — no audit work; no orphan signals
# else: claimed=true → won the election → proceed with tier work
# Release FIRE_TASK_ID at end of tier's notebook-write + commit step (see each tier's end-of-cycle).

# FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.4: renewal heartbeat for the cross-session cron-registration
# marker (.claude/skills/cron-detect-loop/SKILL.md Step 1c). Fires on every tier's every cycle that
# reaches this point (won election OR re-entrant — never on the SKIP/EXIT branch above). Best-effort,
# no-op if this session doesn't own it. dev-team/flow/preflight-fallback.md carries the same
# addition for cron-registration:detect-loop; multiple flows heartbeating the same marker is
# harmless/idempotent (whichever fires most recently wins).
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:detect-loop",
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```

**Release convention:** call `task_release(task_id=FIRE_TASK_ID, owner_client_session=$CLAUDE_CODE_SESSION_ID)` at the very end of the tier's cycle (after notebook write + commit step). This is the final step before RETURN. TTL=600s is the crash-safety backstop; explicit release is the normal exit path.

**Cycle Markers Log init (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED):** immediately after winning the fire-election (never on a SKIP/EXIT path), initialize the per-cycle marker scratch file:
```
MARKERS_FILE="$PROJECT_ROOT/docs/agent-memory/.auditor-cycle-markers-${FIRE_TICK}.tmp"
: > "$MARKERS_FILE"
```
Every `[emit-signal]` / `[emit-dashboard]` / `[post-agent-signal]` marker produced anywhere below this point gets appended to `$MARKERS_FILE` **in addition to** the existing "paste verbatim into the notebook" requirement — this is not a replacement, both happen. `$MARKERS_FILE` is the mechanical input to §OUTPUT-CONTRACT's `scripts/audit-output-contract.sh` call; it is scratch (never itself an artifact) and is removed (`rm -f "$MARKERS_FILE"`) at the very end of the cycle, after that script has run.

---

## Tier-1 — Runtime Ping

→ **lazy-load:** `docs/agents/system-auditor/flow/tier1-probe.md` (full probe protocol: probe.sh execution, RAW-PROBE fence, A-01..A-32 verdict rules, emit schema).

**Evidence-collection mandate (FIX-AUDITOR-EVIDENCE-INTEGRITY):**
Run `bash docs/agents/system-auditor/probe.sh` ONCE. Paste verbatim stdout into the notebook under `### RAW-PROBE:` fenced block. ALL container/health verdict lines MUST reference this block. Anti-carry: NEVER copy container/health lines from a previous notebook section — they must come from the current-cycle RAW-PROBE block only.

---

## Tier-2 — Freshness Sweep

**Wall time target: < 300s. Scope: cron fire gaps, per-source fetch freshness, VPS routes, news/signals freshness.**

### Cron Fire Check (A-29)
```
call_tool(server="vn-market", tool="get_cron_health", arguments={})
```
For each cron in system-map.json microservices[0].crons:
- Compute expected last-fire from schedule expression
- Compare to actual `last_run_ts` from get_cron_health response
- Flag if gap > 2× cadence
- Special case `bctcBatchSweep` (schedule: `0 9 25 1,4,7,10 *`): only check within 72h of expected fire date to avoid false alerts

### Per-Source Fetch Freshness (B-01 through B-07, B-11, B-12)
```
call_tool(server="vn-market", tool="get_pipeline_health", arguments={})
call_tool(server="vn-market", tool="get_vps_proxy_health", arguments={})
call_tool(server="vn-market", tool="get_vps_service_health", arguments={})
call_tool(server="vn-market", tool="get_rate_limit_status", arguments={})
call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})
call_tool(server="vn-market", tool="get_sla_status", arguments={})
```
For each source in system-map.json data_sources:
- Read `expected_cadence_hours` from system-map.json (never hardcode)
- Resolve the effective `stale_threshold_hours` for this source using the **SLA resolver** below (never hardcode)
- Compare `last_fetch_ts` from get_pipeline_health to the resolved effective threshold
- Skip foreign-flow check outside VN market hours (09:00–15:30 VN = 02:00–08:30 UTC M-F)
- CANONICAL calendar-aware cross-check (complements the flat cadence threshold above — weekend/
  holiday-aware, reuses the SAME trading-calendar module as the OHLCV pipeline, no hardcoded
  holiday list): `scripts/check-foreign-flow-freshness.sh` — exit 0 PASS / 2 STALE / 3 ERROR
  (ambiguity, never false-green). Origin: FFLOW-STALE-0723 (Vinahost VPS suspended-for-non-
  payment). Registry: `docs/policies/dev-standards.md` § Script Persistence.
- VPS proxy: all 7 routes must return `status: ok` (B-06, B-07)
- Rate limits: no source at 100% (B-12)

#### SLA Resolver — per-source effective threshold (SSOT: system-map.json .project.data_sources[].sla)

For every source, resolve the effective stale threshold as follows (read ALL values from system-map.json — never hardcode):

1. If the source has NO `sla` block → use `stale_threshold_hours` directly. Done.
2. If `sla.mode == "earnings-window-dependent"`:
   a. Read `sla.earnings_window.trigger_months[]` and `sla.earnings_window.window_days_after_quarter_end` from system-map.json.
   b. Compute today's UTC month (M) and day (D).
   c. **In-window test:** `M ∈ trigger_months AND D ≤ window_days_after_quarter_end` → use `sla.earnings_window.stale_threshold_hours`.
   d. **Out-of-window:** compute `hours_since_last_earnings_window_end + 0.5h grace` (dynamic, NOT the flat `sla.default_stale_threshold_hours`).
      - `last_earnings_window_end` = end-of-day (23:59 UTC) of `window_days_after_quarter_end` of the most recent prior trigger month.
      - Example: today=2026-06-25 → last window end = 2026-04-14 23:59 UTC → hours_since ≈ 1714h → threshold ≈ 1714.5h.
      - This prevents false-CRITICAL during the 10-week inter-quarter quiet period (FIX-BCTC-SLA-THRESHOLD-360).
   e. This replaces the flat `stale_threshold_hours` value for this source in this cycle.
3. Any other `sla.mode` value not listed above → use `stale_threshold_hours` (safe fallback) and emit a WARN log: `"[SLA-RESOLVER] unknown sla.mode '<value>' for source <id> — falling back to stale_threshold_hours"`.

Example evaluation for `bctc-discover` on 2026-04-10 (M=4, D=10, trigger_months=[1,4,7,10], window_days=14):
- M=4 ∈ [1,4,7,10] AND D=10 ≤ 14 → IN window → effective threshold = 24h (earnings-window active).

Example evaluation for `bctc-discover` on 2026-05-20 (M=5, D=20):
- M=5 ∉ [1,4,7,10] → OUT of window → last window end = 2026-04-14 23:59 UTC → hours_since ≈ 876h → threshold ≈ 876.5h.

Example evaluation for `bctc-discover` on 2026-06-25 (B-05/B-06 RAW scenario):
- M=6 ∉ [1,4,7,10] → OUT of window → last window end = 2026-04-14 23:59 UTC → hours_since ≈ 1714h → threshold ≈ 1714.5h.
- push-age=199.7h << 1714.5h → **PASS** (pipeline healthy idle). Never a CRITICAL.

**No prose-only BCTC staleness rule exists. This resolver IS the rule.**

#### BCTC Healthy-Idle Gate (B-05 — FIX-BCTC-SLA-THRESHOLD-360, sub-root c)

**MANDATORY: apply this gate BEFORE emitting any B-05 signal for `bctc-discover`.**

Event-driven push-age is NOT a crash signal. A large push-age for `bctc-discover` ONLY indicates a problem when the pipeline has PENDING work that is not being processed. When queue=0, the silence is BY DESIGN (off-season idle, not a fault).

Gate logic (execute when evaluating `bctc-discover` staleness):
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
# Gate 1: count actionable queue rows (pending / url_not_found / enrich_failed)
BCTC_ACTIVE=$(docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT COUNT(*) AS c FROM bctc_vps_queue WHERE status IN ('pending','url_not_found','enrich_failed')\").get();
console.log(r.c);
db.close();
" 2>/dev/null || echo "ERROR")

# Gate 2: VPS host liveness (from Tier-1 probe.sh output already in PROBE_OUT)
# Use the vps_uptime_seconds value from get_vps_proxy_health or Tier-1 host status.
```

**Verdict:**
- `BCTC_ACTIVE = ERROR` (DB unreachable) → skip gate, apply normal SLA threshold.
- `BCTC_ACTIVE = 0` (no pending work) AND host Tier-1 = UP → verdict: **HEALTHY IDLE** — log `"[B-05] bctc-discover: queue=0 host-up off-season — healthy idle, NOT stale"`. Do NOT emit any signal. Do NOT flag as stale.
- `BCTC_ACTIVE > 0` (work exists but pipeline silent) → apply normal SLA threshold comparison. If push-age > threshold → **STALE** (emit B-05 signal as normal).
- Host Tier-1 = DOWN (container missing) → skip B-05 entirely (already reported by A-xx CRITICAL).

**Rationale (feedback_bctc_lastpush_age_misread_as_crash):** vn-bctc-fetch is event-driven (quarterly). Push-age grows naturally between earnings seasons. Inferring host-down from push-age alone is wrong and caused recurring false alerts in B-05/B-06. Corroboration gate: queue + host state. Both must fail before CRITICAL.

### DB Freshness Spot Checks (C-06, C-07)
Resolve container name: `MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)` — abort check if empty (container down → CRITICAL via Tier-1 A-xx, do not duplicate here).
Run via bun:sqlite readonly exec — NEVER host-side sqlite3 (stale orphan at apps/mcp-server/data/):
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM market_messages WHERE sent_at > datetime('now','-3 hours')\").get();
console.log(r.cnt);
db.close();
"
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM agent_signals WHERE datetime(created_at) > datetime('now','-24 hours')\").get();
console.log(r.cnt);
db.close();
"
```
- C-06 pass: > 0; C-07 pass: > 0

### BCTC URL Shape (B-09)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM bctc_vps_queue WHERE source_url LIKE '%ssc.gov.vn%' AND status != 'skipped'\").get();
console.log(r.cnt);
db.close();
"
```
- 0 → PASS; > 0 → CRITICAL (B-09)

### Stale Pending BCTC (B-13)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM bctc_vps_queue WHERE status='pending' AND created_at < datetime('now','-72 hours')\").get();
console.log(r.cnt);
db.close();
"
```
- 0 → PASS; > 0 → WARN (B-13)
- NOTE: `deferred_infra` (historical HIST-VPS-BACKFILL, sources gone) and `blocked_pdf_extractor` (Q1-2026 gated on A-20 architect fix) are explicitly excluded — these are non-actionable by design.

### Emit per stale source (severity ≥ WARN)
**EMIT SEQUENCE — single blessed script call (UC-ASL-P2 — replaces the
old copy-pasted 3-step E-1/E-2/E-3 pseudocode; full contract + markers:
`scripts/emit-audit-signal.sh` header comment):**
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "<B-xx>" \
  --category-type "data_stale" \
  --severity "<CRITICAL|WARN|INFO>" \
  --summary "<source_id> stale <elapsed_hours>h (check <B-xx>)" \
  --detail-json '{"title":"data_stale: <source_id> (<B-xx>)","detail":"<source_id> stale <elapsed_hours>h (expected cadence <expected_cadence_hours>h, last fetch <last_fetch_ts>)","source_id":"<id>","category":"<category>","last_fetch_ts":"<ISO-8601>","expected_cadence_hours":"<from system-map>","elapsed_hours":"<computed>","zone_owner":"dev-mcp-server","dedup_key":"data_stale:<source_id>:<B-xx>"}' \
  --cycle-tag "$FIRE_TASK_ID"
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the E-1 (`post_agent_signal`) + E-2 (`send_telegram`, 7d dedup, severity-rank escalation bypass) + E-3 (signal-row append + POST-WRITE read-back, CAS-retry ×3) sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure. `ABORT ...` → do NOT count this source toward `signals_posted` in the OUTPUT-CONTRACT line (the parser in `scripts/audit-output-contract.sh` already enforces this — it never reads `signals_posted` from prose).

**DASHBOARD append (on any non-ABORT marker — always, even `SKIP-dedup`, per §Anomaly Reporting below):**
```bash
bash scripts/emit-dashboard-row.sh \
  --check-id "<B-xx>" --title "<source_id> stale <elapsed_hours>h" --severity "<CRITICAL|WARN|INFO>" \
  --location "<source/service>" --details "<what the check found>" --impact "<why it matters>" \
  --root-cause "<best-known cause>" --zone-owner "dev-mcp-server" \
  --signal-id "<the id= value parsed from this call's own [emit-signal] marker above>" \
  --dedup-key "data_stale:<source_id>:<B-xx>"
```
Paste the verbatim `[emit-dashboard] OK|ABORT|WARN ...` marker into the notebook AND `$MARKERS_FILE` too.

---

### BCTC Eval Sweep (D-BCTC-EVAL) — Tier-2 add-on

Call `GET /api/bctc-eval` (list endpoint). Compare each report's `overall_status` and per-stage `stage_statuses` against the previous snapshot stored in `docs/agent-memory/notebooks/system-auditor.md` (look for `BCTC-EVAL-SNAPSHOT:` block from last run).

For each report where ANY stage status changed since last snapshot, post delta to WORK Telegram:
```
[BCTC-EVAL] {ticker} {period}: stage N {stage_name} {old_status}→{new_status} ({metric}: {actual_value})
```
Example: `[BCTC-EVAL] FPT Q4-2025: stage 3 green→yellow (vn_diacritic_ratio dropped to 0.28)`

Status semantics: red = hard fail, yellow = soft warning, green = pass.

Also, for any report showing `overall_status = "red"` or any new `"yellow"`, append a signal row (UC-ASL-P2 — `--e3-only` mode: no E-1/E-2, matches today's behavior exactly; the distinct unconditional WORK-channel delta post above stays untouched, separate from this row-write):
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "BCTC-EVAL-<ticker>-<period>" \
  --category-type "bctc_eval_delta" \
  --severity "<HIGH|MED>" \
  --summary "<ticker> <period>: stage <N> <stage_name> <old_status>→<new_status>" \
  --detail-json '{}' \
  --e3-only \
  --cycle-tag "$FIRE_TASK_ID"
```
Paste the verbatim `[emit-signal] OK e3-only ...` (or `ABORT ...`) marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the signal-row append + POST-WRITE read-back (same anti-false-green check as all E-3 blocks, now enforced inside the script). No DASHBOARD.md row for this site — BCTC-EVAL deltas are HIGH|MED severity, not the CRITICAL/WARN AUD-ND-1 bucket §Anomaly Reporting's DASHBOARD Append governs; this is unchanged scope, not an oversight.

After sweep, **hold the snapshot in memory** (compact: `{report_id, ticker, period, overall_status, stage_statuses, computed_at}` per entry) — it will be written as the `BCTC-EVAL-SNAPSHOT:` block inside the end-of-cycle settled notebook write (AC-3). Do NOT write the notebook here. If endpoint returns non-200 → log `[D-BCTC-EVAL] endpoint unavailable — skipping sweep`, set snapshot=nil, continue (non-fatal).

---

### Improvement Proposal Emit (D-IMPROVE) — Tier-2 add-on

> Three-lane rule + proposal schema SSOT: `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §1 and §3.
> C-5 invariant: this entire block MUST fail-loud-SKIP on any bad candidate and NEVER abort the Tier-2 freshness sweep above. A throw mid-write must release the commit-mutex and leave no half-written proposal doc.

**D-IMPROVE-4 (cooldown guard — check FIRST):**
Before any write, list `docs/improvement-proposals/` for existing proposals whose `status` is `DRAFT` or `ARCHITECT-REVIEWED` and whose `weakness_id` matches the candidate's `check_id` or `signal_type`. If found and not yet resolved → log `"[D-IMPROVE] skip duplicate: {existing-id}"` and skip that candidate. Continue to next.

**D-IMPROVE-1 — Collect candidates:**
Query `improve_check_log` (inside mcp-server container) for entries with `dispatch_status IN ('shadow','worsened')` and `checked_at` within the last 24h. These are the signal-accuracy candidates.
Also inspect the Tier-2 stale-source findings emitted above: any source with `severity=CRITICAL` and no open FIX task in `docs/data/orch/orch-state.json .task_board` is a doc-level candidate.

**D-IMPROVE-2 — Per candidate (wrapped in try/catch; on any exception: release mutex if held, log "[D-IMPROVE] SKIP candidate {id}: {error}", continue to next candidate — DO NOT re-raise):**

  a. Classify lane per THREE-LANE rule (§1 of brief above). First-match-wins; lane-C tested first.

  b. Build the proposal document with **structured fields** (C-1 requirement — these are machine-readable, not free prose):
     ```markdown
     # Improvement Proposal IMP-{YYYYMMDD}-{slug}

     **Created:** {ISO-8601 UTC}
     **Created by:** system-auditor
     **Status:** DRAFT
     **weakness_id:** {check_id or signal_type}   ← dedup key

     ## target_agent
     {kebab-case agent id — e.g. "dev-mcp-server"}

     ## target_files
     - {absolute doc path 1}
     - {absolute doc path 2 if applicable}

     ## Weakness
     {one paragraph — what is wrong, concrete evidence pointer}

     ## Evidence
     - Source: {check_id / audit dimension}
     - Data: {metric, delta, dates}
     - Reproducibility: {how to reproduce}

     ## Proposed Change
     {description only — no implementation}

     ## Lane
     {LANE-A | LANE-B | LANE-C}

     ### Lane Rationale
     {why this lane}

     ## Success Signal
     {how to know the change worked}

     ## success_verified_by
     (to be filled after DONE — agent id + date)

     ## Rollback
     {how to undo within 7 days}
     ```
     FAIL-LOUD-SKIP if `target_agent` cannot be determined (no kebab-case agent id maps to the weakness) — log `"[D-IMPROVE] SKIP {id}: target_agent unknown"`, continue.
     FAIL-LOUD-SKIP if `target_files` is empty — log `"[D-IMPROVE] SKIP {id}: target_files empty"`, continue.

  c. Write `docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md` (path-explicit).
     Signal-row append (UC-ASL-P2 — `--e3-only` mode: no E-1/E-2, matches
     today's behavior exactly; full contract: `scripts/emit-audit-signal.sh`
     header comment):
     ```bash
     bash scripts/emit-audit-signal.sh \
       --check-id "{id}" \
       --category-type "improvement_proposal" \
       --severity "INFO" \
       --summary "{summary ≤120 chars}" \
       --detail-json '{}' \
       --e3-only \
       --cycle-tag "$FIRE_TASK_ID"
     ```
     Paste the verbatim `[emit-signal] OK e3-only ...` (or `ABORT ...`) marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the signal-row append + POST-WRITE read-back (same anti-false-green check as all E-3 blocks, now enforced inside the script). NOTE: the script's generic row shape sets `payload_ref: null` (proposal traceability lives in the `docs/improvement-proposals/IMP-{id}.md` doc itself, filed at step c above, not in the dashboard row) and auto-derives the row `id` from `--from-agent` — it no longer literally equals `{id}`. No DASHBOARD.md row for this site — INFO-severity improvement proposals are not the CRITICAL/WARN AUD-ND-1 bucket.
     **Commit (mutex-guarded):** → skill: `.claude/skills/commit-mutex/SKILL.md`
     own_paths: [`docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md`, `docs/data/orch/orch-state.json`]
     intent: `"chore(improve): D-IMPROVE emit {id}"`

     Executed protocol:
     1. `call_tool(server="vn-market", tool="task_claim", arguments={task_id:"commit-mutex:main", task_kind:"commit-mutex", owner_agent:"system-auditor", owner_client_session:$CLAUDE_CODE_SESSION_ID, ttl_seconds:60, payload:"{\"paths\":[\"docs/improvement-proposals/IMP-{id}.md\",\"docs/data/orch/orch-state.json\"],\"intent\":\"D-IMPROVE emit {id}\"}"})` — MCP error/db_unavailable → bug-telegram → SKIP commit → EXIT [C-2]; claimed=false, no current_holder → mechanism broken → bug-telegram → SKIP [C-2b]; contended (current_holder present) → backoff 6 retries ~125s → give-up → bug-telegram → SKIP.
     2. `git add -u docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md docs/data/orch/orch-state.json` (explicit -u form — avoids gitignore false-warn on tracked files).
     3. `git diff --cached --name-only` → if foreign path present: `git restore --staged <foreign>` (NEVER own paths); if still foreign after restore → release mutex → abort commit → log + bug-telegram.
     4. `git diff --cached --quiet` → if nothing staged: release mutex → skip commit → log.
     5. `git commit -m "chore(improve): D-IMPROVE emit {id}" -- docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md docs/data/orch/orch-state.json` (NEVER -a/-am, NEVER add -f — pathspec mirrors step 2's own_paths exactly, FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2).
     6. `call_tool(server="vn-market", tool="task_release", arguments={task_id:"commit-mutex:main", owner_client_session:$CLAUDE_CODE_SESSION_ID})` — ALWAYS, every exit path (success / skip / error).

**D-IMPROVE-3 — Log outcome:**
After processing all candidates, log `"[D-IMPROVE] emitted {N} proposals, skipped {M} (duplicates), skipped {K} (bad candidates)"`.
Append summary to this Tier-2 run's notebook entry.

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 2`, `PROJECT_ROOT` already set

---

## Existing Doc/Memory Audit (Tier-3 only — skip in Tier-1 and Tier-2)

### Early Exit Check
```bash
git -C "$PROJECT_ROOT" log --since="24 hours ago" --oneline 2>/tmp/sau_gitlog_err; GITLOG_EXIT=$?
```
- If `GITLOG_EXIT != 0`: read `/tmp/sau_gitlog_err`; fail-loud — log `"[DOC-AUDIT] git log FAILED (exit $GITLOG_EXIT): $(cat /tmp/sau_gitlog_err)"`, emit WARN signal via `post_agent_signal` (signal_type: signal_feedback, payload.check_id: DOC-AUDIT-GIT-ERR), send BUG-channel Telegram, **do NOT early-exit** — continue with doc audit as if commits exist (safe-side). This is a bare `post_agent_signal` call (not via `scripts/emit-audit-signal.sh` — no signal_queue row, no dedup): append `"[post-agent-signal] OK telegram=yes"` to `$MARKERS_FILE` if BOTH calls succeeded, else `"[post-agent-signal] ABORT <which call failed>"` — this is what lets `signals_posted` count this site without ever writing a signal_queue row (see `scripts/audit-output-contract.sh` header for why the two counters are allowed to differ).
- If `GITLOG_EXIT == 0` and output is empty: no commits in last 24h → check last-audit timestamp from notebook. Last audit < 12h AND no new commits → skip steps 1–6 (not the new DB checks below).
- If `GITLOG_EXIT == 0` and output is non-empty: commits exist → run steps 1–6 (no early exit).

NOTE — root cause of false "no commits" (FIX-AUDITOR-FLOW-TIER-EARLYEXIT, corrected 2026-06-07): the previous form used `origin/main` as a ref, which lags behind local main due to the repo's NO-branches policy where all commits land directly on local main. Using the stale `origin/main` ref re-triggers the exact false "no commits in 24h" early-exit that this task was opened to kill. The correct form queries local HEAD with `--since="24 hours ago"` (valid git date string, replacing the broken `"24h"`), reflecting the actual current state of the repository.

### 1. Memory integrity — `memory/MEMORY.md`
- Each entry: file exists, content current, not stale
- Broken pointers | index > 200 lines | contradictions → fix or delete

### 2. Knowledge hygiene — `docs/{policies,protocols,standards,references}/*.md`
- Hardcoded volatile values → replace with pointer to `docs/data/*.json`
- Verify JSON counts: `tool-registry.json` vs actual | `cron-registry.json` vs jobs | `stock-classification.json` vs watchlist

### 3. Agent validation — `.claude/agents/*.md`
- Dangling pointers (target missing) | refs follow tree-map | no hardcoded volatile counts

### 4. Size caps
- `CLAUDE.md` > 120 lines → move bloat to knowledge files
- `docs/data/orch/orch-state.json` `.task_board`: `jq '[.task_board.active_sprints[].tasks[]] | length'` > 80 → alert pm to run task-archive sub-flow
- `docs/data/orch/orch-state.json` `.sprint_goal.entries[]`: count > 15 → alert po to close/archive old sprint entries

### 5. DB health (legacy WAL check — now complemented by Tier-3 full checks)
Resolve container name first (same pattern as Tier-3). Run via bun:sqlite readonly exec — NEVER host-side sqlite3:
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
# WAL size: read from live volume via container fs
docker exec "$MCP_CTR" bun -e "
import { statSync } from 'fs';
for (const f of ['/app/data/market.db-wal', '/app/data/pdf_extractor.db-wal']) {
  try { const s = statSync(f); console.log(f, s.size); } catch { /* no WAL = fine */ }
}
"  # each WAL < 52428800 bytes (50MB)
# Integrity check
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const row = db.query('PRAGMA integrity_check').get();
console.log(row.integrity_check);
db.close();
"  # must = "ok"
```

### 6. Stats drift — `docs/data/project-stats.json` is GENERATED, never hand-edited
```bash
bun scripts/gen-project-stats.ts
```
`toolCount` and `cronJobCount` are derived from source. To update: run the generator and commit the result. Do NOT hand-edit these fields.

---

## Tier-3 — DB Integrity

**Wall time target: < 600s. Scope: container tooling + inter-service + full DB checks C-01 through C-16 + EPIPE.**

### Container Tooling — mcp-server (A-22 through A-24)
Resolve container name: `MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)` — if empty: CRITICAL for all A-22–A-28 (container down).
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" which pdftoppm
docker exec "$MCP_CTR" which tesseract
docker exec "$MCP_CTR" tesseract --list-langs 2>&1 | grep vie
```
- All must succeed (exit 0 / `vie` present) → CRITICAL if any missing

### Inter-Service Connectivity (A-25 through A-28)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" curl -sf http://stock-price:5000/health
docker exec "$MCP_CTR" curl -sf http://technical-analysis:5003/health
docker exec "$MCP_CTR" curl -sf http://alert-engine:5006/health
docker exec "$MCP_CTR" curl -sf http://pdf-extractor:5001/health
```
- Each must return HTTP 200

### EPIPE Crash Check (A-31)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker logs --since=30m "$MCP_CTR" 2>&1 | grep -c "EPIPE\|ECONNRESET"
```
- 0 or ≤ 2 → PASS (transient ok); > 2 → WARN

### BCTC PDF Landing (B-08)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" ls /app/data/pdfs/ | wc -l
```
- > 0 → PASS; 0 → WARN

### DB Write Integrity Checks (C-01 through C-16)
Read DB paths from system-map.json infrastructure.databases. The LIVE DB is bind-mounted from host `data/live/` to `/app/data` in the container (commit 5ba622eca, 2026-07-15 — retired the earlier docker named volume `vn-market-intelligence-mcp_market_data` so the DB survives VM rebuilds; do NOT re-create that named volume). This is NOT at `apps/mcp-server/data/` on the host (that path is a stale orphan test-fixture with 0-row tables). The `docker exec` invocation pattern below always resolves the correct in-container path regardless of the host mount mechanism — corrected 2026-08-06 (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT AC-6); this section's own query mechanism was never affected, only the prose description of the mount was stale.
Resolve container name once at the top of this section: `MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)`
Run all queries via bun:sqlite readonly exec — NEVER host-side sqlite3, NEVER open DB in write mode, NEVER stop/start containers:
```bash
# Invocation pattern (bun:sqlite readonly, static SQL only — NEVER interpolate dynamic values into shell line):
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/<db>.db', {readonly: true});
const r = db.query('<static SQL query>').get();
console.log(r);
db.close();
"
```

**Weekend/holiday guard for C-01, C-02, C-14 (last-trading-day semantics):**
Before running C-01/C-02/C-14, determine the last VN trading day:
```bash
# Compute day-of-week (0=Sun, 6=Sat) in VN time (UTC+7)
DOW=$(date -u -d "+7 hours" +%u 2>/dev/null || python3 -c "import datetime; print((datetime.datetime.utcnow()+datetime.timedelta(hours=7)).weekday())")
# If Sat (6) or Sun (0/7) → use '-3 day' window (covers last Fri); else use '-1 day' window
```
Use window = `'-3 day'` when DOW is Sat or Sun; use `'-1 day'` on Mon–Fri.
On Mon–Fri the auditor fires AFTER trading session; on weekend, last data was Friday.
If the check fires within 2h after market open (before new data lands), accept the previous trading day's count as passing.

**NULL-guard (FIX-AUDITOR-SQL-MODIFIERS — MANDATORY before any datetime-windowed check):**
Before evaluating a check, verify its modifier parses: `sqlite3 :memory: "SELECT datetime('now','<modifier>') IS NULL"`.
If result = 1 → the modifier is invalid. Do NOT run the check. Do NOT report count=0 as PASS or CRITICAL.
Instead: emit WARN signal via `post_agent_signal` (signal_type: signal_feedback, payload.check_id: `<C-xx>-INVALID-SQL`, payload.detail: "datetime modifier returned NULL"),
send BUG-channel Telegram, mark check as INVALID-SQL in notebook, and continue to next check.
Long-form modifiers are REQUIRED: `'-N hours'` / `'-N days'` — NEVER `'-Nh'` or `'-Nd'` (short form returns NULL in SQLite).

**ISO8601 format-safety wrap + C-08 TTL rebound (FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP, 2026-08-06):**
Some timestamp columns are written as a raw JS `.toISOString()` string (`"...T...Z"`), which sorts LEXICOGRAPHICALLY GREATER than SQLite's own `datetime('now', ...)` space-separated render at the very first differing byte ('T'=0x54 vs ' '=0x20) — an unwrapped `col > datetime('now', ...)` predicate then over-captures every row sharing the bound's date-part, regardless of the actual time-of-day digits that follow. `checkStaleAlerts.ts:19-30` already proved the fix (D-3/D-4) and confirmed SQLite's `datetime()` parses BOTH on-disk forms correctly — copy that pattern verbatim: wrap BOTH sides, `datetime(col) <op> datetime('now', ...)`.
Fleet audit (measured live against `data/live/market.db` / `data/live/pdf_extractor.db`, 2026-08-06, `sum(instr(col,'T')>0)/count(*)`) of every C-xx/B-xx check comparing a timestamp column to `datetime('now', ...)`:

| Column | Check(s) | T-format % | Verdict | Action |
|---|---|---|---|---|
| `financial_reports.parsed_at` | C-04 | 100% (257/257) | AFFECTED | wrapped |
| `market_messages.sent_at` | C-06 (+ dup snippet above) | 0% (0/1121) — schema `DEFAULT (datetime('now'))`, no app writer overrides it | NOT affected | unchanged |
| `agent_signals.created_at` | C-07 (+ dup snippet above) | mixed, single-digit-to-low-teens % T (app-set via JS `.toISOString()` at most insert sites, no schema default) | AFFECTED — worst case: same query silently applies two different comparison semantics across rows | wrapped |
| `alerts.triggered_at` | C-08 | 100% (107/107) — `alertStore.ts` sets `alert.createdAt` (`.toISOString()`) | AFFECTED | wrapped + window rebound (below) |
| `macro_indicators.fetched_at` | C-09 | 0% (0/1; n=1, `UNIQUE(country)` single row) — live writer `macroIndicatorRefreshJob.ts` uses the SQL literal `datetime('now')`; dormant writers (`push-tradingeconomics`/`push-gso` handlers, `tradingEconomics.ts` direct fetcher) use JS `.toISOString()` but are not today's source (`TRADING_ECONOMICS_API_KEY` unset) | NOT affected today — LATENT multi-writer risk noted for a future pass if the dormant writers activate; not fixed now (no live row to fix against, would be an unverifiable no-op diff) | unchanged |
| `bctc_vps_queue.created_at` | C-16 (+ B-13 dup) | 0% (0/614) — schema `DEFAULT (datetime('now'))`, no app writer overrides it | NOT affected | unchanged |
| `pdf_documents.extracted_at` | C-10, C-11 | 100% of populated rows (79/79 `success`-status rows; Python `.isoformat()` writer, microsecond precision) | AFFECTED | wrapped — SEPARATE pre-existing defect discovered in passing (NOT fixed here, out of this task's files/zone — pdf-extractor service): live `pdf_documents.status` values are `failed`/`processing`/`success`, never `'done'` — C-11's `status = 'done'` filter can never match any row (structural false-negative, unrelated to the ISO8601 class); C-10's `status = 'failed'` rows always have `extracted_at IS NULL` (extraction never completed), so its predicate is inert regardless of format. Flagged for a follow-up ticket. |
| `daily_ohlcv` (C-01/C-02/C-14) | — | N/A | out of this bug class — uses `date('now', ...)` against a DATE-only column (`date`), a different SQLite function family than `datetime('now', ...)`; `daily_ohlcv.updated_at` (2% T, separately measured) is not referenced by any check | unchanged |

**C-08 window bound (AC-1 — bounded to the agent_signals correlation-stub TTL, not 24h):**
`alerts` retention is ~30 days (`checkStaleAlerts.ts` D-4, UPDATE-only, never deletes) but the `agent_signals` correlation-stub co-write in `alertStore.ts`'s `storeAlerts()`/`storeAlertsFromCommander()` carries a FIXED 2-hour TTL (`datetime(alert.createdAt, '+2 hours')`, `alertStore.ts:223`) and is hard-purged by `cleanExpired()`, invoked from exactly ONE call site (`dataAuditJob.ts:274`, the once-daily off-hours `dataAuditJob:daily` cron). A 24h alerts window is therefore mathematically unsatisfiable for `expected=0`: any alert older than the 2h TTL necessarily has an `expires_at` already in the past, and once the daily GC sweep has run since, a physically-purged row — `expected=0` could only ever hold if zero alerts fired in the entire trailing 24h.
Fix: bound the alerts window to 2h — the SAME literal as the co-write TTL. Within this window, if the writer worked, the correlation stub CANNOT yet be expired (its own `expires_at` is `triggered_at + 2h`) and therefore cannot yet have been purged by the once-daily sweep — so any LEFT JOIN miss inside the 2h window is a genuine writer-guard failure, not a GC-timing artifact. This makes `expected=0` satisfiable by construction, independent of alert volume or GC cadence.
**AC-6 coverage confirmation — C-08 is fixed, NOT retired:** `checkOrphanAgentSignalsAlertId` (D-NEW2) checks the INVERSE direction only (`agent_signals.alert_id` set, no matching `alerts.id` — a dangling FK). It would NOT catch a NEW alerts-writer that bypasses `storeAlerts()`/`storeAlertsFromCommander()`'s co-write entirely (that failure mode produces zero `agent_signals` rows, not a dangling FK — nothing for D-NEW2 to join against). Retiring C-08 in favor of D-NEW2 alone would therefore trade this false positive for a real coverage blind spot. Keeping C-08 (fixed, satisfiable, format-safe) preserves both write-gap directions: C-08 = alerts→missing signal, D-NEW2 = signal→missing alert.

| check_id | DB | Query (run via `docker exec "$MCP_CTR" bun -e ...` — see invocation pattern above) | Pass |
|---|---|---|---|
| C-01 | market.db | `SELECT count(DISTINCT code) FROM daily_ohlcv WHERE date >= date('now',<WINDOW>)` — use `<WINDOW>` = `'-3 day'` on Sat/Sun, `'-1 day'` Mon–Fri | ≥ 25 |
| C-02 | market.db | `SELECT count(*) FROM daily_ohlcv WHERE date >= date('now',<WINDOW>)` — same weekend window as C-01 | > 0 |
| C-03 | market.db | `SELECT count(DISTINCT action_code) FROM financial_reports WHERE period_year=2026 AND period_quarter=1` | ≥ 26 (in Q1 window Apr–May) |
| C-04 | market.db | `SELECT count(*) FROM financial_reports WHERE datetime(parsed_at) > datetime('now','-7 days') AND extraction_confidence < 0.2` | ≤ 5 |
| C-05 | market.db | `SELECT count(*) FROM bctc_vps_queue WHERE source_url LIKE '%ssc.gov.vn%' AND status != 'skipped'` | 0 |
| C-06 | market.db | `SELECT count(*) FROM market_messages WHERE sent_at > datetime('now','-3 hours')` | > 0 |
| C-07 | market.db | `SELECT count(*) FROM agent_signals WHERE datetime(created_at) > datetime('now','-24 hours')` | > 0 |
| C-08 | market.db | `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.id = s.alert_id WHERE s.id IS NULL AND datetime(a.triggered_at) > datetime('now','-2 hours')` | 0 — window bound to the agent_signals correlation-stub TTL (2h), NOT 24h; see "C-08 window bound" rationale above table (AC-1) |
| C-09 | market.db | `SELECT (CASE WHEN cpi IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN gdp_growth IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN interest_rate IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN unemployment_rate IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN inflation_rate IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN trade_balance IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN current_account IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN government_debt IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN budget_deficit IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN manufacturing_pmi IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN consumer_confidence IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN retail_sales IS NOT NULL THEN 1 ELSE 0 END) as indicator_count FROM macro_indicators WHERE country='vietnam' AND fetched_at > datetime('now','-26 hours')` — NOTE: macro_indicators is country-keyed (UNIQUE(country)); ≥8 threshold was from old indicator-row design (a95c514a schema mismatch). Current active fetcher (TradingEconomics VPS, no API key required) writes cpi+gdp_growth+interest_rate. Threshold = 3 until TRADING_ECONOMICS_API_KEY wires all 12 cols. | ≥ 3 |
| C-10 | pdf_extractor.db | `SELECT count(*) FROM pdf_documents WHERE status = 'failed' AND datetime(extracted_at) > datetime('now','-24 hours')` | ≤ 2 |
| C-11 | pdf_extractor.db | `SELECT count(*) FROM pdf_documents WHERE status = 'done' AND datetime(extracted_at) > datetime('now','-48 hours')` | > 0 (earnings window) |
| C-12 | all non-empty DBs | `PRAGMA integrity_check` — skip DBs with 0-byte file (alert_engine.db, stock_price.db when empty) | `ok` |
| C-13 | container /app/data | via bun `statSync('/app/data/market.db-wal')` etc inside `docker exec "$MCP_CTR" bun -e ...` — check each WAL size | < 52428800 bytes (50MB) each |
| C-14 | market.db | top-3 `code` row share of `daily_ohlcv` using same `<WINDOW>` as C-01: `WITH t AS (SELECT code,count(*) c FROM daily_ohlcv WHERE date>=date('now',<WINDOW>) GROUP BY code ORDER BY c DESC LIMIT 3) SELECT round(100.0*sum(c)/(SELECT count(*) FROM daily_ohlcv WHERE date>=date('now',<WINDOW>)),1) FROM t` — skip (NULL result) if C-01 returns 0 (no data in window) | < 60% |
| C-15 | market.db | `PRAGMA table_info(financial_reports)` — check action_code, period_year, net_revenue, extraction_confidence present | all 4 present |
| C-16 | market.db | `SELECT count(*) FROM bctc_vps_queue WHERE status='pending' AND created_at < datetime('now','-72 hours')` | 0 — non-actionable rows use explicit statuses `deferred_infra` / `blocked_pdf_extractor` and are excluded by design (FIX-BCTC-VPS-QUEUE-STALE-TRIAGE) |

Also call:
```
call_tool(server="vn-market", tool="get_alerts", arguments={limit: 100})
```
Cross-reference results with C-08 (orphaned alerts). BCTC coverage (C-03/C-04) verified via DB queries above.

### Emit per failing check (severity ≥ WARN)
**EMIT SEQUENCE — single blessed script call (UC-ASL-P2 — replaces the
old copy-pasted 3-step E-1/E-2/E-3 pseudocode; full contract + markers:
`scripts/emit-audit-signal.sh` header comment):**
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "<C-xx>" \
  --category-type "db_integrity_breach" \
  --severity "<CRITICAL|WARN>" \
  --summary "<table> check <C-xx> failed (actual=<actual_value>)" \
  --detail-json '{"title":"db_integrity_breach: <table> (<C-xx>)","detail":"<description> — actual=<n>, expected=<n>","db_id":"<db from system-map>","table":"<table>","actual_value":"<n>","expected_value":"<n>","zone_owner":"<specialist from zones>","dedup_key":"db_integrity_breach:<table>:<C-xx>"}' \
  --cycle-tag "$FIRE_TASK_ID"
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the E-1 + E-2 + E-3 sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure. `ABORT ...` → do NOT count this check toward `signals_posted` in the OUTPUT-CONTRACT line.

**DASHBOARD append (on any non-ABORT marker — always, even `SKIP-dedup`, per §Anomaly Reporting below):**
```bash
bash scripts/emit-dashboard-row.sh \
  --check-id "<C-xx>" --title "<table> check <C-xx> failed" --severity "<CRITICAL|WARN>" \
  --location "<db>/<table>" --details "<description> — actual=<n>, expected=<n>" --impact "<why it matters>" \
  --root-cause "<best-known cause>" --zone-owner "<specialist from zones>" \
  --signal-id "<the id= value parsed from this call's own [emit-signal] marker above>" \
  --dedup-key "db_integrity_breach:<table>:<C-xx>"
```
Paste the verbatim `[emit-dashboard] OK|ABORT|WARN ...` marker into the notebook AND `$MARKERS_FILE` too.

### Tier-3 Roll-Up Signal
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "system-auditor",
  "to_agent": "po",
  "signal_type": "signal_feedback",
  "payload": {
    "title": "Tier-3 audit complete",
    "detail": "system_health_report tier-3: overall=<HEALTHY|DEGRADED|CRITICAL> — <N> anomalies",
    "tier": 3,
    "summary": { "services_up": "N", "services_down": "N", "cron_gaps": [], "sources_stale": [], "db_breaches": [] },
    "checks": { "A_runtime": {"pass": "N", "warn": "N", "critical": "N"}, "B_fetch": {"pass": "N", "warn": "N", "critical": "N"}, "C_db": {"pass": "N", "warn": "N", "critical": "N"} },
    "overall": "HEALTHY|DEGRADED|CRITICAL",
    "new_anomalies": [],
    "dedup_skipped": "N"
  }
})
```
Bare `post_agent_signal` call (no signal_queue row — same shape as DOC-AUDIT-GIT-ERR above): append `"[post-agent-signal] OK telegram=no"` to `$MARKERS_FILE` on success (this roll-up call does not itself send Telegram — that is the separate WORK Notification below), or `"[post-agent-signal] ABORT <detail>"` on failure.

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 3`, `PROJECT_ROOT` already set

### Tier-3 WORK Notification
```
call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "[system-auditor] Tier-3 complete — N anomalies (C critical, W warn, I info)"})
```

---

## Notebook Write — Durable Checkpoint (FIX-AUDITOR-DURABILITY-STEP0B-DETECTION §3b.1)

**Repositioned (2026-08-06) to run IMMEDIATELY after tier checks conclude, ahead of Anomaly Reporting/
DASHBOARD-append/OUTPUT-CONTRACT below** — this shortens the at-risk span between "findings known" and
"findings durably landed" per `docs/architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-
persistence-lifecycle.md` §3b.1. Signals/DASHBOARD rows are already emitted INLINE during the tier
checks themselves (not deferred to the section below), so this reorder does not touch that
already-durable path — only the composing-and-committing of the notebook narrative moves earlier.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/system-auditor.md`, ALWAYS get current UTC via:
  ```bash
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

### Notebook Append Gate (P1-IDLE-AUDITOR-NOTEBOOK-GATE, 2026-07-04 — RC-IDLE-LOOPS)
Decide BEFORE Step 1 whether this cycle writes the notebook at all. Check the three counters already produced this cycle:
- (a) new-finding: the `N` in "Anomalies: N new (C/W/I)" above is > 0 (dedup-skipped known anomalies do NOT count — they are not new).
- (b) new-signal: at least one non-`ABORT` `[emit-signal]` line already appended to `$MARKERS_FILE` this cycle — `grep -cE '^\[emit-signal\] (OK|OK-escalation-bypass|SKIP-dedup|OK e3-only|OK no-telegram) ' "$MARKERS_FILE"` > 0. Computed DIRECTLY from this cycle's marker log (same set `scripts/audit-output-contract.sh`'s `signal_queue_rows_written` counter parses later) rather than from the OUTPUT-CONTRACT line, since OUTPUT-CONTRACT now runs AFTER this gate (§3b.1 reorder above) instead of before it.
- (c) state-change: this cycle's overall Status (HEALTHY|DEGRADED|CRITICAL) differs from the `Status:` line of the most-recent same-tier entry already loaded in memory at Step 0b.
(a) OR (b) OR (c) true → proceed to Step 1 below exactly as written (happy path, unchanged).
All three false → genuine ALL_GREEN cycle: SKIP Step 1 and Step 2 below only — no `Write()` call, notebook file stays byte-identical to HEAD. Log `"[NOTEBOOK-GATE] SKIP no-new-finding/signal/state-change"`, then fall through unchanged to the **Commit** call below (still runs every cycle): with nothing written to disk, `git add` stages nothing for the notebook path, so the script's own no-staged-changes check (L196-197) is what performs the final no-op (`[auditor-commit] SKIP no-staged-changes`) — zero notebook diff, zero commit.

**Notebook write** — AC-3 settled-write (ONE write) per skill: `.claude/skills/notebook-write/SKILL.md` (AC-1, AC-2, AC-2a immutability invariant, AC-3, AC-5). Runs ONLY when the gate above passed.

Step 1 — Compose in memory (NO file write yet). Ladder order below is
MANDATORY and matches `.claude/skills/notebook-write/SKILL.md` AC-2/AC-2a/AC-3
(reconciled 2026-07-29, `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`)
— trim-own-section-first, THEN drop whole oldest blocks in a loop until the
3-section steady state is reached. NEVER edit, compact, or re-summarise a
RETAINED prior section's content to pay for cap pressure (AC-2a immutability
invariant) — every section that survives this cycle must be byte-identical
before and after, or the pre-commit hook `_check_notebook_immutability` will
reject the commit.
a. Capture a deterministic PRE-write snapshot via bash FIRST (a real tool
   call, not narrated — Step 2a below diffs against this, independent of
   whatever the compose step claims it did):
   ```bash
   NB_PATH="docs/agent-memory/notebooks/system-auditor.md"
   PRE_HEADINGS="$(grep '^## ' "$NB_PATH")"
   PRE_COUNT=$(printf '%s\n' "$PRE_HEADINGS" | grep -c '^## ' || true)
   ```
   Then read `docs/agent-memory/notebooks/system-auditor.md` fully into memory.
b. Identify preamble (before first `## `) and all `^## ` section boundaries.
c. Build the new section (≤60L, trimmed to this cap BEFORE anything else below runs):
   ```
   ## c<NNN> · <YYYY-MM-DDThh:mmZ>
   ### Audit Run Tier-N (HH:MM–HH:MM UTC YYYY-MM-DD)
   - Tier: N | Services: N checked | Sources: N checked | DB checks: N
   - Anomalies: N new (C critical, W warn, I info) | M dedup-skipped
   - Status: HEALTHY | DEGRADED | CRITICAL
   ```
   `<NNN>` MUST be a literal incrementing counter continuing from the highest
   existing `c<NNN>` in the file — NEVER `$CLAUDE_CODE_SESSION_ID` /
   `owner_client_session` or any fragment of a session UUID (skill AC-1;
   `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE` — this exact substitution is the
   confirmed root cause of the `## ad265f86 · ...`-style header leak observed
   2026-07-29). If Tier-2 cycle and snapshot ≠ nil: append
   `BCTC-EVAL-SNAPSHOT:` sub-block (compact JSON array, ≤10L) within this new
   section, counting toward the 60L section cap.
d. WHILE (section count, new section included) >3: drop the LAST `## ` block
   (bottom = oldest) in memory (heading + content to next `## ` or EOF),
   recounting after each drop. Repeat until ≤3 sections remain. Ordering
   convention: sections are NEWEST-FIRST; the bottom section is always the
   oldest. A single drop-and-stop is NOT sufficient if the file entered the
   cycle already over 3 sections — loop until the steady state is reached.
e. Insert the new section at TOP of in-memory body, immediately after preamble
   (before the first existing `## ` block). Sections are NEWEST-FIRST: newest
   entry goes to the top, oldest stays at the bottom. Every other retained
   section keeps its position shifted only — its TEXT is untouched.
f. Count in-memory lines. If still >200L after d–e (only possible when 3
   sections at ≤60L each plus preamble still exceed 200L): drop the LAST
   `## ` block (bottom = oldest), recount; repeat until ≤200L or only
   preamble+1 section remain. This is a BACKSTOP — if c and d were followed
   correctly it should almost never fire.
g. In-memory body is now the final settled content (≤200L guaranteed, every
   retained section byte-identical to its Step 1a pre-write form).

Step 2 — Single settled write (ONE call, PostToolUse fires exactly once):
```
Write(path="docs/agent-memory/notebooks/system-auditor.md", content=<settled body from Step 1>)
```
AC-5 gate after write: `wc -l < notebook.md` → if >200: fix Step 1 and re-write once.

<!-- NB-AUDITOR-SETTLED-WRITE: replaced two-write pattern (append then trim) with AC-3 single settled write. BCTC-EVAL-SNAPSHOT folded into this write (was a separate early write in D-BCTC-EVAL — now held in memory until here). PostToolUse hook sees ≤200L exactly once. -->

**Step 2a — Deterministic post-write corruption check (MANDATORY, BLOCKING).**
Interim backstop for `FIX-SYSAUDITOR-NOTEBOOK-COMPOSE-ACTUATOR` (2026-08-06)
until `scripts/notebook-compose.sh` lands (pending, flagged to developer —
see `docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-
compose-actuator-and-immutability-blindspot.md`). Catches the exact
`0fcc6a5d2` shape — a retained heading vanishing from staged content with NO
corresponding line-count shrink, self-reported as success — BEFORE any
commit is attempted, using a count derived from `PRE_COUNT` (Step 1a), never
from the compose step's own narration of what it dropped:
```bash
POST_HEADINGS="$(grep '^## ' "$NB_PATH")"
EXPECTED_DROPS=$(( PRE_COUNT + 1 - 3 )); [ "$EXPECTED_DROPS" -lt 0 ] && EXPECTED_DROPS=0
ACTUAL_DROPS=$(comm -23 <(printf '%s\n' "$PRE_HEADINGS" | sort -u) <(printf '%s\n' "$POST_HEADINGS" | sort -u) | grep -c '^## ' || true)
if [ "$ACTUAL_DROPS" -lt "$EXPECTED_DROPS" ] || [ "$ACTUAL_DROPS" -gt "$((EXPECTED_DROPS + 1))" ]; then
  echo "[notebook-compose-guard] ABORT: pre=$PRE_COUNT expected_drops=$EXPECTED_DROPS actual_drops=$ACTUAL_DROPS — heading-count mismatch, corruption suspected. Reverting."
  git checkout -- "$NB_PATH"
fi
```
(`+1` tolerance on the upper bound covers the rare Step 1f 200L-backstop
dropping one extra oldest section.) If `[notebook-compose-guard] ABORT`
printed: the working tree is ALREADY reverted to HEAD — do NOT proceed to
Commit below this cycle (nothing was ever staged, so there is nothing to
un-stage). Send BUG-channel Telegram (`[system-auditor] notebook-compose-
guard ABORT — heading-count mismatch pre=<n> expected=<n> actual=<n>,
reverted; this cycle's notebook entry was skipped`); log
`[NOTEBOOK-GATE-ABORT]` on the NEXT cycle's write. Continue the rest of this
flow unaffected — a caught-and-reverted mismatch is not a fatal error. If no
ABORT line printed, continue to Commit below as normal.

Then:
**Commit (mutex-paired blessed script — FIX-AUDITOR-COMMIT-MUTEX-SKIP, 2026-07-03):** the previous
narrated claim/add/verify/commit/release sequence was non-deterministically SKIPPING the mutex
claim (flow-step drift on prose is unreliable for a hard invariant) and, separately, was folding a
concurrent peer's working-tree edits into the notebook commit (non-explicit pathspec, f05795c3).
Both are now executed bash, not narrated steps — the model calls ONE script and branches on its
marker output. **MANDATORY, no exceptions: call this script — NEVER a raw/narrated `git add` or
`git commit` on this path.** A bare `git commit` bypassing this script tripped the sweep-guard
hook's escalated-reject 3 seconds before the `0fcc6a5d2` corruption landed via a retried,
pathspec-scoped commit (2026-08-06, `prior_warns=7` already in-session that cycle) — independent
evidence this step's own contract had already been drifted from before the compose defect above
even mattered. If this script errors or is unavailable, STOP and bug-telegram; do not improvise a
raw git command as a fallback.

```bash
bash scripts/auditor-notebook-commit.sh \
  "chore(memory/system-auditor): notebook YYYY-MM-DD tier-N" \
  docs/agent-memory/notebooks/system-auditor.md
```
(`CLAUDE_CODE_SESSION_ID` must already be exported in the shell env; `AUDITOR_COMMIT_OWNER_AGENT`
defaults to `system-auditor`.) The script internally claims/releases `commit-mutex:main`
(task_kind=`commit-mutex`) BEFORE/after the git operation via a bash `trap ... EXIT` — the claim
can never be skipped by construction — and stages/commits ONLY the explicit path given (never
`-A`/`-u`/`.`). Full protocol + marker contract: script header comment.

**Verdict handling (branch on the first stdout line):**
- `[auditor-commit] mutex-paired commit <sha> paths=<n>` → commit succeeded, mutex claimed+released paired. Continue.
- `[auditor-commit] SKIP no-staged-changes ...` → nothing to commit this cycle. Continue (not an error).
- `[auditor-commit] SKIP mutex-claim-failed ...` → per (d): NOT fatal to the audit — skip this cycle's notebook commit, continue the flow, retry next tick. Send bug-telegram only if this reason also fired last cycle (avoid alert-spam on transient contention).
- `[auditor-commit] ABORT ...` (foreign-path-after-restore / git-commit-failed) → bug-telegram (`[system-auditor] auditor-notebook-commit ABORT: <marker line>`) — not a normal skip, investigate.
- `[auditor-commit] ERROR ...` → usage/config bug in the flow wiring itself (e.g. `CLAUDE_CODE_SESSION_ID` unset) → bug-telegram, EXIT.

Convention: `docs/policies/commit-convention.md` § Notebook Commits
Script: `scripts/auditor-notebook-commit.sh` (pointer per `docs/policies/dev-standards.md` § Script Persistence).

---

## Anomaly Reporting (all tiers)

Known (dedup_key seen in past 7 days for BUG channel) → skip BUG write, always append DASHBOARD.md (see DASHBOARD Append below — "always append" includes `SKIP-dedup` outcomes, never just `OK`).
New:
```
## Anomaly: [check_id] [Name]
Severity: info | warn | critical | Date: YYYY-MM-DD
Location: [service/table/source] | Details: [wrong] | Impact: [why] | Root cause: [guess]
```
severity ≥ warn → run **Emit Sequence** (E-1 post_agent_signal + E-2 send_telegram + **E-3 signal_queue row**).
The signal_queue row write (Step E-3) is embedded in the per-tier emit blocks above — it is NOT a trailing optional step. This section is a reminder, not the definition. The definition is at each emit block.

> Invariant: timestamp = current UTC, never future, never speculative.

### DASHBOARD Append (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED)

**Target file: `docs/data/DASHBOARD.md`** — the LIVE, git-tracked dashboard (most recent commit: `chore(system-auditor): append ... DASHBOARD row`). Two things this is explicitly NOT:
- **NOT `docs/handoffs/DASHBOARD.md`** — a stale 650-byte phantom untouched since 2026-07-20, chartered for removal under `UC-ASL-P6`. Never write there.
- **NOT `.claude/skills/signal-dashboard/`** — despite the name, that skill governs `.signal_queue.rows[]` in `orch-state.json` (a completely different artifact, already covered by the E-3 step inside `scripts/emit-audit-signal.sh`). It has no DASHBOARD.md write path at all; a prior version of this flow pointed at it for "per signal-dashboard skill" and that pointer was itself part of this defect (no script, no path, no read-back existed anywhere in the chain).

**Actuator:** `scripts/emit-dashboard-row.sh` — a script actuator with a MANDATORY POST-WRITE read-back assert (re-reads the file and asserts the new row's `--signal-id` anchor is present), failing loud to the BUG channel otherwise. This is the exact same anti-false-green shape as `scripts/emit-audit-signal.sh`'s E-3 step, applied to this artifact — see that script's own header comment if you need the general pattern explained; this one does not repeat it.

**When to call it:** immediately after ANY non-ABORT `[emit-signal]` marker from a CRITICAL/WARN/INFO finding emitted via the per-tier `scripts/emit-audit-signal.sh` call sites above (Tier-2 B-xx, Tier-3 C-xx, Tier-1 A-xx/A-20) — including `SKIP-dedup` outcomes (a known/repeated finding still gets a fresh DASHBOARD row; only the BUG Telegram is dedup-gated). Pass the paired call's `id=` value as `--signal-id` — this ties the DASHBOARD row to the exact signal_queue row it documents and is what makes the row's presence independently verifiable. D-BCTC-EVAL and D-IMPROVE (`--e3-only`, HIGH/MED/INFO severities) are explicitly OUT of this bucket — unchanged scope, see their own call sites.

Paste the verbatim `[emit-dashboard] OK|ABORT|WARN ...` marker into the notebook AND append it to `$MARKERS_FILE` — `dashboard_rows` is counted from this marker by `scripts/audit-output-contract.sh`, never narrated.

### OUTPUT-CONTRACT (echo in RETURN — MANDATORY)
At the end of every cycle, before writing the RETURN block, run the parser on this cycle's accumulated marker log — do NOT hand-compose the counts:
```bash
bash scripts/audit-output-contract.sh \
  --markers-file "$MARKERS_FILE" \
  --cycle-start-ts "$FIRE_TICK" \
  --cycle-tag "$FIRE_TASK_ID" \
  --anomalies-count "<N you are about to write into the RETURN headline>" \
  --next-token "<the literal NEXT: token you are about to write, e.g. clean|po|ops|user>"
```
Paste the script's `[OUTPUT-CONTRACT] ...` line **verbatim** into both the notebook and the RETURN block — this is the MANDATORY line, and it is no longer something the agent composes by hand. Any `[OUTPUT-CONTRACT] VIOLATION: ...` line(s) the script prints are ALSO pasted verbatim into the notebook; the script has already sent the BUG-channel Telegram for each — do not send a second one, and do NOT let a violation abort the cycle (this is a self-diagnostic on the auditor's own counters, not a reason to skip finishing the audit). After this call, `rm -f "$MARKERS_FILE"` (scratch only, never itself an artifact).

The previous form of this check (`signal_queue_rows_written = 0 AND signals_posted > 0` → violation) was vacuous by construction: both operands were narrated by the same agent from the same marker set, so a single misreading produced 0 and 0 and the check passed on a cycle where a row WAS written (confirmed occurrence, 2026-07-29T08:38:34Z). The script above keeps that check (now on marker-parsed, trustworthy operands) AND adds an independent cross-check against `.signal_queue.rows[]` itself when `--cycle-start-ts`/`--orch-state-file` resolve, AND extends the same symmetric-violation treatment to `dashboard_rows` and to the RETURN headline/`NEXT` token — see the script's own header comment for the full V1–V5 list.

### RAW-CITE GATE (rtr-confab2-202606060515 — occ#2; c019 invented config value; c026 cited "system-map lists 4001" for mcp-gateway port, value absent, live port 4040)
Any config/file value cited in a finding or return (port, path, threshold, mapping) MUST be backed by a `grep -n` line captured THIS cycle (file + line number + matched text). No raw line captured → DROP the claim, do NOT report it. NEVER cite `orch-state.json .head.next_action` text as evidence — it is router-authored narrative, not a config value.
- **Return summary extension (rtr-confab3-202606060720 — occ#3; c030 fabricated file/line cite in return channel):** The gate above applies equally to the final message returned to the router. A file/line pointer (e.g. "flow line 57") may appear in a return summary ONLY if that exact cite was already written verbatim to the notebook THIS cycle. If no such notebook line exists, OMIT the pointer — the substantive claim (e.g. "frontend classified INFO, no data impact") may remain, but without the fabricated reference.
- **Sandbox-error quarantine (FIX-AUDITOR-EVIDENCE-INTEGRITY — occ#4; c040 conflated `/private/tmp/claude-501 full` with host ENOSPC):** Any bash exit whose stderr/stdout contains text matching `/private/tmp/claude-501|tasks is full|ENOSPC.*claude/` MUST be classified as `TOOL-UNAVAILABLE / NOT-RUN` for that check — log `"[TOOL-UNAVAILABLE] <check_id>: bash sandbox error — skip, NOT an infra signal"` and continue. NEVER escalate a sandbox-internal error as a host infra finding. Infra criticals require probe.sh `--- disk df -h / ---` raw output as evidence.

**Tier-2/3 Heartbeat Write (auditor-signal-loop-P1, 2026-07-16 — closes the self-defeating T2/T3 SKIP-SPAWN gate):**

**SOLE-WRITER + SHAPE CONTRACT (FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1 — hard, non-negotiable; full spec + rationale cited in ONE named place: `docs/policies/dev-standards.md` `CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER`):**
This is the ONLY step in this flow authorized to write any `docs/data/auditor-tier{2,3}-last-healthy.json` file, and it is NEVER authorized to write `docs/data/auditor-tier1-last-healthy.json` — that file belongs exclusively to `scripts/agents-flow/auditor-tier1-probe.sh`'s `_write_heartbeat()`. If you find yourself about to touch `auditor-tier1-last-healthy.json` from anywhere in this flow, for any reason, on any `AUDIT_TIER` including `1` — **STOP, do not write it.** A prose prohibition alone was already tried here and failed once (a 2026-07-29T06:08:22Z cycle wrote the tier-1 file anyway, collapsing its shape and falsely advancing a "healthy" marker on a DEGRADED cycle) — this is now also enforced in code: `scripts/git-hooks/pre-commit`'s `_check_auditor_heartbeat_shapes` rejects (commit BLOCKED, loud stderr) any staged tier-1 write that is not the exact `{last_healthy_at, checks:{6 keys, all "PASS"}}` shape, and any staged tier-2/3 write that carries a `checks` key at all.
**Semantic (state + enforce, do not conflate the two):** the tier-2/3 marker below means **"a real Tier-N audit cycle completed"** — NOT "was healthy". It fires every Tier-2/3 cycle regardless of this cycle's HEALTHY/DEGRADED/CRITICAL verdict (see rationale below); Tier-1's marker means **"system was confirmed healthy"** and only ever advances on `_write_heartbeat()`'s ALL_GREEN branch. Two different semantics inside one filename family that both say "healthy" — resolved by keeping the shapes structurally distinct (bare vs `checks{}`) rather than by re-gating this block on a green verdict (that would starve the heartbeat on any persistently-tracked DEGRADED cycle and recreate the exact spawn-storm the P1 fix below closed) or renaming the files (would break the already-planned reads in `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL`'s OH-3.5).

When this cycle's `AUDIT_TIER` is `2` or `3` (Tier-1 is untouched — it keeps its own `_write_heartbeat` inside `scripts/agents-flow/auditor-tier1-probe.sh`), atomically record that a REAL audit just completed, so `scripts/agents-flow/auditor-tier1-probe.sh --tier=$AUDIT_TIER`'s pre-spawn gate can compute freshness against THIS timestamp on the next tick, instead of a value that pre-gate would otherwise have to mint itself. Runs unconditionally every Tier-2/3 cycle — independent of the Notebook Append Gate above, since a genuine ALL_GREEN cycle with nothing new to write to the notebook is still a REAL completed audit and must still refresh freshness. Tmp+mv atomic write (never a raw `>` truncate-write) — same pattern as the probe script's own `_write_heartbeat`:
```bash
if [ "$AUDIT_TIER" = "2" ] || [ "$AUDIT_TIER" = "3" ]; then
  HB_FILE="$PROJECT_ROOT/docs/data/auditor-tier${AUDIT_TIER}-last-healthy.json"
  HB_TMP="$(mktemp "${HB_FILE}.tmp.XXXXXX" 2>/dev/null)" && \
    jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$HB_TMP" 2>/dev/null && \
    [ -s "$HB_TMP" ] && chmod 644 "$HB_TMP" 2>/dev/null && mv -f "$HB_TMP" "$HB_FILE" 2>/dev/null
  [ -f "$HB_FILE" ] || { rm -f "$HB_TMP" 2>/dev/null; log "[system-auditor] WARN: tier-${AUDIT_TIER} heartbeat write FAILED — next tick's pre-gate will see a stale/missing heartbeat and correctly SPAWN"; }
fi
```
Note: this block's own `if` gate already restricts `$AUDIT_TIER` to the literal strings `2`/`3` before `HB_FILE` is ever built, so it cannot mechanically target the tier-1 filename when followed as written — the 2026-07-29T06:08:22Z violation did not go through this exact snippet at all (no authorizing step anywhere in the flow produced it). The pre-commit guard above is the backstop for exactly that class of drift: an out-of-contract write that never went through this documented gate in the first place.

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

**P3 Fire-Election Release (TASK_1994 — mandatory, runs here after notebook write + commit):**
```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              FIRE_TASK_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false acceptable (TTL=600s expired on a very long audit cycle — crash-safety backstop).
# FIRE_TASK_ID = "cron:auditor-t<N>:<FIRE_TICK>" set in Step 0d above.
```

## Always Report (never skip)
test data in prod | DB corruption | unbounded WAL | container down | cron not running | prod table 0 rows expected > 0 | pdftoppm/tesseract missing in mcp-server | SSC portal URLs in bctc_queue not skipped

---

## Agent-Specific Error Cases
- DB integrity check returns non-"ok" → report as CRITICAL anomaly → EXIT after Telegram BUG alert.
- docker daemon unreachable → report as CRITICAL for all container checks → EXIT after alert.
- All MCP tool calls fail → report as CRITICAL (mcp-server likely down) → EXIT after alert.

## RETURN

```
DONE: Audit complete tier-N — N anomalies (C critical, W warn, I info) | M dedup-skipped
NEXT: po (via orch-state.json .signal_queue row) | user (if clean) | ops (if CRITICAL DB or container anomaly)
PIPELINE: complete
QUALITY: full | partial (if early exit triggered on doc/memory pass)
[OUTPUT-CONTRACT] signals_posted=N | telegram_sent=N | signal_queue_rows_written=N | dashboard_rows=N | dedup_skipped=N
CONTRACT-CONTRADICTION: NONE
```
The `[OUTPUT-CONTRACT]` line is MANDATORY and MUST be the verbatim output of `scripts/audit-output-contract.sh` (§Anomaly Reporting → OUTPUT-CONTRACT) — never hand-composed. Omitting it = contract violation (dispatcher will backfill and log recurring-bug pattern). `CONTRACT-CONTRADICTION` is MANDATORY every cycle, same discipline as `[OUTPUT-CONTRACT]` — print `NONE` on a clean cycle, never omit the line (see §CALLER-INSTRUCTION PRECEDENCE (AUD-CP-1) above for the triggered-form syntax).

**Headline consistency (in scope — same defect, RETURN-channel arm):** `N`/`C`/`W`/`I`/`M dedup-skipped` above and the `NEXT:` token are cross-checked, not independently re-derived, by the same script call: pass the `N` you are about to write as `--anomalies-count` and the `NEXT:` token you are about to write as `--next-token`. If either is inconsistent with a non-zero `signals_posted` (e.g. `anomalies=0`/`NEXT: clean` while the script's marker-derived `signals_posted>0`), the script prints a `VIOLATION` line and BUG-Telegrams it — paste that line into the RETURN block too, and correct the headline/NEXT token before finishing this cycle's RETURN rather than shipping a self-contradictory return (confirmed occurrence: a 2026-07-29T08:38:34Z cycle returned `0 anomalies ... NEXT: clean` while its own body reported `4/5 OK (api-gateway FAIL)`). `M dedup-skipped` is available directly from the script's own `dedup_skipped` field in the `[OUTPUT-CONTRACT]` line — reuse it verbatim, do not tally it separately.
