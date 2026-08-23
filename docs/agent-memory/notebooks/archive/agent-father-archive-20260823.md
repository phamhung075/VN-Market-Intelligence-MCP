# Agent Father — Notebook Archive 2026-08-23

Split out of `docs/agent-memory/notebooks/agent-father.md` on 2026-08-23 (self-prune: 188L/16787B, line cap 200L, byte cap 12000B breached). Nothing deleted — full record here and in git history. Same convention as `agent-father-archive-20260812.md`.

---

## FIX 2026-08-23T09:30Z — FIX-SIGNAL-TYPE-ROUTING-GAP-bctc-image-fetch-degraded, P0 CI-red fix
- Added 1 Pipeline-B routing row (`bctc_image_fetch_degraded`) to `docs/agents/po/flow/triage-signals-longtail.md` — mcp-server `push_bctc_refined_unit`/`bctcImageFetchDegradedSignalWriter.ts`, dedup on `dedup_key`, mint FIX zone `cross-service/` next_agent `developer`. Placed in the longtail sibling (single-fire-so-far type, matches existing `bctc-data-quality-anomaly` precedent), not the hot-path main table.
- Guard `guard-signal-type-coverage.sh --check`: FAIL (`unrouted Pipeline-B to=po types: ["bctc_image_fetch_degraded"]`) → PASS, reproduced. Paired suite: 23/24 → 24/24, reproduced once (TEST10 live-files smoke).
- Committed `a309c9334` (file alone, pushed clean to origin/main, no rebase). Board write via `orch-apply.sh` moved the FIX row `backlog[]→review[]` (`next_agent: qa`; `ci_green_on_subsequent_push` gate not yet independently observed) — lands UNCOMMITTED, `docs/data/orch/orch-state.json` is outside agent-father's commit zone (FU-AGENT-FATHER-ORCH-SCOPE).
- **Not fixed here (flagged, out of scope):** a genuinely new, unrelated Pipeline-A type `cowork-fire` appeared live mid-task and re-trips the guard/TEST10 post-fix — different pipeline, different subject, no claim held. Guard's own self-filing fallback already auto-tracked it (`FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire`, backlog, owner po). Needs its own fresh triage/dispatch, not folded into this task.

## FIX 2026-08-23T09:45Z — cowork-team Step 4.7 + 5.3 doc-truth pair (2 P3 rows)

- 4.7 `tick-snapshot.md`: "pure bash cannot call MCP" false since `mcp-call.sh` f7d34918d
  2026-07-02 (row said 07-30 = mtime). Folded in-fence; ran verbatim, 20199B vs 20190B ref.
- 5.3 `spawn-fanout.md`: surface contract + provenance fix + fail-open negative control +
  >=2-distinct-marker threshold. `.output` = 187B symlink → 246939B transcript; the 1515B
  dispatcher-authored prompt ALONE scores 6/6.
- **LESSON: a detector whose markers come from its own prompt is not exogenous — grep
  `docs/signals/` before calling one fixed.** That grep found an unprocessed 2026-07-30
  signal: a 3rd FP, 1/6 on a disclaimer, on the CORRECT surface — scoping alone misses it.
- Out of zone → agents-architect: caps pattern `docs/agents/*/flow/**/*.md` matches nothing
  (bash `case` `**`==`*`); 173 flow files ungoverned. Rows NOT flipped (orch-state).

---

## Keep (maintenance) 2026-08-23T14:23 — CHECK6-FLEET-ROLLOUT-DEBUG-LOGGER-PROTOCOL

Scheduled cron tick. Pre-Check gate (`git diff --name-only HEAD~3..HEAD`) touched zero
`.claude/agents/*.md`/`docs/agents/*/flow/*.md` → Steps 1-2 (orphan+roster scan) SKIPPED per
CADRAT-3 routing. Steps 3-5 (sweep-fixes) + 5b (team-tool-recheck) ran unconditionally.

- **Scanned:** 41 real agent init.md cards (45 `docs/agents/*/` dirs minus `shared`/`tools`
  non-agent dirs, minus `semble-search` — a skill-usage pointer doc with no `agent:` YAML root,
  not an agent card despite the dir name — minus 3 structurally-INIT-MISSING dirs `cowork-team`/
  `dev-news-fetch`/`dev-team`, unchanged from prior cycles, out of Steps-1-2-scope this cycle
  since those were gated off).
- **Check #1 (fail-loud-protocol) / #2 (Error Boundary, one-hop+dispatch-table resolved) / #3
  (boundary_rules) / #4 (flow.default path resolves):** 41/41 PASS. (Own script initially mis-flagged
  all 41 as Check-4 FAIL — a macOS/BSD-sed `\s` portability bug in my own throwaway grep, not a
  real finding; re-verified with a portable Python regex, all 41 genuinely PASS. Lesson: don't
  trust a 100%-fail sweep result without a differential check against a known-PASS agent — cf.
  `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` pattern, same shape, caught
  before acting on it this time.)
