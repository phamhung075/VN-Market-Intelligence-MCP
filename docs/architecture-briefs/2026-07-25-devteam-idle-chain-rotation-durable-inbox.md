# Architecture Brief — FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION

**Date:** 2026-07-25 · **Architect** · **Zone:** `docs/agents/dev-team/flow/` (+ 1 schema line in `apps/mcp-server/src/infrastructure/orchStateSchema.ts`)
**Input:** PO ruling `docs/agent-memory/decisions/ruling-20260725T1101Z-devteam-idle-chain-po.md` (design PRE-SELECTED — aged round-robin + durable signal handoff, two co-required parts) + `scripts/po-s150-devteam-idle-chain-fairness-ruling-20260725T1059.jq` (the applied board mutation, already live) + board row `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (AC-1..AC-4).
**Mode:** `plan_only:true`, `supervised:true` — design/ratification only, this cycle makes **zero** edits to `docs/agents/dev-team/flow/main.md` or `drain-signals.md`. Implementation is a separate downstream dispatch.
**BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new microservice — extends the existing dev-team flow-doc + orch-state schema, no new primitives).

I am **not** re-litigating the design. PO's choice (aged round-robin over 5 consumers + durable inbox) is accepted as correct and is what this brief mechanizes. Everything below is the "architect may refine the mechanism" latitude PO explicitly granted.

---

## 1. Brownfield verification (live, this session — not inferred from the task prompt)

Read in full: `docs/agents/dev-team/flow/main.md` (876L), `docs/agents/dev-team/flow/drain-signals.md` (154L), `docs/agents/dev-team/flow/execute-tier.md` (§1-70), `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (§4-8), `scripts/audits/devteam-dispatch-gate-satisfiability.sh`, `scripts/agents-flow/drain-signals.js`, `scripts/agents-flow/drain-signals.test.js`.

Confirmed exactly as PO's ruling states:
- Fixed-priority chain, control-flow-provable: BOUNDED-1 `JUMP TO execute` at `main.md:514`; Supervised-Lane Sweep `JUMP TO end` at `:575`; Ready-Lane Consumer `JUMP TO end` at `:628`; Review-Lane QA-Drain `JUMP TO end` at `:679`; Step 1 PO Triage reachable only at `:695`, only if all four decline.
- `pendingSignals` is a pure in-conversation artifact: `drain-signals.js` never writes it — main.md's own instruction is "Read its stdout report into `pendingSignals[]` **routing**" (drain-signals.md:88), i.e. the calling agent (LLM) re-derives the array from human-readable log lines every tick. There is no file, DB row, or orch-state key holding it between tool calls. Grep confirms: appears in flow docs + PO's ruling + one isolated test harness only, in zero production script and zero orch-state key.
- Step 0a-1 (`docs/signals/*.json` files) is destructive-before-delivery: dedup → `mv` to `processed/` + fingerprint DB INSERT → **then** append to the in-memory array (drain-signals.md §0a-1, mirrored 1:1 in `drain-signals.js` — the move happens inside the same loop that would build the report).
- Worked example reproduced: `docs/signals/processed/context-bloat-docs-agent-memory-notebooks-agent-father-md-2026-07-25T065216Z.json`, `cowork-team-20260725T041051Z.json`, `cowork-team-20260725T103911Z.json`, `notebook-unparseable-docs-agent-memory-notebooks-agent-father-md-2026-07-25T065214Z.json`, and the other 8 named in the task are all present in `docs/signals/processed/` right now — verified via `ls`.

**New finding this cycle (widens Part 2's scope — verified, not assumed):** the identical defect shape exists in **§0a-D** (`drain-signals.md:21-56`, the `docs/data/orch/orch-state.json .signal_queue.rows[]` cross-team inbox drain), not only §0a-1. Its loop marks `row NEW → READ` (line 53) **unconditionally**, in the same per-row pass that appends to `pendingSignals[]` with `source="dashboard"`. On a subsequent tick, §0a-D only ever collects `status=NEW` rows (line 25) — a row already flipped to READ is never re-collected, whether or not Step 1 actually consumed it. Dashboard-sourced signals get a longer *physical* grace period (48h until the archival prune in §0a-D-PRUNE deletes the row, vs. §0a-1's immediate fingerprint-permanent dedup) but the *logical* defect — "marked processed before the sole consumer confirms receipt" — is identical. **Part 2 must cover both channels**, not only the file-sourced one the task description illustrates. This is exactly why both loops already tag `source="file"`/`source="dashboard"` — the routing table (drain-signals.md §0a-3) was already designed to let a downstream consumer branch on origin; durability was simply never wired to either.

