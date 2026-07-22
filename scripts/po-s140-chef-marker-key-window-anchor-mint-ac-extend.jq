# po-s140 — chef-evening double-publish triage (router intent chef-evening-double-publish, 2026-07-22T20:0xZ)
#
# Single-pass TRIPLE-mutation, idempotent:
#   M1  id-guarded MINT of 2 PLAN-ONLY rows -> .task_board.backlog[]:
#         FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR   (P0, the root cause: dedup KEY AGREEMENT)
#         FIX-CHEF-LOG-AGENT-WORK-MISSING     (P2, the observability gap that hid it)
#       Skipped if the id already sits in ANY task_board array lane.
#   M2  ANNOTATE-IN-PLACE the P0 umbrella UC-CCA-P3 with a key-agreement AC extension
#       (marker-guarded field, same convention as its existing
#        impact_enrichment_* / recurrence_* / abort_path_ac_extended_at stamps)
#       + append the new id to its .related[] if absent.
#       UC-CCA-P3 is NOT re-scoped, NOT re-prioritised, NOT promoted.
#   M3  ANNOTATE-IN-PLACE FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING with the
#       cycle_id-is-run-start-keyed caution (marker-guarded) so that row does not
#       re-ship the same divergence in a new field.
#
# Reusable pattern: "a recurring cluster recurred with a NEW, ORTHOGONAL root cause —
# mint the new root as a sibling (never fold-and-close into the umbrella), extend the
# umbrella's AC so it cannot close green while the new root survives, and inoculate the
# adjacent row that would otherwise re-introduce it".
#
# Lanes: mints go to backlog[] ONLY. ready[] is 41-deep (saturated) — promoting here
# would be lane noise, and this row MUST ship jointly with UC-CCA-P3 anyway.
#
# Atomic write is done by scripts/orch-apply.sh (Zod + dup-key + CAS-mtime + rename).
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s140-chef-marker-key-window-anchor-mint-ac-extend.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# --- existing ids across every task_board array lane (dedup guard) ---
([.task_board | to_entries[] | select(.value | type == "array") | .value[]
  | select(type == "object") | .id]) as $ids

| ("FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR") as $p0

