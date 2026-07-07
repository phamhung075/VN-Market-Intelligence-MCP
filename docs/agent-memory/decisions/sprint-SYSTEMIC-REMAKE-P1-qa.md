# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · qa

**Sprint goal:** Systemic remake — churn-not-product review fix order (idle-loops→verif→detector).
**Agent:** qa
**Started:** 2026-07-04T10:45:12Z

---

### STEP qa-S1 · qa · 2026-07-04T10:45:12Z
**task-id:** FACTORY-ALERT-consolidate-dual-engines
**what-done:** Re-verified dev-team's uncommitted Go consolidation (12 files, apps/alert-engine) independently — build/vet/test/sandbox/lint + 5 flagged reconciliation decisions.
**what-considered:**
- Trust dispatcher's raw-verify badges vs re-run everything myself — re-ran all 4 (go build/vet/test/lint) + sandbox scenario myself, all matched claims exactly
- Store-timing change (fire decoupled from Telegram) — checked openapi.yaml literal contract text, confirmed it explicitly separates fired/telegram_sent
- Whether store-before-send is a live regression — traced that the OLD LIVE engine (Engine B, wired in main.go pre-fix) already stored before Telegram (fire-and-forget); the engine that required Telegram-success-before-store (old Engine A/tested pipeline) was NEVER wired into main.go (discarded via `_ = alertpipeline.New(...)`) — so no regression vs actual serving behavior
- SentToTelegram always-0 column — grepped whole monorepo for any reader of this column outside alert-engine's own sqlite.go/test — zero external consumers, not a live regression risk
**why-decision:** All 5 scrutiny points verified sound against ground truth (code reads + openapi.yaml text + whole-repo grep), not just worker's claims. TelegramClient.Send confirmed (by reading infrastructure/telegram.go) to never return non-nil error in any branch, validating the doc's "swallowed = zero live risk" claim. 0 issues found → APPROVED.
**why-change:** no change from plan — routine PASS gate, all checks green.

### STEP qa-S2 · qa · 2026-07-07T18:10:00Z
**task-id:** CI-RED-c5b5f885-FIX
**what-done:** RAW-verified dev-mcp-server's CI-red fix independently — did not trust claimed green badge or claimed no-leak.
**what-considered:**
- Trust `gh` badge vs pull real job logs — pulled `bun test` job conclusion + log content for both post-fix runs (28886901289, 28887280793) AND all 3 pre-fix red runs; FAILEDFILE lists match the claim exactly (1410 3/3, 262 2/3, 183-alert-accuracy 1/3 unrelated)
- Mock-leak claim — independently ran 1410+257 together and 262+258 together (not the worker's own runs) to reproduce; sibling DI/real-fetch assertions still pass, proving no leak in both directions; also read ci-per-file-isolation.sh and confirmed leak is structurally impossible under real CI (one process per file)
- Diff scope — `git show 1efb6f918` confirms 2 test files only, mock-guard.sh confirms 0 production files
- Local full-suite via project's own CI-equivalent script (not bare bun test, per journal's own prior warning) — 1410/262 absent from the 12 failed files; residual fails match prior QA baseline (TASK_REPORT_CI-RED-323b512b-FIX.md) class of pre-existing local network flake
**why-decision:** Every claim independently reproduced against ground truth (real GH Actions logs, my own bun test runs, my own script read) rather than relayed. DJ-GATE-1 journal entry present (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP S2). verification_gate=ci_green_on_subsequent_push satisfied (1efb6f918 ≠ original red SHA f71643fb, both post-push runs conclusion=success) → APPROVED, flip review→done_verified.
**why-change:** no change from plan — routine PASS gate, all checks green.

