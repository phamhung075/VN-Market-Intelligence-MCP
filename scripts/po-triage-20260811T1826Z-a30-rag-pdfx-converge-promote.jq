# PO triage 2026-08-11T18:26Z — out-of-band A-30 escalation from system-auditor Tier-1 c33
#
# Inputs: 2 NEW .signal_queue.rows[] to=po from system-auditor
#   sys-20260811T181604-0404  CRITICAL  rag-service    "99.58% BELOW-FLOOR zero reclamation"
#   sys-20260811T181602-0de9  WARN      pdf-extractor  "sustained 95%+ loss of reclamation"
#
# Verdict: NO REBUILD. rag CRITICAL = detector false ESCALATE (live-refuted).
#          pdfx WARN = TRUE positive, already owned by a REVIEW-lane row.
#          Converge lever = promote the detector-calibration row backlog -> ready.
#
# Usage: jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#          -f scripts/po-triage-20260811T1826Z-a30-rag-pdfx-converge-promote.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# $now MUST come from real wallclock (`date -u`), never hand-typed
# (feedback_hand_typed_iso_timestamps_drift_into_the_future).

def _now: $now;
def _by: "po/triage-20260811T1826Z";

# ---------------------------------------------------------------------------
# Shared evidence block — measured live on BOTH planes this tick, not inferred
# from the auditor's own numbers (feedback_internal_consistency_is_not_
# corroboration_check_the_other_plane).
# ---------------------------------------------------------------------------
def _evidence:
  "PO RAW RE-VERIFY 2026-08-11T18:19-18:20Z (3.5 min after the emit):\n"
+ "  rag-service    823.2-823.3MiB / 1GiB = 80.39-80.40%, FLAT across 4 samples (18:19:39Z + 3x8s)\n"
+ "  pdf-extractor  2.38GiB / 2.5GiB = 95.20%, FLAT across 4 samples, CPU 0.15% (idle, no active OCR job)\n"
+ "  docker VM /proc/meminfo: MemTotal 8129968kB, MemFree 1326672kB, MemAvailable 2955536kB\n"
+ "  macOS host: memory_pressure free 72%; vm.swapusage used 6925.25M / 8192M\n"
+ "  rag-service StartedAt=2026-08-11T01:00:43Z (~17h, NO restart in window), RestartCount=9 CUMULATIVE, OOMKilled=false, health 200\n"
+ "  pdf-extractor StartedAt=2026-08-11T01:19:14Z, RestartCount=1, OOMKilled=false";

# ---------------------------------------------------------------------------
# A) rag-service CRITICAL -> triaged/FOLD. Detector false ESCALATE, and the
#    refutation is the LOG-LINE discriminator, not the meter — which is the
#    primary discriminator FIX-RECLAMATION-AC-VERIFIED-IN-COLDSTART-WINDOW-
#    BEFORE-WORKLOAD-LOADS mandates for exactly this class of AC.
# ---------------------------------------------------------------------------
def _rag_disposition:
  "FOLD — DETECTOR FALSE ESCALATE, live-refuted 16 SECONDS AFTER THE EMIT. No rebuild, no restart, no ops dispatch.\n\n"
