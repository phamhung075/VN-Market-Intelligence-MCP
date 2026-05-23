---
sprint: P1-E2
branch: task/P1-E2-macro
size: M
zone: apps/macro-indicators/
depends_on: ["P1-E1"]
blocks: []
---

# P1-E2 — Dashboard Edit-Rerun Handler + Env Audit (Final Phase 1 Task)

## TLDR

Add scenario edit-rerun capability to the dashboard (`index.html`): when a user edits a scenario JSON file and refreshes the browser, the sandbox reruns that scenario and updates the dashboard card status. Audit Go source + dashboard for credential leaks: `FRED_API_KEY` and other API keys must NOT appear in committed code; `.env` files must NOT be staged.

**Owner:** dev-macro-indicators  
**Estimate:** 2–3 hours  
**Critical Path:** Final Phase 1 task before Phase 1 close gate  
**G12 Streak:** Not included (P1-B1, P1-C1, P1-E1 were the 3-task streak)  
**R-1 Propagated:** Determinism check inherited from P1-B1 (defensive grep for math/rand)  

---

## [PM] Planning Context

### Zone
- **Primary zone:** `apps/macro-indicators/`
- **Out-of-zone (FORBIDDEN):** `.env`, `.env.local`, `.env.test`, TA files, `.golangci.yml`, `.github/workflows/`, `decisionMatrix` entries

### Acceptance Criteria

- [ ] **AC-1 (Edit-Rerun Handler):** User edits a scenario JSON file (e.g., `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json`), modifies an input field, saves, refreshes dashboard browser tab → sandbox reruns via `go run ./cmd/sandbox -tier=<tier> -module=macro-indicators -scenario=<edited-file>` → updated result appears in dashboard card (status changes from NOT-RUN to PASS/FAIL based on new input). Forbidden: rerun MUST NOT use `bun run sandbox` (TS legacy path).

- [ ] **AC-2 (Env Audit — Comprehensive):** Run this command in the sandbox subprocess context (inside the handler that invokes `go run`):
  ```bash
  env | grep -E "DB_PASSWORD|DB_HOST|DB_USER|DB_PORT|API_KEY|SECRET|TOKEN|PASSWORD|FRED_API_KEY"
  ```
  Expected: 0 matches (empty output). **Macro-specific addition:** `FRED_API_KEY` is explicitly mentioned in charter §Security Clause and MUST be present in the grep pattern.

- [ ] **AC-3 (.env File Hygiene):** Verify `.gitignore` covers all `.env*` files. Run:
  ```bash
  git ls-files | grep -E "^\.env" | wc -l
  ```
  Expected: 0 (no `.env` files staged or committed). If any exist, remove from git index (`git rm --cached .env*`) and verify `.gitignore` entry exists.

- [ ] **AC-4 (Sandbox Regression — All 3 Tiers):** Before marking DONE, run all three sandbox tiers to verify no regression from P1-E1:
  ```bash
  cd apps/macro-indicators
  go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
  go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
  go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
  ```
  Expected: all three exit 0, all scenarios PASS. Paste full output to RETURN block.

- [ ] **AC-5 (R-1 Determinism Propagated):** Defensive grep to confirm no new randomization introduced:
  ```bash
  grep -rE "math/rand|rand\.Intn|rand\.Float|rand\.Seed" apps/macro-indicators/ | grep -v test | wc -l
  ```
  Expected: 0 (or only in test files). This is inherited from P1-B1 AC-6 and propagated defensively across Phase 1.

- [ ] **AC-6 (L84 Explicit-File Staging):** Commit lists all modified files explicitly (no `-A`, no `.`). Primary file: `apps/macro-indicators/dashboard/index.html`. If `.gitignore` needed: `apps/macro-indicators/.gitignore` (or root `.gitignore` if updating).

- [ ] **AC-7 (Completion Signal):** Create signal file `docs/signals/dev-macro-p1-e2-done-<UTC>.json` with schema:
  ```json
  {
    "agent": "dev-macro-indicators",
    "task_id": "P1-E2",
    "status": "DONE",
    "timestamp": "<ISO-8601 UTC>",
    "impl_commit": "<dev_commit_sha>",
    "ac_results": "7/7 PASS",
    "sandbox_evidence": {
      "primitive_tier": "total=3 pass=3 fail=0 status=OK",
      "module_tier": "total=2 pass=2 fail=0 status=OK",
      "all_tier": "total=5 pass=5 fail=0 status=OK"
    },
    "env_audit_result": "0 matches (empty output)",
    "r1_determinism_check": "0 matches (only test files allowed)"
  }
  ```

