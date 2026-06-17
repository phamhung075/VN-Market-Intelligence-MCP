# po-s100-ohlcv-p0ab-review-to-done-code-reconcile.jq
#
# BOARD RECONCILIATION — two QA-APPROVED (cycle-287), ops-rebuilt-LIVE P0s
# move review[] -> done[] as CODE-COMPLETE (done_verified:false). NO new tasks.
#
# Context: QA decision doc sprint-ARCH-OHLCV-WRITER-SSOT-DURABLE-qa.md verdict
# APPROVE (both); report TASK_REPORT_ARCH-OHLCV-WRITER-SSOT-DURABLE-P0AB.md.
# Router RAW-verified the ops rebuild LIVE (docker exec grep proved MERGE-ONLY +
# both scan-guards in the running container; 12/12 UP; mcp-server 200; named
# volume untouched). REBUILD_SHIPPED:YES. done_verified HELD to the next VN market
# open 2026-06-18 ~02:15Z first TA scan (shared behavioral gate) — DO NOT flip
# done_verified now for either P0.
#
# Single-pass multi-mutation:
#   M1  RELOCATE FIX-ALERT-SCAN-REJECT-STUB-BAR-P0  review[] -> done[]
#         (P0-B consumer stub-bar guard; was status:done-code in review[8],
#          qa_verdict:APPROVE-CODE. -> status:DONE, done_verified:false, gate stamp)
#   M2  COLLAPSE P0-A: fold the 3 bare SUBTASK strings (review[9,10,11]) into the
#         parent ARCH-OHLCV-WRITER-SSOT-DURABLE object at done[] (was
#         status:DESIGN_COMPLETE — the architect DESIGN deliverable) -> flip to
#         status:DONE (code-complete via SUBTASK-1/2/3 commits 41b4344c/e5461ad7/
#         e96571ac), record the 3 subtask ids in a .subtasks field, attach QA
#         approval + the shared behavioral gate. REMOVE the 3 strings from review[].
#         (The design-parent + 3 code-subtasks collapse into ONE done-code SSOT
#          record — no standalone bare-string entries left dangling in review[].)
#   M3  ASSERT-ONLY (placement guard, NO mutation): the two non-P0 follow-ons
#         LINT-OHLCV-WRITE-BYPASS + ARCH-DAILY-FOREIGN-FLOW-TABLE already exist in
#         backlog[] (per architect brief 2026-06-17-ohlcv-writer-ssot-durable.md) —
#         no mint needed; the harness asserts both are present + still BACKLOG.
#
# Conservation: review[] -1 object (P0-B) -3 strings (subtasks) = -4 (12 -> 8);
#   done[] +1 object (P0-B relocated) = +1; done[162] P0-A parent edited IN PLACE
#   (status + .subtasks, no count change); backlog UNCHANGED. Net total -3 (606->603).
#   The 3 subtask strings are NOT lost — they become a .subtasks array field on the
#   P0-A parent (record-keeping), they just stop being standalone board entries.
#
# Idempotent: M1 guarded by done[] membership of P0-B; M2 guarded by the parent's
#   status (DESIGN_COMPLETE -> DONE flips once) AND by absence of the subtask strings
#   in review[]; re-run mutates 0.
#
# done_verified is HELD for BOTH (status:DONE, done_verified:false) — the shared
# behavioral gate is the next VN market open 2026-06-18 ~02:15Z: RSI canonical
# within 0.1pt (no single-digit / no 100.0), zero "giá 0 dưới BB" on MARKET, live
# daily_ohlcv 0 close=0 stubs on the latest bar across all 30 watchlist tickers
# (verify DAG != 0). Self-heal masks stubs after ~04:30Z — gate verifies AT open.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s100-ohlcv-p0ab-review-to-done-code-reconcile.jq \
#     docs/data/orch/orch-state.json
# Atomic: temp -> [ -s ] -> jq empty -> conservation -> placement -> rename;
#   commit orch-state by EXPLICIT PATH; PUSH HELD (PO out-of-band).

def BEHAVIORAL_GATE:
  "NEXT VN market open 2026-06-18 ~02:15Z first TA scan (briefing 01:00Z): RSI canonical within 0.1pt (no single-digit / no 100.0), zero 'giá 0 dưới BB' on MARKET, live daily_ohlcv ZERO close=0 stubs on the latest bar across all 30 watchlist tickers (verify DAG != 0). Self-heal masks stubs after ~04:30Z — gate verifies AT open. REBUILD_SHIPPED:YES (router RAW-verified running container content via docker exec grep: MERGE-ONLY + both scan-guards live; 12/12 UP; mcp-server 200; named volume untouched).";

