---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-p2a-durable-drain
size: M
zone: docs/agents/dev-team/flow/
depends_on: [TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES]
blocks: [FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION]
---

## TLDR
Reorder drain-signals.md §0a-1 (file drain) and §0a-D (dashboard drain) to implement append-before-destructive: batch pending signals → write durable inbox atomically → ONLY if success, perform mv/fingerprint/READ-flip. Covers BOTH file-sourced and dashboard-sourced signals (not just file plane).

## [PM] Planning Context

- **Part 2 Focus:** Signal durability (Part 1 rotation is separate task)
- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §3.1 (ordering fix), §3.4 (conservation guard — separate task but flagged here)
- **PO Ruling:** Part 2 mandatory with Part 1; Part 1 alone drops ~80% of signals on short-circuit. Both parts ship together.
- **Problem Live:** Current §0a-1 and §0a-D flow is dedup-check → [mv+fingerprint or READ→flip] → append in-memory pendingSignals[]. Step 0a is destructive-before-delivery: a tick that drains and then short-circuits (rotation picks non-triage consumer) loses all drained signals. Recovery possible only by hand-reading processed/ until 7-day prune (~363 rows currently at risk).
- **New Finding (verified this cycle):** defect exists in BOTH §0a-1 (files) AND §0a-D (dashboard) — identical unconditional-before-delivery bug shape. Part 2 must cover both channels.

### Change Scope

**File 1:** `docs/agents/dev-team/flow/drain-signals.md` (orchestration doc)
- **§0a-1 (file drain loop, lines ~40-80):** Reorder per §3.1 pattern
- **§0a-D (dashboard drain loop, lines ~20-56):** Same reordering pattern
- **§0a-3 (routing table):** No change (already tags source="file"|"dashboard")
- **Rest of file:** No change (§0a-0, §0a-prune, etc. unaffected)

**File 2:** `scripts/agents-flow/drain-signals.js` (canonical script)
- Implement §3.1's batched durable-append logic for the file channel
- This is the "spec-first per Script Persistence rule" — this file becomes the source-of-truth, then sync with any shell equivalent if it exists

### Ordering Change (§3.1 pattern, both loops)

**Current flow (both §0a-1 and §0a-D):**
```
for each new (non-dup) signal:
  [destructive: mv+fingerprint or NEW→READ]
  append to in-memory pendingSignals[]
```

**New flow (same for both, one batched append per tick):**
```
batch = []
for each new (non-dup) signal this tick:
  batch.append({envelope_id, source, from, to, type, priority, payload, createdAt, drained_at, routed_to})

if batch non-empty:
  write_result = orch-apply.sh with jq append to .dev_team_idle_chain.pending_triage_inbox
  if write_result == 0:  # success
    [destructive: mv+fingerprint for §0a-1 files; NEW→READ for §0a-D rows] for exactly the batch that was appended
  else:
    log WARN "durable-inbox append failed — retaining signals, skipping destructive drain this tick"
    # nothing moved, nothing fingerprinted, nothing flipped
```

**Key:** Batch is ONE write for the whole tick (not per-file/per-row), CAS-retry in orch-apply.sh makes 2 writes safe, all-or-nothing failure semantics.

### Envelope Structure (payload inlined, never a pointer)

Each batch entry carries full payload object, not a reference:
```json
{
  "envelope_id": "sha256(signal) hex digest",
  "source": "file" or "dashboard",
  "from": "cowork-team",
  "to": "dev-team",
  "type": "dispatcher-telemetry",
  "priority": "normal",
  "payload": { ...full signal object... },
  "createdAt": "2026-07-29T13:50:00Z",
  "drained_at": "2026-07-29T13:50:15Z",
  "routed_to": "step1_triage"  // from §0a-3 routing table
}
```

### Acceptance Criteria

- [ ] §0a-1 (file loop) reordered per §3.1: batch build → durable append → destructive only on success
- [ ] §0a-D (dashboard loop) reordered identically: batch build → durable append → destructive only on success
- [ ] Both loops write source="file"/"dashboard" tag (already done, confirm no regression)
- [ ] `jq --argjson batch` pattern used for batch serialization (same as existing orch-apply patterns)
- [ ] On orch-apply.sh success: file moved, fingerprint written, dashboard rows flipped (only entries in successful batch)
- [ ] On orch-apply.sh failure (CAS retry exhausted, Zod validation fail, etc.): no destructive action, signals retained in inbox for retry, warning logged
- [ ] drain-signals.js implements canonical version; if shell script equivalent exists, verify parity

### Files to Read First

- `docs/agents/dev-team/flow/drain-signals.md` (full file, understand §0a structure)
- `scripts/agents-flow/drain-signals.js` (understand existing structure, read the test)
- `scripts/agents-flow/drain-signals.test.js` (understand test pattern for AC-2 harness)
- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§3.1, §3.4, full durability spec)
- `docs/data/orch/orch-state.json` (.signal_queue structure, .dev_team_idle_chain location)
- `scripts/orch-apply.sh` (understand CAS semantics)

### Files to Create

None (modifying existing files only)

### Files to Modify

- `docs/agents/dev-team/flow/drain-signals.md` — reorder §0a-1 and §0a-D per §3.1 pattern
- `scripts/agents-flow/drain-signals.js` — implement batched append logic

### Dependencies

