---
title: "Phase 1 Task Plan (Go) — kinh-dich-service Reboot"
date: "2026-05-24"
author: "architect"
status: "READY-FOR-DISPATCH"
pilot: "kinh-dich-service"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
reboot_charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md"
decision_ref: "docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md"
precedent_plan: "docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md (TA Go template)"
language: "Go"
zone: "apps/kinh-dich-service/"
---

# Phase 1 Task Plan (Go) — `kinh-dich-service` Reboot

**Generated:** 2026-05-24 by architect  
**Replaces:** `phase-1-task-plan-ts.md` (TS plan — archived in tsCompletionArchive, retained for traceability)  
**Reboot authority:** USER DIRECTIVE 2026-05-24 — `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md`  
**Status:** READY-FOR-DISPATCH to dev-kinh-dich and dev-frontend

---

## Summary

This plan re-earns G1–G12 on Go evidence for the kinh-dich-service reboot. The TypeScript pilot reached 12/12 YES (verdict=scale) but the user directed a forced Go reboot for fleet language consistency. The TS evidence is preserved in `tsCompletionArchive` and is NOT the baseline for this plan — every goal is re-earned from scratch on Go evidence.

Phase 1 covers 5 execution buckets (P1-A through P1-E), 14 atomic tasks, one developer agent (dev-kinh-dich) plus dev-frontend for the dashboard. Tasks are sequenced WIP=1 with an explicit dependency chain. Language: **Go** (USER-DIRECTIVE, FINAL, do not re-litigate).

**Brownfield reality:** `apps/kinh-dich-service/` is currently 100% TypeScript (TS pilot code). Zero Go files exist. This plan is the blueprint for the reboot — the TS source is the reference for domain contracts, not for code reuse.

---

## Charter context (canonical — do not modify)

- **Deadline:** 2026-07-05 (kickoff + 6 sprints per reboot charter).
- **Goals:** G1–G12 canonical in `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`. Language-agnostic. G1–G8, G10–G12 reset to TBD; G9 held (must be re-confirmed on Go dashboard).
- **Anti-scope-creep clause:** `apps/kinh-dich-service/` ONLY. No other service touched.
- **Security clause:** zero DB credentials in sandbox process (env audit required for G7).
- **WIP cap:** max 1 task In Progress at any time.
- **G4 fence tool:** `depguard` via `golangci-lint` (Go path — replaces TS `eslint-plugin-boundaries`).

---

## Why the `g` suffix

Tasks that replace TS equivalents are numbered with a `g` suffix (P1-A1g, P1-B1g, etc.) to make the language switch visible in TASKS.md and in git history. Language-agnostic tasks (scenario JSON and dashboard) keep neutral IDs where the underlying work is unchanged.

---

## Authentic domain contracts to preserve (CRITICAL — Key Risk 2)

The TS pilot corrected handoff-spec errors. The Go reboot MUST preserve these authentic contracts. Do not reintroduce the spec errors.

| Primitive | Authentic contract | Handoff spec error (do NOT use) |
|-----------|-------------------|----------------------------------|
| **reading-scorer** | `extractAction(actionText string)` — parameter is action text string | `extractAction(score float64)` — was wrong |
| **hao-encoder** | `THIEU_DUONG_THRESHOLD = 0.10` | `0.25` — was wrong |
| **hao-encoder** | `LAO_DUONG_THRESHOLD = 0.75` | Correct (no error) |
| **hao-encoder** | `LAO_AM_THRESHOLD = -0.75` | Correct (no error) |

Source of truth: `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts` (L31–L34) and `apps/kinh-dich-service/src/primitive/reading-scorer/index.ts` (L88). Cross-check against `docs/scenarios/kinh-dich/` scenario JSON before finalizing Go implementations.

---

## Open-questions resolution

### OQ-1 — Go HTTP router choice
**Resolved:** `github.com/go-chi/chi/v5` at `v5.2.1` (matches TA service convention and alert-engine). Pin this version in go.mod.

### OQ-2 — SQLite driver for MarkovPort infra
**Resolved:** `modernc.org/sqlite` (pure-Go, CGO_ENABLED=0). Do NOT use `mattn/go-sqlite3` (alert-engine uses it with CGO, but kinh-dich reboot mandates CGO_ENABLED=0 per security clause). Pin version: `v1.29.9` (matches TA plan). Developer MAY run `go get modernc.org/sqlite@latest` at P1-A2g authoring time and record actual stable version.

### OQ-3 — Sandbox runner command
**Resolved:** `go run ./cmd/sandbox -tier=<tier> -module=kinh-dich -scenario=<file>`. Exact command locked in P1-E2 AC. Do not change without architect sign-off.

### OQ-4 — pkg/ vs internal/ layout
**Resolved:** `pkg/` (not `internal/`) — mirrors TA service convention and all existing Go services in this fleet. `internal/` would block import from `cmd/server/main.go` across package boundaries in some configurations; `pkg/` is explicit and consistent with the established pattern.

### OQ-5 — Composition root line-count threshold
**Resolved:** ≤80 lines (identical to TA plan; architect spec §3 target is 74 lines with 6-line formatting variance).

### OQ-6 — nuclear-hexagram-computer cross-primitive import (Fence-A exception)
**Resolved:** Go equivalent of the TS `import { resolveHexagram } from '../hexagram-resolver/index.js'` is a direct package import between sister primitives (`pkg/primitive/hexagram_resolver` imported by `pkg/primitive/nuclear_hexagram`). This is a **Fence-A exempt** cross-primitive import — not application/module/infra/interface — identical to the TS precedent. The depguard Fence-A rule must explicitly whitelist `pkg/primitive/*` → `pkg/primitive/*` imports. Developer must document this exception in the P1-B5g commit message.

