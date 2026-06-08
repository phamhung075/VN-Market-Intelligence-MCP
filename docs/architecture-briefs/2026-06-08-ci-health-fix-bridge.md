# Architecture Brief: CI-Health → Fix-Task Bridge

**Date:** 2026-06-08
**Author:** agents-architect
**Status:** READY-FOR-IMPLEMENTATION
**Slug:** ci-health-fix-bridge
**Signal:** `docs/signals/ci-health-fix-bridge-20260608T180755Z.json`

---

## DJ-GATE-1 — Decision Journal

**task-id:** CI-HEALTH-FIX-BRIDGE-DESIGN-20260608
**decision:** Insert a CI-health probe as a Step-0 sibling in the dev-team cron tick (runs immediately after drain-signals.md, before PO triage). The probe emits `ci_red` signals into the signal_queue routed to PO, which then dedupes and opens fix tasks via the existing `repair_task_request` pathway. Implementation owner: agent-father (flow .md + script), developer (scripts/agents-flow/ci-health-probe.js).
**rationale:** Sprint CI-RED-RECONCILE surfaced because a human noticed a RED ci.yml — the system had no automated path to self-detect it. The repair_task_request precedent and triage-signals.md routing table are already the correct mechanism; this brief wires CI failures into that existing infrastructure.
**alternatives-rejected:** (1) Standalone low-frequency cron (e.g. every 30 min): adds cron management overhead; hourly dev-team tick is already the natural cadence for code-push-triggered events — no benefit justifies a parallel cron. (2) Direct task-board write by the probe: skips PO dedup + triage — unsafe; PO owns task-board writes. (3) Webhook listener (GitHub → VPS): requires infra; out of scope for a flow-level bridge.
**risk:** Stale-run acting on wrong headSha (mitigated by STALE-RUN GATE); dedup gap creating duplicate tasks (mitigated by fingerprint + task_board title-contains check in PO triage-signals.md § repair_task_request); false-close on local commit (mitigated by VERIFICATION GATE).

---

## 1. Problem Statement

The dev-team cron orchestration loop has no automated CI/CD health probe. When `.github/workflows/ci.yml` goes RED on `origin/main`, the failure is invisible to all agents until a human surfaces it (as happened this session with sprint CI-RED-RECONCILE: `go-lint` job `technical-analysis` RED for `depguard` violation since push `8ffb1985`). The cost is hours of drift before a fix task enters the backlog.

Root cause: no Step-0 flow step reads GitHub Actions run state. The anomaly→task bridge (`repair_task_request` pathway) is fully functional but receives no input about CI state.

---

## 2. Affected Agents / Files

| Agent/File | Role | Change Required |
|---|---|---|
| `docs/agents/dev-team/flow/main.md` | Orchestration dispatcher | Add `ci-health-probe` jump-to entry in JUMP-TO table + Step 0a.5 call between drain-signals and PO triage |
| `docs/agents/dev-team/flow/ci-health-probe.md` | New sub-flow (SSOT spec) | Create: defines probe logic, STALE-RUN GATE, signal shape, dedup keys |
| `scripts/agents-flow/ci-health-probe.js` | Canonical script (CANON-SCRIPT) | Create: reusable Node.js probe (mirrors drain-signals.js pattern); runs gh CLI, computes dedup fingerprint, writes signal JSON |
| `docs/agents/dev-team/flow/drain-signals.md` | Signal routing table (0a-3) | Add `ci_red` row to routing table |
| `docs/agents/po/flow/triage-signals.md` | PO signal handler | Add `ci_red` row: dedup check + task_board append (mirrors `repair_task_request` pattern) |

---

## 3. Recommended Implementation

### 3.1 Placement in the Dev-Team Cron Flow

Insert `Step 0a.5 — CI Health Probe` between Step 0a (drain-signals) and Step 1 (PO Triage) in `docs/agents/dev-team/flow/main.md`.

