# po-s68-w2-fetch-deadline-signoff.jq
# FINAL SIGN-OFF for FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (merged @ c76a9776).
# Pointer: docs/agents/po/flow/main.md (sign-off step) + docs/policies/dev-standards.md § Script Persistence.
#
# Args (pass with --arg):
#   sha          : merge commit short SHA (c76a9776)
#   verified_by  : agent id stamping verification (po-s68)
#   now          : ISO-8601 UTC timestamp
#
# Actions (all SSOT-atomic; caller does temp->rename + empty-guard):
#   1. Move parent FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE: ready[] -> done_verified[], status=done_verified
#   2. Move 12 children W2-T-1..W2-T-12: backlog[] -> done_verified[], status=done_verified
#   3. Mint follow-on FIX-ERRAUDIT-W2-DEADLINE-UNITTEST (P3, dev-mcp-server, backlog, non-blocking)
#   4. Stamp board provenance.

def is_parent: .id == "FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE";
def is_w2child: (.id // "") | test("^W2-T-(1[0-2]|[1-9])$");

# --- pull the rows we are flipping (snapshot before removal) ---
( [ .task_board.ready[]   | select(is_parent) ] )                      as $parent_rows |
( [ .task_board.backlog[] | select(is_w2child) ] )                    as $child_rows  |

# --- stamp helper: set status + verification provenance, preserve all other fields ---
def flip: . + {
  status: "done_verified",
  done_verified_at: $now,
  verified_by: $verified_by,
  done_commit: $sha,
  signoff_note: "3 gates green (ops rebuild / live-smoke real data / qa FAIL-LOUD audit); merged @ \($sha)"
};

# --- the follow-on hygiene task ---
def followon: {
  id: "FIX-ERRAUDIT-W2-DEADLINE-UNITTEST",
  type: "FIX",
  epic: "ERROR-AUDIT-2026-06-15",
  wave: 2,
  parent_id: "FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE",
  priority: "P3",
  size: "S",
  status: "backlog",
  zone: "apps/mcp-server/",
  route_to: "dev-mcp-server",
  owner: "dev-mcp-server",
  blocking: false,
  title: "Unit test fetchDeadline.ts (withDeadline + macroFetch)",
  desc: "Add unit test for apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts covering (a) deadline fires->DeadlineError thrown, (b) fast response->clearTimeout cleanup, (c) non-abort network error->rethrow unchanged, (d) macroFetch ok:false on http-error/deadline/network, (e) macroFetch ok:true only on response.ok.",
  rationale: "qa flagged this coverage gap at W2 sign-off; helper logic already code-verified (qa 6-check audit) so this is test hygiene, NOT a regression block.",
  files: ["apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts"],
  depends_on: [],
  blocks: [],
  created_at: $now,
  created_by: $verified_by
};

# --- apply ---
.task_board.ready   |= [ .[] | select(is_parent  | not) ]
| .task_board.backlog |= [ .[] | select(is_w2child | not) ]
| .task_board.done_verified += ( ($parent_rows + $child_rows) | map(flip) )
| .task_board.backlog += [ followon ]
| .task_board._updated_at = $now
| .task_board._updated_by = $verified_by
| .updated_at  = $now
| .updated_by  = $verified_by
| ._updated_at = $now
| ._updated_by = $verified_by