### OQ-7 — dev-kinh-dich flow Go-awareness
**Resolved:** system-map.json already reflects `language: go` for kinh-dich-service (agent-father flip per commit `ad84b629`). Confirm the flow file `.claude/flows/dev-kinh-dich/main.md` references `go test ./...`, `go vet ./...`, `golangci-lint run` — not `bun test`. If not yet updated, PM flags to agent-father before dispatching P1-A1g.

### OQ-8 — Scenario JSON preservation
**Resolved:** 17 existing scenario JSON files in `docs/scenarios/kinh-dich/` (15 primitives + 2 module) are **language-agnostic** and MUST be preserved verbatim. Go primitives must pass these exact scenarios — the golden/edge/failure inputs and expected outputs are the correctness safety net for the reboot. Developer reads each file and verifies Go output matches expected before marking any B-bucket task done.

### OQ-9 — OpenAPI YAML location (Go convention)
**Resolved:** Move from `src/interface/openapi.yaml` (TS convention) to `api/openapi.yaml` (Go convention, mirrors TA service). Content preserved verbatim — same 7 endpoints, same schemas, same port 5005. This is a file copy + path update only.

### OQ-10 — Port
**Resolved:** Port 5005 internal == external per system-map.json. Never hardcode — read from `os.Getenv("PORT")` with default `"5005"`.

---

## Task Ledger

| ID | Title | Owner | Goals | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-------|--------|------------|-----|----------|
| **P1-A1g** | go.mod + go.sum (module path, Go 1.22, chi + modernc-sqlite deps) | dev-kinh-dich | G3 | P1-A2g | — | 15m | 4 |
| **P1-A2g** | Scaffold `pkg/` DDD layout (5 stub packages — domain, application, infrastructure, interface/http, primitive) | dev-kinh-dich | G3 | P1-A3g | P1-A1g | 30m | 9 |
| **P1-A3g** | Create `cmd/server/main.go` (composition root, ≤80 lines, DI wiring, chi router, port 5005) | dev-kinh-dich | G3 | P1-A4g | P1-A2g | 20m | 6 |
| **P1-A4g** | Rewrite `Dockerfile` (golang:1.22-alpine builder + alpine:3.20 runtime, CGO_ENABLED=0) | dev-kinh-dich | G3 | P1-A5g | P1-A3g | 10m | 4 |
| **P1-A5g** | Copy + relocate `api/openapi.yaml` (7 endpoints, same HTTP contract, port 5005) | dev-kinh-dich | G3 | P1-B1g | P1-A4g | 10m | 4 |
| **P1-B1g** | Go primitive: `pkg/primitive/hao_encoder/` + table-driven test + existing 3 scenario JSONs verified | dev-kinh-dich | G1, G7, G12 | P1-B2g | P1-A5g | 1.5h | 7 |
| **P1-B2g** | Go primitive: `pkg/primitive/hexagram_resolver/` + table-driven test + existing 3 scenario JSONs verified | dev-kinh-dich | G1, G7, G12 | P1-B3g | P1-B1g | 1.5h | 6 |
| **P1-B3g** | Go primitive: `pkg/primitive/ngu_hanh_classifier/` + table-driven test + existing 3 scenario JSONs verified | dev-kinh-dich | G1, G7, G12 | P1-B4g | P1-B2g | 1.5h | 6 |
| **P1-B4g** | Go primitive: `pkg/primitive/reading_scorer/` + table-driven test + existing 3 scenario JSONs verified | dev-kinh-dich | G1, G7, G12 | P1-B5g | P1-B3g | 1.5h | 7 |
| **P1-B5g** | Go primitive: `pkg/primitive/nuclear_hexagram/` + table-driven test + existing 3 scenario JSONs verified | dev-kinh-dich | G1, G7, G12 | P1-C1g | P1-B4g | 1.5h | 7 |
| **P1-C1g** | `pkg/module/reading_composer/` — Go module composing all 5 primitives via MarkovPort Go interface; infra injected at composition root only | dev-kinh-dich | G2, G12 | P1-D1 | P1-B5g | 1h | 8 |
| **P1-D1** | Scenario suite update: verify all 17 existing JSONs pass Go sandbox; add missing scenarios to reach ≥3 per primitive (≥15 primitive files) | dev-kinh-dich | G1, G7, G12 | P1-E1 | P1-C1g | 1h | 6 |
| **P1-E1** | Dashboard rebuilt from Go sandbox traces (3 panels: primitives + module + microservice), honest NOT-RUN cold open | dev-frontend | G6, G8, G9, G12 | P1-E2 | P1-C1g, P1-D1 | 3h | 8 |
| **P1-E2** | Dashboard edit-rerun (Go sandbox runner: `go run ./cmd/sandbox`, env audit, honest red/green, zero credentials) | dev-frontend | G7, G8, G12 | — | P1-E1 | 1.5h | 6 |

**Total atomic tasks:** 14 (5 A-bucket + 5 B-bucket + 1 C-bucket + 1 D-bucket + 2 E-bucket)  
**Total estimated effort:** ~15h across 2 agents  
**WIP constraint:** max 1 task In Progress simultaneously

---

## Sequencing

```
P1-A1g → P1-A2g → P1-A3g → P1-A4g → P1-A5g   (sequential — A-bucket atomic close)
  ↓
P1-B1g → P1-B2g → P1-B3g → P1-B4g → P1-B5g   (sequential — B-bucket: each primitive depends on prior for scaffold stability)
  ↓
P1-C1g                                          (module composition — depends on all 5 primitives)
  ↓
P1-D1                                           (scenario verification — depends on C1g sandbox available)
  ↓
P1-E1                                           (dashboard — depends on C1g + D1)
  ↓
P1-E2                                           (dashboard edit-rerun — depends on E1)
```

**Critical path:** P1-A1g → A5g → B1g → B5g → C1g → E1 → E2 (~10 hours)  
**No parallelization:** WIP=1 is the hard constraint. PM may enable B-bucket parallelization (B3g..B5g concurrent after B2g pattern stabilizes) only if SSOT is updated and isolation verified.