---

## Files to Read First

- **Charter Security Clause:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` (§Security)
- **P1-E1 Dashboard Pattern:** `docs/handoffs/TASK_P1-E1-macro.md` (understand 3-panel layout, NOT-RUN state display)
- **Sandbox CLI Spec:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` §P1-A3 + §P1-E2
- **TA Dashboard Reference:** `apps/technical-analysis/dashboard/index.html` (edit-rerun pattern from TA pilot cycle-16 precedent)

---

## Files to Create

None (P1-E1 already created `apps/macro-indicators/dashboard/index.html`).

---

## Files to Modify

- **`apps/macro-indicators/dashboard/index.html`** — Add edit-rerun handler:
  1. Detect scenario JSON file path changes (user edits JSON in editor, saves to disk, refreshes browser or clicks "Rerun" button).
  2. Extract file path from UI context or input field.
  3. Invoke subprocess: `go run ./cmd/sandbox -tier=<inferred-from-path> -module=macro-indicators -scenario=<file-path>`.
  4. Parse sandbox stdout, update corresponding dashboard card (primitive/module/all) with new status (PASS/FAIL).
  5. Display timestamp of last rerun + result details.

  **Implementation hint (from TA pilot):** Use `<input type="file">` + `FileReader` (if editing locally via browser devtools) OR add a "Rerun Selected Scenario" button that triggers backend subprocess call (if Go backend handles file watch). Current Phase 1 pattern: user edits JSON with text editor (outside browser), refreshes dashboard browser tab → dashboard detects file change via timestamp or calls sandbox unconditionally on refresh.

- **`.gitignore` (root or `apps/macro-indicators/.gitignore`)** — Ensure `.env*` files are covered:
  ```
  .env
  .env.local
  .env.test
  .env.*.local
  ```

---

## Dependencies

- **Blocks:** None (final Phase 1 task)
- **Depends on:** P1-E1 DONE (dashboard stub exists, G12 streak complete) + all prior Phase 1 tasks (A1-A5, B1, C1, D2)
- **Critical path:** P1-A1 → A5 → B1 → C1 → D2 → E1 → **E2** (last task before Phase 1 close gate)

---

## Knowledge Needed

- `docs/policies/dev-standards.md` — L84, WIP enforcement, commit discipline
- `docs/protocols/fail-loud-protocol.md` — Escalation path if blocker found
- `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` — §Security Clause (FRED_API_KEY explicit mention), §Constraints
- `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` — Full AC definitions + OQ-1 (binary vs go run decision already made: use `go run`)

---

## Implementation Guidance

### Edit-Rerun Handler Design

The handler bridges the dashboard (HTML/JS) and the Go sandbox CLI:

1. **User action:** Opens `apps/macro-indicators/dashboard/index.html` in browser. In a separate terminal, edits a scenario JSON (e.g., `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json`), saves.
2. **Dashboard detection:** Either:
   - *Option A (client-side only):* Dashboard provides "Rerun" button for each card. User clicks → browser calls `go run ./cmd/sandbox` via child process (requires Node.js or Electron wrapper, out of scope Phase 1).
   - *Option B (file polling):* Dashboard periodically checks a `.lastrun` timestamp file or scenario file modification time. If newer than last dashboard load, reruns automatically.
   - *Option C (manual refresh):* User manually refreshes browser tab. Dashboard loads latest scenario files, reruns sandbox, renders updated status.
   - **PM guidance:** Phase 1 scope = **Option C** (simplest for HTML-only dashboard). User edits JSON in text editor, refreshes browser tab, dashboard calls `go run ./cmd/sandbox -tier=<auto-detect> -module=macro-indicators -scenario=all` (runs all scenarios, updates all cards).

3. **Subprocess call (Go sandbox):**
   ```bash
   go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
   ```
   Stdout captured, parsed for pass/fail per scenario.

4. **Dashboard update:** For each card (primitive, module, all), parse sandbox output, extract status (PASS/FAIL), update card HTML class (`.card-status-pass` / `.card-status-fail`), display updated timestamp.

### Env Audit Implementation

Add this snippet **inside** the dashboard's rerun handler (before subprocess call):

