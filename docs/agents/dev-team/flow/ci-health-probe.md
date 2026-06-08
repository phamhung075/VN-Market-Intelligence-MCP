<!-- size-justification: 157L — CI-health sub-flow SSOT spec. Steps CI-0..CI-4 (non-fatal gates, STALE-RUN gate, per-job conclusions, dedup fingerprint, signal emission) are all load-bearing; no safe extraction without breaking the CANON-SCRIPT contract. CI-HEALTH-FIX-BRIDGE 2026-06-08. -->
# Dev Team — Step 0a.5: CI Health Probe

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 0a.5 — runs after drain-signals, before PO triage)

**Architecture brief (SSOT source):** `docs/architecture-briefs/2026-06-08-ci-health-fix-bridge.md`

**CANON-SCRIPT:** `scripts/agents-flow/ci-health-probe.js` MUST match this spec exactly. Edit this file first; then update the script to match. The spec is the SSOT; the script is the implementation.

This sub-flow probes GitHub Actions CI health on `origin/main` once per dev-team hourly tick. If CI is RED on the current HEAD, it emits a `ci_red` signal into `docs/signals/` routed to PO. It is ALWAYS non-fatal — a probe failure at any step logs and falls through to Step 1 (PO Triage) without aborting the dev-team tick.

---

## Hard Constraints (MANDATORY — all four must be preserved in the canonical script)

1. **STALE-RUN GATE:** validate `run.headSha == git rev-parse origin/main` (after `git fetch origin main`) before emitting any signal. A run for an old HEAD is silently discarded.
2. **3-LAYER DEDUP:** (a) probe-level `signals_processed` DB fingerprint check before signal write; (b) drain-signals.js fingerprint dedup on re-read; (c) PO triage-signals.md open-entry check on `check_id`+`head_sha`. No `ci_red` task may be duplicated.
3. **VERIFICATION GATE:** a `ci_red` task's DONE acceptance = `conclusion=success` on a CI run whose `headSha` differs from the original failing SHA (local-only commits do not count).
4. **SAFE-JSON:** all CI run/job fields are untrusted. Use `execFileSync` array args (never `execSync` with string concat), `jq --arg`/`--argjson` bound params, `JSON.stringify()`. Non-fatal if `gh` is absent, unauthenticated, or errors — log + continue, never exit non-zero from the dev-team tick perspective.

---

## Step CI-0 — Non-fatal gh availability check

```
if gh binary not found in PATH:
  log "[ci-health-probe] SKIP: gh not found — skipping, dev-team tick continues"
  EXIT (non-fatal — fall through to Step 1)

gh auth status >/dev/null 2>&1
if exit code != 0:
  log "[ci-health-probe] SKIP: gh unauthenticated — skipping, dev-team tick continues"
  EXIT (non-fatal — fall through to Step 1)
```

---

## Step CI-1 — Fetch current HEAD and latest CI run (STALE-RUN GATE)

```
git fetch origin main --quiet
HEAD_SHA = git rev-parse origin/main

# Fetch last 5 runs — SAFE-JSON: output piped through jq only; no field interpolation into shell
RUNS_JSON = gh run list --branch main --limit 5
              --json databaseId,headSha,status,conclusion,event,workflowName

# Select most-recent run matching HEAD_SHA and workflowName == "CI"
# STALE-RUN GATE: runs with headSha != HEAD_SHA are discarded here
RUN = RUNS_JSON | jq --arg sha HEAD_SHA
        '[.[] | select(.workflowName=="CI" and .headSha==$sha)] | first // empty'

if RUN is empty:
  log "[ci-health-probe] No CI run found for HEAD {HEAD_SHA} — skipping"
  EXIT (non-fatal)

CONCLUSION = RUN.conclusion ?? RUN.status

if CONCLUSION == "success":
  log "[ci-health-probe] CI GREEN on HEAD {HEAD_SHA} (run {RUN.databaseId}) — no signal"
  EXIT (non-fatal)

# Only act on terminal conclusions (failure, cancelled, timed_out, action_required)
if RUN.status in {in_progress, queued, waiting}:
  log "[ci-health-probe] CI run {RUN.databaseId} still {RUN.status} — skipping until terminal"
  EXIT (non-fatal)

RUN_ID = RUN.databaseId
```

