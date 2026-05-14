# Architecture Brief — SSOT Data Location Mapping
**Date:** 2026-05-14 | **Author:** agents-architect | **Status:** READY FOR IMPLEMENTATION

---

## 1. Executive Summary

- All project data lives in three distinct zones (Mac filesystem, container internals via named volume, and bind-mounts), but only a small slice of `docs/` is currently wired into the container — leaving cowork analysis agents on Claude Desktop blind to policies, protocols, architecture briefs, and specs.
- Cowork agents access data exclusively through MCP server tools. If a file is not reachable by the mcp-server container, it does not exist from a cowork agent's perspective.
- The current bind-mount set covers only `docs/agent-memory/` and three individual JSON files under `docs/data/`. Everything else under `docs/` — policies, protocols, standards, references, briefs, specs, TASKS.md — is unreachable from any container, directly degrading cowork analysis quality.
- The DB named volume (`market_data`) is a hard constraint and must remain unchanged — moving it to a Mac bind-mount caused 8x SQLite SHM corruption (Sprint 1336, decision final).
- Four concrete changes (C1–C4) close the gap: one compose edit, one MCP tool, one backup cron, and one policy doc update.

---

## 2. Current State Map

### 2.1 Verified Bind-Mounts (mcp-server, docker-compose.yml lines 13–17)

```yaml
# docker-compose.yml — mcp-server volumes block (lines 10-17)
volumes:
  - market_data:/app/data                                           # named volume — DBs
  - ./mcp.config.json:/app/mcp.config.json:ro
  - ./reports:/app/reports
  - ./docs/agent-memory:/app/docs/agent-memory                     # rw — notebooks, sessions
  - ./docs/data/project-stats.json:/app/docs/data/project-stats.json:ro
  - ./docs/data/stock-classification.json:/app/docs/data/stock-classification.json:ro
  - ./docs/data/alert-verdicts.json:/app/docs/data/alert-verdicts.json:ro
```

### 2.2 What Is NOT Reachable from Any Container

```
docs/policies/        — commit convention, data source policy
docs/protocols/       — fail-loud protocol, BCTC runbook, ops incident response
docs/standards/       — mcp-tools, coding standards
docs/references/      — agent-roster, tree-map, ARCHITECTURE.md
docs/architecture-briefs/  — this file and all previous briefs
docs/specs/           — BA specs per sprint
docs/agents/          — agent handler files
TASKS.md              — current task board
```

These are only readable on the Mac CLI. Claude Desktop cowork agents cannot reach them.

### 2.3 Data Zone Inventory

| Data class | Current SSOT location | Currently accessible from container? |
|---|---|---|
| Source code | Mac (`apps/`, `src/`) — built into image | Yes (binary) |
| Knowledge docs | Mac (`docs/`) | **PARTIAL** — only `docs/agent-memory/` + 3 JSON |
| Mutable data JSON | Mac (`docs/data/`) | **PARTIAL** — 3 specific files only |
| Agent notebooks | Mac (`docs/agent-memory/`) | Yes — rw bind-mount |
| DB state | Named volume `market_data` | Yes — all services via volume mount |
| Reports / logs | Mac (`./reports/`) | Yes — rw bind-mount |
| Build artifacts | Docker daemon | Yes — derivative of source |

---

## 3. Hard Constraints

**DB stays in named volume — NOT negotiable.**

- Sprint 1336 root-cause: macOS Docker VirtualMachine process tears SQLite SHM files on container stop when DB lives on a bind-mount. Reproduced 8 times. Fix: move to named volume `market_data`.
- Memory reference: `project_sqlite_corruption_fix.md`
- Decision status: FINAL. Do not reopen.
- Affected DBs: `market.db`, `alert_engine.db`, `stock_price.db`, `pdf_extractor.db`, `rag_service.db`, `lancedb/`.

---

## 4. Proposed SSOT Mapping

