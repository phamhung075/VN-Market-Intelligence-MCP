# 1912d Cutover Audit Brief

**Date:** 2026-05-14 c100
**Trigger:** User directive — cutover Go gateway to primary (port 4000), retire TS gateway, update all docs + agents
**Fires when:** 24h smoke clean confirmed (2026-05-15T14:00Z+) via `docs/signals/{ts}-1912d-smoke-clean.json` from ops
**Audit head:** main @ `316f1db1ffa45b9c06575001f53c306ebea3dd42`

---

## 1. File Inventory — REQUIRES Edit

### 1.1 Service Layout (filesystem)

| Action | Path | Notes |
|---|---|---|
| `git rm -rf` | `apps/api-gateway/` (TS) | Pre-step — removes Bun/Hono source, Dockerfile, bun.lock, package.json, tsconfig.json, `src/` tree, `node_modules/` |
| `git mv` | `apps/api-gateway-go/` → `apps/api-gateway/` | After rm step above |

**TS gateway tree to be deleted:**
- `apps/api-gateway/Dockerfile`
- `apps/api-gateway/bun.lock`
- `apps/api-gateway/package.json`
- `apps/api-gateway/tsconfig.json`
- `apps/api-gateway/src/` (full tree — domain, app, infra, interface layers + `__tests__/1841a-health-dashboard.test.ts`, `__tests__/1892b-api-push-routes.test.ts`)

**Go gateway tree being promoted (no internal file edits required except module path — see §1.8):**
- All files in `apps/api-gateway-go/` move to `apps/api-gateway/`

---

### 1.2 `docker-compose.yml` (root)

| Line | Current | Action |
|---|---|---|
| L214 | `api-gateway:` service key | Keep key name — no rename needed post-mv |
| L215–L217 | `context: apps/api-gateway`, `dockerfile: Dockerfile` | Update context to `apps/api-gateway` (already correct after `git mv`) — no line edit needed IF git mv is done first |
| L219 | `- 4000:4000` | **CHANGE** to `- 4000:4000` (host 4000, container 4000) — currently Go runs on host 4001:container 4000; after cutover Go becomes `api-gateway` and gets host 4000 |
| L250–L285 | `api-gateway-go:` block (L250–L285, 36 lines) | **DELETE** entire `api-gateway-go` service block |

**Precise edit plan for docker-compose.yml:**
1. Delete the entire `api-gateway-go:` service block (L250–L285).
2. In the surviving `api-gateway:` block, the `context: apps/api-gateway` reference becomes valid after `git mv`; no text change needed in compose for the build context.
3. The `ports: - 4000:4000` mapping on the surviving block is already correct (the TS block had `4000:4000`; the Go block had `4001:4000`). After the swap the surviving block is TS-derived but its build context now points to Go code — verify no healthcheck anomalies.

**Note on healthcheck:** Both services use `wget -qO- http://localhost:4000/health` — identical post-cutover, no edit.

---

### 1.3 Workspace Config

| File | Line(s) | Action |
|---|---|---|
| `pnpm-workspace.yaml` | `packages: ['apps/*', 'packages/*']` | No change — glob wildcard; Go module is not a pnpm package, no harm from glob |
| Root `package.json` | — | No `api-gateway` workspace entry found — no edit needed |
| `turbo.json` | — | No `api-gateway` entry found — no edit needed |

---

### 1.4 CI / Scripts

| File | Finding |
|---|---|
| `.github/workflows/ci.yml` | No `api-gateway` or port 4000/4001 references found — no edit needed |
| `scripts/` | No gateway references found — no edit needed |

---

### 1.5 Architecture Briefs (1912 close-out)

| File | Edit needed |
|---|---|
| `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` (164L) | Append § "Phase 1 Close-out" after L164: record smoke-clean date, cutover SHA, link to 1912d-cutover-audit.md; mark P1 **DONE**. P2 (1912b-alert-engine) and P3 (1912c-stock-price) status update to **UNLOCKED**. |
| `docs/architecture-briefs/2026-05-14-1912a-spec-review.md` | Add close-out footer: "Resolved 2026-05-15 — cutover complete per 1912d-cutover-audit.md." |
| `docs/REQ_1912a.md` | Add close-out section after final line: date closed, cutover SHA, final state (Go IS `apps/api-gateway/`). |

---

### 1.6 References, Standards & Runtime Docs