---

## Step CI-2 — Per-job conclusions

```
# SAFE-JSON: all field values processed by jq; no interpolation into shell strings
JOBS_JSON = gh run view {RUN_ID} --json status,conclusion,jobs -q '.jobs'

FAILING_JOBS = JOBS_JSON | jq
  '[.[] | select(.conclusion != "success" and .conclusion != "skipped")
    | {name: .name, conclusion: .conclusion, jobId: .databaseId}]'

if FAILING_JOBS is empty array:
  log "[ci-health-probe] No failing jobs found for run {RUN_ID} — skipping"
  EXIT (non-fatal)
```

---

## Step CI-3 — Dedup fingerprint + signal emission

Dedup key: `ci_red:<HEAD_SHA>:<comma-sorted failing job names>`

Same fingerprint pattern as `repair_task_request` in drain-signals.md — identical failing jobs on the same HEAD SHA emit one signal, regardless of how many ticks fire before PO acts.

```
SORTED_JOBS = FAILING_JOBS[].name | sort | join(",")
TS          = ISO-8601 UTC timestamp
DEDUP_KEY   = "ci_red:" + HEAD_SHA + ":" + SORTED_JOBS
FINGERPRINT = sha256(DEDUP_KEY)

# Layer 1 dedup: probe-level signals_processed check
ALREADY = sqlite3 docs/signals/signals.db
            "SELECT count(*) FROM signals_processed WHERE fingerprint='{FINGERPRINT}';"
            (non-fatal: treat error as 0)

if ALREADY != "0":
  log "[ci-health-probe] ci_red already emitted for HEAD {HEAD_SHA} jobs [{SORTED_JOBS}] — dedup, skip"
  EXIT (non-fatal)

# Write signal file — SAFE-JSON: all dynamic fields via jq --arg / --argjson bound params
SIGNAL_FILE = "docs/signals/ci-red-{HEAD_SHA[0:8]}-{TS (digits only)}.json"
Signal shape:
{
  "from":       "ci-health-probe",
  "to":         "po",
  "type":       "ci_red",
  "priority":   "high",
  "createdAt":  "{TS}",
  "dedup_key":  "{DEDUP_KEY}",
  "payload": {
    "check_id":              "CI-RED-{HEAD_SHA[0:8]}",
    "head_sha":              "{HEAD_SHA}",
    "run_id":                "{RUN_ID}",
    "conclusion":            "{CONCLUSION}",
    "failing_jobs":          [{name, conclusion, jobId}...],
    "zone_owner":            "dev-team (CI fix)",
    "summary":               "CI RED on main HEAD {HEAD_SHA}: {SORTED_JOBS}",
    "suggested_sprint_class":"FIX",
    "verification_gate":     "ci_green_on_subsequent_push"
  }
}

log "[ci-health-probe] Emitted ci_red signal: {SIGNAL_FILE} (run {RUN_ID}, HEAD {HEAD_SHA}, jobs: {SORTED_JOBS})"
```

Signal shape canonical reference: `docs/architecture-briefs/2026-06-08-ci-health-fix-bridge.md` §3.4.

---

## Step CI-4 — Non-fatal exit, return to main flow

The probe always falls through to Step 1 (PO Triage). A probe failure at any step:
- Logs `[ci-health-probe] WARN: <message>` to stdout
- Does NOT throw / does NOT exit with non-zero from the dev-team tick
- Does NOT block drain-signals output from reaching PO

VERIFICATION GATE reminder (baked into task status_note by PO):
Task `{check_id}-FIX` is DONE-eligible only when:
`gh run list --branch main --limit 3 --json headSha,conclusion` returns a `conclusion=success` run on a SHA **different from** the original failing `{HEAD_SHA}`.

---

**CANON-SCRIPT pointer:** `scripts/agents-flow/ci-health-probe.js`
Language: Node.js; deps: `child_process`, `crypto`, `fs`, `path` only (mirrors drain-signals.js).
Key requirements: `execFileSync('gh', [...])` array args; `execFileSync('sqlite3', [DB, sql])` bound SQL; `JSON.stringify` for signal write; always `process.exit(0)`.
Edit this spec first — then update the script to match. Never the reverse.
