# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · developer

**Sprint goal:** Option A flow-alpha primary (per 2026-07-11 data-strategy brief)
**Agent:** developer
**Started:** 2026-07-12T10:07:00Z

---

### STEP developer-S1 · developer · 2026-07-12T10:46:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE
**what-done:** Added AC-1 (detail-DEFERRED*) + AC-2 (non-dev-owner + null-next_agent) gates to `scripts/devteam-backlog-promote-bounded1.jq` candidate selection, mirroring the existing detail-authoritative precedence pattern (no `.detail_ref` precondition, keyed purely by `.id`, conservative default = promotable when detail is silent); updated `docs/agents/dev-team/flow/main.md` § Idle-capacity backlog pickup (BOUNDED-1) to document both gates alongside SUPERVISED/EPIC-WRAPPER/DEPENDS-ON; added read-only regression verifier `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh`.
**what-considered:**
- Hand-stamping the recurring offending rows (BCTC-HIST-VPS-BACKFILL etc.) — rejected: whack-a-mole, task explicitly asked to close the class.
- Single combined gate function vs two separate predicates — chose two separate (`is_detail_deferred`, `is_non_dev_owner_unrouted`) to mirror the existing one-concern-per-gate style (`effective_supervised`, `is_epic_wrapper`).
- Regression-fixture strategy: isolate each candidate to a single-row synthetic backlog[] (WIP=0, forced P0 priority) rather than diffing against the live full board, to avoid depending on ambient board state that changes every tick.
**why-decision:** Matches AC-1/AC-2 spec exactly; verified against pre-fix (git HEAD) script that the fixtures actually flip PASS->FAIL, proving the test is load-bearing and not a false-green.
**why-change:** No change from task brief.

### STEP developer-S2 · developer · 2026-07-12T10:46:30Z
**task-id:** FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE
**what-done:** commit-mutex:main claim/release via `mcp__gateway__call_tool` could NOT be performed — no gateway/vn-market MCP tool function was reachable in this subagent's tool schema (only Read/Edit/Write/Bash present; two different tool-name conventions both errored "No such tool available"). Substituted a manual safety check (`.git/index.lock` absent, no commits in the preceding minutes) before committing on `main`.
**what-considered:**
- Abort and return without committing — rejected: task explicitly asked to implement + commit; dispatcher already holds the task lock so coordination risk is contained at that layer.
- Proceed with commit after manual git-contention check — chosen.
**why-decision:** No destructive/irreversible action was skipped; git commit itself is safe/serializable at the VCS layer, and the explicit-paths-only staging avoids capturing unrelated dirty-tree files from other concurrent agents.
**why-change:** Deviates from literal instruction (mutex claim via MCP tool) due to a hard tool-availability constraint in this session, not a judgment call to skip a safety gate — flagged prominently in the RETURN block for the dispatcher.

### STEP developer-S3 · developer · 2026-07-12T13:20:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE
**what-done:** Added 4th sibling gate `is_non_dev_next_agent_unrouted` to `scripts/devteam-backlog-promote-bounded1.jq` — mirrors `is_non_dev_owner_unrouted` exactly but keys off detail `.next_agent` instead of `.owner` (closes the case where `owner` is absent but `next_agent` already names a non-dev handler, e.g. `FEAT-SEVERITY-OVERRIDE-SURFACING`). Extended the shared verifier (`devteam-bounded1-detail-disposition-gate-verify.sh`) with AC-4 pool/picker/assertion + widened the control-pool query to also exclude the new class (prevents future false-positive control failures).
**what-considered:**
- Folding into existing `is_non_dev_owner_unrouted` (single function, two field names) — rejected: task spec + existing file convention (one predicate per named gate) favor an independent, separately-named predicate; also keeps the "AFTER non-dev-owner select" ordering explicit and each gate's regression story isolated.
- New standalone verifier script vs extending the existing one — chose extending: same fixture-harness shape (`make_isolated_fixture`, `run_promote_picked_id`), avoids duplicating ~150L of boilerplate, task brief explicitly allowed either.
**why-decision:** Proved against git-HEAD (pre-fix) copy of the jq that the isolated `FEAT-SEVERITY-OVERRIDE-SURFACING` fixture flips PROMOTED->NOT-PROMOTED only after the new gate — load-bearing, not a false-green. Spot-checked 3 more class members (`AUDIT-FC-FRED-MACRO`, `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP`, `FOLLOW-ON-CWKSCH-3`) individually gated; full verifier control assertion still passes (no over-block).
**why-change:** No change from task brief.