---

## Go smoke-check standard (all Go tasks)

Every P1-A*g, P1-B*g, and P1-C*g task must pass before commit:

```sh
cd apps/kinh-dich-service
go test ./...        # all unit + integration tests green
go vet ./...         # zero warnings
go build ./cmd/...   # binary compiles (catches import-only errors)
```

For tasks touching scenario JSON:
```sh
find docs/scenarios/kinh-dich -name '*.json' -exec jq . {} \; > /dev/null
go run ./cmd/sandbox -tier=<tier> -module=kinh-dich -scenario=all
# Expected: all green
```

---

## Per-Task Spec

### P1-A1g — Create `apps/kinh-dich-service/go.mod` + `go.sum`

**Owner:** dev-kinh-dich  
**Goals:** G3  
**Files touched:**
- `apps/kinh-dich-service/go.mod` (NEW)
- `apps/kinh-dich-service/go.sum` (GENERATED via `go mod tidy`)

**AC:**
1. `go.mod` created with:
   - `module github.com/vn-market-intelligence/kinh-dich-service`
   - `go 1.22`
   - `toolchain go1.22.0`
   - `require github.com/go-chi/chi/v5 v5.2.1`
   - `require modernc.org/sqlite v1.29.9` (pure-Go, no CGO — OQ-2 resolved)
2. `go mod verify` passes (no checksum mismatches)
3. `go.sum` generated by `go mod tidy` (non-empty)
4. No additional dependencies beyond chi and modernc-sqlite; any transitive deps accepted via `go mod tidy`
5. Commit message references G3 + OQ-1 (chi) + OQ-2 (modernc-sqlite) + CGO policy

**DoD:** Run `cd apps/kinh-dich-service && go mod verify`. Confirm go.sum non-empty.

---

### P1-A2g — Scaffold `pkg/` DDD layout (5 stub packages, all compilable)

**Owner:** dev-kinh-dich  
**Goals:** G3  
**Files touched:**
- `apps/kinh-dich-service/pkg/domain/models.go` (NEW)
- `apps/kinh-dich-service/pkg/domain/ports.go` (NEW)
- `apps/kinh-dich-service/pkg/domain/services.go` (NEW, stub constructor)
- `apps/kinh-dich-service/pkg/application/dtos.go` (NEW)
- `apps/kinh-dich-service/pkg/application/usecases.go` (NEW, stub)
- `apps/kinh-dich-service/pkg/infrastructure/repositories.go` (NEW, stub — reads DB_PATH from os.Getenv())
- `apps/kinh-dich-service/pkg/infrastructure/markov.go` (NEW, stub MarkovPort infra impl)
- `apps/kinh-dich-service/pkg/interface/http/router.go` (NEW, chi router stub, GET /health + placeholder routes)
- `apps/kinh-dich-service/pkg/primitive/` (directory created — populated in B-bucket)

**AC:**
1. All 8 stub files created as minimal compilable Go packages
2. `pkg/domain/models.go`: struct `HaoReading` (state, binary, isChanging, label), struct `KinhDichReading` (hexagram, name, trend, signal, confidence, etc.)
3. `pkg/domain/ports.go`: interface `MarkovPort` with `GetMarkovData(hexagramNumber int) (*MarkovData, error)` (Go idiom equivalent of TS `getMarkovData(hexagramNumber: number): MarkovData | null`)
4. `pkg/domain/services.go`: stub `ReadingService` struct + constructor `NewReadingService(markov MarkovPort) *ReadingService`
5. `pkg/application/dtos.go`: struct `ReadingRequest` (Code string, Days int), struct `ReadingResponse` (wraps KinhDichReading)
6. `pkg/application/usecases.go`: `ReadingUseCase` struct + `NewReadingUseCase(svc *domain.ReadingService) *ReadingUseCase` + `Execute(req ReadingRequest) (*ReadingResponse, error)` stub
7. `pkg/infrastructure/repositories.go`: `SQLiteReadingRepository` struct + `NewSQLiteReadingRepository()` (reads `DB_PATH` from `os.Getenv("DB_PATH")` — no-arg constructor, OQ-2)
8. `pkg/infrastructure/markov.go`: `SQLiteMarkovAdapter` struct + `NewSQLiteMarkovAdapter()` — implements `MarkovPort` interface (stub: always returns nil)
9. `pkg/interface/http/router.go`: `NewRouter(uc *application.ReadingUseCase) http.Handler` returning chi router with `GET /health` (returns 200 JSON) + placeholder routes returning 501 for other endpoints
10. `go build ./...` passes (zero compile errors)
11. `go vet ./...` passes

**DoD:** `go build ./...` + `go vet ./...` both exit 0. All 9 file paths exist.

---

### P1-A3g — Create `apps/kinh-dich-service/cmd/server/main.go`

**Owner:** dev-kinh-dich  
**Goals:** G3  
**Files touched:**
- `apps/kinh-dich-service/cmd/server/main.go` (NEW)

**AC:**
1. File ≤80 lines (target ~74 lines, ±6 for formatting variance — OQ-5)
2. Imports ONLY from: `pkg/domain/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/http`, `net/http`, `os`, `log`
3. Zero business logic in file: no hexagram lookups, no reading computations, no domain conditions on data values
4. DI wiring sequence (composition root only):
   - `NewSQLiteReadingRepository()` → repository
   - `NewSQLiteMarkovAdapter()` → markovAdapter
   - `NewReadingService(markovAdapter)` → service
   - `NewReadingUseCase(service)` → useCase
   - `NewRouter(useCase)` → handler
5. Server startup reads port from `os.Getenv("PORT")` with default `"5005"` — never hardcoded (OQ-10)
6. G3 grep gate: `grep -cE "resolveHexagram|encodeHaos|classifyNguHanh|computeReading|if.*hexagram|for.*score" apps/kinh-dich-service/cmd/server/main.go` returns 0
7. Commit message references G3 + OQ-5 (line count) + OQ-10 (port from env)

