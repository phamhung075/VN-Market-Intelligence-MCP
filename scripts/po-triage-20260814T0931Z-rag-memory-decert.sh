#!/usr/bin/env bash
# PO board correction — rag-service memory incident class, 2026-08-14
# De-certify FU-RAG-DEPLOY-MEMORY, void the contaminated durability window,
# put the leak root-cause row on the critical path, raise the verification bar.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# IDEMPOTENCE GUARD (dev-standards § Script Persistence): this transform MOVES
# FU-RAG-DEPLOY-MEMORY out of done_verified[]. Re-running after it has landed
# would dereference a null row. Exit 0 (no-op) if already applied.
if ! jq -e '[.task_board.done_verified[].id] | index("FU-RAG-DEPLOY-MEMORY")' \
      docs/data/orch/orch-state.json >/dev/null 2>&1; then
  echo "[po-rag-memory-decert] already applied — FU-RAG-DEPLOY-MEMORY not in done_verified[]; no-op."
  exit 0
fi

NOW="$1"

LIVE="FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED"
LEAK="FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS"
GATE="FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW"

read -r -d '' RETRACT <<'EOF' || true
[po RULING 2026-08-14T09:27Z — DURABILITY CLAIM RETRACTED, ROW DE-CERTIFIED, MOVED done_verified[] -> review[] AT BLOCKED]
WHAT STANDS (not disputed, do NOT re-do): the artifact this row delivered — commit 2f835ec63, docker-compose.yml rag-service deploy.resources.limits.memory 768m->1g / reservations 256m->512m — is real, is on main, and is LIVE right now (po RAW-verified 2026-08-14T09:23Z: docker inspect HostConfig.Memory=1073741824). The architect's option-(a) raise-the-cap decision and the deploy codification are DONE and are NOT re-opened by this retraction.
WHAT IS RETRACTED: this row's status_note claim "OOMKilled=false, ExitCode=0, RestartCount=0 continuously since the commit landed ... zero OOM recurrence on the raised cap". FALSIFIED by kernel evidence. dmesg read INSIDE the Docker Desktop VM shows three real memcg OOM-kills of the rag-service cgroup ON THE RAISED 1GiB CAP: 2026-08-12T13:46:51Z, 2026-08-12T14:00:57Z (invoker lancedb-tokio-w), 2026-08-13T09:20:09Z. The certification was built on `docker inspect .State.OOMKilled` + RestartCount, BOTH of which are documented false-negatives in this environment (Docker Desktop does not propagate the VM-boundary cgroup OOM; RestartCount is recreate-reset). The row therefore certified durability on the exact signal class that cannot observe the failure it was certifying the absence of.
COMPOUNDING GAP FOUND THIS TICK: this id is a member of RC_VERIF_GRANDFATHERED_IDS in apps/mcp-server/src/infrastructure/orchStateSchema.ts:536, so checkVerificationGate() never required a verification.raw_probe{} on it at all. It reached DONE_VERIFIED exempt from the live-re-probe gate. A grandfather exemption on a row whose certification has since been falsified is itself a defect — filed as an AC extension on FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW.
WHY BLOCKED IN review[] AND NOT IN_PROGRESS: reverting to IN_PROGRESS would falsely assert the cap raise is un-delivered and would re-open a resident-set decision that was correctly made. The harm this row actually causes is different and narrower: while it sat terminal in done_verified[] it was (1) invisible to every lane-scoped dedup scan (backlog/ready/in_progress/review/qa only) and (2) cold-evictable, yet (3) still readable by the system-auditor as "rag-service memory = closed", which is what manufactured the 2026-08-14T08:57Z STALE-ACK "benign warm-up" verdict at 84.85% and the sys-20260814T062025-0123 disposition. Non-terminal BLOCKED in review[] fixes all three at once. Same treatment, same reasoning, same tick-family as the sibling precedent OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (restored cold->hot at BLOCKED by po 2026-08-14T06:58:58Z, commit c8c360f21).
FORWARD POINTER — READ THIS BEFORE DISPOSITIONING ANY rag-service MEMORY SIGNAL: this row is PRIOR ART ONLY. It is NOT a valid dedup/FOLD/STALE-ACK target for a live memory reading, and its DONE_VERIFIED status must never again be cited as evidence that rag-service memory is resolved. The live tracking rows are FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED (deployed fix under test) and FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (the unbounded leak, critical path). Attach all new evidence THERE, never here. Do NOT re-diagnose from this row and do NOT mint a further tracking row — parallel measurement of this same metric across sibling rows is what already produced five consecutive no-op folds.
EOF

