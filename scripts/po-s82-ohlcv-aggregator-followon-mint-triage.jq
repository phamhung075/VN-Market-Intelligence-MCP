# po-s82-ohlcv-aggregator-followon-mint-triage.jq
#
# Single-pass dual-mint + signal-ack triage for the two cycle-277 OHLCV
# aggregator follow-ons (qa→po, both PENDING). The aggregator WRITER fix
# (FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0) is APPROVED + DEPLOYED — these
# two are INDEPENDENT of the ~08:00 UTC behavioral-gate proof:
#
#  1. FIX-OHLCV-STRANDED-ROWS-REPAIR-P1  → ready[]   (leads — live MARKET
#     poison "giá 0 dưới BB" repair; recompute-on-read OR delete-synthetic
#     + corpus re-flow via writeOhlcvBatch; NEVER mask a flat zero-vol seed).
#  2. FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2 → backlog[] (distinct
#     writer-adjacent gap: detectAndNormalizeScaleFromPrevClose is a no-op
#     when prevClose=0 — needs a real exchange reference-price seed for
#     tickers with no historical vol>0 candle; generic, no allowlist).
#
# Both flip their PENDING signal_queue row → TRIAGED (NOT RESOLVED — the
# fixes have not shipped; RESOLVED only when done_verified).
#
# Idempotent: each mint skipped if id already in ANY board array; each
# signal flip guarded by status!=TRIAGED. Re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s82-ohlcv-aggregator-followon-mint-triage.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp \
#   && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#   && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   # commit orch-state by EXPLICIT PATH; PUSH HELD (PO's out-of-band call).

