# po-s83-ohlcv-startup-seeder-mint-aggregator-p0-overturn.jq
# TARGETED MINT (2026-06-16 ~08:22Z router LIVE RAW finding — purge defeated by a same-boot startup seeder).
#
# THE FINDING (router LIVE-probed the named-volume DB — do NOT re-litigate, act on it):
#   08:16:39Z boot: purgeStrandedSeedRows() deletes 23,707 flat zero-vol bars (CLEAN — no real data lost).
#   08:19:13Z (~2.5 min AFTER purge, SAME boot): a STARTUP SEEDER (ISO-Z updated_at writer) writes 636 NEW
#     flat zero-vol O=H=L=C bars for 2026-06-16 (production=619, NULL=4 = DAG-class 0|0|0|0).
#   08:22:13Z: a DIFFERENT writer (non-Z updated_at) overwrites TRADED tickers with real vol>0 candles
#     (MWG/MBB/VRE/NVL/VCI/HSG now correct). The ~636 illiquid/unfetched tickers KEEP the flat seed ->
#     poisoned single-digit RSI + "giá 0 dưới BB" false-breakout alerts, served LIVE on every consumer.
#   ROOT: the ISO-Z ~08:19 startup seeder (suspect runOhlcvStartupProbe()/seed-today path, runs AFTER
#     purge in startScheduler.ts) is STILL un-migrated -> emits flat vol=0 placeholder bars bypassing FR-S1.
#     d4b532be migrated the daily aggregator but NOT this seeder path = the RED-handoff's PRIMARY GAP.
#
# MUTATIONS (all idempotent, id-guarded across ALL board arrays):
#  M1  MINT FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 (P0, dev-mcp-server) -> ready[]  (PRIMARY GAP — coding lane, leads)
#  M2  OVERTURN gate-state on FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 (in done[]): status DONE -> SUPERSEDED_PARTIAL,
#      done_verified:false, stamp the RED behavioral gate + superseded_by link (the writer-fix migrated the aggregator
#      but NOT the startup seeder; QA-approved code is correct-but-incomplete — its LIVE effect is RED). In-place
#      annotate (stays in done[] — partial work shipped, NOT reverted; the new P0 finishes the migration).
#  M3a ANNOTATE FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review[]) — keep in review, append a live_source_note: the giá=0 /
#      single-digit-RSI source is STILL LIVE (636 flat seeds), do NOT advance to done_verified. (no status change)
#  M3b ANNOTATE FIX-ALERT-OPEN-ZERO-PRICE-RACE (backlog HELD) — keep HELD, append a live_source_note + add the new
#      P0 to its depends[] so it stays held until the seeder is killed. (no status change)
#
# NON-MUTATIONS (asserted held, placement guard — never moved):
#  - FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 stays done_verified (parent — majors healed; NOT reopened).
#  - FIX-ALERT-ENGINE-RSI-SINGLEDIGIT stays review[] (annotated, not relocated).
#  - FIX-ALERT-OPEN-ZERO-PRICE-RACE stays backlog (annotated, not relocated).
#  - .head untouched (on active frontend wave FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH coding WIP — po does NOT repoint).
#  - FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 stays in done[] (in-place overturn, NOT relocated — preserves history).
#
# Conservation (harness asserts): ready +1 (M1 mint), backlog/review/done/done_verified/in_progress array LENGTHS
#  byte-stable except ready; total entries +1. M2/M3 are in-place field edits (no length change).
# Idempotency: M1 id-guard, M2 status-guard (skip if already SUPERSEDED_PARTIAL), M3 marker-guard (live_source_note).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s83-ohlcv-startup-seeder-mint-aggregator-p0-overturn.jq docs/data/orch/orch-state.json