**DoD:** `go build ./cmd/...` exits 0. Line count ≤80. Grep gate returns 0.

---

### P1-A4g — Rewrite `apps/kinh-dich-service/Dockerfile`

**Owner:** dev-kinh-dich  
**Goals:** G3  
**Files touched:**
- `apps/kinh-dich-service/Dockerfile` (MODIFY — replace TS/Bun content)

**AC:**
1. Multi-stage build: Stage 1 = `golang:1.22-alpine` builder, Stage 2 = `alpine:3.20` runtime
2. Stage 1: `ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64` before `go build`
3. Stage 1: builds `./cmd/server` binary to `/app/server`
4. Stage 2: copies `/app/server` binary + `api/` directory from Stage 1
5. `EXPOSE 5005` (unchanged from TS service — no docker-compose.yml change needed)
6. Commit message references G3 + CGO_ENABLED=0 rationale

**DoD:** Dockerfile syntax valid (no parser errors on `docker build --no-cache --dry-run` if available; else visual inspection). Confirm `CGO_ENABLED=0` present in builder stage.

---

### P1-A5g — Relocate `api/openapi.yaml` (7-endpoint HTTP contract preserved verbatim)

**Owner:** dev-kinh-dich  
**Goals:** G3  
**Files touched:**
- `apps/kinh-dich-service/api/openapi.yaml` (NEW — copy from src/interface/openapi.yaml)

**AC:**
1. File created at `api/openapi.yaml` (Go convention — OQ-9)
2. Content is verbatim copy of `src/interface/openapi.yaml` (7 endpoints: GET /health, GET /reading/{code}, GET /market, GET /readings/{code}/history, GET /hexagram/{number}/transitions, GET /backtest/{code}, GET /hexagram/{number}/explain)
3. YAML parses without error: `python3 -c "import yaml; yaml.safe_load(open('api/openapi.yaml'))"` exits 0
4. Port in `servers[0].url` still reads `http://localhost:5005` (no change)
5. Commit message references G3 + OQ-9 (path relocation) + "HTTP contract preserved verbatim"

**A-bucket closure smoke gate (run after P1-A5g before starting P1-B1g):**
```sh
cd apps/kinh-dich-service
go build ./...
go vet ./...
test -f cmd/server/main.go && echo "main.go: PASS"
test -f api/openapi.yaml && echo "openapi.yaml: PASS"
grep -cE "resolveHexagram|encodeHaos|classifyNguHanh|computeReading" cmd/server/main.go
# Expected: 0
```

---

### P1-B1g — Go primitive: `pkg/primitive/hao_encoder/`

**Owner:** dev-kinh-dich  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go` (NEW)
- `apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder_test.go` (NEW, table-driven)

**AC:**
1. Package exports:
   - Type `HaoState string` with constants `LAO_DUONG`, `THIEU_DUONG`, `THIEU_AM`, `LAO_AM`
   - Struct `HaoReading { State HaoState; Binary int; IsChanging bool; Label string }`
   - Function `ClassifyHao(score float64) HaoReading`
   - Function `EncodeHaos(scores []float64) ([]HaoReading, error)` — returns error if `len(scores) != 6`
2. **Threshold constants (CRITICAL — Key Risk 2):**
   - `LAO_DUONG_THRESHOLD = 0.75` (score > 0.75 → LAO_DUONG)
   - `THIEU_DUONG_THRESHOLD = 0.10` (0.10 ≤ score ≤ 0.75 → THIEU_DUONG) — NOT 0.25
   - `LAO_AM_THRESHOLD = -0.75` (score < -0.75 → LAO_AM)
3. Positional labels (1–6) embedded as Go map literal (Vietnamese strings verbatim from TS source)
4. Zero imports outside Go stdlib and `pkg/primitive/` siblings
5. Table-driven test: golden path (6 mixed scores across all 4 states), edge (score exactly at boundary 0.10 and 0.75), failure (len != 6 returns error)
6. **Existing scenario JSON verification:** all 3 files in `docs/scenarios/kinh-dich/primitives/hao-encoder-*.json` must pass Go sandbox (Go outputs match `expected` fields)
7. `go test ./...` + `go vet ./...` both exit 0
8. Commit message references G1, G7, G12 + THIEU_DUONG_THRESHOLD=0.10 confirmation (guards against regression to wrong 0.25 value)

**DoD:** Unit tests pass. Scenario JSON files pass Go sandbox. THIEU_DUONG_THRESHOLD confirmed 0.10 in source comment.

---

### P1-B2g — Go primitive: `pkg/primitive/hexagram_resolver/`

**Owner:** dev-kinh-dich  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/kinh-dich-service/pkg/primitive/hexagram_resolver/hexagram_resolver.go` (NEW)
- `apps/kinh-dich-service/pkg/primitive/hexagram_resolver/hexagram_resolver_test.go` (NEW, table-driven)

**AC:**
1. Package exports:
   - Function `ResolveHexagram(signals []int) (int, error)` — maps 6 binary signals (0|1, bottom-to-top) to hexagram number 1–64
   - Embedded lookup tables: `TRIGRAM_LINES` (trigram name → [3]int binary pattern), `TRIGRAMS_TO_QUE` (upper|lower string key → hexagram id)
   - All 64 hexagram entries from TS source `QUE_META` (copy verbatim — this is lookup table data, not logic)
2. Returns error if `len(signals) != 6` or resulting trigram pair not found in lookup
3. Zero imports outside Go stdlib
4. Table-driven test: golden (known 6-signal → hexagram 1), edge (all-yin signals → hexagram 2), failure (len != 6)
5. **Existing scenario JSON verification:** all 3 files in `docs/scenarios/kinh-dich/primitives/hexagram-resolver-*.json` must pass Go sandbox
6. `go test ./...` + `go vet ./...` exit 0
7. Commit message references G1, G7, G12

