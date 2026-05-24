# dev-alert-engine — Notebook

Zone: `apps/alert-engine/` | Stack: Go 1.22 (migrated from TS/Bun) | DB: alert_engine.db (write)

> Archive: docs/archive/notebooks/dev-alert-engine-2026-05-21.md (pre-trim history)

## Working Memory

### 2026-05-24 Dashboard category chip relabel — "Plain meaning" convention applied

**Task:** Relabel category chips on alert-engine Scenario Trust Dashboard to fleet-wide Plain Meaning convention.

**Outcome:** COMPLETE. Commit 099f8819.

**Changes:**
- `apps/alert-engine/dashboard/index.html` — added `CATEGORY_LABELS` lookup map + `categoryLabel()` function; all chip render sites use `categoryLabel(sc.category)` instead of raw `sc.category`; legend block updated to new labels; "(test PASSES)" clarifier added to Bad Input → Error legend entry. JSON data SSOT (`"category": "failure"` etc.) untouched.
- `docs/architecture-briefs/2026-05-22-refactor/08-sandbox-dashboards.md` — § 0 added recording the convention for all future dashboards.

**Verification:** Headless playwright render confirmed: 9 chips = "Valid Input" x3 + "Edge Case" x3 + "Bad Input → Error" x3, 0 bare "failure" chip text, legend chips match, counts 9 NOT-RUN / 2 NOT-RUN unchanged, 0 JS errors.

**Zone health:** no drift detected. Dashboard display layer clean, JSON SSOT intact.

---

### 2026-05-24 P2-B — .golangci.yml Fence-A/B/C + CI go-lint job DONE

**Task:** P2-B — create apps/alert-engine/.golangci.yml + wire alert-engine-go-lint CI job

**Outcome:** All 5 ACs PASS. Commit ships .golangci.yml + ci.yml + handoff + notebook + signal.

**Key decisions:**
- Used golangci-lint v2 format (installed: 2.12.2) — not v1 syntax from handoff spec. Matches peer pattern.
- Fence-C brownfield adaptation: added `!**/pkg/infrastructure/**` exclusion because alert-engine's
  `pkg/infrastructure/sqlite.go` registers mattn/go-sqlite3 CGO driver directly (unlike stock-price
  which registers at composition root). Fence-C still bars primitive/module/application/interface from sqlite3.
- CI job wired: `alert-engine-go-lint` job in .github/workflows/ci.yml, matching stock-price-go-lint pattern.

**AC evidence:**
- AC-1: PASS — 69 lines (≤80), three named rules fence-a/fence-b/fence-c in v2 format
- AC-2: PASS — golangci-lint 2.12.2 exits 0, 0 issues; CONFIG-VALIDITY only, NOT fence-enforcement proof
- AC-3: PASS — grep returns 8 matches for alert-engine-go-lint/alert-engine in ci.yml
- AC-4: PASS — only P2-B commit on apps/alert-engine/.golangci.yml (freeze anchor for P2-D)
- AC-5: PASS — sandbox total=11 pass=11 fail=0 status=OK exit 0

**Signal:** docs/signals/dev-ae-P2-B-done-<UTC>.json (to be filled post-commit)
**Next:** PM dispatches P2-C (G4 deliberate-violation proof — Fence-A non-zero exit + revert)

---

### 2026-05-24 P2-A — alert-engine-pre-ci Tag Created (Phase 2 Start)

**Task:** P2-A — pre-revert anchor tag before G4 .golangci.yml work

**Outcome:** All 3 ACs PASS. Tag created, signal emitted, evidence committed.

**AC evidence:**
- AC-1: PASS — tag points to 4d5b2f75 (HEAD, after Phase-1 anchor d6eab5bf); no --force, no push
- AC-2: PASS — `git tag | grep alert-engine-pre-ci` returns `alert-engine-pre-ci`
- AC-3: PASS — anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc still ancestor of HEAD (tail returns df7d3d7a)

**Signal:** docs/signals/dev-ae-P2-A-done-20260524T063946Z.json
**Evidence commit:** 604a71f1
**Next:** PM dispatches P2-B (.golangci.yml Fence-A/B/C)

---

