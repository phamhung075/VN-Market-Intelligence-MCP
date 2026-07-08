# Developer — Notebook

**Last updated:** 2026-07-08 | **Cycle:** FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE

## Session 2026-07-08 — FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE (dev-team router-filed)

**Task:** `scripts/devteam-backlog-promote-bounded1.jq` had NO depends_on eligibility check — on 2026-07-08 it auto-promoted+claimed `FACTORY-TECHANALYSIS-delete-orphaned-ts-service` (P1) while both declared prerequisites were still plain BACKLOG. dev-team caught it pre-dispatch, reverted by hand, filed this FIX. **Zone:** cross-service/ → developer handles directly, no zone match.

**Root cause detail:** depends_on lives in TWO places — inline `.depends_on` on some board rows, OR (for `detail_ref`'d rows, 293/405 backlog rows) ONLY inside `docs/data/orch/archive/backlog-detail.json .items[<id>].depends_on` — the board row itself carries `depends_on:null` plus a pointer. The promote script only ever read the thin board row, never the cold-archive detail file, so it structurally could not see the real prerequisites for the majority of rows.

**Fix:** added a depends_on eligibility filter at the candidate-selection stage (before ranking, not a post-hoc check on the final pick) — resolves effective depends_on (inline, else detail_ref lookup via new `--slurpfile detail`, else `[]`), builds a dep-status map scanning ALL 7 task_board lanes, requires `DONE_VERIFIED` (plain `DONE` insufficient — matches repo convention), conservative-skips a dep id that resolves nowhere. Threaded `--slurpfile detail docs/data/orch/archive/backlog-detail.json` through both invocation call sites (dev-team flow BOUNDED-1 block + dev-standards.md canonical pointer). `devteam-backlog-claim-bounded1.jq` verified unchanged (only claims whatever promote already stamped).

**Real-data gotcha found live:** 7/321 rows in `backlog-detail.json` carry `depends_on` as a bare STRING, not a 1-element array (e.g. `FU-RUNTIME-SET-TRUTH-RECONCILE: "FU-RAG-DEPLOY-MEMORY"`) — first jq run crashed `Cannot iterate over string`. Added an `as_dep_array` normalizer (null→[], string→[string], array→as-is) — same "assume nothing about freeform prod field shapes" lesson as IMPL-DRAIN-GATE-SEVERITY-RECURRENCE's `.related` string drift.

**Test:** new `scripts/test-devteam-bounded1-depends-on.sh`, 17/17 pass — satisfied/unsatisfied depends_on in both inline and detail_ref shapes, no-depends_on baseline (no regression), dep-resolves-nowhere conservative-skip, DONE-vs-DONE_VERIFIED distinction, string-depends_on drift shape.

**Sanity-checked against real live data (scratch copy, dry-run, never through orch-apply.sh):** fixed script now correctly SKIPS `FACTORY-TECHANALYSIS-delete-orphaned-ts-service` (still unmet deps) and would promote `FACTORY-TECHANALYSIS-go-livepath-tests` (`depends_on: []`, the actual next-eligible P1 row) instead — matches the exact remediation PO/router expected.

**Scope discipline:** did not touch `devteam-backlog-claim-bounded1.jq` (verified no change needed). Did NOT promote/resolve `FACTORY-TECHANALYSIS-go-livepath-tests` myself — PO explicitly declined manual promotion this cycle; fixed automation picks it up organically on a future idle tick. No task branch (project convention: work stays on `main`). `graphify --update --no-viz` skipped — no Skill-invocation tool available in this sub-agent's tool surface for a 4-file mechanical doc/script change.

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