This keeps it in the Step-0 family (pre-triage data collection) and consistent with the existing drain pattern. It is NOT a standalone cron — it runs once per dev-team hourly tick at `:07`. Justification: CI runs are push-triggered; a fresh push is reflected in the GitHub API within seconds; checking once per hour is sufficient to ensure a RED is caught within one tick of the push. Hammering the gh API is unnecessary and risks secondary rate-limit failures that would mask other flow steps.

Add to JUMP-TO table:

```
| CI probe (after drain-signals) | `ci-health-probe` | `ci-health-probe.md` |
```

### 3.2 New Sub-Flow: `docs/agents/dev-team/flow/ci-health-probe.md`

The file is the SSOT spec. The canonical script (`scripts/agents-flow/ci-health-probe.js`) MUST match this spec; the spec is edited first, then the script.

**Step CI-0 — Non-fatal gh availability check:**
```
if ! command -v gh >/dev/null 2>&1; then
  log "[ci-health-probe] SKIP: gh not found — skipping, dev-team tick continues"
  EXIT (non-fatal — fall through to Step 1)
fi
gh auth status >/dev/null 2>&1
if [ $? -ne 0 ]; then
  log "[ci-health-probe] SKIP: gh unauthenticated — skipping, dev-team tick continues"
  EXIT (non-fatal — fall through to Step 1)
fi
```

**Step CI-1 — Fetch current HEAD and latest CI run (STALE-RUN GATE):**
```bash
git fetch origin main --quiet
HEAD_SHA=$(git rev-parse origin/main)

# Fetch last 5 runs for workflowName=="CI" on branch main
# SAFE-JSON: output piped through jq only; no field interpolation into shell commands
RUNS_JSON=$(gh run list --branch main --limit 5 \
  --json databaseId,headSha,status,conclusion,event,workflowName)

# Select most-recent run whose headSha == HEAD_SHA AND workflowName == "CI"
RUN=$(echo "$RUNS_JSON" | jq -r \
  --arg sha "$HEAD_SHA" \
  '[.[] | select(.workflowName=="CI" and .headSha==$sha)] | first // empty')

if [ -z "$RUN" ]; then
  log "[ci-health-probe] No CI run found for HEAD $HEAD_SHA — skipping"
  EXIT (non-fatal)
fi

RUN_ID=$(echo "$RUN"  | jq -r '.databaseId')
CONCLUSION=$(echo "$RUN" | jq -r '.conclusion // .status')

if [ "$CONCLUSION" = "success" ]; then
  log "[ci-health-probe] CI GREEN on HEAD $HEAD_SHA (run $RUN_ID) — no signal"
  EXIT (non-fatal)
fi

# STALE-RUN GATE: if run is still queued/in_progress, only act when conclusion is terminal
# terminal conclusions: success, failure, cancelled, timed_out, action_required, skipped
TERMINAL="failure cancelled timed_out action_required"
STATUS=$(echo "$RUN" | jq -r '.status')
if [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "queued" ] || [ "$STATUS" = "waiting" ]; then
  log "[ci-health-probe] CI run $RUN_ID still $STATUS — skipping until terminal"
  EXIT (non-fatal)
fi
```

**Step CI-2 — Per-job conclusions:**
```bash
# SAFE-JSON: jq processes all field values; no interpolation into shell
JOBS_JSON=$(gh run view "$RUN_ID" --json status,conclusion,jobs -q '.jobs')

FAILING_JOBS=$(echo "$JOBS_JSON" | jq -c \
  '[.[] | select(.conclusion != "success" and .conclusion != "skipped") |
    {name: .name, conclusion: .conclusion, jobId: .databaseId}]')

FAILING_NAMES=$(echo "$FAILING_JOBS" | jq -r '.[].name' | tr '\n' ',' | sed 's/,$//')
```

**Step CI-3 — Dedup fingerprint + signal emission:**