| Data class | SSOT location | Consumer access | Status |
|---|---|---|---|
| Source code | Mac (`apps/`, `src/`) → image build | Running container binary | In place |
| Knowledge docs (policies/protocols/standards/references/briefs/specs) | Mac (`docs/`) | Bind-mount ro → MCP `read_knowledge_doc` tool | **MISSING — C1 + C2** |
| Mutable data JSON | Mac (`docs/data/`) | Bind-mount ro (3 files already present) | Partial — C1 makes it implicit |
| Agent notebooks | Mac (`docs/agent-memory/`) | Bind-mount rw | In place |
| DB state | Named volume `market_data` | Tool queries via MCP | In place — do not change |
| Reports / logs | Mac (`./reports/`) | Bind-mount rw | In place |
| DB backups | Mac (`./backups/`) | Scheduled SQLite dump cron | **MISSING — C3** |
| Build artifacts | Docker daemon | Rebuild on source change | In place — C4 documents when |

**Rationale per row:**

- Knowledge docs: mounting the full `docs/` tree ro gives cowork agents access to policies, protocols, architecture briefs, and specs without any container rebuild. Read-only prevents container processes from corrupting authoritative docs.
- Mutable data JSON: already partially covered; the full `./docs/` ro mount (C1) makes individual JSON file mounts redundant — they become implicit. Keep explicit entries for backward-compat until C1 lands.
- DB backups: named volumes are opaque to the Mac filesystem. A backup cron that dumps SQLite files to `./backups/YYYY-MM-DD/` makes recovery possible without Docker volume inspection.
- Build artifacts: no SSOT change needed; C4 is documentation-only — it clarifies when developers must run `docker compose build <svc>` after a source change.

---

## 5. Concrete Change List

### C1 — Bind-mount full `./docs/` tree (ro) into mcp-server
**What:** Add one volume entry to `mcp-server` in `docker-compose.yml`:
```yaml
- ./docs:/app/docs:ro
```
Remove the three now-redundant individual `docs/data/*.json` entries (they remain accessible under the parent mount).

**Effort:** 1 hour — compose edit + `docker compose up -d mcp-server` + smoke test `ls /app/docs/policies/`.

**Risk:** macOS Docker bind-mount performance degrades with large directory trees. `docs/` at current size (~200 files, mostly small markdown) is well within safe range. Monitor if tree grows past ~2,000 files.

---

### C2 — Add MCP tool `read_knowledge_doc(relative_path)`
**What:** New tool in `apps/mcp-server/` that reads any file under `/app/docs/` given a relative path, with:
1. Path-traversal guard: reject any path containing `..` or starting with `/`.
2. Allowlist root: only paths under `/app/docs/` are served.
3. Companion tool `list_knowledge_docs(prefix?)` that returns the file tree under `/app/docs/<prefix>` (default: root), so agents can discover what is available.

**Why not use existing file-read tools:** Claude Desktop cowork agents have no direct Mac filesystem access — they can only call MCP tools. Without an explicit tool, `docs/` remains invisible even after C1 lands.

**Effort:** 3–5 hours — tool implementation + path guard unit tests + tool registration in MCP schema.

**Risk:** Path traversal if guard is misconfigured. Mitigate with a strict `path.resolve` + `startsWith('/app/docs/')` check, rejecting anything that escapes.

---

### C3 — Daily DB backup cron dumping `market_data` to `./backups/YYYY-MM-DD/`
**What:** A scheduled job (runs daily at 02:00 GMT+7) that:
1. Executes `sqlite3 /app/data/market.db ".backup '/app/backups/YYYY-MM-DD/market.db'"` (and similarly for `alert_engine.db`, `stock_price.db`).
2. Writes to a bind-mounted `./backups/` directory on Mac.
3. Retains last 7 days; deletes older directories.

**Requires:** Add `- ./backups:/app/backups` bind-mount to `mcp-server` compose entry.

**Effort:** 2–3 hours — cron job implementation + compose edit + test with manual trigger.

**Risk:** Disk space. At current DB sizes (~50–200 MB each), 7-day retention uses ~3–4 GB. Document retention policy in `docs/protocols/`. Alert if `./backups/` disk use exceeds 10 GB.

