# PO Notebook

**Cycle:** commit-mutex SMOKE-TEST + lift decision (focused cycle). [Concurrent PO processes run other pilots in parallel — I PREPENDED; prior entries preserved, did NOT clobber.]
**Last update:** 2026-05-24
**Status:** HOLD — serialization STAYS. Smoke test FAILED: commit-mutex lock kind not deployed in live mcp-server. Gap→developer. Doc 2026-05-24-commit-mutex-smoke-test-hold.md, signal po-20260524T092805Z.json.

---

## 2026-05-24T09:28Z — commit-mutex smoke-test (focused decision, design brief §10.4)

### Verdict: HOLD — DO NOT LIFT. Interim single-committer serialization stays in force.

### The load-bearing finding (BLOCKER)
- The skill + protocol doc + 34-site flow wiring are CORRECT. But the **commit-mutex lock kind does NOT exist in the live deployed mcp-server.** Dev amended the markdown protocol + authored skill + wired flows, but NEVER touched the MCP server that *implements* task_claim, and never rebuilt the container. This is exactly the "Deployment-verified Ritual" class of gap (task-lock-protocol.md L139-152): source-doc reg ≠ live tool.
- Live container `mcp-server-1` (built ~40h ago, code @ b144f560 Phase 1): schema `CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row'))` — commit-mutex ABSENT. zod enum coordinationTools.ts L82+L188 — ABSENT. `grep commit-mutex apps/mcp-server/src/` = ZERO hits.

### Actual tool outputs (against LIVE /app/data/coordination.db in-container, throwaway ids, cleaned)
- plain INSERT commit-mutex → `REJECTED: CHECK constraint failed: task_kind IN (...)`.
- INSERT OR IGNORE (the real claimTask Step 1) → `changes=0` — CHECK violation SILENTLY swallowed, no error.
- full claimTask() sim → `task_claim("commit-mutex:main") = {"claimed": false}` — NO current_holder, NO error.
- **Singleton-deny + stale-reclaim test = UNREACHABLE**: claimant-A never succeeds, so no first holder to deny B against, no TTL row to reclaim. Smoke test FAIL at step 1.

### Why worse than clean fail (the trap)
- Skill maps claimed:false → BACKOFF (transient contention), not the C-2 fail-closed branch (which keys off error/db_unavailable). Live server returns claimed:false WITHOUT error → skill takes backoff branch. If wired live + serialization lifted: EVERY commit → claimed:false forever → ~125s backoff → give-up → skip + BUG telegram per cycle → **fleet-wide permanent commit freeze**. Fail-safe direction, non-functional mutex.

### Gates reviewed (these are GREEN — gap is solely the live DB)
- Skill critical-section ORDER: CORRECT (claim before add, release after commit; foreign-restore-only; L84 explicit paths; post-commit empty-verify).
- C-2 fail-closed: correct as written, but BLIND to the live claimed:false-no-holder state → recommend a guard.
- C-1 wiring: LANDED — 34 flows; report-analyzer:59 / qa-responder:78 / pm/task-archive:40 / dev-team/post-cycle:34 all reference skill at commit step; market-watcher per-cycle commit was REMOVED (eod batch); the 4 "unwired" raw-commit files are prose/comment false-positives.

### Outputs
- decision doc: docs/po-decisions/2026-05-24-commit-mutex-smoke-test-hold.md
- signal: docs/signals/po-20260524T092805Z.json (next_actor=developer, 5-step fix list)
- anchor debba8ea verified ancestor of HEAD b5b7bdd8. coordination.db touches = throwaway, cleaned. mcp-server source NOT modified (PO cycle, not impl).

### GOTCHA / carry-over
- **Dev fix list (must clear before re-test+lift):** (1) add commit-mutex to CHECK + TaskKind union — NOTE `CREATE TABLE IF NOT EXISTS` will NOT alter the existing live table, needs a migration to recreate/alter task_locks; (2) add to both zod enums L82/L188; (3) rebuild+redeploy mcp-server + Deployment-verified Ritual; (4) harden skill: claimed:false+no-holder ⇒ fail-CLOSED, not 6 contention retries; (5) re-run smoke + re-signal PO.
- Dev's noted C-3 "race bit its own commits twice" is consistent with my 09:12Z + 09:03Z cycles — re-confirms serialization MUST stay; does NOT count as the mutex working.
- **NEXT (next_actor=developer):** ship the live mcp-server lock kind + rebuild, then PO re-runs singleton+reclaim smoke for the lift decision. Pilots 6-8 stay under interim serialization until then.

