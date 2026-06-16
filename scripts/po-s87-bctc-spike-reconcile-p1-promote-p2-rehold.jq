# po-s87-bctc-spike-reconcile-p1-promote-p2-rehold.jq
# Single-pass SPIKE-RECONCILE + DESIGN-UNGATE dispatch triage
# (2026-06-16 router async pipeline continuation — ARCH-BCTC-PIPELINE-DURABILITY
#  brief landed & RAW-verified at docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md):
#
#   M1 SPIKE-RECONCILE: relocate ARCH-BCTC-PIPELINE-DURABILITY in_progress[] -> done[]
#       (done_verified:false — a SPIKE is a design artifact: no rebuild, no QA-green;
#        the spun-out child FIXES are the verified work). Stamp done evidence =
#        brief path + the 4 contracts C1-C4 + the child->contract map. Vacates the
#        architect in_progress slot (0 coding-WIP was consumed by this SPIKE).
#       Idempotent: guarded by done[] membership (re-run relocates 0).
#
#   M2 PROMOTE the 2 P1 children (DESIGN-UNGATED) in-place in ready[]: clear the
#       "design-gated" hold_reason, stamp design_ungated_at + contract ref + the
#       brief-named target files + generic_mandate (/goal#2) + next_agent so the
#       router claims+spawns the coding lane. Both P1s route_to=dev-vps-crawls and
#       touch the SAME file (vps-scripts/discover-bctc-urls-browser.py) — they are
#       ONE coding lane (paired-resolve, brief Contract 4), so promoting both
#       consumes 1 coding WIP lane, not 2. WIP <= 2 honored (umbrella ARCH-CRON
#       is the design/sequencing umbrella ~0 active coder; this lane = 1).
#       Idempotent: guarded by design_ungated_at marker presence (re-run promotes 0).
#
#   M3 RE-HOLD the 2 P2 children in-place in ready[]: rewrite hold_reason from
#       "design-gated" to the real current reason ("queued behind WIP — P1s
#       dispatched first"); these are now design-ungated (contract ref stamped)
#       but WIP-deferred. Idempotent: guarded by wip_deferred marker presence.
#
#   M4 HEAD: set canonical top-level .head -> dispatch dev-vps-crawls for the
#       first P1 (FIX-HNX-SESSION-COOKIE), the immediate next coding lane
#       (single-head SSOT per docs/standards/orch-state-access.md §4).
#
# HARD-CONSTRAINT: FIX-BCTC-ENRICH-SILENT-0ROWS stays in review[] (C3, own gate),
#   the other umbrella in_progress row (ARCH-CRON-SCHEDULER-RELIABILITY) untouched,
#   all 4 review[] rows untouched, the 3 shared-root cowork holds untouched.
#
# Harness: CONSERVATION (in_progress -1, done +1, ready byte-stable in length
#   [M2/M3 are in-place field edits], review/backlog/done_verified byte-unchanged,
#   total unchanged) + PLACEMENT (ARCH row in done[] with done_verified:false +
#   brief evidence; both P1s in ready[] design-ungated+next_agent; both P2s in
#   ready[] wip_deferred; ENRICH-SILENT-0ROWS still in review[]; head -> dev-vps-crawls)
#   + IDEMPOTENCY re-run (delta 0).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s87-bctc-spike-reconcile-p1-promote-p2-rehold.jq \
#   docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> rename;
#  commit orch-state + brief by EXPLICIT PATHS; PUSH HELD — PO out-of-band call.)

(([.task_board.done[].id] | index("ARCH-BCTC-PIPELINE-DURABILITY")) != null) as $spike_done
| (.task_board.in_progress | map(select(.id == "ARCH-BCTC-PIPELINE-DURABILITY"))) as $spike_match

# brief-named target files per the child->contract map (carried into spec verbatim)
| {
    "FIX-HNX-SESSION-COOKIE": {
      contract: "C4 (ADF-brittleness monitoring) + co-located afrLoop hardening",
      files: ["vps-scripts/discover-bctc-urls-browser.py"],
      spec: "Add a prior session GET to the referrer URL before the stateless POST in _discover_hnx_upcom() (shared CookieJar) so HNX POST no longer 302->/Home/Error. CO-LOCATE (brief sub-risk A, RF-4): remove the hardcoded afrLoop fallback default \"27000000000000000\" from the prefix-agnostic regex fix — on regex-extract failure return [] (fail-loud-per-ticker), NOT a silent retry on a stale counter; verify the 'ViewState not found' guard stays intact so step2 never searches with a null loop value."
    },
    "FIX-SSC-C111-EMPTY-FALLBACK": {
      contract: "C4 (ADF-brittleness monitoring)",
      files: ["vps-scripts/discover-bctc-urls-browser.py"],
      spec: "In _ssc_parse_rows(): when c111 (doc summary, used for title matching) is empty for UPCOM/state filers (e.g. ACV), fall back to c3 for the period. Same file & dev cycle as FIX-HNX-SESSION-COOKIE — paired-resolve in ONE coding lane."
    },
    "FIX-BCTC-ZERO-URL-ALERT": {
      contract: "C1 (durable zero-result / freshness alerting)",
      files: ["apps/mcp-server/src/interface/scheduler/bctcQueueEnricherJob.ts"],
      spec: "Persist a consecutive-zero-URL cycle counter in SQLite (bctc_health_state OR existing KV table — dev decides). Increment when urlsPopulated=0 AND itemsProcessed>0; reset to 0 on any urlsPopulated>0; do NOT count itemsProcessed=0 (empty queue = legit idle). When counter>=2 during an active earnings window (>=1 queue row status IN ('pending','url_not_found')) fire ONE send_telegram(channel='bug'); dedup at most once/6h via last_alerted_at; re-arm only after urlsPopulated>0 then zero again. AGGREGATE across all tickers (partial success resets)."
    },
    "FIX-BCTC-FRESHNESS-GATE": {
      contract: "C2 (freshness health gate — last_success_age not passive liveness)",
      files: ["apps/mcp-server/src/domain/services/vpsHealthPoller.ts"],
      spec: "Replace passive:true for vn-bctc-fetch in DEFAULT_FRESHNESS_CONFIGS with active latestTimestampSql = SELECT MAX(last_attempt) FROM bctc_vps_queue WHERE status='done', maxAgeMs=24h. Add additive non-breaking earnings-window guard (earningsWindowOnly?/queueGuardSql? on FreshnessConfig): if queue COUNT(*) WHERE status IN ('pending','url_not_found','enrich_failed')=0 AND no 'done' rows in last 7d -> return 'idle' not 'unhealthy'. RF-1: guard must read BOTH done (freshness) AND pending/url_not_found (active queue) to tell off-season from wiped-queue."
    }
  } as $specs

