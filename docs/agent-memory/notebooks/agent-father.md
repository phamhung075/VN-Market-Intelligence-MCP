# Agent Father — Notebook

## Fix (router-dispatched, dev-team session) 2026-07-31T00:00:00Z FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL
- DECLINED: dispatched as owner=agent-father, next_agent=agent-father (board row +
  architecture brief `2026-07-29-qadrain-head-slot-decouple.md` §8 "Actionable sequence
  for agent-father") but the task is a production-code edit to
  `scripts/devteam-review-claim-qa-drain.jq` (`cross-service/`). `docs/data/system-map.json`
  `zones[].id=="cross-service"` names `specialist: "developer"`, not agent-father.
  Confirmed against own init.md (`not_my_job`: "Writing production code — that's
  developer"; `commit_zone.allowed` excludes scripts/) and 8 prior journal STEPs — zero
  `.jq`/production-code precedent, all agent/.md/flow/skill work.
- Same failure shape as the 2026-07-29T14:56:21Z A-30 row above: an architect-authored
  brief claims scripts/-touching authority for agent-father; on direct read of the
  canonical SSOT (system-map.json here, qa_note there) the claim does not hold. Recurring
  pattern — architect-class agents keep writing "agent-father implements" into briefs
  for scripts/ work without checking the zone-ownership table first.
- Did NOT edit the `.jq` file, did NOT flip the board row's status/lane, did NOT write a
  DJ-GATE-1 DONE/REVIEW entry (no completed action to gate). Wrote a DECLINE decision-
  journal STEP instead (S8). Recommended in RETURN: PO/router reassign board row
  owner/next_agent `agent-father` → `developer` per system-map.json, then re-dispatch;
  optionally loop back to agents-architect to fix the brief's §8 heading so this doesn't
  recur for Part 2/3 of the same epic.
  self-committed, per this task's own dispatch note (no gateway/MCP grant this session).

## Fix (router-dispatched, S4 UNBLOCK co-dispatch) 2026-07-30T23:11:49Z FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE+FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT
- Both BACKLOG/READY rows share next_agent=agent-father, same actuator (`tools:` line),
  flagged CO-DISPATCH by the cowork row's own deliverable text — landed in one edit pass.
- `FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT`: added `Bash` to news-scout.md +
  market-watcher.md `tools:` line (exactly 2 lines, per po's pre-adjudicated transport
  ruling on the row — not re-litigated).
- `FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE`: added `Bash` to
  alert-commander.md `tools:` line (1 line) — closes both the notebook commit-mutex gap
  (6 consecutive cycles uncommitted) and the `task_claim` session-id derivation gap that
  had it firing verified CRITICAL alerts without the duplicate-publish mutex.
- RAW pre-edit verify: all 3 `tools:` lines grep-confirmed still missing Bash;
  `git log --since=2026-07-29T12:32:22Z -- .claude/agents/alert-commander.md` empty,
  matching the row's own claim. RAW post-edit verify: all 3 now
  `Read, Write, Edit, Bash, mcp__gateway__call_tool` — no Glob/Grep added.
- No cascade: `docs/agents/tools/package/*.md` catalog MCP tools only, unaffected by a
  native Bash grant.
- Structural note: agent-father itself carries NO gateway MCP binding (own frontmatter:
  `Read, Edit, Write, Glob, Grep, Bash`) — edit-apply.md's MCP task-lock steps (5a/7b/8b)
  are unreachable; followed `.claude/skills/commit-boundary/SKILL.md`'s gateway-blind
  fallback instead (solo operation — `.head.status=idle`, `active_task_id=null` at check
  time).

## Fix (router-dispatched, po manual-dispatch-sweep) 2026-07-31T01:10:34Z UC-ASL-P6
- Reconciled the row's 2026-07-16 supervised_reason flag first: `docs/agents/system-auditor/flow/`
  has no `init.md` (only main.md/page-freshness.md/tier1-overrides.md/tier1-probe.md) — the
  agent's `init.md` is one level up (`docs/agents/system-auditor/init.md`). Row's file citation
  is accurate read that way; no phantom-file confusion in the row itself.
- main.md + tier1-probe.md: already fully disambiguated by a prior sprint
  (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED, 2026-07-29) — names
  `docs/data/DASHBOARD.md` as the live target, explicitly forbids `docs/handoffs/DASHBOARD.md`
  (confirmed still exists, 650B, untouched since 2026-07-20 — the real phantom). No edit needed
  there for the phantom-path class.
- init.md was NOT touched by that prior sprint: fixed 3 residual bare "DASHBOARD.md" mentions
  (skills bullet, forbidden_outputs, flow.catalog output) to name `docs/data/DASHBOARD.md` +
  `scripts/emit-dashboard-row.sh`. The forbidden_outputs one had been internally contradicting
  this same file's own not_my_job routing statement (findings → `.signal_queue`, not DASHBOARD.md).
- main.md RETURN block `NEXT: po (via DASHBOARD.md)` was a genuine phantom-PROTOCOL claim (not
  just a stale path) — grepped every po flow file, zero reads DASHBOARD.md. Fixed to
  `po (via orch-state.json .signal_queue row)` per this file's own inter_agent contract.
- SKILL.md (`.claude/skills/signal-dashboard/SKILL.md`) hot-path "Write protocol" line cited a
  stale pre-orch-apply.sh brief (bare temp-then-rename), contradicting its own CONCURRENT WRITERS
  CAS-guard mandate 2 sections below + `dashboard-protocol.md`'s already-correct WRITE step 4.
  Fixed to name `scripts/orch-apply.sh` directly. Left the same-class stale line in
  `dashboard-protocol.md`'s own preamble (L12) untouched — out of the task's explicit
  SKILL.md-only scope; flagged for follow-up, not silently dropped.
- DID NOT flip the board row BACKLOG→REVIEW or touch `orch-state.json` at all — own init.md
  `commit_zone` excludes it from agent-father commits except a signal-queue DONE-mark, and this
  dispatch (direct po manual-dispatch board row) has no linked signal_queue row. Deferred to
  router/po; RETURN block carries the exact `orch-apply.sh` jq transform for the lane move.
