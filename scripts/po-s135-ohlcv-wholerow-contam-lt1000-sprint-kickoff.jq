# po-s135-ohlcv-wholerow-contam-lt1000-sprint-kickoff.jq
#
# Single-pass SPRINT-KICKOFF triage (idempotent) for the SECOND daily_ohlcv unit-
# contamination class (whole-row thousands-format, close<1000) confirmed user-facing on
# the live RS/momentum leaderboard. Four atomic mutations:
#
#   M1  sprint_goal.entries[] += umbrella vision (skip if sprint_id present)
#   M2  task_board.active_sprints[] += umbrella container {id,label,priority,status,
#       opened_at,evidence,tasks} (skip if id present)
#   M3  relocate FIX task backlog[] -> ready[], ENRICHED to full architect-ready
#       SPRINT-M spec (next_agent=architect, status=READY). Skip if id already in
#       ready/in_progress/review/done/done_verified (type-guarded against string lanes).
#   M4  repoint top-level .head next_agent -> architect (status stays in_progress,
#       active_task_id unchanged) so dev-team Step-0b head-resume spawns architect.
#       Guard: only when head.active_task_id == TASK_ID and M3 actually moved the row.
#
# Conservation (assert post-apply): backlog -1, ready +1, sprint_goal.entries +1,
#   active_sprints +1, in_progress/review/done/done_verified byte-stable.
# Idempotency: re-run mutates 0 (all four guards membership/id-keyed).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s135-ohlcv-wholerow-contam-lt1000-sprint-kickoff.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply.sh does Zod + dup-key + CAS + atomic rename; commit orch-state by EXPLICIT
#  PATH; PUSH HELD — fleet-push launchd timer pushes.)

def TASK_ID: "FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM";
def SPRINT_ID: "OHLCV-UNIT-CONTAM-WHOLEROW-LT1000";