read -r -d '' BLOCKREASON <<'EOF' || true
De-certified 2026-08-14T09:27Z: the durability half of this row's DONE_VERIFIED ("zero OOM recurrence on the raised cap") is falsified by three in-VM dmesg memcg OOM-kills on the raised 1GiB cap (2026-08-12T13:46:51Z, 2026-08-12T14:00:57Z, 2026-08-13T09:20:09Z). Blocked pending the actual unbounded-growth root cause, owned by FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS. No work is requested ON this row — it is held non-terminal purely so it stays visible to lane-scoped dedup and can never again be read as a closed matter.
EOF

read -r -d '' VERIFYNOTE <<'EOF' || true
UN-BLOCK CONDITION (single, do not widen): FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS reaches DONE_VERIFIED under RAG-MEM-DURABILITY-BAR v2 (D1-D4, recorded on FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED). At that point this row may be re-closed as DONE_VERIFIED with a verification.raw_probe{} attached — do NOT re-close on the grandfather exemption. Nothing else un-blocks it. Do NOT re-run this row's own original AC (cap raise applied): po RAW-verified it live at 2026-08-14T09:23Z and it holds; re-measuring it is one of the no-op folds this incident keeps generating.
EOF

read -r -d '' WINDOWVOID <<'EOF' || true
[po RULING 2026-08-14T09:27Z — DURABILITY WINDOW VOID, NOT MERELY RESET. Certification cannot proceed; do NOT come back at 2026-08-15T08:41:48Z expecting to certify.]
FACTS, po RAW-verified on the host at 2026-08-14T09:23-09:24Z (docker ps / docker stats --no-stream / docker inspect), not relayed:
 (a) The container this row's window was opened on — 632080976c9bbb45 on image sha256:4a955869f002 — was RESTARTED at 2026-08-14T09:23:21.675Z. State.StartedAt moved 08:41:48Z -> 09:23:21Z; container id and image are UNCHANGED (docker restart, not recreate), RestartCount still 0. Memory read seconds later: 34.54MiB/1GiB = 3.37%, i.e. cold. The restart was a deliberate preemptive ops mitigation dispatched by the router to avoid an uncontrolled OOMKill — correct as a stopgap, fatal to this window.
 (b) BEFORE that restart, on the SAME post-fix image from a genuinely cold start at 08:41:48Z, with RestartCount=0 and NO restart boundary anywhere in the series, memory climbed MONOTONICALLY: 84.85% @08:57Z (+15.2min) -> 86.11% @09:13Z (+31.2min) -> 89.18% @09:21Z (+39.2min). Segment rates 0.08 -> 0.16 -> 0.38 pp/min: monotonic AND accelerating, ~4.3pp gained in 24 minutes, tracking to the 1GiB ceiling inside ~30-45 further minutes. The 09:21Z 89.18% point was independently RAW-verified by the router via live docker stats/inspect.
