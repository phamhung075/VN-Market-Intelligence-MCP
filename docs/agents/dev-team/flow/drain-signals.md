<!-- size-justification: 150L — signal drain SSOT (mandatory-persist guard, 0a-D cross-team inbox drain, 0a-0..3 fingerprint+route logic, routing table). All sections are load-bearing; no safe extraction without losing trigger→action traceability. BGFAN-1 2026-06-07: header comment added (+2L). CANON-SCRIPT 2026-06-07: scripts/agents-flow/drain-signals.js pointer (+3L). CI-HEALTH-FIX-BRIDGE 2026-06-08: ci_red routing row added (+2L). FIX-DRAIN-SIGNALS-DEDUP-PRUNE-STRCOMPARE 2026-06-28: dash-ISO format + epoch-seconds prune + FAIL-LOUD fence (+3L). FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH 2026-07-02: 0a-1 tags pendingSignals with source="file" so ESC-DISPATCH can branch on row origin (+2L). FIX-DRAIN-SIGNALS-LEGACY-PRUNE-HOLE (task UC-SDF-P4) 2026-07-16: legacy/unstamped-file mtime-fallback prune rule + scripts/audits/purge-legacy-processed-signals.sh one-time-purge pointer (+19L). UC-GCP-P2 2026-07-16: signals.db untracked/gitignored — removed from MANDATORY-PERSIST-GUARD commit-path list so the drain no longer tries `git add` an ignored path; mtime freshness check kept (+1L). FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE 2026-07-21: CANON-SCRIPT description updated in-place — script now also repoints signal_queue.rows[].payload_ref on move (+0L, same line expanded). UC-GCP-P3 2026-07-23: MANDATORY-PERSIST-GUARD commit staging changed from a shell-glob path list (dropped deletions) to `git add -u -- docs/signals/ && git add -- docs/signals/processed/` (tracked-only sweep, captures deletions) + a post-commit `git status --porcelain` clean-check invariant (+2L). FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY 2026-07-23: MANDATORY-PERSIST-GUARD item 1 count source changed from raw `ls | wc -l` to `drain-signals.js --count-drainable` (shares the drain loop's own drainable-shape predicate, excludes litter) (+0L, same line expanded). FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES 2026-07-23: §0a-2 gains a referenced-file guard — a >7d-old processed/ file whose basename is still referenced by a live task_board.*[].detail_ref or signal_queue.rows[].payload_ref is now SKIPPED instead of unconditionally deleted (+4L). FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS 2026-08-01: §0a-D-PRUNE steps 1-2 corrected — stale pre-HSC-7 48h figure and removed inline signal_queue.archive[] lane replaced with live SSOT (24h + scripts/orch-cold-evict.sh + cold-file destination, matching .claude/skills/signal-dashboard/SKILL.md § PRUNE) (+1L). FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN 2026-08-08: 150L→216L (+66L) — §0a-1 and §0a-D per architect brief `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §3.1: reordered append-before-destructive (batch-build envelopes → ONE durable `orch-apply.sh`-gated append to `.dev_team_idle_chain.pending_triage_inbox` → destructive mv/fingerprint/DB-INSERT (§0a-1) or NEW→READ flip (§0a-D, combined atomically with its append in the same write) only on append success; on failure, signals retained untouched for retry). No safe extraction — durability ordering is the load-bearing fix itself, splitting it out of its own loop would re-fork the exact defect being closed. FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR 2026-08-14: 216L→228L (+12L) — new cross-reference note inserted after the durable-append-before-destructive paragraph clarifying this file only APPENDS to the inbox (never clears it) and pointing at `docs/agents/dev-team/flow/main.md` § Step 1 for the CLEAR step's new `ORCH_APPLY_DECLARED_INBOX_TRIAGED` declaration + `scripts/orch-conservation-check.mjs`'s removal of `pending_triage_inbox` from its magnitude floor. No functional change to this file's own append logic. -->
# Dev Team — Step 0a: Drain `docs/signals/`

<!-- BGFAN-1: this file delegates spawn to drain-esc-dispatch.md (ESC-DISPATCH) which carries run_in_background=true. No direct Agent() call here. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

**MANDATORY PERSIST GUARD:** Before Step 0a-D, check:
1. `node scripts/agents-flow/drain-signals.js --count-drainable` → parses `drainable_count=<n>`; if n > 50: full drain (§0a-1 + DB INSERT + mv) is REQUIRED this tick. (FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY, 2026-07-23: a raw `ls docs/signals/*.json | wc -l` counted non-drainable litter — cowork telemetry / tick residue carrying no valid `from`+`type` — inflating the count and forcing a full drain even when nothing was actually routable. The count now reuses the SAME drainable-shape predicate (`isDrainableShape()`) the drain loop's own "SKIP non-signal shape" guard already applies — shared, not forked.)
2. `stat -f "%Sm" docs/signals/signals.db` → if mtime > 24h ago: DB write is REQUIRED this tick.
Neither is optional. Curate-and-route without persist+commit = incomplete drain. After drain, stage with `git add -u -- docs/signals/ && git add -- docs/signals/processed/` (`-u` stages tracked modifications + DELETIONS only — captures pruned `processed/` deletions and top-level inbox deletions without ever sweeping other agents' untracked/mid-write inbox arrivals in `docs/signals/`; the second `git add` picks up the drain's own newly-moved `processed/` files, which are untracked-new so `-u` alone misses them), plus `docs/data/orch/orch-state.json` (signal_queue section only). `signals.db` is untracked + gitignored (UC-GCP-P2 2026-07-16, `*.db` rule) — the mtime freshness check in item 2 stays (still gates whether the DB write itself is required this tick); do NOT `git add docs/signals/signals.db` — git refuses already-ignored paths and exits 1.

**Post-commit invariant (UC-GCP-P3, closes the deletion-drop hole):** after the drain commit, run `git status --porcelain -- docs/signals/ | grep -v '^??' | grep -v signals.db | wc -l` — must be `0` (the `^??` exclusion prevents false alarms from signal files legitimately arriving mid-commit from peers). If non-empty → `send_telegram(channel="bug", message="[dev-team] drain commit residual paths: " + <listed paths>)` naming the residual paths — confirms the drain commit swept exactly the tracked signal mutations+deletions it intended, nothing stranded.

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 0a dispatcher)

Spec: `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` | DB degradation: `docs/protocols/agent-chaining-protocol.md` § Cross-Team Signal Directory

**Rationale:** Sources may re-emit across cycles. In-memory dedup covers only the current pass. Fingerprint check against `signals_processed` in `docs/signals/signals.db` gates cross-cycle duplicates.

---

**0a-D — Drain `docs/data/orch/orch-state.json` `.signal_queue` (cross-team inbox):**

Read `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find rows where `to` matches `po` or any dev-team-addressed agent. Collect `status=NEW` rows.

→ Load skill: `.claude/skills/task-lock/SKILL.md`

**FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (2026-08-08) — durable-append-before-destructive:**
claim each row as before (per-row claim still guards against a concurrent dev-team session), but
do NOT flip `NEW→READ` per-row. Batch every successfully-claimed row this tick, durably append
the WHOLE batch to `.dev_team_idle_chain.pending_triage_inbox`, and ONLY on that write's success
flip the batch's rows to `READ` — combined into the SAME `orch-apply.sh` write, since both the
append target (`.dev_team_idle_chain`) and the flip target (`.signal_queue.rows[]`) live in the
same `orch-state.json`. This is strictly safer than two separate writes: it closes even the
narrow "append succeeded, flip failed" race a 2-write design would leave open (§0a-1 below
cannot do the same combination — its destructive step targets the filesystem + `signals.db`,
not `orch-state.json`).

**Cross-reference (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR,
2026-08-14):** this section only ever APPENDS to `.dev_team_idle_chain.pending_triage_inbox` — the
CLEAR (subtractive removal by `envelope_id`, after PO triages the batch) is a SEPARATE, later step
owned entirely by `docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox CLEAR" — this file
never removes inbox entries. That CLEAR write declares the ids it removes via
`ORCH_APPLY_DECLARED_INBOX_TRIAGED` (see `scripts/orch-conservation-check.mjs`'s own header) —
`scripts/orch-conservation-check.mjs` no longer folds this array into its `signal_total` magnitude
floor (it is a drain-to-zero queue, not an accumulating log like `signal_queue.rows[]`), so a full
inbox clear lands in ONE write instead of the artificial multi-write sub-batching PO had to resort
to previously (reproduced live: 29 envelopes 2026-08-11, 248 envelopes 2026-08-14). No behavior
change to this file's own append path.

claimedRows = []
For each NEW row:
  row_key = "dash:signal_queue:" + row.id

  # SAFE-JSON: build payload with jq --arg (bound params) — NEVER interpolate row fields into a shell string.
  # INVARIANT: agent-authored fields (row.id / row.from / row.type) MUST NOT appear in a /bin/sh command line.
  # Pattern: echo '{}' | jq --arg rid "$row_id" --arg frm "$row_from" --arg typ "$row_type" \
  #           '{row_id:$rid,from:$frm,type:$typ}' > /tmp/drain_payload.json
  # Then pass the file content (or the JSON object directly) to call_tool arguments — no shell interpolation.
  claim_payload = {row_id: row.id, from: row.from, type: row.type}   # structured object, not a shell-built string

  result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:              row_key,
    task_kind:            "dashboard-row",
    owner_agent:          "dev-team",
    owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
    ttl_seconds:          1800,
    payload:              JSON.stringify(claim_payload)   // live schema requires a SERIALIZED JSON STRING ("Expected string, received object" — verified 2026-06-05); build the object with bound params first, stringify last — never shell-concatenate
  })

  if not result.claimed:
    log "[dev-team] SKIP dashboard row " + row.id + " — held by " + result.current_holder.owner_agent
    continue                            // Do NOT add to claimedRows, do NOT mark READ, do NOT append anywhere

  // Claim succeeded — build the envelope now (NO destructive action yet); hold the row's claim
  // open until the batched write below resolves. Payload inlined, never a pointer (same
  // dangling-ref-avoidance rationale as FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE — the durable
  // inbox entry must never carry a payload_ref that a later move/prune could orphan).
  loaded_payload = row.payload_ref present ? read+parse(row.payload_ref) : (row.summary ?? null)
  envelope_id = sha256(row.from + row.type + JSON.stringify(loaded_payload) + row.ts)
  claimedRows.push({row, envelope_id, payload: loaded_payload})

