# po-s90 — single-pass IDLE-LOOP triage draining 3 NEW signal_queue rows + setting head.
# Originated 2026-06-16T18:18Z: loop idle 28min (head idle since 17:50Z) with 3 untriaged NEW signals.
#
# M1 MINT FIX-MARKET-BREADTH-MISSING -> ready[] (USER-REPORTED highest-pri data-gap; get_market_snapshot
#    returns no advancers/decliners/unchanged. zone apps/mcp-server/ but RECON-FIRST: ops-vps-fetch RAW-probes
#    VnDirect finfo-api for advances/declines/nochange fields that fetchVnIndex discards, BEFORE any code.
#    Coding zone apps/mcp-server/ is busy (ARCH-CRON-SCHEDULER-RELIABILITY in_progress) -> recon proceeds in
#    parallel (ops lane), code lands once the zone frees. next_agent=ops-vps-fetch.
# M2 MINT CLEAN-AUDITOR-DOC-SIGNAL-TYPES -> ready[] (LOW; route_to=agent-father; scoped doc cleanup of
#    system-auditor docs citing OLD post_agent_signal types after signal_feedback migration 220b48c5).
# M3 SET top-level .head -> dispatch qa for FIX-CI-RED-STANDING-1837A-1352A (the deterministic 1837a+1352a fix
#    is green; broader 20-file/49-fail red is HOST-WEATHER per signal router-ci-suite-weather, NOT a regression
#    -> qa can reach done_verified, green origin CI, unblock the 4 push-gated tasks + the held 61-ahead push).
# M4 RESOLVE the 2 tech_debt signals + RESOLVE the data-gap signal (task minted).
#
# Idempotent: mints id-guarded across ALL board arrays; head set unconditionally to this dispatch;
# signal resolves guarded by status!=RESOLVED. CONSERVATION: ready += 2 mints; all other lanes byte-stable.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s90-*.jq docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH HELD.)

def has_id($id): any(.task_board | (.ready,.backlog,.in_progress,.review,.done,.done_verified)[]?; .id? == $id);

(if has_id("FIX-MARKET-BREADTH-MISSING") then .
 else .task_board.ready += [{
   id: "FIX-MARKET-BREADTH-MISSING",
   type: "FIX",
   priority: "HIGH",
   status: "READY",
   blocking: false,
   route_to: "ops-vps-fetch",
   next_agent: "ops-vps-fetch",
   zone: "apps/mcp-server/",
   title: "get_market_snapshot returns NO breadth (advancers/decliners/unchanged) — user-reported market-wide do-rong-thi-truong gap",
   desc: "USER-REPORTED 2026-06-16: get_market_snapshot exposes no so-ma-tang/giam/dung-gia. ROOT (live-confirmed, NOT a fetch failure): apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts get_market_snapshot (~L147-364) fetches VN-Index as a SINGLE value (fetchVnIndex VNINDEX -> price+change% only) + individual prices only for explicitly-requested codes; NEVER aggregates HOSE/HNX/UPCOM constituents -> breadth UNIMPLEMENTED. FIX (REAL DATA ONLY, no-fake-data): RECON FIRST (ops-vps-fetch) RAW-probe VnDirect finfo-api/vnmarket_prices upstream for advances/declines/nochange fields that fetchVnIndex DISCARDS -> expose (cheapest+real); else (B) aggregate full constituent lists + count up/down/flat. NEVER a watchlist-only proxy as market-wide breadth. CONSUMER: frontend 'Do rong thi truong' card empty -> close producer->consumer; per /goal#3 card must link source + expand to fetched advancers/decliners detail.",
   size: "M",
   baseline_pass: "Live get_market_snapshot returns non-null advancers+decliners+unchanged counts sourced from REAL upstream (advances+declines+nochange ~= total constituents; magnitudes plausible vs index direction). Frontend breadth card populates + links source.",
   source: "signal_queue router-market-breadth-missing-20260616T175600Z (user-reported data-gap)",
   created_at: $now,
   dispatch_note: "RECON-FIRST: dispatch ops-vps-fetch to RAW-probe VnDirect breadth fields before any code. Coding zone apps/mcp-server/ currently busy (ARCH-CRON-SCHEDULER-RELIABILITY in_progress) — recon runs parallel in ops lane; code hop waits for the mcp-server slot. Ties /goal#1 (recheck-shipped) + no-fake-data + /goal#3 (source-link+expand). Highest user-facing priority of this triage tick."
 }] end)