---

### C4 — Document image-rebuild cutover step in `docs/policies/commit-convention.md`
**What:** Add a section "Image Rebuild Policy" to the commit convention (or a new `docs/policies/docker-rebuild-policy.md`) stating:
- Source code changes in `apps/<svc>/` require `docker compose build <svc> && docker compose up -d <svc>` before the change is live.
- `docs/` changes require NO rebuild (bind-mount is live).
- `docker-compose.yml` changes require `docker compose up -d` (no build unless image changed).

**Effort:** 30 minutes — documentation only.

**Risk:** None. Doc-only change.

---

## 6. Out of Scope

- **Cloud migration of any DB or data store** — see memory `feedback_database_decision.md`. Decision is final: single-user local = zero latency, zero cost. Do not reopen.
- **Moving DBs from named volume to Mac bind-mount** — Sprint 1336 closed this permanently. See Section 3 above.
- **Remote/cloud access to `docs/`** — not a use case; cowork runs on Claude Desktop on the same Mac as the Docker host.
- **Real-time sync of `docs/` edits to a running container** — the ro bind-mount handles this transparently; no extra mechanism needed.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| macOS Docker bind-mount perf degradation on large `docs/` tree | LOW at current size | MEDIUM — I/O slowdown for all mcp-server reads | Monitor; set alert if `docs/` exceeds 2,000 files |
| Path traversal in `read_knowledge_doc` tool | LOW (if guard implemented correctly) | HIGH — arbitrary Mac file read from Claude Desktop | Strict `path.resolve` + `startsWith` guard; unit-test with `../`, absolute paths, symlinks |
| Backup disk space exhaustion | LOW (current DB sizes small) | HIGH — Mac disk fills, Docker degrades | 7-day retention cap + alert threshold (10 GB) |
| C1 lands but C2 not yet implemented — agents see mount but cannot call tool | MEDIUM (C2 is higher effort) | LOW — no regression; status quo until C2 ships | Sequence C1 → C2 in same sprint or document gap in TASKS.md |
| Individual JSON bind-mounts removed prematurely (before C1 tested) | LOW | MEDIUM — cowork loses 3 data files | Keep individual entries until C1 smoke-tested; remove in same PR |

---

## 8. Handoff — Sprint Batching for PO

Recommended priority order (each C-item = one sprint):

| Priority | Sprint | Change | Rationale |
|---|---|---|---|
| 1 | Sprint N | C1 — compose bind-mount | Zero code change; immediate visibility gain for cowork agents; 1 hour |
| 2 | Sprint N+1 | C2 — `read_knowledge_doc` MCP tool | Unlocks agent-readable docs; depends on C1 volume mount being present |
| 3 | Sprint N+2 | C3 — daily DB backup cron | Risk reduction; independent of C1/C2; can run in parallel with C2 |
| 4 | Sprint N+3 | C4 — docker-rebuild policy doc | Documentation hygiene; no dependency; lowest urgency |

C1 and C3 can be dispatched in parallel (different files, no conflict). C2 must follow C1 (tool reads from the newly mounted path). C4 is fully independent.

**Owner:** PO splits into sprint tasks; developer implements under zone `apps/mcp-server/` (C1, C2, C3) and `docs/policies/` (C4).

---

## Signal to Agent-Father / PO

**Immediate action:** PO to open sprint for C1 (compose edit, 1 hour) — highest ROI, zero risk.

**Files to change per C-item:**
- C1: `docker-compose.yml` — add 1 volume line, remove 3 individual JSON lines
- C2: `apps/mcp-server/src/tools/` — new `readKnowledgeDoc.ts` + `listKnowledgeDocs.ts` + registration
- C3: `apps/mcp-server/src/jobs/` — new `dbBackupJob.ts` + compose volume addition
- C4: `docs/policies/commit-convention.md` or new `docs/policies/docker-rebuild-policy.md`

**Ready:** YES. Brief complete.
