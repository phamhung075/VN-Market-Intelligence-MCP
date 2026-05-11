# Architecture Brief — Commit Convention Audit Signal Guard

**Date authored:** 2026-05-11
**Sprint:** SPRINT-S-1877b
**Author:** agents-architect
**Status:** DESIGN — implementation delegated to developer
**Parent brief:** `docs/architecture-briefs/2026-05-17-commit-convention-audit.md`
**Script under design:** `scripts/audits/commit-convention-audit.sh` (shipped in SPRINT-S-1877a, merge SHA 20005b95)

---

## 1. Context / Problem Statement

`scripts/audits/commit-convention-audit.sh` was designed as a one-shot Day-7 gate tool (trigger: 2026-05-17). As a side effect of normal development on 2026-05-11 (Day 0), developer and QA each test-ran the script. Three signal files appeared at `docs/signals/` (2 FAIL + 1 PASS). Dev-team processed them as `skipped-test-artifact` in cycles 29/30 — no harm done this cycle.

The structural risk is forward-looking: any future test invocation that happens to produce a PASS verdict will write a real signal to `docs/signals/`. agent-father reads that directory. A PASS signal emitted before 2026-05-17 would route to agent-father and trigger C1+C2 collapse (Done retirement + Todo→BACKLOG migration) against an incomplete audit window — a false greenlight.

The JSON report in `docs/signals/processed/` is not the problem. That file is a passive artifact, never read by signal-routing agents. Only the `docs/signals/agents-architect-*-phase-b-c1-c2*.json` drop is dangerous.

**Root cause:** signal emission has no guard against non-authoritative invocations. The script has no concept of "am I being run for real, or for testing".

---

## 2. Decision: Chosen Mechanism

**Chosen: combination of (a) + (b) — `--emit-signal` flag + window guard.**

### Why not (a) alone — `--dry-run` flag

A `--dry-run` flag moves the default to safe but relies entirely on the caller opting out. If pm or agent-father invoke the script on 2026-05-17 without the flag, they get no signal. It shifts the burden to callers and introduces a new failure mode: the gate run itself silently skips signal emission.

### Why not (b) alone — window guard

A pure window guard is invisible. On 2026-05-17 at 00:01Z, a test run would emit a real signal because the date matches. The guard also silently rejects invocations outside the window with no feedback — a QA run on 2026-05-18 produces no stdout hint that emission was suppressed.

### Why not (c) — `docs/signals/dryrun/`

Routing agents would need a denylist directory. That touches agent-father's signal-scan logic — a wider change surface than warranted.

### Chosen design: `--emit-signal` flag + window guard (belt-and-suspenders)

**Default behavior is no signal emission.** Signal emission requires explicit opt-in AND date-range validation:

- Without `--emit-signal`: script runs full audit, writes report to `docs/signals/processed/`, exits with correct code — but writes no signal file. Safe for developer/QA use at any time.
- With `--emit-signal`: script additionally checks that `SINCE_DATE` equals the canonical Phase B window start (`2026-05-10T00:00:00Z`) AND that today's UTC date is within `2026-05-10` to `2026-05-17` inclusive. Both conditions must pass. If either fails, script prints a warning and skips signal emission; report and exit code are unaffected.

This gives two independent rejections of stray emission: explicit flag (social/process gate) + date guard (automated correctness gate). A test run is rejected by the missing flag. A gate run on the wrong date is rejected by the window guard even if the flag is present.

The `--emit-signal` flag name is self-documenting — it makes signal emission an intentional action visible in shell history and flow docs.

---

## 3. Implementation Spec

### CLI signature

```
bash scripts/audits/commit-convention-audit.sh [SINCE_DATE] [--emit-signal]
```

- `SINCE_DATE` — positional arg (default: `2026-05-10T00:00:00Z`), unchanged from current.
- `--emit-signal` — optional flag, any position after `SINCE_DATE`. Presence enables signal emission subject to window guard.
- Order: `--emit-signal` is parsed from `$@` after SINCE_DATE is consumed, so `bash ... --emit-signal` and `bash ... 2026-05-10T00:00:00Z --emit-signal` are both valid.

### Env vars

No new env vars. `LC_ALL=C` and `LANG=C` stay at top, unchanged.

