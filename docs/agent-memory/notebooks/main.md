# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-11 16:24 UTC (Cycle 29 close — IDLE)

## Cycle 29 (2026-05-11 16:23 → 16:24 UTC)

| Step | Action | Result |
|------|--------|--------|
| 0a Drain | 8 signals at root (architect ×2, ssot-audit, sa memory-pointers, sa arch-ssot-rerun, tnb ×3) | ALL marked `skipped-duplicate-replay` (-c29-replay suffix); originals removed from `docs/signals/` |
| 0b Resume | pipeline-state `idle`, sprint=1872a | fall through to Step 1 |
| 1 PO Triage | TASKS.md Todo: 4 rows all ops/container-rebuild blocked; 0 new Telegram reports; 0 effective pending signals | NOTHING |
| 4 Scan | stale branch `task/1872a-5-api-gateway-wording` 4 unmerged commits, content stale (older tree-map version than main from 1872a-1) | per flow rule unmerged>0 → report-only to WORK |
| 4 Scan | NEW untracked brief `docs/architecture-briefs/ssot-team-tools-2026-05-11.md` (agents-architect, no associated signal) | flagged in WORK; awaits signal-emission for PO routing |
| Close | WORK notified, pipeline reset | EXIT idle |

## Operational notes (cycle 29)

1. **Cycle 28 process bug uncovered** — the cycle 28 drainer COPIED signals into `docs/signals/processed/` (commit 234a69b3 only had insertions, zero deletions). Originals stayed at root. When cron fired for cycle 29 the same 8 signals re-appeared. Fixed this cycle by explicit `os.remove(src)` after write to processed/. **Action item for cycle 30+:** verify drainer always moves (copy + delete), not just copy.

2. **Fingerprint algorithm divergence** — current algo `sha256(from + type + JSON.stringify(payload) + createdAt)` produces different fingerprints than cycle 28's stored fingerprints (different field-extraction logic for signals using `source`/`signalType`/`timestamp` field names). 4 of 8 matched cycle 27 fingerprints; 4 did not. All 8 were verified as duplicates by inspection (tasks 1871a-g, 1872a-1..7, TNB-c36-2..6 all DONE in TASKS.md). Issue is cosmetic but worth normalizing in a future flow tweak.

3. **Stale branch deferred again** — `task/1872a-5-api-gateway-wording` cannot be auto-cleaned per current flow (unmerged>0 → report-only). Cycle 28's "empty diff" claim was wrong: real diff shows branch carries older state including a less-expanded tree-map than main's 1872a-1 merge. The branch productive content (api-gateway wording) was re-implemented via main merge 172dfb0e. Recommend user/PO authorize `git branch -D` next cycle.

4. **Untracked architect brief** — `docs/architecture-briefs/ssot-team-tools-2026-05-11.md` (~325 lines) proposes consolidation of Team Formation duplication (AI_TEAM_DESIGN.md + agent-roster.md + global.md) and Tools/Routing duplication (CLAUDE.md → new agent-routing.md). Net ~-20 lines. No signal emitted → not routed. agents-architect or PO should commit + emit `architect-2026-05-11-ssot-team-tools.json` signal to route.

## Todo state (unchanged 4 rows; all ops/rebuild-blocked)

- 1862c-D (OPS Cloudflare ingress route /vn-market/mcp)
- 1862c-E (OPS SSE keepAliveTimeout 30s→300s)
- 1862c-F (FIX SseSessionManager — blocked by container-rebuild after D/E stable 5 cycles)
- 1876a-A5 (OPS re-deploy 1869b-seed migration on prod DB)

## Next cycle (30) intent

- Re-drain (none expected; all known signals processed)
- If ops worker free: pick up 1862c-D + 1862c-E pair (no-rebuild, 1 cloudflared reload)
- If user authorizes: CLEAN `task/1872a-5-api-gateway-wording` via `git branch -D` + `git push origin --delete`
- If new SSOT-team-tools signal arrives: route to PO for triage
- Verify drainer move semantics (root file actually removed after process)

## Carry-forward from cycle 28

- ✅ Cycle 28 sprint work verified live in main (no regressions; 1872a-1..7 all merged)
- ✅ Cycle 28 commits intact: 9f379f9e (notebook+pipeline) + 234a69b3 (brief+signals+report)
- ❌ Cycle 28 drainer left originals at root (this cycle fixed)
