# Router 2026-06-16 — BCTC C4 paired P1 lane review -> done_verified (live VPS behavioral gate GREEN, router-run RAW).
#
# Two fixes co-landed in vps-scripts/discover-bctc-urls-browser.py @ commit 4d93f767 (C4 ADF-BRITTLENESS contract,
# brief docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md). Router did NOT relay the ops sub-agent badge
# (honors feedback_router_verify_raw_not_badges): it re-ran the gates FIRST-HAND over SSH against the deployed artifact
# and confirmed the artifact identity by shasum, NOT by trusting "deploy OK".
#
# ARTIFACT IDENTITY (deploy is a single-file scp to the VPS crawler, NOT a container image rebuild):
#   shasum -a1  local == VPS == 7f2d30cdd2f72eadcb90673f7e50c325dfa76eef  (== committed 4d93f767, tree clean).
#   Surgical scp to root@125.212.251.27:/root/discover-bctc-urls-browser.py — NOT full deploy-vinahost.sh => zero peer
#   disruption (honors feedback_rebuild_recreate_destroys_peers spirit on the VPS side).
#
# ROUTER-RUN RAW LIVE GATES (SSH, first-hand, NOT relayed):
#   Gate A (FIX-HNX-SESSION-COOKIE): python3 /root/discover-bctc-urls-browser.py SHB 2025 Q4 -> rc=0,
#     stderr "[HNX] session warmup GET OK (referrer=https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html)",
#     1 real non-empty PDF https://owa.hnx.vn/ftp///cims/2026/2_W1/000000015842307_404v_20260128_1.PDF.
#   Gate C (FIX-SSC-C111-EMPTY-FALLBACK): python3 /root/discover-bctc-urls-browser.py ACV 2025 Q4 -> rc=0,
#     15x "idx=NN c111 empty -> c3 fallback title=..." (real VN titles), 1 real non-empty PDF
#     http://125.212.251.27:8765/bctc-files/ACV/000000016076625_EN_AuditedConsoliatedFinancialStataments_2025.pdf.
#   Gate D (afrLoop fail-loud, sub-risk A): magic constant "27000000000000000" count=0 in BOTH live stderr streams.
#   /goal#1 floor: real NON-EMPTY portal URLs, not a green-step badge. /goal#2: shape predicates, no per-ticker/date literal.
#
# GUARD: refuse unless BOTH tids uniquely in review[] AND neither already in done_verified[]. CONSERVATION: total UNCHANGED.
# HEAD: reset from the stale dispatch pointer (active_task_id=FIX-HNX-SESSION-COOKIE) to idle/non-dispatching so the next
#   dev-team tick falls to Step 1 triage — promotion recorded in the task objects, not the head.
# Usage: jq --arg now "$NOW" -f scripts/router-d80-bctc-c4-paired-p1-doneverified-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ["FIX-HNX-SESSION-COOKIE","FIX-SSC-C111-EMPTY-FALLBACK"] as $tids
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ($tids | map(. as $id | ($root.task_board.review        | map(select(.id==$id)) | length))) as $inreview
| ($tids | map(. as $id | ($root.task_board.done_verified | map(select(.id==$id)) | length))) as $indv
| if ($inreview | any(. != 1)) then error("a target tid not uniquely in review[] — refuse: " + ($inreview|tostring))
  elif ($indv | any(. > 0)) then error("a target tid already in done_verified[] — refuse")
  else . end
