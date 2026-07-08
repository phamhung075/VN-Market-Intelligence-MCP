# Developer — Notebook

**Last updated:** 2026-07-08 | **Cycle:** FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT

## Session 2026-07-08 — FIX-NEWS-CB-FALSE-CLOSED (BOUNDED-1 idle pickup)

**Task:** 2026-06-13 filing said Reuters RSS + TradingEconomics x2 hit CB threshold but stayed falsely reported [OK]. dev-team's live pre-check (this tick) showed the CB half already fixed — status now correctly shows "Ngưng"(down), but two NEW live bugs: (1) both sources coded permanently-disabled since 2026-05-13 yet still accumulating failures (79 and climbing, zero successes ever), (2) a duplicate-looking "Trading Economics" row. **Zone:** `apps/news-fetch/` per task filing — but that's a routing hint, not the real owner; traced call graph first.

**Architecture check (per task's explicit ask):** confirmed `apps/news-fetch/` (Go microservice, port 5008) is a separate, unwired pipeline — only reachable via `api-gateway`'s generic `NEWS_URL` proxy map (`cmd/server/main.go`). It never touches `apps/mcp-server`'s `pollNews`/`SourceHealthTracker`/`get_system_status`. Fix correctly belongs in `apps/mcp-server` (confirmed live via direct `get_system_status` query showing real, growing counters — the legacy tracker is genuinely live, not a stale/dead path).

**Root cause A:** `intelligenceCycleJob.ts`'s `defaultPollNews()` (scheduled every 15-min tick) re-injected `reuters: async()=>[]` / `tradingeconomics: async()=>[]` no-op stubs. `pollNews.ts`'s health loop treats a fulfilled-but-empty result from a source NOT in `STUB_CAPABLE_KEYS` (only `newsapi` is) as a real failure → `recordFailure()` fired every tick, silently overwriting the one-time `recordDisabled()` seed from Sprint 1833g/1898b. Fix: remove both keys entirely — `pollNews.ts`'s own `resolvedFetchers` already excludes them from scheduled runs unless a caller explicitly injects a fetcher (that contract was already documented in-code, just not honored by this one caller).

**Root cause B (live-confirmed via `get_system_status`, byte-diff'd):** `formatSourceHealthTable`'s 18-char Nguồn column truncates "Trading Economics" (17c) and "Trading Economics News" (22c) to the identical string `"Trading Economics "` — not a registry duplicate, a display collision. Widened to 26c; header/separator now derived from the same constant to prevent recurrence.

**Test:** new `FIX-NEWS-CB-FALSE-CLOSED.test.ts` — source-scan asserts `defaultPollNews()` body no longer contains `reuters:`/`tradingeconomics:` keys (kept `teChromiumNews:` — that one has a real non-deprecated fetcher, Task 1843's stub is CPU-protection only, separate concern); behavioral test proves `recordDisabled()` state survives a full `pollNews()` cycle untouched; display test proves two distinct sources with long names no longer render as byte-identical rows. RED confirmed on all 3 before the fix, GREEN after. Targeted 18-file sweep of every source-health/pollNews/intelligence-cycle test: 295 pass / 0 fail. tsc clean.

**Scope discipline:** did NOT widen the CB failure threshold (original 2026-06-13 proposal) — the CB already correctly reports down; the bug was a disabled source being re-touched, not a threshold miscalibration. Did NOT add `teChromiumNews` to `STUB_CAPABLE_KEYS` — same failure-accumulation shape but a different, real, non-deprecated fetcher; out of this task's DoD (Reuters+TE-legacy only), left as a follow-up if PO wants to file it.

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
