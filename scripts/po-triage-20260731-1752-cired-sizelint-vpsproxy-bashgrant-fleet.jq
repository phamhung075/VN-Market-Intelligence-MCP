# po triage 2026-07-31T17:52Z — dev-team Step 1, cron tick 2026-07-31T17:47Z
#
# Inputs read at source this tick:
#   - ci-red-c809ee39 (docs/signals/, UNDRAINED at read time) + the two already-drained
#     predecessors ci-red-7fe631b3 / ci-red-78b82dd5 (docs/signals/processed/)
#   - list_unresolved_reports() => id 4241 digest-predict "no Bash tool"
#   - docs/handoffs/tnb-audit-latest.md (already PO-ACKed 2026-07-28T22:55:09Z, no new findings)
#
# Disposition:
#   size-lint          -> ONLY persistent RED job across all 3 runs. RAW: gh run view 30650707550
#                         => 1 failure / 19 success, the single failure is `size-lint`.
#                         "Stock Price Go Lint" (78b82dd5) and "bun test" (7fe631b3) are BOTH
#                         green on c809ee39 => transient, no row.
#                         Offending file owned by ZERO board rows (grep vpsProxyStaleness over
#                         orch-state.json => 1 hit, and it is inside FIX-VPS-NEWS-STALE-FALSEPOS's
#                         review_note prose, not a row scope) -> mint row A.
#   digest-predict     -> 4th occurrence of the missing-Bash-grant class. 3 point-fix rows already
#     no-Bash             exist (FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE review,
#                         FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT review,
#                         FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH backlog) and NONE covers
#                         digest-predict. Recurring-bug bar cleared -> root-cause row B, not a
#                         4th point fix.
#   TE-T21             -> manual-dispatch-sweep top candidate (P1, idx 28), premise re-verified
#                         live (.claude/skills/task-lock/SKILL.md is still 283L) -> Step 2 stamp.
#
# Usage: jq -f scripts/po-triage-20260731-1752-cired-sizelint-vpsproxy-bashgrant-fleet.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# ── A. size-lint RED — vpsProxyStaleness.ts regressed past the cap it was split out to satisfy ──
.task_board.backlog += [{
  "id": "FIX-CI-SIZELINT-VPSPROXYSTALENESS-REGRESSION-123L",
  "type": "FIX",
  "size": "S",
  "priority": "P1",
  "status": "BACKLOG",
  "zone": "apps/mcp-server/",
  "owner": "dev-mcp-server",
  "next_agent": "dev-mcp-server",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T1752",
  "created_at": "2026-07-31T17:52:41Z",
  "updated_at": "2026-07-31T17:52:41Z",
  "origin_signal_id": "CI-RED-c809ee39",
  "check_id": "CI-RED-c809ee39",
  "ci_fingerprint": "a3234178f63d44d1cb7eb677518b42aa08246899716bcc5bf7ec848e908f88c2",
  "dedup_key": "ci_job:size-lint|file:apps/mcp-server/src/interface/mcp/tools/system/vpsProxyStaleness.ts",
  "verification_gate": "ci_green_on_subsequent_push",
  "title": "CI job `size-lint` RED on origin/main for 3 consecutive runs — apps/mcp-server/src/interface/mcp/tools/system/vpsProxyStaleness.ts is 123L > 120L, classified `new-offender` (no baseline entry, no justification header). This is a REGRESSION of an already-shipped fix: the file's own module docblock (:6-8) says it was split out under FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS AC-4 specifically to keep this zone under 120L, and commit b08045ef0 (FIX-VPS-NEWS-STALE-FALSEPOS) grew it 111L -> 123L.",
  "root_cause": "Two facts, both read at source this tick. (1) `git show b08045ef0^:<file> | wc -l` = 111, `git show b08045ef0:<file> | wc -l` = 123 — the news-staleness recalibration (EXPECTED_INTERVALS.news 10 -> 20 + the widened isStale rule and its comments) pushed the file 3L past the cap. (2) The merge was RAW-verified by dev-team on the CODE/TEST/DB planes only (see FIX-VPS-NEWS-STALE-FALSEPOS.review_note: live DB re-query, 4/4 new test, 77/77 regression) — the size-lint CI guard was never in that verification set, so a green-verified merge shipped a guaranteed-RED gate. The guard itself is CORRECT and did its job (FACTORY-GUARD-CI-SIZELINT-IMPL is working as designed); the gap is that this specific file's cap-compliance was an INVARIANT nobody re-asserted when editing it.",
  "evidence": "Local replay of the exact CI command: `bash scripts/audits/size-lint-justification.sh --check` => RC=1, `[size-lint] FAIL — 1 offending file(s) (scanned 1354): apps/mcp-server/src/interface/mcp/tools/system/vpsProxyStaleness.ts — new-offender (123L > 120L, no baseline entry, no current justification header)`. CI plane, not inferred from the job name: `gh run view 30650707550 --json jobs` on origin/main HEAD c809ee39476f22f7c925f4bedce295dfdf06a0a8 => 1 failure / 19 success, sole failure = size-lint. Cross-run persistence: the same size-lint job is in the failing_jobs[] of all three consecutive ci_red signals (78b82dd5 16:51Z, 7fe631b3 17:16Z, c809ee39 17:45Z) while the OTHER two named jobs each appear once and are green on the latest HEAD — `Stock Price Go Lint` (78b82dd5 only) and `bun test` (7fe631b3 only, flaky). `wc -l` on the live file = 123.",
  "ac": "(AC-1) Bring the file back to <=120L by EXTRACTING, not by adding a size-justification header. The header path is available to the script but is the wrong remedy here: this file EXISTS as the product of a prior split whose stated purpose (docblock :6-8) is cap compliance — declaring 123L as justified would retroactively void that fix and is exactly the dishonest-header pattern FACTORY-XZONE-size-justification-sweep is trying to unwind. Natural seam: the EXPECTED_INTERVALS table / threshold constants are pure data and can move to a sibling module, same shape as the FACTORY-DOMAIN-extract-sla-config extraction landed at 9930ee008 this same day. (AC-2) DO NOT change the calibrated values. EXPECTED_INTERVALS.news must stay 20 and the isStale() rule must stay behaviourally identical — b08045ef0 was independently RAW-verified against the live vps_push_log (p90=16.08 / p99=16.23 min, hard cliff ~17min); a refactor that silently reverts the calibration re-opens FIX-VPS-NEWS-STALE-FALSEPOS. (AC-3) The FIX-VPS-NEWS-STALE-FALSEPOS regression group must stay green after the extraction — at minimum the 4 tests in FIX-VPS-NEWS-STALE-FALSEPOS-news-threshold-calibration.test.ts (which target this file's isStale/EXPECTED_INTERVALS.news by name) plus the VPT-1 / 1113-vps-proxy-health suites, run in the LIVE container, not a worktree (the worktree's dep provisioning produced a false SC-2a failure last time — see that row's review_note). (AC-4) Local gate: `bash scripts/audits/size-lint-justification.sh --check` exits 0 with 0 offenders. (AC-5) VERIFY ON THE CI PLANE, not locally: `gh run view <run whose headSha is AFTER this fix> --json jobs -q '.jobs[]|select(.name==\"size-lint\")|.conclusion'` == success. Record the run id + headSha on this row before flipping it — a ci_red close without a recorded fingerprint re-drains next tick. (AC-6) LANDMINE — do NOT close by running `size-lint-justification.sh --update`. That regenerates docs/data/size-lint-baseline.json and would GRANDFATHER the 123L regression into the baseline, permanently disarming the guard for this file and silently widening the whole repo's debt snapshot to whatever else is over-cap at that moment.",
  "files": ["apps/mcp-server/src/interface/mcp/tools/system/vpsProxyStaleness.ts"],
  "reference_only_files": ["scripts/audits/size-lint-justification.sh", "docs/data/size-lint-baseline.json", "apps/mcp-server/src/interface/mcp/tools/system/vpsProxyTools.ts", "apps/mcp-server/src/interface/mcp/tools/system/vpsProxyHealthFormat.ts"],
  "related": "Regression of FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS (review) AC-4, introduced by FIX-VPS-NEWS-STALE-FALSEPOS (review) commit b08045ef0. DISTINCT from the 5 other FIX-CI-SIZELINT-* rows — every one of those names a different file and none names vpsProxyStaleness.ts. Do not merge into FACTORY-XZONE-size-justification-sweep (backlog): that row is a debt sweep over pre-existing grandfathered offenders, this is a NEW offender blocking main's CI right now.",
  "dedup_checked": "2026-07-31T17:50Z — (1) grep -c vpsProxyStaleness docs/data/orch/orch-state.json => 1, and that single hit is prose inside FIX-VPS-NEWS-STALE-FALSEPOS.review_note, not a row's files[]/scope. (2) jq over every lane matching id/title/desc against /SIZE|LINT|VPS-PROXY|120L|size-lint/i => 11 rows, all read: 5 are FIX-CI-SIZELINT-* naming other files (energyTools.ts, extraction_engine.py, macro-vmt-liquidity-resolvers, the six-offender parent, frontend bun.lock), 3 are FACTORY-GUARD-CI-* guard implementations, 1 is FACTORY-XZONE debt sweep, 1 is LINT-OHLCV-WRITE-BYPASS (unrelated ESLint rule), 1 is FIX-DAV-PHARMACY-CATCHUP-AND-VPS-PROXY (pharma_events pipeline, matched on 'VPS-PROXY' only). Zero cover this file. (3) in_progress[] length = 0 and .head.status = idle at read time, so no live worker holds it.",
  "baseline_pass": "gh run view <post-fix run> --json jobs => size-lint conclusion == success on origin/main",
  "desc": null
}]

