# system-auditor A-30 Reclamation Gate + A-21 Windowed Restart — Detection-Only Predicate Tune

**Task:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE (`docs/data/orch/orch-state.json` → `task_board.backlog`) — plan_only+supervised, recurring_bug_count=4, commissioned by PO 2026-07-23T03:47Z (`po_escalation_20260723`)
**Author:** agents-architect | **Date:** 2026-07-23T04:08Z
**Scope:** Design only — detection-layer predicate tune for system-auditor. NO app code, NO deploy/restart/rebuild of any monitored service (user-gated). Change zone restricted to `docs/agents/system-auditor/*` (declared by the commissioning task).
**Design scope covered (4 items, router-commissioned):** (1) A-30 WARN threshold + multi-probe reclamation gate, (2) WARN→CRITICAL escalation gate, (3) dedup-ledger must not auto-escalate a benign-band finding, (4) A-21 windowed/crash-only re-model.

---

## Problem — live evidence (07-23)

```
03:11Z  MemPerc=91.25%  → auditor narration: "genuine sustained leak... indicates recent
                          OOM-kill restart" — RestartCount=0 the entire session; no OOM
                          event occurred. Confabulated commentary, not RAW-PROBE evidence.
03:42Z  MemPerc=92.50%  → "sustained growth from 91.25% at 03:11Z... confirms memory leak"
                          → severity CRITICAL, sys-20260723T034235-2a44, Telegram fired.
```

RAW verify at 03:43Z (`po_escalation_20260723`): cgroup MemPerc 94.98%, but VmRSS
2,843,808kB (90.4% of the 3GiB cap — cgroup counts reclaimable page-cache), VmHWM
2,971,264kB **> VmRSS** (peak-then-decline already happened), `:3000/health` 200/2.35ms,
OOMKilled=false, RestartCount=0. None of the 4 genuine tripwires (OOMKilled / >93%-no-dip /
>97%-sustained / total unresponsiveness) were met. The CRITICAL was minted from a bare
**2-point, 30-minute-apart MemPerc delta** — no multi-probe window, no OOMKilled check, no
VmHWM/VmRSS check.

## Root-cause chain (why this keeps happening, 4th recurrence)

1. **`tier1-probe.md` § Memory Pressure (A-30)** defines only `X<85→PASS; X≥85→WARN` — no
   CRITICAL branch, no multi-probe requirement, no reclamation check. Nothing in the doc
   *forbids* an escalation to CRITICAL; the LLM improvised one from cycle-to-cycle
   narrative comparison because the doc gives it no explicit gate to stay inside.
2. **`probe.sh` § memory pressure** is a single `docker stats --no-stream` snapshot — no
   OOMKilled, no VmHWM/VmRSS, no repeat sampling. The exact evidence the PO had to gather
   ad hoc three times (07-19, 07-21, 07-23) is invisible to the automated detection path.
3. **`scripts/emit-audit-signal.sh`'s dedup ledger** has a severity-rank
   escalation-bypass (`_check_dedup_and_maybe_send`): a same-`dedup_key` call inside the
   7-day window with a *higher* rank than the stored value bypasses the mute and fires
   Telegram (`ARCH-RATIFY-2` — "a worsening condition is new information"). This is
   correct-by-design behavior, not a bug — it faithfully propagated a `--severity CRITICAL`
   string the flow had no documented right to produce. Confirmed by the notebook: WARN
   (rank 2) at 03:11Z → CRITICAL (rank 3) at 03:42Z is exactly the escalation-bypass path,
   triggered by bad upstream input, not by a ledger defect.
4. **A-21 RestartCount** (`docker inspect RestartCount`, `tier1-probe.md`) is
   cumulative-since-container-creation — it can only grow, so the same stale count
   re-qualifies as evidence every cycle. `apps/mcp-server/src/scheduler/system/
   restartCadenceAlertJob.ts` already solved this exact class of problem for the app's own
   Telegram alert (4h sliding window, crash-vs-deploy sentinel discriminator) — the
   auditor's independent A-21 check never adopted the pattern.

## Key finding — the discriminator already exists, unwired

`scripts/audits/verify-a30-mcp-memory-reclamation.sh` (already in the repo, used ad hoc by
cowork-team's manual signal triage — `docs/agents/cowork-team/flow/main.md` Step 4.2 —
and by the PO three separate times to hand-verify this exact row) **already implements**
the multi-probe / OOMKilled / VmHWM-vs-VmRSS discriminator the design scope calls for:
N probes over a configurable window, OOMKilled + VmHWM/VmRSS collection, dip detection,
verdict `FOLD` (benign) or `ESCALATE` (reason string: `OOMKilled=true` /
`all samples >93% with no reclamation dip` / `peak >97% sustained with no reclaim`). It has
never been wired into system-auditor's own automated Tier-1 detection — only into
after-the-fact manual triage. The design below **reuses this file unmodified** (it stays
in `scripts/audits/`, outside the declared change zone) as a subprocess called from
`probe.sh` — this is the single biggest lever in this brief and avoids a third
re-derivation of the same tripwire math (a risk the script's own header comment already
warns against).