**DoD:** Unit tests pass. Scenario files pass Go sandbox. Hexagram table has exactly 64 entries (verify with `len(TRIGRAMS_TO_QUE) == 64` assertion in test).

---

### P1-B3g — Go primitive: `pkg/primitive/ngu_hanh_classifier/`

**Owner:** dev-kinh-dich  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/kinh-dich-service/pkg/primitive/ngu_hanh_classifier/ngu_hanh_classifier.go` (NEW)
- `apps/kinh-dich-service/pkg/primitive/ngu_hanh_classifier/ngu_hanh_classifier_test.go` (NEW, table-driven)

**AC:**
1. Package exports:
   - Type `NguHanh string` with constants `Kim`, `Moc`, `Thuy`, `Hoa`, `Tho`
   - Type `NguHanhDynamic string` with constants `TUONG_SINH`, `TUONG_KHAC`, `SAME`, `NEUTRAL`
   - Struct `NguHanhResult { Lower, Upper NguHanh; Dynamic NguHanhDynamic; Score float64; Interpretation string }`
   - Function `ClassifyNguHanh(lower, upper string) NguHanhResult`
2. Generation cycle embedded: Moc→Hoa, Hoa→Tho, Tho→Kim, Kim→Thuy, Thuy→Moc
3. Destruction cycle embedded: Moc→Tho, Tho→Thuy, Thuy→Hoa, Hoa→Kim, Kim→Moc
4. Unknown/invalid element strings → NEUTRAL (score 0.0) — same as TS implementation
5. Zero imports outside Go stdlib
6. Table-driven test: TUONG_SINH case (Moc generates Hoa), TUONG_KHAC case (Moc destroys Tho), SAME case, NEUTRAL (unknown string)
7. **Existing scenario JSON verification:** all 3 files in `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-*.json` must pass Go sandbox
8. `go test ./...` + `go vet ./...` exit 0

**DoD:** Unit tests pass. Scenario files pass Go sandbox.

---

### P1-B4g — Go primitive: `pkg/primitive/reading_scorer/`

**Owner:** dev-kinh-dich  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/kinh-dich-service/pkg/primitive/reading_scorer/reading_scorer.go` (NEW)
- `apps/kinh-dich-service/pkg/primitive/reading_scorer/reading_scorer_test.go` (NEW, table-driven)

**AC:**
1. Package exports:
   - Function `ExtractOutcomeScore(outcomeText string) float64` — scans uppercase text for Vietnamese outcome keywords; returns 0.0 for unknown
   - Function `ExtractTrendScore(trendText string) float64` — scans uppercase text for trend keywords; returns 0.0 for unknown
   - **`ExtractAction(actionText string) string`** — parameter is action text (string), NOT a float score. This is the **authentic domain contract** (OQ and Key Risk 2). Returns one of: `MUA`, `BAN`, `GIU`, `CHO`, `THAN TRONG`; defaults to `GIU`
   - Function `MajorityVote(actions []string) string` — returns most frequent action; returns `GIU` on empty slice
2. All OUTCOME_SCORES, TREND_SCORE_MAP entries from TS source embedded verbatim (Vietnamese + ASCII fallback keys)
3. Zero imports outside Go stdlib
4. Table-driven test: ExtractAction with action text containing `TIEN` → `MUA`; containing `LUI` → `BAN`; empty → `GIU`; ExtractOutcomeScore with `CAT` → 0.3
5. **JSDoc comment on `ExtractAction`** must state: "parameter is actionText string — the handoff spec error `extractAction(score float64)` is REJECTED; authentic contract is string-based, sourced from TS domain implementation at L88"
6. **Existing scenario JSON verification:** all 3 files in `docs/scenarios/kinh-dich/primitives/reading-scorer-*.json` must pass Go sandbox
7. `go test ./...` + `go vet ./...` exit 0
8. Commit message references G1, G7, G12 + extractAction(actionText string) note

**DoD:** Unit tests pass. Scenario files pass Go sandbox. `ExtractAction` signature is string-based (grep check: `grep "ExtractAction" pkg/primitive/reading_scorer/reading_scorer.go` shows `string` not `float64`).

---

### P1-B5g — Go primitive: `pkg/primitive/nuclear_hexagram/`

**Owner:** dev-kinh-dich  
**Goals:** G1, G7, G12  
**Files touched:**
- `apps/kinh-dich-service/pkg/primitive/nuclear_hexagram/nuclear_hexagram.go` (NEW)
- `apps/kinh-dich-service/pkg/primitive/nuclear_hexagram/nuclear_hexagram_test.go` (NEW, table-driven)

**AC:**
1. Package exports:
   - Function `ComputeHoQue(signals []int) (int, error)` — nuclear hexagram: inner 4 lines (indices 1–4) → new 6-line figure `[signals[1], signals[2], signals[3], signals[2], signals[3], signals[4]]` → passed to hexagram_resolver.ResolveHexagram
   - Function `ComputeBienQue(haos []HaoReading) (int, error)` — transformed hexagram: flips LAO_DUONG→0, LAO_AM→1, stable lines keep binary; passes flipped signals to hexagram_resolver.ResolveHexagram
   - Type alias or import for `HaoReading` from `pkg/primitive/hao_encoder` (sister primitive import — **Fence-A exempt per OQ-6**)
2. Imports `pkg/primitive/hexagram_resolver` and `pkg/primitive/hao_encoder` — both are sister primitives, NOT application/module/infra/interface layers
3. Fence-A exception explicitly documented in source comment: "Sister primitive imports (hexagram_resolver, hao_encoder) are exempt from Fence-A — they are pure-function siblings in the same primitive layer, not higher-layer imports. depguard allowlist must include `pkg/primitive/*` → `pkg/primitive/*`."
4. Zero imports from module/application/infrastructure/interface layers
5. Table-driven test: ComputeHoQue on known 6-signal → expected nuclear hexagram number; ComputeBienQue on 6 haos with known changing lines → expected biến quẻ number
6. **Existing scenario JSON verification:** all 3 files in `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-*.json` must pass Go sandbox
7. `go test ./...` + `go vet ./...` exit 0
8. Commit message references G1, G7, G12 + Fence-A sister-primitive exception documentation

