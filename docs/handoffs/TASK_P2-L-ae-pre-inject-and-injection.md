# TASK P2-L — Create `alert-engine-pre-inject` Tag + G10 Bug Injection

**Pilot:** alert-engine (fleet pilot 5)
**Phase:** 2
**Task ID:** P2-L
**Owner:** qa
**Status:** SEQUENCED
**Blocked by:** P2-K DONE (G9 confirmed — trust layer proven before deliberately breaking things)
**Blocks:** P2-M (G10 AI-fixability blind fix)
**Acceptance Criteria Count:** 4
**Estimated effort:** 20 minutes
**Signal pattern:** docs/signals/qa-ae-P2-L-injection-done-<UTC>.json

---

## Background

L5 tag discipline + G10 bug injection spec from charter §G10. The pre-inject tag MUST exist BEFORE the injection commit. QA injects a SINGLE-LITERAL bug into one alert-engine primitive. 

**CRITICAL DESIGN REQUIREMENT — FIXER BLINDNESS:**

The fixer (dev-alert-engine, dispatched in P2-M) must stay BLIND. The P2-M handoff must REDACT the target file, the target function, and the exact literal change. The fixer receives only symptom-level instructions: "a bug is in a primitive, sandbox shows FAIL, dashboard is RED; fix it."

To enforce this blindness:
- The injection specification (which primitive, which file, what literal change) is documented in **`docs/handoffs/TASK_P2-L-ae-injection-spec.md`** — a sealed QA-only evidence file that PM retains for audit but **DOES NOT include in the P2-M handoff to dev-alert-engine**.
- The P2-M handoff (assembled by PM, given to dev-alert-engine) contains ONLY symptom-level instructions and the commit SHA(s) of the injected code — it MUST NOT contain the bug specification.
- This task's handoff (P2-L) documents how the injection was performed for audit trail; the commit message and body may contain details, but the P2-M dispatch must redact all specifics.

---

## Acceptance Criteria (Transcribed Verbatim from Phase-2 Task Plan §P2-L)

### AC-1 — Pre-inject Tag Created Before Injection

`alert-engine-pre-inject` tag exists on the commit BEFORE the injection:

```bash
git log --oneline -2
```

Shows injection commit on top, `alert-engine-pre-inject` tag on the commit below it.

**Evidence:** Paste the output of `git log --oneline -2` showing tag placement.

---

### AC-2 — Sandbox Fails After Injection

After injection commit, sandbox shows at least 1 FAIL:

```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```

Exits non-zero. 

**Evidence:** Paste output demonstrating FAIL scenario. Include:
- Exit code (must be non-zero)
- Failing primitive name (e.g., `dedup-key-builder` or `cooldown-gate` or `signal-classifier`)
- Expected vs actual values from the failing scenario

**Required snippet:**
```
Exit code: [non-zero]
Failing scenario: [primitive-name-golden.json or edge.json or failure.json]
Expected: [value]
Got: [value]
```

---

### AC-3 — Dashboard Shows RED After Injection

Dashboard shows RED for the affected primitive card after sandbox run. 

**Evidence:** Describe dashboard state in the `§Evidence — G10 Dashboard RED` section below:
- Which card is RED?
- What is the pending status (should transition from NOT-RUN to RED/FAIL)?
- Are all other cards still honest (either NOT-RUN, GREEN, or FAIL as appropriate)?

---

### AC-4 — Injection Commit (Audit Trail Only)

Injection commit subject (do NOT reveal the primitive name or bug spec in the subject):

```
test(alert-engine): P2-L — deliberate bug injection for G10 AI-fixability proof (alert-engine-pre-inject tagged)
```

Commit body may contain details for QA audit trail (file, literal, rationale), but this information MUST NOT leak into:
- The P2-M handoff to dev-alert-engine
- The SSOT phase2 progress_notes
- Any signal file that the fixer would read

**Evidence:** Paste `git log -1 --format="%H %s"` confirming commit SHA and subject.

---

## Step-by-Step Execution

### Step 0 — Mandatory: Create Pre-inject Tag (BEFORE ANY FILE EDIT)

```bash
git tag alert-engine-pre-inject HEAD
git log --oneline alert-engine-pre-inject
```

Must return the P2-K evidence commit (the PO Playwright task completion commit, typically the most recent SSOT update commit). If tag creation fails, STOP and notify PM.

---

### Step 1 — Select Injection Target (QA's choice; details SEALED from fixer)

QA selects ONE of the following targets. **The selected target is documented in `docs/handoffs/TASK_P2-L-ae-injection-spec.md` (sealed QA-only evidence) but NOT disclosed in the P2-M handoff.**

