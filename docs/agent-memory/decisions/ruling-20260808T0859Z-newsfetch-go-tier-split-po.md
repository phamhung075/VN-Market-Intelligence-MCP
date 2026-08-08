# Decision Journal — PO ruling · FACTORY-NEWS-go-server-tier-split

**Context:** dev-team Review-Lane SECONDARY-Drain handed this stale `review[]` row (status=REVIEW, `branch:null`, direct-commit, `next_agent` never resolved to qa so PRIMARY qa-drain never swept it) to PO for sign-off/triage. Row entered `review[]` 2026-07-24T15:59:50Z — 15 days.
**Agent:** po
**Timestamp:** 2026-08-08T08:59Z

---

### RULING po-R1 · po · 2026-08-08T08:59Z
**task-id:** FACTORY-NEWS-go-server-tier-split

**what-done:** Verdict = **DONE_VERIFIED**, moved `review[]` → `done_verified[]` via `scripts/orch-apply.sh` (task_total 778→778, signal_total 229→229, `.head` untouched). Every `dev_result` claim re-derived RAW rather than banked. Separately **disproved the row's own `rebuild_required=true` premise** — the decisive finding, and it inverts the "PENDING-USER-GATED" framing the brief asked me to test.

**what-considered:**
- **Rework / send back to developer.** Rejected. The scoped DoD is met and the artifacts are correct. Re-derived, not trusted from the note: `5bce393a7` exists and touches exactly the 3 claimed files (`cmd/server/main.go`, `internal/httpapi/router.go`, `internal/httpapi/handlers.go`); `b9665aff0` exists (WORK.md + journal + developer notebook). Live tree: `main.go` 138L (from 254L), `router.go` 55L, `handlers.go` 150L. `defaultRSSMaxItems=20` + `envInt("RSS_MAX_ITEMS", …)` feeds **both** `NewVnEconomyFetcher`/`NewVnExpressFetcher` call sites (`main.go:68-69`); `handleHealth(port string)` does `strconv.Atoi`; the only residual `5008` occurrences are the legitimate `envStr("PORT","5008")` fallback and a package doc comment.
- **Route to qa first.** Rejected. Every gate qa would run, I ran today: `go build ./...` rc=0, `go vet ./...` rc=0, `go test ./...` 2/2 packages `ok`, `golangci-lint --config .golangci.yml` **0 issues** (that is verbatim the CI job `news-fetch-go-lint`, `ci.yml:303`), `composition-root-logic-gate --check apps/news-fetch/cmd/server` **0 violations**. Beyond that there is no deployed surface for qa to exercise (see po-R2) and the change is a verbatim handler relocation plus two named-constant/env extractions.
- **Fail it on the `gofmt -l` hits.** Rejected as out of scope, after checking rather than assuming. `gofmt -l` does flag two files — but they are `internal/fetcher/rss.go` and `internal/store/sqlite_test.go`, both last touched by `261a5d182` (2026-06-10, GFD-9 Node→Go port), neither in this task's 3 files. `dev_result`'s scoped claim ("clean on the 3 touched files") is accurate as written.
- **Treat 15 days of staleness as drift risk.** Checked, not assumed: `git log 5bce393a7..HEAD -- apps/news-fetch/` returns exactly one commit, `66ab9deb3`, and its news-fetch diff is TS/eslint-only (`eslint.config.mjs`, `src/index.ts`, `src/routes/fetchArticle.ts`). Zero Go drift.
- **Flag the `Router(...)` signature deviation.** Noted, not faulted. `backlog-detail.json` specifies `Router(fetchers,store,logger)`; the implementation is `Router(fetchers Fetchers, s *store.Store, logger *slog.Logger, port string)`. The 4th param is *required* to carry the resolved `PORT` into `handleHealth` — i.e. it is the mechanism that satisfies the DoD's own "health port named/derived" clause. Deviating from the sketch was necessary to meet the spec.

**why-decision:** The scoped DoD ("handlers in `internal/httpapi.Router`; `main.go` a thin composition root; fetch limit + health port named/derived; tests green") is fully met and independently re-verified 15 days later with zero drift. The one DoD clause that is *not* met — "RAW-verify … **after rebuild**" — is unsatisfiable as written, for reasons that are the row's fault and not the implementer's (po-R2). Holding a green, gate-clean row in `review[]` on an impossible clause is how rows rot for 15 days.

**why-change:** no change from plan — the brief offered four dispositions and DONE_VERIFIED was one.

---

### RULING po-R2 · po · 2026-08-08T08:59Z
**task-id:** FACTORY-NEWS-go-server-tier-split (deploy gate)

