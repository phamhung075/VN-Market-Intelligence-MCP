---
sprint: P1-E
task: P1-E
title: "Edit-Rerun Handler + Full G7 Env Audit (ZERO-CREDS All 4 Sub-Gates)"
owner: dev-alert-engine
size: M
zone: apps/alert-engine/
estimate: 1.5h
depends_on: ["P1-D"]
blocks: ["P1-G"]
---

## TLDR

Finalize the dashboard edit-rerun handler to allow user to modify scenario JSON fixtures and re-run the sandbox with live result updates. Simultaneously execute the **HEADLINE RISK** G7 ZERO-CREDS audit across all 4 sub-gates: (1) env audit empty, (2) scenario JSON cred-free, (3) CGO_ENABLED=0 build green, (4) edit→rerun cycle works end-to-end. All 4 sub-gates must PASS for G7 candidacy. If any fails, Phase 1 is CONDITIONAL-HOLD.

## [PM] Planning Context

**Zone:** `apps/alert-engine/` (ONLY)

**Blocked by:** P1-D DONE (dashboard stub exists — handoff document AC-7 shows how the edit-rerun handler is scaffolded as a panel with button + textarea + copy-paste flow)

**Blocks:** P1-G (Phase 1 close-gate verification — must verify all 4 G7 sub-gates before exit gate decision)

**Critical path:** Last critical task before Phase 1 close gate. If any G7 sub-gate fails here, Phase 1 cannot close.

### Acceptance Criteria (7 total)

**AC-1 — Edit-rerun handler fully wired in dashboard**

The dashboard HTML (`apps/alert-engine/dashboard/index.html`) must include a functional mechanism
for the user to:
1. Edit any scenario JSON file on disk (e.g., `docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json`)
2. Change a field in that JSON (e.g., `cfg.cooldownMinutes` from 30 to 60)
3. Save the file
4. Trigger the rerun from the dashboard (via button click + run sandbox command + paste output)
5. See the updated sandbox trace displayed on the dashboard (status cards update to reflect new result)

Per AC-7 in the phase-1-task-plan-go.md, the implementation is Option C (user manual): dashboard
displays the exact command to run (`CGO_ENABLED=0 go run ./cmd/sandbox ...`), user runs it in a shell,
pastes the NDJSON output into a textarea, clicks "Apply Results", and the dashboard parses + displays
the outcome.

Evidence: Handoff document includes a step-by-step walkthrough (screenshot or manual verification) of:
1. Opening the dashboard
2. Clicking "Edit & Rerun" button
3. Reading the 4-step instructions (edit file, run command, paste output, apply results)
4. Confirming that the textarea accepts NDJSON input and the "Apply Results" button exists

**AC-2 — Env audit (G7 sub-gate-1 — MANDATORY)**

Run the env audit baseline in the same shell context that will run the sandbox:
```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
```

Must return **empty** (zero matches). This proves the sandbox process environment contains no
forbidden credential keywords. Evidence pasted into handoff.

**AC-3 — Sandbox source grep for credential-shaped strings (G7 sub-gate-2 — MANDATORY)**

```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/
```

Must return 0 across the entire sandbox source tree. Zero credential-shaped literals anywhere in the
sandbox code. Evidence pasted.

**AC-4 — Sandbox all-green end-to-end (G12 DoD Gate — MANDATORY)**

```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

Exits 0. All primitive scenarios (9: 3 signal-classifier + 3 dedup-key-builder + 3 cooldown-gate) and
all module scenarios (2: alert-pipeline golden + edge) PASS. Sandbox output includes a summary line
like:
```
total=11 pass=11 fail=0 status=OK
```

Evidence: paste the full sandbox output (all PASS/FAIL lines + summary) into handoff.

**AC-5 — R-1 determinism inherited (defensive grep)**

```bash
grep -rn "math/rand\|time\.Now\|uuid\|rand\." apps/alert-engine/pkg/primitive/ apps/alert-engine/pkg/module/ apps/alert-engine/cmd/sandbox/
```

Must return 0 (or only pre-existing allowed entries like the time.Time injected param in cooldown-gate).
Confirms no new randomization was introduced in the edit-rerun implementation. Evidence pasted.

**AC-6 — Zero-infra audit (Fence-A + Fence-B end-to-end)**

```bash
grep -rn "pkg/infrastructure\|mattn/go-sqlite3\|TELEGRAM_BOT_TOKEN\|TELEGRAM_INFO" \
  apps/alert-engine/pkg/primitive/ \
  apps/alert-engine/pkg/module/ \
  apps/alert-engine/cmd/sandbox/
