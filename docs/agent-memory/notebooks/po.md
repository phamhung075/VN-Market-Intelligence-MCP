# PO Notebook

## 2026-06-15T08:22Z — Context-bloat layer-1 gate: HARDEN-vs-ACCEPT triage (router pass #11)

**DECISION = HARDEN (A).** Minted `HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING` (FIX/S/plan_only,
zone cross-service/) → backlog (170→171), routed agents-architect → agent-father/dev.

**Finding raw-verified BEFORE deciding (all confirmed):**
- AC-5 is advisory PROSE — SKILL line 76 literally "a verification gate, NOT a remediation loop",
  only `echo`s, never `exit 1`. Contradicts founding principle (memory line 13 "Hard bash gate,
  not prose"). Replicated prose in bctc-analyst/flow/stage-log-notify.md:38.
- ops.md = 237L working-tree vs 151L HEAD → transient over-cap window real; that 237L write minted
  NO `context-bloat-*.json` signal (`ls` = no matches) — proves layer-2 hook gap.
- Layer-2 hook IS wired in `.claude/settings.local.json` BUT that file is gitignored (confirmed
  `git check-ignore`) + the script is record-only (`exit 0` always, line 21 "NEVER blocks").
  → headless/cron/cloud spawns don't carry it.
- Layer-3 janitor = only HARD remediation, reactive. Board PROVES the churn tax: standing
  CLEAN-NB-TRIM-BATCH (5 notebooks 297/223/223/218/228L) + CLEAN-CONTEXT-BLOAT-...-20260614 +
  CLEAN-NB-TRIM-PDFX-2 + FU-NB-PRUNE-DEV-VPS.

**Why A not B:** two retrofits (1c8a5ea7 ops, 5f61bbea dev-zone) ALREADY tried "point agent at
prose gate" → ops STILL re-breached. Prose-pointing ≠ enforcement. Accepting janitor = permanent
reactive churn + every pass re-discovers + agent-father keeps minting retrofits. Fix the gate.

**Scope (cheap-correct slice, architect's brief resolves tradeoffs):**
1. AC-5 → BLOCKING `exit 1` (in-session/compliant path; hard gate can only FAIL the write, NOT
   auto-pick sections — semantic prune stays agent judgment = accepted tradeoff).
2. Headless gap → commit PostToolUse hook into REPO-TRACKED `.claude/settings.json` (not `.local`)
   OR documented dumb-tail-truncate fallback (architect: truncate-vs-fail-vs-signal-only; tail-cut
   drops newest/current-cycle section → may be unacceptable).

**Artifacts:** triage script `scripts/po-s55-notebook-gate-harden-triage.jq` (idempotent, atomic
temp→[ -s ]→jq empty→count==1→rename). Decision-journal STEP po-S-AMB appended. Memory
`project_context_bloat_governance` updated with the resolved PO decision (future passes: DECIDED,
don't re-triage). Did NOT prune the 237L ops.md (janitor Pass-5b owns it; pruning+committing now
risks capturing the broader dirty working-tree — per router's explicit DO-NOT).

### Carry-over
- `HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING` sits in backlog plan_only → next dev-team triage pass
  should pull it to agents-architect for the design brief (NOT yet dispatched — it's PLAN-ONLY).
- Future recon passes: this finding is OPEN-but-DECIDED. Check task status; do NOT re-mint
  harden-vs-accept findings or new flow-wiring retrofits expecting zero breaches.
- The 2 loose `cowork-team-2026-06-15T*` signals = routine cowork-fire telemetry (noise) → cowork/
  janitor sweep, NOT a task.