If claimedRows non-empty:
  batch = claimedRows.map(cr => {
    envelope_id: cr.envelope_id, source: "dashboard", from: cr.row.from, to: cr.row.to,
    type: cr.row.type, priority: cr.row.severity, payload: cr.payload, createdAt: cr.row.ts,
    drained_at: now(), routed_to: <§0a-3 routing-table lookup on (type, from), see below>
  })
  ids = claimedRows.map(cr => cr.row.id)
  write_result = jq --argjson batch "$(json batch)" --argjson ids "$(json ids)" --arg now "$(now)" '
      .dev_team_idle_chain.pending_triage_inbox = ((.dev_team_idle_chain.pending_triage_inbox // []) + $batch)
      | .dev_team_idle_chain._updated_at = $now | .dev_team_idle_chain._updated_by = "dev-team"
      | .signal_queue.rows |= map(if (.id as $i | ($ids | index($i))) then .status = "READ" else . end)
      | .signal_queue._updated_at = $now | .signal_queue._updated_by = "dev-team"
    ' docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

  if write_result exit code == 0:
    for cr in claimedRows:
      append to pendingSignals[] with source="dashboard"   // informational/local — unchanged instruction,
        // still feeds the CURRENT Step 1 build until FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION
        // switches Step 1 to read `.dev_team_idle_chain.pending_triage_inbox` directly
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: row_key(cr.row.id), owner_client_session: $CLAUDE_CODE_SESSION_ID })
  else:
    log "[dev-team] WARN: durable-inbox append+flip failed — retaining " + claimedRows.length + " dashboard row(s) for retry, row(s) left NEW"
    for cr in claimedRows:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: row_key(cr.row.id), owner_client_session: $CLAUDE_CODE_SESSION_ID })   // release so next tick's drain can re-claim + retry
    // nothing appended, nothing flipped — rows stay NEW, mirrors §0a-0's existing degradation convention