Dedup key: `ci_red:<HEAD_SHA>:<comma-sorted failing job names>` — identical to the fingerprint used for `repair_task_request` dedup. This ensures: same run, same failing jobs = no duplicate signal even if the probe fires multiple ticks before PO acts.

```bash
# SAFE-JSON: build signal JSON with jq --arg (bound params); NEVER shell-interpolate run/job fields
SORTED_JOBS=$(echo "$FAILING_JOBS" | jq -r '.[].name' | sort | tr '\n' ',')
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEDUP_KEY="ci_red:${HEAD_SHA}:${SORTED_JOBS}"

# Check signals_processed for existing fingerprint
FINGERPRINT=$(echo -n "${DEDUP_KEY}" | shasum -a 256 | awk '{print $1}')
ALREADY_PROCESSED=$(sqlite3 docs/signals/signals.db \
  "SELECT count(*) FROM signals_processed WHERE fingerprint='${FINGERPRINT}';" 2>/dev/null || echo "0")

if [ "$ALREADY_PROCESSED" != "0" ]; then
  log "[ci-health-probe] ci_red already emitted for HEAD $HEAD_SHA jobs [$SORTED_JOBS] — dedup, skip"
  EXIT (non-fatal)
fi

# Write signal file (SAFE-JSON: all dynamic fields passed via jq --arg / --argjson)
SIGNAL_FILE="docs/signals/ci-red-${HEAD_SHA:0:8}-${TS//[^0-9]/}.json"
jq -n \
  --arg from "ci-health-probe" \
  --arg to "po" \
  --arg type "ci_red" \
  --arg priority "high" \
  --arg createdAt "$TS" \
  --arg headSha "$HEAD_SHA" \
  --arg runId "$RUN_ID" \
  --arg conclusion "$CONCLUSION" \
  --arg dedupKey "$DEDUP_KEY" \
  --argjson failingJobs "$FAILING_JOBS" \
  '{
    from: $from, to: $to, type: $type, priority: $priority, createdAt: $createdAt,
    dedup_key: $dedupKey,
    payload: {
      check_id: ("CI-RED-" + ($headSha | .[0:8])),
      head_sha: $headSha,
      run_id: $runId,
      conclusion: $conclusion,
      failing_jobs: $failingJobs,
      zone_owner: "dev-team (CI fix)",
      summary: ("CI RED on main HEAD " + $headSha + ": " + ([$failingJobs[].name] | join(", "))),
      suggested_sprint_class: "FIX",
      verification_gate: "ci_green_on_subsequent_push"
    }
  }' > "$SIGNAL_FILE"

log "[ci-health-probe] Emitted ci_red signal: $SIGNAL_FILE (run $RUN_ID, HEAD $HEAD_SHA, jobs: $SORTED_JOBS)"
```

**Step CI-4 — Non-fatal exit, return to drain flow:**
The probe always falls through to Step 1 (PO Triage). A probe failure at any step logs and exits non-fatally. It NEVER throws/exits non-zero from the dev-team tick perspective.

### 3.3 Canonical Script: `scripts/agents-flow/ci-health-probe.js`

Pattern mirrors `scripts/agents-flow/drain-signals.js`. Agent-father must instruct developer to create this file. Key requirements:

- Language: Node.js (no additional deps beyond `child_process`, `crypto`, `fs`, `path` — same as drain-signals.js)
- Executes Steps CI-0 through CI-4 above
- Uses `execFileSync('gh', [...])` with array args — NEVER `execSync('gh ' + field)` (injection-safe)
- Uses `execFileSync('sqlite3', [DB, sql])` with bound SQL string — NEVER interpolate run/job fields into the SQL string
- Signals write uses `fs.writeFileSync` with `JSON.stringify(obj, null, 2)` — no shell echo
- Exits with code 0 always (non-fatal contract); probe errors logged to stdout as `[ci-health-probe] WARN: ...`
- Script location: `scripts/agents-flow/ci-health-probe.js`
- Flow pointer: `docs/agents/dev-team/flow/ci-health-probe.md` is the SSOT