- **Blocks:** FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION (needs durable inbox to exist)
- **Depends on:** FIX-DEVTEAM-IDLE-CHAIN-S1-SCHEMA-SELECTION (schema key must exist)
- **Parallel siblings:** Can be developed in parallel with P1A-MAIN-ROTATION (no file overlap)

### Knowledge Needed

- drain-signals.md current flow (§0a loops, dedup, mv, fingerprint, READ flip)
- jq batch patterns + orch-apply.sh contract
- envelope_id computation (SHA256 hash, existing examples available)
- Failure mode handling (destructive only on verified success)
- Why payload is inlined not pointer-based (dangling-ref bug class from FIX-DRAIN-PAYLOAD-REF-DANGLE)

### Risk & Constraints

- **Two channels, one semantic:** Both §0a-1 (files) and §0a-D (dashboard) must be changed together and tested together; asymmetric changes corrupt the system (e.g., files durably appended but rows not → inbox has orphan file references, or vice versa)
- **Destructive action scoping:** Must scope the destructive loop to exactly the entries in the successfully-appended batch; a partial append success + full destructive execution = data loss
- **Error recovery:** If orch-apply.sh fails, RETAIN all signals in inbox (the log is the only side effect); next tick's drain will try again
- **Forward-looking:** This task assumes .dev_team_idle_chain.pending_triage_inbox exists (schema from S1 task), if not present at runtime jq must treat as `[]` by default

---

## [Developer] Implementation Record

- **Files modified:**
  - `docs/agents/dev-team/flow/drain-signals.md:21-97,128-159,197` — §0a-D reordered to claim→build-envelope→ONE combined `orch-apply.sh` write (durable append + NEW→READ flip atomically, same file) → release; §0a-1 reordered to classify(non-destructive)→build batch→durable append gate→destructive mv/fingerprint/DB-INSERT only on success; §0a-3 gains a one-line note that its table now also resolves the envelope `routed_to` field. Header size-justification changelog updated (150L→216L).
  - `scripts/agents-flow/drain-signals.js:34-58,131-268,357-419` — hoisted `JQ_MAX_BUFFER` to module scope (was local to `repointPayloadRefs`); added `ROUTING_TABLE`/`computeRoutedTo()` (mirrors drain-signals.md §0a-3); split the main loop into Pass 1 (classification-only, builds `candidates[]` + this tick's durable `batch[]`) and Pass 2 (destructive mv/fingerprint/DB-INSERT, gated on `appendDurableBatch()`'s return); new `appendDurableBatch(batch)` function (CAS-retry loop, same shape as the existing `repointPayloadRefs()`).
- **Tests written/modified:** `scripts/agents-flow/drain-signals.test.js` — split the old AC7 scenario (no orch-state.json seeded) into a durable-append-FAILURE regression (file retained, not moved, WARN logged — the new correct behavior for that harness shape) + a new durable-append-SUCCESS scenario on `makeOrchRefHarness()` (real `orch-apply.sh`/`orch-validate.mjs`/`orchStateSchema.ts` chain) asserting golden stdout AND `pending_triage_inbox[]` contents (`envelope_id`, `source`, `from`/`type`, `routed_to` via the routing-table lookup, payload deep-equal/inlined). 46/46 GREEN (36 pre-existing unmodified scenarios + 10 new/changed assertions).
- **Git commits:** (pending — committed together with this record, see notebook entry)
- **tsc status:** clean ✓ (`bun tsc --noEmit`, 0 errors — no TS files touched, zone is docs+scripts only)
- **Full suite:** `scripts/agents-flow/drain-signals.test.js` 46/46 pass / 0 fail ✓ (dedicated suite for the changed script; no `apps/mcp-server/src/**` touched so the full `bun test` 14885-test suite is structurally out of this change's blast radius — confirmed via grep, only a comment-reference to this script exists in `orchStateSchema.ts`)
- **Docs updated:** `docs/agents/dev-team/flow/drain-signals.md` (the spec itself, SSOT — edited first per its own "Edit the spec first, then the script" rule) | `docs/WORK.md` (one-liner appended)
- **Graphify:** NOT run — no Skill-tool path available to this spawned agent (structural constraint; matches prior sibling developer WORK.md entries, e.g. FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT) — flagged here, not silently skipped. `drain-signals.md` IS impacted (primary target of this task) so this step is NOT exempt via the "no docs impacted" skip clause; the graph node for this file will be stale until a session with Skill-tool access runs `/graphify docs --update --no-viz`.
- **Simplicity gate:** PASS — Q1 scope clean (every new field/function traces to an explicit AC — envelope structure, batch pattern, routed_to lookup), Q2 no single-use speculative abstractions (`appendDurableBatch`/`computeRoutedTo` mirror this same file's pre-existing one-call-site helper convention, e.g. `repointPayloadRefs`/`gatherLiveReferencedBasenames`), Q3 senior-test clean (2-pass split IS the correctness fix, not indirection), Q4 ratio <50% overhead (near-100% of the diff is AC-driven)
- **Scope note:** `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` (Step 1's durable-inbox read/clear) and `FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE` (dedicated AC-2 negative-control harness `drain-signals-durable.test.js` + `orch-conservation-check.mjs` §3.4 extension + dev-standards.md pointers) are separate, already-PM-decomposed downstream rows — not implemented here, per this task's own "Files to Create: None" / "Files to Modify" scope.
