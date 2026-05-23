---
task_id: P1-E
pilot: stock-price
phase: 1
title: "Edit-Rerun Handler + Env Audit"
owner: dev-stock-price
status: READY
readyAt: "2026-05-24T02:30:00Z"
readyBy: pm
dispatch_date: "2026-05-24"
dispatch_time: "02:30Z"
dependencies: ["P1-D (DONE 2026-05-24T02:25:21Z)"]
blocks: ["P1-F (optional)", "P1-G (QA close-gate)"]
estimated_effort: "1.5 hours"
ac_count: 6
---

# TASK P1-E — Edit-Rerun Handler + Env Audit

**Background:** G7 trust contract — user edits scenario JSON, reruns dashboard, sees new result. The rerun handler invokes the `CGO_ENABLED=0` sandbox binary against the edited JSON fixture. This task proves the dashboard is live documentation, not a static screenshot. Parallel track: env audit confirms zero credentials leak into the sandbox process.

---

## Files to Modify

- `apps/stock-price/dashboard/index.html` (MODIFY — add rerun handler + button UI)

---

## Acceptance Criteria (6 total)

### AC-1: User can edit scenario JSON and rerun

**Criterion:** User can edit any scenario JSON file (e.g., change `rawPrice` from 85000 to 70000 in `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json`), trigger a rerun via a dashboard button, and the dashboard reflects the updated normalized output.

**Evidence required:**
- Dashboard has a visible "Rerun Scenario" or "Edit & Rerun" button (or similar UI control)
- Button handler reads the edited JSON files from `docs/scenarios/stock-price/primitives/` (for primitive tier) and `docs/scenarios/stock-price/module/` (for module tier)
- After rerun completes, dashboard card updates with the new scenario result
- Paste a before-and-after screenshot (or text evidence) showing a deliberate edit and the dashboard update

**Status:** TBD

---

### AC-2: Rerun command uses CGO_ENABLED=0

**Criterion:** The rerun handler invokes the sandbox with `CGO_ENABLED=0` explicitly, ensuring no CGO-dependent code can execute:

