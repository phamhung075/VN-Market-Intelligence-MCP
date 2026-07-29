---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-test-durable
size: M
zone: docs/agents/dev-team/flow/
depends_on: [FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION]
blocks: []
---

## TLDR
Implement AC-2 negative-control test harness (new `scripts/agents-flow/drain-signals-durable.test.js`) + extend conservation guard in `scripts/orch-conservation-check.mjs` (§3.4) + add Script Persistence pointers to `docs/policies/dev-standards.md` for all new/changed scripts in this fix.

## [PM] Planning Context

- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §3.2-3.4 (consumption, durability testing, conservation guard)
- **Acceptance Criteria:** AC-2 (durability negative control, isolated harness), AC-3 (byte-proof via diff, not test), plus conservation guard (flagged as gap to close)
- **Test Pattern:** Existing `scripts/agents-flow/drain-signals.test.js` — mkdtemp isolation, never touch live orch-state.json, pattern to follow
- **Three Subtasks:** AC-2 test harness + conservation guard extension + docs pointer (combined into one task for developer convenience)

### Subtask 1: AC-2 Durability Test Harness (NEW)

**File:** `scripts/agents-flow/drain-signals-durable.test.js` (new test)

**Purpose:** Negative control — prove that a tick draining signals + short-circuiting to dispatch lane does NOT lose those signals (they sit in durable inbox until Step 1 gets its turn).

**Pattern:** mkdtemp isolation (read `drain-signals.test.js` existing pattern), own orch-state.json fixture per scenario, never live file

**Scenarios:**

1. **Scenario 1: Append succeeds, destructive happens**
   - Seed `docs/signals/*.json` (3-5 test files)
   - Run drain (§0a logic): build batch → append to durable inbox → destructive (mv/fingerprint)
   - Assert: files moved to processed/, fingerprints written to signals.db
   - Assert: `.dev_team_idle_chain.pending_triage_inbox[]` contains all N entries with full payload

2. **Scenario 2: Short-circuit (non-triage dispatch)**
   - Same setup, run drain
   - Simulate rotation picking bounded1 (not step1_triage): run bounded1's promote/claim
   - Assert: signals NOT lost (still in durable inbox)
   - Assert: inbox exactly matches the batch that was appended in scenario 1

3. **Scenario 3: Triage turn (read and clear)**
   - After scenario 2, simulate next tick with step1_triage selected
   - Read durable inbox: should contain all N entries from prior ticks
   - Clear by envelope_id (subtract pattern from main.md §3.2)
   - Assert: inbox length == 0 (or only residual from concurrent tick, if simulated)

4. **Scenario 4: Append fails (read-only fixture)**
   - Point orch-apply.sh at read-only fixture (or mock failure)
   - Run drain
   - Assert: NO destructive action (files NOT moved, fingerprint NOT written, rows NOT flipped)
   - Assert: source files/rows still on disk/in DB, untouched

**Test structure (sketch):**
```javascript
describe("drain-signals durability (durable inbox append-before-destructive)", () => {
  let tmpDir, orcStateFile;
  
  beforeEach(() => {
    tmpDir = mkdtemp(...);
    orcStateFile = path.join(tmpDir, "orch-state.json");
    // Copy fixture orch-state + seed docs/signals/ dir
  });
  
  it("scenario 1: append succeeds, destructive happens", () => {
    // Setup docs/signals/*.json
    // Run drain with write allowed
    // Assert files moved + inbox populated
  });
  
  it("scenario 2: short-circuit preserves signals", () => {
    // Run scenario 1 setup
    // Call rotation_selected() → bounded1
    // Simulate bounded1 dispatch (no-op if nothing eligible, or claim if yes)
    // Assert inbox unchanged
  });
  
  // ...etc for scenarios 3 & 4
});
```

### Subtask 2: Conservation Guard Extension (§3.4)

**File:** `scripts/orch-conservation-check.mjs` (extend existing)

**Current behavior:** `signal_total(doc) = length(signal_queue.rows)` only

**Gap:** Does not count `.dev_team_idle_chain.pending_triage_inbox[]` — new inbox can grow unbounded without triggering conservation warning

**Fix (one line):**
```javascript
// Before (line ~98):
const signal_total = (doc) => doc.signal_queue?.rows?.length ?? 0;

// After:
const signal_total = (doc) => 
  (doc.signal_queue?.rows?.length ?? 0) + 
  (doc.dev_team_idle_chain?.pending_triage_inbox?.length ?? 0);
```

