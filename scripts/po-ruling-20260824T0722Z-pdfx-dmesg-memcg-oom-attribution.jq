# scripts/po-ruling-20260824T0722Z-pdfx-dmesg-memcg-oom-attribution.jq
#
# PO addendum 2026-08-24T07:22Z to ruling-20260824T0716Z.
# Router surfaced the qa[] prose claiming pdf-extractor sits at 97.0-99.25%
# of cap with memory.peak == memory.max, and pointed at the documented
# OOMKilled=false false-negative class. Ran the documented read-only nsenter
# dmesg recipe (from FU-RAG-DEPLOY-MEMORY's own status_note) rather than
# trusting docker inspect. IT FOUND REAL KILLS. This write records the
# attribution on the four rows it bears on. 4 mutations, 0 mints, 0 deletes.

def dmesg_evidence:
  "DMESG GROUND TRUTH, read 2026-08-24T07:18:59Z (docker run --rm --privileged --pid=host justincormack/nsenter1 -- the read-only recipe documented on FU-RAG-DEPLOY-MEMORY's status_note; it allocates in its OWN cgroup, never the target's). Ring buffer spans 2026-08-20T12:00:11Z..2026-08-24T07:18:58Z; VM clock confirmed UTC in the same call. NEGATIVE CONTROL non-vacuous: 942 hits for 'docker0' from the same pipeline. TWO REAL KERNEL MEMCG OOM KILLS, both on cgroup /docker/6ec27ac85c8e6a8026ea32086b09fe8496d74610d38d0918660bb0ccb3d9934c: (1) 2026-08-23T14:27:11Z 'oom-kill:constraint=CONSTRAINT_MEMCG ... task=python3,pid=8887' -> 'Memory cgroup out of memory: Killed process 8887 (python3) total-vm:4953540kB, anon-rss:2484996kB (2.37 GiB), file-rss:15304kB'; (2) 2026-08-23T14:58:52Z 'task=python3,pid=17002' -> 'Killed process 17002 (python3) total-vm:7871780kB, anon-rss:2468832kB (2.35 GiB), file-rss:76396kB'. Cgroup 6ec27ac85c8e no longer exists (docker inspect: no such object) -- it is the PREVIOUS pdf-extractor container, replaced by the current 2edf0c9c9905 at StartedAt 2026-08-23T15:44:17Z.";

# ── 1. the qa[] row whose two 'silent exits' these ARE ───────────────────
.task_board.qa = (.task_board.qa | map(
  if .id == "FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-DIVERGES-OS-TRUTH"
  then . + {
    updated_by: "po (ruling-20260824T0722Z)",
    po_correction_20260824T0722Z: ("TWO CORRECTIONS FROM PO, one conceded against me and one that closes this row's leading suspect. (1) I CONCEDE THE 429 FIGURE. My bounded1_revert_note of 2026-08-24T01:35:50Z asserted '22 HTTP 429s against 418 /extract posts in the last 10h'. dev-pdf-extractor re-measured the SAME window against the server access log and found 418 posts / 20 mismatch lines (both matching me) and ZERO true HTTP 429 status lines. That is a ground-truth read against the artifact that actually records response status; mine was not. THE 22 IS WITHDRAWN. What does NOT change: the P0 hold. It never rested on the 429 count -- the live defect signal is the 20 `ocr_gateway.inflight` mismatch lines, which both measurements agree on, and this row's own root-cause finding (held-span vs single-instant os_children sampling, every acquire released in a finally) stands. Scoring severity off a number I could not verify was the error; the disposition was not. (2) THE TWO 'SILENT ExitCode=0/OOMKilled=false EXITS' IN THIS ROW'S `desc` ARE NOT SILENT AND ARE NOT THIS ROW'S DEFECT. " + dmesg_evidence + " THE TIMESTAMPS MATCH THIS ROW'S OWN desc TO THE SECOND: desc names 14:27:10Z and 14:58:52Z; dmesg has memcg kills at 14:27:11Z and 14:58:52Z. They were kernel memory-cgroup OOM kills of python3 WORKER processes at ~2.35-2.37 GiB anon-rss against the 2.5 GiB cap. Docker sets .State.OOMKilled=true only when the container's MAIN pid is killed, so a killed CHILD leaves OOMKilled=false / ExitCode=0 / RestartCount=0 -- which is exactly what every prior probe reported and exactly the false-negative class already recorded on FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED. CONSEQUENCE FOR THIS ROW: `desc`'s 'This is the leading suspect for the two silent ... exits' is REFUTED -- ocr_gateway inflight accounting did not kill those extractions, the kernel did, and the 21 stranded reconcile-queue rows are OOM collateral. Scope this row to the bookkeeping mismatch only; the memory cause belongs to FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM, where this same evidence is now recorded.")
  }
  else . end
))

