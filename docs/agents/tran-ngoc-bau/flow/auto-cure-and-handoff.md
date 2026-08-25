> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 4: Auto-Cure, Report, Notebook, PO Handoff

## Phase 4: Auto-Cure & Report

**Step 6 — Auto-cure flow files** (only after 3+ identical errors)
If notebook shows same error repeated 3+ cycles:
1. Read the offending flow file
2. Identify the missing/incorrect step
3. `Edit` the flow file to add/fix the step
4. Log: `"[AutoCure] {agent}/flow.md — added regime caveat check at Step N"`
5. Send to WORK: `"[Tran Ngoc Bau] Fixed: {agent} flow — {description}"`

**Step 7 — Published-marker gate (Phase 2 — MANDATORY, commit point) →**
skill: `.claude/skills/published-marker-gate/SKILL.md` (agent-id=tran-ngoc-bau).

<!-- UC-CCA-P3-FR3-TRAN-NGOC-BAU (agent-father, 2026-08-14): Phase-2 claim relocated here from
     main.md's old EARLY task_claim — main.md now only runs the Phase-1 probe (§ PUBLISHED
     MARKER GATE) before the 4 audit sub-flows. `MARKER_KEY` is the exact string main.md
     computed (`"published:tnb-audit:" + WORK_DATE`), carried forward as session state —
     do NOT recompute WORK_DATE here (session-scoped, same cycle). -->

```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              MARKER_KEY,   # from main.md's Phase-1 probe, carried forward verbatim
  task_kind:            "cowork-slot",
  owner_agent:          "tran-ngoc-bau",
  owner_client_session: <resolved CLAUDE_CODE_SESSION_ID — REQUIRED, never the literal token text;
                          live-confirmed 2026-07-21 c115: omitting this field fails Zod validation
                          before any lock is attempted>,
  ttl_seconds:          100800   # 28h daily slot (ARCH-DECIDE-D)
})

if CLAIM.claimed != true:
  log "[tran-ngoc-bau] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # a peer claimed between main.md's Phase-1 probe and this Phase-2 claim — do NOT send anything.
```

If `claimed == true`: proceed immediately to Step 7's own WORK send below. NEVER call
`task_release` on success or any exit after this point — successful send, failed send,
exception, process death: all leave the marker in place. TTL is the sole expiry path.

**Step 7 — Quality report to WORK** — `send_telegram(channel="work", message=...)`:
```
[Tran Ngoc Bau] Quality Audit HH:MM UTC
{IF pipeline_degraded=true: PIPELINE DEGRADED — chef-coverage: starts={start_count} closes={close_count} stuck={stuck_count}}
MARKET messages: N checked | M issues
Agent sessions: N reviewed | M methodology gaps
Methodology scores (Layer 5, 9-step): GOOD={x} NEEDS_ATTENTION={y} CRITICAL={z}
  Top gap pattern: {entry from tnb-methodology.md catalogue}
Signals: N total | M dedup candidates | P low-confidence
Auto-cures: N applied
Overall: {GOOD|NEEDS_ATTENTION|CRITICAL}
```

If severity >= critical (data mismatch, price stale >5%, DB down):
`send_telegram(channel="bug", message=escalation)`

**Step 8 — Notebook commit**

> Invariant: timestamp = current UTC, never future, never speculative. ALWAYS get current UTC via `date -u +"%Y-%m-%dT%H:%M:%SZ"` before writing.

**SELF-HEAL 2026-08-25 (c136):** `log_agent_work` is a two-call pair, not one call — live zod
requires `agent_name` (string) + `status` ('running'|'completed'|'error'); a `status='completed'`
call additionally requires `id` (the id returned by a prior `status='running'` call), or it
errors `"id is required when status is 'completed' or 'error'"`. Confirmed live: single-call
`log_agent_work(action="quality_audit", context={...})` fails validation (missing `agent_name`/
`status`) before any log lands. Corrected shape:
```
{id} = log_agent_work(agent_name="tran-ngoc-bau", status="running", action="quality_audit")
       log_agent_work(agent_name="tran-ngoc-bau", status="completed", id={id}, action="quality_audit", context={...})
```
Append to `docs/agent-memory/notebooks/tran-ngoc-bau.md`:
```
### Quality Audit (HH:MM–HH:MM UTC)
- MARKET messages: N checked, M issues
- Agent notebooks: N reviewed, M gaps
- Signals: N total, dedup={X}, low_conf={Y}
- Auto-cures: N applied
- Regime: REGIME | Carry: CARRY_REGIME
- Overall: GOOD|NEEDS_ATTENTION|CRITICAL
```
Then:
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/tran-ngoc-bau.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/tran-ngoc-bau.md
git commit -m "chore(memory/tran-ngoc-bau): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/tran-ngoc-bau.md
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

---

## Step 9 — PO handoff (ALWAYS)

**Never skip this step.** PO decides what's actionable — TNB does not filter.

1. Write `docs/handoffs/tnb-audit-latest.md` (overwrite each cycle):
   Template fields: Overall (GOOD|NEEDS_ATTENTION|CRITICAL), Direction (IMPROVING|STABLE|DEGRADING),
   Findings table (# | Issue | Agent/Module | Severity | Category | Evidence),
   Auto-cures applied, Persisting blockers, Positive signals.

2. If zero issues (Overall: GOOD, no auto-cures, no blockers), still write with empty Findings table + filled Positive signals.

3. **Write to dashboard** → skill: `.claude/skills/signal-dashboard/SKILL.md` (§ WRITE + § PRUNE)
   - Append row to `## po` section: `type=audit-handoff | summary="Overall: {GOOD|NEEDS_ATTENTION|CRITICAL}" | payload=docs/handoffs/tnb-audit-latest.md`
   - Run PRUNE after append (remove DONE rows).

4. **Signal dev-team** — drop signal file `docs/signals/tnb-{ISO timestamp}.json`:
   ```json
   {
     "from": "tran-ngoc-bau",
     "to": "po",
     "type": "audit-handoff",
     "payload": "docs/handoffs/tnb-audit-latest.md",
     "priority": "high|normal",
     "createdAt": "{ISO timestamp}"
   }
   ```
   - `priority: "high"` if Overall is NEEDS_ATTENTION or CRITICAL
   - `priority: "normal"` if Overall is GOOD
   - **Do NOT write `docs/data/orch/orch-state.json`** — dev-team pipeline agents only; cowork agents use `docs/signals/` instead

## RETURN

```
DONE: Quality audit — N MARKET msgs, M agent sessions, K auto-cures | Overall: GOOD|NEEDS_ATTENTION|CRITICAL
NEXT: po
HANDOFF: docs/handoffs/tnb-audit-latest.md
PIPELINE: continue
QUALITY: full | partial
```