**what-done:** Ruled **rebuild NOT WARRANTED**, and recorded on the row (`rebuild_required_resolution`) that `rebuild_required:true` in `backlog-detail.json` is a **stale premise**, not a pending action. No rebuild performed. No new row minted.

**what-considered:**
- **Rebuild news-fetch now, per `rebuild_required:true` + PO's granted deploy autonomy.** Rejected — and this is the ruling. `rebuild_required:true` was inherited from the 2026-06-15 maintainability audit, which assumed the Go server *is* the deployed news-fetch runtime. It is not. Five independent checks: (1) `apps/news-fetch/Dockerfile` is a Bun-builder + Playwright-Jammy multi-stage whose **runtime stage copies only** `node_modules`, `src`, `composition-root.ts`, `package.json`, `tsconfig.json` — it never invokes `go build` and copies no Go artifact; (2) `docker-compose.yml` `news-fetch` builds that same Dockerfile; (3) container config `Cmd = ["bun","run","src/index.ts"]`; (4) `docker exec … ls /app` → `composition-root.ts data mcp.config.json node_modules package.json src tsconfig.json` — zero Go artifacts, no `cmd/`, no `internal/`; (5) `ci.yml:316` states the design outright: news-fetch "carries its own go.mod/.golangci.yml (Fence-A/B depguard, GFD-9) **alongside** the TS/Bun HTTP service". A `docker compose build news-fetch` would therefore ship **0 bytes** of this task while carrying real peer-recreate risk (`feedback_rebuild_recreate_destroys_peers`).
- **Read the live `/health` as evidence the fix didn't land.** Rejected — this is the trap. `curl localhost:5008/health` returns `{"status":"ok","service":"news-fetch","port":5008}`, which *looks* like the un-fixed hardcoded literal. It is not: that response is served by `src/index.ts`, a **different program** from the Go binary this task edited (`feedback_consist_is_not_corroboration_check_the_other_plane`). Correlating the two planes would have produced a false rework verdict.
- **Treat "PENDING-USER-GATED" as blocking.** Rejected on both available grounds: PO holds full deploy/rebuild autonomy (`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`), **and** the rebuild is not warranted anyway. The note is moot, not pending.
- **Mint a new row for the "Go tier is built/linted/CI-gated but never deployed" gap.** Rejected — prior-art check first (`feedback_file_prior_art_check_before_minting_row`). Grepped all task-bearing lanes plus `backlog-detail.json` `items[]` (442 entries): the genuine news-fetch image staleness is **already owned** by `OPS-NEWS-FETCH-REBUILD-STALE-IMAGE-3-COMMITS-BEHIND` (backlog, "image built 2026-07-15, container never rebuilt"), and the Go port/deploy program is `GO-FLEET-DEPLOY`, already in `closed_sprints` with news-fetch scoped as *"port"* — not *deploy*. Minting would duplicate. Both cross-references are written into `po_note` instead, with an explicit "do not conflate" so the next picker of the OPS row does not bill this task's commits as part of its 3-commits-behind count.

**why-decision:** The DoD's "RAW-verify … after rebuild" clause presumes a container that has never existed for this tier. The developer's local-binary run — `PORT=15008 RSS_MAX_ITEMS=7`, `/health` echoing `15008` (proving derivation, not the literal), live `vneconomy.vn`/`vnexpress.net` RSS fetched and persisted as real rows in `rag_analyses`, sqlite3-inspected — is the correct **and only available** served-route parity check for an uncontainerized tier, and it satisfies the clause's intent. Marking this BLOCKED on a rebuild that provably deploys nothing would have stranded a P2 indefinitely on a bookkeeping artifact.

**why-change:** Deviates from the incoming brief in finding, not disposition. The brief asked me to test whether the "PENDING-USER-GATED" note was stale; the answer is that it is stale for a *stronger* reason than the brief anticipated — not "the gate was lifted" but "the gated action was never applicable".

---

**Latent debt (recorded, not minted):** the Go port under `apps/news-fetch/{cmd,internal}` is built, linted, CI-gated (`news-fetch-go-lint` + `composition-root-logic-gate`) and now refactored — but has never been containerized or cut over, while `GO-FLEET-DEPLOY` sits closed. Every FACTORY task landing in that tier is maintenance on a program nothing runs. Belongs on whoever next picks up `OPS-NEWS-FETCH-REBUILD-STALE-IMAGE-3-COMMITS-BEHIND`; cross-referenced there via `po_note`.

**Lock:** outer claim `task:FACTORY-NEWS-go-server-tier-split` (owner_client_session `165f4245-6173-4054-87fd-c55bb626265f`) released by PO at close-out — this dispatch has no automatic release on the success path.