```bash
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

(Or equivalent pre-built sandbox binary, built with `CGO_ENABLED=0` at build time.)

**Evidence required:**
- Paste the exact rerun command from dashboard handler code (or shell script it invokes)
- Show the environment variable being set in the process spawn call
- Confirm `CGO_ENABLED=0` is set BEFORE the `go run` or binary invocation

**Status:** TBD

---

### AC-3: Env audit — zero DB creds in sandbox process

**Criterion (mandatory G7 gate):** Run the env audit inside the sandbox process context and confirm ZERO matches:

```bash
env | grep -E "DB_PATH|STOCK_PRICE_DB_PATH|API_KEY|SECRET|TOKEN|PASSWORD|mattn"
```

This command, executed in the sandbox process environment, MUST return **empty output** (exit code 1, zero matches).

**Evidence required:**
- Run the grep command inside the sandbox handler (or capture the sandbox process env before exec)
- Paste the full output of `env | grep ...` — should be empty or show zero results
- Alternative: run `env` and manually verify zero forbidden keys present

**Status:** TBD

---

### AC-4: CGO audit in primitive/module/sandbox

**Criterion (R-CGO final confirmation at G7 time):** Confirm zero mattn/go-sqlite3 imports in primitive, module, and sandbox packages:

```bash
grep -rn "mattn/go-sqlite3" apps/stock-price/pkg/primitive/ apps/stock-price/pkg/module/ apps/stock-price/cmd/sandbox/
```

Must return 0 matches (exit code 1).

**Evidence required:**
- Paste the grep output showing zero matches
- Confirm all three directories are clean (no imports of mattn/go-sqlite3)

**Status:** TBD

---

### AC-5: QA verifies edit → updated dashboard result

**Criterion:** QA (or dev-stock-price) manually edits a scenario JSON, reruns via the dashboard button, and confirms the card result updates. This is the G7 trust loop proof:
- Edit `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json`
- Change `rawPrice` to a different value (e.g., 85000 → 70000)
- Trigger rerun via dashboard button
- Confirm the price-quote-normalizer card shows the new normalized output (e.g., normalized.Price = 70000)
- No manual cache-clear needed; dashboard automatically refreshes

**Evidence required:**
- Screenshot or text log of the edit
- Screenshot or text log of the rerun result showing the updated output
- Note the field that changed and its new value

**Status:** TBD

---

### AC-6: G12 DoD Gate — all scenarios green after rerun

**Criterion:** All scenarios green (both `-tier=primitive` and `-tier=module`) after the rerun handler edit. No false greens.

**Evidence required:**
- Run `CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` — exits 0, all scenarios PASS
- Run `CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all` — exits 0, all scenarios PASS
- Paste both sandbox outputs as evidence
- Confirm no scenarios show ERROR or FAIL

**Status:** TBD

---

## Pre-Dispatch Blockers

- ✓ P1-D DONE (7329180b, 2026-05-24T02:25:21Z) — dashboard created and shipped
- ✓ All 11 scenario JSON files present in `docs/scenarios/stock-price/primitives/` and `docs/scenarios/stock-price/module/`
- ✓ `apps/stock-price/cmd/sandbox/main.go` accepts `-scenario=all` flag and loads from file paths

---

## Goals Advanced

- **G7** — Edit-JSON-and-rerun works (zero credentials in sandbox)
- **G8** — Red/green status is honest (dashboard updates reflect sandbox results; honest-red contract to be proven in P1-E + P1-G QA)
- **G12** — Dev-* agent flow requires dashboard-green before done (G12 DoD Gate streak continues)

---

## Constraints & Notes

- **L84 — Explicit-file staging:** PM will stage `docs/data/pilot-status-stock-price.json` + `docs/handoffs/TASK_P1-E.md` with `git add -f <path>` (per-file, no -A).
- **No --force, no --no-verify, no --no-gpg-sign** — standard commit rules apply.
- **All work on main** — no branches.
- **Notebook + signal hygiene:** Agent notebook ≤200 lines; signals {agent}-{ISO}.json format.
- **CGO boundary:** `mattn/go-sqlite3` must not leak into `pkg/primitive`, `pkg/module`, or `cmd/sandbox`. R-CGO gate is already CLEAR from P1-B1, but AC-4 recertifies at G7 time.

---

## Handoff Checklist

- [ ] AC-1 — Edit scenario JSON and rerun button works
- [ ] AC-2 — Rerun command uses CGO_ENABLED=0
- [ ] AC-3 — Env audit returns empty (zero creds)
- [ ] AC-4 — CGO audit returns zero matches
- [ ] AC-5 — QA manual edit → dashboard update verified
- [ ] AC-6 — G12 DoD Gate — all scenarios green after rerun

---

## On Completion

Dev-stock-price returns a DONE signal in the format:

```json
{
  "task_id": "P1-E",
  "pilot": "stock-price",
  "phase": 1,
  "agent": "dev-stock-price",
  "status": "DONE",
  "timestamp": "2026-05-24T??:??:??Z",
  "commit_sha": "<commit>",
  "file_modified": "apps/stock-price/dashboard/index.html",
  "ac_verdicts": {
    "AC-1": { "verdict": "PASS", "evidence": "..." },
    "AC-2": { "verdict": "PASS", "evidence": "..." },
    "AC-3": { "verdict": "PASS", "creds_audit_empty": true },
    "AC-4": { "verdict": "PASS", "cgo_grep_count": 0 },
    "AC-5": { "verdict": "PASS", "evidence": "..." },
    "AC-6": { "verdict": "PASS", "sandbox_all_green": true }
  },
  "g7_trust_contract": "EARNED",
  "g12_dod_gate": "SATISFIED",
  "next_task": "P1-F (optional) or P1-G (QA close-gate)"
}
```

PM will then:
1. Verify all 6 ACs PASS
2. Update SSOT (pilot-status-stock-price.json): P1-E status=DONE, g7_status=EARNED
3. Create P1-F dispatch (optional) or sequence P1-G (QA, if P1-F skipped)

---

## Reference Architecture

- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`
- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` (§P1-E, lines 401–430)
- **Scenario paths:** `docs/scenarios/stock-price/primitives/` and `docs/scenarios/stock-price/module/`
- **Dashboard:** `apps/stock-price/dashboard/index.html` (created by P1-D)
- **Sandbox runner:** `apps/stock-price/cmd/sandbox/main.go`

---

## G-Goals Calibration (from charter)

**G7 — Edit-JSON-and-rerun works (zero credentials in sandbox)**
- Env audit forbidden keys: `DB_` | `API_KEY` | `SECRET` | `TOKEN` | `PASSWORD` returns empty in sandbox process.
- Stock-price-specific CGO gate: sandbox binary builds+runs under `CGO_ENABLED=0`.
- Rerun-handler invokes `CGO_ENABLED=0` sandbox against edited fixtures (no live VnDirect, no real SQLite).

**G8 — Red/green status is honest**
- Test A = deliberate corruption of golden scenario (e.g., flip expected tier in tier-fallback-selector golden) → dashboard RED, diff captured.
- Test B = known golden → dashboard GREEN, diff=null.
- Both proven before YES.
- Pattern identical across all pilots.
- **P1-E contributes:** Proves dashboard updates on edits; QA will prove honest-red contract in P1-G (deliberate scenario corruption).

---

**Dispatch date:** 2026-05-24  
**Ready:** YES  
**WIP count after dispatch:** 1 (P1-E in progress; P1-A through P1-D DONE)
