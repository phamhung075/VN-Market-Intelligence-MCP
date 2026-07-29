# PO 2026-07-29T11:50Z — correct the stale headroom figure in the rag-service
# memory ACK and record the anon/file cgroup split.
#
# WHY THIS FILE EXISTS: docs/data/auditor-launchd-ack.json is what a future
# auditor reads to decide whether the rag-service suppression is still
# warranted. Its retarget_reason quoted 745.8 MiB / 11:19Z, which encodes
# 22.2 MiB of headroom. The live figure is ~756.8 MiB = ~11.2 MiB. The ledger
# overstated the remaining margin by ~2x on the one artifact whose whole job is
# to justify not alerting.
#
# NOT orch-state — the scripts/orch-apply.sh wrapper does not apply here.
# Caller does: jq -f this > tmp; [ -s tmp ]; jq empty tmp; mv tmp file.

.acked_memory |= map(
  if .container == "rag-service" then
    (.retarget_reason = (.retarget_reason
      | sub("re-measured 745\\.8 MiB at 11:19Z after ~199 index writes, i\\.e\\. flat, no leak";
            "re-measured 756.8 MiB at 11:47Z, i.e. a FIXED anonymous baseline that does not scale with request volume — see memory_split_20260729 below for the cgroup split that establishes this, and note the earlier wording here said 745.8 MiB / flat, which was a stale two-sample reading corrected the same tick")))
    + {
      "headroom_mib_at_ack_review": 11.2,
      "measured_at": "2026-07-29T11:47:44Z",
      "memory_split_20260729": "CGROUP anon/file SPLIT — this is the measurement that decides whether the suppressed condition is dangerous, so it lives here rather than only on the task rows. At the 10:12Z restart the cgroup read anon = 761716736 B (726.4 MiB) immediately pre-restart against ~767 MiB total usage, falling to anon = 32272384 B (30.8 MiB) immediately post-restart. ANON IS ~95% OF THE CGROUP; FILE-BACKED IS AT MOST ~40 MiB. CONSEQUENCE FOR ANYONE REVIEWING THIS SUPPRESSION: the memory is process-resident, NOT reclaimable page cache. There is no kernel reclaim that will rescue this container under pressure, and the ~11 MiB of headroom recorded above is genuinely all there is against a compaction burst documented at ~20 MiB. An earlier reading on the task rows argued the opposite (that a 786 MiB on-disk LanceDB corpus was filling the cgroup as file cache) — that is RETRACTED; 786 MiB on disk versus a 768 MiB cap is a numeric coincidence, not a mechanism, and the corpus is not resident here. PROVENANCE: the two anon figures are router-supplied and were NOT independently re-derived by PO — re-deriving requires reading the VM cgroup tree, and the only route available is a docker exec, which is what allocated inside this cgroup and SIGKILLed the container at 10:12Z (exec exit 137, RestartCount 21->22). DO NOT RE-RUN IT TO CONFIRM. It is independently corroborated in mechanism by a measurement already on FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP: cold RSS 50.7 MiB rising to 749.9 MiB after a SINGLE POST /index, with the model load logged 10:24:28.5Z-10:24:48.9Z — a 699 MiB step from one embed can only be anonymous heap.",
      "suppression_still_warranted": "YES as of 2026-07-29T11:50Z, and the reasoning is unchanged by the correction above: the condition is a known, tracked, steady-state consequence of a no-release-path model singleton, and removing this entry would flip Tier-1 to FAILURE every ~30min tick and re-spawn system-auditor ~48x/day to re-confirm it. BUT THE MARGIN IS THINNER THAN THIS LEDGER PREVIOUSLY IMPLIED and the suppression is currently unbounded in both directions: there is no absolute-headroom floor below which the ACK stops suppressing, and tracked_by is read by no code so the entry cannot self-expire. Both are tracked by FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY (backlog, P1). RE-REVIEW THIS ENTRY, do not assume it: if headroom falls below ~5 MiB, or RestartCount/day climbs above ~5 (it is 22 total over 13.8 days = 1.6/day, unmoved since 10:12:01Z), the suppression is no longer appropriate and the entry should be pulled even though its tracked_by row is still open."
    }
  else . end
)
