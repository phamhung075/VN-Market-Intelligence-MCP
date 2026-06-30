# po-s61-bctc-recon-done-enrich-hardening-triage.jq
# Single-pass atomic triage for OPS-BCTC-PIPELINE-RECON completion + durable hardening sprint.
# Originated 2026-06-15: 2nd recurrence of BCTC-VPS-PIPELINE-STALE. Router RAW-verified the live
# state; this script (a) relocates the COMPLETED recon in_progress->done with a done_verified-deferred
# note, (b) id-guarded MINTs 6 follow-on tasks to ready[] (5 fix children + 1 architect-brief umbrella),
# (c) annotates the FIX-BCTC-VPS-PIPELINE-STALE-5D backlog recurrence row (no dup, count stays 2).
#
# Reusable pattern: "a recon lane completes (deploys partial fixes) + spawns a multi-owner durable
# hardening sprint whose TRUE user-facing root differs from the deployed fix — close the recon, mint
# the children incl. an architect brief per recurring-bug-escalation, annotate the recurrence anchor".
#
# Harness guards (in the shell wrapper, not here):
#   - atomic temp -> [ -s ] -> jq empty -> CONSERVATION -> HARD-CONSTRAINT -> rename
#   - CONSERVATION: ready == pre_ready + 6 ; in_progress == pre_in_progress - 1 ; done == pre_done + 1 ;
#                   backlog length unchanged ; total entries across 6 arrays == pre_total + 6 (pure mint+move)
#   - HARD-CONSTRAINT: the 4 review[] rows untouched ; the other 2 in_progress rows untouched ;
#                      FIX-BCTC-VPS-PIPELINE-STALE-5D.recurrence_count stays 2
#
# Usage: jq --arg now "$NOW" -f scripts/po-s61-bctc-recon-done-enrich-hardening-triage.jq \
#          docs/data/orch/orch-state.json
# Commit orch-state by EXPLICIT PATH only.