| {
    "FIX-HNX-SESSION-COOKIE": {
      root_cause:"HNX/UPCOM AspNetCore report-list endpoint rejects the cold POST when no session cookie is present; the crawler POSTed with no prior GET => empty/blocked response => 0 discovered URLs for HNX & UPCOM tickers.",
      fix_summary:"_hnx_make_opener() builds a CookieJar+HTTPSHandler opener; a warmup GET on the report-list page (referer) plants the session cookie BEFORE the POSTs (_hnx_opener_get/_hnx_opener_post); warmup failure returns None (honest no-data over a cold-POST empty).",
      fix_commit:"4d93f767",
      deploy_done:true,
      deploy_evidence:"single-file scp -> root@125.212.251.27:/root/discover-bctc-urls-browser.py; shasum -a1 local==VPS==7f2d30cdd2f72eadcb90673f7e50c325dfa76eef (== committed 4d93f767). NOT full deploy-vinahost.sh => zero peer disruption.",
      live_gate_evidence:"Router-run RAW (NOT relayed) SSH: python3 /root/discover-bctc-urls-browser.py SHB 2025 Q4 -> rc=0, stderr '[HNX] session warmup GET OK (referrer=https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html)', 1 real non-empty PDF https://owa.hnx.vn/ftp///cims/2026/2_W1/000000015842307_404v_20260128_1.PDF. UPCOM referer warmup also fires (ops Gate B, ACV, conf 0.92). /goal#1 floor: real non-empty portal URL.",
      generic_verified:"/goal#2 PASS — shared _hnx_make_opener/_hnx_opener_get/_hnx_opener_post helpers cover every HNX & UPCOM POST path; referer derived from source_label, no per-ticker/exchange/date literal."
    },
    "FIX-SSC-C111-EMPTY-FALLBACK": {
      root_cause:"SSC report-list rows with an empty c111 (period) cell were silently `continue`-skipped => real PDFs dropped from discovery whenever SSC rendered the period only in c3 (report_type) and left c111 blank.",
      fix_summary:"When title (c111) empty but report_type (c3) present, fall back to c3 for the period title BEFORE the skip-guard; only skip when BOTH empty. Generic empty-cell shape predicate.",
      fix_commit:"4d93f767",
      deploy_done:true,
      deploy_evidence:"same artifact/shasum chain as the paired fix: local==VPS==7f2d30cdd2f72eadcb90673f7e50c325dfa76eef (== committed 4d93f767).",
      live_gate_evidence:"Router-run RAW (NOT relayed) SSH: python3 /root/discover-bctc-urls-browser.py ACV 2025 Q4 -> rc=0, 15x stderr 'idx=NN c111 empty -> c3 fallback title=...' (real VN titles 'Báo cáo tài chính năm 2025' / 'quý 1/ 2026'), 1 real non-empty PDF http://125.212.251.27:8765/bctc-files/ACV/000000016076625_EN_AuditedConsoliatedFinancialStataments_2025.pdf. Rows no longer silently dropped on empty c111.",
      generic_verified:"/goal#2 PASS — c111->c3 fallback is a generic empty-cell predicate firing for every SSC row (15 on ACV), no per-ticker allowlist; co-located afrLoop fail-loud kills magic '27000000000000000' (live count=0)."
    }
  } as $ev
| ([.task_board.review[] | select(.id as $i | ($tids|index($i))!=null)]) as $moved
| .task_board.review = [ .task_board.review[] | select(.id as $i | ($tids|index($i))==null) ]
| .task_board.done_verified = ( .task_board.done_verified + [
      $moved[] | . + { status:"DONE_VERIFIED", done_verified_ts:$now, done_verified_by:"dev-team" } + $ev[.id]
    ] )
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null, rebuild_required:false,
    note:("ROUTER " + $now + " — BCTC C4 paired P1 PROMOTED review->done_verified on live VPS gate GREEN. Router-run RAW (NOT relayed): shasum local==VPS==7f2d30cd; Gate A SHB '[HNX] session warmup GET OK' + real HNX PDF; Gate C ACV 15x c111->c3 fallback + real PDF; Gate D magic '27000000000000000' count=0 both runs. Surgical single-file VPS deploy (no peer disruption). Head idle (non-dispatching) -> next tick Step 1 triage. Remaining review[]: FIX-BCTC-ENRICH-SILENT-0ROWS (C3 prod-wiring gate), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT, FIX-ALERT-ORPHAN-CORRELATION. PUSH held (PO out-of-band; branch ahead/behind divergence). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