If `orch-state.json` missing or `.signal_queue.rows` absent → log "[dev-team] signal_queue skip" and continue. Never fail-loud.

**0a-D-PRUNE — MANDATORY prune after signal_queue row consumption:**

After all NEW rows from 0a-D are marked READ, per skill `.claude/skills/signal-dashboard/SKILL.md` § PRUNE:
```
1. Evict rows where status IN (READ, RESOLVED, SUPERSEDED) AND row ts older than 24h:
   Run scripts/orch-cold-evict.sh -> cold file docs/data/orch/archive/YYYY-MM.json (NOT the
   removed inline .signal_queue.archive[] lane — removed at HSC-7, commit bff0362c2)
2. Script removes evicted rows from .signal_queue.rows[] in the same atomic hot-file write
3. Update .signal_queue._updated_at + .signal_queue._updated_by
4. Update dashboard_section_cache in docs/data/orch/orch-state.json .dashboard_section_cache:
   {section_name: "po", last_mtime: <new mtime of orch-state.json>, last_linecount: <rows count>}
5. Commit (atomic temp→rename): git add docs/data/orch/orch-state.json
           git commit -m "chore(signals): drain + prune {ts}" -- docs/data/orch/orch-state.json
```
NEW rows are NEVER pruned.
Skip prune gracefully if orch-state.json was missing/skipped in 0a-D.