```

Must return 0 matches. No infrastructure imports anywhere in the sandbox path. Evidence pasted.

**AC-7 — Edit→rerun cycle proven (G7 sub-gate-4 — QA independent verification)**

QA edits one scenario JSON file on disk (e.g., cooldown-gate-golden.json), changing one field to a
test value (e.g., cfg.cooldownMinutes from 30 → 60, or stock from "VCB" → "TEST"). QA saves the file.
QA then:
1. Runs the sandbox command: `CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all`
2. Observes the output includes the edited scenario, with the change reflected in the trace
3. Copies the NDJSON output + summary line
4. Opens the dashboard, clicks "Edit & Rerun"
5. Pastes the output into the textarea
6. Clicks "Apply Results"
7. Observes the dashboard status cards update to reflect the new result

Evidence: QA documents before/after terminal screenshots and the dashboard card state before and after
applying results. Include the exact field that was changed + the final sandbox exit code (0 = success).

**Commit subject pattern:**
```
feat(alert-engine): P1-E — edit-rerun handler + G7 env audit (ZERO-CREDS all 4 sub-gates)
```

### Files to Read First

- `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md` (§P1-E for full context + options + sub-gate details)
- `apps/alert-engine/dashboard/index.html` (lines 982–1087 for the rerun-panel-overlay stub)
- `docs/data/pilot-status-alert-engine.json` (phase1.goals[G7] + phase1.goals[G8] context)

### Files to Modify

- `apps/alert-engine/dashboard/index.html` (ADD: complete edit-rerun handler JavaScript + button click handler + textarea logic + "Apply Results" parsing)

### Files to Create

- (none — this is a dashboard modification task, not a new source file creation)

### Knowledge Needed

- **Mandatory:** `docs/policies/dev-standards.md` (commit convention, ZERO-CREDS gate, R-1 determinism)
- **Mandatory:** `docs/protocols/fail-loud-protocol.md` (escalation on any G7 sub-gate failure)
- **Reference:** `docs/protocols/bctc-extraction-runbook.md` (credential-free fixtures pattern)
- **Reference:** `docs/references/GLOSSARY_VI.md` (optional, for domain context)

---

## [DEV] Implementation Guidance

### Edit-Rerun Handler Overview

The dashboard stub (P1-D, commit 89202e98) includes a rerun panel skeleton at lines 982–1087. The
four steps are already documented in the HTML:

1. **Step 1:** Edit scenario JSON file on disk
2. **Step 2:** Run sandbox command (with CGO_ENABLED=0 explicit badge)
3. **Step 3:** Zero-credentials audit note (env grep command, HTML entity-split to avoid AC-5 grep match)
4. **Step 4:** Paste output and apply results

Your task: flesh out Step 4 with JavaScript logic:

- Textarea with ID `rerun-output-textarea` already exists (line 1070)
- Button with ID `rerun-apply-btn` already exists (line 1079)
- Button with ID `rerun-reset-btn` already exists (line 1080)
- Result message div with ID `rerun-result-msg` already exists (line 1082)

**Implementation outline:**

1. Add a click handler to `rerun-apply-btn`:
   - Read the textarea value (pasted NDJSON output)
   - Parse each line as JSON; extract `scenario` field and `msg` field
   - Find matching scenario cards in window.__PRIMITIVES_DATA__ and window.__MODULE_DATA__
   - Update their `status` field ("pass" or "fail" based on msg)
   - Re-render the dashboard (call buildPrimitivesPanel() + buildModulePanel())
   - Display a success message in `rerun-result-msg` (green success style)
   - On parse error, display error message (red error style)

2. Add a click handler to `rerun-reset-btn`:
   - Reset all scenario statuses back to "not-run"
   - Re-render the dashboard
   - Clear the textarea

3. Test the cycle:
   - Run sandbox all-tiers green → copy output
   - Paste into textarea → click Apply → dashboard should all-green
   - Edit a scenario to fail (manually change expected value) → re-run sandbox → paste → dashboard shows red

### ZERO-CREDS Audit Walkthrough

Before declaring DONE, execute all 4 sub-gates in sequence:

**Sub-gate 1 (env audit):**
```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
# Must be EMPTY (no output)
```

**Sub-gate 2 (scenario JSON grep):**
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/ \
  docs/scenarios/alert-engine/module/
# Must return 0
```