| File | Line | Edit needed |
|---|---|---|
| `docs/references/dev-api-gateway-go-competency.md` | L1 header, L3 trigger line | **Title:** change to `# dev-api-gateway — Go Competency` (drop `(1912a)` migration tag). **Trigger line:** change trigger from `go_migration` to `gateway_work` (Go is now the standing implementation, not a migration). **Remove:** "load when working on the Go rewrite" phrasing — replace with "load when working on the Go gateway implementation." **Remove:** L5 `**Full plan:** docs/architecture-briefs/2026-05-14-go-migration-3-services.md` pointer (or demote to "Historical context:"). **Module path note:** Add a note that the Go module is `github.com/vn-market-intelligence/api-gateway` (post-rename from `api-gateway-go`) — see §1.8. |
| `docs/references/tree-map.md` | L144–L149 | No path change needed — entries already reference `docs/architecture/microservice/api-gateway/` which is the language-neutral doc tree. No edit required. |
| `docs/references/agent-roster.md` | L57 | Zone column shows `apps/api-gateway/` — remains valid after `git mv`. No edit. |
| `docs/references/workflow-map.md` | L115 | Zone `apps/api-gateway/` remains correct. No edit. |
| `docs/ARCHITECTURE.md` | L18, L40, L64 | **L18:** change `TypeScript/Bun — routing layer (port 4000)` → `Go — routing layer (port 4000)`. **L40:** change `TypeScript/Bun` column → `Go`. **L64:** `API Gateway (4000)` text is fine — no tech stack mentioned. Edit L18 + L40 only. |
| `docs/policies/restart-policy.md` | L35 | Change `API Gateway (port 4000)      TypeScript/Bun` → `API Gateway (port 4000)      Go`. |
| `docs/architecture/microservice/api-gateway.md` | L3 | Change `**Language:** TypeScript / Bun` → `**Language:** Go`. |
| `docs/architecture/microservice/api-gateway/domain-model.md` | L60 | Change `apps/api-gateway/src/domain/services.ts` → `apps/api-gateway/pkg/domain/services.go`. |
| `docs/architecture/microservice/api-gateway/api-reference.md` | L3 | Change `apps/api-gateway/src/interface/handlers.ts` → `apps/api-gateway/pkg/interface/http/handlers.go`. |
| `docs/architecture/microservice/api-gateway/infrastructure.md` | L4, L13 | Change `apps/api-gateway/src/infrastructure/health_checker.ts` → `apps/api-gateway/pkg/infrastructure/healthchecker.go`. L54 `PORT → 4000` remains correct. |
| `docs/architecture/microservice/api-gateway/usecases.md` | L4, L10 | Change `apps/api-gateway/src/application/usecases.ts` → `apps/api-gateway/pkg/application/aggregate.go`. |
| `docs/architecture/microservice/api-gateway/testing.md` | L4, L7, L33, L34 | Change L4 test path to `apps/api-gateway/pkg/interface/http/handlers_test.go`. L7: change `Bun test (bun:test)` → `Go test (testing.T)`. L33–L34: change `cd apps/api-gateway && bun test` → `cd apps/api-gateway && go test ./...`; remove `bun tsc --noEmit` line. |
| `README.md` (root) | L88 | Change `api-gateway | 4000 | Routing + health aggregation` — the port column is fine; verify if a "TypeScript" or "Bun" language tag appears on L88 context and update to `Go`. |
| `apps/mcp-server/src/infrastructure/microservices/clients.ts` | L6 | Comment change only: `api-gateway (4000): health aggregation, reverse proxy` — no code change needed (gateway URL still `:4000`). Comment is technically still accurate. Mark as OPTIONAL / cosmetic. |

---

### 1.7 Agent `.md` Files

| Agent file | Section | Edit needed |
|---|---|---|
| `.claude/agents/dev-api-gateway.md` | L25 `description`, L46 `tech_stack`, L47–L48 `test_command`/`type_check`, L56–L64 `skills`, L83 `scope`, L122–L124 lazy-load block, L19 size-justification | **description L25:** Remove `TypeScript/Bun specialist` — change to `Go specialist for api-gateway`. **L46 `tech_stack:`** change `TypeScript, Bun, Hono` → `Go`. **L47 `test_command:`** change `cd apps/api-gateway && bun test` → `cd apps/api-gateway && go test ./...`. **L48 `type_check:`** remove line (Go has no separate type-check step; `go build ./...` covers it — or change to `cd apps/api-gateway && go build ./...`). **L56–L64 skills block:** remove `TypeScript / Bun production code`, `Hono HTTP routing framework`; add `Go 1.22 net/http`, `log/slog structured JSON logging`. Keep TDD, DDD, health-aggregation, proxy skills. **L122–L124 lazy-load entry:** change trigger from `go_migration` to `gateway_work`; update note. **L19 size-justification comment:** update "(1912a)" migration tag to reflect Go as standing implementation. |