**Confirmed NOT in scope for Part 2:** `read_telegram_reports(status="new")` / `list_unresolved_reports()` (used directly by Step 1, `main.md:711`) are live MCP-backed store queries, not per-tick derived artifacts — a report stays `new`/`unresolved` until PO explicitly actions it, independent of whether this tick's Step 1 runs. No loss-on-short-circuit risk there.

**Schema constraint verified:** `OrchStateSchema` (root) is `.strict()` (`orchStateSchema.ts:340-360`, enumerates exactly 10 keys) — a new root key requires one explicit schema line, it cannot be added by convention alone the way `.head`'s `.passthrough()` fields can. `task_board` is also `.strict()` (9 enumerated lanes + metadata). `signal_queue` is `.strict()` too. There is an existing, precedented pattern for exactly this kind of loosely-typed dispatcher-internal bookkeeping blob living at root: `narrative: z.record(z.unknown()).optional()`, `dashboard_section_cache: z.record(z.unknown()).optional()`, `session_handoff_status: z.record(z.unknown()).optional()` (`orchStateSchema.ts:350-355`). The design below follows that precedent rather than inventing a new one.

---

## 2. Part 1 — Aged round-robin

### 2.1 New durable state (schema change, 1 line)

Add to `OrchStateSchema` (§8, alongside `narrative`/`dashboard_section_cache`):
```ts
// FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION — dispatcher-internal bookkeeping,
// same precedent as narrative/dashboard_section_cache/session_handoff_status: loosely
// typed, not a user-facing/cross-agent contract, doesn't need a fully enumerated shape.
dev_team_idle_chain: z.record(z.unknown()).optional(),
```
This is the **only** schema-level change required. `task_board` and `signal_queue` stay byte-unchanged.

Live shape (illustrative — not enforced field-by-field, matches the `z.record(z.unknown())` looseness of its siblings):
```json
{
  "rotation": {
    "bounded1":     {"last_served_tick": null},
    "sls":          {"last_served_tick": null},
    "rlc":          {"last_served_tick": null},
    "qa_drain":     {"last_served_tick": null},
    "step1_triage": {"last_served_tick": null}
  },
  "pending_triage_inbox": [],
  "_updated_at": "2026-07-25T12:00:00Z",
  "_updated_by": "dev-team"
}
```

### 2.2 Selection algorithm (replaces the fixed sequential fall-through)

Runs at the exact point the current chain begins — `main.md`'s head-idle fall-through (after Step 0b determines `.head` is idle/missing, **before** any of the 4 promote/claim blocks or Step 1 run):

```
candidates = [bounded1, sls, rlc, qa_drain, step1_triage]
for c in candidates: c.stamp = rotation[c].last_served_tick ?? "1970-01-01T00:00:00Z"   # missing/null = oldest — guarantees a first turn before any repeat
sort candidates ascending by stamp; tie-break by the fixed declared order above (only matters on the all-null bootstrap tick)
SELECTED = candidates[0]
```

New read-only script: `scripts/lib/devteam-eligibility.jq` gains one function (this file already exists precisely to be the one shared def-set for BOUNDED-1/SLS/RLC/QA-Drain predicates — the "one shared contract" principle it states for itself applies directly here, no new file needed for the *selection* logic):
```jq
def rotation_selected($doc):
  ($doc.dev_team_idle_chain.rotation // {}) as $r
  | ["bounded1","sls","rlc","qa_drain","step1_triage"]
  | map({id: ., stamp: ($r[.].last_served_tick // "1970-01-01T00:00:00Z")})
  | sort_by(.stamp)
  | .[0].id;
```

