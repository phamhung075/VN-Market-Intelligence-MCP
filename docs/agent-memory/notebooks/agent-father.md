# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## Keep (maintenance) 2026-08-18T08:45Z — scheduled cron, first run after ~2.5-day fleet-wide dark
period (last commit anywhere 08-15T22:48+02, session restart lost cron regs; treated as normal
fresh cycle per router instruction, not a replay of specific missed days).
- Pre-Check: `git diff --name-only HEAD~3..HEAD` touched zero `.claude/agents/*.md` /
  `docs/agents/*/flow/*.md` — Steps 1-2 gated off, straight to Steps 3-5.
- Top-5 (42 agents): checks 1/3/4 — semble-search only (known structural gap, unchanged from
  08-15). Check 2 (Error Boundary, one-hop+dispatch-table resolution) — 0/42 FAIL. Check 5
  (version >90d) — 6 NEW hits: alert-commander (92d), dev-frontend (92d), developer (92d),
  digest-predict (91d), news-scout (91d), tran-ngoc-bau (91d), all last bumped 05-17/18. Auto-fixed
  (Step 4): bumped all 6 `version:` to 2026-08-18. semble-search still has no `version:` (NOVER5).
  Same origin batch — expect next cluster in ~3mo, no action needed.
- Step 5 stale notebooks: 10/46 >30d — same set as 08-15, no change.
- Step 5b team-tool-recheck: zero drift vs 08-15T13:00Z — all 7 scope-in agents'
  description/tools lines byte-identical (no commits during outage). Same 6 CRITICAL (Bash
  present, honestly-qualified), bctc-analyst CLEAN. Wrote
  `docs/agent-memory/health/team-tool-recheck-2026-08-18-0845.md`. Noted, not actioned (out of
  scope): several `docs/data/unified-agent-synthesis-2026-08-0{7,8}-*.json` +
  `docs/social/fb-post-2026-08-0{7,8}.md` untracked at session start — commit-hygiene question
  for unified-agent/fb-market-poster, not a tool-grant mismatch.
- Escalations: 0 new (semble-search gap already escalated 08-15, still open — not re-escalated).
- Lock: no gateway binding (`mcp__gateway__call_tool` absent) — direct pathspec commit, per
  keep.md's gateway-less exception.

