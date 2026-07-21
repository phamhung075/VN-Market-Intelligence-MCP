# scripts/po-s148-signalqueue-cap-inbox-triage.jq
# PO triage 2026-07-21 (po-signalqueue-triage-20260721) — single atomic pass.
# Dispositions TWO HIGH cowork-team->po system-issue signals + applies sanctioned relief.
#
#   cow-20260721T144500 (DRAIN-ROUTING gap): unified-agent + alert-commander are in the
#     signal-dashboard receivers table but neither flow drains the queue -> MINT an
#     architect-owned PLAN-ONLY row (no existing row covers it; sibling of
#     FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT).
#   cow-20260721T145500 (CAPACITY/eviction gap): 'triaged' is absent from
#     TERMINAL_SIGNAL_STATUSES (scripts/orch-cold-evict.sh:87) so 144/152 rows are
#     permanently unevictable -> FOLD the eviction-side durable fix into the existing
#     signal_queue-hygiene omnibus row FIX-SIGNALQUEUE-DUP-ID-GUARD (no dup mint).
#
# IMMEDIATE RELIEF (sanctioned, conservation-safe): normalize aged(>24h) 'triaged'
#   signal rows -> 'RESOLVED' (canonical + evictable). This makes them drainable by the
#   ROUTINE orch-cold-evict.sh hook WITHOUT this PO action itself triggering the broad
#   multi-category (task/sprint) eviction under a concurrently-writing auditor. It is
#   count-preserving on signal_queue.rows (status flips only) -> passes orch-apply.sh
#   conservation with no ALLOW_SHRINK bypass. PRESERVES all NEW rows, all READ rows, and
#   all recent (<24h) triaged rows.
#
# NOTE the 200-row cap is SOFT: appendSignalQueueRow (orchStateStore.ts) prepends
#   unconditionally and SignalQueueSchema.rows is z.array(...) with NO .max — SKILL.md:104
#   "Max 200" is documentation only. No imminent append failure; the harm is hot-file bloat.
#
# Args: --arg now <iso8601 UTC>  --arg cutoff <iso8601 UTC = now-24h>
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   CUT=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" --arg cutoff "$CUT" -f scripts/po-s148-signalqueue-cap-inbox-triage.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Idempotent: guards fail-loud if the cow rows are missing, the fold target is missing,
#   or the mint id already exists.

# ---- guards (fail-loud; no partial application) ----
( [.signal_queue.rows[] | select(.id=="cow-20260721T144500")] | length ) as $n1
| ( [.signal_queue.rows[] | select(.id=="cow-20260721T145500")] | length ) as $n2
| ( [.task_board.backlog[] | select(.id=="FIX-SIGNALQUEUE-DUP-ID-GUARD")] | length ) as $nf
| ( [ .task_board.backlog[], .task_board.in_progress[], .task_board.review[], .task_board.qa[], .task_board.ready[] ]
      | map(select(.id=="FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT")) | length ) as $nm
| if $n1 != 1 then error("guard: cow-20260721T144500 not present exactly once") else . end
| if $n2 != 1 then error("guard: cow-20260721T145500 not present exactly once") else . end
| if $nf != 1 then error("guard: FIX-SIGNALQUEUE-DUP-ID-GUARD not in backlog") else . end
| if $nm != 0 then error("guard: FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT already exists - no dup mint") else . end

# ---- 1. signal_queue: aged-triaged relief + cow disposition (count-preserving) ----
| .signal_queue.rows |= map(
    if (.status=="triaged" and (.ts != null) and (.ts < $cutoff)) then
      .status="RESOLVED" | .resolved_by="po-signalqueue-triage-20260721" | .resolved_at=$now
    elif (.id=="cow-20260721T144500") then
      .status="READ" | .triaged_by="po" | .triaged_at=$now
      | .payload_ref="docs/signals/processed/cowork-team-20260721T144500-inbox-gap.json"
      | .backlog_task_id="FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT"
      | .origin_signal_id=.id
      | .triage_note="[po 2026-07-21] DRAIN-ROUTING gap VERIFIED: unified-agent + alert-commander in signal-dashboard receivers table but neither flow drains the queue. Minted FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT (architect). Casualty po-20260720T052606 LEFT NEW; its gold-predicate content tracked by SPIKE-CTG-FALSE-PRESENCE-BLINDSPOT."
    elif (.id=="cow-20260721T145500") then
      .status="READ" | .triaged_by="po" | .triaged_at=$now
      | .payload_ref="docs/signals/processed/cowork-team-20260721T145500-queue-cap.json"
      | .backlog_task_id="FIX-SIGNALQUEUE-DUP-ID-GUARD"
      | .origin_signal_id=.id
      | .triage_note="[po 2026-07-21] CAPACITY/eviction-gap VERIFIED: 'triaged' absent from TERMINAL_SIGNAL_STATUSES so 144 rows unevictable. Cap=200 is SOFT (no code enforcement) -> no imminent crash. Durable fix FOLDED into FIX-SIGNALQUEUE-DUP-ID-GUARD. RELIEF: aged(>24h) triaged->RESOLVED for routine cold-evict."
    elif (.id=="cow-20260721T151500") then
      # OUT-OF-SCOPE (MED) — repair only the drain-dangled payload_ref (FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE);
      # leave status=NEW for the next PO triage cycle. Fixing it here unblocks this atomic write
      # (Stage 1c flagged all 3 relocated cowork payload files).
      .payload_ref="docs/signals/processed/cowork-team-20260721T151500-snapshot-promotion-rootcause.json"
    else . end
  )