### Canonical Phase B window constants (added near top of script, after existing vars)

```bash
PHASE_B_SINCE_CANONICAL="2026-05-10T00:00:00Z"
PHASE_B_UNTIL_DATE_CANONICAL="2026-05-17"   # inclusive end, UTC date only
```

### Flag parsing (added after SINCE_DATE assignment)

```bash
EMIT_SIGNAL=false
for arg in "$@"; do
  [ "${arg}" = "--emit-signal" ] && EMIT_SIGNAL=true
done
```

### Behavior table

| `--emit-signal` present | SINCE_DATE = canonical | Today in window | Signal emitted | Report written | Exit code |
|---|---|---|---|---|---|
| No | any | any | No | Yes | 0 or 1 |
| Yes | Yes | Yes | Yes | Yes | 0 or 1 |
| Yes | Yes | No | No (warning) | Yes | 0 or 1 |
| Yes | No | Yes | No (warning) | Yes | 0 or 1 |
| Yes | No | No | No (warning) | Yes | 0 or 1 |

"Today in window" = current UTC date string (`date -u +%Y-%m-%d`) is `>= 2026-05-10` AND `<= 2026-05-17`.

### Signal emission block replacement

Replace the current unconditional signal-drop block (lines 347–386) with:

```bash
# ---------------------------------------------------------------------------
# Signal drop — only when --emit-signal flag is present AND window guard passes
# ---------------------------------------------------------------------------
if [ "${EMIT_SIGNAL}" = "true" ]; then
  TODAY_UTC="$(date -u +%Y-%m-%d)"
  window_ok=false
  if [ "${SINCE_DATE}" = "${PHASE_B_SINCE_CANONICAL}" ] && \
     [ "${TODAY_UTC}" \>= "2026-05-10" ] && \
     [ "${TODAY_UTC}" \<= "${PHASE_B_UNTIL_DATE_CANONICAL}" ]; then
    window_ok=true
  fi

  if [ "${window_ok}" = "false" ]; then
    echo "WARNING: --emit-signal ignored. SINCE_DATE or today (${TODAY_UTC}) outside Phase B window (2026-05-10..2026-05-17). Report written; no signal dropped."
  else
    if [ "${verdict}" = "PASS" ]; then
      SIGNAL_FILE="docs/signals/agents-architect-${SIGNAL_TS}-phase-b-c1-c2.json"
      cat > "${SIGNAL_FILE}" << SIGEOF
{
  "from": "agents-architect",
  "to": "agent-father",
  "type": "phase_b_greenlight",
  "tasks": ["C1", "C2"],
  "audit_report": "${REPORT_FILE}",
  "verdict": "PASS",
  "generated_at": "${UNTIL_DATE}"
}
SIGEOF
      echo "Signal drop (PASS): ${SIGNAL_FILE}"
    else
      # Build failing_criteria list (existing logic unchanged)
      failing_criteria="["
      first=true
      [ "${c1_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C1"'; first=false; }
      [ "${c2_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C2"'; first=false; }
      [ "${c3_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C3"'; first=false; }
      [ "${c4_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C4"'; first=false; }
      failing_criteria+="]"

      SIGNAL_FILE="docs/signals/agents-architect-${SIGNAL_TS}-phase-b-c1-c2-fail.json"
      cat > "${SIGNAL_FILE}" << SIGEOF
{
  "from": "agents-architect",
  "to": "user",
  "type": "phase_b_fail",
  "tasks": ["C1", "C2"],
  "verdict": "FAIL",
  "failing_criteria": ${failing_criteria},
  "audit_report": "${REPORT_FILE}",
  "remediation": "See violations list in audit report. Extend window by 7 days (re-run 2026-05-24). Fix agent flows that produced violations.",
  "generated_at": "${UNTIL_DATE}"
}
SIGEOF
      echo "Signal drop (FAIL): ${SIGNAL_FILE}"
    fi
  fi
else
  echo "Signal emission skipped (no --emit-signal flag). Report at: ${REPORT_FILE}"
fi
```

LOC delta: the new block is ~37 LOC replacing the existing ~40 LOC signal block. Net script length is neutral or slightly shorter. The flag-parse addition (~4 LOC) + canonical constants (~2 LOC) brings the addition to ~6 LOC net. Well within the ≤30 LOC constraint.

