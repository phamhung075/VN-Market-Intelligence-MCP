# AR-OPS-PRE — Docker Volume & Env Setup (PREREQ)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** ops | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** None | **Blocks:** AR-PDF, AR-MCP

---

## Summary

Configure Docker Compose for the refine orchestration pipeline. Both pdf-extractor and mcp-server need shared volume mount and environment variables for refine parameters.

**Scope:** docker-compose.yml only. No code changes. This is a prerequisite — must complete before dev zones spin up tests.

---

## Acceptance Criteria

### AC-OPS-1: Named Volume Mount
- [ ] Add named volume `bctc-page-images` to `docker-compose.yml` `volumes:` section.
- [ ] Mount path in **pdf-extractor** service: `/data/bctc-page-images` (write path for `page_rasterizer.py`).
- [ ] Mount path in **mcp-server** service: `/data/bctc-page-images` (read path for `get_bctc_page_image`).
- [ ] Volume persists across container restarts (named volume, not tmpfs).

### AC-OPS-2: Refine Cron Schedule
- [ ] Add `bctcRefineJob` cron entry to mcp-server service env block: `'0 9,14,20 * * *'` UTC (09:00, 14:00, 20:00 UTC).
- [ ] Verify all three times are outside OFF-HOSE window (02:00–08:59 UTC Mon–Fri). ✓ All pass.

### AC-OPS-3: Refine Environment Variables
- [ ] Add to mcp-server service env block:
  - `REFINE_FANOUT_CONCURRENCY=5` (max parallel Haiku subagents per report; configurable via env)
  - `REFINE_WINDOW_TIMEOUT_S=120` (per-window timeout in seconds)
  - `REFINE_MAX_WINDOW_PAGES=3` (max pages per continuation window before treating as truncated)
- [ ] Add to pdf-extractor service env block:
  - `BCTC_RASTER_DPI=150` (image DPI; architect default, may be overridden by QA bake-off)
  - `BCTC_PAGE_TEXT_BACKEND=sqlite` (OCR text source; default `sqlite`, future swap to `mistral`)

### AC-OPS-4: Verify docker-compose.yml Syntax
- [ ] Run `docker-compose config > /dev/null` to validate YAML syntax.
- [ ] No unresolved env var references.

---

## Files to Modify

| File | Change |
|---|---|
| `docker-compose.yml` | Add `bctc-page-images` volume; mount in pdf-extractor + mcp-server; add env vars |

---

## Implementation Notes

**Named volume pattern:**
```yaml
volumes:
  bctc-page-images:
    driver: local
```

**Service mount pattern:**
```yaml
services:
  pdf-extractor:
    volumes:
      - bctc-page-images:/data/bctc-page-images
  mcp-server:
    volumes:
      - bctc-page-images:/data/bctc-page-images
```

**Env var block:**
```yaml
environment:
  # Refine cron schedule (0 9,14,20 = UTC 09:00, 14:00, 20:00)
  REFINE_FANOUT_CONCURRENCY: "5"
  REFINE_WINDOW_TIMEOUT_S: "120"
  REFINE_MAX_WINDOW_PAGES: "3"
  BCTC_RASTER_DPI: "150"
  BCTC_PAGE_TEXT_BACKEND: "sqlite"
```

---

## Exit Criteria

- [x] AC-OPS-1: Volume mounted in both services.
- [x] AC-OPS-2: Cron schedule valid (outside OFF-HOSE).
- [x] AC-OPS-3: All refine env vars present.
- [x] AC-OPS-4: `docker-compose config` passes.
- [x] AR-PDF and AR-MCP can proceed to build.

---

## Non-Negotiables

- **main branch only.** No feature branches.
- **Explicit `git add docker-compose.yml`** — never `-A`.
- **Syntax validation** — `docker-compose config` must pass.
- **Volume persists** — verify on next restart that `docker volume ls` shows `*_bctc-page-images`.

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§8, §0.6.6)
- Cron policy: `docs/protocols/off-hose-cron-policy.md`
- DDD: infrastructure layer (docker/ops scope)

---

## RETURN

```
TASK: AR-OPS-PRE
STATUS: READY FOR ASSIGNMENT
OWNER: ops
BLOCKERS: None
BLOCKS: [AR-PDF, AR-MCP] — unblock upon docker-compose validation
ESTIMATED: 30 min
NEXT: AR-PDF or AR-MCP (parallel after this completes)
```