```javascript
// Pseudo-code (if handler is Node.js-based)
const { spawn } = require('child_process');
const proc = spawn('go', ['run', './cmd/sandbox', '-tier=all', '-module=macro-indicators', '-scenario=all'], {
  cwd: 'apps/macro-indicators',
  env: {
    // Explicitly exclude sensitive vars
    'PATH': process.env.PATH,
    'HOME': process.env.HOME,
    // Do NOT pass: DB_PASSWORD, API_KEY, FRED_API_KEY, etc.
  }
});
// Env audit: verify spawn env does NOT contain FRED_API_KEY
const envAudit = Object.keys(proc.env || {}).filter(k => /FRED_API_KEY|DB_PASSWORD|SECRET/.test(k));
if (envAudit.length > 0) {
  console.error('FAIL: Env contains secrets:', envAudit);
  process.exit(1);
}
```

**Alternative (shell-based handoff):** If the dashboard is pure HTML+browser (no Node backend in Phase 1), env audit happens at QA verification time:
```bash
cd apps/macro-indicators
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all 2>&1 | head -1
env | grep -E "FRED_API_KEY|DB_PASSWORD|SECRET|TOKEN|PASSWORD" # Should be empty
```

### R-1 Determinism Check

No new code should introduce `math/rand` or `rand.Intn`. Inherited from P1-B1, this is defensive:
```bash
grep -rE "math/rand|rand\.Intn|rand\.Float|rand\.Seed" apps/macro-indicators/*.go | grep -v _test.go
```
Expected: 0 matches.

---

## Forbidden Reads

- **No `.env` files:** Do NOT read `.env` or `.env.local` to fetch FRED_API_KEY. Credentials must NOT be in committed code.
- **No TA files:** Do NOT touch `apps/technical-analysis/` (separate pilot, closed at cycle-28).
- **No CI modifications:** Do NOT edit `.golangci.yml` or `.github/workflows/`. TA pilot golangci-lint issue is separate (P2-A scope).
- **No decisionMatrix edits:** Do NOT modify `docs/data/pilot-status-macro-indicators.json` decisionMatrix (PO-only at 12/12 terminal).

---

## Constraints

- **L84:** Use `git add <explicit-path>` per file. Example: `git add apps/macro-indicators/dashboard/index.html` then `git add .gitignore` (if modified). NEVER `-A`, NEVER `.`.
- **No --force, no --no-verify, no --no-gpg-sign.**
- **Anchor 1776df8e held:** Pre and post commit, verify `git merge-base --is-ancestor 1776df8e HEAD` exits 0.
- **WIP lock:** phase_1_dev_team = 1 (only this task active). After DONE signal, PM unblocks Phase 1 close gate.

---

## Smoke Checks (Before Handoff)

```bash
cd apps/macro-indicators

# 1. Syntax check (if .html modified)
test -f dashboard/index.html && echo "HTML file exists" || echo "FAIL: missing HTML"

# 2. Sandbox regression (all 3 tiers)
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all && echo "Tier primitive OK" || echo "FAIL"
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all && echo "Tier module OK" || echo "FAIL"
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all && echo "Tier all OK" || echo "FAIL"

# 3. Env audit (no FRED_API_KEY in subprocess env)
env | grep -E "FRED_API_KEY|DB_PASSWORD|API_KEY|SECRET" && echo "FAIL: secrets in env" || echo "Env audit PASS"

# 4. .env file hygiene
git ls-files | grep -E "^\.env" && echo "FAIL: .env files staged" || echo "Git hygiene PASS"

# 5. R-1 determinism (inherited from P1-B1)
grep -rE "math/rand|rand\.Intn|rand\.Float" . --include="*.go" | grep -v _test.go && echo "FAIL: randomness detected" || echo "R-1 check PASS"

# 6. Go mod clean
go mod tidy && git diff go.mod go.sum | wc -l | grep -q "^0$" && echo "go.mod idempotent" || echo "WARN: go.mod changed"

# 7. Anchor held
git merge-base --is-ancestor 1776df8e HEAD && echo "Anchor 1776df8e held" || echo "FAIL: anchor lost"
```

---

## Commit Message Template