# --- helpers ------------------------------------------------------------------
def has_id($id):
  ([ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
     .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
   | map(.id // "") | index($id)) != null;

def append_ready($task):
  if has_id($task.id) then .
  else .task_board.ready += [$task] end;

# --- new task specs -----------------------------------------------------------
($now) as $now
| ({
    id: "FIX-BCTC-ENRICH-SILENT-0ROWS",
    type: "FIX",
    priority: "P0",
    status: "READY",
    route_to: "dev-pdf-extractor",
    co_owner: "dev-mcp-server",
    zone: "multi",
    mode: "code",
    size: "M",
    title: "BCTC enrich SILENT 0-table-rows: financial_reports header inserted but bctc_table_rows=0 AND bctc_md_tables=0 (VCB 2026Q1 + 2025Q1 reproduce; VCB 2025Q4 112 rows + FPT 2026Q1 145 rows do NOT) — the ACTUAL user-facing P0 root behind get_bctc_full(VCB)='Chua co du lieu BCTC'",
    desc: "ROUTER RAW-VERIFIED vs named-volume DB (NOT host ./data): financial_reports HAS VCB 2026Q1 (id b1ea447a-6d41-4646-abcd-af0af5b6b347, parsed 2026-06-13T17:29:12, extraction_confidence 0.75) but bctc_table_rows=0 AND bctc_md_tables=0. VCB 2025Q1 also 0 rows. VCB is a BANK -> B02-TCTD form -> likely a bank-form parse/OCR regression that silently yields 0 rows while STILL inserting the financial_reports header. The discovery fixes (afrLoop rollover + exchange_code) deployed by ops do NOT resolve the user-facing P0 — the PDF reaches the DB but enrichment produces 0 rows. Cross-check memory project_bank_aware_bctc (B02-TCTD 1 SSOT across 7 consumers; Roman+no-3digit discriminator). Two surfaces: dev-pdf-extractor (OCR/parse of B02-TCTD bank form) + dev-mcp-server (enrich orchestration: a 0-rows enrich MUST fail loud, NOT mark the queue row done).",
    generic_mandate: "GENERIC across ALL tickers/banks — NO per-ticker allowlist, NO date-literal, NO special-case (/goal#2). Fix the bank-form (B02-TCTD) parse path + the silent-success swallow generically.",
    fail_loud_requirement: "A silent-0-rows enrich MUST fail loud / NOT mark the bctc_vps_queue row done — currently it inserts the header, yields 0 rows, and the queue advances (silent-swallow class).",
    baseline_pass: "done_verified (/goal#1) = get_bctc_full(VCB) returns REAL VARIED rows RAW-verified vs named-volume market.db (NEVER host ./data, NEVER a badge); AND a B02-TCTD parse that yields 0 table_rows fails loud and does NOT advance the queue; AND VCB 2025Q4 (112 rows) + FPT 2026Q1 (145 rows) remain non-regressed.",
    recurrence_class: "BCTC-VPS-PIPELINE-STALE (2nd recurrence) — this is the enrich-silent-0 leg of the durable hardening sprint.",
    source: "OPS-BCTC-PIPELINE-RECON recon + PO RAW-verify 2026-06-15",
    created_at: $now,
    dispatch_note: "P0/weigh-P0 — TRUE root of the VCB user-facing P0. Discovery fixes deployed but PDF->DB header inserts with 0 table_rows. dev-pdf-extractor leads (B02-TCTD bank-form parse/OCR), dev-mcp-server pairs (enrich orchestration must fail-loud not silent-advance). Generic, no allowlist. done_verified = real VARIED rows vs named-volume DB."
  }) as $t_enrich

| ({
    id: "FIX-HNX-SESSION-COOKIE",
    type: "FIX",
    priority: "P1",
    status: "READY",
    route_to: "dev-vps-crawls",
    zone: "cross-service/",
    mode: "code",
    size: "S",
    title: "HNX POST endpoints now require a session cookie (stateless POST -> 302 /Home/Error) — add a prior GET to the referrer to establish the cookie, shared CookieJar",
    desc: "Root B (ops recon, UNFIXED). HNX endpoints NextPageTinCPNY_CBTCPH + NextPageTCPHUpCoM return HTTP 302 -> /Home/Error for stateless POSTs (no prior GET). A prior GET to the referrer (https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html) sets cookie 616a3745ee... -> POST returns 200 with results (30KB, contains funcShowFileAttach). Fix _discover_hnx_upcom() in vps-scripts/discover-bctc-urls-browser.py: GET referrer first, share a http.cookiejar.CookieJar() + urllib opener (same pattern as the SSC flow). Affects the 9 pending HNX/UPCOM tickers: ACV BDI DAG DLC JSH SIS VDC VNH VEA.",
    generic_mandate: "GENERIC session-establishment for the HNX path — no per-ticker code, share one CookieJar across all HNX POSTs (/goal#2).",
    baseline_pass: "_discover_hnx_upcom() returns 200+results for an HNX/UPCOM ticker with a Q1/2026 filing (RAW-verify on VPS); the 9 pending queue rows re-resolve (those that have actually filed Q1/2026).",
    source: "OPS-BCTC-PIPELINE-RECON Root B; signal docs/signals/dev-vps-crawls-2026-06-15T17-11-01Z.json",
    created_at: $now,
    dispatch_note: "P1 — dev-vps-crawls. vps-scripts/discover-bctc-urls-browser.py _discover_hnx_upcom(): prior-GET referrer + shared CookieJar. Recipe in recon.md Working Recipe (HNX, with session)."
  }) as $t_hnx

| ({
    id: "FIX-SSC-C111-EMPTY-FALLBACK",
    type: "FIX",
    priority: "P1",
    status: "READY",
    route_to: "dev-vps-crawls",
    zone: "cross-service/",
    mode: "code",
    size: "S",
    title: "SSC c111 (doc summary) empty for UPCOM/state filers (e.g. ACV) -> period lives in c3; _ssc_parse_rows must fall back to c3 when c111 empty",
    desc: "Pre-existing B (ops recon, UNFIXED). _ssc_parse_rows() in vps-scripts/discover-bctc-urls-browser.py matches title via c111 (document summary), which is ALWAYS empty for ACV-class UPCOM/state-owned filers. The 'not title' guard exits early so the matcher never fires. Period+filing info lives in c3 ('Bao cao tai chinh quy 1/ 2026'). Fix: when c111 is empty, fall back to c3 for title matching (same 'quy N/ YYYY' / 'nam YYYY' keywords). ACV Q1/2026 confirmed on SSC at idx=15 (filed 06/05/2026). Pairs with FIX-HNX-SESSION-COOKIE to fully recover ACV.",
    generic_mandate: "GENERIC c111->c3 fallback for ALL filers where c111 is empty — no ACV allowlist (/goal#2).",
    baseline_pass: "_ssc_parse_rows() matches ACV Q1/2026 (and any c111-empty filer) via c3 fallback (RAW-verify on VPS); ACV's queue row resolves once paired with the HNX-session fix.",
    source: "OPS-BCTC-PIPELINE-RECON Root D; signal docs/signals/dev-vps-crawls-2026-06-15T17-11-01Z.json",
    created_at: $now,
    dispatch_note: "P1 — dev-vps-crawls. _ssc_parse_rows() c111-empty -> c3 fallback. Same SSOT file as FIX-HNX-SESSION-COOKIE (sequence/batch with it on the same dev-vps-crawls pass)."
  }) as $t_c111

| ({
    id: "FIX-BCTC-ZERO-URL-ALERT",
    type: "FIX",
    priority: "P2",
    status: "READY",
    route_to: "dev-mcp-server",
    zone: "apps/mcp-server/",
    mode: "code",
    size: "S",
    title: "Zero-URL alerting gate: alert when discovery returns 0 URLs for ALL tickers for 2+ consecutive cycles — would have caught this 34h earlier",
    desc: "Router-added durable gate. bctcQueueEnricherJob silently returns 0 URLs for ALL tickers when discovery is broken (afrLoop rollover did exactly this for 339 consecutive enricher runs in the prior recurrence). Add an alert when urlsPopulated=0 for ALL tickers for 2+ consecutive cycles during an active earnings window. Owner dev-mcp-server. Ties to the durable root: 'no active zero-result alerting' is the shared cause across discovery-brittleness + enrich-silent-0 + no-freshness-gate.",
    generic_mandate: "GENERIC — alert on the aggregate zero-result condition, not per-ticker, no date-literal (/goal#2).",
    baseline_pass: "Inject a forced 0-URL-all-tickers condition for 2 cycles -> an alert fires (RAW-verify the alert path, not a green steady-state test); normal partial-result cycles do NOT alert.",
    source: "OPS-BCTC-PIPELINE-RECON router-added; recon.md Durable Fix Owners; memory passive_health_masks_dead_data",
    created_at: $now,
    dispatch_note: "P2 — dev-mcp-server. Detection gate (would have caught the 34h outage early). Pairs with FIX-BCTC-FRESHNESS-GATE under the ARCH-BCTC-PIPELINE-DURABILITY umbrella (shared 'no active zero-result/freshness alerting' root)."
  }) as $t_zerourl

| ({
    id: "FIX-BCTC-FRESHNESS-GATE",
    type: "FIX",
    priority: "P2",
    status: "READY",
    route_to: "dev-mcp-server",
    zone: "apps/mcp-server/",
    mode: "code",
    size: "S",
    title: "Active freshness health gate: gate BCTC health on max(last_success_age), NOT service liveness (liveness != freshness hid this for 34h)",
    desc: "Router-added durable gate. vpsHealthPoller.ts marks vn-bctc-fetch passive=true (always healthy on TCP ping) regardless of data-push age (vpsHealthPoller.ts:169). This liveness!=freshness conflation hid BOTH the 5-day prior stall AND this 34h recurrence. Replace the passive health for vn-bctc-fetch with an ACTIVE freshness query on bctc_vps_queue (max(last_attempt) WHERE status=done; stale if >24h during earnings window). Owner dev-mcp-server. Ties to memory passive_health_masks_dead_data.",
    generic_mandate: "GENERIC active-freshness gate keyed on last_success_age — no date-literal, no per-source special-case beyond the freshness threshold (/goal#2).",
    baseline_pass: "Force last_success_age > threshold with a non-empty queue -> health reports UNHEALTHY/stale (RAW-verify the stale path, NOT just a fresh-state green); a fresh push -> healthy.",
    source: "OPS-BCTC-PIPELINE-RECON router-added; FIX-BCTC-VPS-PIPELINE-STALE-5D handoff item (1); memory passive_health_masks_dead_data",
    created_at: $now,
    dispatch_note: "P2 — dev-mcp-server. vpsHealthPoller.ts vn-bctc-fetch passive=true -> active max(last_success_age) gate. Pairs with FIX-BCTC-ZERO-URL-ALERT under ARCH-BCTC-PIPELINE-DURABILITY."
  }) as $t_fresh

| ({
    id: "ARCH-BCTC-PIPELINE-DURABILITY",
    type: "SPIKE",
    priority: "P1",
    status: "READY",
    route_to: "architect",
    co_owner: "agents-architect",
    zone: "multi",
    mode: "spike",
    timebox: 120,
    size: "S",
    title: "Architect brief — durable cross-cutting hardening for the BCTC VPS pipeline (2nd recurrence; first 'fix' was a one-time flush, not hardening)",
    question: "What is the durable cross-cutting design that removes the BCTC-VPS-PIPELINE-STALE recurrence class as a whole? The shared root across discovery-brittleness (afrLoop regex rollover), enrich-silent-0-rows, and no-freshness-gate is 'NO active zero-result/freshness alerting' — the pipeline cannot distinguish 'ticker has not filed' from 'discovery/enrich is broken' and fails silently into a healthy mask. Design: (a) an active zero-result + freshness alerting layer (generalizing FIX-BCTC-ZERO-URL-ALERT + FIX-BCTC-FRESHNESS-GATE into one cross-cutting health contract); (b) a fail-loud contract for the enrich path (a 0-rows enrich must never advance the queue silently — generalizes FIX-BCTC-ENRICH-SILENT-0ROWS); (c) reduce the regex-based ADF session impersonation brittleness (prefix-agnostic extraction is deployed but the class recurs on any source-side counter/token/session change — define the monitoring contract that catches it within 1 cycle not 34h). Output: a design brief that the 5 child FIX tasks slot under, plus any new generic mechanism. Per recurring-bug-escalation policy (2nd recurrence, same module): architect designs the durable cross-cutting fix; agents-architect consulted if any inter-agent/health-contract comms change is implied.",
    escalation_reason: "recurring-bug-escalation: 2nd recurrence of BCTC-VPS-PIPELINE-STALE; the first 'fix' self-recovered/one-time-flushed rather than hardening. Policy: 2+ recurrences same module -> brief the architect for a durable cross-cutting design instead of only patching the leaf symptoms.",
    children: ["FIX-BCTC-ENRICH-SILENT-0ROWS","FIX-HNX-SESSION-COOKIE","FIX-SSC-C111-EMPTY-FALLBACK","FIX-BCTC-ZERO-URL-ALERT","FIX-BCTC-FRESHNESS-GATE"],
    baseline_pass: "Design brief delivered (docs/architecture-briefs/) enumerating the durable zero-result/freshness alerting contract + enrich fail-loud contract + ADF-brittleness monitoring contract; the 5 child FIX tasks map cleanly under it.",
    source: "OPS-BCTC-PIPELINE-RECON + FIX-BCTC-VPS-PIPELINE-STALE-5D recurrence_count=2",
    created_at: $now,
    dispatch_note: "P1 SPIKE — architect (agents-architect consulted). recurring-bug-escalation umbrella over the 5 child FIX tasks. Design the cross-cutting alerting/fail-loud/brittleness-monitoring contract — do NOT just re-patch leaves. Timebox 120m, output: architecture brief."
  }) as $t_arch

# --- (1) relocate OPS-BCTC-PIPELINE-RECON in_progress -> done ------------------
# Idempotent: only relocate if the row is still in in_progress AND not already in done.
| (.task_board.in_progress
   | map(select(.id == "OPS-BCTC-PIPELINE-RECON"))
   | .[0]) as $recon
| (($recon != null)
   and ((.task_board.done | map(.id) | index("OPS-BCTC-PIPELINE-RECON")) == null)) as $do_relocate
| if $do_relocate then
    (.task_board.in_progress |= map(select(.id != "OPS-BCTC-PIPELINE-RECON")))
  | (.task_board.done += [
    ($recon
     + {
        status: "DONE",
        lane: "ops",
        completed_at: $now,
        completed_by: "po",
        recon_outcome: "Recon COMPLETE; 2 GENERIC fixes deployed to VPS (vps-scripts/discover-bctc-urls-browser.py): Root A afrLoop rollover regex r'(26\\d{14,16})'->r'(\\d{15,18})' + winId positional parse (removes the 26000000000000000 hardcode); Pre-existing A exchange_code '1'(HOSE)-> '' (all exchanges). Live: VCB+FPT Q1/2026 PDFs downloaded on VPS.",
        done_verified: false,
        done_verified_deferred_note: "DEPLOYED discovery fixes still need done_verified on the NEXT 6h VPS cycle: the 27 url_not_found queue rows should clear once the prefix-agnostic discovery re-resolves. RE-PROBE after the cycle: get_bctc_full + bctc_vps_queue distribution (expect 27 url_not_found -> done, 9 pending HNX/UPCOM still blocked pending FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK). NOTE: the discovery fix does NOT resolve the user-facing P0 (get_bctc_full(VCB) STILL empty) — TRUE root = FIX-BCTC-ENRICH-SILENT-0ROWS (header inserted, 0 table_rows).",
        spawned_followons: ["FIX-BCTC-ENRICH-SILENT-0ROWS","FIX-HNX-SESSION-COOKIE","FIX-SSC-C111-EMPTY-FALLBACK","FIX-BCTC-ZERO-URL-ALERT","FIX-BCTC-FRESHNESS-GATE","ARCH-BCTC-PIPELINE-DURABILITY"],
        recon_doc: "docs/vps-sources/ssc-bctc-afrloop-incident/recon.md",
        signal: "docs/signals/dev-vps-crawls-2026-06-15T17-11-01Z.json"
       })
    ])
  else . end

# --- (2) mint the 6 follow-on tasks (id-guarded) ------------------------------
| append_ready($t_enrich)
| append_ready($t_hnx)
| append_ready($t_c111)
| append_ready($t_zerourl)
| append_ready($t_fresh)
| append_ready($t_arch)

# --- (3) annotate the recurrence anchor (count stays 2; no dup) ----------------
# Idempotent: only annotate if the marker phrase is absent (architect_briefed not yet set).
| .task_board.backlog |= map(
    if (.id == "FIX-BCTC-VPS-PIPELINE-STALE-5D") and ((.architect_briefed // false) | not)
    then . + {
      recurrence_note: ((.recurrence_note // "")
        + " | 2026-06-15T17:19Z PO TRIAGE (OPS-BCTC-PIPELINE-RECON closed done): recon complete, 2 discovery fixes DEPLOYED (afrLoop rollover + exchange_code) but the user-facing P0 (get_bctc_full(VCB) empty) is NOT discovery — TRUE root = enrich-silent-0-rows (header inserted, 0 table_rows). Minted 6 follow-ons to ready[]: FIX-BCTC-ENRICH-SILENT-0ROWS(P0/weigh-P0, dev-pdf-extractor+dev-mcp-server), FIX-HNX-SESSION-COOKIE(P1, dev-vps-crawls), FIX-SSC-C111-EMPTY-FALLBACK(P1, dev-vps-crawls), FIX-BCTC-ZERO-URL-ALERT(P2, dev-mcp-server), FIX-BCTC-FRESHNESS-GATE(P2, dev-mcp-server), ARCH-BCTC-PIPELINE-DURABILITY(P1 architect umbrella). recurring-bug-escalation: architect BRIEFED (2nd recurrence; first fix was a one-time flush not hardening). recurrence_count held at 2 (no new outage event — same incident triaged)."),
      followon_children: ["FIX-BCTC-ENRICH-SILENT-0ROWS","FIX-HNX-SESSION-COOKIE","FIX-SSC-C111-EMPTY-FALLBACK","FIX-BCTC-ZERO-URL-ALERT","FIX-BCTC-FRESHNESS-GATE","ARCH-BCTC-PIPELINE-DURABILITY"],
      architect_briefed: true
    }
    else . end)

# --- (4) board meta -----------------------------------------------------------
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
