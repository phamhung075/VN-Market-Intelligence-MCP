# TASK 1959-watchdog-8 — Named-volume shadow audit (read-only)

**Sprint:** 1959 (cycle-2 add) · **Owner:** architect · **Size:** S (≤ 2h) · **Zone:** `multi` (read-only scan; no edits) · **Priority:** LOW · **Status:** DISPATCH-NOW (cycle-2)

Parent goal: `docs/SPRINT_GOAL.md` (Sprint 1959) · Trigger: side discovery in watchdog-3 ship — `docs/signals/dev-rag-service-1959-watchdog-3.json#technical_notes`. The named volume `market_data` mounts at `/app/data` across **every** microservice (verified: mcp-server, pdf-extractor, rag-service, market-data, ta-engine, plus 5 more). Any pre-baked asset placed at `/app/data/*` inside a Dockerfile is silently shadowed by the volume content on already-running deployments — a class of failure that returns "asset missing" with no error, no log, no obvious cause.

---

## Why audit-only (no edit)

The remediation pattern (move asset to `/opt/<name>-cache` outside the volume mount + update `EMBEDDING_CACHE_DIR`-style env var) is already proven by watchdog-3. The unknown is **how many other services have the same trap**. We need a map BEFORE deciding scope of any follow-on fix. Each individual fix is per-service code change and image rebuild — disk-pressure cost class — so a parallel rebuild of N services is exactly the failure mode 1958 already taught us to avoid.

Audit first → triage → ship one rebuild at a time if any fixes are warranted.

## Work (read-only)

1. List every service in `docker-compose.yml` that mounts the `market_data` named volume (already partially known — confirm count and exact services).
2. For each such service's Dockerfile (`apps/<service>/Dockerfile`), grep for `RUN` steps that write under `/app/data/...` (model downloads, asset bakes, seed data, schema files, pre-computed indices).
3. Cross-check: for each candidate, is the path also a target of the volume mount? (Volume mounts at `/app/data` shadow everything beneath that path.)
4. Categorise findings:
   - **CONFIRMED SHADOW** — Dockerfile writes to `/app/data/...` AND service mounts `market_data` at `/app/data`.
   - **SAFE** — writes to `/app/data/...` but service does NOT mount the volume there.
   - **OUT-OF-VOLUME** — writes go to `/opt/`, `/etc/`, `/usr/local/`, or other non-volume paths (no shadow risk).
5. Output: brief at `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` (~60 lines):
   - Inventory table (service / mount path / Dockerfile asset path / shadow status).
   - Rationale per CONFIRMED SHADOW entry (why it matters, expected user-visible symptom).
   - Recommendation per entry (move-to-/opt fix? leave as-is? not applicable?).
   - Sprint follow-on proposal: if N CONFIRMED SHADOWs found, propose Sprint 1960-volume-shadow-remediation (N tasks, one per service, sequenced to respect disk-pressure WIP) OR mark "no other services affected" as the audit verdict.

## Acceptance Criteria

- **AC-8-1:** Brief exists at the documented path, ≤ 80 lines.
- **AC-8-2:** Every `market_data`-mounted service from `docker-compose.yml` appears in the inventory table.
- **AC-8-3:** Each Dockerfile inspected has at least one row in the table (CONFIRMED SHADOW / SAFE / OUT-OF-VOLUME).
- **AC-8-4:** A clear verdict line: "N CONFIRMED SHADOW(S) found; recommendation: <next sprint / no action>".

## Out of scope

- ANY code edits, ANY Dockerfile edits, ANY rebuild. This is a read-only scan and writeup. Implementation fixes (if recommended) go into a follow-up sprint after PO triage.
- Volumes other than `market_data` (e.g. bind-mounts of host paths). Only the named volume is in scope because that's the watchdog-3 finding.

## Disk-safety note

Zero image rebuilds, zero container restarts. Safe to ship alongside watchdog-5 in cycle-2 without contention.

## Definition of done

- AC-8-1 through AC-8-4 PASS.
- Brief committed.
- Signal: `docs/signals/architect-1959-watchdog-8.json` with finding count + recommendation + brief path.
- Commit format: `docs(architect/1959-watchdog-8): named-volume shadow audit — N findings` per `docs/policies/commit-convention.md`.
