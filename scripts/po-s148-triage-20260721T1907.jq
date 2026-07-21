# PO triage — dev-team tick 2026-07-21T19:07Z (session 4ae45b71)
# Applied via: jq -f scripts/po-s148-triage-20260721T1907.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Inputs: $now (ISO-8601 UTC from `date -u`), $by (actor string)
#
# Scope:
#   1. Mint 5 backlog rows (all evidence-backed, all checked against prior art first)
#   2. Grade the 2 cowork escalations WITHOUT minting (both said DO NOT MINT) — record ordering ruling
#   3. Re-price the already-tracked B-07 false-positive row (it has now cost 2 triage cycles)
#   4. Extend CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR acceptance with the 0-byte writer defect
#   5. Sign off FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS (review -> done)
#   6. Mark READ only the 8 to=po rows whose disposition is durably captured; leave the orphan NEW

def mint($row): .task_board.backlog += [$row];

# ── 1. MINTS ────────────────────────────────────────────────────────────────

mint({
  id: "FIX-SLA-SBV-FX-BUSINESS-DAY-AWARE",
  type: "FIX",
  status: "BACKLOG",
  priority: "P2",
  size: "S",
  zone: "apps/mcp-server/",
  title: "sbv_fx carries a flat 30-min SLA against a once-per-business-day source -> structurally guaranteed breach ~47.5h of every 48h; emits CRITICAL off-hours",
  owner: "developer",
  po_evidence: "RAW-PROBED 2026-07-21T19:19Z by po. (1) DEFAULT_SLA_CONFIG at apps/mcp-server/src/domain/services/freshnessSlaChecker.ts:145-148 gives sbv_fx ONLY defaultThresholdMinutes:30 — no marketHoursThresholdMinutes, no offHoursThresholdMinutes, and it is absent from the dynamic window-aware set. (2) The doc comment at apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts:99-100 states calendar-awareness covers 'market-hours-only sources (price, foreign_flow)' — sbv_fx excluded. (3) BUT the user-facing legend that same file prints at slaStatusTools.ts:165 advertises an sbv_fx off-hours window verbatim: 'sbv_fx: VN business days'. Legend claims coverage the implementation does not provide, 65 lines apart in one file. (4) SSOT divergence: docs/data/system-map.json .project.data_sources[] gives sbv/sbv-vps stale_threshold_hours=24 (1440min) — the tool uses 30min, a 48x divergence, defeating the system-auditor flow mandate to read thresholds from system-map and never hardcode. (5) Severity escalation is a pure artifact of the tight denominator: getSeverity (slaStatusTools.ts:109-120) returns CRITICAL at ratio>1.5, so 61min/30min=2.03 -> CRITICAL while 34min/30min=1.13 -> HIGH. (6) GROUND TRUTH: get_vps_proxy_health shows the real last SBV push at 2026-07-21 03:05:21Z = 10:05 VN on a Tuesday business morning — exactly the designed once-daily publish. The source is healthy; the SLA is wrong.",
  po_verdict: "Signal sys-20260721T183201-0e67 (CRITICAL data_stale, sbv_fx stale 61min, check B-04) is a CONFIRMED FALSE POSITIVE. Not market-hours-blindness alone — a category error: a once-per-business-day source given a 30-minute SLA.",
  acceptance: "(1) sbv_fx gains business-day/publish-window awareness in DEFAULT_SLA_CONFIG so it cannot breach outside its documented 'VN business days' window, OR its flat threshold is raised to match the system-map SSOT (1440min) — pick ONE and state why in the commit body. (2) The slaStatusTools.ts:165 legend and the actual suppression set are made consistent: either sbv_fx really is off-hours-suppressed, or its name is removed from that legend string. A user-facing string may not advertise a guarantee the code does not implement. (3) Add a regression test asserting sbv_fx does NOT report 'breached' at a timestamp outside VN business hours with an age under the system-map threshold — the exact 2026-07-21T18:32Z condition that produced this false CRITICAL. (4) Reconcile the 30min-vs-1440min divergence explicitly: either DEFAULT_SLA_CONFIG derives from system-map.json, or a comment states why the tool intentionally holds a tighter independent threshold. Do not leave two silent SSOTs. (5) NOTE the existing test at apps/mcp-server/src/__tests__/1920i-freshness-sla-extension.test.ts:273 ('TC-5d: sbv_fx threshold remains 30 minutes') PINS the defect — it must be updated as part of this fix, not worked around.",
  files: ["apps/mcp-server/src/domain/services/freshnessSlaChecker.ts", "apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts", "apps/mcp-server/src/__tests__/1920i-freshness-sla-extension.test.ts"],
  related: ["FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE", "ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD", "FIX-VPS-NEWS-STALE-FALSEPOS", "FACTORY-DOMAIN-extract-sla-config"],
  created_at: $now, created_by: $by
})

