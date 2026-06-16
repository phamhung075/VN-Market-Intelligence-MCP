# po-s90-infocard-expand-fetch-mint.jq
# Single-pass id-guarded MINT of the INFOCARD-EXPAND-FETCH epic (3 FIX tasks) into
# .task_board.backlog[]. Originated 2026-06-16 from a user BUG+enhancement report on the
# "Tác động Macro — FPT" cascade-macro card (NEUTRAL / 50% tin cậy / Invalid Date) requesting:
#   (1) generic click-to-expand dropdown for ALL info cards (not FPT/macro-only),
#   (2) Invalid Date root-cause fix,
#   (3) full cascade detail FETCHED (real data, not the flattened `detail` string).
#
# RECON-ANCHORED (router first-hand, NOT relayed badges):
#   - FE component: apps/frontend/app/routes/dashboard.analysis.tsx:731 MacroImpactPanel
#     (rendered :1518 <MacroImpactPanel cascadeSignals=.. stock=..>).
#   - Data source: fetchCascadeSignals() client.ts:565 -> GET /mcp/api/signals/stock/:code?type=chain_catalyst
#     -> backend route apps/mcp-server/src/interface/mcp/server.ts:1327-1432.
#   - Invalid Date root: dashboard.analysis.tsx:780 new Date(sig.createdAt.replace(" ","T")+"Z")
#     — single-space replace + blind +"Z" corrupts an already-ISO/offset/empty created_at.
#     Backend serves raw SQLite created_at (server.ts:1402), format varies -> NaN -> "Invalid Date".
#   - DATA-GAP (CONFIRMED): the endpoint FLATTENS finding_data+payload into ONE `detail` string
#     (server.ts:1389-1404) and DISCARDS the rest. The full cascade detail IS STORED in
#     agent_signals.finding_data (ChainCatalystFindingDataSchema signalTypes.ts:90): event_type,
#     direction, confidence, affected_stocks[], affected_sectors[], headline, source, +optional
#     imfSentiment{reasoning}, newsSentiment, kinhDichConfidence, agentSignalsMajority,
#     catalyst_stock_code, time_to_price_move. -> dropdown REAL detail REQUIRES a backend change
#     (FIX-SIGNALS-STOCK-FULL-DETAIL, dev-mcp-server) — it is NOT fetchable today.
#
# Idempotent: each task skipped if its id is already present in ANY board array (re-run mints 0).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s90-infocard-expand-fetch-mint.jq docs/data/orch/orch-state.json
# Atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH. PUSH HELD (PO out-of-band).

