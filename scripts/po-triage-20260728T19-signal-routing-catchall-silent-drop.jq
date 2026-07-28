#!/usr/bin/env jq -f
# =============================================================================
# po-triage-20260728T19-signal-routing-catchall-silent-drop.jq
# =============================================================================
# PO triage tick 2026-07-28T19:52Z (router/dev-team dispatched, coordination_session 64c7c677)
# Referenced from: docs/agents/po/flow/scripts-registry.md
#
# Invocation (orch-apply is the ONLY legal write path — CLAUDE.md § Orch-State Hot File):
#   jq --arg NOW "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      -f scripts/po-triage-20260728T19-signal-routing-catchall-silent-drop.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# WHAT IT DOES
#   1. PROMOTE  FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE  backlog->ready, low->P1,
#      re-scoped from "add 2 missing type rows" to "close the catch-all silent-drop class".
#      Root cause of the notebook-hygiene starvation quantified below.
#   2. RECHECK   FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH — premise re-verified live,
#      measurement refreshed 211L->343L, next_agent set (was null for 7 days).
#   3. EVIDENCE  GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC — 4 fresh self-edited flow docs.
#   4. ACK       the 2 NEW signal_queue rows addressed to po (NEW->READ + po_disposition).
# =============================================================================

($NOW) as $now

# --- 1 + 2: in-place backlog row updates -------------------------------------
| .task_board.backlog |= map(
    if .id == "FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH" then
      .next_agent = "agent-father"
      | .updated_at = $now
      | .po_recheck_20260728 = "RE-VERIFIED LIVE 2026-07-28T19:4xZ by po (7 days after mint; row sat BACKLOG with next_agent=null that entire time). PREMISE HOLDS, TWO CORRECTIONS. (a) MEASUREMENT REFRESHED: agent-father.md is now 343L / 30730 bytes (was 211L at mint), grep -c '^## ' STILL = 0, with 10 '### ' sections. Caps are 200L / 12000B, so overage is 143L / 18730B. The volume of history the AC-4 fallback would destroy has GROWN 62% while the row went unrouted. (b) TIMING PREDICTION REFUTED, HAZARD NOT REFUTED: the mint claimed the trap 'fires on agent-father's very next notebook write'. It did not — the file took multiple writes across 07-23 and 07-28 (newest '### Disposition ... 2026-07-28' at L3, oldest '### Edit 2026-07-21T19:13Z' still intact at L331) and history survived every one. Re-read of .claude/skills/notebook-write/SKILL.md explains why: AC-4 ('If grep -c \"^## \" returns 0 -> single Write to initialize') is a natural-language INSTRUCTION to the writing agent, not automated code, so it only detonates if the writing agent actually consults that branch. Correct characterisation: a LATENT, PROBABILISTIC instruction hazard, armed on every write, not a deterministic next-write detonation. P1 stands on the armed-hazard leg alone. (c) WHY NOBODY ACTED (new): the notebook-auto-prune hook has been emitting correctly all along — 4 signal PAIRS (07-23 x2, 07-25, 07-28), each carrying line_count/byte_count and reason='no ## section boundaries found; cannot safely prune' + action_required='manual_review', addressed to='claude-manager-helper'. NONE reached an owner. Root cause is neither this row nor the hook — it is the PO triage-table catch-all, promoted to P1/ready this same tick as FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE. Dispatch THAT first or this row simply gets re-stranded."
    elif .id == "GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC" then
      .updated_at = $now
      | .po_evidence_20260728 = "FRESH CORROBORATION 2026-07-28T19:4xZ by po, from the dev-team stranded-state sweep (signal dev-20260728T192120Z). FOUR agent flow docs are sitting dirty and uncommitted, each edited by the very agent that runs it: docs/agents/bctc-analyst/flow/main.md (+6L), docs/agents/bctc-analyst/flow/stage-log-notify.md (+10L), docs/agents/market-watcher/flow/eod.md (+2L), docs/agents/news-scout/flow/stage-sentiment.md (+2L). PO read all four diffs. IMPORTANT NUANCE FOR WHOEVER TAKES THIS ROW — the content is GOOD, not vandalism: gateway per-call token-cap workaround for get_bctc_refined; a published-marker task_claim dedup guard described as 'established practice since c120, not previously documented here'; a market-watcher no-Bash transport gap carrying an explicit do-NOT-fabricate instruction; and a run_impact_chain-vs-fetch_and_analyze score-authority rule. All four are live-verified operational knowledge that would be destroyed by a blanket revert. So the guard this row designs must be a ROUTING guard (self-observed findings -> agent-father / architect for review-then-merge), NOT a write-block that silently discards field knowledge. Dwell time is the real defect: the market-watcher note self-dates 'open 2026-07-25', i.e. ~3 days uncommitted and invisible to everyone but a dirty-tree sweep."
    else . end)