# --- id presence helper: true if id already exists in ANY board array ---
def id_present($id):
  [ .task_board | to_entries[] | select(.value|type=="array") | .value[] | (.id // .task_id // "") ] | any(. == $id);

# ===== M1 MINT FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 -> ready[] (PRIMARY GAP — coding lane, leads) =====
( if id_present("FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0") then .
  else .task_board.ready += [{
    id: "FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0",
    title: "Kill the startup seeder that re-writes 636 flat zero-vol O=H=L=C placeholder bars AFTER purgeStrandedSeedRows() in the same boot — un-migrated, bypasses FR-S1",
    type: "FIX",
    status: "READY",
    priority: "P0",
    zone: "apps/mcp-server/",
    dev_agent: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    blocking: true,
    leads: true,
    parent: "FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0",
    supersedes_gate: "FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 (its behavioral gate is RED — aggregator migrated, startup seeder NOT)",
    root_cause: "A STARTUP SEEDER (the ISO-Z updated_at writer at ~08:19:13Z, suspect runOhlcvStartupProbe() or a 'seed today's candle' path in startScheduler.ts that runs ~2.5 min AFTER purgeStrandedSeedRows() in the SAME boot) is STILL un-migrated. It emits 636 flat O=H=L=C vol=0 placeholder bars for date=today for tickers without real data (production=619, NULL=4 = DAG-class 0|0|0|0), bypassing FR-S1. The 08:22Z real-candle writer overwrites only the ~TRADED tickers (MWG/MBB/VRE/NVL/VCI/HSG correct), so the ~636 illiquid/unfetched tickers KEEP the flat seed -> poisoned single-digit RSI + 'giá 0 dưới BB' false-breakout alerts served LIVE on alert engine + MARKET posts + dashboard. This is the RED-handoff PRIMARY GAP: d4b532be (FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0) migrated the daily aggregator but NOT this seeder path.",
    raw_evidence: "Router LIVE-probed named-volume DB 2026-06-16 ~08:22Z: 636 NEW flat bars date=2026-06-16 updated_at ISO-Z format 2026-06-16T08:19:13.183Z (production=619, NULL=4); a 08:22:13Z non-Z writer overwrote traded tickers with real vol>0; ~636 illiquid keep the flat seed. Purge-damage check CLEAN (FPT/MBB/MWG/VHM/VIC/VRE 38-39 rows all vol>0, none deleted; the 23,707 was legit ~636/day x ~37 days). NO real data lost.",
    fix_spec: "1) Find the writer with the ISO-Z updated_at (e.g. 2026-06-16T08:19:13.183Z) that emits the 636 flat zero-vol O=H=L=C bars at startup; trace from startScheduler.ts -> runOhlcvStartupProbe() and any seed-today path. 2) Fix GENERICALLY (/goal#2, no ticker/date allowlist): PREFERRED (per /goal#1 no fake data) option (b) — STOP seeding placeholder bars: if no real data for a ticker, write NO row (leave the gap; real fetch / taOhlcvBackfill fills it). Fallback option (a) — route the seeder through writeOhlcvBatch so FR-S1 rejects the flat seed. Architect adjudicates (a)-vs-(b) ONLY if a consumer hard-requires a row-per-ticker-per-day. 3) Defense-in-depth boot ORDERING: purgeStrandedSeedRows() must run AFTER any seeder, OR the seeder must never emit. KEEP the prior repair d4dcb5c4 (purgeStrandedSeedRows) — it is correct code, just undone live by this seeder; do NOT revert it.",
    files: ["apps/mcp-server/.../startScheduler.ts", "apps/mcp-server/.../runOhlcvStartupProbe() (suspect ISO-Z seeder)", "apps/mcp-server writeOhlcvBatch path / FR-S1 seed-rejection", "apps/mcp-server purgeStrandedSeedRows() (d4dcb5c4 — keep, re-order)"],
    generic_mandate: "Generic across the full ticker universe + every boot — no ticker/date allowlist. No served bar may carry a flat zero-vol O=H=L=C placeholder close (/goal#1 no fake data + /goal#2 generic). Option (b) write-no-row preferred over option (a) seed-then-reject.",
    verification_gate: "REGRESSION TEST that BOOTS the scheduler (or simulates the seed path) and asserts ZERO flat zero-vol O=H=L=C rows exist for today AFTER full startup. PLUS RAW post-rebuild LIVE: query named-volume daily_ohlcv date=latest -> 0 flat vol=0 O=H=L=C seeds (Class 1), 0 all-zero 0|0|0|0 bars (Class 2, incl DAG), across the FULL universe (not just traded tickers); get_technical_indicators on previously-poisoned illiquid tickers returns real-band RSI or honest N/A (never single-digit from a flat seed).",
    rebuild_required: true,
    sequence_note: "Sequenced AHEAD of lower-pri ready[] items (data-integrity P0, live fake data on 636 served tickers, user-reported). po does NOT spawn and does NOT repoint .head (head is on the active FIX-ERRAUDIT-W2 frontend coding wave); the router/dispatcher claims+spawns when a coding slot frees (WIP<=2; in_progress = ARCH-CRON-SCHEDULER-RELIABILITY).",
    created_at: $now,
    created_by: "po-s83"
  }] end )

# ===== M2 OVERTURN gate-state on FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 (in-place in done[]) =====
| ( [ .task_board.done[] | select((.id // .task_id) == "FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0") | .status ] | any(. == "SUPERSEDED_PARTIAL") ) as $already_overturned
| if $already_overturned then .
  else .task_board.done |= map(
    if (.id // .task_id) == "FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0"
    then . + {
      status: "SUPERSEDED_PARTIAL",
      done_verified: false,
      behavioral_gate: "RED",
      behavioral_gate_at: $now,
      superseded_by: "FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0",
      overturn_note: "QA-APPROVED code (d4b532be) is CORRECT-but-INCOMPLETE: it migrated the daily aggregator through writeOhlcvBatch but NOT the STARTUP SEEDER (ISO-Z ~08:19 writer, suspect runOhlcvStartupProbe). Router LIVE-probed the named-volume DB 2026-06-16 ~08:22Z: 636 NEW flat zero-vol O=H=L=C bars (production=619, NULL=4) written AFTER purgeStrandedSeedRows() in the SAME boot -> the behavioral gate is RED, the giá=0 / single-digit-RSI source is STILL LIVE on ~636 illiquid tickers. NOT done_verified. Partial work shipped — do NOT revert d4b532be (aggregator migration is good); the new P0 finishes the migration (the seeder path). The prior purge repair d4dcb5c4 is also correct, just undone live by the seeder.",
      overturn_by: "po-s83"
    }
    else . end ) end

# ===== M3a ANNOTATE FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review[]) — keep in review, no status change =====
| if ( [ .task_board.review[] | select((.id // .task_id) == "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT") | .live_source_note ] | any(. != null) )
  then .
  else .task_board.review |= map(
    if (.id // .task_id) == "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT"
    then . + {
      live_source_note: "HOLD in review — do NOT advance to done_verified. The single-digit RSI / giá=0 source is STILL LIVE: router RAW-found 636 flat zero-vol O=H=L=C seed bars (2026-06-16 ~08:19Z) re-poison illiquid-ticker RSI after the 08:16 purge. Root = FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 (minted po-s83). Gate stays RED until that seeder is killed AND a clean post-fix market open is observed. Secondary: the user's alert showed NVL with TWO RSI values (26.5 AND 23.9) in one report = likely alert-engine-vs-canonical candle-count divergence (same-DB tools diverge on rowcount) — captured HERE, not a new task.",
      live_source_note_at: $now,
      live_source_note_by: "po-s83"
    }
    else . end ) end

# ===== M3b ANNOTATE + extend depends[] on FIX-ALERT-OPEN-ZERO-PRICE-RACE (backlog HELD) — keep HELD =====
| if ( [ .task_board.backlog[] | select((.id // .task_id) == "FIX-ALERT-OPEN-ZERO-PRICE-RACE") | .live_source_note ] | any(. != null) )
  then .
  else .task_board.backlog |= map(
    if (.id // .task_id) == "FIX-ALERT-OPEN-ZERO-PRICE-RACE"
    then . + {
      depends: ((.depends // []) + (if ((.depends // []) | any(. == "FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0")) then [] else ["FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0"] end)),
      live_source_note: "Stay HELD — the flat zero-vol O=H=L=C seed bar this task's giá=0 BB-breakout fires on is STILL LIVE: router RAW-found 636 such bars (2026-06-16 ~08:19Z) re-seeded AFTER the 08:16 purge by an un-migrated startup seeder. Real root = FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 (minted po-s83), added to depends[]. Do NOT dispatch until that seeder is killed AND the RSI gate observes a clean post-fix open.",
      live_source_note_at: $now,
      live_source_note_by: "po-s83"
    }
    else . end ) end
