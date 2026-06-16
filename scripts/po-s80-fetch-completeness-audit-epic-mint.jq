# po-s80-fetch-completeness-audit-epic-mint.jq
# Single-pass epic-mint + first-hop-promote for the SOURCE-FETCH-COMPLETENESS audit.
#
# DIRECTIVE (2026-06-16 user): for IMPORTANT served info, verify each source's fetch
# trigger pulls COMPLETE detail (all fields/all rows/all pages), not a partial/stub/
# truncated payload persisted as if complete. Generalizes the OHLCV synthetic-partial
# seed-bar bug (ALLZERO-OHLCV-FETCH, done_verified — the EXEMPLAR + first data point)
# across all important sources. Serves standing real-data goal #2 (no partial served data).
#
# STRUCTURE: one umbrella epic (AUDIT-FETCH-COMPLETE) listing per-source recon children.
# All children minted to backlog[] EXCEPT the chosen first hop, promoted to ready[].
# Children are PLAN-FIRST recon lanes (probe live fetch vs complete-detail def); a FIX
# task is minted only when a recon finds a real partial-persist gap (not pre-emptively).
#
# DEDUP (critical — board already owns most source-completeness surfaces):
#   - PRICE/OHLCV  -> ALLZERO-OHLCV-FETCH [done_verified] = EXEMPLAR, NOT re-audited.
#   - BCTC         -> FIX-BCTC-ENRICH-SILENT-0ROWS [review] + FIX-BCTC-FRESHNESS-GATE /
#                     FIX-BCTC-ZERO-URL-ALERT [ready] + ARCH-BCTC-PIPELINE-DURABILITY
#                     already own the silent-0-rows/partial surface -> NO BCTC child minted.
#   - NEWS         -> FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE [ready] + news backlog cluster
#                     own sibling-dedup/availability -> news completeness = LOW priority child.
# So we mint children ONLY for unaudited completeness surfaces.
#
# IDEMPOTENT: every mint skipped if its id is already in ANY board array. Re-run mints 0.
# Harness: atomic temp -> [ -s ] -> jq empty -> CONSERVATION guard -> mv.
#   CONSERVATION: backlog += (epic + N backlog-children), ready += 1 (first hop),
#                 all other lanes byte-unchanged. total += (1 + N + 1).

($now) as $now