| .signal_queue.last_triaged_at=$now
| .signal_queue.last_triaged_by="po-signalqueue-triage-20260721"
| .signal_queue._updated_at=$now
| .signal_queue._updated_by="po-signalqueue-triage-20260721"

# ---- 2. FOLD eviction-side durable fix into FIX-SIGNALQUEUE-DUP-ID-GUARD ----
| .task_board.backlog |= map(
    if .id=="FIX-SIGNALQUEUE-DUP-ID-GUARD" then
      .scope_extension_20260721b = "SCOPE FOLD (PO po-signalqueue-triage-20260721, dispositioning cow-20260721T145500 CAPACITY): cold-eviction cannot relieve signal_queue because the dominant live terminal status 'triaged' (144/152) is absent from TERMINAL_SIGNAL_STATUSES (scripts/orch-cold-evict.sh:87) AND from the signal-dashboard SKILL PRUNE criteria. DURABLE FIX (architect/ba pick one): (a) stop writing the non-canonical 'triaged' status at PO-triage write time - write RESOLVED (canonical + evictable) per NEW->READ->RESOLVED, OR (b) add 'triaged' to TERMINAL_SIGNAL_STATUSES + SKILL PRUNE criteria. SECOND DEFECT: orch-cold-evict.sh signal-row predicate is STATUS-ONLY - it ignores the '24h older' age gate SKILL.md:90 documents, so it prematurely evicts fresh READ rows (breaks origin_signal_id auto-RESOLVE, P1-DETECTOR-CLOSURE-TASK-ARCHIVE); reconcile doc-vs-code by adding the age gate. CONTEXT: the 200-cap is SOFT - appendSignalQueueRow + SignalQueueSchema.rows enforce NO hard cap (SKILL.md:104 doc-only), so no imminent append failure, only hot-file bloat. Complements this row's existing collapse-to-single-row (growth-side) fold. IMMEDIATE RELIEF already applied 2026-07-21: aged(>24h) triaged rows normalized -> RESOLVED for the routine cold-evict hook."
    else . end
  )

# ---- 3. MINT architect row for cow-20260721T144500 (drain-routing gap) ----
| .task_board.backlog += [ {
    id: "FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT",
    title: "PLAN-ONLY: signal-dashboard receivers-table lists unified-agent + alert-commander as valid 'to' targets but NEITHER flow has an inbox/signal-dashboard READ step -> rows addressed to them are structurally undeliverable (dark); spawn-fanout.md Step 5 spawn prompt carries no signal payload. Architect decide: (a) add inbox READ step to both flows, (b) make spawn-fanout deliver matched NEW rows, or (c) remove both from the receivers table.",
    status: "BACKLOG",
    owner: "po",
    zone: "cross-service/",
    next_agent: "architect",
    priority: "high",
    plan_only: true,
    created_at: $now,
    created_by: "po-signalqueue-triage-20260721",
    origin_signal_id: "cow-20260721T144500",
    sibling_of: "FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT",
    status_note: "AC: every receiver in .claude/skills/signal-dashboard/SKILL.md Receivers table either (1) has a live inbox drain step in its flow OR (2) is removed from the table - no 'to' value may be a structural no-op. Evidence: docs/signals/cowork-team-20260721T144500-inbox-gap.json. Live casualty: po-20260720T052606 (HIGH CHEF-L6-GOLD-FALSE-PREDICATE, to=unified-agent, dark 33h+, LEFT NEW deliberately). Sibling FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT covers the po->dev-team NEW/READ filter mismatch - design the full receiver-delivery contract together. The casualty's false gold predicate is separately tracked by SPIKE-CTG-FALSE-PRESENCE-BLINDSPOT."
  } ]