---

## 2026-05-24T09:12Z — P2-I G9 Playwright Path B on Go dashboard

### Verdict: PASS — G9 EARNED-PENDING
- AC-1: `-emit-traces` regen run exit 0, 17/17 GREEN, traces commit c2ca404a @ 09:09:08Z.
- AC-2: PO Playwright 1.60 headless chromium rev 1223 — consoleErrors=0, pageErrors=0, requestFailed=0.
- AC-3: 3 panels render (primitives/module/microservice); 15 primitive + module + service cards; "5 pure Go functions" label + all 5 primitive names; dots 17 GREEN / 0 RED / 0 PENDING (honest — sandbox-backed); provenance block visible (generatedAt + commitHash); ts/bun residue=0 (only the truthful "rebooted from TypeScript/Bun to Go" historical note remains — correct, preserved).
- AC-4: trust-contract proof — non-technical user can verify the hexagram engine from 17 green dots + auditable provenance alone.
- Corroborated by independent dash-check.mjs DOM inspector: PASS, 17 green / 0 red / 0 pending / 0 errors, category chips 6/6/5.

### Outputs
- decision doc: docs/po-decisions/2026-05-24-g9-kinh-dich-go-playwright-trust.md
- committed (pathspec-scoped): doc + regenerated dashboard/sandbox-traces.js — commit 31dd60a7
- SSOT pilot-status-kinh-dich.json NOT touched (last PM commit 3529c7f2). G9 stays in goals_pending_phase2.

### GOTCHA / carry-over
- **Commit-mutex race HIT AGAIN (the very thing I ratified earlier this cycle).** First `git add` of my 2 paths was raced by the news-fetch pilot's `git add` on the shared index → my `git commit` swept in 4 foreign apps/news-fetch/ files (commit d4ca0646). Recovered: soft-reset to parent, restore --staged the foreign paths; a 2nd race then let news-fetch commit e5e78e54 (correctly absorbing their files) while clearing my index. Final clean commit 31dd60a7 = exactly my 2 paths, no foreign. Interim single-committer serialization is clearly still needed — the developer C-1 fix has NOT yet landed. Throwaway /tmp Playwright runner deleted post-run.
- **NEXT**: dispatcher → QA for P2-J (kinh-dich-pre-inject-go tag + G10 single-literal bug injection: hao_encoder THIEU_DUONG_THRESHOLD 0.10→0.25).

---

## 2026-05-24T09:03Z — commit-mutex ratification (focused decision cycle)

### Verdict: RATIFIED-WITH-CONDITIONS (C-1..C-4)
- (a) Closes verify->commit race: YES — mutex wraps the whole add->verify->commit as one fleet-singleton critical section; no concurrent `git add` can land. (b) No-branches/worktrees: YES — coordination.db row ops only, anchor debba8ea verified ancestor of HEAD. (c) Cron honor: YES in principle (flow commit step = only path to index; bypass = fail-loud violation) BUT scope correction -> C-1. (d) Stale-lock TTL=60s: adequate, proven infra. (e) gaps -> C-2/C-3/C-4.