- **Check #5 (version staleness, >90d):** 5 FAIL — `claude-manager-helper`, `dev-api-gateway`,
  `dev-kinh-dich`, `dev-rag-service`, `dev-stock-price`, all pinned `"2026-05-24"` (91d stale).
  Auto-fixed: bumped to `"2026-08-23"` (Step 4 table: mechanical, no manual authoring implied).
- **Check #6 (debug-logger-protocol, new since 08-22's `d65da8640`):** 40/41 FAIL — first `keep`
  cycle to run since the check landed, so this was the fleet's first-ever Check-6 sweep. Per the
  check's own SSOT (`docs/agents/shared/debug-logger-protocol.md` § Rollout: "auto-fix-driven, not
  a one-shot mass edit... other agents pick up the pointer via the same keep-cycle auto-fix
  mechanism already used for fail-loud-protocol.md") — auto-fixed all 40 this cycle by locating the
  end of each file's `knowledge.lazy_load:` array (generic block-end scan, not hardcoded to the
  `→ KLFL:` sentinel — 11/40 files don't carry that sentinel at all, confirmed live) and appending
  the same 4-line pointer block agent-father dogfooded 08-22, substituting per-agent `<agent-id>`
  in path/note and using the Read-then-Write-append note variant for the 2 confirmed Bash-less
  agents (`bctc-analyst`, `refine_bctc_md` — matches the protocol doc's explicit exception list,
  cross-checked against each `.claude/agents/<id>.md` `tools:` line, not assumed from memory).
  1 agent (`refine_bctc_md`) had no `lazy_load:` key at all (only `always_load:`) — added the key
  fresh rather than deferring, same low-risk mechanical pattern, now 41/41 clean.
  **Verification before commit:** every touched file's `knowledge:` sub-block parses cleanly in
  YAML isolation (dedented + `yaml.safe_load`) and contains the new lazy_load item; `git diff
  --stat` confirms pure additions only (no accidental deletions) across all 40 files; full-document
  `yaml.safe_load_all` was tried first and rejected 36/39 files — a false alarm, since these
  init.md files are markdown-with-embedded-YAML, not standalone YAML, and 36/39 **originals**
  fail the same strict parse (verified against `git show HEAD:<file>` before concluding this was
  pre-existing format, not something my edit broke).
- **Step 5b (team-tool-recheck):** ran unconditionally per its own spec (independent of the
  Pre-Check gate). HEADLINE: zero drift vs 2026-08-22T12:42Z — all 7 scope-in agents' frontmatter
  byte-identical, re-verified live not carried forward blind. 6 CRITICAL findings (Bash present,
  by the check's own Step-2 construction rule), all "honestly qualified" description text
  (unchanged since `476646c4e` 08-14 fixed the unqualified-claim gap this check was designed to
  catch — traced the commit history before concluding zero-NEW-findings ≠ check regression, per
  the check's own §3 FAIL-LOUD trap for a silently-broken detector; positive control still holds
  since alert-commander stays CRITICAL by construction regardless of description honesty).
  Mechanical enforcement still 0/0 (no `write_boundary` keys, no `agent-write-boundary-guard`
  hook) — standing gap, not re-escalated (already PO/architect territory per prior cycles). Full
  report: `docs/agent-memory/health/team-tool-recheck-2026-08-23-1423.md`.
- **Stale notebooks (Step 5, informational only):** 10/46 not committed in >30d — 2 look like
  split/archive artifacts (`cowork-refactory-expert-2026-07-11-fr1-atomic.md`,
  `pm-alpha-s2-rag-fts-rebuild-cron.md`), 8 are real per-agent notebooks aging out
  (`cowork-refactory-expert`, `dev-kinh-dich`, `dev-news-fetch`, `idea-forge`, `market-analyst`,
  `ops-mainserver-fetch`, `pm`... wait `qa-responder`, `semble-search`). Not actioned — information
  only per flow spec.
- **Not touched (out of scope, unrelated concurrent peer work seen in working tree at session
  start, explicit pathspec-only staging kept it off this commit):** `docs/agents/pm/flow/main.md`,
  several `docs/agent-memory/notebooks/*.md` and `docs/agent-memory/decisions/*.md` files already
  modified by other in-flight agent sessions.
- Trigger: scheduled. Agents scanned: 41. Auto-fixes: 45 (40 Check-6 insertions + 5 Check-5 version
  bumps, overlapping same 5 files). Escalations: 0 (all findings this cycle were mechanically
  auto-fixable; team-tool-recheck's Bash-vector gap is a standing, already-tracked recommendation,
  not a new escalation). Orphans: 0 (Steps 1-2 gated off, no new scan this cycle).
- Lesson: a brand-new fleet-wide check (Check #6, 1 day old) can legitimately fail 40/41 agents on
  its very first live sweep without that being a bug — the guide's own rollout design anticipates
  exactly this ("auto-fix-driven, not mass edit" = the sweep mechanism itself IS the rollout
  vehicle, and it fires in full on the first cycle it's reachable, not spread thin on purpose).