### 2026-05-24 P1-E — Edit-Rerun Handler + G7 ZERO-CREDS All 4 Sub-Gates DONE

**Task:** P1-AE-E — finalize edit-rerun handler in dashboard + full G7 env audit

**Outcome:** All 7 ACs PASS. Phase 1 CLEAR TO CLOSE.

**Key finding:** P1-D already shipped the complete applyRerunOutput + parseRerunOutput + resetAllToNotRun JavaScript with full event wiring. P1-E updated "P1-D stub" labels to "P1-E complete" and baked the G7 ZERO-CREDS audit declaration into the panel subtitle/comments.

**AC evidence:**
- AC-1: 4-step UI fully wired — openRerunPanel/closeRerunPanel/parseRerunOutput/applyRerunOutput/resetAllToNotRun all implemented
- AC-2: env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|API_KEY|SECRET|PASSWORD" → 0 matches (CTX_ADVISOR_*_TOKEN are Claude tooling vars, not production credentials)
- AC-3: grep -rniE "token|chat_id|bot|secret|api_key|password" apps/alert-engine/cmd/sandbox/ → 0 matches (exit 1)
- AC-4: CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all → total=11 pass=11 fail=0 status=OK exit 0
- AC-5: grep -rn "math/rand|time.Now|uuid|rand." pkg/primitive/ pkg/module/ cmd/sandbox/ → 0 matches (exit 1)
- AC-6: grep -rn "pkg/infrastructure|mattn/go-sqlite3|TELEGRAM_BOT_TOKEN|TELEGRAM_INFO" → 1 hit (comment only in ports.go), 0 actual imports
- AC-7: edited cooldown-gate-golden.json cooldownMinutes 30→60, reran sandbox → total=11 pass=11 fail=0 status=OK exit 0, restored to 30

**Files in commit:** apps/alert-engine/dashboard/index.html (label/comment updates only — JS was already complete from P1-D)

**Next:** PM P1-G close-gate verification

---

### 2026-05-20 c220 — FIX-alertsource-legal-risk-enum DONE

**Commit:** `09f80233 fix(alert-engine): add legal_risk to alertSource enum — Sprint c220`

**Root cause:** `WRITE_ALERT_VERDICT_SCHEMA` Zod enum in `alertVerdictTools.ts` (apps/mcp-server) had 6 values, none including `legal_risk`. Sprint 1948e-A+B added the legal-risk signal type from news-scout but the verdict tool's enum was never updated. alert-commander was forced to fall back to `position_danger` for VPB 2026-05-20 (Telegram report 2954).

**Fix shape:**
- `alertVerdictTools.ts`: added `"legal_risk"` as 7th value in enum + updated tool description string
- `c220-legal-risk-alert-source.test.ts`: 5 tests (schema accepts, write+readback round-trip, regression guard for position_danger, unknown-value rejection)

**Zone deviation note:** PO spec referenced `apps/alert-engine/src/**/write_alert_verdict*.ts` — these paths don't exist (service migrated to Go in 1912b). Go alert-engine accepts free-form `signalTypes []string` — no enum validation, no change needed there. The Zod enum fix is in `apps/mcp-server/`.

**Tests:** 5/5 new PASS + 5/5 existing 1863d PASS. Full suite: 9335 pass / 283 fail (283 are pre-existing BCTC/PDF failures, unrelated). `tsc` 0 errors. No DB migration needed (alertVerdictStore uses JSON file store, not SQLite CHECK constraint).

**Signal:** `docs/signals/dev-alert-engine-c220-fix-legal-risk-done.json`

---

### 2026-05-14 c108-tick3-fix — 1912b DDL ordering bug FIXED

**Commit:** `bfa93672 fix(1912b/alert-engine): split InitAlertTables DDL into 3 phases — base / ALTER / outcome index`

**Root cause (1-line):** `CREATE INDEX idx_alerts_outcome_pending ... WHERE outcome IS NULL` ran inside the same DDL blob as `CREATE TABLE`, executing before `ALTER TABLE` added the `outcome` column — SQLite rejected it with "no such column: outcome" on any TS-era DB where the table already existed.

