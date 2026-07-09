# Developer — Notebook

**Last updated:** 2026-07-09 | **Cycle:** FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT (qa re-review bounce fixed)

## Session 2026-07-08 — FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT (router-escalated, live-observed dead-drive window)

**Task:** router observed 4 consecutive dev-team cron ticks all falsely `SKIP` with detail "SF-1 held by peer session" despite `task_list_held` independently confirming `dev-team-cron-singleton.owner_client_session` == the calling session every time — a full-TTL phantom self-collision, exactly as the backlog row's status_note pre-diagnosed. **Zone:** `scripts/` → owned by `developer` directly, no dispatch.

**Confirmed diagnosis (read both functions before touching anything):** `_step_sf1_claim()` in `scripts/agents-flow/dev-team-tick-preflight.sh` inspected only `.claimed` on a failed claim — any non-`true` result was treated as "peer holds it" -> SKIP, with zero check of `current_holder.owner_client_session`. Sibling `_step_fire_election()` already had the correct self-hold branch (compare holder session vs self, heartbeat-renew + proceed on match).

**Fix:** mirrored `_step_fire_election()`'s exact pattern into `_step_sf1_claim()` — on `claimed:false`, compare `current_holder.owner_client_session` to self; self-hold now heartbeat-renews SF-1 and returns 0 (proceed to fire-election) instead of false-SKIP. Genuine peer (different session) unchanged: SKIP path (a), releases nothing (never held it).

**Live-verified, not just unit-tested:** ran the script directly against the actual production lock (`dev-team-cron-singleton` self-held by this session) — verdict flipped from the previously-observed `SKIP` to `RUN`, both SF-1 and fire-election locks confirmed still healthy/self-held via `task_list_held` post-run (TTLs renewed, no corruption).

**Test:** added T19 (self-hold -> RUN, heartbeats, no release/no telegram) + T20 (regression guard — real peer-hold still SKIPs, still releases nothing) to `dev-team-tick-preflight.test.sh` — 55/55 pass (53 pre-existing unchanged + 2 new).

**Scope discipline:** touched only the one script + its existing test file + board/journal/notebook writes, per dispatch boundary. No `apps/*` change, no Docker Close Gate needed. Board flipped BACKLOG→REVIEW, `next_agent`→qa via `orch-apply.sh`; `.head.next_agent` synced to match in the same write (known recurring gap called out explicitly in this dispatch — verified with `jq '.head'` before finishing).

## Session 2026-07-08 — FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE (PO-escalated follow-up from SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE)

**Task:** SPIKE (architect, 2026-07-08) proved gateway-blindness is 100% client-side (CLI MCP connection lifecycle, no repo fix possible) and spun off this repo-actionable follow-up: bridge the 3 gateway meta-tools for bash-equipped agents + codify a de-escalation rule to stop the CRITICAL re-raise churn (7 agent types, 4 guaranteed-slot misses, 22h+ open). **Zone:** cross-service/ (scripts/ + docs/standards/) → developer handles directly, no dispatch.

**Implementation:** added `mcp_call_gateway_meta(tool_name, json_args)` to `scripts/agents-flow/mcp-call.sh`. The gateway endpoint is genuinely stateful (unlike the existing stateless `mcp_call()`), so the new function runs the full `initialize -> notifications/initialized -> tools/call` handshake, reusing the `mcp-session-id` header minted by step 1. Reused the existing `_mcp_call_parse()` for the final response — proved live that it's the identical SSE-framed JSON-RPC shape. Added §6 Degraded Mode to `docs/standards/gateway-call-contract.md`: self-diagnosis rule, workaround coverage matrix, discovery-first cross-ref, and §6d — the de-escalation rule (≥2x corroborated this session → stop re-raising CRITICAL) that is the actual fix for the churn that triggered this dispatch.

**Live-verified beyond stubs:** ran the new function directly against the real production gateway for all 3 meta-tools (list_servers, list_server_tools, search_tools) — all succeeded end-to-end. Caught a real gotcha doing this: `search_tools`'s raw JSON-RPC schema requires `{"query":...}`, not `{"keyword":...}` as shown in §2's native-tool-call pseudocode (different call surface, same repo) — documented explicitly in §6b to avoid shipping a footgun.

**Test:** new `mcp-call-gateway-meta.test.sh` (RED: function-not-found -> GREEN: 20/20, stubbed `_mcp_call_gateway_curl` covering happy path + session-id propagation, invalid/missing tool_name, transport failure and non-2xx at each of the 3 steps, isError passthrough). Re-ran `cowork-tick-preflight.test.sh` (20/20) + `dev-team-tick-preflight.test.sh` (55/55) — zero regression (both stub `mcp_call` after sourcing, untouched by this change). shellcheck clean.

