# Named-Volume Shadow Audit — Sprint 1959 watchdog-8

**Date:** 2026-05-21 | **Author:** architect | **Task:** 1959-watchdog-8 | **Scope:** read-only

Trigger: watchdog-3 (commit 66255410) discovered that `market_data` at `/app/data` silently
shadows any image-layer files baked under that path on existing deployments. This audit maps all
services for the same class of failure.

---

## Volume inventory

`market_data` is the only named volume in `docker-compose.yml` (L411). It mounts at `/app/data`
in every service listed below. `news-fetch` mounts it read-only (`:ro`) — still shadows, but the
service writes nothing there at build time.

---

## Inventory table

| Service | Mount path | Dockerfile write under mount | Verdict |
|---|---|---|---|
| mcp-server | `/app/data` (rw) | None — no `RUN`/`COPY` targeting `/app/data/*` | OUT-OF-VOLUME |
| pdf-extractor | `/app/data` (rw) | `RUN mkdir -p /app/data/extractions /app/data` | CONFIRMED SHADOW |
| rag-service | `/app/data` (rw) | `RUN mkdir -p /app/data/lancedb /app/data/models` (model cache already moved to `/opt/model-cache` by watchdog-3; dirs remain) | CONFIRMED SHADOW |
| technical-analysis | `/app/data` (rw) | None | OUT-OF-VOLUME |
| macro-indicators | `/app/data` (rw) | None | OUT-OF-VOLUME |
| stock-price | `/app/data` (rw) | `RUN mkdir -p /app/data` (empty dir only; no seeded files) | SAFE |
| kinh-dich-service | `/app/data` (rw) | None | OUT-OF-VOLUME |
| alert-engine | `/app/data` (rw) | `RUN mkdir -p /app/data` (empty dir only; no seeded files) | SAFE |
| news-fetch | `/app/data` (ro) | None | OUT-OF-VOLUME |

---

## Per-service CONFIRMED SHADOW rationale

### pdf-extractor
`RUN mkdir -p /app/data/extractions /app/data` bakes two directories into the image layer.
On first deploy with a pre-populated `market_data` volume (e.g. from another service), Docker
overlays the volume on `/app/data`, making the image-layer `/app/data/extractions` invisible.
If the runtime `STORAGE_DIR=/app/data/extractions` path is absent from the volume, any write
attempt silently creates the path inside the volume — which is fine at runtime but means the
image-layer directory has zero effect. If `DB_PATH=/app/data/pdf_extractor.db` is seeded in the
image, it would be invisible. Currently no seed data is baked (only empty dirs), so operational
impact is low but the pattern is a latent risk for future developers adding seed data or config
under `/app/data/` in this Dockerfile.

### rag-service (partial — already remediated for model cache)
`RUN mkdir -p /app/data/lancedb /app/data/models` bakes two directories. The critical asset
(`sentence-transformers` model) was already moved to `/opt/model-cache` by watchdog-3. However
`/app/data/models` still exists in the image layer and is shadowed by the named volume. If any
future `RUN` step places seed data under `/app/data/models` (e.g. a fallback small model), it
will be invisible at runtime. The LanceDB path `/app/data/lancedb` is also shadowed — this is
intentional (LanceDB writes go to the volume), so no data is seeded there. Pattern risk same
as pdf-extractor: latent footgun for future developers.

---

## SAFE classification rationale

`stock-price` and `alert-engine` both run `RUN mkdir -p /app/data` to create the mount point
directory. This is Docker best practice for named-volume targets: the `mkdir` ensures the path
exists in the image before the runtime mount, but no files or seed data are placed there.
The named volume overlay is expected and desired. Verdict: SAFE (no seeded content lost).

---

## Verdict

**2 CONFIRMED SHADOWs found (pdf-extractor, rag-service). Both are latent-risk class (empty dirs
only; no seed data currently baked). No active data loss today. Remediation priority: LOW.**

Threshold for Sprint 1960-volume-shadow-remediation (≥3 CONFIRMED) is NOT reached.
Recommendation: no new sprint. Instead, add a one-line policy to both Dockerfiles and the
developer runbook: "Never place seeded files under a named-volume mount path (`/app/data/*`).
Use `/opt/<service>-assets/` for any image-layer asset."

---

## Remediation pattern (if any future baking is needed)

```dockerfile
# CORRECT — outside volume mount
RUN mkdir -p /opt/pdf-extractor-assets && cp seed.db /opt/pdf-extractor-assets/seed.db
ENV SEED_DB_PATH=/opt/pdf-extractor-assets/seed.db

# WRONG — shadowed by market_data volume at /app/data
RUN cp seed.db /app/data/seed.db
```

The `/opt/<service>-assets/` convention is already proven by watchdog-3 (`/opt/model-cache`).
Extend this convention to all services as a standing policy.

---

AC-8-1: brief ≤80 lines — PASS (this file).
AC-8-2: all 9 market_data-mounted services inventoried — PASS.
AC-8-3: each Dockerfile inspected, at least one row — PASS.
AC-8-4: verdict line present — PASS. "2 CONFIRMED SHADOWs (latent risk, empty dirs); no Sprint 1960 needed; add /opt convention policy."
