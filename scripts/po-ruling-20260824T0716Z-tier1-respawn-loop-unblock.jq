# scripts/po-ruling-20260824T0716Z-tier1-respawn-loop-unblock.jq
#
# PO ruling 2026-08-24T07:16Z — Tier-1 auditor self-respawn loop.
# Router asked for (a) ack pdf-extractor / (b) raise its cap / (c) other.
# RULING = (c), and the (c) row ALREADY EXISTS (minted by the 04:00Z PO
# ruling): FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-
# EVERY-TICK. The loop persisted because NOTHING ROUTED IT, and the reason
# nothing routed it is mechanical: `.head` has been non-idle and stale since
# 2026-08-24T04:27:01Z, and every dispatch picker (BOUNDED-1 / SLS / RLC /
# DRS / QA-Drain) plus Step 1 PO triage runs ONLY on the head-idle
# fall-through. The debounce row was minted at 04:01:33Z and the head froze
# 26 minutes later, before DRS ever got a turn.
#
# Writes (5 mutations, 0 mints, 0 deletes — row counts conserved):
#   1. .head            -> idle reset (row it pinned moved to qa[] at 04:43:36Z)
#   2. FOLD-VERDICT row -> P1->P0 + ruling note
#   3. signal row 8f4a  -> ts de-backdated, status triaged, disposition
#   4. CLEAN-STALE-WORKTREE-... -> depends on the SALVAGE row (destructive-
#      before-salvage sequencing hazard)
#   5. CLEAN-SALVAGE-... -> P1->P0 ; FIX-BCTC-NONBANK-... -> depends on it
#
# Usage: jq -f scripts/po-ruling-20260824T0716Z-tier1-respawn-loop-unblock.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def now: "2026-08-24T07:16:00Z";

# ── 1. head: idle reset ──────────────────────────────────────────────────
.head = {
  status: "idle",
  updated_at: now,
  updated_by: "po (ruling-20260824T0716Z stale-head unpin)",
  active_task_id: null,
  next_agent: null
}

# ── 2. the (c) row: expedite ─────────────────────────────────────────────
| .task_board.backlog = (.task_board.backlog | map(
    if .id == "FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK"
    then . + {
      priority: "P0",
      updated_by: "po (ruling-20260824T0716Z)",
      po_ruling_20260824T0716Z: "RE-RULED AND EXPEDITED P1->P0. Router re-opened options (a) ack pdf-extractor in .acked_memory / (b) raise its 2.5GiB cap / (c) other. (a) and (b) REFUSED AGAIN, on evidence the router brief did not carry. (a): the brief's premise -- 'headroom far above MEM_FLOOR_MIB=40' -- is a WRONG-PLANE artifact. docker stats MemPerc subtracts inactive_file, and _mem_headroom_mib() computes cap*(100-MemPerc)/100, so it reads ~335MiB free where this cgroup's own memory.current sat at 99.85% of memory.max (true free 1.5-3.7MiB, memory.peak == memory.max EXACTLY; 6 read-only samples, PO 04:0xZ). The MEM_FLOOR_MIB=40 guard therefore CANNOT EVER FIRE for this container -- an ack here would be unbounded in precisely the way FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY was minted to prevent. A per-entry floor_mib is also unimplementable: _check_mem_creep builds its ack list as a TWO-FIELD tsv (container, tracked_by), so the field would be read by nothing. And the probe's own _mem_container_acked header PRE-REFUSES this exact ack in writing. (b): cap is already 2684354560B = 2.5GiB, second-largest on the host; live per-container caps sum to 13.5GiB against 7.75GiB of host RAM (mcp-gateway's uncapped MemPerc denominator) = 1.74x overcommit, with a documented host-memory-panic history. Raising it would also move FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM's AC-4 goalpost (a percent-OF-CAP bar) -- turning a FAILED acceptance criterion into a passing one by changing the denominator, i.e. metric-masking. WHY THIS ROW DID NOT SHIP IN THE 3h SINCE IT WAS MINTED: not priority, not eligibility. It is DRS-ELIGIBLE (verified live: bounded1-supervised-lane-report.sh DRS-ELIGIBLE, 102 rows, next_agent=architect is on the ratified allowlist). It never got a turn because `.head` froze non-idle at 2026-08-24T04:27:01Z -- 26 minutes after this row was minted -- and BOUNDED-1/SLS/RLC/DRS/QA-Drain/Step-1 ALL run only on the head-idle fall-through. Head is unpinned to idle in this same write. DRS ranks by priority_rank then backlog[] index; at P1/index 502 this row sat behind 55 P1s, hence P0."
    }
    else . end
  ))

