# Orch Sentinel — Emit Scorecard (Shared End-of-Cycle)

**Parent flow:** `docs/agents/orch-sentinel/flow/main.md` (runs after all dimension sub-flows for this MODE complete)

Sole writer for this agent's 3 write targets: scorecard, notebook, signal_queue. Dimension sub-flows
(`dim-oh1-*.md` .. `dim-oh4-*.md`) never write to disk — they return in-memory finding lists collected
here.

---

## Step 1 — Compose Scorecard (self-diff, in memory)

The prior scorecard content + its trailing `<!-- OH-STATE: {json} -->` block were already read in
`main.md` Step 0b. Using that + this cycle's dimension outputs:

1. For OH-2.2/OH-4.2/OH-4.3's "N consecutive runs" counters — compute against the prior OH-STATE
   values (increment if still flagging, reset to 0 if resolved this run).
1b. For OH-2.4's `oh2_4_owner_fail_streak` (`docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md`
    §7, self-referential diff — same technique as OH-4.3, NOT `docs/agent-memory/modules/tool-usage-stats.json`,
    which holds unrelated per-tool call counts and has no OH-STATE key at all; the brief's §9 handoff
    table named the wrong file, corrected here 2026-08-26 by agent-father): for each `owner` with a
    `match:false` behavior_probe this cycle (from OH-2.4's findings), `new[owner] = prior[owner] + 1`;
    for every owner with zero `match:false` this cycle, drop it from the map (streak resets to 0, key
    omitted rather than carried at 0). Rung-1/Rung-2 thresholds (§7) read this post-update map, not the
    prior one.
2. For any finding that is a re-check of a PRIOR CRITICAL/HIGH row that now reads clean — mark
   `RESOLVED-OBSERVED` in the scorecard table (never touch the original signal_queue row's status).
3. Build the human-readable scorecard body: one table per dimension that ran this cycle (OH-1 always;
   OH-2/OH-3/OH-4 only on MODE=FULL — on MODE=LITE, carry the OH-2/OH-3/OH-4 tables FORWARD unchanged
   from the prior scorecard, do not blank them).
4. Build the new `<!-- OH-STATE: {json} -->` block: `{run_mode, run_ts, oh1_1_mint_rate, oh1_5_pct_of_cap,
   oh2_2_pilot_runs, oh2_2_pilot_stale_since, oh2_4_owner_fail_streak: {owner: streak_count, ...},
   oh4_1_snapshot: {...}, oh4_2_flat_streak, oh4_3_zero_streaks:
   {tool: streak_count, ...}, oh3_4_logged_once: true|false}` — compact JSON, this run's values only
   (not a growing history array). `oh2_4_owner_fail_streak` is written on EVERY run (FULL and LITE) —
   OH-2.4 runs in both modes (`docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md`), unlike
   OH-2.2/OH-4.1-4.3 which stay FULL-only and hold their prior FULL-run value forward on LITE runs.

Compose the ENTIRE file body in memory before any write (same settled-write discipline as
`.claude/skills/notebook-write/SKILL.md` AC-3 — never a two-write append-then-trim pattern).

## Step 2 — Write Scorecard

```
Write(path="docs/data/orch-sentinel-scorecard.md", content=<settled body from Step 1>)
```
One call. Full overwrite (regenerated in full each run, same established pattern as `docs/data/DASHBOARD.md`'s shape — not its content).

## Step 3 — Write Notebook (OVERWRITE class, ≤80L)

Per `.claude/skills/notebook-write/SKILL.md` AC-6 two-class contract — orch-sentinel is OVERWRITE class (same class as `po` ≤50L and `market-watcher` ≤80L). Full-file replace, preamble + THIS cycle's section only — no rolling history (trend data lives in the scorecard's OH-STATE block, not here).

```
Write(path="docs/agent-memory/notebooks/orch-sentinel.md", content=<preamble + this-cycle section, ≤80L total>)
```

Section template:
```
# Orch Sentinel — Notebook
**Last updated:** <ISO-8601 UTC> | **Mode:** FULL|LITE

## Cycle <ISO-8601 UTC>
- Mode: FULL|LITE | Dimensions run: OH-1[,OH-2,OH-3,OH-4]
- Findings: N (H high, M med, L low, I info) | K dedup-skipped | J RESOLVED-OBSERVED
- Fire-election: claimed|re-entrant | Tick: <FIRE_TICK>
- Scorecard: docs/data/orch-sentinel-scorecard.md (regenerated)
```
After write, blocking gate: `wc -l < docs/agent-memory/notebooks/orch-sentinel.md` → if > 80 → recompose tighter (trim to essentials, this is a hard cap per brief §4, stricter than the fleet-wide 200L ceiling).

## Step 4 — Signal Queue Writes (via `scripts/orch-apply.sh` ONLY)

For each finding from the dimension sub-flows with severity ≥ `LOW` (i.e. everything except pure `INFO`
snapshots, which stay scorecard-only):

**4a. Anti-flood gate (mandatory, before every candidate row):**
```bash
jq --arg cid "<check_id>" '[.signal_queue.rows[] | select(.from == "orch-sentinel" and .status == "NEW" and (.summary | contains($cid)))] | length' docs/data/orch/orch-state.json
```
If > 0 → skip this candidate, log `"[ANTI-FLOOD] skip duplicate: {check_id}"`, continue to next finding.

**4b. Corroboration gate:** any candidate at severity `CRITICAL` MUST have 2 independently-sourced
planes behind it (per `init.md` `constraints.corroboration_gate_before_critical`) — EXCEPT `OH-3.3`
(binary invariant presence). If a `CRITICAL` candidate lacks a second independent plane, downgrade to
`HIGH` before writing and log `"[CORROBORATION] downgraded {check_id} CRITICAL→HIGH — single plane only"`.

**4c. Write:**
```bash
jq --arg id "orc-$(date -u +%Y%m%dT%H%M%S)" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   --arg cid "<check_id>" --arg sev "<CRITICAL|HIGH|MED|LOW|INFO>" --arg summ "<summary ≤120 chars>" \
   --arg pref "docs/data/orch-sentinel-scorecard.md" \
   '.signal_queue.rows += [{id:$id, ts:$ts, from:"orch-sentinel", to:"po", type:"orch-health-finding",
     summary:($cid + ": " + $summ), severity:$sev, status:"NEW", payload_ref:$pref}]' \
   docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
ORCH_APPLY_EXIT=$?
```

**4d. Branch on exit code:**
- `0` → **POST-WRITE READ-BACK assert (mandatory, per signal-dashboard SKILL):**
  ```bash
  jq --arg id "<the id just written>" '[.signal_queue.rows[] | select(.id == $id)] | length' docs/data/orch/orch-state.json
  ```
  Result `0` → FAIL LOUD: log `"[SIGNAL-ROW-ASSERT] FAIL: row '{id}' NOT found in .signal_queue.rows[]"` + `send_telegram(channel="bug", message="[orch-sentinel] SIGNAL-ROW-ASSERT FAIL: {id}")`. Result `≥1` → success, continue.
- `2` (CAS mtime mismatch — concurrent writer) → retry up to 3× (WF-2 concurrent-writer contract; MODE=LITE fires at 01:45 UTC, close to but offset from system-auditor Tier-3's 02:00 UTC — collision unlikely but the retry contract must exist). After 3 failed retries → log + BUG-channel Telegram, skip this row, continue to next candidate.
- `1` (validation/conservation-guard failure) → do NOT retry — log `"[orch-sentinel] orch-apply REJECTED {check_id}: validation/conservation failure"` + BUG-channel Telegram, skip this row, continue to next candidate. Never abort the whole cycle over one bad row.
- `3` (usage error) → log + BUG-channel Telegram, treat as TOOL-UNAVAILABLE for this check, continue.

## Step 5 — Commit (mutex-paired, explicit pathspec)

Reuse the blessed generic commit script (same pattern already established for the notebook/doc commit
class — `scripts/auditor-notebook-commit.sh` accepts an arbitrary commit message + explicit path list;
its `AUDITOR_COMMIT_OWNER_AGENT` env var is overridable, this is not auditor-specific despite the
filename):

```bash
AUDITOR_COMMIT_OWNER_AGENT=orch-sentinel bash scripts/auditor-notebook-commit.sh \
  "chore(memory/orch-sentinel): cycle <MODE> YYYY-MM-DD" \
  docs/agent-memory/notebooks/orch-sentinel.md docs/data/orch-sentinel-scorecard.md
```
(`docs/data/orch/orch-state.json` is NEVER included in this pathspec — it was already atomically
written by `scripts/orch-apply.sh` in Step 4c, which handles its own commit-free atomic rename; do not
double-commit it here.)

**Verdict handling** (same branches as system-auditor's use of this script):
- `[auditor-commit] mutex-paired commit <sha> paths=<n>` → success, continue.
- `[auditor-commit] SKIP no-staged-changes ...` → nothing changed this cycle (genuine all-clean LITE run with zero new findings) — continue, not an error.
- `[auditor-commit] SKIP mutex-claim-failed ...` → not fatal — skip this cycle's commit, continue, retry next tick.
- `[auditor-commit] ABORT ...` / `[auditor-commit] ERROR ...` → BUG-channel Telegram, investigate.

## Step 6 — Fire-Election Release

```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: FIRE_TASK_ID, owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false acceptable (TTL=600s expired on a very long run — crash-safety backstop).
```

## Step 7 — RETURN

```
DONE: orch-sentinel cycle complete mode-<MODE> — N findings (H high, M med, L low, I info) | K dedup-skipped | J RESOLVED-OBSERVED
NEXT: po (via signal_queue) | idle (if zero findings ≥ LOW)
PIPELINE: complete
QUALITY: full | partial (if any source marked TOOL-UNAVAILABLE)
[OUTPUT-CONTRACT] signal_queue_rows_written=N | dedup_skipped=K | scorecard_regenerated=true | notebook_written=true
```