| mint({
  id: "FIX-AUDITOR-EVAL-DELTA-RECENCY-BOUND",
  type: "FIX",
  status: "BACKLOG",
  priority: "P2",
  size: "S",
  zone: "docs/agents/system-auditor/",
  title: "system-auditor bctc_eval_delta emits weeks-old eval rows as fresh HIGH signals — no recency bound; 2 of 3 signals this tick were 21d and 41d stale",
  owner: "agent-father",
  po_evidence: "RAW-PROBED 2026-07-21T19:2xZ by po against market.db bctc_eval_results LEFT JOIN financial_reports ON f.id=e.report_id (ticker lives in financial_reports.action_code, NOT a ticker column). All 9 status='red' rows enumerated. The 3 signals emitted 2026-07-21T18:32Z map as: MBB Q1-2026 stage4 TABLE_RECONSTRUCT computed_at=2026-07-20 09:06:41 (1.4 DAYS old — legitimately recent); HVN Q1-2026 stage4 computed_at=2026-06-30 14:12:41 (21 DAYS old); FPT Q1-2026 stage1 RASTERIZE computed_at=2026-06-10 01:40:40 (41 DAYS old). No eval row exists with computed_at on 2026-07-21 at all, yet 3 HIGH signals fired that day.",
  po_verdict: "MBB is REAL and actionable (gate_failures_json populated with measured values: code_coverage 0.21 vs threshold 0.8, exact_dup_count 1 vs 0). HVN carries real failure data (code_coverage 0.243, exact_dup_count 13) but is a 21-day-old re-emission, not a new event. FPT is DOUBLE-disqualified: 41 days old AND metrics_json='{}' + gate_failures_json='[]', which is the exact instrumentation-artifact signature already tracked by EVAL-PUSH-DOUBLE-ENCODE. Note the artifact prediction held ONLY for FPT/stage-1 — it was REFUTED for the stage-4 rows, which carry genuine populated metrics. Do not close EVAL-PUSH-DOUBLE-ENCODE as covering all three.",
  acceptance: "(1) The bctc_eval_delta check gains a recency bound so an eval row whose computed_at is older than a stated window cannot be emitted as a NEW HIGH signal. State the window and its rationale; do not hardcode it where a system-map value already exists. (2) Rows already emitted once must not re-emit on every subsequent audit cycle — reuse the existing docs/data/auditor-dedup-ledger.json mechanism rather than inventing a second dedup plane. (3) A red eval row with metrics_json='{}' AND gate_failures_json='[]' must be classified as an instrumentation artifact and routed to EVAL-PUSH-DOUBLE-ENCODE, never emitted as a standalone HIGH. (4) MBB Q1-2026 stage-4 remains a genuine open extraction-quality failure (code_coverage 0.21 vs 0.8) and must NOT be suppressed by this fix — verify it still surfaces after the recency bound lands. That is the regression test.",
  related: ["EVAL-PUSH-DOUBLE-ENCODE", "FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE"],
  created_at: $now, created_by: $by
})

