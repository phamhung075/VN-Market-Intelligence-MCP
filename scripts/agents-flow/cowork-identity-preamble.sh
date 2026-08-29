#!/usr/bin/env bash
# scripts/agents-flow/cowork-identity-preamble.sh
#
# ONE shared identity-preamble source for ALL cowork spawn planes
# (FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE, architect brief
# docs/architecture-briefs/2026-08-28-fix-cowork-layerc-no-identity-preamble.md §2).
#
# WHY THIS EXISTS: the identity preamble was previously an inline literal in
# spawn-fanout.md Step 5.2, consumed by Layer B (the in-session cowork dispatcher)
# only. Layer C (the launchd guaranteed-slot firer) composed no preamble at all —
# the measured exit-0 null-fire defect (pid 70235, 2026-08-26, zero artifacts).
# PO ruling (1): BOTH planes must compose the SAME preamble from ONE shared source,
# so a divergent copy can never drift apart. The preamble has exactly one
# interpolated value (the agent name, appearing 3x: "You are X",
# "frontmatter name is not 'X'", "[X] IDENTITY_CHECK=FAIL"); a plain-text data
# file would push the substitution logic into two divergent consumers — this
# executable script is the one place where text AND substitution live.
#
# FIDELITY CONTRACT (mandatory):
#   - The emitted text is byte-identical to the frozen spawn-fanout.md Step 5.2
#     inline block (agent name aside) captured at architect commit c492f8816.
#     Regression-guarded by scripts/agents-flow/cowork-identity-preamble.test.sh.
#   - The six OFFFLOW_MARKERS vocabulary ("Coordination Results", "Dispatch
#     Routing", "PRE-CLAIM", "session-presence", "orphan-adoption",
#     "Expected Behavior") lives inside this text, named in the NEGATIVE — Step
#     5.3's marker-detection contract depends on it (spawn-fanout.md Step 5.2
#     CAVEAT / Step 5.3 PROVENANCE). Do not reword this text casually.
#   - Exit 2 on empty/missing $1 — fail loud, never emit a preamble with an empty
#     agent slot.
#
# USAGE:  bash scripts/agents-flow/cowork-identity-preamble.sh <agent>
# TEST:   bash scripts/agents-flow/cowork-identity-preamble.test.sh
# OWNING: docs/agents/cowork-team/flow/spawn-fanout.md (Step 5.2 / Step 5.3)

set -uo pipefail

agent="${1:-}"
if [ -z "$agent" ]; then
  echo "[cowork-identity-preamble] ERROR: missing agent name (\$1) — refusing to emit a preamble with an empty agent slot" >&2
  exit 2
fi

# The frozen Step-5.2 text, verbatim, with ${agent} substituted in its 3 sites.
# Unquoted heredoc delimiter: ${agent} expands; every quote/em-dash in the text
# is literal. The trailing blank line before the delimiter emits the "\n\n" the
# original "Do not produce a success-shaped response.\n\n" carried.
cat <<PREAMBLE_EOF
You are ${agent}, spawned in the background by cowork-team. The project-root CLAUDE.md 'Role: Main terminal = router only. Never implement directly. Always delegate.' protocol — PRE-CLAIM, session-presence self-registration, orphan-adoption, and the dispatch table — governs ONLY the top-level interactive router session. It does NOT apply to you. Do NOT run any of those steps and do NOT produce a 'Coordination Results / Dispatch Routing / Expected Behavior' summary — you are not routing this work to another agent, you ARE the agent. Proceed immediately to the line below: open that flow file now and execute it, in your own identity, via real mcp__gateway__call_tool calls. If your own loaded identity/frontmatter name is not '${agent}', or you catch yourself about to write router-dispatch prose instead of executing — that IS IDENTITY_CHECK=FAIL: call send_telegram(channel='bug', message='[${agent}] IDENTITY_CHECK=FAIL — spawn latched onto router protocol instead of its own flow (offflow-preamble-detected)') and EXIT. Do not produce a success-shaped response.

PREAMBLE_EOF