# ── 4+5. worktree sequencing hazard ──────────────────────────────────────
| .task_board.backlog = (.task_board.backlog | map(
    if .id == "CLEAN-STALE-WORKTREE-AGENT-AE9ED2CD-FULLY-MERGED-3D-IDLE"
    then . + {
      depends: ["CLEAN-SALVAGE-ORPHANED-WORKTREE-AE9ED2CD-BCTC-SCALARS-231-INSERTIONS"],
      depends_on: ["CLEAN-SALVAGE-ORPHANED-WORKTREE-AE9ED2CD-BCTC-SCALARS-231-INSERTIONS"],
      updated_by: "po (ruling-20260824T0716Z)",
      po_sequencing_guard_20260824T0716Z: "DESTRUCTIVE-BEFORE-SALVAGE HAZARD, closed by making the ordering machine-readable instead of prose-only. This row's title ('0 unmerged commits, tip is an ancestor of main, idle since 2026-08-12T17:12Z') is TRUE ABOUT THE BRANCH and FALSE-BY-OMISSION ABOUT THE TREE: re-verified live 2026-08-24T07:1xZ, the worktree is DIRTY -- 6 modified tracked files + 1 untracked file that exists NOWHERE on main (apps/mcp-server/src/__tests__/FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG.test.ts), 231 insertions / 28 deletions total. Every merge probe reports 'done' because the BRANCH is an ancestor of main; `git worktree prune` will not reap it because the DIRECTORY still exists. Executing this cleanup first destroys 12 days of production code. depends[] now points at the salvage row so no picker can order them wrong."
    }
    elif .id == "CLEAN-SALVAGE-ORPHANED-WORKTREE-AE9ED2CD-BCTC-SCALARS-231-INSERTIONS"
    then . + {
      priority: "P0",
      updated_by: "po (ruling-20260824T0716Z)",
      po_expedite_20260824T0716Z: "P1->P0. Now gates TWO other rows: CLEAN-STALE-WORKTREE-AGENT-AE9ED2CD-FULLY-MERGED-3D-IDLE (would delete the salvage target) and FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG (ready[], would re-implement work that already exists but is invisible from the main tree). 2nd occurrence of this pattern in 12 days. Re-verified live 2026-08-24T07:1xZ: worktree present, branch worktree-agent-ae9ed2cd6f04b3686 at 4a6d2174c, 231 insertions uncommitted."
    }
    else . end
  ))

| .task_board.ready = (.task_board.ready | map(
    if .id == "FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG"
    then . + {
      depends: ["CLEAN-SALVAGE-ORPHANED-WORKTREE-AE9ED2CD-BCTC-SCALARS-231-INSERTIONS"],
      depends_on: ["CLEAN-SALVAGE-ORPHANED-WORKTREE-AE9ED2CD-BCTC-SCALARS-231-INSERTIONS"],
      updated_by: "po (ruling-20260824T0716Z)",
      po_duplicate_work_guard_20260824T0716Z: "DEPS-GATED to stop a re-implementation. An implementation of this row already exists, uncommitted, inside the orphaned worktree .claude/worktrees/agent-ae9ed2cd6f04b3686 -- including a dedicated test file named after this row's own id that exists nowhere on main. It is invisible to every probe run from the main tree, so the next picker would rewrite it from scratch. depends[] resolves to a live BACKLOG row (not dangling): pickers conservative-skip until the salvage lands DONE_VERIFIED, at which point this row is re-adjudicated against the recovered diff rather than started fresh."
    }
    else . end
  ))

# ── 3. the concurrent auditor's signal row ───────────────────────────────
| .signal_queue.rows = (.signal_queue.rows | map(
    if .id == "sys-20260824T0130-pdf-mem-loop-8f4a"
    then . + {
      ts: "2026-08-24T07:10:00Z",
      ts_original_backdated: "2026-08-24T01:30:00Z",
      ts_correction_note: "ts was backdated 5h40m by the emitting system-auditor (exact :30:00 boundary = a fabricated/rounded value, not a clock read). Real mint window 2026-08-24T07:10Z, corrected here by po. The id string still embeds the WRONG value (sys-20260824T0130-...) and is deliberately left alone so existing references resolve -- the id's embedded timestamp is NOT a clock fact, read ts. Matters because the 7-day prune ages on ts: the backdate silently burned 5h40m of this row's age budget.",
      status: "triaged",
      triaged_by: "po (ruling-20260824T0716Z)",
      triaged_at: "2026-08-24T07:16:00Z",
      disposition: "ACCEPTED-WITH-CORRECTIONS. Measurement and routing correct; two payload claims are not. (i) payload.issue.root_cause says pdf-extractor's absence from .acked_memory is the 'sole cause of breach' -- it is the sole cause of the FAILURE VERDICT, not of the breach; the breach is real (FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM shipped and idles at 85-87% against its own AC-4 bar of <=80% of cap). (ii) payload.issue.evidence says 'no backlog row' -- FALSE: FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK has tracked exactly this loop since 2026-08-24T04:01:33Z, and FIX-AUDITOR-TIER1-MEMACK-HEADROOM-COMPUTED-FROM-MEMPERC-NETS-OUT-PAGE-CACHE tracks the headroom-plane defect. payload.action_required ('ack the entry or raise the cap') offers only the two options PO refused at 04:00Z and refuses again here -- see po_ruling_20260824T0716Z on the FOLD-VERDICT row for the full reasoning. Resolution: no ack, no cap change; the FOLD-VERDICT row is expedited to P0 and `.head` unpinned in this same write so it can finally be dispatched. _updated_by null on this row is the known signal_queue producer-auth gap, not a defect of this row."
    }
    else . end
  ))