No other agent `.md` files reference `apps/api-gateway/` specifically or port 4000/4001. `dev-zone-enforcement-and-split-policy.md` (brief L61) mentions the zone but is a historical brief — no edit needed.

---

### 1.8 Go Module Path (Internal — `apps/api-gateway-go/*.go`)

After `git mv apps/api-gateway-go/ apps/api-gateway/`, the Go module path in `go.mod` and all `import` statements will still read `github.com/vn-market-intelligence/api-gateway-go`. This is a Go module name — it is a logical identifier, not a filesystem path. It does **not** need to change for the binary to build or run correctly.

**Recommended (optional, cosmetic):** Rename module to `github.com/vn-market-intelligence/api-gateway` for clarity. This requires:
- Edit `go.mod` L1: `module github.com/vn-market-intelligence/api-gateway`
- Edit all 10 import paths across 5 `.go` files (main.go, aggregate.go, handlers.go, handlers_test.go, and any others that import the module):
  - `github.com/vn-market-intelligence/api-gateway-go/pkg/*` → `github.com/vn-market-intelligence/api-gateway/pkg/*`
- Also update `main.go` L54 log string: `"api-gateway-go starting"` → `"api-gateway starting"`

**Decision for 1912d executor:** Rename is cleaner but adds scope. If deferring, add a `// TODO(1912d): rename Go module from api-gateway-go to api-gateway` comment in `go.mod`. The system will function identically either way.

---

### 1.9 Flow Files

| File | Line | Edit needed |
|---|---|---|
| `.claude/flows/dev-api-gateway/main.md` | L3, L11–L13 | No change — zone `apps/api-gateway/` and `<agent-id> = dev-api-gateway` remain valid. |
| `.claude/flows/po/zone-routing.md` | L16, L36 | Zone table entry `apps/api-gateway/ → dev-api-gateway` remains valid. No edit. |
| `.claude/flows/ops/docker.md` | L41 | Comment `# api-gateway` is on a curl to `localhost:5003/health` (technical-analysis port — likely a copy-paste comment error, pre-existing). Not related to this cutover. No edit. |

---

### 1.10 Tests

| File | Note |
|---|---|
| `apps/api-gateway/src/__tests__/1841a-health-dashboard.test.ts` | Deleted with TS gateway (`git rm -rf apps/api-gateway/`) |
| `apps/api-gateway/src/__tests__/1892b-api-push-routes.test.ts` | Deleted with TS gateway |
| `apps/api-gateway-go/pkg/*/` test files | Promoted to `apps/api-gateway/pkg/*/` via `git mv` — no content change needed |
| `apps/mcp-server/src/__tests__/` | No test file hardcodes port 4001 or explicitly references TS gateway. The `clients.ts` fallback is `localhost:4000` which stays valid. No test edits needed. |

---

### 1.11 Handoff Docs (historical — do NOT edit)

These docs reference TS gateway paths for completed tasks; they are historical records:
- `docs/handoffs/TASK_1912a-gateway-go-migration.md` — historical, keep as-is
- `docs/handoffs/TASK_1899a-gateway.md` — historical, keep as-is
- `docs/handoffs/TASK_1841a.md` — historical, keep as-is

---

## 2. Files NOT to Touch

- `docs/agent-memory/notebooks/*` — historical record
- `docs/agent-memory/sessions/*` — historical record
- `docs/agent-memory/archive/*` — historical record
- `docs/signals/processed/*` — historical record
- `docs/TASKS_ARCHIVE.md` — historical record
- `docs/handoffs/TASK_1912a-gateway-go-migration.md` — completed task record
- `docs/handoffs/TASK_1899a-gateway.md` — completed task record
- `docs/handoffs/TASK_1841a.md` — completed task record
- `docs/architecture-briefs/2026-05-14-go-migration-3-services.md` — append only (close-out § added, existing content untouched)
- `docs/architecture-briefs/2026-05-14-1912d-cutover-audit.md` — this file (immutable after commit)
- `docs/TASKS.md` rows for `1912a-gateway-go-migration-SHIPPED-c99` — historical record row

---