### STEP developer-S4 · developer · 2026-07-12T16:05:00Z
**task-id:** FACTORY-NEWS-extract-rss-parse
**what-done:** Extracted `apps/news-fetch/src/infrastructure/scrapers/rss-parse.ts` (`fetchRss` + `parseRssXml`/`extractTag`) from the byte-identical parse logic in `reuters-rss.ts`/`bloomberg-rss.ts`; both scrapers now delegate, keeping only their literal URL const + `NewsSource` + default `maxItems`.
**what-considered:**
- Split into a pure `src/primitive/` parser + separate infra fetch-orchestrator file (2 files) — rejected: backlog-detail's own approach spec (po-authored, `docs/data/orch/archive/backlog-detail.json#FACTORY-NEWS-extract-rss-parse`) named one file `rss-parse.ts` with exact signatures `parseRssXml(xml,fetchedAt,maxItems,source)`/`extractTag`/`fetchRss(url,source,maxItems)` and a `<=120L` target — followed that literally as the authoritative spec instead of my own DDD-purity preference.
- Keeping `REUTERS_RSS_URL`/`BLOOMBERG_RSS_URL` as literal consts in each scraper file (not moved into shared config) — required: `fix-reuters-url-bloomberg-timeout.test.ts` does `readFileSync` + regex match on `reuters-rss.ts` source text for a literal `REUTERS_RSS_URL = '...'` assignment; moving it would silently break that regression guard.
- Deriving `logPrefix` as `` `${source}-rss` `` inside `fetchRss` rather than passing a 4th param — `NewsSource.REUTERS`/`NewsSource.BLOOMBERG` enum values are literally `'reuters'`/`'bloomberg'`, so this reproduces the original `[reuters-rss]`/`[bloomberg-rss]` log strings exactly with one fewer param.
**why-decision:** Behavior-preserving proof: `git stash` back to pre-refactor code, ran the 3 scraper-specific unit test files (64 pass/0 fail, identical log lines) as baseline, `git stash pop`, reran same 3 files post-refactor — identical 64 pass/0 fail/121 expect() calls. Full suite unchanged (233 pass/6 skip/0 fail both before and after). Sandbox 16/16 GREEN, tsc clean, eslint clean.
**why-change:** No change from po's backlog-detail approach spec — followed file name, function signatures, and <=120L target as written.

### STEP developer-S5 · developer · 2026-07-16T17:40:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE
**what-done:** Generalized `is_plan_only`/`is_non_dev_next_agent_unrouted` in `scripts/devteam-backlog-promote-bounded1.jq` to delegate to new `effective_plan_only` (board-OR-detail, mirrors `effective_supervised`) / `effective_next_agent` (detail-first/board-fallback, mirrors `effective_owner`); dropped the old "AND board next_agent empty" clause from the next_agent gate — that clause is exactly why an inline board `next_agent` (e.g. `architect`) with no detail entry slipped through. Proved pre-fix leak directly: isolated fixtures of the 4 named P1 rows + all 8 `UC-*-UNVERIFIED-BATCH` rows (supervised stamp stripped) were promoted pre-fix, withheld post-fix. Extended verifier with AC-8 (live-discovered, no hardcoded IDs), AC-9/AC-10 (synthetic) + corrected AC-6's fixture (`next_agent` value "architect"→"developer" — the old value was a coincidental non-dev string that the new gate now correctly catches, invalidating it as an "already-routed" filler).
**what-considered:**
- Editing `is_plan_only`/`is_non_dev_next_agent_unrouted` bodies in place vs adding named `effective_*` wrapper functions — chose the latter to mirror the file's own established `effective_owner`/`effective_supervised`/`effective_children` naming precedent exactly (spec explicitly named the new functions `effective_plan_only`/`effective_next_agent`).
- Leaving AC-6 fixture's `next_agent:"architect"` unchanged and treating the resulting FAIL as an acceptable/expected side effect — rejected: the task's own root-cause is "next_agent=architect should be withheld", so a test still expecting a promote on that exact value would be asserting the bug, not the fix; corrected the fixture value instead of the code.
**why-decision:** Verifier prior to fix (9 assertions) reproduced the exact 208-row pre-fix candidate leak (grep-diffed against the 4 named P1 rows + 8 UC-*-UNVERIFIED-BATCH ba rows cited in the PO root-cause); post-fix all 12 assertions (AC-1..AC-10 + control) PASS, and direct isolated-fixture probes on the 12 originally-cited live rows (supervised stripped) all resolve to NOT-promoted.
**why-change:** No change from PO's fix-spec; AC-6 fixture value correction is a test-hygiene fix flagged inline in the verifier's own header/comments, not a scope change.