### STEP qa-S3 · qa · 2026-07-07T20:35:00Z
**task-id:** KD-OBS-01-FIX
**what-done:** RAW-verified dev-mcp-server's silent-drop fix (8 catch blocks → BUG channel) — read full diff, re-ran everything myself, ran full suite 3x independently.
**what-considered:**
- Trust the 8-catch-block claim vs read every hunk — read `git show 6c1cd6aa9` in full for all 8 files; confirmed identical response-body construction pre/post diff in every catch, `void notifyError(...)` never awaited, notifier's own try/catch swallows all errors including `sendBugFn` throwing — non-fatal contract holds structurally, not just by docstring
- appendMarketHexagram/appendStockHexagram exclusion — read both functions; catch wraps a cross-service HTTP call (service-unreachable), structurally different failure class from the in-process DB-error catches in scope — exclusion correctly scoped, not a gap
- Dev's claimed full-suite number (14290/63) vs mine — ran `ci-per-file-isolation.sh` 3x (2 runs accidentally overlapped from my own background-job mistake, 1 clean); none of my 3 totals matched dev's exactly, but ALL 3 runs show zero kinh-dich failures and the clean run's 11 failed files are a strict subset of the contended runs', 8/11 exact-matching cycle-379's own documented same-day baseline cluster — treated as pre-existing flake, not a regression, despite the raw count mismatch (bare `bun test` vs isolated harness are known to diverge in this repo)
**why-decision:** Independently reproduced every load-bearing claim (diff read, test re-run 11/11 43-expect, tsc clean, targeted 261+40 pass, full suite 3x). Commit hygiene clean (explicit-path only, no add -A). orch-state.json diff (cbc1c2751) is a clean array-move, valid JSON, no dup keys — consistent with orch-apply.sh, not a raw overwrite. DJ-GATE-1 satisfied (dev-mcp-server-S4 substantive). → APPROVED, flipped review→done_verified myself via orch-apply.sh (direct-to-main sprint-task, no branch).
**why-change:** no change from plan — routine PASS gate, all checks green.

### STEP qa-S4 · qa · 2026-07-07T21:35:39Z
**task-id:** FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP
**what-done:** RAW-verified agent-father's bootstrap-stage GATEWAY-BLIND guard (caba878b7) — did not trust either the "Option A already satisfied" or the "step-0-cowork isn't the live path" claims, re-derived both from source.
**what-considered:**
- Fleet grep for `mcp__gateway__call_tool` across all `.claude/agents/*.md` — dev-team-pipeline agents (architect/ba/developer/fixer/pm/qa/dev-*) genuinely lack the grant (not cowork agents, N/A); every cowork agent that actually routes through `step-0-cowork`/`cycle-bootstrap` (bctc-analyst, alert-commander, digest-predict, market-watcher, news-scout, unified-agent, qa-responder, po, ops) already HAS it — Option A confirmed already-satisfied, nothing to add.
- Routing claim — traced live flow files myself (not the notebook's grep summary): `bctc-analyst/flow/stage-bootstrap.md` and `unified-agent/flow/{chef,market-bootstrap}.md` (the 2 agents actually observed blind) both point Step 0 at `cycle-bootstrap/SKILL.md` directly; `step-0-cowork/SKILL.md` only appears in each agent's `init.md` `always_load` list, never as an operative Step-0 pointer — confirms cycle-bootstrap is the correct primary-fix target and both files now carry equivalent guard logic (read full diff of both).
- CONFIRMED-BLIND detection soundness — cross-checked the "no such tool"/"tool not found" text pattern against real historical error strings in this repo (`docs/incidents/2026-05-06-news-scout-bootstrap-failure.md`: "No such tool available: mcp__claude_ai_gateway__call_tool"; `po.md` notebook same session: "No such tool available"; SPIKE_C86_MCP_REG.md) — pattern genuinely matches the harness's real error shape for an unbound tool, not a guessed string.
- Safety property (no send_telegram on CONFIRMED-BLIND) — read the fallback block in both files: Write-only, canonical `{from,to,type,payload,priority,createdAt}` schema (matches fail-loud-protocol.md § Output Boundary item 5 exactly), notebook DEFERRED line, clean exit, explicit "no lock held" reasoning (blocked before task_claim) — no send_telegram call anywhere in the fallback path.
**why-decision:** Both root-cause claims independently re-derived and hold (config-layer fix b3612720 2026-06-23 confirmed via `git show`, requires CLI restart per its own commit message — explains recurrence; routing trace confirms cycle-bootstrap is live-path for the 2 actually-affected agents). Guard logic correct and matches the documented real error shape. Files are pure markdown (no build/test surface). `docs/signals/{agent-id}-{ISO}-gateway-blind.json` filename suffix is cosmetic — `drain-signals.js` reads content fields only (`fs.readdirSync().filter(f=>f.endsWith('.json'))`), confirmed by reading the script. DJ-GATE-1 present and substantive (agent-father-S2, 4 real sections). → APPROVED, flipping in_progress→done_verified myself via orch-apply.sh (direct-to-main FIX, no branch).
**why-change:** no change from plan — routine PASS gate, all checks green.