`main.md` dispatches on `$SELECTED` (e.g. a `case` over the 5 ids) and runs **exactly that one** consumer's existing block, **verbatim, byte-unchanged** — same gate line (`WIP<1`, `WIP2<2`, `WIP3<2`, `QA_WIP<1`), same promote+claim jq scripts, same dispatcher-wrap/spawn contract. This is the whole point: the fairness fix is *which lane gets a turn*, never *what a lane does with its turn*.

- If `$SELECTED` actually dispatches (head becomes `in_progress` / a row moves) → `JUMP TO end`, unchanged from today.
- If `$SELECTED`'s own gate/promote/claim finds nothing (genuine no-op — gate saturated, or nothing eligible) → **do not cascade** to the next candidate this tick (see §2.4 for why) → stamp still advances (§2.3) → fall through to a revised Session Gate (§2.5).

### 2.3 Stamp update (single new small write, unconditional)

Immediately after the selected consumer's block runs (dispatch or no-op, either way), one small additional `orch-apply.sh` write, decoupled from whether the consumer's own script touched the board:
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg now "$NOW" --arg c "$SELECTED" \
  '.dev_team_idle_chain.rotation[$c].last_served_tick = $now
   | .dev_team_idle_chain._updated_at = $now | .dev_team_idle_chain._updated_by = "dev-team"' \
  docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
```
Deliberately kept as a **separate** write rather than threading it into each of the 6 existing promote/claim scripts — smaller diff (0 lines changed in `devteam-backlog-promote-bounded1.jq`, `-claim-bounded1.jq`, `-promote-supervised-lane-sweep.jq`, `-claim-supervised-lane-sweep.jq`, `-claim-ready-lane-consumer.jq`, `-claim-qa-drain.jq`), and CAS-retry in `orch-apply.sh` already makes a second small write safe. A developer may fold it into the same transform as a micro-optimization; not architecturally required.

**Fairness bound this guarantees:** each tick strictly picks the single oldest-stamped consumer and stamps it to `now()` — the freshest value of the 5 — so it cannot be picked again until the other 4 have each had a turn. In any window of 5 consecutive idle-fallthrough ticks, every consumer is served **exactly once**. At the `7,37 * * * *` cadence (~30min), worst-case wait between two turns of the *same* consumer is 4 intervening ticks (≤ ~2.5h) — a bounded, provable-by-construction improvement over the measured 7/7-vs-0/7 (unbounded starvation) baseline.

### 2.4 Rejected alternative: same-tick cascade

Considered: if `$SELECTED` is a genuine no-op, fall through to the next-oldest candidate in the *same* tick (uses the idle capacity instead of wasting the tick). Rejected:
- It reintroduces a **smaller-scope version of exactly the defect being fixed** — whichever candidate is 2nd/3rd/4th/5th in the cascade order for that tick is, on ticks where the 1st is momentarily empty, subject to a fixed-priority race again. Since ties/cascade order have to be arbitrary, repeated empty-first-picks would silently degrade fairness back toward something resembling today's problem.
- Empirically near-free to skip: **all five lanes are currently deeply backlogged** (backlog=390, ready=44 incl. 18 P0, review=105 with 73 `next_agent=qa`, drained-but-unrouted signals=363 in 7d) — the realistic "wasted tick" case (selected consumer legitimately has nothing) is rare today. If a future audit shows a lane running dry often enough to matter, a *bounded* cascade can be added later as a narrow follow-up; it is not needed to satisfy AC-1 and would complicate the fairness proof for no measured benefit right now.
- No cascade = the round-robin invariant in §2.3 is provable by inspection alone (exactly one stamp changes per tick). A cascading design would need a second, separate proof for "cascade doesn't degrade to priority-order under sustained emptiness."

### 2.5 Session Gate — avoid false "Dev loop idle" telegrams

Today's Session Gate (`main.md:689-690`) fires "Dev loop idle" only when `.task_board` is (practically) empty AND no Telegram reports AND `pendingSignals` empty — evaluated after **all four** lanes decline. Under rotation, only **one** lane is tried per tick, so a no-op turn (e.g. it's QA-Drain's turn and `review[]` momentarily has zero `next_agent=='qa'` rows) does **not** mean the loop is idle — `backlog[]`/`ready[]`/the durable inbox may all still be full, just not this consumer's slice. Design: keep the SAME truly-idle predicate (`task_board` empty AND no reports AND durable inbox empty), but evaluate it, not "assume idle because this one lane found nothing." A no-op turn where the true-idle predicate is false → **silent** `JUMP TO end` (no Telegram), avoiding a misleading "idle" spam roughly 4 times out of 5 ticks once rotation is live.

---

## 3. Part 2 — Durable `pendingSignals` handoff

### 3.1 Ordering fix (the load-bearing change)

Current order (both §0a-1 file loop and §0a-D dashboard loop, same shape): `dedup-check → [destructive: mv+fingerprint, OR NEW→READ flip] → append to in-memory array`.

New order: `dedup-check → build envelope (no destructive action yet) → ONE batched durable-inbox append for the WHOLE tick's new-signal batch, verified success → ONLY THEN perform the destructive action for exactly the batch that was durably appended`.