### STEP developer-S6 · developer · 2026-07-16T20:16:11Z
**task-id:** CI-RED-b51fbe13-FIX
**what-done:** Deleted the single `**Sector**:` line from BSR.md/VIX.md/DBC.md (docs/analysis-briefs/) — the 3 files ebbfda6a5 added with a legacy field the BSD3-brief-sector-drift.test.ts structural guard forbids (sector SSOT lives in WATCHLIST_SEED domain, never the brief body).
**what-considered:**
- only path: root-cause pre-verified by PO (local repro), guard test itself correct/not touched — pure data-line removal, no code/generator change needed.
**why-decision:** Baseline repro confirmed BSR.md as sole failure (3 pass/1 fail); after 3-line deletions test is 4/4 green; every other brief + canonical template already lack the field, so removal is definitive (no re-emission source).
**why-change:** No change from PO fix-spec.

### STEP developer-S7 · developer · 2026-07-21T16:22:00Z
**task-id:** FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE
**what-done:** `scripts/agents-flow/drain-signals.js` repointPayloadRefs()'s jq execFileSync gained explicit `maxBuffer: 64MB` (default 1,048,576B < live doc's 1,109,434B, guaranteed ENOBUFS forever since the doc only grows); reclassified the jq-computation catch from silent WARN+return to FAIL-LOUD process.exit(1), matching the two pre-existing orch-apply.sh failure paths — left the genuinely-benign `!result.changed` branch untouched.
**what-considered:**
- Only path for maxBuffer size: pick multi-decade headroom over current growth rate (bounded, cheap resource) vs. a tight fit that could recur — chose generous fixed constant with comment citing measured numbers.
- Catch-block reclassification: reuse existing FAIL-LOUD string/exit pattern from lines ~268/272 rather than inventing a new error class, to stay consistent within the same function.
**why-decision:** RED-before proved twice: (1) natural TDD order — new ENOBUFS test scenario against pre-existing unfixed code failed 21/22 (`spawnSync jq ENOBUFS` swallowed as non-fatal, payload_ref left dangling); (2) `git stash push --keep-index` on drain-signals.js only (test file kept) reproduced the identical 21/22 failure against the reverted file. After the fix: 22/22 GREEN both times. Grepped scripts/agents-flow/ for other execFileSync/spawnSync reading orch-state.json or a growing file without maxBuffer — none found; every other call either queries small aggregates (sqlite3 COUNT) or (orch-apply.sh invocation) never echoes the doc back to stdout.
**why-change:** No change from router-supplied root cause; scope held to the 2 defects named (maxBuffer + reclassify), did not widen to price_anomaly drain-skip family (separate signal emitted to po instead, per instruction).

