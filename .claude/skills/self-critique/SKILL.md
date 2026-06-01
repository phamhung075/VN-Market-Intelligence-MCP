---
name: self-critique
description: >
  End-of-cycle step: agent reviews its OWN just-completed work for machine-anchored
  quality signals and emits a DRAFT improvement proposal if triggered. PLAN-ONLY.
  Zero mutation. Feeds the SELF-IMPROVE-GATE pipeline.
---

## Self-Critique (end-of-cycle)

PLAN-ONLY: may ONLY write a DRAFT proposal doc + DASHBOARD row.
Zero auto-repair. Zero flow/agent/.md edits. Zero DB mutations. Zero spawned agents.
If no trigger fires → skip silently. Write nothing.

### Step SC-0 — Pilot-scope gate + daily cap

**C1 SHADOW-PILOT SCOPE (brief §8 SSOT — remove at Phase-2 promote decision):**
If agent-id NOT IN {`news-scout`, `dev-team`} → log `"[self-critique] skip: agent <agent-id> outside C1 pilot scope"` → EXIT silently.
This gate enforces PO condition C1 (brief §8): 14-day shadow pilot scoped to two flows only.
Remove this gate when §8 promote criteria are met and PO authorises fleet-wide rollout.

Glob `docs/improvement-proposals/IMP-<YYYYMMDD>-<agent-id>-*.md` (VN date, GMT+7).
If any match → log `"[self-critique] skip: open proposal already exists for <agent-id> today"` → EXIT.

**Tie-break (C3 — deterministic):** if multiple triggers fire same agent same VN day,
emit ONE proposal for the LOWEST trigger-code that fired (T1 < T2 < T3 < T4 < T5).
Note all fired triggers in Evidence. This makes the daily collision outcome reproducible.

### Step SC-1 — Check trigger taxonomy

SSOT: `docs/architecture-briefs/2026-06-01-agent-self-critique-detect-source.md §2`

- **T1:** tool call returned 5xx / timeout / empty-where-expected / degraded source_tier?
- **T2:** flow step skipped/improvised due to missing capability (not doc error — that is doc-self-heal)?
- **T3:** primary output carried `confidence < 0.5` or explicit partial/incomplete flag?
- **T4:** notebook carry-over contains same workaround as this cycle, ≥2 times across all entries
  (grep agent's own notebook — already loaded — for exact/near-match keyword)?
- **T5:** elapsed time > 2× flow's typical duration, OR step count > 1.5× flow's listed count,
  OR single tool-call chain exceeded 10 sequential retries for one step?

If NONE fired → EXIT silently.
Apply SC-0 tie-break if multiple triggered: lowest T-code wins for ID; all codes go in Evidence.

### Step SC-2 — Lane pre-classification (five-field gate alignment)

SSOT: `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md §1`

```
IF touches comprehensibility/aesthetics/tone OR changes gate/audit/success-criteria
   OR trigger is "output could be better" with no T1–T5 anchor → LANE-C FOREVER
ELSE IF machine-checkable ungameable success gate → LANE-B candidate (architect confirms)
ELSE → LANE-A (default)
```

**C-3 check (Lane-C-in-disguise — the live fifth PO gate field):**
Explicitly answer before labeling: does this proposal — regardless of label — edit
gate/audit logic, loop success criteria, an irreversible action, or user-facing
comprehensibility? If YES → auto-classify LANE-C, no override.
This mirrors Field (5) of the live PO gate
(`docs/agents/po/flow/triage-signals.md` line 17 `improvement_proposal` row, five-field gate).
When in doubt → LANE-A. Agents-architect corrects at IP-2.

### Step SC-3 — Write DRAFT proposal

```
ID = IMP-<YYYYMMDD(VN)>-<agent-id>-<T-code>-<slug-≤15-chars>
     (T-code = lowest trigger that fired per SC-0 tie-break)
Path = docs/improvement-proposals/<ID>.md
```

Use standard schema from `2026-05-27-gated-self-improvement-loop.md §3`.
Fields: `Created by: <agent-id>`, `Status: DRAFT`, Weakness, Evidence (all fired triggers
+ concrete data), Proposed Change (WHAT/WHY only — no code/shell/steps), Lane,
Lane Rationale (include C-3 answer), Success Signal, Rollback.
Write via Write tool — NEVER interpolate payload through a shell (S3 guard).

### Step SC-4 — Write signal_queue row

Append row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md` § WRITE (atomic write):
```json
{
  "id": "<agent-id[0:3]>-<YYYYMMDDTHHmmss>",
  "ts": "<ISO-UTC>",
  "from": "<agent-id>",
  "to": "po",
  "type": "improvement_proposal",
  "summary": "<summary ≤120 chars>",
  "severity": "INFO",
  "status": "NEW",
  "payload_ref": "docs/improvement-proposals/<ID>.md"
}
```

### Step SC-5 — Commit (mutex-guarded, explicit paths only)

Batch IMP doc + orch-state.json write into the same commit as notebook-write if still open.
If notebook-write commit already closed → new commit via skill: `.claude/skills/commit-mutex/SKILL.md`
- `own_paths`: [`docs/improvement-proposals/<ID>.md`, `docs/data/orch/orch-state.json`]
- `intent`: `"chore(improve): self-critique draft <ID>"`
- NEVER `-A` or `.` — explicit paths only (C5 safety invariant).
- On error: release mutex, EXIT — do not leave a half-staged index.

### Step SC-6 — Log to notebook (no extra commit)

Append to notebook carry-over section (already open this cycle):
```
[SC] T<code> proposal drafted: <ID> — <one-line summary>
```

---

## Safety Invariants (non-negotiable)

S1 PLAN-ONLY — no auto-repair, no flow/agent/.md edits, no DB mutations, no spawned agents.
S2 NO SELF-APPROVE — author must not review, approve, or implement its own proposal.
S3 NO SHELL INTERPOLATION — payload written via Write tool only, never a shell argument.
S4 SILENT ON CLEAN CYCLE — zero writes if no T1–T5 fired.
S5 COMMIT SAFETY — commit-mutex + explicit paths; never `-A`/`.`; never half-stage index.