**Rationale:** Same circuit-breaker guard that caught the full-doc-collapse bug `FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER` — a bug in inbox append/clear logic that silently wiped the whole inbox would now be caught

**Test:** Re-run existing conservation-check test suite; verify new inbox rows are counted

### Subtask 3: Script Persistence Pointer (docs)

**File:** `docs/policies/dev-standards.md` (add pointers)

**Add under "Script Persistence" section (or wherever script registry is documented):**
- `scripts/lib/devteam-eligibility.jq` — new `rotation_selected()` function for aged round-robin consumer selection
- `scripts/devteam-idle-chain-stamp.jq` — new script, updates rotation fairness timestamps unconditionally after each dispatcher turn
- `scripts/agents-flow/drain-signals.js` — modified: batched durable-inbox append-before-destructive for both §0a-1 and §0a-D channels
- `scripts/agents-flow/drain-signals-durable.test.js` — new test harness, AC-2 negative control for durability
- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — extended: AC-1/AC-4 rotation fairness + gate-firing proof (not just resolution)
- `scripts/orch-conservation-check.mjs` — modified: extend `signal_total()` to include pending_triage_inbox

(Or integrate into existing inventory if one exists)

### Acceptance Criteria

**AC-2 Harness:**
- [ ] New test file created at `scripts/agents-flow/drain-signals-durable.test.js`
- [ ] Test runs in mkdtemp isolation (never touches live orch-state.json)
- [ ] Scenario 1: append succeeds → destructive happens → inbox populated with all entries + payloads
- [ ] Scenario 2: short-circuit (non-triage dispatch) → signals retained in inbox, not lost
- [ ] Scenario 3: triage turn → read inbox → clear by envelope_id → inbox emptied
- [ ] Scenario 4: append fails (write denied) → NO destructive action, source files/rows untouched (recovery on retry)
- [ ] Test runs and passes before implementation is merged

**Conservation Guard:**
- [ ] `signal_total()` extended to count both `signal_queue.rows` + `dev_team_idle_chain.pending_triage_inbox`
- [ ] Existing conservation-check tests pass (no regression)
- [ ] Comment explains why inbox is included (circuit-breaker guard against silent data loss)

**Docs Pointer:**
- [ ] All new/changed scripts listed in `docs/policies/dev-standards.md` (Script Persistence section)
- [ ] Entries link back to architect brief if relevant (e.g., "rotation, see brief §2.2")

### Files to Read First

- `scripts/agents-flow/drain-signals.test.js` (test pattern to follow)
- `scripts/orch-conservation-check.mjs` (understand signal_total, existing circuit breaker)
- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§3.2-3.4 full context)
- `docs/agents/dev-team/flow/drain-signals.md` (§0a structure, understand what gets moved/flipped)
- `docs/policies/dev-standards.md` (Script Persistence section, format for pointers)

### Files to Create

- `scripts/agents-flow/drain-signals-durable.test.js` — new test

### Files to Modify

- `scripts/orch-conservation-check.mjs` — extend `signal_total()` (+1-2 lines)
- `docs/policies/dev-standards.md` — add Script Persistence pointers

### Dependencies

- **Depends on:** FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION (tests run against final code)
- **Blocks:** Nothing (parallel with TEST-FAIRNESS is OK)

### Knowledge Needed

- Jest/vitest test patterns (or existing test framework used by drain-signals.test.js)
- mkdtemp isolation + fixture cleanup
- jq envelope structure + envelope_id matching
- orch-state.json signal_queue + dev_team_idle_chain structure
- Conservation check circuit breaker logic
- Script Persistence documentation conventions

### Risk & Constraints

- **Scenario 4 is hardest:** Mocking orch-apply.sh failure (read-only fixture or mock subprocess) — ensure the retry/recovery semantics are correct before claiming "append failed"
- **Durability is load-bearing:** These tests prove the core correctness of the append-before-destructive ordering — any regression will be caught by test failure, not silent data loss
- **Test isolation is critical:** Do not run against live orch-state.json; use isolated fixture per scenario
- **Conservation guard is defensive:** Not expected to trigger in normal operation (inbox grows/shrinks as triage progresses), but catches edge cases