**Option 1 (recommended):** `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`
- Change the djb2 seed constant from `5381` to `5382` (one digit off)
- Effect: all fingerprints produced by `BuildKey` are wrong → `dedup-key-builder-golden.json` fails
- Dashboard `dedup-key-builder` card RED

**Option 2:** `apps/alert-engine/pkg/primitive/cooldown-gate/gate.go`
- Flip the cooldown window comparison from `<` to `<=` (or `>` to `>=`) in the suppression condition
- Effect: `cooldown-gate-edge.json` scenario produces wrong suppress result
- Dashboard `cooldown-gate` card RED

**Option 3:** `apps/alert-engine/pkg/primitive/signal-classifier/classifier.go`
- Change the `SeverityHigh` → `ChannelMarket` mapping to `ChannelWork` (wrong channel for "high" severity)
- Effect: `signal-classifier-golden.json` fails (expected channel: market, got: work)
- Dashboard `signal-classifier` card RED

**The injection must be a SINGLE literal/operator change with a deterministic correct fix.**

---

### Step 2 — Inject the Bug

Edit the selected target file, making the single-literal change. Do NOT commit yet. Verify the file is modified locally.

---

### Step 3 — Verify Sandbox Fails (AC-2 Evidence)

```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```

Confirm exit is non-zero and at least one scenario FAILs. Capture full output for AC-2 evidence.

---

### Step 4 — Verify Dashboard RED (AC-3 Evidence)

1. Copy the (now-broken) scenario trace output from sandbox Step 3 into the appropriate scenario JSON file in `docs/scenarios/alert-engine/primitives/` (the one that FAILed).
2. Open `apps/alert-engine/dashboard/index.html` in a browser.
3. Observe the affected card now shows RED/FAIL status.
4. Capture screenshot or textual description for AC-3 evidence section.

---

### Step 5 — Commit the Injection (AC-4)

Stage and commit the modified primitive file:

```bash
git add -f apps/alert-engine/pkg/primitive/<target>/<target-file>.go
git commit -m "test(alert-engine): P2-L — deliberate bug injection for G10 AI-fixability proof (alert-engine-pre-inject tagged)"
```

Commit body (optional for audit trail, NOT visible to fixer):
```
Injected single-literal bug into [target primitive]:
- File: [path]
- Line: [line-number]
- Change: [from] → [to]
Reason: G10 proof — AI agent must diagnose and fix from symptoms only (sandbox FAIL + dashboard RED).
This is a sealed QA-only audit detail; the fixer (P2-M) will not see this message.
```

---

## Evidence Sections

### § Evidence — AC-1: Pre-inject Tag Placement

Paste output of `git log --oneline -2`:

```
[PASTE OUTPUT HERE]
```

**Verdict:** 
- [ ] Tag `alert-engine-pre-inject` visible on the pre-injection commit
- [ ] Injection commit is on top of the tag

---

### § Evidence — AC-2: Sandbox FAIL

Paste output of `CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all`:

```
[PASTE FULL OUTPUT HERE]
```

**Verdict:**
- [ ] Exit code: [non-zero]
- [ ] Failing primitive: [name]
- [ ] Scenario file: [golden/edge/failure].json
- [ ] Expected vs Actual captured

---

### § Evidence — AC-3: Dashboard RED

Describe dashboard state:

```
Card affected: [dedup-key-builder | cooldown-gate | signal-classifier]
Status shown: [RED / FAIL / non-green]
Other cards: [all still NOT-RUN, or any GREEN still green]
Screenshot/description: [paste here]
```

**Verdict:**
- [ ] Affected card shows RED/FAIL
- [ ] Honest state preserved (NOT-RUN cards ≠ false-green)

---

### § Evidence — AC-4: Injection Commit Audit Trail

Paste output of `git log -1 --format="%H %s"`:

```
[PASTE COMMIT SHA AND SUBJECT HERE]
```

Commit body (sealed QA-only details — NOT in P2-M handoff):

```
[OPTIONAL: Paste commit body showing injection target + literal change for audit trail]
```

**Verdict:**
- [ ] Commit subject does NOT reveal primitive name or bug spec
- [ ] Subject matches pattern: `test(alert-engine): P2-L — deliberate bug injection...`
- [ ] Injection spec documented in sealed TASK_P2-L-ae-injection-spec.md

---

## Sealed QA-Only Evidence File

**File:** `docs/handoffs/TASK_P2-L-ae-injection-spec.md`

QA writes a SEALED evidence file recording:
- Selected target primitive (e.g., `dedup-key-builder`)
- Target file path (e.g., `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`)
- Line number and original code
- Changed literal (e.g., `5381` → `5382`)
- Expected failure mode (which scenario FAILs, what the error is)
- Injection commit SHA

