# TASK 1899a-core — Service Skeleton: Dockerfile, package.json, Entry Point

**Sprint:** 1899a | **Branch:** `task/1899a-core-scaffold` | **Size:** M | **Zone:** apps/news-fetch/

---

## TLDR

Scaffold the news-fetch service skeleton: multi-stage Dockerfile (Bun builder + Playwright runtime), package.json with build/dev scripts, tsconfig.json (TS 5.0, target ES2020), and src/index.ts entrypoint (Bun.serve export, minimal Hono bootstrap, /health route inline). This is the foundation for all downstream adapters and routes.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §1: Port assignment corrected 5007 → 5008
- §8: Dockerfile strategy (multi-stage, Microsoft Playwright base image)
- §2: Module layout (folder structure confirmed)

**Service Summary:**
- Language: TypeScript + Bun
- Port: 5008 (corrected from ops handoff which said 5007)
- Base: `mcr.microsoft.com/playwright:v1.44.0-jammy` (not Alpine — glibc required for Chromium)
- RAM: 2 GB reserved, 2.5 GB limit (for Playwright Chromium)

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/Dockerfile` | Multi-stage: Bun builder stage + Playwright runtime stage | ~30 |
| `apps/news-fetch/package.json` | Dependencies (bun, playwright, playwright-stealth, hono), build/dev scripts | ~20 |
| `apps/news-fetch/tsconfig.json` | Mirrored from macro-indicators | ~10 |
| `apps/news-fetch/src/index.ts` | Bun HTTP server (Hono router), /health endpoint, port 5008 | ~40 |
| `apps/news-fetch/.gitignore` | Standard (node_modules, dist, .env, etc.) | ~10 |

**Files to Modify:** None (core scaffold standalone).

**Dependencies:** None (Tier 1, can start immediately).

**Knowledge Needed:**
- `docs/policies/dev-standards.md` (coding standards)
- `docs/ARCHITECTURE.md` (service layout + DDD layers)
- Brief §8 Dockerfile architecture (multi-stage, Playwright base)

---

## Acceptance Criteria

- [ ] **Dockerfile created** at `apps/news-fetch/Dockerfile`:
  - Stage 1: `oven/bun:1.3.13-alpine` AS bun-builder (install deps only)
  - Stage 2: `mcr.microsoft.com/playwright:v1.44.0-jammy` (runtime)
  - Bun installed in Stage 2 via curl install script
  - `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` set (do NOT run `playwright install`)
  - `EXPOSE 5008` and `ENV PORT=5008` set
  - CMD runs `bun src/index.ts`

- [ ] **package.json created** at `apps/news-fetch/package.json`:
  - name: `news-fetch`
  - version: `1.0.0`
  - Dependencies: `hono`, `playwright`, `playwright-stealth`
  - DevDependencies: `@types/bun`, `typescript`
  - Scripts: `dev` (bun --watch), `build` (bun build), `start` (bun src/index.ts), `test` (bun test)
  - Follows macro-indicators pattern (mirror existing)

- [ ] **tsconfig.json created** at `apps/news-fetch/tsconfig.json`:
  - Copied from `apps/macro-indicators/tsconfig.json` (or standard TS 5.0 config)
  - target: ES2020, moduleResolution: node, strict mode enabled

- [ ] **src/index.ts created** at `apps/news-fetch/src/index.ts`:
  - Imports: `Hono` from hono, `serve` from bun
  - Creates Hono app instance
  - Registers GET /health route (inline, returns `{ status: "ok", service: "news-fetch", port: 5008 }`)
  - Exports default `serve({ fetch: app.fetch, port: parseInt(Bun.env.PORT || '5008') })`
  - Must start without error when `bun src/index.ts` runs
  - No domain/app/adapter logic yet (skeleton only)

- [ ] **.gitignore created** at `apps/news-fetch/.gitignore`:
  - Standard entries: node_modules, dist, .env, .env.local, coverage, etc.

- [ ] **Folder structure verified**:
  - `apps/news-fetch/` exists with src/ subfolder ready for domain/application/infrastructure/interface subfolders

- [ ] **Dockerfile builds cleanly**:
  - `docker build -t news-fetch:dev apps/news-fetch` succeeds
  - No layer errors, warning-free preferred

- [ ] **Container starts**:
  - `docker run -p 5008:5008 news-fetch:dev` starts without error
  - No "Cannot find module" or "playwright not found" crashes
  - Logs show "Listening on http://0.0.0.0:5008" or similar

- [ ] **Health endpoint responds**:
  - `curl http://localhost:5008/health` returns 200 with JSON `{ status: "ok", service: "news-fetch", port: 5008 }`

