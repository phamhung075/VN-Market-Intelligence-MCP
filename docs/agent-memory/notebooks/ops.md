# Ops — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1839b

## Last session summary

No active ops incident this sprint. System stable: all 9 Docker services running, VPS Vinahost geo-blocked proxy operational. SQLite named-volume fix (Sprint 1336) preventing corruption.

## Known patterns / preferences

- VPS Vinahost (Vietnam) is the proxy for ALL geo-blocked VN sources: prices (HOSE/HNX/UPCOM), BCTC PDFs, news, SBV FX rates, foreign flow data. Never attempt to fetch these directly from non-VN IP.
- BCTC pipeline is PULL-based (since 2026-04-27): mcp-server pulls from `VPS:8765/bctc-files/` and saves to `/app/data/pdfs/`. Extraction runs via `bctcReparseJob`. Do not push from VPS side.
- SQLite corruption root cause (fixed Sprint 1336): macOS Docker VirtualMachine process tears SHM on container stop. Fix = named volume (not bind-mount) for all SQLite databases. Never revert to bind-mount for db files.
- Database isolation: `alert-engine.db` and `stock_price.db` are on separate named volumes (Sprint 1331). A corruption in one does not cascade to the other.
- Docker restart command: `cd $PROJECT_ROOT && docker-compose down && docker-compose up -d`. NEVER use `bun --hot`, `bun --watch`, or `pm2`.
- WAL file > 50MB is a flag worth investigating. Normal is < 10MB. Run `PRAGMA wal_checkpoint(FULL)` to flush.
- Use `trigger_bctc_vps_fetch(dry_run=true)` first to diagnose before live fetch. Check `failed[].reason` in response.

## Carry-over for next session

- Monitor VPS disk usage — BCTC PDF accumulation may require periodic cleanup of processed PDFs older than 90 days.