**Fix shape (3-phase):**
- Phase 1: `CREATE TABLE IF NOT EXISTS` (base columns only, no outcome) + `CREATE INDEX idx_alert_engine_stocks` + `CREATE INDEX idx_alert_engine_fingerprint` + `CREATE TABLE IF NOT EXISTS alert_mutes`
- Phase 2: existing `ALTER TABLE ADD COLUMN` loop for `outcome`/`outcome_at`/`outcome_detail` (duplicate-column-name ignore retained)
- Phase 3: `CREATE INDEX IF NOT EXISTS idx_alerts_outcome_pending ON alert_engine_records(outcome) WHERE outcome IS NULL` — isolated exec after Phase 2 guarantees column exists

**Test added:** `TestInitAlertTables_PreMigrationDB` in `sqlite_test.go` — seeds in-memory DB with TS-era schema (no outcome columns), calls `InitAlertTables`, asserts nil error + outcome columns present via PRAGMA + idx_alerts_outcome_pending in sqlite_master.

**Tests:** 38/38 PASS (17 infra + 10 domain + 3 application + 8 interface/http). New test is test #17 in infra package.

**Lesson for future Go SQLite migrations:** NEVER mix `CREATE INDEX` referencing a new column with `CREATE TABLE` in a single DDL blob. SQLite processes the blob sequentially but `CREATE TABLE IF NOT EXISTS` is a no-op on existing DBs — any subsequent DDL in the same blob that references new columns will fail before `ALTER TABLE` can add them. Always: base schema → ALTER TABLE → dependent indexes. Three separate `db.Exec` calls.

**Signal:** `docs/signals/20260514T210000Z-1912b-fix-ready.json`

---

### 2026-05-14 c108-tick2 — 1912b-cutover COMPLETE

**Commits:**
- `35aa6824 feat(1912b/alert-engine): Go cutover — Dockerfile multi-stage + TS files removed`
- `235ce359 chore(1912b/alert-engine): agent-md-factory refresh — TS/Bun → Go 1.22`
- `b992fc42 chore(1912b/alert-engine): doc-sweep TS→Go + tree-map orphan clean`

**Signal:** `docs/signals/20260514T174506Z-1912b-cutover-complete.json`

**Steps completed:**
- (a) docker-compose.yml: no change needed, already uses `dockerfile: Dockerfile` without TS CMD override
- (b) Dockerfile: alpine:3.19→3.20, sqlite-dev in builder, sqlite-libs in runtime, output /out/server, ENTRYPOINT /app/server
- (c) TS files removed: src/ (16 files, previously deleted b884a6a3) + bun.lock/bunfig.toml/package.json/tsconfig.json (4 files staged this sprint)
- (d) agent .md: version→2026-05-14, stack→Go 1.22+net/http+log/slog+mattn/go-sqlite3+chi, test_command→go test, type_check→go vet
- (e) doc-sweep: 7 docs updated (ARCHITECTURE.md + 6 alert-engine docs)
- (f) README-log-schema.md: authored at apps/alert-engine/README-log-schema.md
- (g) tree-map: no orphan alert-engine TS refs found — clean
- (h) graphify: CLI not installed on host, existing graphify-out/graph.json preserved
- (i) signal dropped to pm+ops

**TS files removed count:** 20 (16 src/ + 4 config files)
**Files touched:** 13

**Key discovery:** src/ files were already deleted in commit b884a6a3 (market-watcher notebook commit — contamination from prior session). This sprint cleaned up the remaining TS config files (bun.lock, bunfig.toml, package.json, tsconfig.json) which were still tracked in git.

**HEAD.lock:** Spotlight (com.apple pid 43751) orphan — same recurring issue. Removed safely per head-lock-self-cure.md.

**Next:** smoke gate 6h (ops/qa). On smoke pass → pm dispatches 1912c-cutover.

---

### 2026-05-14 c108 post — 1912b BLK-1 + BLK-2 FIXED, RE-SUBMITTED TO QA

