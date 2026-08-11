# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-09T04:59:30Z

---

### STEP qa-S32 · qa · 2026-08-09T04:59:30Z
**task-id:** GUARD-PRICE-ANOMALY-BYPATH-DISH-CONTRACT
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, row had no `commit`/`files[]` fields — derived commit via `git log` on files named in the closeout prose) of `897d1811a` (AC2-5: dual-plane contract + by-path drain allowlist), on `main` ancestry, `git show --stat` matches all 4 files named in the closeout prose.
**what-considered:**
- Verified diff directly, not trusted from prose: AC2 dual-plane table added in `mcp-tools.md`, AC3 DO-NOT-ENVELOPE/RELOCATE marker at `eod.md:31-45`, AC4 `BY_PATH_CONSUMER_FAMILIES` allowlist checked before `isDrainableShape()` in `drain-signals.js`, AC5 new `drain-signals.test.js` orch-ref scenario — all present exactly as claimed.
- Spot-checked every line citation AT SOURCE (`eod.md:13/29/49`, `chef.md:130/153`) — all exact matches, zero drift since commit; `git diff 897d1811a HEAD` on the 4 files = empty (no subsequent edits).
- Re-ran `drain-signals.test.js` live: 51/51 PASS (matches claim exactly, incl. the new GUARD-PRICE-ANOMALY-BYPATH assertions). `bun tsc --noEmit` (apps/mcp-server): clean (no TS touched by this commit). `mock-guard.sh --files drain-signals.js`: PASS.
**why-decision:** APPROVED, DONE_VERIFIED — all 5 ACs independently RAW-verified against the diff + live line citations + live test re-run, not the row's own closeout prose.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S33 · qa · 2026-08-09T05:00:30Z
**task-id:** FIX-PREDICTION-SIGNALS-EMPTY
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, row had no `.commit`/`.files[]` fields — derived commits from review_note prose) of `e6378d65a` (fix+test) + `a15d75e6f` (journal+notebook), both confirmed `main` ancestors.
**what-considered:**
- `git show --stat` on `e6378d65a`: touches `predictionMarketJob.ts` + new staleness-guard test — matches claim; diff read line-by-line confirms the staleness guard (old Step 5b) now runs BEFORE the `currentMarkets.length===0` early return, not just prose trust.
- Re-ran fresh: new test 3/3 pass; full 19-file prediction-market suite 293/293 pass; `bun tsc --noEmit` 0 errors; `mock-guard.sh --files predictionMarketJob.ts` PASS; DDD grep clean (file's own header self-declares interface/scheduler layer, infra imports architecturally permitted); no `process.env`/secret literals.
- DJ-GATE-1: `sprint-FIX-PREDICTION-SIGNALS-EMPTY-dev-mcp-server.md` has `task-id:` trailer present — journal-before-DONE gate satisfied.
**why-decision:** APPROVED, DONE_VERIFIED — root-cause reorder independently confirmed present at HEAD via diff read + live re-run, not the row's own review_note prose alone.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S34 · qa · 2026-08-09T06:02:47Z
**task-id:** FACTORY-STOCK-resolve-dead-writeback
**what-done:** Direct-commit verify (QA-Drain, `qa[]` row, `branch:null`, no `.commit`/`.files[]`/`.owner`) — derived commit `c0f6bae58` via `git log --all` on detail_ref's `files[]`; date 43s before `reviewed_at` on `main` ancestry.
**what-considered:**
- `git show --stat` matches 2/3 detail_ref files (fetchers.go, ports.go); 3rd (`_deprecated/services_v1.go`) was only the dead caller cited as deadness evidence, later independently deleted by unrelated commit `448b41b0a` (2026-07-30 dead-code sweep) — corroborates zero live importers.
- Diff read line-by-line: SaveQuote removed from port+repo, `ownDBPath`/`CREATE TABLE market_prices_cache`/INSERT dropped, main.go env wiring removed — matches mandated DELETE-path exactly, no new hot-path write.
- Re-ran fresh at HEAD: `go build ./...` clean, `go test -count=1 ./...` 9/9 packages pass, `grep -rn SaveQuote\|market_prices_cache apps/stock-price/` = 0 matches, `mock-guard.sh` PASS.
**why-decision:** APPROVED, DONE_VERIFIED — DoD fully met, live-verified at HEAD not just historical commit. `task_release` attempted (INV-GATEWAY-1) — errored "No such tool available", same gateway-blind pattern as cycle-617; dispatcher (session 165f4245) is authoritative release path.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S34 · qa · 2026-08-09T06:03:00Z
**task-id:** FACTORY-INTERFACE-delete-bak-files
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, row itself carries no `.commit`/`.files[]` — took `commit 2a146ecdd` and file scope from the row's own `review_note` prose, cross-checked against `backlog-detail.json`'s canonical ticket) of `2a146ecdd`, confirmed `main` ancestor.
**what-considered:**
- `git show --stat 2a146ecdd`: matches claim exactly — 4 deletions (`server.ts.bak` 1569L, `telegramReportTools.ts.bak` 330L, `docker-compose.yml.bak` 280L, `docs/TASKS.md.bak` 115L) + 3-line `.gitignore` add, 0 other changes.
- review_note's "2 mcp-server-interface + docker-compose.yml.bak + docs/TASKS.md.bak" scope is WIDER than backlog-detail.json's literal `files[]` (only the 2 interface files) — cross-checked dev's own journal (`sprint-FACTORY-INTERFACE-delete-bak-files-dev-mcp-server.md`), which documents the scope-widen rationale (canonical ticket text found via mandated safety grep, not fabricated); accepted as legitimate, not scope creep.
- Verified independently, not trusted from prose: all 4 paths absent from disk AND absent from `git ls-files`; `.gitignore:73` has `*.bak`; repo-wide grep for the 4 filenames returns only doc/journal prose mentions of this same ticket, zero code references.
- Re-ran `bun tsc --noEmit` (apps/mcp-server) fresh: 0 errors. Ran the 2 tests most directly tied to `server.ts` (087-server-wiring, 081-bun-mcp-server): 20/20 pass. `mock-guard.sh` N/A — no production source added/modified, pure deletion + `.gitignore` line.
**why-decision:** APPROVED, DONE_VERIFIED — commit content independently matches both the review_note claim and the canonical backlog ticket; no dead .bak files remain tracked; build/tests unaffected.
**why-change:** none — verified exactly what the row scoped (the wider 4-file scope was dev's own documented, evidence-based decision, not something QA is expanding or narrowing here).

### STEP qa-S35 · qa · 2026-08-09T06:10:00Z
**task-id:** FACTORY-SHARED-prune-phantom-primitives
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, row itself carries no `.commit`/`.files[]` fields — took commit `df6c1dc7d` from the row's own `review_note` prose) of `df6c1dc7d33bfdc4`, confirmed `main` ancestor. `git show --stat`: `.gitignore` (-1L) + new journal file only — deletion itself leaves no diff since `packages/primitives/` was git-untracked (consistent with claim).
**what-considered:**
- Independently confirmed, not trusted from prose: `packages/primitives/` absent from disk (`ls` ENOENT); `.gitignore` no longer contains the `packages/primitives/` line; repo-wide grep for `packages/primitives` returns ONLY doc/prose hits (architecture briefs discussing the already-pruned path by name, incl. one cross-reference from a later CI-guard task) — zero `.go`/`.ts`/manifest/Dockerfile/compose hits.
- Re-ran fresh myself (not cached claim): `go build ./cmd/...` exit 0, `go vet ./...` exit 0, `go test -count=1 ./...` 12/12 packages ok (all 5 primitive dirs + application/domain/infrastructure/interface-http/module/cmd-sandbox/cmd-server) — exact match to review_note's "12/12" count.
- G12 sandbox dashboard: `bash dashboard/build.sh` → 35/35 scenario passed/0 failed (exact match). Headless render check initially FAILED in my sandbox (`chromium_headless_shell-1234` binary missing — local Playwright cache only had rev 1223); root-caused as a local-environment browser-cache gap unrelated to this diff (packages/primitives has zero relation to Playwright/dashboard tooling), installed the missing binary (`npx playwright install chromium-headless-shell`), re-ran `verify-render.mjs` → PASS, 33 dot-green (L1:25+L2:5+L3:3), 0 dot-red, 0 dot-pending, 0 JS errors — exact match to review_note. Build artifacts (`dashboard/dist/*`) confirmed gitignored, no dirty state left behind.
**why-decision:** APPROVED, DONE_VERIFIED — every claim in review_note independently reproduced from a fresh re-run (directory absence, gitignore cleanliness, zero live importers, go build/vet/test 12/12, sandbox 35/35, headless render 33/0/0), not accepted on prose alone.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S36 · qa · 2026-08-09T08:15:00Z
**task-id:** FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of `cc7e86829` (code+docs+handoff) + `a3b695415` (notebook+journal), both confirmed `main` ancestors, `git show --stat` matches all 3 claimed `files[]` exactly (new `drain-signals-durable.test.js`, `orch-conservation-check.mjs`, `dev-standards.md`).
**what-considered:**
- Re-ran fresh, not trusted from prose: `drain-signals-durable.test.js` 46/46 pass (matches claim). `signalTotal()` diff read line-by-line — genuinely sums `dev_team_idle_chain.pending_triage_inbox.length` alongside `signal_queue.rows.length`, closing brief §3.4's gap. dev-standards.md diff confirms exactly 2 new Script Persistence pointers (Extension paragraph + new CANONICAL block).
- Regression re-run live: `drain-signals.test.js` 51/51, `orch-apply-wrapper-tests.sh` 75/75, `orch-state-hook.test.mjs` 21/21 — all match claim exactly. `bun tsc --noEmit` (apps/mcp-server) 0 errors (no `.ts` touched, consistent with claim). `mock-guard.sh` PASS (no production `.ts`/`.js` src in scope — test/script/doc files only).
- Depends `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` confirmed `done_verified` — not jumping ahead of a blocked dependency. Journal `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-6.md` carries `task-id: FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE` — DJ-GATE-1 satisfied. Spot-checked test file quality: real `assert(label, actual, expected)` JSON-deepequal harness, isolated mkdtemp fixtures, runs REAL bounded1 promote/claim jq scripts in Scenario 2 — not a rigged always-pass stub.
**why-decision:** APPROVED, DONE_VERIFIED — every claim in the row's `status_note` independently reproduced via live re-run + diff inspection, not trusted at face value.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S37 · qa · 2026-08-11T13:53:00Z
**task-id:** FIX-ORPHAN-FR7-VERIFY-TOOL-REGISTRY
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, no `.commit`/`.files[]` on row — took commits `618654d96` (handoff+WORK.md) + `557653c59` (notebook+journal) from the row's own `dev_note`) of both, confirmed `main` ancestors via `git merge-base --is-ancestor`.
**what-considered:**
- Claim is "no-op, verification-only": `tool-registry.json`'s `system` group entries are bare name strings (`"task_heartbeat"`, `"task_release"`) inside `tools[]`, no per-tool object anywhere in the file — independently confirmed via `jq`, not trusted from prose.
- Read `scripts/gen-tool-registry.ts` myself: regex `server\.tool\(\s*\n?\s*["']([^"']+)["']` captures only the string-literal tool name, never the trailing Zod schema object — structurally cannot duplicate param schemas. Re-ran `bun scripts/gen-tool-registry.ts --dry-run` live: `totalCount=183`, `system: 41 tools` — byte-identical to committed file (also `totalCount:183`).
- Re-ran `bun test src/__tests__/tool-registry-parity.test.ts` (apps/mcp-server) fresh: 17/17 pass, 39 expect() — matches claim exactly. `bun tsc --noEmit` (apps/mcp-server) 0 errors. No production source touched (verification-only, confirmed via `git show --stat` on both commits — handoff.md + WORK.md + notebook + journal only) → mock-guard N/A, consistent with row's own claim.
- Confirmed the cited `taskHeartbeatTool.ts`/`taskReleaseTool.ts` split (cross-referenced sibling task) actually exists on disk under `apps/mcp-server/src/interface/mcp/tools/system/coordination/`.
**why-decision:** APPROVED, DONE_VERIFIED — every claim independently re-verified from source (regex read, live dry-run, live test/tsc run), not accepted from prose alone.
**why-change:** none — verified exactly what the row scoped (no-op is the correct, DoD-permitted terminal outcome for this verification-only subtask).

### STEP qa-S38 · qa · 2026-08-11T13:55:14Z
**task-id:** FACTORY-ALERT-delete-deprecated-domain
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, no `.commit`/`.files[]`/`.owner` on row — derived commit `314461cbdd43580d38b0be30951ab2ea1ab364fa` via `git log --all -- <detail_ref files[]>`; commit date 57s before row's `reviewed_at` — high-confidence match) of the alert-engine `_deprecated` domain package deletion.
**what-considered:**
- `git merge-base --is-ancestor` confirmed main ancestry. `git show --stat` matches both detail_ref `files[]` exactly (services_v1.go 150L, services_v1_test.go 148L = 298L), plus a domain-model.md doc update and its own decision-journal file.
- Re-verified against live main HEAD, not commit prose: `apps/alert-engine/pkg/domain/_deprecated/` confirmed absent from working tree; `grep -rn "_deprecated" --include="*.go" apps/alert-engine` = 0 matches repo-wide; `go build ./...` clean; `go vet ./...` clean; `go test ./... -count=1` fresh (uncached) — all 8 testable packages pass. mock-guard N/A (sole prod files touched were pure deletions, nothing left to scan).
- DoD (`dod` field in backlog-detail.json) fully met: directory deleted, grep confirms no live importer, build+tests green, generic/no runtime change. Dev's own decision journal (`sprint-FACTORY-ALERT-delete-deprecated-domain-dev-alert-engine.md`) carries matching `task-id:` trailer — DJ-GATE-1 style corroboration present even though not strictly required on this JUMP-TO.
**why-decision:** APPROVED, DONE_VERIFIED — every claim independently re-verified from source (grep, fresh go build/vet/test), not accepted from prose alone.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S39 · qa · 2026-08-11T13:56:34Z
**task-id:** FACTORY-INTERFACE-vps-auth-guard-dedup
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of commit `cf28a32e8` (extract shared `requireVpsApiKey` guard call-sites, migrate last 5 copy-paste VPS-auth blocks), confirmed `main` ancestor via `git merge-base --is-ancestor`, `git show --stat` matches all 5 `detail_ref.files[]` exactly.
**what-considered:**
- Read every hunk line-by-line, not trusted from prose: server.ts/pushPricesHandler/pushSbvRatesHandler/pushForeignFlowHandler/pushNewsHandler each swap their inline 401 block for `if (!requireVpsApiKey(req,res)) return;`; the shared guard's body is byte-identical to the removed inline blocks (same x-api-key→Bearer precedence, same `!==` compare, same 401 `{error:"Unauthorized"}` body). `foreignFlowStatusHandler.ts`'s `buildForeignFlowStatusResponse` confirmed genuinely different contract (returns `{status,body}`, caller-supplied `requestApiKey`) — deliberate non-migration is legitimate, not scope-dodge.
- Repo-wide grep for the old inline pattern (`authHeader...replace("Bearer`) returns zero hits outside the guard's own definition — dedup is exhaustive, no orphaned copies remain. Client-side `VPS_PUSH_API_KEY` usages in fetchers/scheduler (agmPlanFetcher, bctcHttpFetcher, boardDetailsFetcher, sscInsider, bctcPdfPullJob, newsHeadlinesRefreshJob) are outbound header-senders, a different pattern, correctly out of scope.
- Re-ran fresh, not trusted from prose: new `FACTORY-INTERFACE-vps-auth-guard-dedup.test.ts` 11/11 pass. Broader targeted batch (1406a/1406b/1892a/FIX-SBV-PUSH-TYPE-COERCE/debug-trigger-smoke + the new file) 56/56 pass, 0 fail. `bun tsc --noEmit` (mcp-server) 0 errors. `mock-guard.sh --files <6 touched>` PASS. DDD grep: interface→infrastructure/application imports on touched files are pre-existing (interface layer, architecturally permitted), only new import is same-layer `_shared/requireVpsApiKey.js`. `process.env` hit at server.ts:400 confirmed untouched by this diff's hunks (pre-existing, unrelated). No secret/password/token literals introduced.
- Full-suite 42-fail baseline claim cross-corroborated: sibling journals dated 2026-07-23 (`FIX-PREDICTION-SIGNALS-EMPTY`, `ds-obs-01-fix`, `bct-obs-02-fix`) independently record the same 42-fail count same day, pre-dating this commit — consistent pre-existing baseline, not fabricated.
**why-decision:** APPROVED, DONE_VERIFIED — DoD met (one shared guard, all 5 inline copies replaced, header precedence/401 body byte-identical, auth tests green, no auth-semantics change) via independent re-run, not accepted from the row's `review_note` alone.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S40 · qa · 2026-08-11T13:59:04Z
**task-id:** FACTORY-INTERFACE-move-kinhdich-ta-scoring-down
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of commit `b6b659ea0` (move 9 Kinh Dich score-computation functions from `interface/mcp/tools/kinhdich/kinhDichTools.ts` to new `application/services/kinhDich/kinhDichScoring.ts`), confirmed `main` ancestor via `git merge-base --is-ancestor`.
**what-considered:**
- `git show --stat` matches: new 415L `kinhDichScoring.ts`, `kinhDichTools.ts` (-414L, now imports+calls), `defaultComputeHexagrams.ts` scheduler dynamic-import repointed, `docs/microservice/mcp-server/kinhdich.md` updated, 7 test import-path updates (review_note said "6 test files" — actual diff shows 7, harmless prose undercount, non-blocking). Independently byte-diffed the full 9-function block (old-file-parent vs new-file): identical bar one comment-line edit — confirms the claim myself, not trusted from prose.
- Layer placement (application not domain, per journal S1): cross-checked against existing convention `application/usecases/getForeignRoom.ts` (own header: "orchestrates domain + infrastructure") — matches, not a DDD violation. TA-scoring non-move (journal S2, G5/P2-B2) cross-checked against `docs/architecture-briefs/2026-07-24-factory-guard-ci-dead-code-gate.md`'s independent G5/`_deprecated/` corroboration — legitimate documented exception.
- Re-ran fresh: `bun tsc --noEmit` (mcp-server) 0 errors; targeted kinhdich/hexagram/hao/macro/sector/foreign-flow/diacritics regression (21 files, superset of claimed 19) 480 pass/4 skip/0 fail (484 tests); `mock-guard.sh --files <3 touched prod>` PASS; process.env/secret greps clean.
**why-decision:** APPROVED, DONE_VERIFIED — DoD met (scoring math relocated, tests green, interface imports new home, numeric outputs unchanged) via independent re-run, not accepted from `review_note` alone.
**why-change:** none — verified exactly what the row scoped; layering deviation (application vs domain) and TA non-move are the dev's own documented, evidence-based decisions, not something QA is overriding.