**DoD:** Unit tests pass. Scenario files pass Go sandbox. Fence-A exception documented in source.

---

### P1-C1g — Module: `pkg/module/reading_composer/`

**Owner:** dev-kinh-dich  
**Goals:** G2, G12  
**Files touched:**
- `apps/kinh-dich-service/pkg/module/reading_composer/reading_composer.go` (NEW)
- `apps/kinh-dich-service/pkg/module/reading_composer/ports.go` (NEW — MarkovPort Go interface)
- `apps/kinh-dich-service/pkg/module/reading_composer/reading_composer_test.go` (NEW, multi-primitive test)

**AC:**
1. `ports.go` defines Go interface equivalent of TS `MarkovPort`:
   ```go
   type MarkovData struct {
     TransitionProb      float64
     HistoricalConfidence float64
   }
   type MarkovPort interface {
     GetMarkovData(hexagramNumber int) (*MarkovData, error)
   }
   ```
   This interface is the inversion-of-control boundary — module depends on the interface, not on `pkg/infrastructure/`
2. `reading_composer.go` exports function `ComposeReading(scores []float64, markov MarkovPort) (*domain.KinhDichReading, error)` or equivalent composition function
3. Module imports all 5 primitives from `pkg/primitive/<name>` (pure function composition)
4. Module imports `MarkovPort` from its own `ports.go` (interface defined in this package)
5. **Fence-B gate:** `grep -r "infrastructure" pkg/module/reading_composer/` returns 0. Zero infrastructure imports in module package.
6. **Fence-C contract:** The infrastructure `SQLiteMarkovAdapter` (from `pkg/infrastructure/markov.go`) is injected ONLY at `cmd/server/main.go`. The module never references it directly.
7. Multi-primitive test: calls ComposeReading with 6 known scores + a stub MarkovPort implementation → output shape matches domain.KinhDichReading (hexagram number in range 1–64, signal is one of MUA/BAN/GIU/CHO/THAN TRONG, confidence in [0,1])
8. **Existing module scenario JSON verification:** both files in `docs/scenarios/kinh-dich/module/` must pass Go sandbox
9. `go test ./...` + `go vet ./...` exit 0
10. Commit message references G2, G12 + MarkovPort boundary note + Fence-B/C gates

**DoD:** Unit tests pass. Module scenario files pass Go sandbox. Fence-B grep returns 0.

---

### P1-D1 — Scenario suite verification and completion

**Owner:** dev-kinh-dich  
**Goals:** G1, G7, G12  
**Files touched:**
- Existing 17 JSON files in `docs/scenarios/kinh-dich/` — verified (not created, not modified unless schema update needed)
- Additional scenario files created only if existing coverage is below ≥3 per primitive

**Context:** The TS pilot created 15 primitive scenario files (3 per primitive × 5 primitives) + 2 module scenario files = 17 files total. These are language-agnostic (JSON in → expected JSON out). The Go reboot must pass all 17 before this task closes.

**AC:**
1. Run `go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=all` → all primitive scenario files pass (exit 0, all green)
2. Run `go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=all` → both module scenario files pass (exit 0, all green)
3. Scenario file count: `find docs/scenarios/kinh-dich/primitives -name '*.json' | wc -l` ≥ 15 (3 per primitive × 5 primitives)
4. Scenario file count: `find docs/scenarios/kinh-dich/module -name '*.json' | wc -l` ≥ 2
5. All JSON files parse without error: `find docs/scenarios/kinh-dich -name '*.json' -exec jq . {} \; > /dev/null`
6. If any existing scenario file's `expected` field was authored against the TS wrong thresholds (e.g., THIEU_DUONG boundary at 0.25 instead of 0.10), update the expected field to match the authentic Go primitive output AND document the correction in commit message
7. Commit message references G1, G7, G12 + sandbox runner command + total scenario count

**DoD:** All scenario files pass Go sandbox. Count verified. JSON files all parse.

---

### P1-E1 — Dashboard rebuilt from Go sandbox traces

**Owner:** dev-frontend  
**Goals:** G6, G8, G9, G12  
**Files touched:**
- `apps/kinh-dich-service/dashboard/index.html` (MODIFY/REBUILD — replace TS pilot labels with Go)
- `apps/kinh-dich-service/dashboard/style.css` (MODIFY if needed)
- `apps/kinh-dich-service/dashboard/app.js` (MODIFY if needed)

**Context:** The TS dashboard exists (commit 34205c87, 6/6 card groups PASS). Rebuild it from Go sandbox traces — update all label references from TypeScript to Go (e.g., panel header "5 pure TypeScript functions" → "5 pure Go functions"), ensure cold-open shows honest NOT-RUN (all pending, zero false greens), and embed Go scenario trace results.