# --- candidate mints ---
| ([
    {
      id: $p0,
      title: "PUBLISHED-MARKER KEY AGREEMENT — derive the dedup key from the scheduled UTC fire-window, never from a wall-clock date read (P0: chef-evening double-published 2026-07-22 19:56Z + 20:00Z on keys :2026-07-22 vs :2026-07-23 derived from ONE instant; the same defect will FALSELY SUPPRESS the 2026-07-23 19:45Z dish)",
      type: "FIX",
      size: "M",
      status: "BACKLOG",
      priority: "P0",
      zone: "cross-service/",
      owner: "po",
      next_agent: "architect",
      sprint: "COWORK-RELIABILITY",
      supervised: true,
      created_at: $now,
      created_by: "po-s140-chef-evening-double-publish-triage",
      related: ["UC-CCA-P3", "FIX-CHEF-PUBLISHED-MARKER-RELEASE", "FU-CHEF-MARKER-INFLOW", "FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING", "FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE", "DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS"],
      note: "ROOT CAUSE (RAW-verified 2026-07-22T20:00-20:10Z, router + po). chef-evening cron is `45 19 * * *` = 19:45 UTC = 02:45 VN of D+1 — cowork-schedule.json chef-evening.vn_description literally reads '02:45 VN next day (GMT+7)'. chef.md Step 0.5 L48 computes WORK_DATE = TZ=\"Asia/Ho_Chi_Minh\" date +%Y-%m-%d and L70 builds MARKER_KEY = published:<slot>:<WORK_DATE>. Because this slot fires AFTER VN midnight, the key straddles a date boundary: two peers reading the SAME wall-clock instant derive DIFFERENT keys. EVIDENCE — task_list_held(task_kind=cowork-slot) shows BOTH published:chef-evening:2026-07-22 (owner_client_session 9f4a6bfc-b001-4349-8a44-545f24c1b0ac, claimed_at 1784750141 = 19:55:41Z) AND published:chef-evening:2026-07-23 (owner_client_session ab870ed6-0502-4e49-811a-8e7c90aff1ef, claimed_at 1784750490 = 20:01:30Z) HELD SIMULTANEOUSLY, ttl_seconds 100800 each. Both runs therefore claimed successfully, both passed the gate, both published. Artifacts on disk, both dish_type=evening + quality_verdict=degraded, overlapping conviction VHM+VIC: docs/data/unified-agent-synthesis-2026-07-22-evening.json (date_vn 2026-07-22, timestamp_utc 19:56:15Z, EIB/VIC/VHM/VJC, regime risk-off) and docs/data/unified-agent-synthesis-2026-07-23-evening.json (date_vn 2026-07-23, timestamp_utc 20:00:37Z, VHM/VIC/VCB, regime carry-unwind-risk-off). NOTE the historical convention was the UTC/trading-day label — published:chef-evening:2026-07-21 was claimed 2026-07-21T19:51:10Z i.e. VN 07-22 — so the 19:55Z run followed PRECEDENT while the 20:01Z run followed the SPEC AS WRITTEN. Neither agent misbehaved. The spec is ambiguous exactly at the boundary it is supposed to defend.\n\nWHY THIS IS **NOT** UC-CCA-P3 — DO NOT FOLD AND CLOSE. UC-CCA-P3 fixes marker LIFECYCLE (claim timing + release immunity). Its design recommendation (early read-only probe + late task_claim immediately before send_telegram + never release) would NOT have prevented this incident: both peers would still compute DIFFERENT keys, both probes would read free, both late claims would succeed, both would publish. Key AGREEMENT is orthogonal to key LIFECYCLE. A mutex whose key depends on which timezone the reader happens to consult is not a mutex. If UC-CCA-P3 ships alone, this defect survives and the umbrella closes green — the recurring-detection-vs-recurring-FAILED-FIX class (feedback_recurring_detection_vs_recurring_failed_fix).\n\nPO RULING (product decision, po-owned, decided 2026-07-22 — DO NOT re-litigate; architect/ba own the HOW, not the WHAT). The dedup key and the human-readable date label are TWO DIFFERENT VALUES and MUST NOT be derived from one expression. chef.md L654 (CYCLE_DATE = WORK_DATE verbatim) deliberately couples them; that coupling IS the defect, not the fix — it was introduced by GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST to make the FILENAME deterministic and it silently made the MUTEX KEY timezone-dependent. (1) MUTEX KEY = window-anchored and timezone-free: derived from the scheduled cron fire-window expressed in UTC (shape e.g. published:<slot_id>:2026-07-22T19:45Z), NOT from any `date` call made by the executing agent. Two peers executing the same scheduled window MUST derive byte-identical keys with zero shared state beyond the cron expression. This is invariant to timezone, to VN/UTC midnight straddle, to DST, to host clock skew, and to run-start jitter within the window (19:55 vs 20:01). It needs NO trading-calendar lookup. NEVER put a trading-calendar / holiday lookup on the mutex path. (2) DISPLAY LABEL (metadata.date_vn, synthesis filename, prose) = the VN trading session the dish INFORMS. chef-evening fires after the prior VN close (08:00Z) and before the next VN open (02:00Z of D+1) and gates on macroIndicatorRefreshJob US macro data — it is a FORWARD preview; the slot's own dish_type is literally `evening_preview`. Therefore the correct label for a 19:45Z fire is the NEXT VN session = the VN wall date at fire time. Tonight's correct label is 2026-07-23; the 19:55Z run's date_vn=2026-07-22 is WRONG. Weekend/holiday note for ba: the cron is daily including weekends, so 'next VN session' is not the next calendar day on Fri/Sat/Sun fires — the LABEL MAY remain the plain VN wall date (simple, calendar-free); if a true session label is ever wanted it belongs in a SEPARATE display-only field and never in the key.\n\nCAUTION for architect/ba: metadata.cycle_id is NOT a ready-made substitute — today's two runs emitted cycle_id evening-2026-07-22T19:56:00Z and evening-2026-07-22T20:00:37Z, i.e. cycle_id is keyed to RUN-START and diverges exactly like WORK_DATE does. RECOMMENDED PLUMBING (non-binding): the cowork dispatcher ALREADY holds the canonical window value — the fire-election lock cron:cowork:2026-07-22T20:00Z carries payload.tick — so pass the tick DOWN to the spawned agent instead of having the agent re-derive it; DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS (tick-snapshot.md Step 4.7, already in ready[]) is the natural carrier. Deriving-at-the-leaf is what created this bug class.\n\nLIVE FORWARD HAZARD (self-healing — do NOT 'fix' it with lock surgery): published:chef-evening:2026-07-23 expires 2026-07-24T00:01:30Z, which is AFTER tomorrow's 2026-07-23T19:45Z fire. If tomorrow's run uses the UTC-date convention it derives :2026-07-23, finds it HELD, and SILENTLY SKIPS — a MISSED evening dish. If it uses the VN convention it derives :2026-07-24 and publishes. Tomorrow's outcome is a coin flip on which convention the spawned agent picks. So this ONE defect produces BOTH double-publish AND missed-publish. Both markers are deliberately LEFT IN PLACE: they are the evidence, and releasing published: markers is the known-wrong direction (feedback_chef_releases_published_marker_enables_peer_double_publish). Hazard self-clears 2026-07-24T00:01:30Z.\n\nAC: (1) two peers spawned for the SAME scheduled window derive byte-identical MARKER_KEY regardless of host timezone, of VN-vs-UTC midnight straddle, and of run-start offset within the window; (2) the key contains NO value obtained from a `date` call made by the executing agent; (3) mutex key and display label are SEPARATE named values with separate derivations, and no later step re-derives either; (4) chef-evening's synthesis date_vn + filename carry the NEXT-VN-session label per the PO ruling above; (5) the fix applies to ALL cowork published: gates (chef-morning/intraday/eod/evening, digest-daily, digest-sunday, fb, market-watcher, news-scout, tnb-audit) — not chef-evening alone; the same straddle hits ANY slot whose UTC fire hour maps across VN midnight, and single-fire slots carry a 100800s TTL that outlives the next window; (6) RAW-verify by executing two same-window runs: exactly ONE claim succeeds, exactly ONE synthesis artifact exists for the window, exactly ONE MARKET post is emitted.\n\nSEQUENCING: ships WITH UC-CCA-P3, not before and not after — lifecycle-without-key-agreement is defeated by divergent keys, key-agreement-without-lifecycle is defeated by leaked or released markers. architect should treat UC-CCA-P3 + this row as ONE design.\n\nRECURRENCE LEDGER (marker-gate cluster): 2026-07-02 x2 (chef-morning + chef-evening, release-after-publish), 07-03 (release-on-no-post remediation -> leak-on-silent-exit), 07-14 (chef-evening dup + date mislabel), 07-15 (MARKET ids 932+933; the dup published a FALSE ~29% index move), 07-16 (chef-eod abort-after-claim false tombstone), 07-17 (chef-eod 2nd false tombstone), 07-22 (THIS — key divergence, NEW root cause). 8th event, 3rd distinct root cause. Recurring-bug-escalation applies (feedback_recurring_bug_escalation): no further point-patches to Step 0.5 until this + UC-CCA-P3 land as one design.",
      verification_gate: "RAW, not prose: run two chef-evening peers against the SAME scheduled window -> task_list_held(task_kind=\"cowork-slot\") shows EXACTLY ONE published:chef-evening:<window> row for that window, EXACTLY ONE docs/data/unified-agent-synthesis-*-evening.json exists for it, and EXACTLY ONE MARKET post is emitted. Additionally assert a no-false-suppression case: the NEXT scheduled window's key is free at fire time (a 100800s TTL from window N must not cover window N+1)."
    },
    {
      id: "FIX-CHEF-LOG-AGENT-WORK-MISSING",
      title: "chef.md cycles never call log_agent_work — unified-agent has ZERO agent_work_log rows over 3 days while the store is LIVE; the 07-22 double-publish was invisible to every log-based observability path",
      type: "FIX",
      size: "S",
      status: "BACKLOG",
      priority: "P2",
      zone: "cross-service/",
      owner: "po",
      next_agent: "agent-father",
      sprint: "COWORK-RELIABILITY",
      supervised: true,
      created_at: $now,
      created_by: "po-s140-chef-evening-double-publish-triage",
      related: [$p0],
      note: "EVIDENCE (RAW-verified 2026-07-22T20:07Z, po). get_agent_work_log(agent_name=\"unified-agent\", days=3, limit=10) returns [] while the store is demonstrably LIVE — get_agent_work_log(days=2, limit=15) returns rows up to id 1583 (bctc-analyst 18:13). BOTH chef-evening runs on 2026-07-22 (19:56:15Z and 20:00:37Z) completed AND published, and NEITHER wrote a work-log row. CONSEQUENCE: the double-publish was undetectable from the work log and had to be caught by task_list_held lock inspection — every log-based observability, dispatcher-telemetry and audit path over CHEF is structurally blind, for ALL four dish windows, not just evening. CAUSE HINT (not a diagnosis — dev confirms): grep across docs/agents/unified-agent/flow/*.md finds ZERO log_agent_work call sites; the only reference anywhere in the loaded chain is .claude/skills/cycle-bootstrap/SKILL.md L90 ('At completion, check the EXEC-PROOF invariant before calling log_agent_work(completed)') — i.e. the SKILL assumes the FLOW calls it and the FLOW never does, so the call has no owner. Decide which side owns it and wire it there ONLY. AC: (1) every completed chef dish (morning/intraday/eod/evening) writes exactly ONE agent_work_log row carrying slot_id + the window key + the publish outcome; (2) a no-publish / silent-convergence / mid-flow-abort exit ALSO writes a row recording the non-publish, so 'did not publish' is distinguishable from 'did not run' (this is the observability half of the UC-CCA-P3 abort-path class); (3) EXACTLY ONE owner of the call — cycle-bootstrap OR chef.md, never both (no double-count); (4) RAW-verify get_agent_work_log(agent_name=\"unified-agent\", days=1) is non-empty after the next dish. SEVERITY P2: no user-facing data impact on its own, but this is the layer that should have surfaced the P0 sibling autonomously instead of requiring manual lock forensics. DISTINCT from FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (that is the bug; this is why nobody saw it) and DISTINCT from the chef-telemetry.md ENTRY/CLOSE/FAILED/SILENT telemetry spec (file-plane telemetry, a different sink from the agent_work_log DB store — verify whether telemetry fires either).",
      verification_gate: "get_agent_work_log(agent_name=\"unified-agent\", days=1) returns >=1 row after the next chef dish of ANY window, and the row carries slot_id + window key + publish outcome. Negative case: force a no-publish exit and confirm a row is still written marking non-publish."
    }
  ] | map(select(.id as $id | ($ids | index($id)) | not))) as $mints

