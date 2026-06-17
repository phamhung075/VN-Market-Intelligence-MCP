# po-s94-healthrecheck-w3-systemstatus-agentsignals-triage.jq
# ---------------------------------------------------------------------------
# Single-pass health-recheck-wave-3 drain triage (dev-team cron tick 2026-06-17T01:26Z).
#
# Origin: 28 unclaimed health-recheck reports (3181..3208) accrued since 2026-06-15.
# Router RAW-verified every cluster against the live board + live gateway tools.
# Most clusters DEDUP to already-tracked/done_verified tasks (see BATCH summary).
# Only TWO genuinely-untracked LIVE-confirmed bugs + one cosmetic doc-drift remain.
#
# Mutations (all idempotent — id-guarded; re-run mints 0):
#   M1 MINT  FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD  -> ready[] LEAD (unshift)   [P1, TIME-SENSITIVE]
#       root: getSystemStatus.ts (systemTools.ts) calls the TE/Chromium source-health
#       probe (sourceHealthTools.ts) with NO per-source deadline -> when TE Chromium hangs,
#       the whole get_system_status blocks 60s -> market-watcher smoke probe (main.md:36)
#       aborts EVERY cycle at the 02:00Z open. LIVE 01:31Z: call returned fast THIS instant
#       (TE breaker recovered) but the latent no-guard root persists -> recurs on next TE hang.
#       generic fix: Promise.race(TE-fetch, timeout(3000)) per source-health probe OR swap the
#       market-watcher smoke probe to get_cycle_bootstrap (returns system_status in ~1ms).
#   M2 MINT  FIX-AGENTSIGNALS-FROMAGENT-SCHEMA   -> backlog[]                 [P2]
#       root: get_agent_signals requires `agent` even when `from_agent` is present
#       (agentSignalTools.ts). LIVE 01:31Z RAW-confirmed: {from_agent:"news-scout"} ->
#       MCP -32602 `agent` Required. Breaks news-scout SELF_SIGNALS_CACHE every cycle ->
#       feedback tuning permanently disabled. generic fix: make `agent` optional when
#       `from_agent` is present (zod refine, no per-agent allowlist).
#   M3 MINT  CLEAN-TI-DOC-PARAM-CODE-DRIFT       -> backlog[]                 [P3, doc-only]
#       docs/agents/tools/list/get_technical_indicators.md + get_price_history.md say
#       param=`ticker` but live server requires `code`; flow files already use `code`
#       (0 runtime broken — report 3204 confirms doc-only). Cosmetic SSOT correction.
#   M4 SET   top-level .head -> dispatch the P1 (FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD) to
#       dev-mcp-server, status=in_progress, because it's TIME-SENSITIVE before the ~02:00Z open
#       and WIP has a free coding slot (0 active dev coding lanes; ARCH-CRON is architect-bound,
#       the 8 review rows await QA). The P2/P3 stay in backlog (WIP <= 2 coding lanes respected).
#
# HELD / UNTOUCHED (asserted, never mutated):
#   - ARCH-CRON-SCHEDULER-RELIABILITY (in_progress, architect umbrella) — stays
#   - DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER (ready) + DMS-1/DMS-2 (backlog) — stay HELD
#   - all 8 review[] rows (FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS etc.) — untouched
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s94-healthrecheck-w3-systemstatus-agentsignals-triage.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp
#   [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   # commit orch-state by EXPLICIT PATH; PUSH HELD (PO out-of-band).
# ---------------------------------------------------------------------------

