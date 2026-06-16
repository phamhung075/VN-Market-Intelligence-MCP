# po-s85-ohlcv-seeder-green-board-closeout.jq
#
# BOARD CLOSE-OUT — reconcile the OHLCV-seeder fix chain to router LIVE-probe
# ground truth (2026-06-16T09:36Z: flat-seed=0 stable, DAG honest-gap, majors
# intact). NO new tasks — pure promotion + in-place gate reconciliation.
#
# Single-pass multi-mutation:
#   M1  RELOCATE FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0  done[] -> done_verified[]
#         (QA cycle-280 APPROVED; its WITHHELD_PENDING_LIVE_PROBE gate is now the
#          router RAW probe -> done_verified:true + behavioral_gate:GREEN + live_probe)
#   M2  RELOCATE FIX-OHLCV-STRANDED-ROWS-REPAIR-P1      done[] -> done_verified[]
#         (QA cycle-279 APPROVED; same WITHHELD live gate now satisfied)
#   M3  RELOCATE FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 done[] -> done_verified[]
#         (was RED + SUPERSEDED_PARTIAL; the superseding seeder P0 is now live-GREEN
#          -> behavioral_gate:GREEN_VIA_SUPERSEDER + resolution completed-by-chain.
#          Code d4b532be NOT reverted — correct partial work kept in the chain.
#          Moved out of RED so it no longer falsely signals unresolved work.)
#   M4  ANNOTATE-IN-PLACE FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (stays review[])
#         (data_source_fixed:true — re-gate for residual alert-vs-canonical RSI
#          divergence only; NOT auto-flipped to done_verified)
#   M5  ANNOTATE-IN-PLACE FIX-ALERT-OPEN-ZERO-PRICE-RACE (stays backlog[] HELD)
#         (giá0_source_eliminated:true — OHLCV dep satisfied; release gate remains
#          the next clean market-open observation, RE-SCOPE-FIRST per po_s78 note)
#   M6  RESET top-level .head -> idle (was stale-pointing at the long-done
#         FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH ready/dev-frontend -> no re-spawn)
#
# Conservation: 3 rows move done[]->done_verified[] (done -3, done_verified +3);
#   review/backlog lengths unchanged (in-place edits). Total across 6 lanes stable.
#
# Idempotent: M1/M2/M3 guarded by done_verified membership; M4/M5 guarded by their
#   annotation markers; M6 by .head.active_task_id==null.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s85-ohlcv-seeder-green-board-closeout.jq \
#     docs/data/orch/orch-state.json
# Atomic: temp -> [ -s ] -> jq empty -> conservation -> rename; commit by EXPLICIT PATH; PUSH HELD.

def LIVE_PROBE: "2026-06-16T09:36Z flat-seed=0 stable, DAG honest-gap, majors intact";

# --- helpers -----------------------------------------------------------------

# pop a row by id from an array (returns [row-or-null, remaining-array])
def pop($id):
  ( [ .[] | select(.id == $id) ] | .[0] ) as $row
  | ( [ .[] | select(.id != $id) ] ) as $rest
  | [$row, $rest];

# already in done_verified[]?
def already_dv($id): (.task_board.done_verified | any(.id == $id));

# --- M1: STARTUP-SEEDER-FLAT-BARS-P0  done -> done_verified --------------------
( if already_dv("FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0") then .
  else
    (.task_board.done | pop("FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0")) as $p
    | if $p[0] == null then .
      else
        .task_board.done = $p[1]
        | .task_board.done_verified += [ $p[0]
            + { status: "DONE_VERIFIED",
                done_verified: true,
                behavioral_gate: "GREEN",
                live_probe: LIVE_PROBE,
                done_verified_at: $now,
                done_verified_by: "po-s85",
                done_verified_note: "QA cycle-280 APPROVED; WITHHELD_PENDING_LIVE_PROBE gate satisfied by router RAW probe — flat-seed today=0 + all-dates=0 stable (not re-growing), ops startup logs show purgeStrandedSeedRows deleted 641 + 100+ FR-S1 skip-flat-seed-bar lines on illiquid tickers, DAG now honest-gap (canonical get_technical_indicators returns 'Không đủ dữ liệu 1/35 nến' not fake RSI 100.0), majors FPT/MBB/MWG/VHM/VIC/VRE 38-39 rows all vol>0 — zero real data lost." } ]
      end
  end ) as $s1
| $s1

# --- M2: STRANDED-ROWS-REPAIR-P1  done -> done_verified ----------------------
| ( if already_dv("FIX-OHLCV-STRANDED-ROWS-REPAIR-P1") then .
    else
      (.task_board.done | pop("FIX-OHLCV-STRANDED-ROWS-REPAIR-P1")) as $p
      | if $p[0] == null then .
        else
          .task_board.done = $p[1]
          | .task_board.done_verified += [ $p[0]
              + { status: "DONE_VERIFIED",
                  done_verified: true,
                  behavioral_gate: "GREEN",
                  live_probe: LIVE_PROBE,
                  done_verified_at: $now,
                  done_verified_by: "po-s85",
                  done_verified_note: "QA cycle-279 APPROVED; WITHHELD live gate satisfied. Purge (this task) + the seeder guard (FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0) together keep flat-seed=0 live: router RAW probe shows 0 flat-seed today + 0 all-dates, stable across reads. The ~773 stranded synthetic rows are gone; no vol>0 candle lost. d4dcb5c4 purge code is correct and now holds (no longer undone by the un-migrated seeder)." } ]
        end
    end )