| mint({
  id: "FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH",
  type: "FIX",
  status: "BACKLOG",
  priority: "P1",
  size: "S",
  zone: ".claude/skills/",
  title: "P1 ARMED DATA-LOSS TRAP: agent-father.md uses '###' headings but notebook-write prunes on '^## ' -> next write hits the blank-state fallback and Writes over 211L / 6 sections of history",
  owner: "agent-father",
  po_evidence: "RAW-PROBED 2026-07-21T19:2xZ by po. docs/agent-memory/notebooks/agent-father.md is 211L with SIX '### ' sections and ZERO '^## ' sections (verified: grep -c '^## ' = 0, grep -c '^### ' = 6). The emitted signal described this as '211L vs 200 cap AND no ## boundaries so auto-prune cannot act' — that UNDERSTATES it. Two compounding consequences: (a) .claude/skills/notebook-write/SKILL.md:46 prunes by dropping oldest '## ' blocks, so with zero such blocks the >200L overflow can NEVER self-heal and the AC-5 blocking gate at SKILL.md:71-74 stays red forever; (b) far worse, SKILL.md:62-66 blank-state fallback reads 'If grep -c \"^## \" returns 0 -> single Write to initialize', which would OVERWRITE the entire file with a fresh 2-line stub. The trap is armed right now and fires on agent-father's very next notebook write. SKILL.md:20 explicitly names agent-father as a '## c<NNN>' c-format user, so the file has drifted from its own declared contract. SCOPED: swept all of docs/agent-memory/notebooks/*.md — agent-father.md is the ONLY at-risk file (##=0 AND ###>0). This is not fleet-wide.",
  acceptance: "(1) Restore agent-father.md to the '## c<NNN> · <ISO>' heading contract declared at notebook-write/SKILL.md:20, preserving all 6 existing sections' content — this is a heading-level repair, NOT a rewrite, and NOT a prune. Zero history may be lost. (2) Then apply the normal retention rule to bring it under the 200L cap. (3) Harden the blank-state fallback (SKILL.md:62-66) so it cannot fire on a non-empty file: gate it on actual file emptiness/absence, not on a heading-count of zero. A 211-line file must never be treated as blank state. (4) Add a guard or test covering the ###-only case so this specific drift is detected rather than silently destroying history.",
  files: ["docs/agent-memory/notebooks/agent-father.md", ".claude/skills/notebook-write/SKILL.md"],
  created_at: $now, created_by: $by
})

| mint({
  id: "DESIGN-ACCEPTANCE-WRITE-OWNERSHIP-DISPATCHER",
  type: "SPIKE",
  status: "BACKLOG",
  priority: "P2",
  size: "S",
  zone: "docs/agents/",
  title: "'Write acceptance criteria before editing files' is structurally unverifiable for every agent whose commit zone excludes orch-state.json — move acceptance authorship to the dispatcher",
  owner: "agents-architect",
  po_evidence: "Surfaced by the FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS supervised sign-off 2026-07-21. agent-father claimed it wrote acceptance onto the row BEFORE editing any file, and the row carries self-reported acceptance_written_at=2026-07-21T19:08:10Z. But the acceptance text's FIRST appearance in git is 304f24edd at 19:14:24Z, AFTER the skills commit 3e4f50d3a at 19:12:13Z — because agent-father's commit zone excludes docs/data/orch/orch-state.json, so a peer cold-evict swept the board and collapsed the acceptance-write and the lane-move into one indistinguishable blob. The claim is UNVERIFIABLE, not disproven. acceptance_written_by/acceptance_written_at are self-reported fields authored by the same agent whose ordering they attest — they are narration, not evidence.",
  po_ruling: "The dispatcher's framing is correct and generalises: an agent whose commit zone excludes the board can NEVER produce evidence for an ordering claim about the board. Requiring such a claim therefore mandates an unfalsifiable self-report, which is exactly the failure class feedback_agent_selfreport_metalayer_confabulation.md warns about. The requirement is unenforceable across the whole maintenance lane, and the unsatisfiable dispatch instruction was the dispatcher's error, not agent-father's — no fault attaches to the agent. PREFERRED RESOLUTION: acceptance is authored by the DISPATCHER (or PO) at dispatch time, before spawn. The dispatcher's commit zone already includes the board, so ordering becomes provable by construction across two disjoint zones: dispatcher commits acceptance, implementer commits code, and git ordering across the two zones is independently checkable. Rejected alternatives: (a) letting maintenance agents commit the board row themselves — breaks zone separation and re-introduces the peer-sweep class this very sprint just fixed; (b) silently dropping the requirement — loses the real benefit that acceptance predates implementation.",
  question: "Should acceptance-criteria authorship move from the implementing agent to the dispatcher for all supervised maintenance-lane rows, and what is the migration path for flow docs that currently instruct the implementer to self-write acceptance?",
  mode: "spike",
  timebox: 120,
  created_at: $now, created_by: $by
})