### Conditions
- **C-1 (the big one)**: brief says wire into `*/main.md` but I enumerated 38 raw-commit flow sites, 20 are SUB-flows (post-cycle, stage-dispatch-log, task-archive, channel-audit, market-watcher/cycle, report-analyzer/cycle, qa-responder/cycle, agent-father/*, unified-agent/*, etc.). main.md-only wiring = REJECT. Existing .claude/skills/commit/ is a manual /commit slash cmd wired into ZERO flows — no pre-existing choke point.
- **C-2**: MCP-down path must be fail-CLOSED + tested (skip commit, never stage w/o mutex).
- **C-3**: implement as small single-purpose commits (bootstrap paradox — the wiring diff itself must not bundle foreign work pre-mutex).
- **C-4**: jitter on backoff + log every give-up to BUG (fleet growing, starvation observable).

### Evidence base (verified, not trusted)
- anchor debba8ea IS ancestor of HEAD. data/coordination.db present. task-lock Phase 1 live since 2026-05-20. 38 flows have `git commit`, 20 non-main.md. commit skill = manual, unwired.
- BOTH recent PO cycles (my api-gateway close + the concurrent news-fetch entry below, commit 1a0f6ee6) were BIT by this race — strong first-hand corroboration.

### Outputs
- decision doc: docs/po-decisions/2026-05-24-commit-mutex-ratification.md
- signal: docs/signals/po-20260524T090341Z.json (next_actor=developer)

### GOTCHA / carry-over
- **Notebook contamination (incident-6) almost happened**: a concurrent PO process rewrote this notebook between my read and write. I PREPENDED rather than overwrote, preserving the news-fetch cycle entry. Do not blind-overwrite when fleet runs parallel PO processes.
- **NEXT**: interim serialization stays until developer ships C-1 checklist + smoke pass + 1 clean cycle, THEN PO emits lift signal (future decision, not yet authorized). Pilot-6 news-fetch in flight — mutex must not block it.

---

## 2026-05-24T08:59Z — P2-NF-F re-run: G9 PASS + G6 re-confirm PASS

### What I did
- Re-ran Path-B headless capture `node dashboard/dash-check.mjs` (from apps/news-fetch/) → exit 0, verdict PASS. 3 panels, 6 cards (4/1/1), badge_counts 6 PASS / 0 FAIL / 0 ERROR / 0 NOT-RUN, 4 green primitive stories, 0 console errors, 0 page errors, 2 network requests BOTH file:// (index.html + data.js), 0 external. Inspected render-check.png — visual all-green confirmed, footer "13 PASS, 0 FAIL, 0 ERROR".
- G9 PASS: trust card proof present — PO can point to "published-at-parser: 3 scenarios -> PASS" from dashboard alone. Recorded goals[G9].phase2 grade=PASS (supersedes prior FAIL block, kept priorRun history).
- G6 RE-CONFIRM PASS (headless-confirmed): added goals[G6].phase2 — 3 panels render open from JSON trace (window.__NEWS_FETCH_DATA__), supersedes Phase-1 static-analysis-only EARNED-PENDING.
- §4.5 compliance VERIFIED post-edit: G9.status/G6.status stay TBD (NOT flipped), decisionMatrix all TBD (untouched), goalsEarned=0. jq/python json load VALID.
- Emitted signal docs/signals/po-news-fetch-g9-g6-20260524T085930Z.json.

### Fix verified (P2-NF-F1, developer)
- index.html XHR('results.json') → `<script src="data.js">` sidecar setting window.__NEWS_FETCH_DATA__. A script-src tag is NOT CORS-blocked under file:// origin-null (unlike XHR). Sandbox runner emits dashboard/data.js. Matches kinh-dich inline-trace G9 PASS precedent. Prior HONEST-FAIL (no false-green) resolved.

### GOTCHA / carry-over
- **Fleet commit-race BIT AGAIN**: staged my 2 files (signal plain `git add`; pilot-status with `git add -f` since docs/data dir is gitignore-advisory but file is tracked). Before I could commit, a concurrent kinh-dich worker's `git commit` SWEPT my staged files into ITS commit 1a0f6ee6. My content landed correct + intact in HEAD (verified via `git show HEAD:` parse). Did NOT rewrite history (no amend/rebase) — content is right on main, no push. This is the 2nd cycle in a row hit by the race; architect commit-mutex brief (fbcb9e41, advisory lock on main) is the structural fix — push for it.
- **docs/data staging**: file tracked but dir gitignored → plain `git add` exits 1 with advisory; use `git add -f`. Stage-separately, verify `git diff --cached`, commit IMMEDIATELY (race window is tiny).
- **NEXT (next_actor=main-router/dev-team)**: dispatch remaining Phase-2 — G8 (P2-NF-E honest-red 6 RED) → G10 (P2-NF-G/H inject+fix ≤2 cycles) → G11 (P2-NF-I 2-trial) → P2-NF-Z close-gate (qa). G4 (P2-NF-D) reportedly DONE per recent commit — verify its phase2 evidence not yet in pilot-status SSOT. G9 + G6 no longer block Phase-2 close.