WHY THE WINDOW IS VOID RATHER THAN RESTARTED: under RAG-MEM-DURABILITY-BAR v2 clause D4 a window is invalid if any mitigation (preemptive restart, cap raise, traffic throttle) was applied during it. Restarting a leaking process at 89% and then reporting "zero OOM in 24h" is a FALSE GREEN of exactly the same family as the `docker inspect .State.OOMKilled` false-negative this bar was written to replace: it measures the mitigation, not the fix. If this service needs a preemptive restart every ~40-80 minutes to stay alive, it CANNOT produce a valid 24h continuous-lifetime window, and that impossibility is itself the finding.
WHAT (b) MEANS FOR THIS ROW'S OWN FIX: commit 82216e291 (skip redundant vector-index rebuild on restart) is NECESSARY BUT INSUFFICIENT — the same verdict the thread-pin ca6d86869 earned before it. QA's code review of 82216e291 stands (sound, correctly targets the discriminated per-process-flag defect, tests+mypy verified in-image) and NO rework of that commit is requested. But the amplifier hypothesis — that the redundant rebuild was what drove the climb — is REFUTED by (b): the climb reproduces on the post-82216e291 image, from cold, with the rebuild demonstrably skipped. Per this row's own standing instruction, that returns the problem to dev-rag-service for further diagnosis; per that same instruction, do NOT re-patch blind and do NOT open a third tracking row. Evidence lives here; the diagnosis is owned by FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS, now blocked_by-linked from this row.
DISPOSITION: status stays QA (code has no defect requiring rework), qa_durability_certified stays false, window fields nulled + VOID, blocked_by = the leak row. This row CANNOT be certified until the leak row closes. Any agent that flips it DONE/DONE_VERIFIED before then is fabricating a certification.
EOF

read -r -d '' BARV2 <<'EOF' || true
[po RULING 2026-08-14T09:27Z] RAG-MEM-DURABILITY-BAR v2 — binding on EVERY rag-service memory row (this row, FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS, FU-RAG-DEPLOY-MEMORY, OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX). SUPERSEDES the v1 bar in po_crossref_20260814T0700Z, which was necessary but gameable.
RATIONALE FOR RAISING IT AGAIN: this is the THIRD consecutive "fix landed -> marked DONE_VERIFIED -> recurred within hours" cycle on one incident. 1) thread-pin ca6d86869 -> OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX certified DONE_VERIFIED 2026-08-12T12:46:40Z -> kernel OOM at +1h00m, +1h14m, +20h34m. 2) cap raise 2f835ec63 -> FU-RAG-DEPLOY-MEMORY certified DONE_VERIFIED 2026-08-08T10:59:52Z -> three kernel OOMs on the raised cap. 3) skip-rebuild 82216e291 -> STALE-ACK'd benign at 08:57Z on a single 84.85% post-restart reading -> monotonic accelerating climb to 89.18% within 24 minutes. Each closure was defeated by the same structural flaw: a NEGATIVE criterion (no crash observed yet) evaluated over a window shorter than the failure's own period, on a signal that cannot see the failure. v2 adds a POSITIVE criterion and closes the two laundering paths.
D1 SIGNAL (carried from v1, unchanged): >= 24h wall-clock with ZERO `oom_memcg` dmesg events for the rag-service cgroup, read INSIDE the Docker Desktop VM (nsenter). NEVER `docker inspect .State.OOMKilled`, NEVER `.State.ExitCode`, NEVER RestartCount — all three are proven false-negatives here.
D2 CONTINUOUS LIFETIME (new): the window must span ONE unbroken container lifetime. Any restart or recreate — INCLUDING a preemptive ops mitigation restart — resets it to zero. Evidence must cite `docker inspect .State.StartedAt` at window OPEN and the identical value at window CLOSE. A window whose StartedAt moved is not a short window, it is no window.
D3 POSITIVE PLATEAU (new — this is the actual fix criterion, D1 alone can never establish one): >= 6 memory samples spread across the window; fit the growth rate over the final 12h. PASS requires BOTH rate <= 0.02 pp/min AND final reading <= 85% of the cap. A run that ends at 95% having merely not died yet is a FAIL. "Did not OOM" is not "bounded" — the whole incident history above is the proof.
D4 NO-MITIGATION (new): the window is INVALID if any preemptive restart, cap raise, traffic throttle, or manual memory intervention was applied during it. Mitigation windows and certification windows are mutually exclusive. If the service cannot survive the window unassisted, report that as the finding — never launder it into a green.
D5 EVIDENCE SHAPE (new, process): the certifying agent MUST write onto the row it closes — `durability_window_started_at` (= .State.StartedAt), `durability_window_container_id`, `durability_window_ended_at`, `durability_samples[]` (>=6 {ts, mem_pct}), `durability_growth_pp_per_min`, and the verbatim in-VM dmesg query used. A prose assertion without those six fields is NOT a certification and any lane move it justifies is void. This also satisfies the schema's verification.raw_probe{} requirement — never close a rag-service memory row via a RC_VERIF_GRANDFATHERED_IDS exemption.
EOF