---

## Design — items 1+2: A-30 threshold + escalation gate (one mechanism)

**`docs/agents/system-auditor/probe.sh`** — extend the existing `--- memory pressure ---`
block (fast, unchanged, near-zero cost) with a conditional second block:

```bash
echo "--- memory pressure multi-probe reclamation (A-30) ---"
BASELINE_PCT=$(docker stats --no-stream --format '{{.MemPerc}}' "${MCP_CONTAINER}" 2>/dev/null | tr -d '%')
if awk -v p="${BASELINE_PCT:-0}" 'BEGIN{exit !(p>=85)}'; then
  # Tier-1 budget: 6 probes / 13s spacing = 65s span — the exact cadence already
  # validated live 07-19 ("6 probes/65s caught GC dips", per this row's own text).
  # CONTAINER override closes probe.sh's own dynamic-name-vs-hardcoded-default gap
  # (verify-a30's own default is a literal compose name; MCP_CONTAINER is derived).
  CONTAINER="$MCP_CONTAINER" bash "$REPO_ROOT/scripts/audits/verify-a30-mcp-memory-reclamation.sh" 6 13
else
  echo "[A-30] SKIP deep-probe — baseline ${BASELINE_PCT}% < 85% investigate-gate"
fi
echo ""
```
(probe.sh currently has no `$REPO_ROOT` — add `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"` at the top, mirroring `emit-audit-signal.sh`'s own portable resolution, instead of relying on CWD-is-repo-root-at-invocation.)

The 85% gate is the **existing, unchanged** numeric value — it now means "worth a closer
look," not "alert." It stays deliberately below the real alert floor so the deep probe
engages with margin before a genuine trend would cross it.

**`docs/agents/system-auditor/flow/tier1-probe.md`** — replace the naive
`MemPerc≥85→WARN` verdict with a new override section, parallel in shape to the existing
A-20 block:

```
## A-30 — Memory Reclamation Discriminator (Multi-Probe Override)

Override rule: the general Memory Pressure section's MemPerc≥85→WARN line is SUPERSEDED
entirely by this block. A single/2-point snapshot is NEVER sufficient evidence for A-30.

1. `[A-30] SKIP deep-probe` present in PROBE_OUT → A-30 PASS, no emit.
2. Otherwise parse the verbatim JSON block emitted by verify-a30-mcp-memory-reclamation.sh:
   verdict, reason, analysis.{min_pct,max_pct,reclamation_dips}, state.oom_killed,
   vm.{vmhwm_kb,vmrss_kb}.
3. ADDITIONAL VETO (closes a gap in the unmodified script — it collects vm.vmhwm_kb/
   vmrss_kb but does not gate on them): if verdict=="ESCALATE" AND vmhwm_kb and vmrss_kb
   are both numeric (not "UNAVAILABLE") AND vmhwm_kb > vmrss_kb → downgrade to PASS, no
   emit (peak-before-window reclamation already proven, even if this window's 6 samples
   sit on a plateau that never crosses the intra-window dip detector).
4. Remaining verdict/reason mapping:
   - verdict=="FOLD" → PASS, no emit.
   - verdict=="ESCALATE", reason contains "OOMKilled=true" → CRITICAL.
   - verdict=="ESCALATE", reason contains "peak >97%" → CRITICAL.
   - verdict=="ESCALATE", reason contains "no reclamation dip" (>93% baseline case) → WARN.
5. This is a SINGLE self-contained per-cycle evidence bundle. NEVER compare this cycle's
   verdict against a prior cycle's notebook entry or MemPerc reading to decide escalation
   — that comparison is exactly what produced the false 03:42Z CRITICAL. Each cycle proves
   its own tripwire or it doesn't.
6. Emit WARN/CRITICAL via the unchanged general emit-audit-signal.sh template, citing the
   RAW JSON block (same anti-carry rule as the existing RAW-PROBE discipline — verdict
   lines MUST cite this cycle's JSON, never a previous cycle's).
```

This satisfies "raise the WARN threshold toward ~95%" via the already-calibrated,
live-validated 93%/97% tripwire pair inside the unmodified script (both straddle ~95%,
and are repeated verbatim in this row's own `genuine_tripwire_preserved` field) — no new
arbitrary threshold is invented. It satisfies the reclamation veto
("VmHWM>VmRSS, or a dip across samples, VETOes the finding") in full: dip-veto is native
to the script (`DIPS==0` required to ESCALATE at all); VmHWM-veto is the one addition
above, applied entirely in the calling layer. It satisfies the escalation gate by
construction — CRITICAL now requires OOMKilled=true or a genuinely sustained >97%-no-reclaim
window observed *within this cycle's own probe*, never a comparison to a previous cycle.

## Design — item 3: dedup-ledger must not auto-escalate a benign finding

No edit to `scripts/emit-audit-signal.sh` is proposed or needed. Its escalation-bypass
logic is correct-by-design (a genuinely worsening condition should break a stale mute) —
it only misfired because the upstream flow fed it an ungated `--severity CRITICAL`. Once
items 1+2 above ship, a benign in-band reading (reclaiming, or below the 93%/97% tripwire)
resolves to PASS at the interpretation step and **`emit-audit-signal.sh` is never invoked
at all** for that cycle — nothing benign is ever written to the dedup ledger, so there is
nothing left for the escalation-bypass path to wrongly promote. This satisfies "the
dedup-ledger MUST NOT auto-escalate a deduped benign-band finding to CRITICAL + Telegram"
structurally, without touching a shared script used by every other A/B/C check (out of the
declared change zone; editing it would carry blast radius far beyond this row).

**Explicitly NOT in scope for this brief** (per the row's own `hard_constraint` field): the
"bump a last-seen/high-water field instead of a fresh row" collapse-to-single-row behavior
for E-3 signal_queue rows is a **separate, already-tracked** effort
(`FIX-SIGNALQUEUE-DUP-ID-GUARD`). This brief does not touch E-3's append-always contract
(`docs/agents/system-auditor/init.md:38` / `flow/main.md:632`) in any way — it only ever
prevents `emit-audit-signal.sh` from being *called* for a benign reading, which is
identical in effect to every other passing check in this repo (a PASS check has never
synthesized a signal_queue row anywhere in the existing A-01..C-16 catalog).

## Design — item 4: A-21 windowed / crash-only

`docker inspect RestartCount` is cumulative-since-creation and stays in PROBE_OUT as
evidence-only — it must never again be the alert driver. Add a new inline query directly
under the existing "Restart Count (A-21)" heading in `tier1-probe.md`, mirroring the
**already-established** Tier-3 DB-check pattern in `flow/main.md` (`docker exec "$MCP_CTR"
bun -e "..."` against `/app/data/market.db`, readonly — never host-side sqlite3). Logic
ports `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts`'s discriminator 1:1,
read-only, against the table that job already writes (`cron_job_runs`,
`mcpServerStartup`/`mcpServerCleanShutdown` sentinels):

```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('/app/data/market.db', { readonly: true });
const firstCS = db.query(\`SELECT MIN(started_at) AS c FROM cron_job_runs WHERE job_name='mcpServerCleanShutdown'\`).get();
if (!firstCS || !firstCS.c) { console.log(JSON.stringify({crashRestarts:0, bootstrapGuard:true})); process.exit(0); }
const rows = db.query(\`SELECT started_at FROM cron_job_runs WHERE job_name='mcpServerStartup' AND started_at >= datetime('now','-8 hours') ORDER BY started_at ASC\`).all();
const cutoff = new Date(Date.now()-4*3600*1000).toISOString().replace('T',' ').slice(0,19);
let crashes=[];
for (let i=1;i<rows.length;i++){
  const cur=rows[i].started_at, prev=rows[i-1].started_at;
  if (cur<cutoff) continue;
  if (prev<firstCS.c) continue;
  const cs=db.query(\`SELECT COUNT(*) AS n FROM cron_job_runs WHERE job_name='mcpServerCleanShutdown' AND started_at>? AND started_at<?\`).get(prev,cur);
  if (!cs || cs.n===0) crashes.push(cur);
}
console.log(JSON.stringify({crashRestarts:crashes.length, crashTimestamps:crashes}));
"
```
- `crashRestarts >= 2` (same `ALERT_THRESHOLD` as `restartCadenceAlertJob.ts`, deliberately
  reused rather than a third arbitrary number) → A-21 WARN.
- `crashRestarts < 2` → PASS, no emit, regardless of the cumulative `RestartCount=N` line.
- `bootstrapGuard:true` (no clean-shutdown sentinel ever recorded) → PASS, log
  `[A-21] bootstrap-guard — no clean-shutdown sentinel yet` (same rationale as the TS job's
  own guard — avoids false pages on a migration boundary).
- `docker exec`/query failure → unchanged existing fallback: `[A-21] TOOL-UNAVAILABLE —
  skip` (not an infra finding).

This is read-only against a table the app already writes; zero app-code change, zero new
file, zero deploy.

---

## Wall-time budget (Tier-1 cap: 120s, `init.md` `max_wall_time_tier1_seconds`)

Baseline checks (docker ps, 5×curl, restart inspect, mem snapshot, df) ≈ 20-30s. A-20's
existing multi-probe adds ≈15s. New A-30 deep-probe adds ≈65s **only while baseline ≥85%**
(today, that is effectively every cycle until `FIX-MCP-MEMORY-CODE-LEAK` ships). New A-21
query adds <1s. Worst case ≈100-110s — under the 120s cap but with less margin than today.
**Implementation QA must empirically re-time a live Tier-1 cycle post-change**; if margin is
too tight, drop the A-30 probe count to 5×13s (52s span) rather than reducing interval
(interval spacing, not count, is what let 07-19's probe catch the GC dip).

## Doc size-cap note

`tier1-probe.md` is already over its nominal 120L flow-file cap by documented design
(~155L today, per its own header comment). The two new sections above add ≈55-65L,
pushing it to ≈210-220L. Agent-father should either extend the existing
size-justification comment (repo precedent — every prior addition documents its own reason
inline) or extract a new lazy-loaded child (`docs/agents/system-auditor/flow/
tier1-overrides.md`) if the file crosses ~220L, mirroring how `tier1-probe.md` itself was
originally extracted out of `main.md`.

## Explicitly out of scope for this brief

- **A-12/A-04/A-13 debounce** (row `scope[]` item 2) — not part of the router's 4-item
  DESIGN SCOPE commissioned for this cycle. Remains open on
  `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` for a future pass; not addressed here.
- E-3 signal_queue collapse-to-single-row / high-water field — tracked separately under
  `FIX-SIGNALQUEUE-DUP-ID-GUARD` per the row's own `hard_constraint`.
- Any edit to `scripts/emit-audit-signal.sh` (shared across every A/B/C check — out of the
  declared change zone; see item 3 above for why it is unnecessary here).
- Any `apps/mcp-server` code change, any container rebuild/restart/deploy — user-gated,
  and the mem root cause is already tracked separately at `FIX-MCP-MEMORY-CODE-LEAK`
  (`po_corroboration_20260723`).
- `auditor-tier1-probe.sh`'s own `WARN_PCT=85` shell pre-gate (spawn-decision only, not an
  alert path) is a **secondary, optional** follow-on — raising it would reduce needless
  full-subagent spawns but does not affect signal_queue correctness and is not required by
  this row's acceptance/verification_gate text. Not included in this brief's required
  change set.

## Verification mapping (row `acceptance` / `verification_gate`, unchanged text, restated)

- In-band (85–93%, reclaiming) + transient A-12 + stable A-21 → engages the A-30 deep probe
  (baseline≥85%), resolves FOLD → PASS → zero new signal_queue rows. A-21 resolves
  `crashRestarts<2` → PASS → zero rows.
- Synthetic OOMKilled / >97%-no-reclaim / N-consecutive-A-12-fail must still emit — verify
  via the SAME mock-function test technique already used by
  `scripts/agents-flow/auditor-tier1-probe.test.sh` (source the script, redefine
  `docker`/`curl` as shell functions to inject synthetic evidence) rather than against any
  live service, honoring the no-deploy/no-restart constraint.
- ≥3 consecutive live Tier-1 cycles showing 0 new A-12/A-21/A-30 NEW→po rows (row's own
  `verification_gate`) — observe post-implementation; this brief does not claim that
  outcome itself, only the mechanism designed to produce it.

---

## RETURN

DONE: Design brief authored — A-30 multi-probe reclamation gate (reuses unmodified
`scripts/audits/verify-a30-mcp-memory-reclamation.sh`, closes the VmHWM-veto gap in the
calling layer), WARN→CRITICAL escalation gate (single-cycle evidence bundle, no
cross-cycle delta), dedup-ledger item satisfied structurally (no benign call ever reaches
`emit-audit-signal.sh`, no edit to that shared script), A-21 windowed/crash-only re-model
(ports `restartCadenceAlertJob.ts`'s discriminator via a read-only inline `bun:sqlite`
query, zero app-code change). Change zone: `docs/agents/system-auditor/probe.sh` +
`docs/agents/system-auditor/flow/tier1-probe.md` only.
ZONE: `docs/agents/system-auditor/*` (declared change zone honored — no file outside it
proposed for edit)
NEXT: agent-father | implement probe.sh conditional multi-probe block + tier1-probe.md A-30
override section + A-21 windowed inline query, per the code blocks above
PIPELINE: continue