| mint({
  id: "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2",
  type: "FIX",
  status: "BACKLOG",
  priority: "P2",
  size: "S",
  zone: ".claude/skills/",
  title: "Layer-2 tail of the bare-commit sweep guard: 4 remaining bare git-commit sites + stale 'RULE 1-3' refs in 3 init.md files",
  owner: "agent-father",
  parent_task: "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD",
  po_evidence: "Disclosed UNPROMPTED by agent-father during FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS, correctly left untouched as out-of-scope per architecture brief section 3 step 3, and reported rather than fixed exactly as acceptance criterion (5) required. Exact sites: .claude/skills/session-log-cowork/SKILL.md:28, .claude/skills/decision-journal/SKILL.md:76, .claude/skills/append-session-record/SKILL.md:15, .claude/skills/signal-dashboard/dashboard-protocol.md:127. Separately, docs/agents/pm/init.md, docs/agents/agents-architect/init.md and docs/agents/agent-father/init.md carry commit_discipline lines still reading 'RULE 1-3' without the '(incl. 2.5)' suffix now that commit-boundary/SKILL.md has gained RULE 2.5.",
  po_ruling: "MINTED NOW rather than deferred to a PM cleanup pass. The disclosure is precise to the file:line, the work is small and mechanical, and an unminted tail disclosed inside a closing row is precisely how epic tails get lost (feedback_epic_wrapper_closeout_gap_no_auto_revisit.md). The Layer-1 row is being signed off in the same cycle, so the tail would otherwise become orphaned the moment its parent closes.",
  acceptance: "(1) The 4 listed bare-commit sites gain explicit pathspecs on the commit line itself, in the same form Layer-1 established (git commit -m ... -- <exact paths from that skill's own explicit-stage step>), never a directory or dot pathspec. (2) The 3 init.md commit_discipline refs are updated from 'RULE 1-3' to match the post-2.5 rule set. This is cosmetic-only: the skill file is authoritative and already correct, so this must not change any behaviour. (3) Documentation-example bare-commit lines that deliberately ILLUSTRATE the anti-pattern are left untouched, same carve-out as Layer-1 acceptance (4). (4) The commit for this row must itself use explicit pathspecs — dogfooding, as Layer-1 did.",
  files: [".claude/skills/session-log-cowork/SKILL.md", ".claude/skills/decision-journal/SKILL.md", ".claude/skills/append-session-record/SKILL.md", ".claude/skills/signal-dashboard/dashboard-protocol.md", "docs/agents/pm/init.md", "docs/agents/agents-architect/init.md", "docs/agents/agent-father/init.md"],
  created_at: $now, created_by: $by
})

# ── 2. GRADE the 2 cowork escalations — NO MINT (both explicitly said DO NOT MINT) ──
# Ordering ruling: RECEIVER-DELIVERY must land FIRST. A terminal status (READ) cannot be
# defined until a receiver exists to consume it; inverting the order strands rows dark.