```
# §0a-1 (file) and §0a-D (dashboard), same pattern, one shared batch per tick:
batch = []
for each new (non-duplicate) signal this tick:
  batch.append({envelope_id: sha256(...), source: "file"|"dashboard", from, to, type, priority,
                payload, createdAt, drained_at: now(), routed_to: <0a-3 routing annotation>})

if batch non-empty:
  write_result = jq --argjson batch "$(json batch)" \
    '.dev_team_idle_chain.pending_triage_inbox += $batch
     | .dev_team_idle_chain._updated_at = $now | .dev_team_idle_chain._updated_by = "dev-team"' \
    docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
  if write_result != 0:
    log "[dev-team] WARN: durable-inbox append failed — retaining ALL {n} signals in inbox for retry, skipping destructive drain this tick"
    # Mirrors the existing §0a-0 "signals.db unavailable — skipping drain, inbox retained for retry"
    # convention already in drain-signals.md. Nothing moved, nothing fingerprinted, nothing flipped.
  else:
    # ONLY NOW: mv+fingerprint+DB-INSERT for §0a-1 files; NEW→READ flip for §0a-D rows — both
    # scoped to exactly the entries in this successfully-appended batch.
```

Batched (one write for the whole tick), not per-file — cuts CAS-retry contention vs. N separate orch-apply calls, and gives clean all-or-nothing failure semantics for the tick (no partial durable/partial-destroyed state).

**Payload is inlined, never a pointer.** Deliberately avoids the `payload_ref`-dangling class of bug that `FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE` had to fix for `signal_queue.rows[].payload_ref` — the durable inbox entry carries the full `payload` object, so a later file move/prune can never orphan a reference into it.

### 3.2 Consumption (Step 1's rotation turn)

When `$SELECTED == step1_triage`:
```
pendingSignals = jq '.dev_team_idle_chain.pending_triage_inbox' docs/data/orch/orch-state.json
# ^ this IS today's pendingSignals[] argument to the po spawn — now durable, and may contain
#   entries carried over from N prior ticks where step1_triage wasn't selected, not just this tick's fresh drain.
if pendingSignals empty AND read_telegram_reports(new) empty AND list_unresolved_reports() empty:
  # no-op turn, same as today's "PO returns NOTHING -> idle EXIT"
else:
  spawn po with pendingSignals + reports + task_board  (dispatcher-wrap unchanged from today's Step 1)
  # after po's spawn completes successfully:
  consumed_ids = [e.envelope_id for e in pendingSignals]
  jq --argjson ids "$(json consumed_ids)" \
    '.dev_team_idle_chain.pending_triage_inbox |= map(select(.envelope_id as $i | ($ids|index($i))|not))' \
    docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
```
Subtracts by `envelope_id`, not a blind `= []` — defensive against an entry landing between the read and the clear (SF-1 + fire-election make this vanishingly unlikely with a single dev-team session active, but costs nothing to guard).

**Failure-mode direction is deliberately duplicate-safe, not loss-safe-by-omission:** if the session crashes after PO successfully triages (BATCH written to board) but before the clear-write lands, the next `step1_triage` turn re-delivers the same already-actioned signals to PO. This is a **duplicate**, not a loss — and PO's own `triage-signals.md` already carries dedup guards for the signal types that mint board rows (e.g. `zone_missing_tier3`: "check `.task_board` for an existing open entry... dedup on `taskId` field"). Re-delivery of an already-handled signal is a low-cost, largely idempotent event; silent loss is not. This asymmetry is the reason the design always errs toward "leave it in the inbox" on any uncertainty.