# ── 2. the row that owns the memory cause ────────────────────────────────
| .task_board.review = (.task_board.review | map(
  if .id == "FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM"
  then . + {
    updated_by: "po (ruling-20260824T0722Z)",
    po_burst_measurement_20260824T0722Z: ("THE MISSING SINGLE-ALLOCATION NUMBER NOW EXISTS, AND THIS ROW'S AC-4 IS FAILED ON HARD EVIDENCE, NOT ON AN IDLE PERCENTAGE. " + dmesg_evidence + " WHAT THIS DELIVERS: scripts/agents-flow/auditor-tier1-probe.sh's `_mem_container_acked` header states this row's burst profile is qualitatively '100s of MiB to ~1 GiB' but that 'no settled single-allocation number exists yet'. It does now: a single pdf-extractor python3 worker reached 2,484,996 kB anon-rss (2.37 GiB) and was killed by the kernel against a 2,684,354,560 B (2.5 GiB) cap. That is a MEASURED terminal allocation, from the kernel's own OOM report, not an inference. WHAT IT MEANS FOR AC-4 (bar: <=80% of cap): failed, and worse than the idle 85-87% reading suggested -- the container is not merely idling high, it has reached its hard ceiling and lost worker processes to the OOM killer inside the post-fix (malloc_trim) image. WHAT IT MEANS FOR THE PROBE: A-30's FOLD discriminator reads OOMKilled/RestartCount/VmHWM/MemPerc and is therefore BLIND to this by construction -- a killed CHILD leaves all four clean. The FOLD verdicts of 03:30Z and 06:39Z were not wrong about their inputs; their inputs cannot see this event class. WHAT IT DOES NOT SETTLE: whether the right remedy is bounding the per-job allocation (this row) or raising the cap (ops). PO position: NOT a cap raise as the primary remedy -- live per-container caps already sum to 13.5 GiB against 7.75 GiB of host RAM (1.74x overcommit, documented host-memory-panic history), so a container that can legitimately want 2.4 GiB for ONE OCR job needs the job bounded, with any cap change as a sized ops mitigation on top. Re-run the recipe above before any closure: the ring buffer rolls (a 2026-08-20T11:01Z pdf-extractor hit already aged out of it), so absence of hits is only provable for the buffer's live span.")
  }
  else . end
))

# ── 3. the ops measurement row this partially discharges ─────────────────
| .task_board.ready = (.task_board.ready | map(
  if .id == "UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT"
  then . + {
    priority: "P0",
    updated_by: "po (ruling-20260824T0722Z)",
    po_expedite_20260824T0722Z: "P1->P0. Two reasons. (i) It gates FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM, which is now evidenced as a LIVE crash source, not a headroom-hygiene item: two kernel memcg OOM kills of pdf-extractor worker processes on 2026-08-23 (14:27:11Z, 14:58:52Z, ~2.35-2.37 GiB anon-rss each) -- see po_burst_measurement_20260824T0722Z on that row for the full dmesg transcript and provenance. (ii) Its own burst-measurement half is now PARTIALLY DISCHARGED for free: the kernel OOM report supplies a measured terminal single-process allocation (2,484,996 kB anon-rss) that the probe's own source comment said did not exist. Ops still owns the SUSTAINED profile (what a normal OCR job costs, and whether 2.4 GiB is one pathological PDF or the routine ceiling) -- that is what remains. METHOD NOTE, USE IT: read kernel dmesg via the read-only nsenter recipe on FU-RAG-DEPLOY-MEMORY's status_note, NOT docker inspect. .State.OOMKilled is false whenever a CHILD process is the one killed, which is the case in both events here; every docker-plane probe run against this container has reported clean while the kernel was killing its workers."
  }
  else . end
))

# ── 4. strengthen the debounce row: the FAILURE is a TRUE POSITIVE ───────
| .task_board.backlog = (.task_board.backlog | map(
  if .id == "FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK"
  then . + {
    updated_by: "po (ruling-20260824T0722Z)",
    po_addendum_20260824T0722Z: "AC-3 IS NOW LOAD-BEARING, NOT DEFENSIVE — DO NOT SOFTEN IT. This row was written on the assumption that the mem_creep FAILURE it debounces is a correctly-folded benign condition whose only cost is the duplicate spawn. That assumption is now REFUTED IN THE SAFE DIRECTION: the FAILURE is a TRUE POSITIVE. Kernel dmesg (read 2026-08-24T07:18:59Z via the read-only nsenter recipe) shows two real CONSTRAINT_MEMCG OOM kills of pdf-extractor python3 workers on 2026-08-23 at 14:27:11Z and 14:58:52Z, ~2.37 and ~2.35 GiB anon-rss against the 2.5 GiB cap — full transcript on FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM's po_burst_measurement_20260824T0722Z. The A-30 discriminator cannot see them: it reads OOMKilled/RestartCount/VmHWM/MemPerc, and a killed CHILD process leaves every one of those clean. SO: implement AC-1/AC-2/AC-4/AC-5 exactly as written, and treat AC-3 ('THE VERDICT ITSELF MUST STAY RED') as the row's most important clause rather than boilerplate — this is a SPAWN debounce over a condition that is genuinely dangerous, not a way to stop hearing about a benign one. Any implementation that converts FOLD to ALL_GREEN, or that writes auditor-tier1-last-healthy.json on a FAILURE tick, would now silence a live crash source. The non_goals ban on resolving this via acked_memory[] is likewise reinforced, not merely restated: PO has refused that ack three times (04:00Z, 07:16Z, 07:22Z) and the dmesg evidence is why."
  }
  else . end
))
