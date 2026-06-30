<!-- BA spec — FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER | produced by ba | 2026-06-18 -->

# BA Spec: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER

**Task ID:** FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER
**Type:** FIX | **Priority:** P2 | **Zone:** apps/mcp-server/ + docs/agents/cowork-team/flow/
**BA produced at:** 2026-06-18T05:45:00Z
**PO blockers:** 0 (no PO question needed before architect starts)
**Architect ratification items:** ARCH-RATIFY-CWKSCH-1 through CWKSCH-3 (see §Blockers)

---

## Problem Statement

`docs/data/cowork-schedule.json` carries the `last_fired` cadence ledger for all 17 scheduler
slots. When a writer (cowork-team dispatcher) runs a read-modify-write cycle on this file
while holding a STALE in-memory snapshot, it writes the ENTIRE file back, clobbering the
`last_fired` stamps of every slot it did not update in that tick.

**Evidence (2026-06-18T04:07Z):** `chef-intraday` reverted to `03:23:15Z` (freshly written)
but `news-scout-offhours`, `market-watcher-offhours` reverted to `2026-06-15T08:08:57Z`, and
`bctc-analyst-slot-4` to `2026-06-15T00:06:43Z` — 3-day reversion despite fresh stamps earlier.

**Effect:** The adaptive cadence due-check in `cowork-match-slots.js` reads `last_fired` and
computes `elapsedSeconds = nowUnix - snappedLastFired`. A 3-day stale base yields an elapsed of
~259200 s, which exceeds every cadence threshold → every clobbered slot appears massively
overdue → spurious re-fire (doublefire class). The cadence ledger is corrupted for the
remainder of the dispatch cycle.

---

## Writers Identified

Two distinct write paths both own `cowork-schedule.json` and both exhibit the stale-base risk:

**Writer-A: Cloud cowork-team dispatcher (cowork-team flow, `last-fired.md` Step 5b)**
- File: `docs/agents/cowork-team/flow/last-fired.md`
- Current behaviour: single read → in-memory update for WON_SLOTS only → write full file → rename.
- Race surface: Cloud sessions run as RemoteTrigger or `*/15` CronCreate. Each session begins
  from a git-checkout that may be N minutes behind the live file on disk (the last-fired.md was
  committed once at baseline; the runtime file diverges from git HEAD after every tick).
  The session's `readFileSync` at Step 5b uses the LIVE file — but a concurrent
  sibling session that started slightly earlier may have captured its snapshot before that write
  landed, then writes back a snapshot missing the sibling's update.
- Current mitigation: none (Step 5b reads "single read" before write, which is the correct
  pattern on a non-concurrent basis, but the cloud multi-session fire creates a window).

**Writer-B: Any future/existing MCP server tool that exposes a `cowork_update_slot` API**
- Search result: no MCP tool currently writes `last_fired` directly in
  `apps/mcp-server/src/interface/mcp/tools/`. The write is pure agent-side file I/O in the
  Claude Code session.
- The `DWF-phase1-cadence.test.ts` T-13 tests exercise a `batchWriteLastFired` helper that
  IS the current last-fired.md Step 5b algorithm — confirming the write path is entirely
  in the agent-side flow, not in the mcp-server process.
- Zone note: `apps/mcp-server/` is in the task zone because the **test coverage** for the
  write logic lives there and must be extended. No production mcp-server code change is needed
  for the core fix.

---

## Requirements

### Functional Requirements

**FR-1: Fresh-read immediately before write**
DDD layer: **infrastructure** (file-system I/O discipline)
The schedule writer MUST read `docs/data/cowork-schedule.json` fresh from disk inside the
same critical section as the subsequent write — not reuse an in-memory snapshot from earlier
in the tick. The current Step 5b already has a `readFileSync` before the write. The issue is
that the stale-base risk is a CONCURRENT second writer running in parallel (sibling cloud
session) whose Step 5b read happened before the first session's rename landed. The gap is
the window between each session's read and write.

