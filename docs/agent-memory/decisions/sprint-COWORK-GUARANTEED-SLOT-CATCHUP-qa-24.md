# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract — add look-back/catch-up to the guaranteed-slot firing path (cowork-match-slots.js / cowork-guaranteed-slot-firer.sh / live dispatcher startup), dedup via published:<slot_id>:<VN-work-date>, no retro-post across VN-date rollover.
**Agent:** qa
**Started:** 2026-08-14T19:38:00Z (continuation of sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-23.md, CAP-REACHED — byte cap 36195/36000, line count 181/600 still under)

---

### STEP qa-S13 · qa · 2026-08-14T19:38:30Z
**task-id:** FACTORY-APIGW-dedup-default-urls
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha=b184dde9f`, no `.files[]`/`.owner` drain fields — files derived from `backlog-detail.json#FACTORY-APIGW-dedup-default-urls.files[]`, cross-checked against `git show --stat`). Commit `b184dde9fdbdb20c5117cad2235ac36bc781c928` confirmed real, on `main` ancestry; touches `main.go`+new `main_test.go`+`infrastructure.md` doc — backlog's planned `files[]` also names `registry.go`, which the commit's own note says was deliberately left untouched ("already the correct defaults source"); independently read `registry.go` and confirmed its `get(key,fallback)` defaults are byte-identical to the removed 10-entry literal, so the files[] delta is explained, not a scope miss.
**what-considered:**
- Row carried a `qa_precondition` (po 2026-08-06): do NOT verify until api-gateway rebuilt (live image predated commit as of 07-15). Independently confirmed the gate is now satisfied, not trusted from prose: `docker inspect` live `vn-market-intelligence-mcp-api-gateway:latest` label `vn.market.git_sha=832cd5a6e` (built 2026-08-13T12:59Z); `git merge-base --is-ancestor b184dde9f 832cd5a6e` = true — the deployed image's commit is a descendant of this fix, so the shipped binary carries it. Live smoke-test `curl localhost:4000/health` confirms all 9 services resolve `"ok"` — resolved-urls-identical/routing-unchanged ACs hold in the running container, not just in source.
- Re-ran REAL verification inside `golang:1.22-alpine` (Dockerfile-matched builder stage, not host go1.26 — version-drift guard): `go build ./...`/`go vet ./...` clean, `go test ./...` 10/10 packages pass (matches commit-message claim), the 4 new `TestServiceURLOverrides_*` cases re-run individually verbose — all PASS. `gofmt -l` clean on both touched Go files.
- `golangci-lint run ./...` (host v2.12.2) 0 issues (Fence-C depguard intact — main.go's `pkg/infrastructure` import is the documented composition-root exception). `mock-guard.sh --files main.go` PASS. `process.env`/secrets/password/token greps clean (only a benign "tokens" substring in a doc comment).
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, claimed-files delta explained and independently corroborated, rebuild precondition independently confirmed satisfied via image label ancestry + live smoke test, every re-run check green.
**why-change:** none — matches row's own note claim; qa_precondition gate closed by independent verification, not rubber-stamped.

### STEP qa-S14 · qa · 2026-08-14T19:41:00Z
**task-id:** FIX-FOREIGN-FLOW-DEAD-ENDPOINT
**what-done:** Direct-Commit Verify (QA-Drain), `commit_sha=9ec88cd4e`, no `.files[]`/`.owner` drain fields — files derived from `backlog-detail.json#FIX-FOREIGN-FLOW-DEAD-ENDPOINT.files[]`, cross-checked via `git show --stat`. Commit `9ec88cd4ec17f7b11bb9cf6a624c0b2d0553d846` real, on `main`; touches claimed file + new test + doc.
**what-considered:**
- Broader-than-dev targeted suite (12 files importing `foreignFlowFetcher.ts` vs dev's own 9): 89/89 pass. `tsc --noEmit` 0 errors. `mock-guard.sh` PASS. DDD/secrets greps clean.
- Row's own note deviates from `detail_ref`'s literal "remove/stub" — kept `fetchPrimaryVpsEndpoint` gated behind DI-only `overrides.fetchFn` (5 live regression tests for Task 1392 depend on it). Verified production reachability is genuinely zero: `runForeignFlowFetcherJobCron`'s sole call site passes no overrides; `vps-proxy-server.js` grep-confirms no `/foreign-flow` route ever existed.
- REBUILD_REQUIRED flagged on row — not trusted at face value (prior `po-ruling-20260806` precedent: prose flag alone has failed silently before). `docker inspect`: live container created 2026-08-13T21:18:30+02:00, postdates fix commit (08-01); `docker exec grep` on deployed source byte-confirms the `if (overrides?.fetchFn) {` guard is live. `docker logs --since 24h`: zero `[fallback] primary endpoint failed` lines (dead-GET 404 silenced in production). `daily_foreign_flow` (authoritative table, not frozen `daily_ohlcv.foreign_*`) shows 98-99 rows/day through today, latest `updated_at` fresh — push path unaffected.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — code-level + live-deployed-behavior both independently confirmed, not just committed source.
**why-change:** none — matches row's own note claim; REBUILD_REQUIRED gate independently closed rather than deferred/rubber-stamped.