| ($specs["FIX-HNX-SESSION-COOKIE"].contract) as $c4
# --- M1: SPIKE-RECONCILE in_progress -> done (idempotent) ---
| if $spike_done or ($spike_match | length) == 0 then .
  else
    .task_board.done += [
      $spike_match[0]
      + {
          status: "DONE",
          done_verified: false,
          done_at: $now,
          done_by: "po",
          done_evidence: "SPIKE delivered its design artifact: docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md (268L) enumerating 4 contracts C1 zero-result/freshness alerting, C2 freshness health gate, C3 enrich fail-loud, C4 ADF-brittleness monitoring + the child->contract map. A SPIKE is a design artifact (no rebuild, no QA-green) — the spun-out child FIXES are the verified work. baseline_pass satisfied.",
          done_verified_deferred_note: "SPIKE DoD = brief delivered; done_verified:false because the durable hardening is realized only when the child FIXES (C1/C2/C4 mcp+vps, C3 already review) ship + RAW-verify the recurrence class closed. Tracked via the children, not this design row."
        }
    ]
    | .task_board.in_progress |= map(select(.id != "ARCH-BCTC-PIPELINE-DURABILITY"))
  end

# --- M2: PROMOTE the 2 P1 children (design-ungated) in-place (idempotent) ---
| .task_board.ready |= map(
    if (.id == "FIX-HNX-SESSION-COOKIE" or .id == "FIX-SSC-C111-EMPTY-FALLBACK")
       and (.design_ungated_at == null) then
      . + {
        design_ungated_at: $now,
        design_ungated_by: "po",
        gated_brief: "docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md",
        contract: $specs[.id].contract,
        brief_files: $specs[.id].files,
        fix_spec: $specs[.id].spec,
        generic_mandate: "/goal#2: GENERIC — no per-ticker allowlist, no date literal, no exchange discriminator. The brief enforces row-level conditions only; the c3/cookie fallbacks apply to ANY filer/exchange.",
        coding_lane: "dev-vps-crawls#1 (paired: HNX-SESSION + SSC-C111 share vps-scripts/discover-bctc-urls-browser.py — ONE lane, 1 WIP)",
        hold_reason: null,
        held_by: null,
        held_on: null,
        next_agent: "dev-vps-crawls",
        promoted_at: $now,
        promoted_by: "po"
      }
    else . end
  )

# --- M3: RE-HOLD the 2 P2 children (design-ungated but WIP-deferred) in-place ---
| .task_board.ready |= map(
    if (.id == "FIX-BCTC-ZERO-URL-ALERT" or .id == "FIX-BCTC-FRESHNESS-GATE")
       and (.wip_deferred == null) then
      . + {
        design_ungated_at: $now,
        design_ungated_by: "po",
        gated_brief: "docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md",
        contract: $specs[.id].contract,
        brief_files: $specs[.id].files,
        fix_spec: $specs[.id].spec,
        generic_mandate: "/goal#2: GENERIC — aggregate counter / MAX(last_attempt) keyed, no ticker/date/exchange literal (brief Contract 1/2 invariant).",
        wip_deferred: true,
        hold_reason: "queued behind WIP — P1s dispatched first. Design-ungated (brief landed, contract+spec+files stamped) but held to honor WIP<=2 coding lanes: the dev-vps-crawls P1 pair is the active BCTC coding lane this tick. Promote to the router on the next dispatch tick once a coding lane frees (route_to=dev-mcp-server, both apps/mcp-server/).",
        held_by: "po",
        held_on: $now
      }
    else . end
  )

# --- M4: canonical head -> dispatch dev-vps-crawls for the first P1 ---
| .head = {
    status: "dispatch",
    updated_at: $now,
    updated_by: "po-s87",
    active_task_id: "FIX-HNX-SESSION-COOKIE",
    next_agent: "dev-vps-crawls",
    rebuild_required: false,
    note: ("PO 2026-06-16 SPIKE-RECONCILE + DESIGN-UNGATE: ARCH-BCTC-PIPELINE-DURABILITY done (brief landed, 4 contracts). Dispatching the P1 dev-vps-crawls coding lane = FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK (paired, same file vps-scripts/discover-bctc-urls-browser.py, C4, 1 WIP lane). Brief: docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md. P2s (ZERO-URL-ALERT C1 + FRESHNESS-GATE C2, dev-mcp-server) re-held wip_deferred behind WIP<=2. ENRICH-SILENT-0ROWS stays review (C3 own gate). PUSH held — PO out-of-band; branch ahead12/behind24 benign cloud divergence.")
  }

# --- metadata bump ---
| .task_board.updated_at = $now
| .task_board.updated_by = "po"