- [ ] **Commit message** follows convention:
  - Format: `feat(1899a-core): news-fetch service skeleton — Dockerfile, package.json, tsconfig, entry point`
  - Trailers: `Task: 1899a-core` (mandatory), `AC: <lines checked above as completed>`

---

## [Developer] Notes

**Pattern to follow:**
- Dockerfile multi-stage strategy mirrors alert-engine pattern if present; fallback to brief §8 word-for-word
- package.json: compare with macro-indicators/package.json for exact dependency versions (Playwright often has minor compatibility)
- tsconfig.json: can be exact copy (no news-fetch-specific settings needed yet)
- src/index.ts: follows Hono quick-start pattern, inline /health for now (routes moved to separate handler file in 1899a-routes task)

**Testing locally:**
```bash
cd apps/news-fetch
bun install
bun src/index.ts
# In another terminal:
curl http://localhost:5008/health
```

**Common pitfalls:**
- Alpine + Chromium incompatibility — this brief specifically chose Jammy (Ubuntu 22.04) for that reason
- Playwright install conflict — do NOT run `playwright install` in Dockerfile; browsers already in `/ms-playwright`
- PORT env var case sensitivity — use `Bun.env.PORT` (not `process.env.PORT`)

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service, no multi-zone).
- All files created in this task are within `apps/news-fetch/` tree.
- No cross-zone dependencies.
- Next task (1899a-domain) extends this zone with domain layer.

---

## [Developer] Implementation Record

- **Service:** news-fetch
- **Zone:** apps/news-fetch/
- **Files created:**
  - `apps/news-fetch/Dockerfile:34` — multi-stage (oven/bun:1.3.13-alpine builder + mcr.microsoft.com/playwright:v1.44.0-jammy runtime)
  - `apps/news-fetch/package.json:20` — hono ^4, playwright ^1.44, playwright-stealth 0.0.1, bun-types, typescript
  - `apps/news-fetch/tsconfig.json:11` — strict ESNext, bundler moduleResolution, bun-types
  - `apps/news-fetch/src/index.ts:40` — Hono app, GET /health, default Bun.serve export, PORT env
  - `apps/news-fetch/src/pkg.ts:7` — version/name metadata (avoids JSON import ESM issues)
  - `apps/news-fetch/__tests__/1899a-core-smoke.test.ts:34` — 3 smoke tests
  - `apps/news-fetch/.gitignore:9` — standard entries
  - `apps/news-fetch/bun.lock` — lockfile
  - DDD skeleton dirs: `src/domain/`, `src/application/`, `src/infrastructure/`, `src/interface/`
- **Tests written:** `apps/news-fetch/__tests__/1899a-core-smoke.test.ts` — 3 assertions (200 status, JSON shape, content-type), GREEN
- **Git commits:** `120e16ca feat(1899a/news-fetch): 1899a-core news-fetch service skeleton`
- **Type check:** clean (0 errors)
- **Service tests:** 3 pass / 0 fail
- **Docs updated:** NONE (pure skeleton — no knowledge files impacted)
- **Graphify:** skipped (no docs impacted)

**Inconsistency flagged:** `playwright-stealth` has only one published version (`0.0.1`) on npm. Handoff spec says `^1.0.0` (which resolves to nothing). Pinned to `0.0.1` for install compatibility. The 1899a-factory task should evaluate replacing with `playwright-extra` + `puppeteer-extra-plugin-stealth` (the maintained alternative) or a custom stealth inject.

**Port note:** Entrypoint uses port 5008 (corrected per brief §1). Handoff L23 says 5008 — consistent. No conflict.