| (if has_id("CLEAN-AUDITOR-DOC-SIGNAL-TYPES") then .
   else .task_board.ready += [{
     id: "CLEAN-AUDITOR-DOC-SIGNAL-TYPES",
     type: "CLEAN",
     priority: "LOW",
     status: "READY",
     blocking: false,
     route_to: "agent-father",
     next_agent: "agent-father",
     zone: "docs/agents/system-auditor/",
     title: "system-auditor docs cite OLD post_agent_signal types after signal_feedback migration (220b48c5)",
     desc: "Doc-coherence residual: signal_feedback migration (220b48c5) changed accepted signal types but system-auditor docs still reference the old post_agent_signal enum. SCOPE (one coherent cleanup): (1) init.md:24 UNAMBIGUOUSLY stale — old types 'via post_agent_signal' which the tool now rejects -> rewrite to the current signal_feedback contract. (2) audit-dimensions.md:18/28/38 'Signal type: <old>' is AMBIGUOUS (signal_type vs dedup-namespace category) -> scope each: rename to the dedup-namespace category if that's the intent, else update to the new enum. (3) flow/ free-form dedup_key/title/signal_queue-row 'type' fields are INTENTIONAL (not enum) -> LEAVE untouched. agent-father owns system-auditor agent docs (per agent-md-factory rule).",
     size: "S",
     baseline_pass: "init.md:24 + audit-dimensions.md:18/28/38 reflect the current signal_feedback contract; no remaining stale post_agent_signal type references in system-auditor docs; free-form flow 'type' fields untouched. grep confirms.",
     source: "signal_queue router-docresidual-20260616T160246Z (LOW tech_debt — fail-loud debt, functional emit path already done_verified live signal_id 6342)",
     created_at: $now,
     dispatch_note: "Low priority — route via agent-father (system-auditor agent-doc owner). Does NOT block any live path; emit already done_verified. Minted to ready[] so it stops re-reading as untriaged."
   }] end)

| .signal_queue.rows |= map(
    if (.id == "router-ci-suite-weather-20260616T162343Z") and (.status != "RESOLVED")
    then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s90",
      resolution:"INFORMATIONAL — accepted as the justification UNBLOCKING FIX-CI-RED-STANDING-1837A-1352A. The 20-file/49-fail full-suite red BEYOND the fixed 1837a+1352a is LOCAL macOS host-weather (3x SIGILL Bun-JIT corruption sdk1.29.0+zod3.25.76 under P=8 on memory-constrained host — local-only, does NOT repro on Linux CI; the known restart-masks-bun-jit-corruption class) + ~17 live-data/integration flaps. Disjoint from change, NOT a regression. No new P3 minted — would duplicate the existing pinned bun-jit debt + the flaky-quarantine note is already carried on CI-RED-STANDING.broader_red_note. SIGILL recurrence = local-run hygiene (lower P / restart bun), not a code fix. Action (1) WATCH-Linux-CI-green-on-push is carried into CI-RED-STANDING's verification_gate."}
    elif (.id == "router-docresidual-20260616T160246Z") and (.status != "RESOLVED")
    then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s90",
      resolution:"TRIAGED + DISPATCHED: minted CLEAN-AUDITOR-DOC-SIGNAL-TYPES (LOW, route_to=agent-father) into ready[] — one scoped doc cleanup of system-auditor docs (init.md:24 stale + audit-dimensions.md:18/28/38 scoping; free-form flow 'type' left). No longer untriaged."}
    elif (.id == "router-market-breadth-missing-20260616T175600Z") and (.status != "RESOLVED")
    then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s90",
      resolution:"TRIAGED + DISPATCHED: minted FIX-MARKET-BREADTH-MISSING (HIGH, user-reported) into ready[] -> ops-vps-fetch RECON-FIRST (RAW-probe VnDirect breadth fields) then dev-mcp-server code once the apps/mcp-server/ zone frees (busy w/ ARCH-CRON-SCHEDULER-RELIABILITY). Producer->consumer close for the empty frontend 'Do rong thi truong' card."}
    else . end
  )

| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "po",
    active_task_id: "FIX-CI-RED-STANDING-1837A-1352A",
    next_agent: "qa",
    note: "PO triage tick \($now) — drained 3 NEW signals. HEAD: dispatch qa for FIX-CI-RED-STANDING-1837A-1352A (review[], deterministic 1837a+1352a fix GREEN). Per signal router-ci-suite-weather (RESOLVED) the broader 20-file/49-fail red is HOST-WEATHER not a regression -> qa verifies (local 1837a+1352a green; watch Linux Actions run green on the deferred push) -> done_verified -> unblocks the 4 ci_green_on_subsequent_push-gated tasks + lets the held 61-ahead/28-behind push land on a green baseline. Also minted this tick: FIX-MARKET-BREADTH-MISSING (HIGH, user-reported -> ops-vps-fetch recon-first; highest user-facing pri, queued in ready[]) + CLEAN-AUDITOR-DOC-SIGNAL-TYPES (LOW -> agent-father)."
  }

| .updated_at = $now