+ "TIMELINE (docker logs -t vn-market-intelligence-mcp-rag-service-1, embedder lines only):\n"
+ "  18:00:05Z  Loading embedding model ... (first load ~400MB)\n"
+ "  18:00:27Z  Embedding model ready.            <- LOAD EVENT confirmed; workload WAS loaded, so the\n"
+ "                                                  cold-start-window trap is excluded by construction\n"
+ "  18:15:48Z  Embedding model unloaded after 920s idle (threshold=900s)  <- RECLAMATION EVENT\n"
+ "  18:16:04Z  auditor emits CRITICAL 'zero reclamation across all 6 probes'\n"
+ "  18:19:39Z  docker stats: 80.40%  (and 80.39% x3 more over the next 24s)\n\n"
+ "The unload the signal says did not happen is in the container's own log 16s BEFORE the signal was written. "
+ "The auditor's 6 probes all landed inside the model-loaded plateau (18:00:27Z-18:15:48Z), which is what the "
+ "<=5-minute A-30 window guarantees against a 15-minute idle-unload period.\n\n"
+ "CRASH-CLIFF EXCLUDED (feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip, applied in the "
+ "direction that memory demands): the 99.58->80.40% drop is NOT a post-crash floor. StartedAt is unchanged at "
+ "2026-08-11T01:00:43Z (~17h before the drop), OOMKilled=false, /health 200 throughout, and the drop is named in "
+ "the log as an idle-unload. RestartCount=9 is the cumulative-since-create counter, not a rate.\n\n"
+ "MAGNITUDE MATCHES THE TRACKED ROOT CAUSE EXACTLY: 99.58% of 1GiB = 1019.5MiB -> 823.3MiB = ~196MiB released of "
+ "the ~400MiB model footprint. FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS predicts "
+ "~180-210MiB retained. Unchanged mechanism, no new defect.\n\n"
+ "'HOST HEADROOM <40MiB / BELOW-FLOOR' IS REFUTED AND IS A DENOMINATOR ERROR (feedback_auditor_memory_pct_"
+ "denominator_falsespike class): the docker VM reports MemAvailable=2955536kB (2.82GiB) and MemFree=1326672kB "
+ "(1.27GiB); macOS memory_pressure reports 72% free. A '<40MiB' reading is a FREE-PAGES count, which is not "
+ "headroom on either plane — inactive/reclaimable pages are excluded from it. The floor gate also blocked its own "
+ "VmHWM probe on the strength of that number, so the signal discarded the one measurement (VmHWM vs VmRSS) that "
+ "would have shown the reclamation directly.\n\n"
+ "GENUINE RESIDUAL WATCH-ITEM, deliberately NOT minted: macOS swap is 6925/8192MB used (85%). That is the "
+ "documented pre-panic early-warning axis in project_host_memory_panic (rising swap_used + falling free%), but "
+ "free% is 72% and this is a standing host condition, not a container incident and not rebuild-addressable. "
+ "Re-check next tick; escalate only if free% also falls.\n\n"
+ _evidence;

# ---------------------------------------------------------------------------
# B) pdf-extractor WARN -> triaged/FOLD onto the REVIEW-lane row that already
#    owns it. This one is the TRUE positive of the pair.
# ---------------------------------------------------------------------------
def _pdfx_disposition:
  "FOLD onto FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (review[], P1, next_agent=dev-pdf-extractor). "
+ "TRUE POSITIVE, no new mint, no rebuild.\n\n"
+ "Live-confirmed: 95.20% (2.38GiB/2.5GiB) flat across 4 samples at CPU 0.15% — i.e. this is IDLE steady-state "
+ "occupancy with no OCR job running, not a burst artifact. That is the honest no-reclamation signature and it is "
+ "the opposite of the rag-service sample in the same tick, which is why the two signals get opposite dispositions.\n\n"
+ "The existing row already owns the mechanism (uvicorn PARENT process PID 1 as the dominant driver; VmHWM ~2.42GiB "
+ "= ~97% of cap recorded post-fix, which violates its own AC-4 <=80%-of-cap bar at peak). It is in REVIEW, not "
+ "BACKLOG — the lever is closing that review, not opening anything new.\n\n"
+ "OBSERVATION FOR WHOEVER CLOSES THAT REVIEW (measured, not adjudicated here): `docker exec "
+ "vn-market-intelligence-mcp-pdf-extractor-1 grep -rl malloc_trim /app` returns ZERO hits. The row's own "
+ "root_cause template (and the sibling rag-service row that cites it) turns on an allocator page-return call. "
+ "Whatever shipped, an allocator-return call is not present in the running image — confirm before accepting the "
+ "review.\n\n"
+ _evidence;

# ---------------------------------------------------------------------------
# C) REBUILD RULED OUT AT SOURCE — the decisive check the escalation asked for.
# ---------------------------------------------------------------------------
def _no_rebuild:
  "[po/triage-2026-08-11T18:26Z] REBUILD ADJUDICATED AND RULED OUT — both containers already run current code.\n"