# --- M3: AGGREGATOR-SEED-UNMIGRATED-P0  done(RED) -> done_verified(GREEN_VIA_SUPERSEDER) ---
| ( if already_dv("FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0") then .
    else
      (.task_board.done | pop("FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0")) as $p
      | if $p[0] == null then .
        else
          .task_board.done = $p[1]
          | .task_board.done_verified += [ $p[0]
              + { status: "DONE_VERIFIED",
                  done_verified: true,
                  behavioral_gate: "GREEN_VIA_SUPERSEDER",
                  behavioral_gate_at: $now,
                  resolution: "completed-by-chain (aggregator migration d4b532be + stranded purge d4dcb5c4 + seeder guard 448ce71c); seed-corruption inflow closed live 2026-06-16T09:36Z",
                  live_probe: LIVE_PROBE,
                  done_verified_at: $now,
                  done_verified_by: "po-s85",
                  done_verified_note: "Was SUPERSEDED_PARTIAL + behavioral_gate:RED. Its superseder FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 is now live-GREEN, so this task's own verification_gate (RAW: 0 flat seeds, plausible candles, real-band RSI) is satisfied via the chain. Partial code d4b532be (daily aggregator migration) is CORRECT and KEPT — NOT reverted. Relocated out of done[]/RED into done_verified[] as completed-by-chain so it no longer falsely reads RED / signals unresolved work." } ]
        end
    end )

# --- M4: ALERT-ENGINE-RSI-SINGLEDIGIT  annotate in review[] ------------------
| .task_board.review |= map(
    if .id == "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT" and (has("data_source_fixed") | not)
    then . + {
      data_source_fixed: true,
      data_source_fixed_at: $now,
      data_source_fixed_by: "po-s85",
      data_source_fixed_note: "The giá=0 / single-digit-RSI DATA SOURCE is now eliminated live (router RAW probe 2026-06-16T09:36Z: flat-seed=0 stable, DAG honest-gap, majors intact). This entry can now move toward verification ON ITS OWN MERITS — re-gate for the RESIDUAL alert-engine-vs-canonical RSI divergence ONLY (e.g. NVL dual-RSI 26.5/23.9 same-DB-tools-diverge-on-rowcount). NOT auto-flipped to done_verified — its behavioral gate (next post-fix market open: alert-engine TA-Alert RSI matches canonical get_technical_indicators within 0.1pt, no single-digit / no 100.0, generic all tickers) still owes a clean-open observation."
    }
    else . end
  )

# --- M5: ALERT-OPEN-ZERO-PRICE-RACE  annotate in backlog[] (stays HELD) ------
| .task_board.backlog |= map(
    if .id == "FIX-ALERT-OPEN-ZERO-PRICE-RACE" and (has("giá0_source_eliminated") | not)
    then . + {
      "giá0_source_eliminated": true,
      "giá0_source_eliminated_at": $now,
      "giá0_source_eliminated_by": "po-s85",
      ohlcv_dep_satisfied: true,
      ohlcv_dep_satisfied_note: "Dependency on the OHLCV seeder gate is SATISFIED — FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 is now done_verified (router RAW 2026-06-16T09:36Z: flat-seed=0 stable). The flat zero-vol O=H=L=C seed bar this task's giá=0 BB-breakout fires on is eliminated at source. Kept HELD this pass (NOT promoted): the ONLY remaining release condition is the next clean VN market-open observation, and RE-SCOPE-FIRST per the po_s78 note — the seed-bar kill may have already subsumed this task's open-window race surface, so verify the giá=0 path still reproduces before dispatch (possibly fold/close as subsumed). PO judgment: hold for next-open verify rather than blind-promote a possibly-subsumed task."
    }
    else . end
  )

# --- M6: reset stale top-level .head -> idle --------------------------------
| ( if (.head.active_task_id == null) then .
    else
      .head = {
        status: "idle",
        updated_at: $now,
        updated_by: "po-s85",
        active_task_id: null,
        next_agent: null,
        note: "RESET to idle from stale FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH (status:ready, next_agent:dev-frontend) — that task is long done_verified (in done[]), so the stale head was at risk of a dispatcher re-spawning it. No active dispatch this tick (OHLCV-seeder chain closed out to done_verified; alert-gate dependents annotated + held for their own behavioral gates).",
        prev_head_archived: ( .head + { archived_reason: "stale — pointed at already-done_verified FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH", archived_at: $now } )
      }
    end )

# --- metadata bump -----------------------------------------------------------
| ._updated_at = $now
| ._updated_by = "po-s85"