. as $root
| ( [ .task_board[]? | if type=="array" then .[]? else empty end | .id? // empty ] ) as $allids
| ( [
    {
      "id": "FIX-SIGNALS-STOCK-FULL-DETAIL",
      "epic": "INFOCARD-EXPAND-FETCH",
      "title": "Expose full cascade detail on GET /api/signals/stock/:code — stop flattening finding_data into one `detail` string",
      "type": "FIX",
      "status": "BACKLOG",
      "priority": "P2",
      "blocking": true,
      "zone": "apps/mcp-server/",
      "dev_agent": "dev-mcp-server",
      "user_request": "Cascade-macro info card must show FULL FETCHED detail on expand (drivers, chain, affected tickers/sectors, magnitude, source, timestamp) — real data only, never placeholder.",
      "root_cause": "apps/mcp-server/src/interface/mcp/server.ts:1389-1404 projects each agent_signals row into ONLY {id, stock_code, signal_type, direction, confidence_score, detail, created_at} — collapsing the rich finding_data+payload JSON into a single `detail` string and discarding affected_stocks[], affected_sectors[], headline, source, event_type, imfSentiment.reasoning, newsSentiment, kinhDichConfidence, agentSignalsMajority, catalyst_stock_code, time_to_price_move. The data IS stored (ChainCatalystFindingDataSchema, signalTypes.ts:90) — only the endpoint hides it.",
      "fix_spec": "Pass the structured finding_data fields through the /api/signals/stock/:code response (e.g. add a `finding` object or named columns per row) sourced from the existing finding_data JSON (already parsed at server.ts:1379-1381). Keep `detail` for back-compat. GENERIC: shape must serve ANY signal_type's finding_data (chain_catalyst here, but price_confirmation/verified_chain/urgent_news rows flow through the same route) — do not special-case chain_catalyst. created_at MUST be normalised to a single canonical ISO-8601 UTC string server-side (fixes the Invalid Date class at the source — see FIX-CASCADE-CARD-INVALID-DATE for the FE guard).",
      "files": [
        "apps/mcp-server/src/interface/mcp/server.ts (signals/stock route ~1327-1432)"
      ],
      "generic_mandate": "Surface the full stored finding_data for ALL signal types via this endpoint, not a chain_catalyst/FPT one-off (/goal#2). REAL fetched data only — no placeholder/stub fields (/goal#1).",
      "verification_gate": "RAW: curl GET /mcp/api/signals/stock/FPT?type=chain_catalyst on the live named-volume DB returns affected_sectors[], affected_stocks[], headline, source (non-empty, REAL) for a real chain_catalyst row + a canonical-ISO created_at; spot-check a 2nd ticker + a non-cascade signal_type row also carries its finding_data.",
      "depends_consult": "dev-macro-indicators — ONLY if live finding_data.imfSentiment / macro driver fields are empty on real rows (driver provenance is macro-service-owned); otherwise no macro change needed (cascade engine already populates finding_data in mcp-server).",
      "rebuild_required": true,
      "created_at": $now,
      "created_by": "po-s90"
    },
    {
      "id": "FIX-CASCADE-CARD-INVALID-DATE",
      "epic": "INFOCARD-EXPAND-FETCH",
      "title": "Fix \"Invalid Date\" on the cascade-macro info card — definitif date-parse guard, not a symptom patch",
      "type": "FIX",
      "status": "BACKLOG",
      "priority": "P2",
      "fast_track": true,
      "zone": "apps/frontend/",
      "dev_agent": "dev-frontend",
      "user_request": "The card shows 'Invalid Date' instead of a readable timestamp.",
      "root_cause": "apps/frontend/app/routes/dashboard.analysis.tsx:780 — new Date(sig.createdAt.replace(\" \",\"T\")+\"Z\").toLocaleDateString(\"vi-VN\"). The single-space .replace + blind +\"Z\" only works for a bare \"YYYY-MM-DD HH:MM:SS\" SQLite string; an already-ISO (has T), millisecond/offset, or non-standard created_at -> NaN -> 'Invalid Date'. The empty-string case falls to '—' but a PRESENT-but-non-bare value yields the live 'Invalid Date'.",
      "fix_spec": "Replace the ad-hoc string surgery with a single robust ISO-aware parse helper (accepts bare-SQLite, ISO-with-T, with/without ms/offset; returns null on unparseable) and render the localized date OR a graceful '—' fallback — NEVER 'Invalid Date'. Prefer the FE consuming the canonical-ISO created_at once FIX-SIGNALS-STOCK-FULL-DETAIL normalises it server-side; the FE helper is the defence-in-depth guard so any future non-ISO source still degrades gracefully. GENERIC: factor the helper so every card that renders a created_at/timestamp uses it (search for new Date(...).toLocale* across dashboard.* — sector-cascade.tsx:223/549 etc. share the class).",
      "files": [
        "apps/frontend/app/routes/dashboard.analysis.tsx (MacroImpactPanel ~780)",
        "apps/frontend/app/lib/ (shared date-parse helper — new or existing date util)"
      ],
      "generic_mandate": "One reusable date-parse helper used by ALL timestamp renders (/goal#2) — never per-card .replace surgery; output is localized-or-'—', never 'Invalid Date'.",
      "verification_gate": "Live dashboard: the 'Tác động Macro' card renders a real readable vi-VN date for a real chain_catalyst row; a deliberately-ISO and a deliberately-malformed created_at both render gracefully (date or '—'), zero 'Invalid Date' in the rendered DOM.",
      "rebuild_required": true,
      "created_at": $now,
      "created_by": "po-s90"
    },
    {
      "id": "FIX-INFOCARD-DROPDOWN-EXPAND",
      "epic": "INFOCARD-EXPAND-FETCH",
      "title": "Generic click-to-expand dropdown for ALL dashboard info cards revealing full FETCHED detail",
      "type": "FIX",
      "status": "BACKLOG",
      "priority": "P2",
      "zone": "apps/frontend/",
      "dev_agent": "dev-frontend",
      "depends": ["FIX-SIGNALS-STOCK-FULL-DETAIL"],
      "user_request": "Every info card must be click-to-expand (a dropdown) that reveals the FULL detail on click — the current summary (NEUTRAL / 50% tin cậy / date only) is too generic to understand.",
      "root_cause": "Info cards (MacroImpactPanel cascade rows, and peer cards across dashboard.analysis.tsx / dashboard.*.tsx) render ONLY a one-line summary with no affordance to see the full detail. The user cannot follow what a NEUTRAL/50% cascade event actually means.",
      "fix_spec": "Build a single reusable expand-on-click (dropdown/disclosure) primitive — collapsed summary row, click toggles an expanded panel rendering the full fetched detail (for the cascade card: event_type, headline, affected_sectors[], affected_stocks[], source, imfSentiment.reasoning, magnitude/confidence, normalized timestamp — sourced from FIX-SIGNALS-STOCK-FULL-DETAIL's enriched payload). Accessible (keyboard + aria-expanded). GENERIC: the primitive is card-agnostic and adopted by ALL such info cards, NOT a one-off for the macro/FPT card. Vietnamese labels for all user-facing text.",
      "files": [
        "apps/frontend/app/routes/dashboard.analysis.tsx (MacroImpactPanel + peer cards)",
        "apps/frontend/app/components/ (new reusable ExpandableCard/Disclosure primitive)"
      ],
      "generic_mandate": "ONE reusable expand-on-click primitive adopted by ALL info cards (/goal#2 — no per-ticker/per-card hardcode). Expanded panel shows REAL fetched detail only (/goal#1) — never placeholder/stub; if a field is genuinely absent, show an honest empty-state, not a fabricated value. Vietnamese-only user-facing strings.",
      "verification_gate": "Live dashboard: the cascade-macro card (and ≥1 peer info card) collapses to a summary and expands on click to show REAL fetched full detail (affected sectors/stocks, headline, source, reasoning) pulled from the live endpoint; keyboard-toggle + aria-expanded work; no placeholder text in any expanded panel.",
      "rebuild_required": true,
      "created_at": $now,
      "created_by": "po-s90"
    }
  ] ) as $mints
| ( [ $mints[] | select(.id as $i | ($allids | index($i)) | not) ] ) as $new
| .task_board.backlog += $new
| ._mint_count = ($new | length)
