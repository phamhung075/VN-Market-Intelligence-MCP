# po-s71-erraudit-w2-done-verified-w3-fold.jq
# Single-pass dual-mutation sign-off triage (PO is single board-writer).
#
# MUTATION 1 (PRIMARY): relocate FIX-ERRAUDIT-W2-MCP-DATALAYER review[] -> done_verified[]
#   with done_verified stamps + RAW-verify provenance. Idempotent: if the id is
#   already in done_verified[] the move is a no-op (guarded by membership).
#
# MUTATION 2 (SECOND ACTION): FOLD qa's concrete out-of-scope surviving-bare-catch
#   site list into the EXISTING FIX-ERRAUDIT-W3-MCP-P2 backlog row (no SSOT dup —
#   W3 already exists). Idempotent: guarded by .folded_sites presence.
#
# Conservation (harness-checked): review -1, done_verified +1, backlog length
#   UNCHANGED (annotate-in-place), total across the 6 lanes unchanged.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s71-erraudit-w2-done-verified-w3-fold.jq \
#      docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH held.)

def W2: "FIX-ERRAUDIT-W2-MCP-DATALAYER";
def W3: "FIX-ERRAUDIT-W3-MCP-P2";

# qa-found out-of-scope surviving bare fabricated-default catch sites (W3 fold target).
def folded:
  [
    "assembleEveningSummary.ts:285",
    "assembleEveningSummary.ts:303",
    "generatePeriodicSummary.ts:583",
    "pollNews.ts:439",
    "pollNews.ts:471",
    "assembleBriefing.ts:606",
    "assembleBriefing.ts:881",
    "assembleBriefing.ts:905",
    "assembleBriefing.ts:1204",
    "bctcInspectHandler.ts:772",
    "deepFetchMainJob.ts:142",
    "deepFetchMainJob.ts:146",
    "deepFetchVpsJob.ts:281",
    "deepFetchVpsJob.ts:285",
    "polymarket.ts:88"
  ];

# ---- MUTATION 1: W2 review -> done_verified -----------------------------------
( [ .task_board.review[] | select(.id == W2) ] | first ) as $w2row
| .task_board.review   |= map(select(.id != W2))
| .task_board.done_verified |=
    ( if (any(.[]; .id == W2)) then .                       # already verified — no-op
      else . + [ $w2row
                 + { status: "DONE-VERIFIED",
                     lane: "done_verified",
                     done_verified_at: $now,
                     done_verified_by: "po-s71",
                     done_verified_note: ("RAW re-verified LIVE in running container vn-market-intelligence-mcp-mcp-server-1 (image .Created 2026-06-16T00:10:01Z post-dates commit 9f4a8eef 23:59:27Z; StartedAt 00:12:04Z; 13/13 peers healthy). safeQuery.ts(5415B @ /app/src/domain/utils) carries typed degraded contract {ok:false,reason:'no-rows'|'db-error'} with db-error always LOGGED via failLoud[degraded:<ctx>]; runSection.ts(6520B @ /app/src/application/utils). scanMarket.ts imports failLoud, getAvgVolumeSync L103-104 failLoud+return null on db-error, L117-119 legit insufficient-history -> return null (drop-dimension, NOT fabricated 0). qa APPROVE = current HEAD b8f9e31e; CI 31/31 pass, only 1 PRE-EXISTING unrelated tsc error (FIX-SIGNAL-CONFIDENCE-SLA-TEST, separately triaged); forced-degrade transcript GREEN. Closes a chunk of the fabricated-default-masks-real-metric directive (avgVolume=0 / neutral-0 confidence=50 family) for the 3 primary mcp-server data-layer files.") }
               ] end )

# ---- MUTATION 2: FOLD qa site list into EXISTING W3-MCP-P2 backlog row ----------
| .task_board.backlog |=
    map( if .id == W3 and (has("folded_sites") | not)
         then . + { folded_sites: folded,
                    folded_sites_from: "qa cycle-273 (FIX-ERRAUDIT-W2-MCP-DATALAYER review) — out-of-scope surviving bare fabricated-default catches in untouched files; SAME anti-pattern; generic across all sites per /goal#2",
                    folded_at: $now,
                    folded_by: "po-s71" }
         else . end )
