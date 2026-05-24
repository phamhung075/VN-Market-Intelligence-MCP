---
task_id: P2-KD-H
title: "G5 Evidence Summary — Zero TODO.*migrat Audit + G5b Rewire Confirmation"
authored_by: qa
date: 2026-05-24
---

## G5 Evidence Summary

### G5a — Deprecated path (git mv, P2-KD-F, commit 5641f2a1)

- `g5a_deprecated_path: apps/kinh-dich-service/src/_deprecated/services_v1.ts`
- File present at that path; original `domain/services.ts` location no longer exists (atomic git mv confirmed by commit 5641f2a1).
- No orphaned original.

### G5b — MCP→HTTP Rewire (P2-KD-G, commit 6fc7b6b3)

- `g5b_zero_direct_domain_imports: YES`
  - `grep -rn "from.*kinhDich|from.*hexagramLibrary|from.*hexagramBacktester" apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` → 0 matches (AC-3 PASS)
- `g5b_http_client_present: YES`
  - `grep -n "5005|kinh-dich-service|KINH_DICH_URL" apps/mcp-server/src/infrastructure/microservices/clients.ts` → 2 matches:
    - Line 12: `kinh-dich-service (5005): hexagram readings`
    - Line 27: `kinhDich: Bun.env.KINH_DICH_URL ?? 'http://localhost:5005'`
- `g5b_http_port: 5005`
- `g5b_new_endpoints`:
  - `/readings/{code}/history`
  - `/hexagram/{number}/transitions`
  - `/backtest/{code}`
  - `/hexagram/{number}/explain`

### G5c — Zero TODO.*migrat (this audit, P2-KD-H)

- `g5c_zero_todo_migrat: YES`
  - AC-1: `grep -rniE "TODO.*migrat" apps/kinh-dich-service/src apps/mcp-server/src/interface/mcp/tools/kinhdich` → 0 matches (PASS)
  - AC-2: `grep -rniE "TODO.*migrat" apps/kinh-dich-service/src/_deprecated/` → 0 matches (PASS)

## Verdict

- `g5_ready_to_grade: YES`
- Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` is ancestor of HEAD — confirmed.
- No SSOT or foreign paths touched.