# --- membership probes (type-guarded: lanes may carry bare strings) ---
def id_in(lane): ((lane // []) | map(select(type=="object") | .id) | index(TASK_ID)) != null;

# present anywhere OUTSIDE backlog -> M3 already done
(   id_in(.task_board.ready)
 or id_in(.task_board.in_progress)
 or id_in(.task_board.review)
 or id_in(.task_board.done)
 or id_in(.task_board.done_verified)
) as $already_promoted

| ((.sprint_goal.entries // []) | map(.sprint_id) | index(SPRINT_ID)) as $goal_exists
| ((.task_board.active_sprints // []) | map(.id) | index(SPRINT_ID)) as $sprint_exists

# ---------------------------------------------------------------------------
# M1 — umbrella vision (sprint_goal.entries[])
# ---------------------------------------------------------------------------
| (if $goal_exists != null then .
   else .sprint_goal.entries += [{
     "sprint_id": SPRINT_ID,
     "status": "active",
     "vision": "Eliminate the SECOND daily_ohlcv unit-contamination class — whole-row thousands-format (close<1000, e.g. FPT close=70.2 meaning 70200 VND) introduced at ingest over ~Aug2025-Feb2026 — so the public Relative-Strength + ROC-momentum + 52w-proximity cards stop serving garbage, and harden the WRITER so the residue can never re-accumulate.",
     "scope_in": "(A) repair migration extending the CONTAM-6 family to the whole-row close<1000 class via a PER-TICKER ~1000x discontinuity test (NOT a blind close<1000 sweep); (B) reflow/recompute derived RS/ROC/percentile/52w serving values after normalization; (C) durable ingest-time unit-normalization guard (writer-side) + extend the CONTAM-5 sanity job to flag the new class.",
     "scope_out": "The already-fixed mixed-scale class (open<100 AND close>=1000, CONTAM-6) — untouched. Any change to index-type rows (VNINDEX legitimately ~1300-1900, just backfilled in RC3) — the predicate MUST exclude them. Legitimately low-priced stocks — never multiplied.",
     "success_metric": "RAW (gateway): get_relative_strength no-arg returns |rs|<=~3 for h63/h126/h252 on ALL watchlist tickers (no 594/922/-1.35 artifacts); get_roc_momentum returns roc in a sane band for all (no 606x, no -0.998); VNINDEX 253 bars intact; a synthetic thousands-format push for a high-price ticker is normalized/rejected at write (unit test); CONTAM-5 sanity job flags the close<1000 whole-row class.",
     "created_at": $now
   }] end)

# ---------------------------------------------------------------------------
# M2 — umbrella sprint container (task_board.active_sprints[])
# ---------------------------------------------------------------------------
| (if $sprint_exists != null then .
   else .task_board.active_sprints += [{
     "id": SPRINT_ID,
     "label": "daily_ohlcv whole-row thousands-format contamination (close<1000) repair + reflow + durable writer guard",
     "priority": "high",
     "status": "ACTIVE",
     "opened_at": $now,
     "evidence": "RAW gateway probe 2026-06-30T20:13Z (get_relative_strength + get_roc_momentum, watchlist): FPT h252 rs=594.07 LEADING-artifact / roc=606.29x decile10; DHG h63 rs=922.59 + h126 rs=918.06 LEADING-artifact; VHM h126 rs=-1.066 + h252 rs=-1.350 percentile0 / roc=-0.998; VIC h252 rs=-1.349 percentile2.78 (vs healthy h63 +0.475 / h126 +0.325) / roc=-0.998. Root: daily_ohlcv rows stored in thousands-format (whole-row O/H/L/C ~1000x small) over ~Aug2025-Feb2026. 2nd contamination class same table -> recurring-bug-escalation; durable writer guard required.",
     "tasks": [{
       "id": TASK_ID,
       "title": "daily_ohlcv whole-row thousands-format contamination (close<1000): migration + reflow + durable writer guard",
       "type": "SPRINT-M",
       "zone": "apps/mcp-server/",
       "owner": "architect",
       "size": "M",
       "status": "READY",
       "note": "Umbrella FIX promoted to ready[] -> architect designs the safe per-ticker discontinuity predicate; pm decomposes into dev tasks (apps/mcp-server)."
     }]
   }] end)

# ---------------------------------------------------------------------------
# M3 — relocate + enrich FIX task backlog[] -> ready[]
# ---------------------------------------------------------------------------
| (if $already_promoted then .
   else
     # capture the existing backlog row (preserve created_at/created_by)
     ((.task_board.backlog // []) | map(select((type=="object") and .id==TASK_ID))[0]) as $orig
     | if $orig == null then .   # not in backlog and not promoted -> no-op safety
       else
         # remove from backlog
         (.task_board.backlog |= map(select((type!="object") or (.id!=TASK_ID))))
         # build enriched ready row
         | ($orig + {
             "status": "READY",
             "type": "SPRINT-M",
             "priority": "high",
             "size": "M",
             "zone": "apps/mcp-server/",
             "sprint": SPRINT_ID,
             "owner_agent": "architect",
             "next_agent": "architect",
             "updated_at": $now,
             "updated_by": "po",
             "promoted_at": $now,
             "promoted_by": "po-s135",
             "raw_evidence": "gateway 2026-06-30T20:13Z: FPT h252 rs=594.07 / roc=606.29x d10; DHG h63 rs=922.59 + h126 918.06; VHM h126 rs=-1.066 / h252 rs=-1.350 p0 / roc=-0.998; VIC h252 rs=-1.349 p2.78 / roc=-0.998. >=4 watchlist tickers visibly degraded (more than the 3 first triaged).",
             "precedent": "Prior sprint OHLCV-UNIT-CONTAM: CONTAM-4 (writers D/E) / CONTAM-5 sanity job (apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts, 15:05Z) / CONTAM-6 repair (scripts/migrations/repair-ohlcv-unit-contamination.ts, --dry-run + runRepair()) / CONTAM-7 test. CONTAM-6 WHERE = '(open<100 OR low<100) AND close>=1000' and only normalizes open/low -> structurally CANNOT see this whole-row close<1000 class. Writer normalizeOhlcvToVnd applies x1000 only when max(OHLC)<100 and detectAndNormalizeScaleFromPrevClose needs a clean prev_close -> gap when the whole recent series is contaminated.",
             "deliverables": [
               "A: repair migration extending the CONTAM-6 family to the whole-row close<1000 class. Detection = PER-TICKER ~1000x discontinuity test against the ticker's OWN clean reference level (NOT a blind close<1000 sweep). Reuse the --dry-run + runRepair() interface; dry-run report (ticker, date-range, row-count) for human-confirm BEFORE live UPDATE-in-txn. Verify the exact predicate against live rows first.",
               "B: reflow/recompute derived RS/ROC/percentile/z-score/52w. FIRST determine whether these are materialized (stored) or computed-on-read (RS tool returned source_tier 3 live -> likely computed-on-read, in which case normalizing daily_ohlcv self-heals and only a re-probe is needed; reflow any materialized aggregate/cache e.g. ohlcvDailyAggregator output). RAW-verify the SERVING layer post-fix, not just the base table.",
               "C: durable ingest-time unit-normalization guard (writer-side) closing the max(OHLC)<100 gap (a high-price stock contaminated in thousands sits at 100-1000, NOT <100) and the all-series-contaminated no-clean-prev_close gap. Fix the WRITER not just residue. Extend CONTAM-5 ohlcvSanityCheckJob to flag the whole-row close<1000 class."
             ],
             "critical_cautions": [
               "EXCLUDE index-type rows: VNINDEX legitimately trades ~1300-1900 (253 bars just backfilled in RC3) and other indices sit in their own scale. The predicate MUST identify and skip index codes; verify the is_index flag / index-code set against the LIVE schema before any UPDATE.",
               "NOT a blind close<1000 sweep: a stock whose ENTIRE series is ~100 is legitimately cheap and must NOT be x1000'd. Only touch a series with a ~1000x STEP within its own history.",
               "Dry-run + human-confirm before any live mutation (CONTAM-6 precedent); UPDATE inside a single transaction.",
               "Recurring-bug-escalation (feedback_recurring_bug_escalation): 2nd contamination class same table -> the durable WRITER guard (deliverable C) is the real exit criterion, not another one-off repair."
             ],
             "generic_mandate": "Ship the durable writer-side guard + sanity-job extension so this contamination class cannot re-accumulate; the repair migration alone does NOT close the sprint.",
             "verification_gate": "RAW (gateway, not badges): (1) get_relative_strength no-arg -> |rs|<=~3 for h63/h126/h252 on ALL watchlist tickers; (2) get_roc_momentum no-arg -> roc in a sane band (no 606x, no -0.998) for all; (3) VNINDEX get_price_history still ~1300-1900 with 253 bars (untouched); (4) a chosen legitimately-cheap stock untouched; (5) writer unit test: synthetic thousands-format push for a high-price ticker is normalized/rejected; (6) CONTAM-5 sanity job flags the new class.",
             "cascade": "architect (safe predicate design + writer-gap + reflow plan; brief per recurring-bug-escalation) -> pm (decompose into dev tasks) -> developer (apps/mcp-server)."
           }) as $ready_row
         | .task_board.ready += [$ready_row]
       end
   end)

# ---------------------------------------------------------------------------
# M4 — repoint canonical head -> architect
# ---------------------------------------------------------------------------
| (if ($already_promoted | not)
      and (.head.active_task_id == TASK_ID)
      and ((.head.next_agent // "") == "po")
   then .head += {
     "next_agent": "architect",
     "updated_at": $now,
     "updated_by": "po-s135",
     "note": ("PO triage: FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000 RAW-CONFIRMED user-facing (gateway 20:13Z: FPT rs594/roc606x, DHG rs922, VHM/VIC -1.35/-0.998 artifacts across >=4 watchlist tickers). 2nd daily_ohlcv contamination class (whole-row close<1000) -> CONTAM-6 (close>=1000 clause) structurally misses it. Sprint " + SPRINT_ID + " kicked off (sprint_goal + active_sprints), umbrella FIX promoted backlog->ready as SPRINT-M. DISPATCHING architect for safe per-ticker discontinuity predicate (EXCLUDE index rows) + durable writer guard + reflow plan; then pm decompose -> developer (apps/mcp-server). Push gated (PO/human).")
   }
   else . end)