This file is for PM/QA audit only. PM **DOES NOT include this file's path or contents in the P2-M handoff to dev-alert-engine.**

---

## Handoff to P2-M (PM Assembles — FIXER-BLINDNESS ENFORCED)

PM reads this P2-L evidence document and the sealed injection spec (TASK_P2-L-ae-injection-spec.md), then constructs the P2-M handoff with symptom-level instructions ONLY:

```
A deliberate bug has been injected into one of the alert-engine primitives.
The sandbox shows at least 1 FAIL scenario. The dashboard shows RED for at least 1 primitive card.

Your task (P2-M): diagnose the failing primitive from the sandbox output and dashboard RED state,
fix the bug (single-literal change), verify sandbox exits 0 and dashboard shows GREEN.
You have at most 2 dispatch cycles to find and fix the bug.

Do NOT look at the P2-L injection commit details or ask QA for the target — diagnose from symptoms only.
```

**PM MUST VERIFY before dispatching P2-M:**
- P2-M handoff does NOT mention the injection commit SHA
- P2-M handoff does NOT mention the target file path
- P2-M handoff does NOT mention the changed literal
- P2-M handoff says ONLY: "sandbox shows FAIL, dashboard shows RED, fix it"
- The sealed spec file (TASK_P2-L-ae-injection-spec.md) is NOT included in P2-M dispatch

---

## G-Goal Posture

- **NO goal flips.** G10 advances to EARNED-PENDING but does NOT flip to YES here.
- **§4.5 SSOT untouched.** Do NOT modify `goalsEarned`, `decisionMatrix`, or any G-goal status field.
- **Anchor INTACT.** Verify anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc remains ancestor of HEAD.

---

## Signal Emission

After all 4 ACs are PASS, emit:

```json
{
  "signal": "qa-ae-P2-L-injection-done",
  "task": "P2-L",
  "pilot": "alert-engine",
  "phase": "2",
  "goal": "G10 setup",
  "status": "DONE",
  "timestamp": "<UTC-timestamp>",
  "ac_verdicts": {
    "AC-1": "PASS — alert-engine-pre-inject tag present before injection commit",
    "AC-2": "PASS — sandbox exits non-zero; [primitive-name] scenario FAIL",
    "AC-3": "PASS — dashboard [primitive-name] card shows RED",
    "AC-4": "PASS — injection commit created (audit details sealed in TASK_P2-L-ae-injection-spec.md)"
  },
  "injection_target_note": "Target primitive + file path + literal change documented in sealed TASK_P2-L-ae-injection-spec.md; NOT disclosed in P2-M handoff",
  "fixer_blindness_enforced": true,
  "g10_setup_complete": true,
  "g10_goal_status": "EARNED-PENDING (goal flip deferred to Phase-3 12/12 terminal per charter §4.5)",
  "sealed_spec_path": "docs/handoffs/TASK_P2-L-ae-injection-spec.md",
  "next_actor": "pm",
  "next_task": "P2-M — assemble fixer handoff with symptom-level instructions only"
}
```

Save as: `docs/signals/qa-ae-P2-L-injection-done-<UTC>.json`

---

## Commit Subject

```
test(alert-engine): P2-L — create alert-engine-pre-inject tag + inject G10 bug (sealed spec)
```

---

## Constraints

- **L84 staging:** `git add -f docs/handoffs/TASK_P2-L-ae-pre-inject-and-injection.md docs/handoffs/TASK_P2-L-ae-injection-spec.md docs/signals/qa-ae-P2-L-injection-done-<UTC>.json` (explicit paths only)
- **No destructive git:** No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push`
- **Anchor INTACT:** Verify `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` returns non-empty
- **SSOT freeze:** Do NOT modify `goalsEarned` or `decisionMatrix` fields
- **SI-2 boundary:** Do NOT touch `docs/dashboards/index.html`
- **ZERO-CREDS:** The injected bug is a code-level change only; no credentials, API keys, or tokens added

---

## Success Criteria (PM Verification at P2-L Done Signal)

- [ ] AC-1: Pre-inject tag created before injection commit
- [ ] AC-2: Sandbox exits non-zero; at least one scenario FAIL documented
- [ ] AC-3: Dashboard shows RED for affected card documented
- [ ] AC-4: Injection commit created with sealed spec (PM verifies spec is NOT in P2-M handoff)
- [ ] Signal emitted with injection target description marked as sealed/not-for-fixer
- [ ] Anchor debba8ea remains ancestor of HEAD
- [ ] SSOT integrity: goalsEarned=0, decisionMatrix all-TBD, P2-L.status=DONE, P2-M.status=SEQUENCED