read -r -d '' LEAKRULING <<'EOF' || true
[po RULING 2026-08-14T09:27Z — THIS ROW IS NOW THE CRITICAL PATH FOR THE WHOLE rag-service MEMORY INCIDENT. P0 stands. next_agent=dev-rag-service stands. Route here, not to another mitigation.]
NEW EVIDENCE — the cleanest dataset this incident has ever produced, and it CONFIRMS this row's own PO premise-correction of 2026-08-12T03:03:00Z ("a bounded allocator retention is flat after the first unload; this is monotonic growth from a cold process, so there is a SECOND, UNBOUNDED growth source"). Measured on the CURRENT post-fix image sha256:4a955869f002 (carries 82216e291 skip-redundant-vector-index-rebuild, content-verified in-container by QA), container 632080976c9bbb45, cold start 2026-08-14T08:41:48Z, RestartCount=0, NO restart boundary anywhere in the series — so none of the usual confounders apply and the crash-cliff/reclamation-dip misreading (feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip) is structurally excluded:
  +15.2min (08:57Z) = 84.85%   <- the reading a Tier-1 cycle STALE-ACK'd as "benign warm-up"
  +31.2min (09:13Z) = 86.11%   <- auditor-tier1-probe.sh FAILURE
  +39.2min (09:21Z) = 89.18%   <- independently RAW-verified by router via live docker stats/inspect
  segment rates 0.08 -> 0.16 -> 0.38 pp/min: MONOTONIC AND ACCELERATING. ~4.3pp in 24 minutes. Extrapolates to the 1GiB ceiling within ~30-45 further minutes; a preemptive ops restart was executed at 09:23:21Z to pre-empt an uncontrolled OOMKill (mitigation only, resets nothing about the defect).
WHAT THIS RULES OUT — do not spend another cycle on any of it: (i) restart-warmup / settling noise (RestartCount=0, single continuous lifetime, growth accelerating not decaying); (ii) stale image (content-hash verified by QA post-deploy); (iii) redundant vector-index rebuild as the driver (82216e291 is live and skipping correctly, climb reproduces anyway); (iv) lance-core thread oversubscription as the driver (ca6d86869 pin is effective-but-insufficient, discriminated in-container by dev-rag-service 2026-08-14T07:2xZ); (v) "just restart it" (RestartCount reached 12 on the prior container with the identical climb each time).
DIRECTIVE — NO MORE RESTART-TIMING OR DEPLOY-CONFIG TWEAKS. Three consecutive fixes (cap raise 2f835ec63, thread-pin ca6d86869, skip-rebuild 82216e291) all attacked the environment around the process and all failed within hours. The next change must come from an actual measurement of WHERE THE BYTES GO inside the running process. PO is not prescribing the tooling — that is dev-rag-service's call and the choice should be justified in the handoff — but the deliverable is a per-allocation-site attribution of the growth, from cold start, under live traffic, sufficient to name the retaining object graph. Ruling out the remaining candidates this row already lists (per-request embedder tensor/cache accumulation; LanceDB reader handles or version-dir mmaps held open per query; the FTS build path tracked by RAG-FTS-BUILD-MEMORY-BOUND) is in scope; guessing between them is not.
AC (supersedes the po-S157 phrasing on growth-rate alone): (1) a named retaining allocation site or object graph, evidenced by an in-process profile taken on the deployed image, NOT inferred from RSS deltas; (2) a fix targeting that site; (3) closure ONLY under RAG-MEM-DURABILITY-BAR v2 D1-D5 as recorded on FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED — in particular D3's POSITIVE plateau (<=0.02 pp/min over the final 12h AND <=85% of cap), because "no OOM observed" has now failed to predict this defect three times.
KNOWN CO-BLOCKER, still open, do not lose it: the QA CHANGES_REQUESTED from 2026-08-12T09:33Z stands — fastapi.testclient.TestClient cannot import in the deployed image (httpx/httpx2 undeclared in apps/rag-service/requirements.txt), which is why 11-12 tests fail in-image on every QA pass and why this zone cannot cleanly attest a suite. Bundle that requirements fix with this work; it is cheap and it unblocks honest test attestation for every future rag-service closure.
CROSS-REF: FU-RAG-DEPLOY-MEMORY was de-certified this tick (done_verified[] -> review[] at BLOCKED, blocked_by = THIS row) precisely so it can no longer be read as "rag-service memory is closed". FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED's durability window was VOIDED this tick and is blocked_by THIS row. Both are downstream of this row closing. This is the only rag-service memory row that should receive a dispatch.
EOF

