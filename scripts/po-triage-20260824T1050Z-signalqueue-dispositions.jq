# po-triage-20260824T1050Z-signalqueue-dispositions.jq
#
# OWNING FLOW: docs/agents/po/flow/triage-signals.md § Live `.signal_queue.rows[]` inbox (Pipeline B)
# Invoked as: jq -f scripts/po-triage-20260824T1050Z-signalqueue-dispositions.jq \
#               --arg now "<ISO8601Z>" docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Dispositions the 7 `to: po` rows held at status=NEW across six cowork ticks (09:30Z-10:45Z),
# hand-dispatched by the router because `po` has no cron-armed dispatch path.
#   1 x bctc_image_fetch_degraded  -> triaged (FOLD + one new mint; signal is FALSE about its own subject)
#   1 x narrative_contradiction    -> RETRACTED (13th inverted verdict, payload confirms the claim it accuses)
#   5 x narrative_contradiction    -> triaged (FOLD onto the P0 CCATO emitter row)
#
# `triaged` (not READ) is PO's demonstrated terminal state on this queue and is a member of
# scripts/orch-cold-evict.sh's TERMINAL_SIGNAL_STATUSES, so these rows become age-evictable.

def bctc_disposition:
  "FOLD onto FIX-BCTC-PAGE-IMAGE-FETCH-DEGRADED-CONFIDENCE-CAP (2nd occurrence, 2nd distinct report in 2 days) "
+ "+ MINTED FIX-BCTC-IMGDEG-SIGNAL-SUMMARY-CONTRADICTS-ITS-OWN-LIVE-CONFIDENCES. "
+ "THIS SIGNAL IS FALSE ABOUT ITS OWN SUBJECT ON TWO AXES - re-measured at source this tick via "
+ "get_bctc_refined(report_id=1f53ef33-8f50-489b-8505-689740692ab0) through the gateway wrapper, not taken from the dispatch. "
+ "(i) COUNT: THREE units carry an image_unavailable flag, not the 2 named in payload.affected_unit_ids - "
+ "unit-0004 conf 0.75 flags [continuation_marker_missing:page7, image_unavailable:pages6-8]; "
+ "unit-0005 conf 0.65 flags [image_unavailable, garbled_ocr_layout]; "
+ "unit-0006 conf 0.70 flags [image_unavailable, ocr_row_alignment_uncertain]. "
+ "(ii) THRESHOLD: NONE of the three is at or below the <=0.6 the summary asserts; the true range is 0.65-0.75. "
+ "MECHANISM PINNED in apps/mcp-server/src/infrastructure/signals/bctcImageFetchDegradedSignalWriter.ts: "
+ "(a) shouldSignalImageFetchDegradation() fires on strict equality occurrenceCount===threshold(2) - a rising edge that by "
+ "its own header 'never re-fires on the 3rd, 4th ... occurrence' - and nothing ever amends the emitted row, so "
+ "affected_unit_ids is a point-in-time snapshot presented as the report's final extent. unit-0006 was refined at "
+ "09:04:24, 10s AFTER this row's own ts 09:04:14, which is exactly why it is missing. "
+ "(b) buildBctcImageFetchDegradedRow() templates the literal 'capped <=0.6 confidence' unconditionally and never reads a "
+ "confidence value at all - byte-for-byte the same hardcoded-summary-contradicts-payload defect as CCATO defect (C) at "
+ "scripts/narrative-truth-gate.sh:421-423, in a second, independent emitter. "
+ "(c) The row carries NO dedup_key (yesterday's sibling bctc-imgdeg-69fcd047 only has one because PO stamped it by hand at "
+ "triage) - same missing-dedup_key defect as CCATO defect (B). "
+ "UNDERLYING AND WORSE THAN THE SUMMARY BUG: the <=0.6 cap that the writer's own file header calls 'BY DESIGN' is a prose "
+ "instruction to the refine_bctc_md subagent (table-page.md / continuation-stitch.md) with no server-side clamp at the "
+ "push_bctc_refined_unit boundary. Live data refutes it 3/3, so any downstream consumer filtering on confidence<=0.6 to "
+ "find image-degraded units silently returns ZERO for this report. Not closed as noise: the fetch-plane degradation itself "
+ "is real and now recurring, and the emitter's own falsity is the newly minted row.";