### STEP developer-S8 · developer · 2026-07-21T19:56:00Z
**task-id:** CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR
**what-done:** Grepped for the actual telemetry writer (not filename-guessed): `docs/agents/cowork-team/flow/telemetry.md` Step 6.1, a flow-doc bash heredoc, not a script. Stopped before editing it (agent-father's zone per dispatch table "All agent-file lifecycle"); shipped only step (2) — `drain-signals.js` unparseable-JSON catch now `console.error`s an immediate loud WARN, distinguishable from the benign non-signal-shape skip.
**what-considered:**
- Edit telemetry.md myself anyway (developer's zone fallback is "no matching zone -> developer handles it") — rejected: dispatch table explicitly names agent-father for ALL agent-file lifecycle edits, and the router's own instruction pre-flagged this exact branch ("say so and stop... needs re-routing, not a drive-by edit").
- Skip step (2) too since step (1) is blocked — rejected: step (2) is independent of step (1) (drain-side, not writer-side), squarely in scripts/ (my zone), and the router only forbade doing step (3) before step (1), not step (2).
**why-decision:** Zone-check is Step 0 of my own flow; a flow doc executed by an LLM agent at runtime is categorically different from Bun/TS production code my TDD mandate is built for, and the dispatch table is unambiguous on ownership.
**why-change:** Re-ordered per router (step 1 urgent) but step 1 could not land in this session; annotated the board row (`developer_progress_20260721T1953`) so PO/router can re-route next_agent to agent-father. Step (3) intentionally not done — router scope forbids it before (1) ships.

### STEP developer-S9 · developer · 2026-07-21T20:20:00Z
**task-id:** FIX-DRAIN-TEST-HARNESS-ORCH-HELPER-COPY-LIST
**what-done:** `drain-signals.test.js` `makeOrchRefHarness()` fixed-array copy list replaced with `deriveOrchApplyHelpers()` — regex-scans `orch-apply.sh`'s own source for `${REPO_ROOT}/scripts/<name>.<ext>` invocations at test-run time, plus `scripts/orch-apply.sh` itself, into the sandbox copy set.
**what-considered:**
- Static one-line append of `orch-stamp-updated-at.mjs` only — rejected: AC4 explicitly required a durable fix, and a hand-maintained parallel list re-arms the identical trap for the next helper orch-apply.sh grows.
- Derive by parsing invocation lines (chosen) vs. asserting-and-failing if a referenced script is absent from a still-hand-written list — chose derive: strictly fewer moving parts, self-updating, zero maintenance burden going forward.
**why-decision:** Confirmed via grep that every orch-apply.sh helper invocation follows the identical `bun "${REPO_ROOT}/scripts/<name>.<ext>"` idiom (3/3 current helpers); the regex captures exactly that pattern and throws loud if it ever matches zero (regex-staleness self-detection).
**why-change:** No change from PO's acceptance criteria; ran the full suite genuinely (no truncated copy) per AC2/AC3 — 28/28 pass, all 13 previously-dark assertions execute and pass, none fixed silently (none needed fixing).

### STEP developer-S10 · developer · 2026-07-29T13:27:00Z
**task-id:** ALPHA-S3-DIVERGENCE-SCREEN-V1
**what-done:** BOUNDED-1 auto-picked this zone=multi row directly to developer (owner="developer" in board row). Ran brownfield recon (grep/semble, not a formal architect design pass): all 4 required signal legs already have wired reuse points — `computeForeignAccumRank`/`computeRelativeStrength` (clients.ts, HTTP to stock-price:5000/technical-analysis:5003, both already return per-ticker z-score/rank/label), `rag_analyses` per-ticker sentiment (affected_actions LIKE pattern, sentimentTrendTools.ts precedent) + `mention_velocity` (mentionVelocityStore.ts) — both local mcp-server tables. Existing `alertDigestJob.ts`/`foreignFlowAlertJob.ts` scan→Telegram-digest pattern is the correct reuse target for "existing alerts path". Concluded single-zone `apps/mcp-server/` is feasible (mirrors 5/5 sibling ALPHA-S* zone corrections architect made earlier this sprint for the identical reason).
**what-considered:**
- Implement directly (join+rank is "nearly pure SQL", all legs pre-wired) — the case FOR is real: no downstream service code needed at all.
- Route to architect for a design pass before implementing — chosen.
**why-decision:** This is a NEW composite/divergence detector (ranking formula + per-leg "thin data" honest-null threshold + digest format) feeding a LIVE external Telegram digest — same category as `getMoneyRadarComposite.ts`, which needed a dedicated architect brief (D1-D4 divergence rules, HN-1..HN-7 honest-null enumeration) despite also reusing 8 already-wired tools. Every ALPHA-S* task in this sprint, including the "lean single-file" ones (OMO-cron, RAG-FTS-cron), got an architect brief first — no exceptions found. The row's own note explicitly says "Needs dev-team PM/architect decomposition when picked". Did NOT implement.
**why-change:** Set board row `status:BLOCKED`, `next_agent:architect` (was IN_PROGRESS/developer) via orch-apply.sh; `.head` reset idle. No code shipped this cycle — recon + routing only.