# --- all ids currently anywhere on the board (for idempotency) ---
| ( [ .task_board | to_entries[] | (.value | if type=="array" then .[] else empty end)
    | (.id // .task_id // empty) ] ) as $existing
| ( reduce $existing[] as $i ({}; .[$i] = true) ) as $has   # $has[id]==true if present

# --- epic ---
| ( {
    id: "AUDIT-FETCH-COMPLETE",
    title: "Source-fetch-completeness audit: every IMPORTANT source pulls COMPLETE detail (no partial/stub/truncated persisted-as-complete)",
    type: "SPIKE",
    mode: "audit-epic",
    status: "BACKLOG",
    priority: "P1",
    zone: "multi",
    created_at: $now,
    created_by: "po-s80",
    exemplar: "ALLZERO-OHLCV-FETCH (done_verified) — price/OHLCV now fetches complete O/H/L/C+real volume for all 30 active tickers, 0 partial; 1217-row synthetic-partial corruption fixed+deployed.",
    failure_mode: "A source returns a partial/reference/stub payload (missing fields, zero-volume placeholder, truncated list, silent-0-rows, single-page-of-many) and the writer persists it as if complete -> poisons served metrics.",
    generic_mandate: "Every completeness check + any fix MUST be generic across ALL entities of a source (all tickers / all pages / all series) — NO per-instance allowlist (goal #2).",
    method_per_child: "1) DEFINE complete-detail (objective field/row/page invariant). 2) PROBE live fetch trigger vs def via gateway/RAW (recon-only, ops). 3) If a partial-persist gap is found -> mint a FIX in the persisting zone (dev-mcp-server for the writer). 4) done_verified = live VARIED complete data vs named-volume DB, not a constant.",
    already_covered: ["PRICE/OHLCV=ALLZERO-OHLCV-FETCH(dv)","BCTC=FIX-BCTC-ENRICH-SILENT-0ROWS(review)+FRESHNESS-GATE/ZERO-URL-ALERT(ready)+ARCH-BCTC-PIPELINE-DURABILITY","NEWS-avail=FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE(ready)"],
    children: ["AUDIT-FC-FOREIGN-FLOW","AUDIT-FC-FRED-MACRO","AUDIT-FC-SBV-RATES","AUDIT-FC-NEWS-SENTIMENT"]
  } ) as $epic

# --- per-source recon children (recon-first, PLAN-ONLY until a gap is found) ---
| ( {
    id: "AUDIT-FC-FOREIGN-FLOW",
    epic: "AUDIT-FETCH-COMPLETE",
    title: "Foreign-flow fetch-completeness recon: does each tick pull ALL tradable codes (not a truncated page)?",
    type: "SPIKE", mode: "recon", status: "READY", priority: "P1",
    zone: "apps/mcp-server/", dev_agent: "dev-mcp-server", next_agent: "ops-vps-fetch",
    importance: "HIGH — feeds served foreign net buy/sell direction+delta (user-facing decision); market_hours_only; VPS-proxied (truncated-list/single-page risk).",
    complete_detail_def: "A complete tick writes one vnstock_trading_stats row PER tradable code present in the source response for date=latest, each row carrying the full live contract {code, foreign_volume (signed), foreign_room, current_holding_ratio, max_holding_ratio, market_cap_bn, date, fetched_at} — NO row written with a null/zero placeholder where the source had a real value, and the row-count must track the full universe (≈ exchange-listed set), not a fixed first-N page.",
    probe: "RAW: count distinct codes written this tick vs codes in source payload; assert no fixed cap (e.g. always exactly 50/100); assert fetched_at fresh; sample a known-active code has non-placeholder foreign_room+holding_ratio; verify across >1 tick that the set VARIES with the market (not a constant snapshot).",
    note_dedup: "TASK17-FOREIGN-FLOW is a UI serve-path build (page), NOT a completeness invariant — it even cites a one-day 91-row snapshot. This recon guards the FETCH count/field completeness upstream of that page.",
    created_at: $now, created_by: "po-s80"
  } ) as $c_ff
| ( {
    id: "AUDIT-FC-FRED-MACRO",
    epic: "AUDIT-FETCH-COMPLETE",
    title: "FRED/macro fetch-completeness recon: every configured series pulled to its latest observation (no partial/short series)",
    type: "SPIKE", mode: "recon", status: "BACKLOG", priority: "P2",
    zone: "apps/macro-indicators/", dev_agent: "dev-macro-indicators", next_agent: "ops-mainserver-fetch",
    importance: "MED-HIGH — macro layer (T-15..T-45) feeds served rate/yield/ISM context; F-MACRO-FETCH-DEADLINE(dv) guards HANG, NOT field/series completeness.",
    complete_detail_def: "Each configured FRED series (fred, fred-effr-iorb, fred-ism-subcomponents) writes its FULL requested observation window to the latest available obs date — no series silently short (all-but-one subcomponent), no last-obs frozen older than the series' real latest publish, no NaN-as-value persisted as a real reading.",
    probe: "RAW: for each series id, latest stored obs_date vs FRED's published latest; assert ISM subcomponents = full expected set (not a subset); assert no value=0/NaN sentinel persisted as real.",
    created_at: $now, created_by: "po-s80"
  } ) as $c_fred
| ( {
    id: "AUDIT-FC-SBV-RATES",
    epic: "AUDIT-FETCH-COMPLETE",
    title: "SBV rates/FX fetch-completeness recon: full rate table + FX set pulled (not a partial table)",
    type: "SPIKE", mode: "recon", status: "BACKLOG", priority: "P2",
    zone: "apps/macro-indicators/", dev_agent: "dev-macro-indicators", next_agent: "ops-vps-fetch",
    importance: "MED — SBV policy rates + FX feed served macro context; sbv-vps fetcher has open health flags (FIX-SBV-FX-VPS-FETCHER-UNHEALTHY backlog) — recon guards completeness once healthy, dedups against that fix.",
    complete_detail_def: "SBV fetch writes the COMPLETE rate table (all published rate types) + the full FX reference set for the period, with the effective_date column populated (cf. FU-SBV-EFFECTIVE-DATE-COLUMN) — no partial table, no row with a null rate persisted as a real reading.",
    probe: "RAW: count rate types + FX entries written vs SBV published set; assert effective_date non-null; assert no placeholder.",
    note_dedup: "Sequence AFTER FIX-SBV-FX-VPS-FETCHER-UNHEALTHY (fetcher must be healthy before a completeness verdict is meaningful).",
    created_at: $now, created_by: "po-s80"
  } ) as $c_sbv
| ( {
    id: "AUDIT-FC-NEWS-SENTIMENT",
    epic: "AUDIT-FETCH-COMPLETE",
    title: "News fetch-completeness recon: each source's feed pulled to full page-set (no single-page-of-many truncation)",
    type: "SPIKE", mode: "recon", status: "BACKLOG", priority: "P3",
    zone: "apps/mcp-server/", dev_agent: "dev-mcp-server", next_agent: "ops-mainserver-fetch",
    importance: "LOW-MED — news availability/dedup already owned by FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE(ready) + news backlog; this child ONLY checks per-source feed completeness (maxItems truncation cf. FACTORY-NEWS-dedup-handlers-maxitems), not dedup/availability.",
    complete_detail_def: "Each news source (newsapi, reuters, vneconomy-rss, vnexpress-rss, news-vps) pulls its full available feed up to the configured retention window — a low maxItems must be a deliberate cap, not a silent single-page truncation that drops real items before dedup/sentiment.",
    probe: "RAW: items fetched per source vs feed length; assert maxItems is intentional + documented, not a default that truncates a longer feed.",
    note_dedup: "Strictly completeness-of-feed only; sibling-dedup + false-closed + availability are already tracked — do NOT re-open those.",
    created_at: $now, created_by: "po-s80"
  } ) as $c_news

# --- mint helper: append to backlog only if id not already present anywhere ---
| ( [$epic, $c_fred, $c_sbv, $c_news] | map(select($has[.id] | not)) ) as $to_backlog
| ( [$c_ff]                            | map(select($has[.id] | not)) ) as $to_ready

| .task_board.backlog += $to_backlog
| .task_board.ready   += $to_ready
| ._updated_at = $now
| ._updated_by = "po-s80"