def all_ids:
  [ .task_board | (.in_progress[]?, .review[]?, .ready[]?, .backlog[]?, .done[]?, .done_verified[]?, (.qa[]?)) | (.id // .task_id) ];

# --- new task specs --------------------------------------------------------
def t_systemstatus($now):
  {
    id: "FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD",
    title: "get_system_status 60s timeout — TE/Chromium source-health probe has no per-source deadline -> market-watcher smoke probe (main.md:36) aborts every cycle at market open",
    type: "FIX",
    status: "READY",
    priority: "P1",
    blocking: true,
    zone: "apps/mcp-server/",
    owner: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    files: [
      "apps/mcp-server/src/interface/mcp/tools/system/systemTools.ts",
      "apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts",
      "apps/mcp-server/src/interface/mcp/tools/system/cycleBootstrapTool.ts"
    ],
    root_cause: "getSystemStatus composes the source-health probe which awaits the TradingEconomics Chromium fetch with NO per-source timeout. When TE Chromium hangs (live: TE source Ngung, 55-56 consecutive errors) the entire get_system_status call blocks ~60s. market-watcher main.md:36 smoke-probes get_system_status step-0 and aborts-on-fail -> BUG telegram + EXIT every fire. Affects 6 flow files (market-watcher, system-auditor/tier1-probe, tran-ngoc-bau/bootstrap, unified-agent/market-bootstrap, po/channel-audit, po/market-group).",
    fix_spec: "GENERIC, no per-source allowlist. Option A: wrap each source-health probe (esp. TE/Chromium) in Promise.race(fetch, timeout(3000)) so one hung source degrades to a 'Ngung/timeout' row instead of blocking the whole tool. Option B (preferred for the smoke-probe consumers): repoint the market-watcher/po smoke probes to get_cycle_bootstrap which returns system_status in ~1ms without the live source-health fan-out. Ship whichever the architect/dev judges durable; the deadline must be < the gateway/agent smoke-probe timeout.",
    generic_mandate: "Per-source deadline applies to ALL source-health probes, not a TE-only special-case. No date/source allowlist.",
    verification_gate: "LIVE: get_system_status returns < 5s even with TE breaker open (force TE hang or probe during a TE-Ngung window); market-watcher smoke probe at the next 02:00Z open does NOT abort. RAW-verify via the gateway, not a green test only.",
    rebuild_required: true,
    time_sensitive: "before ~02:00Z market open",
    source_reports: [3203, 3206],
    dedup_note: "untracked — no prior getSystemStatus/TE-Chromium/smoke-probe task on the board (router RAW-confirmed). report 3204 'BUG-4 RESOLVED via restart' is a false-clear: restart only frees the hung Chromium, the no-guard root recurs (report 3206 RECURRED 20:09Z).",
    minted_by: "po-s94",
    minted_at: $now
  };

def t_agentsignals($now):
  {
    id: "FIX-AGENTSIGNALS-FROMAGENT-SCHEMA",
    title: "get_agent_signals({from_agent}) fails schema (`agent` Required) -> news-scout SELF_SIGNALS_CACHE empty every cycle",
    type: "FIX",
    status: "BACKLOG",
    priority: "P2",
    zone: "apps/mcp-server/",
    owner: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    files: [
      "apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts"
    ],
    root_cause: "get_agent_signals zod schema marks `agent` as required even for sender-history calls that pass `from_agent`. LIVE 2026-06-17T01:31Z RAW-confirmed: get_agent_signals({from_agent:'news-scout'}) -> MCP -32602 invalid_type `agent` Required. news-scout's SELF_SIGNALS_CACHE warm-up (its self-history read) silently empties every cycle -> feedback/self-tuning permanently disabled.",
    fix_spec: "Make `agent` optional when `from_agent` is supplied (zod .refine or .or so at least one of agent/from_agent is present; query path already supports from_agent). GENERIC — no per-agent special-case.",
    generic_mandate: "Schema relaxation applies to any sender-history query, not a news-scout allowlist.",
    verification_gate: "LIVE: get_agent_signals({from_agent:'news-scout'}) returns rows (or empty array, not -32602); news-scout SELF_SIGNALS_CACHE populates. RAW-verify via gateway.",
    rebuild_required: true,
    source_reports: [3202, 3203, 3204],
    dedup_note: "untracked — router RAW-confirmed the live -32602 + searched board (no agentSignals/from_agent task). Distinct from FACTORY-INFRA-agentsignal-* (those are confidence-default/SQL-binding refactors, not this required-param bug).",
    minted_by: "po-s94",
    minted_at: $now
  };

def t_tidoc($now):
  {
    id: "CLEAN-TI-DOC-PARAM-CODE-DRIFT",
    title: "get_technical_indicators.md + get_price_history.md doc SSOT says param `ticker` but live server requires `code` (doc-only, 0 runtime broken)",
    type: "CLEAN",
    status: "BACKLOG",
    priority: "P3",
    zone: "cross-service/",
    owner: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    files: [
      "docs/agents/tools/list/get_technical_indicators.md",
      "docs/agents/tools/list/get_price_history.md",
      "docs/agents/market-watcher.md"
    ],
    root_cause: "Doc SSOT lists param=`ticker`; live tool schema requires `code`. Flow files already use `code` (working) so 0 runtime breakage (report 3204 confirms doc-only). market-watcher.md examples (lines ~147/177/208) carry the stale `ticker`.",
    fix_spec: "Correct the param name `ticker` -> `code` in the two list docs + the market-watcher.md examples. Doc-only, no code, no rebuild.",
    verification_gate: "grep shows no `ticker:` param example for get_technical_indicators/get_price_history in the listed docs.",
    rebuild_required: false,
    source_reports: [3199, 3204],
    dedup_note: "untracked, cosmetic. Low priority — purely SSOT hygiene, no served-data impact.",
    minted_by: "po-s94",
    minted_at: $now
  };

# --- guards ----------------------------------------------------------------
($ENV.now // ($now // error("now arg required"))) as $now
| . as $root
| (all_ids) as $ids
| ($ids | index("FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD")) as $has1
| ($ids | index("FIX-AGENTSIGNALS-FROMAGENT-SCHEMA")) as $has2
| ($ids | index("CLEAN-TI-DOC-PARAM-CODE-DRIFT")) as $has3
# pre-counts for conservation
| (.task_board.ready | length) as $pre_ready
| (.task_board.backlog | length) as $pre_backlog
| (.task_board.in_progress | length) as $pre_inprog
| (.task_board.review | length) as $pre_review
| (.task_board.done | length) as $pre_done
| (.task_board.done_verified | length) as $pre_dv
# M1: mint P1 -> ready LEAD (unshift) unless present
| (if $has1 == null
     then .task_board.ready |= ([t_systemstatus($now)] + .)
     else . end)
# M2: mint P2 -> backlog unless present
| (if $has2 == null
     then .task_board.backlog |= (. + [t_agentsignals($now)])
     else . end)
# M3: mint P3 -> backlog unless present
| (if $has3 == null
     then .task_board.backlog |= (. + [t_tidoc($now)])
     else . end)
# M4: set top-level .head to dispatch the P1 (only if it was freshly minted to ready)
| (if $has1 == null
     then .head = {
            status: "in_progress",
            active_task_id: "FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD",
            next_agent: "dev-mcp-server",
            updated_at: $now,
            updated_by: "po-s94",
            note: ("ROUTER " + $now + " — health-recheck W3 triage: dispatch TIME-SENSITIVE P1 FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD (getSystemStatus TE/Chromium no per-source deadline -> market-watcher smoke probe aborts at 02:00Z open) to dev-mcp-server. Minted alongside P2 FIX-AGENTSIGNALS-FROMAGENT-SCHEMA + P3 CLEAN-TI-DOC-PARAM-CODE-DRIFT (both backlog, WIP<=2 coding respected). 28 health-recheck reports 3181..3208 triaged; rest DEDUP to tracked/done_verified. DESIGN-GATHERER + DMS still HELD behind ARCH-CRON-SCHEDULER-RELIABILITY. PUSH held (PO out-of-band).")
          }
     else . end)
# bump board metadata
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s94"
# --- conservation guard (computed AFTER mutation; jq is functional so recompute) ---
| (.task_board.ready | length) as $post_ready
| (.task_board.backlog | length) as $post_backlog
| (.task_board.in_progress | length) as $post_inprog
| (.task_board.review | length) as $post_review
| (.task_board.done | length) as $post_done
| (.task_board.done_verified | length) as $post_dv
| ((if $has1 == null then 1 else 0 end)) as $mint_ready
| ((if $has2 == null then 1 else 0 end) + (if $has3 == null then 1 else 0 end)) as $mint_backlog
| if ($post_ready != ($pre_ready + $mint_ready))
    then error("CONSERVATION FAIL ready: pre=\($pre_ready) post=\($post_ready) expected_delta=\($mint_ready)")
  elif ($post_backlog != ($pre_backlog + $mint_backlog))
    then error("CONSERVATION FAIL backlog: pre=\($pre_backlog) post=\($post_backlog) expected_delta=\($mint_backlog)")
  elif ($post_inprog != $pre_inprog)
    then error("CONSERVATION FAIL in_progress mutated: pre=\($pre_inprog) post=\($post_inprog)")
  elif ($post_review != $pre_review)
    then error("CONSERVATION FAIL review mutated: pre=\($pre_review) post=\($post_review)")
  elif ($post_done != $pre_done)
    then error("CONSERVATION FAIL done mutated: pre=\($pre_done) post=\($post_done)")
  elif ($post_dv != $pre_dv)
    then error("CONSERVATION FAIL done_verified mutated: pre=\($pre_dv) post=\($post_dv)")
  else .
  end