**Commit:** `758ce97c feat(1912b/alert-engine): commit missed domain+app+infra source`
**BLK-1 closed:** 7 missing source files staged+committed (domain/errors, domain/models, domain/ports, domain/services, application/dtos, application/evaluate, infrastructure/config). go build now reproducible from history.
**BLK-2 closed:** `.gitignore` line `apps/*/server` added. Binary excluded. Confirmed via `git check-ignore`.
**Tests:** 37/37 PASS confirmed post-fix (`go test ./pkg/... -count=1` all 4 packages ok).
**TASKS.md:** 1912b owner flipped to qa. Re-gate requested.

### 2026-05-14 c108 — QA HANDOFF: 1912b CHANGES_REQUESTED

**QA verdict:** CHANGES_REQUESTED. Two blocking issues. Do not re-submit until both fixed.

**BLK-1 — MISSING SOURCE FROM COMMIT 92186e39:**
7 files exist in working tree but were never staged/committed. `git log --all -- <path>` returns empty for all. A clean checkout of the commit fails go build. Stage and commit all 7:

- `apps/alert-engine/pkg/domain/errors.go`
- `apps/alert-engine/pkg/domain/models.go`
- `apps/alert-engine/pkg/domain/ports.go`
- `apps/alert-engine/pkg/domain/services.go`
- `apps/alert-engine/pkg/application/dtos.go`
- `apps/alert-engine/pkg/application/evaluate.go`
- `apps/alert-engine/pkg/infrastructure/config.go`

Commit message: `feat(1912b/alert-engine): commit missed domain+app+infra source`

**BLK-2 — BUILD BINARY UNTRACKED + NO GITIGNORE:**
`apps/alert-engine/server` is a Mach-O x86_64 binary. Must add to .gitignore before it gets staged accidentally. Add `apps/alert-engine/server` to root `.gitignore` (or use `apps/*/server` pattern).

**Everything else PASS:** tests 37/37 (actual count — you counted 10 domain-services tests inside sqlite_test.go's outcome group which brought your count to 27; actual runner shows 37), DDD PASS, DB isolation PASS, all cited ACs PASS.

Re-submit to QA after 2 commits.

### 2026-05-14 — Task 1912b complete (Go migration Phase 2)

**Status:** IMPL READY — 27/27 go test PASS, go vet clean, go mod tidy clean
**Handoff:** QA

**Bug fixed:**
- `TestEvaluateUseCase_DoesNotFireWhenMuted` FAIL: off-by-one in manual substring loop
  (`i+5 < len` strict LT missed "muted" at end of string "VCB is muted").
  Fixed by replacing manual loop with `strings.Contains` in evaluate_test.go, services_test.go.

**Files created:**
- `apps/alert-engine/pkg/infrastructure/sqlite.go` — SQLiteAlertRepository + SQLiteMuteRepository + ReadPendingOutcomeAlerts + WriteAlertOutcome + InitAlertTables + OpenAlertDB
- `apps/alert-engine/pkg/infrastructure/telegram.go` — TelegramClient (net/http, silent-skip AC-13)
- `apps/alert-engine/pkg/infrastructure/sqlite_test.go` — 16 integration tests (in-memory SQLite)
- `apps/alert-engine/pkg/interface/http/router.go` — chi router, GET /health + POST /evaluate
- `apps/alert-engine/pkg/interface/http/router_test.go` — 8 httptest tests
- `apps/alert-engine/cmd/server/main.go` — wiring: config→DB→repos→usecase→router→server, SIGINT/SIGTERM graceful shutdown

**Files modified:**
- `apps/alert-engine/pkg/application/evaluate_test.go` — strings import + off-by-one fix
- `apps/alert-engine/pkg/domain/services_test.go` — strings import + off-by-one fix
- `apps/alert-engine/Dockerfile` — replaced TS/Bun image with Go 1.22-alpine CGO multi-stage
- `docs/TASKS.md` — 1912b moved to Review (owner → qa)

**Key decisions:**
- Dockerfile replaces TS Dockerfile in-place (no Dockerfile.go rename) — cutover sprint will swap compose image tag
- `DisallowUnknownFields()` on JSON decoder enforces clean API contract
- chi router retained (go.mod already had it; mirrors api-gateway pattern)
- Outcome columns added inline in InitAlertTables DDL + idempotent ALTER TABLE fallback for existing DBs

**Test counts:** domain 10, application 3, infrastructure 16, interface/http 8 = 27 total

**Blockers:** None