## 3. Estimated Effort

| Category | Files | Size |
|---|---|---|
| Filesystem rename + rm | `apps/api-gateway/` (delete) + `apps/api-gateway-go/` (mv) | S |
| `docker-compose.yml` | 1 file — delete `api-gateway-go:` block (36 lines), verify context | S |
| Workspace/CI config | 0 edits needed | — |
| Microservice docs (6 files) | `api-gateway.md` + 4 sub-docs + `testing.md` | S |
| Arch docs (3 files) | `ARCHITECTURE.md`, `restart-policy.md`, `README.md` | S |
| References (2 files) | `dev-api-gateway-go-competency.md`, `clients.ts` comment | S |
| Agent `.md` (1 file) | `dev-api-gateway.md` — 6 fields | S |
| Architecture brief close-outs (3 files) | Append/footer only | S |
| Go module rename (optional) | 1 `go.mod` + 5 `.go` files | S |
| **Total** | ~18 files (22 with optional Go rename) | **M** (single sprint, ~3–4h) |

---

## 4. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Port 4000 host cutover = brief downtime during `docker-compose up -d` restart | Keep TS image cached (`docker images` will retain it). Execute during low-traffic window (UTC night = VN early morning). Single-service restart — other services unaffected. |
| R2 | `git mv` loses Go file history if done as rm+add instead of proper mv | Use `git mv apps/api-gateway-go apps/api-gateway` (not shell `mv`). Verify `git log --follow` on one file post-cutover. |
| R3 | Go module path `api-gateway-go` in import strings survives `git mv` — binary still builds but logs emit "api-gateway-go starting" | If module rename is deferred, add TODO comment in go.mod. Functional risk = none; cosmetic/log confusion risk = low. |
| R4 | `apps/mcp-server/src/infrastructure/microservices/clients.ts` fallback `localhost:4000` — in docker-compose network, it resolves via `GATEWAY_URL=http://api-gateway:4000` env var which stays valid because service name stays `api-gateway` | No config change needed. Verify docker-compose env block post-edit has `MCP_URL=http://mcp-server:3000` etc. still present (they are — L222–L229). |
| R5 | docs/architecture/microservice/api-gateway/ sub-docs reference TS file paths (`src/domain/services.ts` etc.) — if anyone uses these docs to navigate code before 1912d edits them, they'll get 404s | Fix docs atomically in same sprint as filesystem rename. |

---

## 5. Dispatch Envelope (for PM at 1912d kickoff)

```json
{
  "sprint": 1912,
  "task": "1912d-cutover-cleanup",
  "size": "M",
  "zones": [
    "apps/api-gateway/",
    "apps/api-gateway-go/",
    "docker-compose.yml",
    "docs/architecture/microservice/api-gateway/",
    "docs/architecture-briefs/",
    "docs/references/",
    "docs/policies/",
    "docs/ARCHITECTURE.md",
    "README.md",
    ".claude/agents/dev-api-gateway.md"
  ],
  "fires_when": "smoke clean confirmed via signal {ts}-1912d-smoke-clean.json from ops at 2026-05-15T14:00Z",
  "depends_on": ["1912a-gateway-go-migration"],
  "blocks": ["1912b-alert-engine", "1912c-stock-price"],
  "executor": "dev-api-gateway + agent-father (agent .md edits)",
  "audit_brief": "docs/architecture-briefs/2026-05-14-1912d-cutover-audit.md",
  "audit_sha": "316f1db1ffa45b9c06575001f53c306ebea3dd42"
}
```

---

## 6. Execution Order for 1912d

1. **Pre-flight check:** `curl localhost:4001/health` → 200, zero error logs in `docker logs api-gateway-go` over past 24h.
2. **Git:** `git rm -rf apps/api-gateway/` then `git mv apps/api-gateway-go/ apps/api-gateway/`.
3. **docker-compose.yml:** Delete `api-gateway-go:` block; verify `api-gateway:` block build context resolves correctly.
4. **(Optional) Go module rename:** Edit `go.mod` + 5 `.go` files — update module path + startup log string.
5. **Docker rebuild:** `docker-compose build api-gateway && docker-compose up -d api-gateway`.
6. **Smoke:** `curl localhost:4000/health` → 200 with all services listed.
7. **Doc + agent edits:** All files in §1.5–§1.9 above.
8. **Commit:** Single atomic commit scoped to 1912d.
9. **Signal:** Drop `docs/signals/{ts}-1912d-complete.json` to notify PM.
