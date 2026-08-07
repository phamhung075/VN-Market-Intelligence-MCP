# PO triage 2026-08-07T03:23Z — dev-team Step 1, 3rd same-day tick
#   1. Mint FIX-AUDIT-OUTPUT-CONTRACT-V3-DASHBOARDROWS-NO-INDEPENDENT-CROSSCHECK (report 4482 root cause)
#   2. UNBLOCK FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN (owner of C-09 / report 4481; stranded with no next_agent)
#   3. Mark the 3 NEW system-auditor Tier-3 signal rows triaged with dispositions
#   4. Stamp last_triaged_at / last_triaged_by
# Apply: jq -f <this file> docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def TS: "2026-08-07T03:23:07Z";

# ── 1. Mint the audit-output-contract V3 row ───────────────────────────────
.task_board.backlog += [{
  id: "FIX-AUDIT-OUTPUT-CONTRACT-V3-DASHBOARDROWS-NO-INDEPENDENT-CROSSCHECK",
  type: "FIX",
  status: "BACKLOG",
  priority: "P2",
  zone: "cross-service/",
  title: "audit-output-contract V3 fires 'dashboard_rows=0' from markers alone while 3 real DASHBOARD.md rows exist — no independent artifact cross-check (V1 has one, V3 does not)",
  next_agent: "developer",
  created_at: TS,
  created_by: "po (triage 2026-08-07T03:23Z)",
  origin_report_id: "4482",
  origin_signal_id: "sys-20260807T030603-1e90",
  the_actual_defect: "scripts/audit-output-contract.sh:268 V3 tests `dashboard_rows == 0 AND signals_posted > 0`. `dashboard_rows` is incremented ONLY by '[emit-dashboard] OK ' lines parsed from $MARKERS_FILE (L185-187) and has NO independent re-read of the real artifact. Its sibling counter `signal_queue_rows_written` DOES get a ground-truth cross-check against .signal_queue.rows[] (V1, L209-252, take-the-max). That asymmetry means any marker-plane slip on the dashboard side produces a materially FALSE alarm, while the identical slip on the signal_queue side is silently self-corrected.",
  po_live_evidence_20260807T0323: "Telegram report 4482 fired 2026-08-07T03:06:42Z with signals_posted=3 / dashboard_rows=0. All 3 DASHBOARD.md rows DID land, 12-14s LATER: commits eda85ef88 (C-04, 03:06:54Z), 2f329384a (C-08, 03:06:55Z), 00be3fcab (C-09, 03:06:56Z), each naming its signal id, all present in docs/data/DASHBOARD.md L734-765. So the artifact was written and the alert was materially wrong about it.",
  mechanism_proof: "signals_posted=3 is decisive: V1's take-the-max reconciliation writes back ONLY to signal_queue_rows_written (L250), never to signals_posted. So signals_posted=3 can only have come from 3 counted marker lines actually present in $MARKERS_FILE at 03:06:42Z, while 0 '[emit-dashboard] OK' lines were present. The cycle's markers file was docs/agent-memory/.auditor-cycle-markers-2026-08-07T02:00Z.tmp (FIRE_TICK derived from the signal row's audit_cycle_tag 'cron:auditor-t3:2026-08-07T02:00Z'); it is absent now because flow/main.md:1017 mandates `rm -f $MARKERS_FILE` at cycle end — expected, not evidence of loss.",
  trigger_this_time: "Step-ordering inversion in the Tier-3 run: docs/agents/system-auditor/flow/main.md puts the DASHBOARD append + its marker paste (L795, L1005) BEFORE the audit-output-contract.sh call (L1011). This cycle ran the contract check first and appended the dashboard rows afterwards. Corroborating: notebook entry c74 (03:06:29Z) contains NO marker lines and NO [OUTPUT-CONTRACT] line at all, unlike c73 which has the full block that main.md:1017 mandates.",
  do_not_misread: "This is NOT a stale-read race on docs/data/DASHBOARD.md — audit-output-contract.sh never opens that file. It is NOT the V4/V5 SKIP-dedup denominator bug (owned by FIX-AUDIT-OUTPUT-CONTRACT-V4-V5-DEDUPSKIP-DENOMINATOR-FALSE-VIOLATION; V2/V3 are denominator-symmetric because dashboard_rows also increments on SKIP-dedup). It is NOT the signal_queue_rows_written mismatch (owned by FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH, REVIEW).",
  prior_art_check_result: "Two prior PO ticks declined to mint this, deferring to FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS (see docs/agent-memory/decisions/triage-20260805T1853Z-po.md:11 and triage-20260806T1857Z-po.md:64). That deferral target is (a) absent from EVERY orch-state bucket today and (b) scoped to signals_posted counting calls that wrote zero agent_signals rows (commit a394e9edb, flipped REVIEW in a42fb930e) — a different counter on a different plane. The deferral chain never covered dashboard_rows.",
  acceptance: [
    "AC-1: dashboard_rows gets an independent ground-truth cross-check symmetric with V1 — re-read docs/data/DASHBOARD.md and count rows whose 'Last reported:' line names a signal id belonging to THIS cycle (scope via --cycle-tag / the same audit_cycle_tag already on every signal_queue row), then apply the same documented take-the-max reconciliation V1 uses. emit-dashboard-row.sh already does a `grep -qF \"signal <id>\"` read-back, so the key is proven greppable.",
    "AC-2: V3 must not fire when the rows demonstrably exist on disk for this cycle's signal ids. Regression test derived from THIS cycle's real corpus (markers with 3 emit-signal + 0 emit-dashboard lines, DASHBOARD.md carrying all 3 rows) — not a synthetic fixture.",
    "AC-3: the inverse must still fire loudly — markers claim N dashboard rows but DASHBOARD.md has none for this cycle => VIOLATION. Do not weaken V3 into a warning; it exists to catch narrated-but-unwritten counts.",
    "AC-4: audit whether the DASHBOARD.md path is resolvable in every caller context (5 call sites in system-auditor/flow/main.md + tier1-probe.md + page-freshness.md). If not, V3 must print the same explicit 'crosscheck-unavailable ... not silently passed' WARN that V1 emits at L254, never silently pass.",
    "AC-5: separately note (do not silently fix here) that flow/main.md's mandated ordering — dashboard append and its marker paste BEFORE the contract call — was violated this cycle, and that c74 skipped the mandatory verbatim [OUTPUT-CONTRACT] notebook paste. Report whether an ordering guard belongs in the flow doc or the script."
  ],
  files: [
    "scripts/audit-output-contract.sh",
    "scripts/audit-output-contract.test.sh",
    "docs/agents/system-auditor/flow/main.md"
  ],
  baseline_pass: "scripts/audit-output-contract.test.sh (35/35 green today) must stay green; add the AC-2/AC-3 cases to it.",
  recurring_bug_count: 4,
  recurring: "Telegram reports 4464/4465/4466 (2026-08-06) and 4482 (2026-08-07) are the same [audit-output-contract] false-alarm family. Two PO ticks declined to mint; the alert keeps consuming triage cycles.",
  why_this_is_a_row: "A self-diagnostic that is materially wrong about a durable artifact trains the fleet to ignore it — and V3 is the only guard standing between a genuinely unwritten DASHBOARD row and silence."
}]