read -r -d '' GATEEXT <<'EOF' || true
[po AC EXTENSION 2026-08-14T09:27Z — PRIORITY P1 -> P0, third recorded occurrence, and the v1 fix this row was minted to specify has now itself been shown gameable.]
This row was minted 2026-08-14T06:50Z against two gate defects (SIGNAL: docker inspect cannot see VM-boundary cgroup OOM; WINDOW: certification closed 60min before the first post-fix OOM). Both stand. Three further defects were evidenced live within the following 3 hours and MUST be folded into this row's AC — they are the same class and must not be split into new rows:
(3) RESTART LAUNDERING. A durability window measured across a preemptive mitigation restart reports zero OOM while the process leaks at an unchanged rate. Observed live: FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED's 24h window opened 2026-08-14T08:41:48Z was invalidated by an ops mitigation restart at 09:23:21Z, 42 minutes in. AC: OOM-class verification_gate must require ONE continuous container lifetime, evidenced by an unchanged `docker inspect .State.StartedAt` at both window open and close, and must declare the window INVALID (not merely reset) if any mitigation was applied during it.
(4) NEGATIVE-ONLY CRITERION. "No crash observed in window W" cannot establish boundedness and has now failed to predict this defect three consecutive times on one incident. AC: OOM-class gates must additionally require a POSITIVE plateau criterion — a fitted growth rate and an absolute ceiling headroom, both measured, both recorded on the row. A window ending at 95% of cap with zero OOM must FAIL.
(5) GRANDFATHER EXEMPTION ON A FALSIFIED ROW. apps/mcp-server/src/infrastructure/orchStateSchema.ts RC_VERIF_GRANDFATHERED_IDS (line ~536) exempts FU-RAG-DEPLOY-MEMORY from checkVerificationGate()'s verification.raw_probe{} requirement — so it reached DONE_VERIFIED with no live re-probe attached at all, and the exemption survived the falsification of its certification. AC: entries in RC_VERIF_GRANDFATHERED_IDS must be purged when the row's certification is retracted, and a retracted row must not be re-closable via the exemption. At minimum, add a guard that fails validation if a grandfathered id is set back to DONE_VERIFIED after having carried a retraction marker.
BINDING INTERIM: until this row ships, RAG-MEM-DURABILITY-BAR v2 (D1-D5, recorded verbatim on FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED as po_RAG_MEM_DURABILITY_BAR_V2_20260814T0927Z) is the operative gate for every rag-service memory row. This row's job is to generalise D1-D5 into the qa flow + docs/standards so it binds fleet-wide on every OOM-class AC, not just rag-service.
EOF