---

**0a-0 — Open signals.db:**
```
db_path = docs/signals/signals.db
try: open READ_WRITE → db_available = true
catch (ENOENT | SQLITE_CANTOPEN | locked after 3×200ms):
  db_available = false
  log: "[dev-team] WARN: signals.db unavailable — skipping drain, inbox retained for retry"
  pendingSignals = [] | files untouched | continue with empty signals
```

**0a-1 — Glob and iterate** (`docs/signals/*.json`, sorted by `createdAt` ascending):

**CANONICAL SCRIPT (preferred):** `node scripts/agents-flow/drain-signals.js` executes §0a-1 + §0a-2 in one shot (fingerprint dedup, durable-inbox append, `_processed` append, mv to `processed/`, DB INSERT, 7-day prune; injection-safe — sqlite3 fed via stdin). Read its stdout report into `pendingSignals[]` routing. The manual spec below remains the SSOT the script MUST match; fall back to it only if node is unavailable. The script does NOT cover §0a-D (queue row READ-marking) or this flow's own §0a-D-PRUNE commit — those stay in this flow. It DOES, as of FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (2026-07-21), repoint any `signal_queue.rows[].payload_ref` that pointed at a file it just moved, in its own separate `orch-apply.sh`-gated write (Zod + conservation + CAS, same gate as every other orch-state writer) — this prevents the move from dangling a ref and hard-blocking the next fleet-wide orch-apply write (`scripts/orch-validate.mjs` Stage 1c). It ALSO, as of FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES (2026-07-23), SKIPS (never deletes) an aged-out `processed/` file whose basename is still referenced by any live `detail_ref`/`payload_ref` — see the referenced-file guard under §0a-2 below. It ALSO, as of FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (2026-08-08), durably appends every newly-routable signal's full envelope to `.dev_team_idle_chain.pending_triage_inbox` in ONE `orch-apply.sh`-gated write BEFORE moving/fingerprinting any file this tick — on append failure (CAS retry exhausted, Zod validation fail, missing/unreadable `orch-state.json`, etc.) the whole file-move+DB-INSERT step is skipped for the tick, every signal file retained untouched for re-evaluation next tick; see the numbered steps below for the full ordering. Test: `scripts/agents-flow/drain-signals.test.js` ("FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE" + "FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES" + "FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN" scenarios — isolated harness, never touches the live `orch-state.json`).