## EDIT 2026-08-15T11:34Z — FIX-COWORK-CRON-SIBLING-PROCESS-DEFER, router-dispatched (intent=edit)
- Signal consumed: `docs/signals/2026-08-15-cowork-cron-registration-sibling-process-defer.json`
  (type=architecture_brief, from=agents-architect — no auto-consumer in main.md's dispatch table,
  router triggered me directly with intent=edit per the signal's own note).
- Brief: `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md`.
  2-file implementation contract, `.md`-only, own zone.
- File 1 `.claude/skills/cron-detect-loop/register.md`: removed the user's uncommitted
  "Block/Interdit" paragraph (misplaced — that file governs cron-detect-loop's own 4 jobs, not
  the unrelated cowork-team `*/15` dispatcher). `git diff HEAD` post-removal = 0 lines — the
  paragraph was never committed, so nothing to land for this file.
- File 2 `.claude/skills/cron-cowork-team/SKILL.md`: Step 1a rewrite adds a client-side
  `$PPID`+`lstart($PPID)` process fingerprint (`payload.registering_process`, Step 1c) compared on
  the `hb.ok==true` fast path — closes the root-caused gap (two sibling OS processes sharing one
  `$CLAUDE_CODE_SESSION_ID` both passed the old session-UUID-only check and independently
  `CronCreate`'d a duplicate `*/15` entry). Mismatch → DEFER (WORK telegram, no local `CronCreate`)
  with a `heartbeat_at`-based self-heal (age>1800s = presumed-dead sibling, steal+re-register).
  New "Sibling-Process Defer — Fallback Only" subsection replaces the removed note's intent as an
  explicitly-labeled fallback (not primary — brief rejected resurrecting the retired
  `feedback_router_cowork_defer_to_live_leader` convention as primary).
- Out of scope, not actioned (per signal's own `_note_to_agent_father`): brief §0.4's fire-election
  RE-ENTRANT double-dispatch hole (`leader-lock.md`, dev-team Step[3], auditor tiers,
  `dispatch-claim/CARD.md`) — flagged for PO scoping; architects-architect already dropped a
  separate `brief_complete` signal to PO for it.
- Size governance: file was already over the 200L skill-file cap pre-edit (242L, flagged
  2026-08-11, routed-to-po, never remediated) — my edit (242L→283L) tightened the new prose after
  the live `context-bloat-backstop` hook auto-fired a fresh breach signal
  (`docs/signals/context-bloat--claude-skills-cron-cowork-team-SKILL-md-2026-08-15T112802Z.json`,
  line+byte cap). Did NOT attempt a full split/prune — that's PO/claude-manager-helper territory
  per the 08-11 precedent (`routed-to-po`), out of this task's bounded 2-file scope. Left the fresh
  breach signal for dev-team's normal drain to route.
- Signal file itself: NOT moved to `docs/signals/processed/` — `docs/signals/` is outside
  agent-father's `commit_zone.allowed` list (`docs/agents/`, `docs/agent-memory/`,
  `.claude/skills/`, `.claude/agents/` only); that drain/processed-move is dev-team's own
  mechanism (`agent-chaining-protocol.md` § Cross-Team Signal Directory), out of scope here.
- Lock: no gateway binding this session (confirmed — `mcp__gateway__call_tool` absent from tool
  grant). Docker reachable → SQL-replication fallback (`docker exec
  vn-market-intelligence-mcp-mcp-server-1 bun -e ...` against `/app/data/coordination.db`
  `task_locks`) for claim (`task:FIX-COWORK-CRON-SIBLING-PROCESS-DEFER`) + commit-mutex, both
  live-verified no conflicting row before `INSERT OR IGNORE`, released after push. Commit
  `0468c2821` pushed to `main`.

## EDIT 2026-08-15T04:45Z — task FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW, router-dispatched (intent=edit)
- Change: generalised RAG-MEM-DURABILITY-BAR v2 (D1-D5) fleet-wide — new SSOT
  `docs/standards/oom-durability-verification-bar.md` (detection rule, D1-D5, §4 grandfather-
  exemption/retraction guard, v1-failure rationale) + wired into `docs/agents/qa/flow/main.md`
  (new "OOM-Class Durability Gate" in Pipeline + mandatory cross-ref in Direct-Commit Verify
  gating `vc-approved`, the observed path for OOM-class rows).
- Files modified: 2 (1 new: `docs/standards/oom-durability-verification-bar.md`; 1 edited:
  `docs/agents/qa/flow/main.md`, 275L→~304L, size-justification header refreshed)
- Cascade: none — no `.claude/agents/qa.md` frontmatter/routing change, no roster/CLAUDE.md impact
- Validation: 5/5 passed (qa.md frontmatter intact; flow-catalog paths resolve; no inter_agent
  routing touched; all cross-referenced paths in new doc exist; code-fence count in main.md even)
- Decision: defect 5 (stale grandfather exemption on falsified rows) needs an
  `orchStateSchema.ts` runtime guard to close in code — out of this row's `files` scope (`apps/`)
  and agent-father's own `forbidden_outputs` (no production code); documented as a process-level
  compensating control + flagged the open engineering gap for a future dev-mcp-server task instead
  of minting one myself (orch-state.json excluded from my commit_zone).
- Lock: no gateway binding this session (confirmed live — `mcp__gateway__call_tool` absent from
  tool grant). Docker reachable → used the documented SQL-replication fallback
  (`docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e ...` against
  `/app/data/coordination.db` `task_locks`) for claim (5a) + heartbeat (7b), live-verified no
  conflicting row before INSERT OR IGNORE, per `edit-apply.md`'s Gateway-less exception ladder.

## Keep (maintenance) 13:00Z — scheduled cron (2 prior EDIT sections pruned per AC-2, oldest→newest
23:03Z/00:24Z, full record in git history)
- Pre-Check: `git diff --name-only HEAD~3..HEAD` touched zero `.claude/agents/*.md` /
  `docs/agents/*/flow/*.md` — Steps 1-2 (orphan+roster scan) gated off this cycle, went straight to
  Steps 3-5 with empty scan-orphans output per CADRAT-3.
- Top-5 checks (42 agents, `docs/agents/<id>/init.md` target): 41/42 clean. `semble-search` fails
  1/3/4/5 — its `init.md` is plain prose (no `agent:` YAML block), so no `fail-loud-protocol` ref,
  no `boundary_rules`, no `flow.default`, no `version:` field. Not new drift (git history shows this
  shape unchanged, no prior notebook mention) — genuine guide-compliance gap, not auto-fixable
  (needs manual authoring or a formal guide exemption decision). Escalated below, LOW-MEDIUM.
  0 stale (>90d) versions this cycle.
- Doc self-heal: `docs/agents/agent-father/flow/sweep-fixes.md` Check 2 — literal `"error boundary"`
  (space-only) grep + one-hop-pointer-only resolution false-flagged 8 agents (agent-father,
  alert-commander, bctc-analyst, digest-predict, market-watcher, news-scout, qa-responder,
  unified-agent): their thin `main.md` dispatchers route via a multi-row `## Dispatch` table (not a
  single one-hop arrow-pointer) to sub-flows that DO carry the boundary, some phrased as hyphenated
  `cowork-error-boundary/SKILL.md` refs. Broadened grep to `error[ -]boundary` + added dispatch-table
  multi-target resolution; re-ran — 0/42 FAIL2 after fix (was 8/42 false-positive before).
- Step 5 stale notebooks: 10/46 >30d (idea-forge, market-analyst, semble-search @104d;
  qa-responder @79d; cowork-refactory-expert + its dated sub-notebook, dev-kinh-dich,
  dev-news-fetch, ops-mainserver-fetch @35-36d; pm-alpha-s2-rag-fts-rebuild-cron @31d).
  `dev-team.md`/`main.md`/`pm-alpha-*`/`dev-news-fetch.md` don't map 1:1 to a `.claude/agents/*.md`
  id — informational only (Step 5 = "do not delete"), full orphan classification deferred to next
  Pre-Check-gate-open cycle; `dev-news-fetch` already a known/tracked phantom per memory.
- Step 5b team-tool-recheck: commit `476646c4e` (08-14T23:11, after yesterday's 12:57Z report)
  shipped `scripts/audits/agent-bash-grant-coverage.sh` (CI-wired), fixed the AC-8 description
  self-contradiction on alert-commander/market-watcher/news-scout, and newly (honestly) granted
  Bash to digest-predict/unified-agent/qa-responder — scope-in Bash/no-Bash flips 3/4→6/1
  (bctc-analyst sole CLEAN, grandfathered pending `FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH`,
  still BACKLOG). Positive control held (Bash still present = CRITICAL by Step-2's own rule).
  Mechanical file-scope enforcement (`write_boundary`/`agent-write-boundary-guard`) still absent —
  different mechanism from the new gate. Wrote
  `docs/agent-memory/health/team-tool-recheck-2026-08-15-1300.md`.
- Escalations (2, folded into RETURN for router/PO): (1) semble-search structural template gap —
  formalize exemption in guide vs bring to full Employee Card spec, PO/architect decision; (2)
  recommend `2026-08-06-guard-cowork-notebook-agent-write-boundary.md` §7 re-scope from 3→6 named
  agents (architect/PO territory, brief file outside my commit_zone).