# --- 1: lift the routing row out of backlog into ready ------------------------
| ([.task_board.backlog[] | select(.id == "FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE")] | first) as $row
| .task_board.backlog |= map(select(.id != "FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE"))
| .task_board.ready += [
    $row
    + {
      status: "READY",
      priority: "P1",
      type: "FIX",
      size: "S",
      zone: "cross-service",
      owner: "agent-father",
      next_agent: "agent-father",
      updated_at: $now,
      title: "PO triage-table catch-all silently drops 64% of every drained signal (206/322 in the live 7d window) — the recipient declared in the signal's own `to` field is parsed and stored in signals.db, then discarded; fix = route-by-`to` fallback, not one-table-row-per-type whack-a-mole",
      po_evidence: "QUANTIFIED RAW 2026-07-28T19:5xZ by po against docs/signals/signals.db (table signals_processed, 7-day retention = 322 rows). METHOD: DB `type` column cross-referenced against the routing table in docs/agents/po/flow/triage-signals.md. FINDING 1 — COVERAGE: only 3 drained types have a real table row (bctc_signal 110, ci_red 5, audit-handoff 1) = 116/322. The remaining 206/322 (64%) fall through to the terminal row 'any unknown `type` | any | Log \"[po] Unknown signal type ... payload retained\" and skip'. That row is a SILENT DROP: no durable artifact, no owner notification, nothing on the board. FINDING 2 — THE DROPPED POPULATION IS NOT NOISE: context_bloat_breach 90, cowork-fire 62, notebook_single_section_overage_breach 12, notebook_unparseable_breach 4, data-coverage-gap 3, esc-deep-dive-request 3, flow-defect-report 3, recurring-bug 3, system-issue 2, board_deadlock_finding 1, bug-escalation 1, deep_dive_result 1, plus dispatcher-telemetry variants. FINDING 3 — THE DECLARED OWNER IS PRESENT AND IS BEING DISCARDED: `SELECT to_agent, COUNT(*)` returns po 139, claude-manager-helper 106, dev-team 68, ops 4, architect 1, agent-father 1 — while `SELECT result, COUNT(*)` returns routed-to-po = 322/322 (100%). scripts/agents-flow/drain-signals.js:168 reads `const to = j.to ?? 'po'`, persists it to the DB to_agent column at :186, then never uses it again — :181 hardcodes `result = 'routed-to-po'` unconditionally. THIS IS NOT A SCRIPT BUG: docs/agents/dev-team/flow/drain-signals.md:152 states the design explicitly — 'All routed signals are appended to pendingSignals[] regardless of type — routing annotation is informational only; PO's triage-signals.md is the authoritative dispatch handler.' The script honours its spec. The defect is that the authoritative handler has no dispatch path for 64% of what it authoritatively handles. FINDING 4 — SATURATED GATE: `result` has exactly ONE distinct value across all 322 rows, so it carries zero bits and cannot discriminate — the same pattern SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (ready/P1) exists to sweep for. FINDING 5 — CONFIRMED DOWNSTREAM CASUALTY (not theoretical): the notebook-hygiene cluster (context_bloat_breach + notebook_single_section_overage_breach + notebook_unparseable_breach = 106 signals, ALL addressed to claude-manager-helper) is fully absorbed by the catch-all; its owner has received zero of the 106. Live consequence: docs/agent-memory/notebooks/agent-father.md grew 211L -> 343L (+62%) over 7 days while holding an armed AC-4 blank-state-overwrite hazard (FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH, P1, BACKLOG/next_agent=null that whole period), and alert-commander.md reached a 119KB single blob (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, P2). Detection worked perfectly at every layer; only the actuator was blind.",
      acceptance: "(1) ROOT-CAUSE FIX, not whack-a-mole: replace the terminal 'any unknown type -> log and skip' row in docs/agents/po/flow/triage-signals.md with a route-by-declared-owner fallback — when a drained signal's type has no explicit table row, PO MUST emit a durable artifact addressed to the signal's own `to` value (a signal_queue row per .claude/skills/signal-dashboard/SKILL.md WRITE, or a .task_board.backlog[] row owned by `to`), falling back to log-and-skip ONLY when `to` is absent or unresolvable. Rationale: appending one table row per newly-observed type is exactly the failure mode that produced this backlog — the table will always lag the emitters. (2) Add EXPLICIT rows for the three notebook-hygiene types (context_bloat_breach, notebook_unparseable_breach, notebook_single_section_overage_breach) -> claude-manager-helper; they are 106/322 of live volume and have a named owner. (3) Keep this row's original scope: data-coverage-gap -> ops, deep_dive_result -> po. (4) DEDUP GUARD (mandatory): the fallback MUST dedup on (type, payload.file) or on fingerprint so a permanently-firing detector — context_bloat_breach fires ~90x/week across a handful of files — yields ONE open artifact per subject, not 90. Without this, the fix converts a silent drop into a board flood and will be reverted. (5) VERIFICATION GATE — must be a measurement, not prose: after the fix, re-run the FINDING-1 method (`sqlite3 docs/signals/signals.db \"SELECT type, COUNT(*) FROM signals_processed GROUP BY type\"` cross-referenced against the triage-signals.md table) and demonstrate that every type with count >= 3 in the window either has an explicit row or is provably covered by the route-by-`to` fallback WITH a durable artifact that actually exists on the board / in signal_queue. Citing the edited table alone is NOT acceptance — that is the false-green this row exists to kill.",
      files: ["docs/agents/po/flow/triage-signals.md", "docs/agents/dev-team/flow/drain-signals.md"],
      po_note_scope: "DOC/FLOW-ONLY — no app code. scripts/agents-flow/drain-signals.js is CORRECT per its own spec and MUST NOT be changed by this row. If a future design decision moves routing into the script, that is a separate architect-owned brief."
    }]