For each file:
1. Read JSON. Log: `"[dev-team] Signal: {from} → {to} | type={type} | priority={priority}"`
2. **Fingerprint check (classification only — non-destructive):** `sha256(from + type + JSON.stringify(payload) + createdAt)`
   - Match in `signals_processed` → classify `skipped-duplicate-replay` (destined for `processed/{name-replay}.json`, no INSERT, NOT added to this tick's durable batch below — it was already durably routed on a prior tick)
   - No match → classify `routed-to-po` (destined for `processed/{filename}`, queued for INSERT) AND add its envelope to this tick's durable batch

**FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (2026-08-08) — durable-append-before-destructive:**
Step 1-2 above are non-destructive: no file has moved, no DB row has been written yet.
```
batch = [envelope for every file classified routed-to-po this tick]   # payload inlined, never a pointer
  # envelope: {envelope_id: fingerprint, source: "file", from, to, type, priority, payload,
  #            createdAt, drained_at: now(), routed_to: <§0a-3 routing-table lookup on (type, from)>}
if batch non-empty:
  write_result = jq --argjson batch "$(json batch)" '
      .dev_team_idle_chain.pending_triage_inbox = ((.dev_team_idle_chain.pending_triage_inbox // []) + $batch)
      | .dev_team_idle_chain._updated_at = now | .dev_team_idle_chain._updated_by = "dev-team"
    ' docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```
- **On success (exit 0):** proceed to step 3 below for EVERY file classified this tick (both `routed-to-po` AND `skipped-duplicate-replay` — duplicates carry no durability risk on their own, but are gated on the SAME tick decision for one atomic all-or-nothing tick, per the architect brief §3.1 "all-or-nothing failure semantics for the tick").
- **On failure (any non-zero exit):** log `"[dev-team] WARN: durable-inbox append failed — retaining {n} signal(s) in inbox for retry, skipping destructive drain this tick"` (mirrors §0a-0's existing "signals.db unavailable" degradation convention) — SKIP step 3 entirely this tick: no file moved, no fingerprint written, no DB INSERT. Every file (both classes) is left untouched in `docs/signals/`, re-evaluated fresh next tick.

3. **Destructive action (reached only per the gate above):**
   - **Filesystem:** append `{fingerprint, processedAt, processedBy:"dev-team", result}` then mv to `docs/signals/processed/{filename}` (or `{name-replay}.json` for duplicates) — result ∈ {`routed-to-po`, `skipped-duplicate`, `skipped-duplicate-replay`, `skipped-stale`}
   - **DB INSERT** into `signals_processed(fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename)` for `routed-to-po` entries only — INSERT fail is non-fatal (file move is SSOT)
4. Append to `pendingSignals[]` with `source="file"` (mirrors 0a-D's `source="dashboard"` tag —
   lets type-specific handlers, e.g. ESC-DISPATCH, branch on row origin; informational/local,
   superseded once FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION switches Step 1 to read
   `.dev_team_idle_chain.pending_triage_inbox` directly)

**0a-2 — Prune** (after batch, both stores):
```sh
# processed_at stored dash-ISO YYYY-MM-DDTHH:MM:SSZ (NOT compact-ISO).
# NEVER compare dash-ISO rows against a compact cutoff: '-' (0x2D) < any digit (0x30) →
# every dash-ISO processed_at strcompares < compact cutoff → total truncation bug.
# Use epoch-seconds: strftime('%s', processed_at) is safe for dash-ISO in SQLite.
cutoff_epoch=$(( $(date -u +%s) - 604800 ))
sqlite3 docs/signals/signals.db "DELETE FROM signals_processed WHERE CAST(strftime('%s', processed_at) AS INTEGER) < ${cutoff_epoch};"
```
Delete `docs/signals/processed/` files with `processedAt` (field value, dash-ISO) older than 7 days — field compare, not mtime, correct as-is.

**Referenced-file guard (FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES, 2026-07-23):** before deleting an aged-out file (by either rule above OR the legacy mtime fallback below), check whether its basename is still referenced by a live `task_board.*[].detail_ref` (flat lanes backlog/done/done_verified/in_progress/qa/ready/review/archive, PLUS `active_sprints[].tasks[].detail_ref` / `closed_sprints[].tasks[].detail_ref` — same walk as `checkRefIntegrity()` in `orchStateSchema.ts`, Stage 1c) OR any `signal_queue.rows[].payload_ref`. If referenced, SKIP the deletion (leave the file on disk, log a one-line skip note) — do NOT restore an already-pruned file and do NOT repoint the ref (repointing on MOVE stays FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE's job, unrelated to this PRUNE-time guard). Closes the gap where an aged-out-but-still-referenced file (e.g. an obsolete backlog row's `detail_ref`) was deleted unconditionally, leaving a PERSISTENT Stage-1c dangling ref that hard-blocks every `orch-apply.sh` write fleet-wide until hand-repaired (confirmed 2026-07-23, drain commit `395e224ad`).

**Legacy/unstamped-file fallback (FIX-DRAIN-SIGNALS-LEGACY-PRUNE-HOLE, task UC-SDF-P4, 2026-07-16):**
Files with no `_processed.processedAt` (and no top-level `processedAt`) were previously NEVER pruned by
the field-compare rule above — they accumulate unbounded (~1,283 legacy files found in
`docs/signals/processed/` before this fix). Fallback: when neither field is present/non-null, compare file
**mtime** (`fs.statSync(...).mtimeMs`) against the same 7-day cutoff. mtime is a defensible proxy here
because `processed/` files are written exactly once at drain time and never rewritten afterward. This
fallback applies ONLY to the file-plane prune in this section — it does NOT touch or weaken the DB-plane
epoch-seconds `strftime('%s', processed_at)` comparison above, which stays a strict field compare against
dash-ISO `processed_at` (do not reintroduce the STRCOMPARE bug by mixing formats there).

**One-time purge (already-accumulated legacy backlog):** `scripts/audits/purge-legacy-processed-signals.sh`
— idempotent, re-runnable; `--dry-run` (default) prints the qualifying count + sample with no deletes;
`--live` `git rm`s the qualifying files. A file qualifies ONLY if BOTH unstamped (no
`_processed.processedAt`/`processedAt`) AND mtime older than the 7-day cutoff; stamped or recent files are
never touched; unparseable JSON is skipped (left alone), matching the drain script's own catch-block
contract. Run once to catch up the backlog so the next routine drain tick's new mtime-fallback prune
doesn't `unlinkSync` ~1,283 tracked files in one shot and leave a mass-dirty tree.

**FAIL-LOUD fence:** after INSERT + prune, if `inserted > 0` and `COUNT(*) ≤ count-before-insert` → log `FAIL-LOUD` + exit 1 (INSERT or prune regression).
**Canonical script:** `scripts/agents-flow/drain-signals.js` (shipped 2026-06-07) implements §0a-1 + §0a-2 and MUST stay in sync with this spec. Edit the spec first, then the script.

**Escape hatches:** Delete `processed/` copy + DB row → re-routes on next cycle. Or bump `createdAt` → new fingerprint.

**0a-3 — Signal routing table** (applied before handing off to Step 1; as of FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN, 2026-08-08, this SAME (type, from) lookup also computes the durable envelope's `routed_to` field for both §0a-1 and §0a-D above):

| Signal `type` | From | Route | Notes |
|---|---|---|---|
| `audit-handoff` | `tran-ngoc-bau` | PO Step 0-TNB | payload = handoff file path |
| `brief_complete` | `agents-architect` | PO Step 0-SIG | payload = architecture brief path |
| `zone_missing_tier3` | `dev-team` | PO Step 0-SIG | payload = `{taskId, files, suggestedZone}` — PO opens zone-fix task next cycle |
| `improvement_proposal_lane_b` | `po` | PO Step 0-SIG | payload = proposal doc path. PO triage-signals.md creates the SPRINT-S/M batch entry and routes through the standard po→ba→architect→pm→dev-*→qa chain. Scope field in proposal doc determines SPRINT-S vs SPRINT-M. `SELF_IMPROVE_AUTO_DISPATCH` is per-dispatch-path, default `false` per path until QA records GATE-PROOF-1..5 for that path (Phase 2 / SIG-IMPL-GATE — not implemented here). |
| `repair_task_request` | `system-auditor` | PO Step 0-SIG | anomaly→task bridge; PO triage-signals.md is authoritative handler (creates {check_id}-FIX BACKLOG) |
| `ci_red` | `ci-health-probe` | PO Step 0-SIG | CI workflow RED on origin/main HEAD; payload = {check_id, failing_jobs, head_sha}; PO creates deduped FIX task (VERIFICATION GATE: ci_green_on_subsequent_push) |
| `esc-deep-dive-request` | `bctc-analyst` | ESC-DISPATCH | dev-team dispatches model=opus bctc-analyst deep-dive; guard released after spawn. File-sourced (bctc-analyst has no Bash — emits via `docs/signals/bctc-analyst-*.json`, not orch-state.json) |
| `bug-escalation` | `commit-sweep-guard` | PO Step 0-SIG | payload = string message, NOT a file path — starts `[sweep-guard] BARE commit about to absorb` (mechanism-true-positive by construction; PO triage-signals.md's dedicated row is authoritative — NEVER disposition via `git show --stat`, that is outcome not mechanism) or `[sweep-guard] INTERNAL:` (separate fail-open path, always actionable). |
| any other | any | PO Step 0-SIG | PO decides; unknown types logged + WORK notified |

**ESC-DISPATCH** (type=`esc-deep-dive-request`): handled before PO hand-off, inline this drain tick.
→ Run sub-flow: `docs/agents/dev-team/flow/drain-esc-dispatch.md`

All routed signals are appended to `pendingSignals[]` regardless of type — routing annotation is informational only; PO's `triage-signals.md` is the authoritative dispatch handler.

Non-empty `pendingSignals` feeds into Step 1 (PO Triage).