def ntg_fold:
  "FOLD onto FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID (P0). "
+ "13TH BATCH - THE EMITTER IS STILL LIVE 8h45m AFTER THAT ROW WAS MINTED AND 7h20m AFTER IT WAS EXPEDITED TO P0. "
+ "Git-traced at source this tick: ntg-* count 72 at commit 22429c27e (2026-08-24T08:53:31Z) -> 78 at c637f9e69 "
+ "(08:59:31Z); a set-diff of the two commits' ntg id lists returns exactly these 6 ids and no others. "
+ "All 6 still carry the forged ts 2026-08-24T00:00:00Z - now second-identical across 13 batches spanning 10h27m of wall "
+ "clock (22:32Z 08-23 -> 08:59Z 08-24), so AC-7's 'ts is not a clock read' proof is 13 batches strong, not 3. "
+ "Content is the SAME 4 findings at the same 6-row shape (returned_value: 'not found in database', 62.1, 62.1, 61, 61, 60) "
+ "- 4 findings, 78 rows, 19.5x amplification. Still zero dedup_key on any of them. "
+ "AC-8's clean-up figure is stale again: 65 non-retracted ntg-* rows to collapse, not 60. "
+ "Dedup per the flow doc's own (payload.ticker, payload.tool, payload.cycle) key: all 6 are (VNM, get_technical_indicators, "
+ "2026-08-24) - identical to the 72 already on file - so this is a fold, never a mint.";

def ntg_retraction:
  "INVERTED VERDICT - 13th of its kind, and the FIRST to arrive after the P0 expedite, which is the proof that the 12 earlier "
+ "retractions were manual one-shot snapshots and not a mechanism. This row's own payload confirms the claim it accuses: "
+ "payload.returned_value is 'not found in database', a VERBATIM member of .tool_null_markers in docs/data/claim-tool-map.json, "
+ "which classify() at scripts/narrative-truth-gate.sh:268-271 maps to NULL (honest gap) and which the emit loop at :413-414 "
+ "then skips (if v['result'] != 'FAIL': continue). chef's claim 'VNM khong co du lieu ky thuat phien nay' was CORRECT. "
+ "The accusation is manufactured entirely by the hardcoded summary template at :421-423, which asserts 'returned non-null "
+ "data' unconditionally without ever reading returned_summary. "
+ "CORRECTS THE DISPATCH: the router's hand-off asserted that ALL SIX of this tick's rows carry returned_value 'not found in "
+ "database'. Re-measured at source - only THIS one does. The other five carry real indicator values (62.1, 62.1, 61, 61, 60) "
+ "and are genuine FAIL-shaped rows, so they are folded, not retracted. 13 of 78 live ntg-* rows now carry this inversion, "
+ "all 13 retracted. Tracked at FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID AC-4.";

.signal_queue.rows |= map(
  if .id == "bctc-imgdeg-1f53ef33-20260824T090414Z" then
    . + {
      status: "triaged",
      dedup_key: "bctc_image_fetch_degraded:1f53ef33-8f50-489b-8505-689740692ab0",
      triaged_at: $now,
      triaged_by: "po (triage-20260824T1050Z, router hand-dispatch)",
      disposition: bctc_disposition
    }
  elif .id == "ntg-20260824T000000Z-technical_indicators-VNM-62a037" then
    . + {
      status: "RETRACTED",
      triaged_at: $now,
      triaged_by: "po (triage-20260824T1050Z, router hand-dispatch)",
      retraction_reason: ntg_retraction
    }
  elif (.id | startswith("ntg-20260824T000000Z-technical_indicators-VNM-"))
       and (.status == "NEW") then
    . + {
      status: "triaged",
      triaged_at: $now,
      triaged_by: "po (triage-20260824T1050Z, router hand-dispatch)",
      disposition: ntg_fold
    }
  else . end
)
| .signal_queue.last_triaged_at = $now
| .signal_queue.last_triaged_by = "po"
