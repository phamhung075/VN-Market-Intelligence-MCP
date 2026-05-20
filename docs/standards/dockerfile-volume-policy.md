# Dockerfile Volume Policy — Baked-Asset Placement

**Scope:** All services mounting named volumes (e.g. `market_data:/app/data`).
**Rationale:** `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` (Sprint 1959 watchdog-8).

---

## Rule

Image-layer assets (model weights, seed DBs, fixtures, Tesseract `tessdata/`, pre-warmed indexes)
**MUST live under `/opt/<service>-assets/`** — never under `/app/data/*` or any path that
`docker-compose.yml` mounts as a named volume.

```
CORRECT   /opt/model-cache/           ← outside named volume
CORRECT   /opt/pdf-extractor-assets/  ← outside named volume
WRONG     /app/data/models/           ← shadowed by market_data volume
WRONG     /app/data/tessdata/         ← shadowed by market_data volume
```

Named volumes are for **runtime-mutable state only** (DBs, generated PDFs, LanceDB segments).

---

## Why: named-volume shadow failure mode

Docker mounts a named volume on top of the image layer at container start. Any file baked into the
image under that path becomes **silently invisible at runtime** — no error, no log line. Debugging
looks like a "missing file" with no obvious cause.

Precedent (Sprint 1959 watchdog-3, commit `66255410`): sentence-transformers model baked under
`/app/data/models` was shadowed by `market_data`. Fix: moved to `/opt/model-cache`. Cold-start
dropped from >30s to 11-16s. Audit watchdog-8 found two additional latent-risk sites (pdf-extractor,
rag-service) with empty `mkdir` directives — safe today, footgun for future developers.

---

## Canonical pattern

```dockerfile
# CORRECT — bake asset outside volume mount
RUN mkdir -p /opt/my-service-assets
COPY seed.db /opt/my-service-assets/seed.db
ENV SEED_DB_PATH=/opt/my-service-assets/seed.db
# docker-compose.yml passes env: SEED_DB_PATH=/opt/my-service-assets/seed.db
```

---

## Code-review checklist — REJECT if PR adds:

- `RUN mkdir -p /app/data/<subpath>` in a service mounting `market_data:/app/data` without
  PR-description justification (runtime-mutable state, no seeded content).
- `COPY ... /app/data/` in any service with a named volume on that path.
- A new named-volume mountpoint overlapping an existing `RUN`/`COPY` target.

**Resolution:** move baked content to `/opt/<service>-assets/` + expose via env var.

Audit ref: `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` · Runbook: `docs/protocols/docker-deployment-runbook.md`