### 3.3 Worked example — the 10:37Z tick, replayed under this design

The 12 destroyed signals (`context-bloat-*`, `cowork-team-*` ×7, `notebook-unparseable-*` ×2, etc.): under the current design, the drain ran, appended them in-memory, moved+fingerprinted them, then BOUNDED-1 claimed `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` and `JUMP TO execute` — Step 1 never ran, the 12 were gone from the live/routable plane the instant the `mv` happened.

Under this design, same tick: §0a-1/§0a-D build the 12-entry batch, append it durably to `pending_triage_inbox[]` (verified success), *then* perform the mv/fingerprint/READ-flip. Rotation-select picks whichever of the 5 consumers has the oldest stamp — say it's `bounded1` again (plausible, since it had presumably never been "served" under the old always-wins semantics either, and its own promote/claim finds the P0 row eligible) → it claims + dispatches → `JUMP TO end`. The 12 signals are **not lost**: they sit in `pending_triage_inbox[]` until `step1_triage`'s stamp comes up oldest (within ≤4 more ticks, §2.3's bound) — at that point Step 1 runs with all 12 (plus anything drained in the intervening ticks) still present, triages them, and clears exactly those it handled.

### 3.4 Conservation-guard gap (found this cycle, recommend closing in the same task)

`scripts/orch-conservation-check.mjs` defines `signal_total(doc) = length(signal_queue.rows)` only (`:98`) — it does **not** cover the new `pending_triage_inbox[]`. This is the exact bug class `FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER` was built to close for `task_board`/`signal_queue` (a full-doc-collapse write passing schema validation with zero warning, commit `de595a44`). A bug in the new append/clear logic that wipes the whole inbox instead of the consumed subset would currently pass the conservation guard silently. Recommend extending `signal_total(doc)` to `length(signal_queue.rows) + length(dev_team_idle_chain.pending_triage_inbox // [])` — one-line change, same file, same circuit breaker, no new metric/threshold needed. Not a hard blocker for AC-1/AC-2, but should not be deferred past this task given how directly it mirrors a bug this codebase has already been bitten by once.

---

## 4. Recovery sweep — explicit disposition: **OUT OF SCOPE for this task**

Checked live: `signals_processed` (7-day window) holds 363 rows `result='routed-to-po'`; 318/363 (88%) of the corresponding `docs/signals/processed/*.json` files are **still on disk** (not yet past the 7-day file-prune) as of this session — so a recovery window exists today but is closing daily.

Sampled the composition (`sqlite3` group-by on `from_agent`/`type`) rather than assuming: it is **mixed**, not uniformly noise —
- `cowork-team` (`cowork-fire`/`tick_telemetry`/`dispatcher-telemetry`, ~90 rows) and `context-bloat-backstop-hook`/`notebook-auto-prune-hook` breach signals (~78 rows) are routine governance telemetry, most already actioned by their own independent remediation paths (not solely reliant on PO triage).
- `bctc_signal`/`bctc-data-quality-anomaly`/`data-coverage-gap` (~160 rows, `unknown` + `bctc-analyst-slot-*` + `bctc-analyst`) look like genuinely-actionable financial-data-quality signals that plausibly should have been triaged and were not.

Given the mix, and that reprocessing ~363 historical envelopes (many likely stale/superseded by now, some possibly still relevant) is itself a judgment call about *value*, not a mechanical correctness question — **this is a PO decision, not an architect one.** Recommend PO independently mint (or explicitly decline) a bounded, dry-run-first one-time recovery task, following the same convention as `scripts/audits/purge-legacy-processed-signals.sh` (`--dry-run` default, count+sample only). Not folded into this task's AC set — PO's ratified AC-1..AC-4 are forward-looking (fairness + durability going forward) and do not mention historical backfill. Flagging explicitly per the instruction not to narrow scope silently, rather than assuming "out of scope" without saying so.

---

## 5. Hard constraint verification — AC-3 (BOUNDED-1 cap byte-unchanged)

This design requires **zero** changes to `scripts/devteam-backlog-promote-bounded1.jq`, `scripts/devteam-backlog-claim-bounded1.jq`, or the `WIP=$(jq '.task_board.in_progress|length' ...); if [ "$WIP" -lt 1 ]` gate (`main.md:503-504`). Rotation governs *whether BOUNDED-1's block is entered this tick at all* (§2.2) — it never touches what happens *inside* the block. AC-3's required diff-level proof reduces to: `git diff` on those two files + the `WIP -lt 1` line is empty after implementation. No design decision here creates pressure to raise the cap — the fix's entire premise (per PO's ruling) is that BOUNDED-1 stops winning *every* tick, not that it needs more capacity.