### Official gate invocation (pm flow, 2026-05-17)

```bash
bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z --emit-signal
```

Both guards pass: SINCE_DATE matches canonical, date is within window → signal emitted.

### Test / dev invocation (any date)

```bash
bash scripts/audits/commit-convention-audit.sh
bash scripts/audits/commit-convention-audit.sh 2026-05-10T00:00:00Z
```

No `--emit-signal` → signal block never reached → no `docs/signals/` write.

---

## 4. Acceptance Criteria

**AC-1 — Default safe:** Running the script without `--emit-signal` produces a report at `docs/signals/processed/` and exits with the correct code, but writes zero files to `docs/signals/` at the root level.

**AC-2 — Flag + window = emit:** Running with `--emit-signal` and `SINCE_DATE=2026-05-10T00:00:00Z` on a date between 2026-05-10 and 2026-05-17 (UTC) writes exactly one signal file to `docs/signals/` matching the schema from the parent brief.

**AC-3 — Flag without window = warning, no signal:** Running with `--emit-signal` and a SINCE_DATE other than the canonical value (or on a date outside the window) prints a `WARNING:` line to stdout and writes no file to `docs/signals/`.

**AC-4 — Report always written:** Under all invocations (with or without `--emit-signal`, regardless of window guard outcome), `docs/signals/processed/commit-convention-audit-<YYYYMMDD>.json` is always written and contains a valid JSON structure with the correct verdict.

**AC-5 — Exit code unaffected:** The script's exit code (0=PASS, 1=FAIL) is determined solely by the audit verdict, not by whether signal emission was suppressed.

**AC-6 — Bash 3.2 compat:** The script passes `bash --version` check for 3.2 (macOS system bash). No `local -n`, no `declare -A`, no `[[` with `<`/`>` string comparison without escaping, no `mapfile`.

---

## 5. Affected Files

| File | Change | Notes |
|------|--------|-------|
| `scripts/audits/commit-convention-audit.sh` | EDIT — ~6 LOC net addition | Single file. See §3 for exact block. |

No README or docs updates required. The parent brief (`docs/architecture-briefs/2026-05-17-commit-convention-audit.md`) §5 Owner/Trigger section should have its invocation example updated to include `--emit-signal` — but this is cosmetic and can be done in the same commit. Not a blocking dependency.

No changes to agent flows, signal-routing logic, or agent-father scan patterns. The `--emit-signal` flag is purely additive; absent callers (old invocations without the flag) become automatically safe.

---

## 6. Migration: Stale Test-Artifact Signals

Three signal files written by today's test runs were already processed by dev-team cycles 29/30 as `skipped-test-artifact`:

- `docs/signals/agents-architect-2026-05-11T17-16-37Z-phase-b-c1-c2-fail.json`
- `docs/signals/agents-architect-2026-05-11T17-17-06Z-phase-b-c1-c2-fail.json`
- `docs/signals/agents-architect-2026-05-11T17-18-27Z-phase-b-c1-c2.json`

Git status shows all three as deleted (`D`), confirming cycles 29/30 already drained them. No manual cleanup is required. No further action needed on these files.

The two FAIL signals pose no forward risk (they would not trigger collapse). The one PASS signal was already deleted — the window for false-greenlight has already passed for that artifact.

After SPRINT-S-1877b ships, no test run will produce any `docs/signals/` file regardless of verdict. The stale-signal problem is structurally prevented, not just remediated.

---

## 7. Rollback

If the guard mechanism introduces a regression (e.g. pm invokes correctly but window guard logic has a date-comparison bug and suppresses the legitimate gate signal):

```bash
git revert <SPRINT-S-1877b-commit-sha>
```

Single commit, single file. Revert restores the original unconditional signal-drop behavior from SPRINT-S-1877a. pm can then run the original script manually on 2026-05-17 and drop the signal by hand using the schema in the parent brief §4.

No downstream agents, flows, or config files are changed by SPRINT-S-1877b. Revert is clean with zero cascade.

---

**LOC constraint check:** flag parse = 4 LOC, canonical constants = 2 LOC, replacement block is net-neutral vs existing signal block. Total net addition ≤ 10 LOC. Within the ≤30 LOC constraint.