+ "  pdf-extractor image built 2026-08-08T11:34:24Z; last commit touching apps/pdf-extractor/ = d808a6a11 2026-07-31.\n"
+ "  rag-service   image built 2026-08-08T08:10:53Z; last commit touching apps/rag-service/   = 99ed7c8b0 2026-08-07.\n"
+ "Both images POSTDATE their zone's HEAD, so the stale-image root cause "
+ "(feedback_mcp_server_stale_image_mem_leak_rebuild_fixes) is excluded at source: there is no undeployed fix for a "
+ "rebuild to deliver. A rebuild here would be a pure memory-meter reset that destroys trajectory evidence and "
+ "fixes nothing — that memory's own CORRECTION says rebuild is temporary mitigation, never a cure, and "
+ "feedback_restart_masks_bun_jit_corruption says do not reset the meter to relieve a reading. NO ops dispatch. "
+ "Architecture untouched — no consolidation was considered "
+ "(feedback_preserve_multi_container_microservice_architecture).";

# ===========================================================================
# WRITES
# ===========================================================================

# 1) Close both signal_queue rows: NEW -> triaged (PO-admitted extended status,
#    carries disposition/triaged_at/triaged_by per signal-dashboard SKILL § ACK/CLOSE).
.signal_queue.rows |= map(
  if .id == "sys-20260811T181604-0404" then
    . + { status: "triaged", disposition: _rag_disposition, triaged_at: _now, triaged_by: _by }
  elif .id == "sys-20260811T181602-0de9" then
    . + { status: "triaged", disposition: _pdfx_disposition, triaged_at: _now, triaged_by: _by }
  else . end
)

# 2) Corroborate the rag-service root-cause row. FOLD, no mint.
| .task_board.backlog |= map(
    if .id == "FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS" then
      . + {
        updated_at: _now,
        updated_by: _by,
        po_fold_20260811T1826Z: (
          "FOLD (po triage 2026-08-11T18:26Z) of signal_queue sys-20260811T181604-0404 (CRITICAL, 99.58% "
        + "BELOW-FLOOR zero reclamation). 4th A-30 rag-service fold in ~6h (12:12Z, 17:06Z, 18:16Z x1 + this). "
        + "NO NEW MINT, priority HELD at P2, next_agent HELD at architect.\n\n"
        + "STRONGEST EVIDENCE YET FOR THIS ROW AND FOR ITS DETECTOR SIBLING: for the first time the reclamation "
        + "event is timestamped in the container's own log BEFORE the signal that denies it — unload logged "
        + "18:15:48Z, signal written 18:16:04Z, 16 seconds later. Prior folds had to infer the dip from a "
        + "meter read 19min later; this one has the event itself.\n\n"
        + "Released ~196MiB of the ~400MiB model footprint (1019.5MiB@99.58% -> 823.3MiB@80.40%), squarely inside "
        + "this row's predicted ~180-210MiB retention. Mechanism UNCHANGED — nothing here widens this row's scope.\n\n"
        + _evidence + "\n\n" + _no_rebuild
        )
      }
    else . end
  )

# 3) PROMOTE the detector-calibration row backlog[] -> ready[] (status READY,
#    lane-coherent per LANE_ALLOWED_STATUSES.ready = {READY, TODO}).
#    CONVERGE, not a 5th fold: this row is fully specified (AC-1..AC-4, files[],
#    baseline_pass, verification_gate, supervised=false, plan_only=false,
#    next_agent=developer) and has sat in a 384-deep backlog[] for 3 days while
#    the FP it fixes re-fired ~4x in 6h. Nothing about it needs BA/architect
#    decomposition — it was in the wrong lane for its state of readiness.
| ( [ .task_board.backlog[]
      | select(.id == "FIX-AUDITOR-A30-SUSTAINED-WINDOW-SHORTER-THAN-TARGET-RECLAMATION-PERIOD") ] ) as $promote
| .task_board.backlog |= map(
    select(.id != "FIX-AUDITOR-A30-SUSTAINED-WINDOW-SHORTER-THAN-TARGET-RECLAMATION-PERIOD")
  )