### 3.4 Signal Shape (ci_red)

```json
{
  "from": "ci-health-probe",
  "to": "po",
  "type": "ci_red",
  "priority": "high",
  "createdAt": "<ISO-8601 UTC>",
  "dedup_key": "ci_red:<headSha>:<sorted-failing-job-names>",
  "payload": {
    "check_id": "CI-RED-<headSha[0:8]>",
    "head_sha": "<full SHA>",
    "run_id": "<GitHub Actions databaseId>",
    "conclusion": "failure | timed_out | cancelled | ...",
    "failing_jobs": [
      {"name": "<job name>", "conclusion": "failure", "jobId": "<numeric id>"}
    ],
    "zone_owner": "dev-team (CI fix)",
    "summary": "CI RED on main HEAD <sha>: <job1>, <job2>",
    "suggested_sprint_class": "FIX",
    "verification_gate": "ci_green_on_subsequent_push"
  }
}
```

### 3.5 drain-signals.md Routing Table Addition (0a-3)

Add row to the signal routing table in `docs/agents/dev-team/flow/drain-signals.md`:

```
| `ci_red` | `ci-health-probe` | PO Step 0-SIG | CI workflow RED on origin/main HEAD; payload = {check_id, failing_jobs, head_sha}; PO creates deduped FIX task |
```

### 3.6 triage-signals.md PO Handler Addition

Add row to `docs/agents/po/flow/triage-signals.md` signal routing table:

```
| `ci_red` | `ci-health-probe` | Read payload. Extract `check_id`, `failing_jobs`, `head_sha`, `suggested_sprint_class`. **Dedup check (two-layer):** (1) scan `docs/data/orch/orch-state.json` `.task_board` for any open entry (status ∈ TODO/IN_PROGRESS/REVIEW/BLOCKED) whose title or id contains `check_id` — if found → log `"[po] ci_red: {check_id} — duplicate task_board entry, skipped"`, mark signal DONE, skip. (2) If no task-board duplicate, also check `task_board` for any open FIX task whose `status_note` contains `head_sha` — if the fix is already IN_PROGRESS/REVIEW for that SHA, skip. If no duplicate: append to `.task_board.backlog[]`: `{id: "{check_id}-FIX", title: "{check_id}-FIX — CI RED: {failing_jobs list}", owner: "po", status: "TODO", zone: "apps/<zone inferred from job name>", created_at: "<ISO-8601 UTC>", status_note: "AC: gh run list shows conclusion=success for a push AFTER {head_sha} (verification_gate=ci_green_on_subsequent_push). Priority: high. Failing jobs: {job names}."}` Commit orch-state.json (commit-mutex, atomic write). Log `"[po] ci_red: created BACKLOG task {check_id}-FIX"`. | `.task_board.backlog[]` FIX entry — standard po→dev chain applies |
```

### 3.7 STALE-RUN GATE (Hard Constraint)

The probe MUST validate `run.headSha == git rev-parse origin/main` (after `git fetch origin main`) before emitting any signal. This session confirmed the trap: run `9f063c9a` (old HEAD) was already fixed by `8ffb1985` — acting on the stale run would have spawned a spurious fix task. The check is enforced in Step CI-1 above and MUST appear in the canonical script as the first gate after run selection.

### 3.8 VERIFICATION GATE (Task DONE Condition)

A CI-fix task created by this bridge MUST carry `status_note` with `verification_gate: ci_green_on_subsequent_push`. This encodes the AC: the task is eligible for DONE only when a CI run with `conclusion=success` AND `headSha != <original failing sha>` exists for `origin/main`. Local-only commits do NOT count. The developer's QA flow must include: `gh run list --branch main --limit 3 --json headSha,conclusion` — find a success run on a SHA newer than the failing one.

### 3.9 DEDUP Layering

Three dedup layers prevent duplicate signal emission and duplicate task creation:

1. **Probe-level (before signal write):** `signals_processed` DB fingerprint check on `sha256(dedup_key)`. If found → skip. This prevents re-emitting on every tick while a fix is in progress.
2. **Drain-level:** `drain-signals.js` fingerprint dedup (`sha256(from + type + payload + createdAt)`) catches replay of the same signal file.
3. **PO triage-level:** Task-board open-entry check on `check_id` and `head_sha` in `status_note`. If an open task already covers the same SHA+job combination → skip, even if the signal slipped through dedup layers 1-2.

### 3.10 SAFE-JSON Enforcement

All dynamic CI run/job fields (run IDs, job names, SHA, conclusion strings) MUST be treated as untrusted string data:
- In the script: use `execFileSync` with argument arrays, never `execSync` with string concatenation
- JSON payload construction: use `jq --arg` / `--argjson` bound params or `JSON.stringify()` in Node.js
- SQLite queries: use parameterized-equivalent (SQL with `'${field}'` only for fields already validated as hex/numeric; untrusted strings via node-sqlite3 bound params or escaped with `replace(/'/g, "''")`)
- The `dedup_key` and `check_id` fields are derived from `HEAD_SHA` (a hex string from `git rev-parse` — safe for inclusion) and sorted job names (alphanumeric)

---

## 4. Dependencies and Sequencing

| Step | Dependency | Notes |
|---|---|---|
| 1 | agent-father creates `docs/agents/dev-team/flow/ci-health-probe.md` | New sub-flow file; spec is this brief |
| 2 | developer creates `scripts/agents-flow/ci-health-probe.js` | Canonical script; gated on step 1 (flow is SSOT) |
| 3 | agent-father edits `docs/agents/dev-team/flow/main.md` | Add JUMP-TO entry + Step 0a.5 call |
| 4 | agent-father edits `docs/agents/dev-team/flow/drain-signals.md` | Add `ci_red` to routing table (0a-3) |
| 5 | agent-father edits `docs/agents/po/flow/triage-signals.md` | Add `ci_red` handler row |
| 6 | QA: run probe manually against live repo | `node scripts/agents-flow/ci-health-probe.js` — verify signal file shape + dedup on re-run |

Steps 1 and 2 must be sequential (script reads flow spec). Steps 3-5 are independent once step 1 is done.

No Docker rebuild required. No new infra. `gh` CLI is assumed already authenticated in the dev session (existing usage in the repo). The non-fatal gate in Step CI-0 ensures the dev-team tick never blocks if `gh` is absent or rate-limited.

---

## 5. Live Context — CI-RED-RECONCILE (Grounding Evidence)

- Run ID: `27157108271`, HEAD `8ffb1985`, conclusion `failure`
- Failing job: `go-lint` (technical-analysis) — 1 depguard violation `cmd/sandbox/main.go:44` (Fence-C)
- Green jobs: `py-lint`, `macro-go-lint`, `stock-price-go-lint`, `alert-engine-go-lint`, `api-gateway-go-lint`, `kinh-dich-go-lint`
- Stale run trap (this session): run for HEAD `9f063c9a` was also visible in `gh run list`; STALE-RUN GATE correctly gates it out
- The probe design would have emitted `check_id: "CI-RED-8ffb1985"` with `failing_jobs: [{name: "go-lint", conclusion: "failure"}]` on the first dev-team tick after the push — one signal, one deduped FIX task in BACKLOG.

---

## 6. Signals Dropped

- `docs/signals/ci-health-fix-bridge-20260608T180755Z.json` → agent-father (implement steps 1-5)

---

## 7. Out of Scope

- Modifying `.github/workflows/ci.yml` — this brief is about the orchestration probe, NOT the CI definition
- Adding new GitHub Actions jobs — out of scope
- VPS/Telegram alert on CI RED — the existing anomaly-to-task bridge handles escalation once PO has the fix task in BACKLOG; no new alert path needed
- Automatically fixing the failing code — the bridge opens a task; developer executes it
