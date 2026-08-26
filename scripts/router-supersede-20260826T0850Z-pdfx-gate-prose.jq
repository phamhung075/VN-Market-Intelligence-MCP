# One-shot: neutralise SUPERSEDED 09:00Z unblock prose on the three BLOCKED
# pdfx/OCR rows whose live next_recheck_not_before is 17:11Z.
#
# Why: gate_note (MEASURE) and po_gate_20260826T0536Z (ORIENTATION) each carry
# a literal "UNBLOCK ACTION at/after 2026-08-26T09:00:00Z: set status=BACKLOG".
# po_regate_20260826T0650Z later moved the gate to 17:11Z for sampler-
# contamination reasons, but the earlier prose was never retracted. A reader
# following it releases the AC-7 cohort ~8h early, which is the exact outcome
# the regate exists to prevent.
#
# Historical fields are PRESERVED (provenance); a dated supersede marker is
# added instead, matching the board convention (po_correction_*/po_regate_*).
#
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/router-supersede-20260826T0850Z-pdfx-gate-prose.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def SUPERSEDE:
  "SUPERSEDED-PROSE GUARD (router 2026-08-26T08:50Z). Any 09:00Z instruction on this row is DEAD TEXT, retained for provenance only. The binding gate is next_recheck_not_before=2026-08-26T17:11:00Z per po_regate_20260826T0650Z. Do NOT set status=BACKLOG before 17:11:00Z: the earlier 09:00Z bound was computed against VN market-close alone, while the real binding constraint is AC-7 sampler contamination. Specifically superseded: gate_note and po_gate_20260826T0536Z UNBLOCK ACTION lines, and acceptance AC-1 lower bound of 09:00:00Z (a floor, now weaker than the real gate - it does NOT authorise a 09:00Z start). Release actuator today is session-only cron 00545d31 (13 19 26 8 * = 19:13 local = 17:13Z); if this CLI session ends before then nothing releases these rows, because status=BLOCKED is admitted by no consumer allowlist - structural fix tracked at FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT (ready[], P0, architect). A fresh session must hand-release at/after 17:11:00Z.";

def SEQ_SATISFIED:
  "SEQUENCING DEP NOW SATISFIED (router 2026-08-26T08:50Z, verified on the live board): po_regate_20260826T0650Z sequenced this row BEHIND FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S so the baseline would not be measured over a corpus where ~29% of accepted extractions silently evaporate. That row is now status=DONE_VERIFIED in done_verified[]. The silent-drop precondition is met; the only remaining bar is the 17:11Z sampler window.";

(["MEASURE-PDFX-BCTC-QUALITY-TESSERACT-VIE-PRODUCTION-BASELINE",
  "DECIDE-PDFX-OCRWORKER-PAGE-RESCUE-LIVE-UNMEASURED-QUALITY-PATH",
  "FIX-PDFOCR-ORIENTATION-CORPUS-79-FILES-312-PAGES-SWEEP-REVERTED-BY-DB-RESTORE"]) as $ids
| .task_board.backlog = [
    .task_board.backlog[]
    | if (.id as $i | $ids | index($i)) then
        .router_supersede_20260826T0850Z = SUPERSEDE
        | .updated_at = $now
        | .updated_by = "router (superseded-prose guard on 09:00Z unblock text)"
        | if .id == "MEASURE-PDFX-BCTC-QUALITY-TESSERACT-VIE-PRODUCTION-BASELINE"
            then .router_seqdep_20260826T0850Z = SEQ_SATISFIED else . end
      else . end
  ]