---

## 6. Files to create / modify (for the downstream implementation task)

| File | Change | Layer |
|---|---|---|
| `apps/mcp-server/src/infrastructure/orchStateSchema.ts` | +1 line: `dev_team_idle_chain: z.record(z.unknown()).optional()` on `OrchStateSchema` (§8) | infrastructure (schema) |
| `docs/agents/dev-team/flow/main.md` | Replace the fixed BOUNDED-1→SLS→RLC→QA-Drain sequential-fallthrough (§496-686) with: rotation-select → single-consumer dispatch (verbatim reuse of each existing block) → stamp write → revised Session Gate (§2.5). Step 1 (§695-717) gains the durable-inbox read/clear (§3.2) in place of the in-memory `pendingSignals[]` build. | interface (orchestration doc) |
| `docs/agents/dev-team/flow/drain-signals.md` | Reorder §0a-1 and §0a-D per-item processing per §3.1 (durable-append-before-destructive-action); both loops write into the ONE `pending_triage_inbox[]` with `source` tag preserved. | interface (orchestration doc) |
| `scripts/agents-flow/drain-signals.js` | Implement §3.1's batched durable-append-then-move for the file channel (canonical script — spec-first per Script Persistence rule, then sync script). | infra/tooling script |
| `scripts/lib/devteam-eligibility.jq` | + `rotation_selected($doc)` (§2.2) — one function in the existing shared-predicate library, no new file. | infra/tooling script |
| NEW `scripts/devteam-idle-chain-stamp.jq` (or inline in main.md) | §2.3 stamp write | infra/tooling script |
| `scripts/orch-conservation-check.mjs` | §3.4: widen `signal_total()` to include `pending_triage_inbox` length | infra/tooling script |
| `scripts/audits/devteam-dispatch-gate-satisfiability.sh` | Extend, do not fork (AC-4 explicit instruction) — see §7 | test/instrument |
| NEW test (pattern: `scripts/agents-flow/drain-signals.test.js`, mkdtemp, never live orch-state.json) | AC-2 negative control — see §7 | test |
| `docs/policies/dev-standards.md` | CANONICAL pointer entries for the new/changed scripts (Script Persistence rule) | docs |

No `apps/mcp-server/src/domain/**` touch — this is dispatcher/orchestration-doc + schema-passthrough-field work, zero business-rule surface. No new MCP tool.

---

## 7. Test strategy (mapped to PO's ratified AC-1..AC-4)