# ── 2. UNBLOCK the C-09 owner ─────────────────────────────────────────────
| .task_board.backlog |= map(
    if .id == "FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN" then
      . + {
        next_agent: "developer",
        priority: "P2",
        priority_bumped_from: "P3",
        priority_bumped_at: TS,
        priority_bumped_by: "po (triage 2026-08-07T03:23Z)",
        po_unblocked_at: TS,
        po_unblocked_by: "po",
        po_unblock_note: "Row sat in backlog[] with next_agent UNSET, so no dev-team dispatch lane ever reached it, while its consequence re-fires system-auditor C-09 every Tier-3 cycle. Setting next_agent=developer makes it dispatchable.",
        po_live_evidence_20260807T0323: "Corroborated on a SECOND plane, not just the auditor's own DB query: get_macro_snapshot at 2026-08-07T03:21:14Z returns dataSource='estimate' with oil/gold/usdVnd all is_estimate=true source_tier=4 and round fixture values (82.50 / 2350 / 24500), fetched_at_source=null, and carry.regime suppressed to UNKNOWN ('Carry inputs unavailable — one or more rates are estimated from fixture fallback'). The macro write path is genuinely dead, consistent with macro_indicators having no vietnam rows since 2026-08-04 12:13.",
        po_routing_ruling_20260807: "C-09 (signal sys-20260807T030603-1e90 / telegram report 4481) does NOT get its own row — this row already names macroIndicatorRefreshJob, the writer for macro_indicators. Distinct from FIX-MACRO-INDICATORS-EMPTY-COLUMNS, which is about which COLUMNS the latest row populates, not about row cadence.",
        why_not_cosmetic: "Degraded-but-honest, not falsified: the payload correctly labels is_estimate/source_tier=4 and suppresses the carry regime per DSI-INV-1. P2 not P1 for that reason. But every macro-consuming analysis path is running on a frozen fixture."
      }
    else . end
  )

# ── 3. Disposition the 3 NEW Tier-3 signal rows ───────────────────────────
| .signal_queue.rows |= map(
    if .id == "sys-20260807T030558-798f" then
      . + { status: "triaged",
            po_disposition_20260807T0323: "C-04 financial_reports low-confidence extractions — already owned by FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE (backlog, next_agent=architect). SKIP-dedup this cycle per auditor notebook c74. No new row." }
    elif .id == "sys-20260807T030600-3171" then
      . + { status: "triaged",
            po_disposition_20260807T0323: "C-08 alerts orphan — root cause already found and fixed in FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP (window rebound to the 2h agent_signals TTL + datetime() wrap). Post-fix the check now reports 1 orphan in a 2h window against threshold=0. SKIP-dedup this cycle. Watch-only: if the count stays at exactly 1 across cycles, the threshold=0 is racing a single in-flight alert and needs a row of its own — not established yet, do not mint on one observation." }
    elif .id == "sys-20260807T030603-1e90" then
      . + { status: "triaged",
            po_disposition_20260807T0323: "C-09 macro_indicators stale — TRUE POSITIVE, corroborated live via get_macro_snapshot (tier-4 fixture fallback). Folded into FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN, which this tick unblocked (next_agent=developer, P3->P2). Telegram report 4481 is the E-2 arm of this same emit_audit_signal call (origin=emit-audit-signal.sh, E-1/E-2/E-3 are one unit) — same finding, not a second issue." }
    else . end
  )

# ── 4. Stamp triage ───────────────────────────────────────────────────────
| .task_board.last_triaged_at = TS
| .task_board.last_triaged_by = "po (dev-team Step 1, 3rd same-day tick, dispatcher f298ccf7)"
| .task_board._updated_at = TS
| .task_board._updated_by = "po (triage 2026-08-07T03:23Z)"