**AC:**
1. Dashboard opens without server (file:// URL in browser works)
2. Three panels visible on page load:
   - Primitives panel: 5 cards (hao_encoder, hexagram_resolver, ngu_hanh_classifier, reading_scorer, nuclear_hexagram)
   - Module panel: 1 card (reading_composer)
   - Microservice panel: placeholder documenting Go service shape (DDD layers, 7 OpenAPI endpoints, port 5005)
3. Cold-open (file:// without running sandbox): all cards show NOT-RUN / pending status — zero false greens
4. Scenario data embedded as inline JSON (works in file:// without fetch())
5. Panel header updated to "5 pure Go functions" (not TypeScript)
6. Each card shows: primitive/scenario name, status badge (GREEN/RED/NOT-RUN), input summary, output summary
7. Click any card → detail view with full input/output JSON + "Edit & Rerun" button (wired in P1-E2)
8. Zero JavaScript console errors (verify with browser DevTools or automated headless check)
9. Commit message references G6, G8, G9, G12

**AC verification:**
- Open `apps/kinh-dich-service/dashboard/index.html` in browser (file:// URL)
- All 3 panels visible, 6 cards minimum
- Console: zero errors
- Cold-open: all cards in NOT-RUN state

**DoD:** Manual browser verification. All scenario files (P1-D1) must exist and be valid JSON for cards to render. Dashboard green check per G12.

---

### P1-E2 — Dashboard edit-rerun + honest red/green

**Owner:** dev-frontend  
**Goals:** G7, G8, G12  
**Files touched:**
- `apps/kinh-dich-service/cmd/sandbox/main.go` (NEW — Go sandbox runner)
- `apps/kinh-dich-service/cmd/sandbox/sandbox_test.go` (NEW — unit tests for diff logic)
- `apps/kinh-dich-service/dashboard/app.js` (MODIFY — rerun handler wired)
- `apps/kinh-dich-service/dashboard/rerun-handler.js` (NEW — sandbox integration)

**AC:**
1. "Edit & Rerun" button opens editor (textarea pre-filled with scenario JSON)
2. User edits JSON, clicks "Save & Rerun" — browser displays exact command `go run ./cmd/sandbox -tier=<tier> -module=kinh-dich -scenario=<file>` (paste-back bridge pattern per TA precedent — static paste-back UX, not local proxy)
3. Go sandbox runner (`cmd/sandbox/main.go`) compiles and runs: `go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=<file>` exits 0 on GREEN, non-zero on RED with diff output
4. Env audit gate: running sandbox does NOT expose `DB_|API_KEY|SECRET|TOKEN|PASSWORD` credentials in its environment (zero DB connections in primitive/module sandbox path — kinh-dich primitives are pure compute)
5. Honest RED test: corrupt one golden scenario (e.g., flip expected hexagram number in hexagram-resolver-golden.json) → sandbox returns non-zero exit with diff → card shows RED; revert → GREEN. Both proven before marking DONE.
6. `go test ./...` passes (includes sandbox unit tests for diff logic)
7. Commit message references G7, G8, G12 + env audit result (forbidden_matches: empty) + deliberate-break-and-revert proof

**DoD:** Edit-JSON-rerun flow tested manually. Env audit: zero credentials. Honest RED proven. Honest GREEN proven. Dashboard green check per G12.

---

## Dependency Graph

```
P1-A1g (go.mod created)
  ↓
P1-A2g (pkg/ DDD scaffold)
  ↓
P1-A3g (cmd/server/main.go)
  ↓
P1-A4g (Dockerfile rewritten)
  ↓
P1-A5g (api/openapi.yaml relocated — A-BUCKET CLOSES)
  ↓
P1-B1g (hao_encoder Go primitive)
  ↓
P1-B2g (hexagram_resolver Go primitive)
  ↓
P1-B3g (ngu_hanh_classifier Go primitive)
  ↓
P1-B4g (reading_scorer Go primitive)
  ↓
P1-B5g (nuclear_hexagram Go primitive)
  ↓
P1-C1g (reading_composer Go module — all 5 primitives composed via MarkovPort)
  ↓
P1-D1 (scenario suite verification — 17 existing JSONs pass Go sandbox)
  ↓
P1-E1 (dashboard rebuilt from Go traces, honest NOT-RUN cold-open)
  ↓
P1-E2 (dashboard edit-rerun, Go sandbox runner, env audit)
```

**Critical path:** P1-A1g → A5g → B1g → B5g → C1g → E1 → E2 (~10h)

---

## Goal mapping

| Goal | Task(s) | Outcome |
|------|---------|---------|
| **G1** | P1-B1g..B5g, P1-D1 | 5 Go primitives each passing ≥3 scenarios (golden + edge + failure). Sandbox green on all. |
| **G2** | P1-C1g | Go module composes 5 primitives via MarkovPort interface; infra injected only at composition root; Fence-B grep returns 0. |
| **G3** | P1-A1g..A5g | go.mod + pkg/ DDD scaffold + cmd/server/main.go (≤80 lines, zero domain logic) + Dockerfile (CGO_ENABLED=0) + api/openapi.yaml (7 endpoints preserved). |
| **G4** | Phase 2 (depguard fence) | golangci-lint depguard enforces Fence-A/B/C; deliberate-violation proof; freeze anchor tag. |
| **G5** | Phase 2 (old TS deletion + HTTP rewire) | TS source → `src/_deprecated/`; MCP handlers route HTTP to port 5005. |
| **G6** | P1-E1 | Three-level dashboard (Primitives/Module/Microservice panels) renders from Go sandbox traces at file:// URL. |
| **G7** | P1-B1g..B5g, P1-D1, P1-E2 | Edit-JSON-and-rerun works via `go run ./cmd/sandbox`; env audit shows zero DB credentials. |
| **G8** | P1-E1, P1-E2 | Dashboard shows RED on deliberately broken primitive; GREEN when fixed. |
| **G9** | P1-E1 | HELD (re-confirm on rebuilt Go dashboard). Path B (PO Playwright) re-confirm: zero console errors, all 3 panels render, honest NOT-RUN cold-open. |
| **G10** | Phase 2 (QA deliberate bug injection + dev fix ≤2 cycles) | Baseline: `docs/data/bug-inventory.json` kinh_dich_baseline.baselineCycleCount = 1.5. |
| **G11** | Phase 2 (regression coupling proof) | 2-trial coupling proof: regression scenario flips RED during fix, agent repairs before marking DONE. |
| **G12** | All tasks | Every dev task includes "run Go sandbox + verify all scenarios green" in DoD. G12 streak: 3 consecutive tasks. |

---

## DDD layer assignments (Go)

| Layer | Go package | Rule |
|-------|-----------|------|
| Domain | `pkg/domain/` | Business types + MarkovPort interface + ReadingService; zero infra imports |
| Application | `pkg/application/` | DTOs + ReadingUseCase; imports domain only |
| Infrastructure | `pkg/infrastructure/` | SQLiteReadingRepository + SQLiteMarkovAdapter (modernc.org/sqlite); injected at composition root only |
| Interface | `pkg/interface/http/` | chi Router + handlers; imports application only |
| Primitive | `pkg/primitive/<name>/` | Pure functions; zero imports from domain/app/infra/interface; sister-primitive imports allowed |
| Module | `pkg/module/reading_composer/` | Composes primitives via MarkovPort; zero infra imports (Fence-B) |
| Composition root | `cmd/server/main.go` | Wires all layers; ≤80 lines; zero domain ops |

**Fence rules (for Phase 2 depguard):**
- Fence-A: `pkg/primitive/*` must NOT import `pkg/domain/`, `pkg/application/`, `pkg/infrastructure/`, `pkg/interface/`, `pkg/module/`
  - Exception: `pkg/primitive/nuclear_hexagram` MAY import `pkg/primitive/hexagram_resolver` and `pkg/primitive/hao_encoder` (sister primitives — OQ-6)
- Fence-B: `pkg/module/*` must NOT import `pkg/infrastructure/`
- Fence-C: `pkg/infrastructure/` is imported ONLY from `cmd/server/main.go`

---

## Risk flags

**Risk 1 (Critical — domain regression):** ~900 TS files are being replaced. The scenario JSON is the only safety net. If Go primitives produce different outputs from the TS pilot, hexagram readings will silently regress. Mitigation: P1-B*g and P1-D1 both require Go sandbox green against the exact same scenario JSON files used by the TS pilot before the task is marked done.

**Risk 2 (Critical — contract error reintroduction):** The TS handoff spec contained errors that the TS pilot dev corrected (extractAction signature, THIEU_DUONG threshold). A new developer reading old docs could reintroduce these errors. Mitigation: explicit AC in P1-B1g (threshold) and P1-B4g (extractAction signature) with grep gates and commit message requirements.

**Risk 3 (Fence-A exception footgun):** The `nuclear_hexagram` → `hexagram_resolver` + `hao_encoder` cross-primitive import is LEGITIMATE but could confuse the depguard rule author. Mitigation: OQ-6 resolves this before Phase 2 fence work; P1-B5g source comment documents the exception explicitly.

**Risk 4 (Markov boundary leak):** The TS pilot used MarkovPort Option B (inline interface). The Go equivalent must keep the same port boundary — `SQLiteMarkovAdapter` from `pkg/infrastructure/` injected only at composition root. Fence-B grep in P1-C1g AC-5 enforces this.

**Risk 5 (depguard false-green):** Per fleet lesson (`docs/signals/context-bloat--*`), lint/fence config can report 0 errors while checking nothing. Mitigation: Phase 2 G4 task must include deliberate-violation proof (inject Fence-A import → non-zero exit) before the fence is declared passing — identical to the R-FENCE gate pattern from the TS pilot.

---

## Preserved assets (no Go changes needed)

- `docs/scenarios/kinh-dich/` — 17 JSON files (15 primitives + 2 module). Language-agnostic. PRESERVE verbatim. Go sandbox must pass all 17.
- `src/interface/openapi.yaml` — COPY to `api/openapi.yaml`. Content preserved. Source file may remain as reference.
- `docs/data/pilot-status-kinh-dich.json` — SSOT owned by PM/PO. Architect does not modify. PM updates `phase1.task_plan` pointer from the TS plan to this Go plan.

---

## Notes for dev-kinh-dich

- Mandatory reading before P1-A1g: this plan in full + `docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-charter.md` + `docs/data/pilot-status-kinh-dich.json` (tsCompletionArchive for authentic domain contracts)
- Language mode: all P1-A*g, P1-B*g, P1-C*g tasks are Go. `*.go`, `go.mod`, `cmd/`, `pkg/` = Go mode.
- Primitive extraction pattern: each primitive is a pure function package (zero side effects, zero imports from higher layers). Use table-driven tests. Embed all lookup tables inline — no file I/O.
- G12 enforcement: before marking any B-bucket or C-bucket task DONE, run `go run ./cmd/sandbox` and confirm all scenarios for that primitive are GREEN. If any RED, task is incomplete.
- Nuclear hexagram cross-primitive import: explicitly allowed (OQ-6). Document the exception in source.

## Notes for dev-frontend

- Dashboard rebuild philosophy: update panel header text (TypeScript → Go), update scenario card data from Go sandbox traces, preserve the three-panel structure and honest NOT-RUN cold-open.
- Sandbox runner command (LOCKED): `go run ./cmd/sandbox -tier=<tier> -module=kinh-dich -scenario=<file>`. Do not change without architect sign-off.
- File:// constraint: dashboard must open without a running server. No external CSS frameworks. Scenario data embedded inline.

---

## What PM owes next

1. Update `docs/data/pilot-status-kinh-dich.json`: set `phase1.task_plan` from `phase-1-task-plan-ts.md` to `phase-1-task-plan-go.md`
2. Create handoff files `docs/handoffs/TASK_P1-KD-A1g.md` through `docs/handoffs/TASK_P1-KD-E2.md`
3. Update `docs/TASKS.md` to list all 14 Go tasks in Todo state; P1-A1g is the first task
4. Confirm `dev-kinh-dich` flow file references `go test ./...` + `go vet ./...` (not bun test) — if not, flag to agent-father before dispatching P1-A1g
5. Notify main terminal that plan is READY-FOR-DISPATCH

---

## Sunk-cost note

The TS pilot (12/12 YES, verdict=scale) is archived in `tsCompletionArchive`. Net reboot cost: ~900 TS files replaced by ~40–60 Go source files. User accepted this cost via USER-DIRECTIVE 2026-05-24. The scenario JSON files and OpenAPI contract survive the reboot — they reduce regression risk significantly.