| .task_board.backlog |= map(
    if .id == "FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT" then
      . + {
        priority: "P1",
        po_ordering_ruling: "LANDS FIRST of the pair. Ruling by po " + $now + " on cowork escalation cow-20260721T172415, which asked for the ORDERING of the two existing rows to be graded and explicitly asked that no new row be minted. Honoured: no row minted. Rationale: a terminal signal_queue status (READ/DONE) is only safe once a defined receiver consumes the row. Defining the status contract first would mark rows terminal while they are still structurally undeliverable — the exact strand this escalation is objecting to. Delivery capability must precede status semantics.",
        po_repro_case: "po-20260720T052606 (from=po, to=unified-agent, methodology-flag, HIGH) is the canonical live reproduction and MUST be used as the acceptance fixture. It has sat status=NEW since 2026-07-20 addressed to a COWORK agent. dev-team drain 0a-D (docs/agents/dev-team/flow/drain-signals.md) collects only rows whose 'to' matches po or a dev-team-addressed agent, so no drain will ever pick it up. It is not backlogged — it is undeliverable. Its content is a live methodology correction for unified-agent (stop pasting the literal gold >$4,300 L6 token, compute from live gold instead), so the cost of the missing delivery path is ongoing wrong output, not merely a stuck row.",
        po_status_decision: "This row is DELIBERATELY LEFT status=NEW by po. Marking it READ would destroy the only record that a message was never delivered, and NEW costs nothing here precisely because no drain matches a cowork-addressed row — zero churn. It must stay NEW until a delivery path exists.",
        updated_at: $now, updated_by: $by
      }
    elif .id == "FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT" then
      . + {
        priority: "P1",
        depends: ((.depends // []) + ["FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT"] | unique),
        po_ordering_ruling: "LANDS SECOND, gated on FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT. Ruling by po " + $now + ". Escalation cow-20260721T172415 is UPHELD on its central point: po independently verified at source that docs/agents/dev-team/flow/drain-signals.md 0a-D collects ONLY status=NEW rows, so a blanket mark-rows-READ remedy would indeed sever dev-team's own inbox. The escalation conceded flow non-compliance and that concession stands, but the proposed remedy was correctly rejected. This row must define a status contract that distinguishes 'triaged and durably captured elsewhere' from 'unprocessed' from 'undeliverable' — three states the current single NEW/READ axis cannot express.",
        po_precedent: "po applied the interim rule this cycle and it should inform the contract: mark terminal ONLY when disposition is durably captured in a board row or a decision-journal verdict, and NEVER when the row is undeliverable. 8 of 9 rows were marked RESOLVED under that rule; the 1 undeliverable row was left NEW.",
        po_vocabulary_evidence: "HARD EVIDENCE FOUND BY po " + $now + " — the status vocabulary is ALREADY fragmented in live data, which makes this row concrete rather than theoretical. .claude/skills/signal-dashboard/SKILL.md is the SSOT and defines exactly three transitions: NEW -> READ (ACK, line 80) -> RESOLVED (CLOSE, line 81), with PRUNE at line 90 evicting rows whose 'status IN (READ, RESOLVED, SUPERSEDED) AND ts older than 24h'. But a census of .signal_queue.rows[] returns: 73 rows status='triaged', 9 status='NEW', 1 status='RETRACTED'. NEITHER 'triaged' NOR 'RETRACTED' appears anywhere in the skill's vocabulary. CONSEQUENCE: because the PRUNE predicate matches only READ/RESOLVED/SUPERSEDED, all 73 'triaged' rows are structurally unprunable and accumulate in the hot file forever — a permanently growing hot-file cost with no eviction path. This is a second, independent failure mode of the same missing contract, and it is not the one the escalation raised. po deliberately used the canonical 'RESOLVED' token for this cycle's 8 rows rather than perpetuating 'triaged'.",
        po_scope_addendum: "The contract must therefore ALSO specify: (a) the canonical terminal token set and a migration for the 73 existing 'triaged' rows so they become prunable; (b) whether 'RETRACTED' is legitimate (cow-20260721T152500 uses it) and if so add it to both the vocabulary and the PRUNE predicate; (c) a validator that rejects an out-of-vocabulary status at write time, since the fragmentation was introduced silently and went unnoticed across 73 rows.",
        updated_at: $now, updated_by: $by
      }

# ── 3. RE-PRICE the already-tracked B-07 false positive ──
    elif .id == "FIX-AUDITOR-HEALTHCHECK-FALSE-UNHEALTHY-NONHTTP-SERVICES" then
      . + {
        priority: "P2",
        po_repricing_note: "Re-priced low -> P2 by po " + $now + ". This row already describes the defect exactly (vn-bctc-fetch is a pure-bash systemd timer with no HTTP port, so an HTTP probe yields a permanent false UNHEALTHY badge). It has now cost a second full triage cycle: signals sys-20260721T183209-1e91 (vn-bctc-fetch) and sys-20260721T183210-2d85 (vn-sbv-fetch) both landed as WARNs this tick and both are false. Priority 'low' is mispriced for a defect whose per-occurrence cost is a human-attention triage cycle and which recurs every audit.",
        po_evidence: "RAW-PROBED 2026-07-21T19:19Z by po via get_vps_service_health: vn-sbv-fetch = HEALTHY (last poll 4m ago), directly refuting sys-20260721T183210-2d85. vn-bctc-fetch = unhealthy, but per this row's own root cause that badge is structurally permanent and not evidence of an outage. IMPORTANT CORRECTION TO PO's OWN REASONING, recorded so it is not repeated: po initially treated get_vps_proxy_health (bctc last push 2026-07-20 01:26:41, 0 pushes/24h) as INDEPENDENT corroboration that bctc was genuinely down. That was wrong. bctc is event-driven with system-map expected_cadence_hours=168 and stale_threshold_hours=168, and get_sla_status independently reports bctc age 1769min vs SLA 9830min = 'ok'. The proxy 'Stale? YES' flag is itself miscalibrated for event-driven sources (same class as FIX-VPS-NEWS-STALE-FALSEPOS). Two miscalibrated flags agreeing is not corroboration — feedback_internal_consistency_is_not_corroboration_check_the_other_plane.md. The authoritative SLA plane says bctc is fine.",
        updated_at: $now, updated_by: $by
      }
    else . end
  )

# ── 4. Extend the telemetry-drain row with the 0-byte writer defect ──
| .task_board.ready |= map(
    if .id == "CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR" then
      . + {
        po_addendum_zerobyte: "ADDED by po " + $now + ". docs/signals/cowork-team-20260721T183028Z.json is ZERO BYTES, untracked, written 18:30:28Z — 21 seconds before the successful 18:30:49Z write of the SAME tick. The telemetry write path can therefore emit an empty artifact without erroring. RULING ON DISPOSITION: do NOT simply delete it. po upholds the dev-team signal's reasoning verbatim — a 0-byte file's forensic content IS its existence, so deleting it as debris destroys the only evidence of the writer defect. It is a finding first and debris second. Deletion alone would also leave the writer free to re-emit, which is fix-the-symptom-not-the-root-cause. ADDITIONAL ACCEPTANCE FOR THIS ROW: (a) make the telemetry write atomic (write to a temp path then rename) so a partial/empty artifact cannot appear at the destination path at all; (b) make the drain tolerate a 0-byte or unparseable file by skipping it with a loud log rather than failing the whole tick — the drain currently re-reads and fails on it every tick forever; (c) only AFTER (a) and (b) are landed and the defect is captured in the commit body may the 0-byte file itself be removed, with an explicit pathspec git rm; (d) the 43 burst files from 07-10/07-11 remain the separate age-vs-count sweep concern already on this row — note the designed >14-day window does not catch them until 2026-07-25, so it must be shortened or made count-aware.",
        updated_at: $now, updated_by: $by
      }
    else . end
  )

# ── 5. SIGN-OFF: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS review -> done ──
| .task_board.done += [
    (.task_board.review[] | select(.id == "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS")
      | del(.next_agent)          # optional-not-nullable: DELETE the key, never set null
      | . + {
      status: "DONE",
      po_signoff_at: $now,
      po_signoff_by: $by,
      po_signoff_verdict: "APPROVED. All six acceptance criteria are independently verifiable at source and were verified — by the dispatcher at commit level (both commits pathspec-scoped and tight, 3 files and 2 files, no peer sweep; all four Layer-2 files show empty diffs; RULE 3 reset --soft HEAD~1 backstop intact; FORBIDDEN doc-examples preserved) and by po against the row's own acceptance text. AC (4) and (5) are satisfied in the strongest available form: the agent reported the out-of-scope sites rather than fixing them, which is the behaviour those criteria asked for. AC (6) is satisfied and self-demonstrating — the fix was committed using the very pathspec form it introduces.",
      po_signoff_caveat: "The agent's claim that it wrote acceptance onto the row BEFORE editing any file is UNVERIFIABLE and is NOT relied upon for this approval. The acceptance text first appears in git at 304f24edd (19:14:24Z), after the skills commit 3e4f50d3a (19:12:13Z), because agent-father's commit zone excludes orch-state.json and a peer cold-evict collapsed the acceptance-write and the lane-move into one blob. Unverifiable is not disproven, and no fault attaches to the agent: the dispatch instruction was unsatisfiable as written, which the dispatcher has acknowledged as its own error. Decisively, the ordering claim is IMMATERIAL to this sign-off — none of acceptance criteria (1) through (6) requires acceptance-written-first, so the approval rests entirely on independently checkable artifacts. The systemic unenforceability is carried forward as DESIGN-ACCEPTANCE-WRITE-OWNERSHIP-DISPATCHER rather than being resolved here.",
      po_tail_disposition: "The 4 Layer-2 bare-commit sites and the 3 stale init.md 'RULE 1-3' refs that this agent disclosed unprompted are minted as FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2 in this same cycle, so the tail does not orphan when this parent closes. The unprompted disclosure of out-of-scope defects is exactly the behaviour the maintenance lane should reward.",
      updated_at: $now, updated_by: $by
    })
  ]
| .task_board.review |= map(select(.id != "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS"))

# ── 6. SIGNAL STATUS: mark READ only where disposition is durably captured ──
# Leaves po-20260720T052606 (to=unified-agent) NEW — undeliverable, not untriaged.

| .signal_queue.rows |= map(
    if (.status == "NEW" and .to == "po") then
      . + { status: "RESOLVED", resolved_at: $now, resolved_by: $by,
            po_disposition: (
              if .id == "sys-20260721T183201-0e67" then "FALSE POSITIVE confirmed at source. Root cause minted as FIX-SLA-SBV-FX-BUSINESS-DAY-AWARE."
              elif .id == "sys-20260721T183209-1e91" then "FALSE POSITIVE. Already tracked by FIX-AUDITOR-HEALTHCHECK-FALSE-UNHEALTHY-NONHTTP-SERVICES (vn-bctc-fetch is a non-HTTP systemd timer); that row re-priced low -> P2. No mint."
              elif .id == "sys-20260721T183210-2d85" then "FALSE POSITIVE. Live probe at 19:19Z shows vn-sbv-fetch HEALTHY, last poll 4m ago. No mint."
              elif .id == "sys-20260721T183229-5a13" then "REAL and recent (eval row 1.4d old, code_coverage 0.21 vs 0.8 threshold). Genuine extraction-quality failure; must survive the recency bound added by FIX-AUDITOR-EVAL-DELTA-RECENCY-BOUND, where it is the named regression test."
              elif .id == "sys-20260721T183230-0471" then "STALE RE-EMISSION. Real failure data but the eval row is 21 days old (2026-06-30). Covered by FIX-AUDITOR-EVAL-DELTA-RECENCY-BOUND."
              elif .id == "sys-20260721T183230-209c" then "STALE RE-EMISSION + INSTRUMENTATION ARTIFACT. Eval row is 41 days old (2026-06-10) AND has empty metrics/gate_failures. Covered by FIX-AUDITOR-EVAL-DELTA-RECENCY-BOUND and EVAL-PUSH-DOUBLE-ENCODE."
              elif .id == "cow-20260721T172415" then "UPHELD. No row minted, as the escalation requested. Ordering graded onto the two existing rows: FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT lands FIRST, FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT second and now depends on it. Both re-priced P1."
              elif .id == "cow-20260721T174200" then "ACCEPTED as composition evidence. No row minted, as the escalation requested. Graded together with the two existing rows per its instruction; the joint-zero-guard argument is recorded as the reason both are now P1."
              else "Triaged by po " + $now + "; disposition durably captured in the board or decision journal."
              end
            ) }
    else . end
  )

| .signal_queue._updated_at = $now
| .signal_queue._updated_by = $by
| .signal_queue.last_triaged_at = $now
| .signal_queue.last_triaged_by = $by
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $by
| .task_board._updated_at = $now
| .task_board._updated_by = $by
| ._updated_at = $now
| ._updated_by = $by