**Scope discipline:** did not touch existing `mcp_call()` or the standalone CLI dispatch block (kept the diff conservative, exactly the SPIKE's stated scope — "add, don't merge"). Root cause (CLI-side MCP client lifecycle) is out-of-repo and NOT fixed by this task — only the repo-actionable mitigation + de-escalation doc rule are in scope. No `apps/*` change, no Docker Close Gate needed (script + docs only). Board flipped IN_PROGRESS→REVIEW, `next_agent`→qa via `orch-apply.sh`; top-level `.head` deliberately left untouched (owned this tick by a separate parallel FACTORY dispatch).

## Session 2026-07-09 — FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT (FAST-TRACK, architect brief = spec)

**Task:** ops Docker Close Gate Step-4→qa handoff had NO checked-in atomic jq helper — 2 confirmed occurrences (`f4afa0e03`, `b907a8ea6`) of a hand-rolled inline jq one-liner updating the board row's `next_agent` but forgetting `.head` (or vice versa). Architect brief `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md` §2.1 fully specified the fix; PO fast-tracked (skip ba/pm). **Zone:** `scripts/` (confirmed in system-map.json) + `docs/protocols/` (no zone match → developer fallback) — both mine per the router's explicit split note.

**Fix:** minted `scripts/ops-closegate-handoff.jq` — one jq expr, `--arg task_id/from_lane/next_agent/now`; `error()`s if `.task_board[$from_lane][] | select(.id==$task_id)` is absent (no silent no-op); sets that row's `.next_agent` only (status/lane untouched); conditionally syncs `.head.next_agent/.updated_at/.updated_by` ONLY IF `.head.active_task_id==$task_id` (verified live — at pickup `.head.active_task_id` WAS this very task, so scenario A path exercised for real before I even wrote the test harness). No hardcoded task-id/lane literal in the filter body (grep-verified; the only literal is `"ops"` for `updated_by`, per brief spec). Added runbook `docs/protocols/docker-deployment-runbook.md` § Close-gate table Step 4b row + updated the Delegation-rule sentence to include it.

**Verification (no `.jq` unit-test convention exists in this repo — `router-d1-claim.jq`/`devteam-backlog-claim-bounded1.jq` ship without one):** 3 manual scratch-copy scenarios against a copy of the real live `orch-state.json` — (A) row present + `.head` matches → both writes land; (B) row present + `.head` points at a DIFFERENT task → row updates, `.head` untouched byte-for-byte; (C) row absent from the stated lane → `error()`, non-zero exit, empty stdout (no partial write). Also ran the real `bun scripts/orch-validate.mjs` against scenario A's candidate output — Stage 0+1 PASS (123 pre-existing coherence warnings unrelated to this change, same count before/after).

**Scope discipline (per dispatch split note):** did NOT touch the commit-gate footnote (brief §2.2), the STEP ops-Sn journal-filename enforcement line (§2.3), or `.claude/skills/commit-boundary/SKILL.md`'s zone table — those are the follow-on `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE` task (agent-father, `depends_on: [this task]`). No `apps/*` change, no Docker Close Gate needed (script + doc only, no rebuild) — flipped board row REVIEW, `next_agent`→qa via `orch-apply.sh`.

## Session 2026-07-09 — FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT (qa CHANGES_REQUESTED bounce, one-line-class doc fix)

**Task:** qa PASSED the script (`scripts/ops-closegate-handoff.jq`, 4/4 DoD + 3 scratch scenarios + `orch-validate` clean) but CHANGES_REQUESTED the doc: runbook `docs/protocols/docker-deployment-runbook.md:124` embedded the Step-4b invocation in a GFM table cell with the shell pipe escaped `\|` — valid table markup, but as RAW TEXT (what `Read`/any text-consuming agent sees) that backslash-pipe is not a real shell pipe; copy-pasted, `jq` gets `|` and `bash` as extra file args, exit 2.

**Fix:** moved the invocation out of the table cell into a fenced ```bash block directly below the table (real unescaped `|`); cell prose now just points at the block. Verified GFM table-cell pipe-escaping is a real spec requirement (not renderer-tolerant) before picking this over de-escaping in place — confirmed via all 9 raw table lines needing exactly 4 pipe-delimited columns each.

**Self-caught bug:** first draft referenced the pipe character in the cell's own prose as an inline code span, which reintroduced an unescaped pipe in that same cell (5 pipes instead of 4) — caught by a raw pipe-count check across all table lines before calling it done.

**Board:** status stays REVIEW, `next_agent` developer→qa, `qa_verdict` CHANGES_REQUESTED→null (repo precedent: commit `975465911`), `.head.next_agent` synced to qa in the same atomic `orch-apply.sh` write.