# --- 4: ACK the two NEW signal_queue rows addressed to po ---------------------
| .signal_queue.rows |= map(
    if .id == "sys-20260728T191048-7f8f" then
      .status = "READ"
      | .po_disposition = "TRANSIENT, NO MINT (2026-07-28T19:5xZ). A-01 api-gateway health CURL_ERR self-resolved <15s. Corroborated on the OTHER plane before closing: `docker ps` shows vn-market-intelligence-mcp-api-gateway-1 'Up 13 days (healthy)' — no restart, no crash-loop, uptime spans the incident window. Single transient probe timeout, not a broken mechanism. No board row."
    elif .id == "dev-20260728T192120Z" then
      .status = "READ"
      | .po_disposition = "DISPOSITIONED 2026-07-28T19:5xZ — split verdict; both halves COMMIT-AS-ROUTINE, neither is discard. (A) The 8 docs/analysis-briefs/*.md (HPG/SSI/VCI/VIX modified, HUT/KDH/PDR/VND untracked) are normal per-cycle cowork analysis output — routine churn, commit. (B) The 4 flow docs (bctc-analyst/flow/main.md +6L, bctc-analyst/flow/stage-log-notify.md +10L, market-watcher/flow/eod.md +2L, news-scout/flow/stage-sentiment.md +2L) are NOT churn: PO read all four diffs; each is a pure-addition, live-verified operational note of real value (gateway per-call token cap on get_bctc_refined + chunked-Read workaround; published-marker task_claim dedup guard practiced since c120 but undocumented; market-watcher no-Bash transport gap with an explicit do-not-fabricate instruction; run_impact_chain vs fetch_and_analyze score-authority rule). COMMIT THEM — discarding destroys live-verified operational knowledge. They are ALSO fresh evidence for GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC (backlog/P1/architect), appended to that row this tick: cowork agents ARE self-editing their flow docs unsupervised and this batch sat ~3 days uncommitted (the market-watcher note self-dates 'open 2026-07-25'). (C) OUT-OF-SCOPE-BUT-SEEN, no new row: the same tree carries 15 uncommitted DELETIONS under docs/signals/processed/ (07-21 vintage) — already owned by UC-GCP-P3 (REVIEW/P1/qa, 'drain commit deletion drop: tracked-only pathspec sweep git add -u')."
    else . end)