```
chore(pm/c282-cycle-39): dispatch P1-E2 (final Phase 1 task — edit-rerun handler + env audit)

Final Phase 1 task before close gate. Adds scenario edit-rerun capability to dashboard + env audit (FRED_API_KEY + .env hygiene).

Acceptance criteria (7):
- AC-1: Edit-rerun handler wired (go run ./cmd/sandbox on file change, updates dashboard card)
- AC-2: Env audit (env | grep FRED_API_KEY|API_KEY|SECRET|PASSWORD|DB → 0 matches)
- AC-3: FRED_API_KEY explicit in grep pattern (charter security clause)
- AC-4: Sandbox regression all-tiers green (primitive 3/3, module 2/2, all 5/5)
- AC-5: R-1 determinism check (zero math/rand outside test files)
- AC-6: L84 explicit-file staging (dashboard/index.html + .gitignore)
- AC-7: Completion signal dev-macro-p1-e2-done-<UTC>.json

Zone: apps/macro-indicators/ (no TA, no CI, no decisionMatrix).
Anchor 1776df8e held (pre + post).
WIP=1 enforced (final Phase 1 task).

G12 Streak: Not applicable (streak was P1-B1 #1 + P1-C1 #2 + P1-E1 #3 — all COMPLETE).
G12 Grade: EARNED (3/3 tasks passed G12 DoD gate). Pending PO 12/12 close per Charter §4.5.
R-1 Propagated: Inherited determinism check from P1-B1.

Task: P1-E2
```

---

## RETURN Block (for dev-macro-indicators to fill)

```
DONE: P1-E2 dashboard edit-rerun handler + env audit complete
IMPL_COMMIT: <SHA from dev>
SIGNAL_CREATED: docs/signals/dev-macro-p1-e2-done-<UTC>.json

SANDBOX OUTPUT (all-tier):
<paste full output from: go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all>

ENV AUDIT (must be empty):
<paste output from: env | grep -E "FRED_API_KEY|DB_PASSWORD|API_KEY|SECRET|PASSWORD">

R-1 DETERMINISM CHECK (must be 0 matches):
<paste output from: grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/*.go | grep -v _test.go | wc -l>

AC SUMMARY:
- [ ] AC-1 PASS: Edit-rerun handler wired (go run ./cmd/sandbox)
- [ ] AC-2 PASS: Env audit empty (0 secret matches)
- [ ] AC-3 PASS: FRED_API_KEY in grep pattern
- [ ] AC-4 PASS: Sandbox all-tiers green (3-2-5 results)
- [ ] AC-5 PASS: R-1 determinism 0 matches
- [ ] AC-6 PASS: L84 explicit files staged
- [ ] AC-7 PASS: Completion signal created + formatted

ANCHOR CHECK (pre-commit):
<paste output from: git merge-base --is-ancestor 1776df8e HEAD && echo PASS || echo FAIL>

ANCHOR CHECK (post-commit):
<paste output from: git merge-base --is-ancestor 1776df8e HEAD && echo PASS || echo FAIL>

NEXT: PM closes P1-E2 → DONE, updates SSOT, triggers Phase 1 close gate (PO reviews dashboard render ≥90%, sandbox all-green, approves Phase 2 expansion).
```

---

## Critical Notes

1. **Phase 1 Closure:** P1-E2 is the **last of 11 Phase 1 tasks**. After this DONE + QA-green, PM will:
   - Close P1-E2 in SSOT
   - Mark Phase 1 status → READY_FOR_CLOSE_GATE
   - Signal to PO: Phase 1 exit gate (≤4h time-to-primitive, ≥90% dashboard render, sandbox all-green, G12 streak 3/3 COMPLETE)
   - Note G12 grade candidacy: "EARNED-PENDING-§4.5-PO-12-OF-12-CLOSE" (will appear in goals.G12.candidacy field in SSOT when PO runs final gate)

2. **G12 Streak Already Complete:** P1-B1, P1-C1, P1-E1 satisfied G12 DoD gates (sandbox green before commit). P1-E2 does NOT add a 4th streak task; it's the final edit-rerun + env-audit task. Grade counted at 3/3 completion in P1-E1 signal.

3. **R-3 Phase 2 Flag:** PM will note for architect: 4 MCP tools (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar) must be HTTP-rewired in Phase 2 P2-B to point to Go macro-indicators service (currently they import domain services directly in mcp-server).

4. **No Restart Needed:** After P1-E2 DONE, sandbox is ready for PO Playwright verification (Path B of G9 gate) or user verbal verification (Path A). File:// works without server restart.

---

End of handoff.