| .task_board.ready += ( $promote | map(
    . + {
      status: "READY",
      updated_at: _now,
      updated_by: _by,
      status_note: (
        (.status_note // "")
      + "\n\n[po/triage-2026-08-11T18:26Z] PROMOTED backlog[] -> ready[] (BACKLOG -> READY). CONVERGE ACTION, "
      + "deliberately not a 5th fold — feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn's CONVERGE "
      + "threshold was crossed days ago and re-crossed ~4x in the last 6h. Row is already fully specified "
      + "(AC-1..AC-4, files[], baseline_pass, verification_gate, supervised=false, plan_only=false, "
      + "next_agent=developer) so it needs no BA/architect decomposition; leaving it in a 384-deep backlog[] "
      + "was the only thing keeping the churn alive.\n\n"
      + "FOLD of signal_queue sys-20260811T181604-0404 (CRITICAL rag-service) + sys-20260811T181602-0de9 "
      + "(WARN pdf-extractor), 2026-08-11T18:16Z, auditor Tier-1 c33. This tick supplies the SHARPEST "
      + "falsification this row has: the target container's reclamation event is timestamped in its own log "
      + "16 SECONDS BEFORE the signal that reports 'zero reclamation across all 6 probes' "
      + "(unload 18:15:48Z, emit 18:16:04Z, confirmed 80.40% at 18:19:39Z). Use it as the AC-2 matched-pair "
      + "fixture: rag-service = FP arm (must clear), pdf-extractor at 95.20% flat / CPU 0.15% in the SAME tick "
      + "= TP arm (must still escalate).\n\n"
      + "AC-3 GAINS A CONCRETE SECOND ARM FROM THIS TICK: the CRITICAL emit ALSO carried "
      + "'host headroom <40MiB BELOW-FLOOR' and let that floor gate BLOCK its own VmHWM probe. Live: docker VM "
      + "MemAvailable=2955536kB (2.82GiB), MemFree=1326672kB, macOS memory_pressure free 72% — the floor is "
      + "reading FREE PAGES as headroom. So the gate suppressed the one measurement (VmHWM vs VmRSS) that "
      + "refutes the verdict, and then emitted ESCALATE anyway instead of INCONCLUSIVE/UNDERSAMPLED. That is "
      + "the exact fail-loud arm AC-3 already specifies, now with a live instance: a blocked probe MUST "
      + "degrade the verdict, never pass through to CRITICAL.\n\n"
      + _evidence
      )
    }
  ) )

# 4) Corroborate the pdf-extractor REVIEW-lane row (TRUE positive). FOLD, no mint.
| .task_board.review |= map(
    if .id == "FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM" then
      . + {
        updated_at: _now,
        updated_by: _by,
        status_note: (
          (.status_note // "")
        + "\n\n[po/triage-2026-08-11T18:26Z] FOLD of signal_queue sys-20260811T181602-0de9 (system-auditor "
        + "Tier-1 c33, WARN, 'sustained 95%+ min 95.19 max 97.78, loss of reclamation, VmHWM 2587.6MB pinned'). "
        + "No new mint — this row owns it.\n\n"
        + "PO live re-verify 18:19-18:20Z: 2.38GiB/2.5GiB = 95.20% FLAT across 4 samples at CPU 0.15%. The idle "
        + "CPU is the load-bearing detail: this is steady-state occupancy with NO OCR job running, so it cannot "
        + "be dismissed as a burst artifact, and it corroborates the 17:06Z note asking whether the fix moves "
        + "the steady-state number rather than just the peak. It does not appear to.\n\n"
        + "SCORED AS THE TRUE POSITIVE of this tick's A-30 pair. rag-service (CRITICAL, same tick) was "
        + "dispositioned as a detector FP because its reclamation event is in its own log; pdf-extractor has no "
        + "such event and does not reclaim across the window. Direction taken deliberately per "
        + "feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip.\n\n"
        + "MEASUREMENT FOR THE REVIEW CLOSER, not adjudicated by PO: `docker exec "
        + "vn-market-intelligence-mcp-pdf-extractor-1 grep -rl malloc_trim /app` -> ZERO hits (/app confirmed "
        + "populated). This row's own root_cause template turns on an allocator page-return call and the "
        + "sibling rag-service row cites it as a ratified precedent. Confirm what actually shipped before "
        + "accepting.\n\n"
        + _evidence + "\n\n" + _no_rebuild
        )
      }
    else . end
  )