- **AC-1 (fairness):** extend `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (already builds a live-shaped saturated fixture with `backlog>0`/`ready>0`/`review>0` and replays the real promote/claim scripts) to simulate N=6+ consecutive idle-fallthrough ticks against the rotation-select function, asserting: (a) each of the 5 consumer ids appears as `$SELECTED` at least once within the first 5 ticks, (b) no id is selected twice before all 5 have been selected once, (c) the drain/dispatch each selected tick actually fires and drains (reuses the script's existing per-lane drain assertions, gated by the rotation instead of the current fixed order).
- **AC-2 (durability, negative control):** NEW isolated mkdtemp harness, same isolation pattern as `drain-signals.test.js` (own `orch-state.json` fixture per scenario, never the live file). Scenario: seed `docs/signals/*.json`, run the drain, THEN simulate a short-circuit (rotation picks a non-`step1_triage` consumer) — assert (1) the source files are gone/fingerprinted (destructive step still ran, since durable-append succeeded), (2) `pending_triage_inbox[]` contains all N entries, byte-identical payload. Run a second simulated tick with `step1_triage` selected — assert PO receives exactly those N entries and the inbox is cleared to `[]` (or to the residual if a concurrent append is also simulated). A THIRD scenario forces the durable-append write to fail (e.g. point `orch-apply.sh` at a read-only fixture) — assert NO destructive action occurred and the source files/rows are untouched (the "retain on failure" branch, §3.1).
- **AC-3 (no cap change):** `git diff -- scripts/devteam-backlog-promote-bounded1.jq scripts/devteam-backlog-claim-bounded1.jq` empty; grep `main.md` for the literal `WIP -lt 1` line unchanged.
- **AC-4 (satisfiability, not just resolution):** per PO's explicit instruction, this is the SAME instrument as AC-1 (`devteam-dispatch-gate-satisfiability.sh`), not a new one — the AC-1 extension above IS the AC-4 deliverable. Explicitly heed the file's own recorded lesson (its header already documents the `bounded1-supervised-lane-report.sh` false-green precedent): the new assertions must prove the rotation-select mechanism actually FIRES the correct lane and DRAINS it each tick, not merely that `rotation_selected()` resolves to a plausible id in isolation.

---

## 8. Risk flags

- **Migration/bootstrap tick:** first tick after this ships, `.dev_team_idle_chain` is absent from the live file — `rotation_selected()` must treat a fully-missing `dev_team_idle_chain` key identically to all-null stamps (already handled by the `// {}` / `// "1970-01-01T00:00:00Z"` defaults in §2.2's jq) — no separate migration script needed, this is a self-healing default exactly like `.head`'s v1→v4 self-heal already documented in `main.md:448`.
- **Rotation state loss on a rare full-doc issue:** `.dev_team_idle_chain` sits under the SAME `orch-apply.sh` Zod+CAS+conservation gate as everything else — no new failure mode beyond what already exists for `narrative`/`dashboard_section_cache`.
- **Do not let the inbox silently grow unbounded:** if `step1_triage` is starved for an unusually long stretch (e.g. dev-team offline for days), `pending_triage_inbox[]` accumulates. Given the round-robin bound (§2.3, ≤5-tick worst case under normal ticking), this should self-correct quickly once ticking resumes; still worth a cheap non-gating visibility line (e.g. in an existing audit script) if the inbox ever exceeds, say, 200 entries — not required for AC-1/AC-2, flagged for the implementing developer's judgment.
- **`docs/policies/dev-standards.md` Shared SSOT files list** already names `docs/data/orch/orch-state.json` as hard-triggering sequential dispatch — this task's implementation (schema + 2 flow docs + several scripts) should be dispatched as ONE sequential unit, not parallel-worktree-isolated, since every file change coordinates around the same new `dev_team_idle_chain` key.

---

## RETURN
DONE: Architecture brief complete — aged round-robin (5-consumer, provable ≤5-tick fairness bound, zero change to existing per-lane gates) + durable `pending_triage_inbox[]` (widened, verified-live, to cover BOTH §0a-1 file-sourced AND §0a-D dashboard-sourced signals; durable-append-before-destructive-action ordering; duplicate-safe not loss-safe failure direction) + 1-line schema addition + conservation-guard gap flagged + recovery-sweep disposition (explicitly OUT of scope, PO's call) + AC-1..AC-4 test strategy mapped to the existing `devteam-dispatch-gate-satisfiability.sh` instrument (extended, not forked, per AC-4's explicit instruction).
ZONE: docs/agents/dev-team/flow/ (+ apps/mcp-server/src/infrastructure/orchStateSchema.ts, 1 line)
NEXT: pm — decompose into atomic dev tasks per §6's file list; implementation is a SEPARATE downstream dispatch (this row stays `plan_only:true` — do not auto-advance past architect). SUPERVISED HOLD in effect.
HANDOFF: this brief; PO ruling `docs/agent-memory/decisions/ruling-20260725T1101Z-devteam-idle-chain-po.md`; board row `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`.
PIPELINE: continue (supervised — do not auto-advance past architect)