jq \
  --arg now "$NOW" \
  --arg live "$LIVE" --arg leak "$LEAK" --arg gate "$GATE" \
  --arg retract "$RETRACT" --arg blockreason "$BLOCKREASON" --arg verifynote "$VERIFYNOTE" \
  --arg windowvoid "$WINDOWVOID" --arg barv2 "$BARV2" --arg leakruling "$LEAKRULING" --arg gateext "$GATEEXT" '

  # ---- A. FU-RAG-DEPLOY-MEMORY : done_verified[] -> review[] @ BLOCKED ----
  (.task_board.done_verified[] | select(.id=="FU-RAG-DEPLOY-MEMORY")) as $fu
  | .task_board.done_verified |= map(select(.id != "FU-RAG-DEPLOY-MEMORY"))
  | .task_board.review += [ $fu
      + { status: "BLOCKED",
          next_agent: "po",
          updated_at: $now,
          updated_by: "po",
          blocked_by: $leak,
          superseded_by: $live,
          related: [$live, $leak, "OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX", "UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL"],
          blocked_reason: $blockreason,
          verify_note: $verifynote,
          po_DECERTIFIED_20260814T0927Z: $retract,
          qa_certification_20260808T1059_RETRACTED: true,
          status_note: ($retract + "\n\n--- ORIGINAL (RETRACTED IN PART — durability claim only; the cap-raise delivery record below is still accurate) ---\n" + ($fu.status_note // "")) } ]

  # ---- B. FIX-RAG-LANCECORE... : void the contaminated window, record BAR v2 ----
  | .task_board.qa |= map(
      if .id == $live then
        . + { qa_durability_window_ends_at: null,
              qa_durability_window_status: "VOID",
              qa_durability_certified: false,
              blocked_by: $leak,
              updated_at: $now,
              updated_by: "po",
              po_WINDOW_VOIDED_20260814T0927Z: $windowvoid,
              po_RAG_MEM_DURABILITY_BAR_V2_20260814T0927Z: $barv2 }
      else . end)

  # ---- C. leak row -> critical path ----
  | .task_board.review |= map(
      if .id == $leak then
        . + { updated_at: $now,
              updated_by: "po",
              priority: "P0",
              next_agent: "dev-rag-service",
              related: (((.related // []) + [$live, "FU-RAG-DEPLOY-MEMORY"]) | unique),
              po_RULING_CRITICAL_PATH_20260814T0927Z: $leakruling }
      else . end)

  # ---- D. verification-gate row -> P0 + AC extension ----
  | .task_board.backlog |= map(
      if .id == $gate then
        . + { priority: "P0",
              updated_at: $now,
              updated_by: "po",
              po_AC_EXTENSION_20260814T0927Z: $gateext }
      else . end)

  # ---- E. signal_queue dispositions ----
  | .signal_queue.rows |= map(
      if .id == "sys-20260814T092039-48d2" then
        . + { status: "triaged", triaged_at: $now, triaged_by: "po",
              disposition: ("FOLD onto " + $leak + " (P0, critical path) — NOT benign, NOT warm-up. Confirmed by po RAW re-verify 2026-08-14T09:23Z: monotonic accelerating climb 84.85%(+15min) -> 86.11%(+31min) -> 89.18%(+39min) on a single continuous container lifetime, RestartCount=0, post-82216e291 image. Skip-rebuild fix is necessary-but-insufficient; amplifier hypothesis refuted. Ops executed a preemptive restart 09:23:21Z (mitigation only). FU-RAG-DEPLOY-MEMORY de-certified this tick so it can no longer be STALE-ACK'"'"'d as closed. No new row minted (3rd/4th tracking row is forbidden on this incident).") }
      elif .id == "sys-20260814T062025-0123" then
        . + { status: "triaged", triaged_at: $now, triaged_by: "po",
              disposition: ("FOLD onto " + $leak + ". This signal'"'"'s own hypothesis — \"suggests FU-RAG-DEPLOY-MEMORY incomplete\" — is CONFIRMED and actioned: FU-RAG-DEPLOY-MEMORY moved done_verified[] -> review[] at BLOCKED this tick, durability claim retracted on falsifying in-VM dmesg evidence. Correct call by the auditor.") }
      elif .id == "sys-20260814T034703-c8e2" then
        . + { status: "triaged", triaged_at: $now, triaged_by: "po",
              disposition: ("FOLD onto " + $leak + ". The 94.68% -> 52.13% \"crash cliff\" is a container RESTART boundary, not reclamation and not a cliff in the A-30 sense — see feedback_a30_crashcliff_branch_fires_on_structurally_noncrash_drop. The actionable half is the 94.68% pre-drop reading, which is the same unbounded climb tracked on the leak row. No separate mint.") }
      else . end)

  | ._updated_at = $now
  | ._updated_by = "po"
' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
