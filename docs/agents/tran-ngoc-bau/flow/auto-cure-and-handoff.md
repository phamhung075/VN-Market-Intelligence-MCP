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

`log_agent_work(action="quality_audit", context={...})`
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
git commit -m "chore(memory/tran-ngoc-bau): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

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
   - **Do NOT write pipeline-state.json** — dev-team internal only

## RETURN

```
DONE: Quality audit — N MARKET msgs, M agent sessions, K auto-cures | Overall: GOOD|NEEDS_ATTENTION|CRITICAL
NEXT: po
HANDOFF: docs/handoffs/tnb-audit-latest.md
PIPELINE: continue
QUALITY: full | partial
```
