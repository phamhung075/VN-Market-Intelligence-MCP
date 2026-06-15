# po-s55-notebook-gate-harden-triage.jq
# Idempotent single-task triage: append the notebook-write layer-1 HARDEN task
# (convert AC-5 from advisory prose -> blocking exit 1) to .task_board.backlog,
# skipping if its id already exists in ANY board array (object entries only).
#
# Origin: 2026-06-15 router pass #11 finding — context-bloat layer-1 gate is
# advisory PROSE not a hard bash gate (contradicts founding principle
# project_context_bloat_governance line 13). PO decision = HARDEN (A), scoped
# slice. Routes to agents-architect (design brief) -> agent-father/dev (impl).
#
# Usage: jq --arg now "$NOW" -f scripts/po-s55-notebook-gate-harden-triage.jq \
#          docs/data/orch/orch-state.json
# Atomic: temp -> [ -s tmp ] -> jq empty -> rename; commit orch-state by EXPLICIT path.

def already_present($id):
  [ .task_board | to_entries[] | .value | select(type=="array")
    | .[] | select(type=="object") | .id // empty ]
  | any(. == $id);

def newtask($now):
  {
    id: "HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING",
    type: "FIX",
    title: "Harden notebook-write AC-5 from advisory prose to BLOCKING (exit 1 -> force recompose) + commit headless-path hook backstop into repo",
    desc: "ROOT CAUSE (router pass #11, raw-verified 2026-06-15): notebook-write SKILL layer-1 gate is advisory PROSE not a hard bash gate. AC-5 (SKILL line 76) is explicitly 'a verification gate, NOT a remediation loop' — it only echoes a warning, never exit 1/blocks. This CONTRADICTS the governance founding principle (project_context_bloat_governance line 13: 'Hard bash gate, not prose — haiku skips prose'). Evidence: ops.md re-breached to 237L (working-tree; HEAD 151L) AFTER its own agent-father retrofit 1c8a5ea7; the 237L write minted NO context-bloat signal (layer-2 PostToolUse hook is record-only exit 0 AND lives in gitignored .claude/settings.local.json so headless/cron/cloud spawns don't carry it). Layer-3 janitor is the ONLY hard remediation and it's reactive — board is littered with recurring CLEAN-NB-TRIM-* / FU-NB-PRUNE-* tasks (CLEAN-NB-TRIM-BATCH = 5 notebooks 297/223/223/218/228L; CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614; CLEAN-NB-TRIM-PDFX-2; FU-NB-PRUNE-DEV-VPS), proving the reactive churn. SCOPE (the cheap correct slice — NOT a full architecture sprint): (1) Convert AC-5 to BLOCKING for the in-session/compliant-tooling path: after the settled write, if wc -l > cap then exit 1 and force the agent to recompose+re-write (a hard gate can only FAIL the write, NOT auto-pick which sections to drop — semantic prune needs agent judgment, that is the accepted tradeoff). (2) Close the headless/cron gap: commit the PostToolUse backstop hook wiring into a REPO-TRACKED settings file (.claude/settings.json, NOT .local) so cron/headless/cloud spawns carry it — OR add a documented dumb-tail-truncate fallback in the hook for non-compliant writes as a last-resort self-heal (architect decides truncate-vs-fail-vs-signal-only). DESIGN TRADEOFF to resolve in brief: dumb tail-cut loses the newest section (usually the current cycle's content) — may be unacceptable; a fail-the-write gate can't run in a fire-and-forget headless write that has no agent loop to recompose. Architect weighs blocking-in-session + signal-only-headless vs truncate-headless.",
    zone: "cross-service/",
    baseline_pass: "n/a (governance/skill+hook layer, market-independent)",
    route: "agents-architect (design brief: where exactly to add exit 1, in-session-vs-headless path split, hook-into-repo vs truncate-fallback, semantic-prune tradeoff) -> agent-father/dev (impl)",
    plan_only: true,
    size: "S",
    origin: "po triage 2026-06-15 router pass #11 (harden-vs-accept decision = HARDEN/A)",
    references: ["project_context_bloat_governance", "feedback_janitor_false_green_verify", ".claude/skills/notebook-write/SKILL.md", "scripts/agents-flow/context-bloat-backstop.sh", "docs/data/file-size-caps.json"],
    created_at: $now
  };

if already_present("HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING")
then .
else .task_board.backlog += [ newtask($now) ]
end