**FR-2: Single-slot CAS write (write ONLY the mutated slot's field)**
DDD layer: **infrastructure** (file-system I/O discipline)
Instead of reading the entire file, updating N slots in memory, and writing the whole file
back, each writer MUST use a targeted-set approach: read the live file → update ONLY the
specific slot(s) it won in WON_SLOTS → write back. This is the current intent of Step 5b
but must be hardened against the concurrent-session race. The fix is to make the write
idempotent and forward-only: a writer MUST NOT decrease any slot's `last_fired` value. If
the live-read value for a slot is already newer than the writer's FIRED_AT, leave it unchanged.

**FR-3: Atomic temp-rename write**
DDD layer: **infrastructure** (file-system I/O discipline)
Write to `cowork-schedule.json.tmp` then `rename` to `cowork-schedule.json`. This eliminates
partial-write corruption. Already present in Step 5b — must be confirmed present in any new
code path.

**FR-4: Monotonic guard — never decrease last_fired**
DDD layer: **domain** (cadence ledger invariant)
During the in-memory update loop (for each slot in WON_SLOTS): compare the slot's current
`last_fired` in the freshly-read live file against the writer's FIRED_AT. Write
`slot.last_fired = FIRED_AT` ONLY IF `FIRED_AT > currentLastFired` (ISO-8601 lexicographic
comparison is valid because both are UTC ISO-8601 strings). If `currentLastFired >= FIRED_AT`
(sibling already wrote a fresher stamp), leave the slot unchanged. This is the per-slot CAS
semantic that prevents stale-base clobber.

**FR-5: Flow doc update — last-fired.md**
DDD layer: **interface** (agent flow specification)
`docs/agents/cowork-team/flow/last-fired.md` Step 5b must be updated to reflect FR-4 monotonic
guard in the in-memory update loop.

**FR-6: Test coverage — concurrent writer simulation**
DDD layer: **infrastructure** (test)
The existing T-13/T-13b/T-13c tests in `DWF-phase1-cadence.test.ts` test single-writer
correctness. A new test T-14 must cover the concurrent-writer scenario: two simulated writers
each holding a DIFFERENT slot, Writer-A has a stale base (missing Writer-B's prior write),
Writer-A must NOT clobber Writer-B's slot after the monotonic guard is applied. This is the
direct verification of FR-4.

### Non-Functional Requirements

**NFR-1: No mcp-server container rebuild required**
The write logic is agent-side (Claude Code session, not mcp-server process). The test file is
in `apps/mcp-server/src/__tests__/` (bun:test runner) — adding a test requires a rebuild for
CI but not a deployment. Architect MUST confirm whether the T-14 test location stays in
`DWF-phase1-cadence.test.ts` or gets a new file.

**NFR-2: Non-fatal write failure preserved**
Per FR-P1-7 AC-P1-7-3 (already in Step 5b): write failure is non-fatal. The monotonic-guard
logic must not change this error contract.

**NFR-3: No cowork-schedule.json structural change**
The fix is write-discipline only. The JSON schema of the file (slots array, per-slot fields)
does not change.

**NFR-4: Backward-compatible with legacy slots (null last_fired)**
Slots where `last_fired == null` are the first-run case (EC-3 in match-slots.js). The
monotonic guard must treat `null` as "not yet fired = always allow write" — any non-null
FIRED_AT beats null.

---

## Edge Cases

**EC-1: Clock drift between sessions**
Two cloud sessions may have slightly different wall-clock times. The FIRED_AT of a slightly
later session should always win; ISO-8601 lexicographic compare handles this correctly because
both strings are UTC. No special handling needed beyond FR-4.

**EC-2: Writer-A wins CAS for slot-X, Writer-B also tries to update slot-X**
Only one writer actually claims a cowork-slot:<slot_id> token (task_claim, slot-claim.md Step 4.6).
So two writers updating the SAME slot in the same tick cannot occur by design of the lock system.
The FR-4 monotonic guard is defence-in-depth for the case where the lock TTL (180s) expires
before the write completes or a steal happens.

**EC-3: cowork-schedule.json missing or malformed**
FR-1 fresh-read failure — already handled by the existing catch block in Step 5b which makes
the write non-fatal. No change needed.

**EC-4: WON_SLOTS is empty**
Step 5b has an explicit guard: "Only execute if WON_SLOTS is non-empty". No change needed.

**EC-5: RemoteTrigger residual cloud sessions (12 legacy slots noted in cowork-schedule.json `_notes.phase2_residual_2026_05_20`)**
These legacy sessions fire the agent directly (not via the master dispatcher). They do NOT
write `last_fired` (they predate the Step 5b mechanism). No new write path introduced here.

---

## DDD Layer Summary

| Requirement | Layer | File(s) to change |
|---|---|---|
| FR-1 Fresh-read | infrastructure | `docs/agents/cowork-team/flow/last-fired.md` (doc clarification only — already present in code) |
| FR-2 Single-slot CAS | infrastructure | `docs/agents/cowork-team/flow/last-fired.md` |
| FR-3 Atomic temp-rename | infrastructure | already correct — confirm unchanged |
| FR-4 Monotonic guard | domain | `docs/agents/cowork-team/flow/last-fired.md` (in-memory loop body) |
| FR-5 Flow doc update | interface | `docs/agents/cowork-team/flow/last-fired.md` |
| FR-6 Concurrent-writer test | infrastructure/test | `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (new T-14) |

---

## Blockers (Architect Ratification)

No PO decisions needed. Three architect ratification items:

**ARCH-RATIFY-CWKSCH-1 — Test location for T-14**
Should the concurrent-writer test T-14 be added to the existing
`apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` or in a new file
`FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER.test.ts`? The batchWriteLastFired helper in T-13 is
inline in the test file; if T-14 reuses it, same file is cleaner.
BA recommendation: same file — no structural reason to split.

**ARCH-RATIFY-CWKSCH-2 — last-fired.md is a flow doc, not a code file**
The "code" of the write loop is agent-interpreted prose in `last-fired.md`. The fix is to
update the prose spec. Confirm that the architect's output is: (a) updated last-fired.md
spec, and (b) the T-14 test that proves the monotonic guard. There is no TypeScript
production change unless architect decides to extract the logic to a shared helper script
(e.g. `scripts/agents-flow/update-last-fired.js`).
BA recommendation: the flow spec update is sufficient; a shared helper script is optional
(architect decides based on drift risk).

**ARCH-RATIFY-CWKSCH-3 — match-slots.md cadence due-check: add `snapped_last_fired` freshness log**
The `cowork-match-slots.js` adaptive mode already logs `snapped_last_fired` for cadence-skip
decisions. The verification gate requires that the matcher "no longer reports spurious
massive-overdue." Architect should confirm whether a matcher-side guard is needed (e.g. log
a WARN if `elapsedSeconds > 48h` for a non-first-run slot — signals a clobber even after fix)
or whether the write-discipline fix alone is sufficient.
BA recommendation: the write fix is the root cause fix; matcher-side WARN is defence-in-depth
and a separate low-risk addition, not a blocker.

---

## Verification Gate (from task board row, preserved verbatim)

> After fix: two concurrent simulated writers each mutating a DIFFERENT slot must BOTH persist
> (no slot reverts to a stale base); `cowork-schedule.json` slots show monotonic `last_fired`
> (no 3-day reversion) across a multi-writer window; matcher no longer reports spurious
> massive-overdue.

T-14 test directly exercises the first gate (two concurrent writers → both persist). The
second and third gates are validated by the live schedule file having no 3-day reversion
after the fix ships.

---

## Files in Scope

| File | Change |
|---|---|
| `docs/agents/cowork-team/flow/last-fired.md` | Update Step 5b loop body: add monotonic guard (FR-4); clarify single-slot CAS semantics |
| `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` | Add T-14 concurrent-writer test (FR-6) |
| `docs/data/cowork-schedule.json` | No structural change; current state shows the clobber symptom |

**Out of scope:**
- `apps/mcp-server/src/` production TypeScript — no mcp-server code change needed
- `docs/agents/cowork-team/flow/match-slots.md` — no change needed (matcher reads correctly;
  the corruption source is the writer, not the reader)

---

## [Architect] Brownfield Findings

- **Zone:** `docs/agents/cowork-team/flow/` (flow-doc) + `apps/mcp-server/src/__tests__/` (test-only, no production mcp-server change)
  - BUILD-STANDARD: not-applicable (BUG-FIX, in-zone, no new primitives)
- **Verified paths:**
  - `docs/agents/cowork-team/flow/last-fired.md:15-41` — Step 5b pseudo-code. Fresh-read (FR-1) and atomic temp→rename (FR-3) already correct. Only the in-memory update loop body (line 28: `slot.last_fired = FIRED_AT`) requires the FR-4 monotonic guard.
  - `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts:503-524` — `batchWriteLastFired()` inline helper is the canonical Step 5b TypeScript replica. T-13/T-13b/T-13c cover single-writer correctness. T-14/T-14b/T-14c to be added here (same file — ARCH-RATIFY-CWKSCH-1 resolved).
  - `docs/data/cowork-schedule.json` — reader confirms UTC ISO-8601 `Z`-suffix timestamps throughout; lexicographic compare valid (RISK-2 cleared).
- **Reuse patterns:** Monotonic guard pattern = same forward-only write semantics as orch-state consolidate (orch-state-cutover). No new interface needed.
- **Design decisions:**
  - ARCH-RATIFY-CWKSCH-1 RESOLVED: T-14 in SAME file (`DWF-phase1-cadence.test.ts`). `batchWriteLastFired` helper must be upgraded in-place; splitting to a new file orphans the helper from its consumers.
  - ARCH-RATIFY-CWKSCH-2 RESOLVED: flow-doc spec update only — no `scripts/agents-flow/update-last-fired.js` helper. The write loop is agent-interpreted prose; a JS helper creates an execution dependency where none exists today and duplicates the SSOT.
  - ARCH-RATIFY-CWKSCH-3 RESOLVED: matcher-side `elapsedSeconds > 172800` WARN is a worthwhile canary but NOT a blocker. PM to queue as a separate 1-liner follow-on task (not bundled into this FIX).
- **Monotonic guard (FR-4):** replace line 28 of last-fired.md Step 5b loop with: `if currentLastFired === null OR FIRED_AT > currentLastFired: slot.last_fired = FIRED_AT`. The `null` branch satisfies NFR-4 (first-run). No Date parsing; ISO-8601 lexicographic compare is valid for UTC strings.
- **T-14 test shape:** 3 sub-tests — T-14 (Writer-A owns slot-a, slot-b untouched), T-14b (adversarial: stale stamp rejected by guard — this is the RED proof), T-14c (null first-run always-write). T-14b is the critical guard verification; PM must propagate this to the developer.
- **Risk flags:**
  - RISK-1: T-14 alone is GREEN even without the guard (Writer-A only mutates slot-a). T-14b is mandatory.
  - RISK-3: `DWF-phase1-cadence.test.ts` header comment "13 tests" must be updated to 16 after T-14 ships.
- **Full brief:** `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md`
- **Scan clean:** true

---

*Decision journal entry — task_id: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER*
- what-considered: "(A) New MCP tool `update_slot_last_fired` that routes writes through mcp-server DB — rejected: over-engineering for a file-I/O fix; adds deployment dependency. (B) Monotonic guard in flow spec + new test — chosen: minimal, correct, matches orch-state-cutover precedent. (C) Single writer serialized via leader lock — already present (leader-lock.md Step 0b); root cause is the stale-base within the leader's own write, not cross-session concurrent leaders."
- why-change: "Monotonic guard is the minimal correct fix that directly addresses the stale-base clobber without restructuring the dispatch flow."