# ── B. Missing-Bash-grant class, 4th occurrence — root-cause coverage gate ─────
| .task_board.backlog += [{
  "id": "FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER",
  "type": "FIX",
  "size": "M",
  "priority": "P1",
  "status": "BACKLOG",
  "zone": "cross-service/",
  "owner": "agent-father",
  "next_agent": "agent-father",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T1752",
  "created_at": "2026-07-31T17:52:41Z",
  "updated_at": "2026-07-31T17:52:41Z",
  "origin_report_id": 4241,
  "dedup_key": "agent_tool_grant|bash|coverage-gate",
  "title": "Agent flow docs mandate Bash-only steps (commit-mutex git add/commit, bash scripts/*.sh) that the agent's own .claude/agents/<id>.md `tools:` line does not grant — a structural contradiction that has now produced 4 separate point-fix rows and is still open for digest-predict. Close it at the root with an opt-IN coverage gate (flow demands Bash => frontmatter must grant Bash) instead of a 5th per-agent patch.",
  "root_cause": "The `tools:` frontmatter line in .claude/agents/*.md and the Bash-requiring steps in docs/agents/<id>/flow/*.md are maintained by hand, independently, with NO check that one implies the other. Verified live this tick on digest-predict: .claude/agents/digest-predict.md `tools: Read, Write, Edit, mcp__gateway__call_tool` (no Bash) while docs/agents/digest-predict/flow/daily-predict.md:126-131 AND monday.md:82-87 both prescribe `git add docs/agent-memory/notebooks/digest-predict.md` + `git commit ...` under the commit-mutex skill. The agent cannot execute its own documented flow. Per feedback_agent_reported_limitation_may_be_structural_check_the_tool_grant this is STRUCTURAL, not agent laziness — and the failure is SILENT at authoring time because nothing validates the pair.",
  "evidence": "(1) LIVE SIGNAL: list_unresolved_reports() id 4241, 2026-07-31T17:42:22Z, from digest-predict: 'digest-predict cowork slot has no Bash tool — blocks commit-mutex git add/commit/push for notebook writes'. (2) FLEET SCAN of every .claude/agents/*.md `tools:` line => 8 agents lack Bash: bctc-analyst, digest-predict, idea-forge, market-analyst, qa-responder, refine_bctc_md, tran-ngoc-bau, unified-agent. (3) LIVE DAMAGE, not hypothetical: `git status --porcelain docs/agent-memory/notebooks/` shows 6 dirty uncommitted notebooks, and 4 of them belong to no-Bash agents (bctc-analyst, digest-predict, tran-ngoc-bau, unified-agent) — the perpetual-dirty-tree symptom of project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts, which in turn trips feedback_push_blocked_by_perpetual_dirty_tree. (4) OCCURRENCE COUNT >= 4, all distinct agents: alert-commander (FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE, review), news-scout + market-watcher (FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT, review), bctc-analyst (FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH, backlog), now digest-predict (uncovered by any row). market-watcher's own notebook line at commit 8fe1a3907 still reads 'coverage-write-skipped:no-bash', and docs/handoffs/tnb-audit-latest.md logs the same blocker twice ('no Bash tool this session') — so the class keeps firing.",
  "ac": "(AC-1) Ship `scripts/audits/agent-bash-grant-coverage.sh`: for EVERY agent id, derive whether its flow corpus (docs/agents/<id>/**/*.md and any .claude/skills/*/SKILL.md it routes to) contains a Bash-only step, and assert that agent's .claude/agents/<id>.md `tools:` line grants Bash iff it does. Exit non-zero on any mismatch, printing agent id + the exact file:line that demands Bash. (AC-2) OPT-IN, NEVER OPT-OUT — per feedback_fleetwide_gate_validated_on_one_file_optout_allowlist: the predicate must be DERIVED from each agent's own flow corpus, not an allowlist of 'agents we decided need Bash'. An agent with no Bash-demanding step must stay Bash-free and must NOT be blanket-granted; several of the 8 (idea-forge, market-analyst, qa-responder read-only roles) are probably CORRECT as-is and the gate must say so rather than widen their grant. (AC-3) REPLAY THE WHOLE CORPUS BEFORE SHIPPING, not one file: run the gate against all 22 agents and paste the full pass/fail table into this row. A gate validated on digest-predict alone is not validated. (AC-4) Close the residual gaps the gate finds — at MINIMUM digest-predict, whose flow demand is already proven at daily-predict.md:126-131 + monday.md:82-87. For any OTHER mismatch the gate surfaces, the row's author decides per agent: grant Bash, or remove the Bash step from the flow doc. Do not silently pick one. (AC-5) WIRE THE GATE so it cannot regress: add it to the same CI lane as size-lint / metric-mask-lint / dead-code-gate (.github/workflows/ci.yml — it is a cheap grep-only job, same class as its neighbours). (AC-6) BASELINE, do not self-certify: the deliverable is proven only when a real digest-predict cowork cycle commits its own notebook. The two predecessor rows both stalled in review for exactly this reason ('NOT self-certified DONE ... requires the agent's NEXT live cowork cycle') — expect the same and route to qa for live-cycle confirmation rather than flipping DONE on the edit. (AC-7) LANDMINE — a `tools:` line edit is necessary but NOT sufficient for cowork-cloud slots. feedback_local_cowork_subagents_gateway_blind + project_cowork_guaranteed_slot_needs_live_cli_session mean the deployed slot config can diverge from the repo file; confirm the grant is live in the slot the agent actually runs in, not just in git.",
  "files": [".claude/agents/digest-predict.md", "scripts/audits/agent-bash-grant-coverage.sh", ".github/workflows/ci.yml"],
  "reference_only_files": ["docs/agents/digest-predict/flow/daily-predict.md", "docs/agents/digest-predict/flow/monday.md", ".claude/skills/commit-mutex/SKILL.md", ".claude/agents/alert-commander.md", ".claude/agents/market-watcher.md", ".claude/agents/news-scout.md"],
  "related": "Root-cause parent of FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE (review/qa), FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT (review/qa) and FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH (backlog). Do NOT merge or close those three into this one — two are already implemented and awaiting live-cycle qa confirmation, and the bctc row is a flow-doc rewrite (remove the Bash step) not a grant. This row owns only the GATE + the residual uncovered agents. DISTINCT from DESIGN-COWORK-FANOUT-T3-ALERT-COMMANDER-SCHEDULE-TASK-GRANT (ready), which grants a different tool (schedule_task) to a covered agent.",
  "dedup_checked": "2026-07-31T17:51Z — jq over every lane matching id/title/note against /BASH|TOOL-?GRANT|no Bash|tool grant|GRANT/i => 5 rows, all read: 3 are the per-agent point fixes named in `related` (none covers digest-predict), 1 is the schedule_task grant, 1 is FIX-ROUTER-COWORK-SLOT-DEMAND-DISPATCH-BLIND (matched on 'grants false exclusivity' prose, unrelated). `ls scripts/audits/ | grep -i grant` => no existing coverage script. Zero rows own the gate.",
  "baseline_pass": "scripts/audits/agent-bash-grant-coverage.sh exits 0 across all 22 agents AND a live digest-predict cycle commits docs/agent-memory/notebooks/digest-predict.md",
  "desc": null
}]

# ── C. manual-dispatch-sweep Step 2 — stamp the top candidate (additive only) ──
| (.task_board.backlog[] | select(.id == "TE-T21")) |=
    (. + { "po_manual_dispatch_flagged_at": "2026-07-31T17:52:41Z",
           "po_manual_dispatch_flagged_by": "po (manual-dispatch-sweep)",
           "po_manual_dispatch_class": "DRS-STRANDED-OFF-ALLOWLIST",
           "po_manual_dispatch_note": "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — folding into this tick's BATCH. Premise re-verified live 2026-07-31T17:50Z: .claude/skills/task-lock/SKILL.md is still 283L, so the row is not already satisfied." })

# ── D. triage stamp ───────────────────────────────────────────────────────────
| .task_board.last_triaged_at = "2026-07-31T17:52:41Z"
| .task_board.last_triaged_by = "po/triage-20260731T1752"