# --- M1: append id-guarded mints to backlog + stamp board metadata ---
| .task_board.backlog += $mints
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po"

# --- M2: annotate UC-CCA-P3 in place (marker-guarded; no re-scope, no promote) ---
| .task_board.backlog |= map(
    if (type == "object" and .id == "UC-CCA-P3"
        and (has("key_agreement_20260722T2010Z") | not))
    then
      .key_agreement_20260722T2010Z = "[po 2026-07-22T20:10Z, from router intent chef-evening-double-publish; owner/priority/next_agent/scope UNCHANGED] AC EXTENSION — KEY AGREEMENT IS A SEPARATE PRECONDITION, NOT COVERED BY THIS ROW'S ACs. 5th real-world confirmation of the marker-gate cluster and the FIRST with a root cause this row does NOT address. On 2026-07-22 chef-evening published TWICE (19:56:15Z and 20:00:37Z, 4.5 min apart, two CLI sessions) because the two runs derived DIFFERENT marker keys from the SAME wall-clock instant: published:chef-evening:2026-07-22 and published:chef-evening:2026-07-23 were both HELD simultaneously (task_list_held, ttl 100800 each). Cause: chef-evening's cron `45 19 * * *` = 19:45 UTC = 02:45 VN of D+1, so chef.md Step 0.5's WORK_DATE = TZ=Asia/Ho_Chi_Minh date +%Y-%m-%d straddles a date boundary. CRITICAL: this row's own DESIGN RECOMMENDATION (early read-only probe + late task_claim immediately before send_telegram + never release) DOES NOT PREVENT IT — both peers compute different keys, both probes read free, both late claims succeed, both publish. Lifecycle and key-agreement are orthogonal. THEREFORE: UC-CCA-P3 MUST NOT be signed off while the key is derived from a wall-clock `date` read at the leaf. Added AC(6): the marker key is window-anchored and timezone-free (derived from the scheduled cron fire-window in UTC, never from a `date` call made by the executing agent), so two peers on the same window derive byte-identical keys. Root cause + full PO ruling on key-vs-label separation tracked in sibling row FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (P0) — the two MUST ship as ONE design (architect first); neither alone closes the class."
      | .related = ((.related // []) + [$p0] | unique)
    else . end
  )

# --- M3: inoculate the adjacent cycle_id-keying row (marker-guarded) ---
| .task_board.backlog |= map(
    if (type == "object" and .id == "FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING"
        and (has("cycle_id_window_anchor_caution_20260722") | not))
    then
      .cycle_id_window_anchor_caution_20260722 = "[po 2026-07-22T20:10Z, advisory annotation only — scope/priority/owner UNCHANGED] CAUTION before implementing: cycle_id AS CURRENTLY EMITTED IS NOT A SAFE DEDUP/COLLISION KEY. The 2026-07-22 chef-evening double-publish produced cycle_id evening-2026-07-22T19:56:00Z and evening-2026-07-22T20:00:37Z for the SAME scheduled window — i.e. cycle_id is keyed to RUN-START, so two peers in one window get two different cycle_ids and re-keying filenames on it would re-ship the collision this row exists to close (it would stop intra-day OVERWRITES but silently permit duplicate co-existing artifacts, which is what happened tonight: two synthesis files for one window). Adopt the same window anchor mandated by FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (scheduled cron fire-window in UTC, never a leaf-side `date`/run-start read) so the filename key and the mutex key agree by construction."
    else . end
  )
