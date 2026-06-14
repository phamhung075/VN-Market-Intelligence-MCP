# po-s54-kinhdich-hover-fe-done-verified.jq
# Final signoff: move KINHDICH-HOVER-ENRICH-FE in_progress[] -> done[] (status=done_verified),
# stamp product-acceptance closure fields, link parent KINHDICH-HOVER-ENRICH, and idle head
# IFF head still points at this task. Leaves every OTHER board array/entry (incl. concurrent
# ARCH-CRON-SCHEDULER-RELIABILITY, VN-MACRO-TOOLING/VMT-*) byte-for-byte untouched.
# Usage: jq --arg now "$NOW" -f scripts/po-s54-kinhdich-hover-fe-done-verified.jq orch-state.json
#   atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH.

def TASK: "KINHDICH-HOVER-ENRICH-FE";
def PARENT: "KINHDICH-HOVER-ENRICH";

# capture the task object (if present) before we strip it
(.task_board.in_progress // []) as $ip
| ($ip | map(select((.id // "") == TASK)) | first) as $t
| if $t == null then .            # idempotent: already closed -> no-op
  else
    # 1. strip from in_progress[]
    .task_board.in_progress = ($ip | map(select((.id // "") != TASK)))
    # 2. append closed task to done[] with product-acceptance fields
    | .task_board.done += [
        $t
        + {
            status: "done_verified",
            lane: "done",
            next_agent: "none",
            closed_at: $now,
            closed_by: "po",
            po_signoff: "ACCEPTED — original user complaint resolved: the Kinh Dịch quẻ hover tooltip no longer shows a short/cryptic coreMeaning. 64 quẻ now carry a 150-224-char (avg ~194) plain-Vietnamese hoverSummary on the LIVE user surface (Remix :3001 QueName.tsx, loaded by /dashboard/kinh-dich-signals + /analysis), with coreMeaning fallback (?? operator) for any quẻ lacking one. Done-bar met = richer AND comprehensible (plain VN, no unexplained jargon, quẻ29/47 spot-checked), not merely longer.",
            po_signoff_at: $now,
            po_signoff_by: "po",
            done_bar: "MET — user feedback 'hover too short/complicated/not comprehensible' addressed on the CORRECT surface. Wrong-surface error from parent KINHDICH-HOVER-ENRICH definitively corrected + LIVE-verified (router RAW-re-verified served bundle: curl :3001/assets/QueName-C7QiQvgn.js -> hoverSummary x65, quẻ1/quẻ47 substring hits, fallback x1, 66763 bytes).",
            chain_verified: "po->ba->architect(c5ee21ae ARCH-RATIFY-FE-1 CONFIRMED, QUE-TOOLTIP-DRY preserved)->dev-frontend(067e484d codegen emits hoverSummary x64 all>=80chars -> QueName.tsx:75 hoverSummary??coreMeaning, tsc-green)->ops(d349d070 targeted apps/frontend rebuild only, new img deployed, :3001 200, 13 peers up)->qa(a68d5d3f APPROVED, served-bundle load-bearing proof). Every stage RAW-re-verified independently by router.",
            ssot_residual_note: "SSOT groundwork from the first (wrong-surface) attempt — hoverSummary x64 in apps/kinh-dich-service/dashboard/que-reference.js + hexagram_reference.go (commit 47fe36e8) — is the reusable source the codegen (scripts/gen-que-descriptions.ts) now reads. Nothing to revert; the prior partial is consumed groundwork, not waste."
          }
      ]
    # 3. link parent: mark superseded-by + corrected-by-child on the wrong-surface partial
    | .task_board.done = (
        .task_board.done | map(
          if (.id // "") == PARENT then
            . + {
              superseded_by: TASK,
              corrected_by: TASK,
              parent_closure_note: ("Wrong-surface partial (kinh-dich-service :5005 JSON-only dashboard, never user-visible) corrected by child " + TASK + " on the REAL Remix :3001 tooltip surface; SSOT hoverSummary groundwork (47fe36e8) carried forward into the child's codegen — no revert. Recorded " + $now + " by po.")
            }
          else . end
        )
      )
    # 4. idle head IFF it still points at this task (do not clobber a concurrent re-point)
    | if (.head.active_task_id // "") == TASK then
        .head = {
          status: "idle",
          updated_at: $now,
          updated_by: "po",
          active_task_id: null,
          next_agent: "none",
          note: ("KINHDICH-HOVER-ENRICH-FE FINAL SIGNOFF -> done_verified (po " + $now + "). User complaint 'quẻ hover too short/cryptic' RESOLVED: 64 plain-VI 150-224char hoverSummary on LIVE :3001 tooltip + coreMeaning fallback; wrong-surface error corrected + router RAW-re-verified served bundle. WIP back to concurrent-only (ARCH-CRON-SCHEDULER-RELIABILITY held passive for Mon 2026-06-15 market-day G1/G2/G3 re-verify — NOT mine this run). Board idle for next cron/router tick.")
        }
      else . end
  end