# pop a row by id from an array of objects -> [row-or-null, remaining-array]
def pop($id):
  ( [ .[] | select((type=="object") and (.id == $id)) ] | .[0] ) as $row
  | ( [ .[] | select((type!="object") or (.id != $id)) ] ) as $rest
  | [$row, $rest];

def done_has($id): (.task_board.done | any((type=="object") and (.id == $id)));

# --- M1: P0-B  FIX-ALERT-SCAN-REJECT-STUB-BAR-P0  review -> done --------------
( if done_has("FIX-ALERT-SCAN-REJECT-STUB-BAR-P0") then .
  else
    (.task_board.review | pop("FIX-ALERT-SCAN-REJECT-STUB-BAR-P0")) as $p
    | if $p[0] == null then .
      else
        .task_board.review = $p[1]
        | .task_board.done += [ $p[0]
            + { status: "DONE",
                done_verified: false,
                done_code: true,
                done_code_at: $now,
                done_code_by: "po-s100",
                qa_verdict: "APPROVE-CODE (cycle-287)",
                rebuild_shipped: true,
                behavioral_gate: BEHAVIORAL_GATE,
                done_code_note: "P0-B consumer defense-in-depth — taAlertScanJob L196-209 + bbAlertScanJob L195-198 reject latest bar close<=0||vol<=0 fail-closed; CANDLE_SQL SELECT volume added. Commit d79314bb. QA cycle-287 APPROVE-CODE (full suite 13181 pass / 52 fail ALL disjoint / tsc 0; SB-1..SB-5 behavioral each job). Router RAW-verified ops rebuild LIVE. Relocated review->done as CODE-COMPLETE; done_verified HELD to the shared 2026-06-18 ~02:15Z market-open gate." } ]
      end
  end )

# --- M2: P0-A  collapse 3 SUBTASK strings into ARCH parent + flip to DONE -----
| ( (.task_board.review | any((type=="string") and (test("SUBTASK-OHLCV-WRITER")))) as $strings_present
    | if ($strings_present | not) then .            # already collapsed -> idempotent no-op
      else
        # capture the subtask strings (order-stable)
        ( [ .task_board.review[] | select((type=="string") and (test("SUBTASK-OHLCV-WRITER"))) ] ) as $subtasks
        # strip them out of review[]
        | .task_board.review |= map(select((type!="string") or (test("SUBTASK-OHLCV-WRITER") | not)))
        # edit the parent ARCH-OHLCV-WRITER-SSOT-DURABLE in place in done[]
        | .task_board.done |= map(
            if (type=="object") and (.id == "ARCH-OHLCV-WRITER-SSOT-DURABLE")
            then . + {
              status: "DONE",
              done_verified: false,
              done_code: true,
              done_code_at: $now,
              done_code_by: "po-s100",
              subtasks: $subtasks,
              subtask_commits: ["41b4344c", "e5461ad7", "e96571ac"],
              qa_verdict: "APPROVE (cycle-287)",
              rebuild_shipped: true,
              behavioral_gate: BEHAVIORAL_GATE,
              done_code_note: "P0-A producer-root SSOT. writeForeignFlowToOhlcv is now MERGE-ONLY (UPDATE-only, no close=0 stub INSERT) — the bypassing writer no longer re-seeds a fake C=0 current-day bar. SUBTASK-1+2 (merge-only + SSOT annotation, 41b4344c), SUBTASK-3 (unit tests T-1..T-4 + integration gate, e5461ad7), legacy-test alignment (e96571ac). T-4 regression-proof: SELECT close FROM daily_ohlcv WHERE code='REGRESSION-TEST' AND date='2026-06-18' returns 0 rows (no close=0 stub). QA cycle-287 APPROVE (17 pass / 0 fail on P0-A files; 52 full-suite fails ALL disjoint). Router RAW-verified ops rebuild LIVE. Parent was DESIGN_COMPLETE (architect deliverable); the 3 code-subtasks (formerly bare strings in review[]) are folded here under .subtasks and the parent flips to code-complete DONE. done_verified HELD to the shared 2026-06-18 ~02:15Z market-open gate (paired with P0-B). Follow-ons LINT-OHLCV-WRITE-BYPASS + ARCH-DAILY-FOREIGN-FLOW-TABLE already in backlog per architect brief."
            }
            else . end
          )
      end )

# --- metadata bump -----------------------------------------------------------
| ._updated_at = $now
| ._updated_by = "po-s100"