**Sub-gate 3 (CGO_ENABLED=0 build):**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
# Must exit 0
```

**Sub-gate 4 (edit→rerun cycle):**
- Edit a scenario JSON (e.g., change `cfg.cooldownMinutes` from 30 to 60)
- Run `CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all`
- Observe the output reflects the changed value
- Paste into dashboard → apply → observe dashboard updates

If any sub-gate fails, **STOP and escalate immediately** — G7 is a hard gate. Do NOT commit until all
4 sub-gates PASS.

### R-1 Determinism Check

Run this defensive grep to ensure the edit-rerun implementation doesn't introduce randomization:
```bash
grep -rn "math/rand\|time\.Now\|uuid\|rand\." \
  apps/alert-engine/pkg/primitive/ \
  apps/alert-engine/pkg/module/ \
  apps/alert-engine/cmd/sandbox/
# Expect: 0 matches, or only the pre-existing time.Time injected param
```

---

## [PM] Constraints & Hard Gates

**Hard gate:** All 4 G7 sub-gates must PASS (AC-2 + AC-3 + AC-4 + AC-7). Missing any one means
Phase 1 is CONDITIONAL-HOLD. **Escalate immediately if blocked.**

**L84 explicit staging:** `git add` only `apps/alert-engine/dashboard/index.html`. NEVER `git add -A`.
Before committing, run `git diff --cached --name-only` and confirm only the dashboard file is staged.

**Anchor:**  `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of HEAD.

**No branches — all on main.** No `--force`, `--no-verify`, `--no-gpg-sign`, `git push`.

**SSOT freeze:** Do NOT modify `docs/data/pilot-status-alert-engine.json` goal fields or
decisionMatrix — PM-owned transition only.

---

## [DEV] RETURN Block

When declaring DONE, include:

```
PASS: AC-1 (edit-rerun handler wired + 4-step UI visible)
PASS: AC-2 (env audit empty — pasted: <output>)
PASS: AC-3 (scenario JSON grep 0 — pasted grep output)
PASS: AC-4 (sandbox all-green — total=11 pass=11 fail=0 status=OK)
PASS: AC-5 (R-1 grep 0 — no randomization detected)
PASS: AC-6 (Fence-A/B all zero — pasted grep output)
PASS: AC-7 (edit→rerun cycle verified — changed cooldown-gate-golden.json cfg.cooldownMinutes, reran sandbox, dashboard applied new result)

SANDBOX EVIDENCE:
total=11 pass=11 fail=0 status=OK

ANCHOR HELD:
git log --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
[commit showing current task is descendant of anchor]

SIGNAL:
docs/signals/dev-alert-engine-P1-E-done-<UTC>.json emitted with AC summary + next_actor=pm + next_action=verify P1-G

FILES STAGED (L84):
git diff --cached --name-only
apps/alert-engine/dashboard/index.html
```

---

**Expected completion:** 1.5 hours  
**Next task:** P1-G (QA Phase 1 close-gate verification)  
**Phase 1 exit gate:** Awaits P1-E DONE + QA P1-G DONE (5 criteria: time-to-prim ≤4h, sandbox all-green, dashboard ≥90%, G12 streak 3/3, G7 all-4 sub-gates)
