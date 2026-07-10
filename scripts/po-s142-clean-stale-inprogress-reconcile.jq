# =============================================================================
# scripts/po-s142-clean-stale-inprogress-reconcile.jq
# =============================================================================
# CLEAN board-hygiene reconcile (idempotent): close 2 stale in_progress[] rows
# reconciled to GROUND-TRUTH + close the CLEAN task that tracked them.
# Reusable pattern for "N in_progress rows whose implementation closed OUT-OF-BAND
# (shipped-but-never-flipped OR direction-abandoned) silently consume WIP — relocate
# each by its RAW-verified ground-truth status, then close the tracking CLEAN row".
#
#   M1  FIX-L2-FRESHNESS-DATAASOF-FIELDS  in_progress -> done_verified (DONE_VERIFIED)
#         shipped out-of-band: commit a384497a3 (2026-06-27, msg "Closes FIX-L2-...")
#         RAW-verified gate: all 5 named handlers get data_asof, +20 green tests,
#         tsc clean, rows_no_asof 8->2. Board row never flipped, sat in_progress 13d.
#   M2  FIX-SCHEMA-DRIFT-P5-SELFHEAL      in_progress -> done (DONE, done_verified:false)
#         direction ABANDONED (never implemented). Precedent 755c761a8 (2026-06-09)
#         flipped REVIEW->REWORK (CI-P5-GATE FAILED 629->635, reverted d1aa19c5) +
#         opened FU-SCHEMA-DRIFT-P6 spike; P8-IMPL superseded per efbab47b6. do-NOT-redispatch.
#   M3  CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS  backlog -> done (executed)
#
# STATUS/LANE COHERENCE (orchStateSchema.ts LANE_ALLOWED_STATUSES — HARD-FAIL):
#   done_verified[] allows ONLY "DONE_VERIFIED"; done[] allows "DONE"/"DONE_VERIFIED".
#   "SUPERSEDED"/"CANCELLED" are NOT legal here — abandonment is modelled as
#   status="DONE" + done_verified:false + a resolution note.
#
# Idempotent: each relocation guarded by SOURCE-lane membership; re-run mutates 0.
# Conservation: in_progress -2, backlog -1, done +2, done_verified +1 (task_total unchanged).
# Terminal rows null out detail_ref (matches done[] convention; avoids dangling-ref risk).
#
# Args:  --arg now <ISO8601-UTC>
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s142-clean-stale-inprogress-reconcile.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# =============================================================================

# --- capture source lanes BEFORE mutation ---
(.task_board.in_progress // []) as $ip
| (.task_board.backlog // []) as $bl
# --- presence guards (idempotency; jq `and` short-circuits so string rows are safe) ---
| ($ip | any(type=="object" and .id=="FIX-L2-FRESHNESS-DATAASOF-FIELDS")) as $has_l2
| ($ip | any(type=="object" and .id=="FIX-SCHEMA-DRIFT-P5-SELFHEAL")) as $has_p5
| ($bl | any(type=="object" and .id=="CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS")) as $has_clean
# --- extract original rows (null if already relocated) ---
| ($ip | map(select(type=="object" and .id=="FIX-L2-FRESHNESS-DATAASOF-FIELDS")) | .[0]) as $l2row
| ($ip | map(select(type=="object" and .id=="FIX-SCHEMA-DRIFT-P5-SELFHEAL")) | .[0]) as $p5row
| ($bl | map(select(type=="object" and .id=="CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS")) | .[0]) as $cleanrow
# --- stamped terminal rows ---
| (($l2row // {}) + {
    status: "DONE_VERIFIED",
    done_verified: true,
    detail_ref: null,
    resolution: "shipped-out-of-band",
    resolution_commit: "a384497a3",
    verification_gate_met: "RAW-verified 2026-07-11 (po-s142): commit a384497a3 (2026-06-27, msg 'Closes FIX-L2-FRESHNESS-DATAASOF-FIELDS') adds top-level data_asof to all 5 named handlers (marketDigest/alerts/qualityChecklist/priceHistory/vpsProxyHealth); +20 green assertions (freshness-dataasof-handlers.test.ts); tsc clean; rows_no_asof 8->2. Board row never flipped, sat in_progress 13d.",
    updated_at: $now,
    updated_by: "po",
    completed_by: "po",
    reconciled_by: "po-s142 (CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS)"
  }) as $l2done
| (($p5row // {}) + {
    status: "DONE",
    done_verified: false,
    detail_ref: null,
    resolution: "direction-abandoned-never-implemented",
    resolution_note: "RAW-verified 2026-07-11 (po-s142): precedent commit 755c761a8 (2026-06-09) flipped REVIEW->REWORK (CI-P5-GATE FAILED 629->635, reverted d1aa19c5) + opened FU-SCHEMA-DRIFT-P6 architect spike. Successor chain P6->P7->P8; P8-IMPL superseded per efbab47b6 (2026-06-13). do-NOT-redispatch. Sat in_progress >1 month.",
    superseded_by: "FU-SCHEMA-DRIFT-P6/P7/P8 chain",
    updated_at: $now,
    updated_by: "po",
    completed_by: "po",
    reconciled_by: "po-s142 (CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS)"
  }) as $p5done
| (($cleanrow // {}) + {
    status: "DONE",
    done_verified: true,
    resolution: "executed 2026-07-11 by po-s142: FIX-L2-FRESHNESS-DATAASOF-FIELDS in_progress->done_verified (shipped a384497a3, gate RAW-verified) + FIX-SCHEMA-DRIFT-P5-SELFHEAL in_progress->done/abandoned (direction abandoned per 755c761a8/efbab47b6). in_progress WIP 3->1, freeing 2 dead slots that were starving BOUNDED-1 idle-capacity pickup.",
    updated_at: $now,
    updated_by: "po",
    completed_by: "po"
  }) as $cleandone
# --- rebuild lanes (remove from source; conditionally append to target) ---
| .task_board.in_progress = ($ip | map(select(
      (type=="object" and (.id=="FIX-L2-FRESHNESS-DATAASOF-FIELDS" or .id=="FIX-SCHEMA-DRIFT-P5-SELFHEAL")) | not
    )))
| .task_board.backlog = ($bl | map(select(
      (type=="object" and .id=="CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS") | not
    )))
| .task_board.done_verified = ((.task_board.done_verified // []) + (if $has_l2 then [$l2done] else [] end))
| .task_board.done = ((.task_board.done // [])
      + (if $has_p5 then [$p5done] else [] end)
      + (if $has_clean then [$cleandone] else [] end))