# ── id-presence guard: true if id is in ANY task_board array ──
def _in_board($id):
  [ .task_board | to_entries[] | select(.value|type=="array") | .value[]
    | (.id // .task_id // "") ] | any(. == $id);

. as $root
| .task_board.ready as $ready0
| .task_board.backlog as $backlog0

# ── Mint 1: stranded-rows repair → ready[] (leads) ──
| (if _in_board("FIX-OHLCV-STRANDED-ROWS-REPAIR-P1") then .
   else .task_board.ready += [{
     id: "FIX-OHLCV-STRANDED-ROWS-REPAIR-P1",
     title: "FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 — repair corrupt 2026-06-16 daily_ohlcv rows written by pre-fix aggregator image (DCR/H11/DAG + ~773 flat-seed)",
     type: "FIX",
     owner: "po",
     status: "READY",
     priority: "P1",
     zone: "apps/mcp-server/",
     next_agent: "dev-mcp-server",
     created_at: $now,
     source_signal: "qa-cycle277-ohlcv-aggregator-followon-stranded-rows-1781589850",
     root_cause: "Stranded rows already in daily_ohlcv from the PRE-FIX image (before the 06:59Z rebuild): DCR close=5900 flat vol0, H11 close=25700 flat vol0, DAG close=0, plus ~773 flat zero-vol O=H=L=C seed bars. The APPROVED writer fix (FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0) only blocks NEW poison — it does NOT touch residue already persisted. These rows serve LIVE and are the 'giá 0 dưới BB' MARKET-post poison source.",
     fix_spec: "Repair the residue GENERICALLY (no per-ticker allowlist, no date literal): EITHER recompute-on-read in the daily_ohlcv read path, OR delete-the-synthetic-bar (flat zero-vol O=H=L=C and close=0 rows) then re-flow the affected corpus through writeOhlcvBatch so the normalized re-seed is authoritative. A flat zero-vol seed bar is itself FAKE data — it MUST be removed/recomputed, NEVER masked (/goal#1 no fake/synthetic served value).",
     generic_mandate: "Repair predicate keys on row SHAPE (flat zero-vol O=H=L=C, close=0, or unit-scale outlier vs prevClose), NOT on a hardcoded ticker set or the 2026-06-16 date — so it catches any past/future stranded synthetic bar. /goal#2.",
     verification_gate: "RAW-probe daily_ohlcv after repair: DCR/H11/DAG and the ~773 flat-seed rows are gone or recomputed to real candles; get_market_snapshot + the BB/RSI read path no longer serve giá 0; live MARKET 'giá 0 dưới BB' poison cleared. done_verified withheld until RAW-verified live.",
     scope: "data-repair (residue), SEPARATE from the writer code fix which is APPROVED+DEPLOYED.",
     files: ["apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts","apps/mcp-server/src/scheduler/market-data/allzeroOhlcvBackfill.ts","apps/mcp-server/src/application/usecases/ohlcvWriteService.ts"],
     baseline_pass: true,
     size: "S",
     wip_note: "LEADS the class3 follow-on — same apps/mcp-server zone owner; serialize, stranded-rows first (live MARKET poison)."
   }] end)

# ── Mint 2: class3 cold-start exchange seed → backlog[] (distinct, larger) ──
| (if _in_board("FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2") then .
   else .task_board.backlog += [{
     id: "FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2",
     title: "FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2 — PDN/NHD ÷1000 leak: detectAndNormalizeScaleFromPrevClose no-op when prevClose=0; source exchange reference-price seed",
     type: "FIX",
     owner: "po",
     status: "BACKLOG",
     priority: "P2",
     zone: "apps/mcp-server/",
     next_agent: "ba",
     created_at: $now,
     source_signal: "qa-cycle277-ohlcv-aggregator-followon-class3-colstart-1781589851",
     root_cause: "PDN (serves 105.2 vs prior real close 99,800) and NHD (118.6 vs prior 92,500) still land ÷1000. detectAndNormalizeScaleFromPrevClose (ohlcvWriteService.ts:300-305) is a NO-OP when prevClose=0; fetchPrevCloseMap returns 0 for any code with no prior real vol>0 candle in daily_ohlcv (cold-start). Generic scale-detection code is CORRECT — the gap is MISSING exchange reference-price seed data for cold-start tickers.",
     fix_spec: "Source a REAL exchange reference price (e.g. priceBoard / reference_price from the live exchange feed via syncVnstockData or the price-board source) to seed the cold-start scale baseline so detectAndNormalizeScaleFromPrevClose has a non-zero prevClose to compare against. NOT a writer change — a seed-data sourcing task. Distinct from FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (write-path normalize) and FIX-OHLCV-CORP-ACTION-CONTINUITY (boundary discontinuity).",
     generic_mandate: "Reference-price seed sourced live per-ticker from the exchange feed — NO hardcoded PDN/NHD price literal, NO allowlist. Any cold-start ticker (no historical vol>0 candle) gets a real seeded baseline. /goal#1 real fetched data, /goal#2 generic.",
     verification_gate: "RAW-probe: PDN serves ~99,800-band and NHD ~92,500-band (not ÷1000); plausibility-checked vs the live exchange reference price; generic across cold-start tickers, not just PDN/NHD.",
     scope: "seed-data sourcing (cold-start reference price) — needs ba spec for the reference-price source contract.",
     files: ["apps/mcp-server/src/application/usecases/ohlcvWriteService.ts","apps/mcp-server/src/application/usecases/syncVnstockData.ts"],
     baseline_pass: true,
     size: "M"
   }] end)

# ── Flip both PENDING signal rows → TRIAGED (NOT RESOLVED) ──
| .signal_queue.rows |= (map(
    if (.id == "qa-cycle277-ohlcv-aggregator-followon-stranded-rows-1781589850")
       and ((.status // "") != "TRIAGED")
    then . + {status: "TRIAGED", triaged_by: "po-s82", triaged_at: $now,
              minted_task: "FIX-OHLCV-STRANDED-ROWS-REPAIR-P1", minted_lane: "ready"}
    elif (.id == "qa-cycle277-ohlcv-aggregator-followon-class3-colstart-1781589851")
       and ((.status // "") != "TRIAGED")
    then . + {status: "TRIAGED", triaged_by: "po-s82", triaged_at: $now,
              minted_task: "FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2", minted_lane: "backlog"}
    else . end))

# ── CONSERVATION guard: ready += exactly N stranded-mint, backlog += class3-mint ──
| ( (.task_board.ready | length) as $r1
  | (.task_board.backlog | length) as $b1
  | if ($r1 == ($ready0 | length) + (if ($root | _in_board("FIX-OHLCV-STRANDED-ROWS-REPAIR-P1")) then 0 else 1 end))
       and ($b1 == ($backlog0 | length) + (if ($root | _in_board("FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2")) then 0 else 1 end))
    then .
    else error("CONSERVATION FAIL: ready \($ready0|length)->\($r1) backlog \($backlog0|length)->\($b1)")
    end )
