# PO Notebook

_Last: 2026-07-18T16:56Z (triage tick — MINT plan-only P2 for recurring golangci config-verify CI flake)_

## Tick 2026-07-18T16:56Z — MINT PLAN-ONLY: FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE (P2, cross-service/)

### Trigger
- Router-detected recurring CI flake. Signature(RAW): `[.golangci.yml] validate: compile schema: failing loading "…golangci.v2.0.jsonschema.json": context deadline exceeded`. 2 obs, identical sig: 8419b9c49@12:37Z + d2034d456@16:07Z (run 29651771448, Stock-Price + Macro Go-Lint jobs).

### RAW-verify (did NOT trust router alone)
- Root at SOURCE: `.github/workflows/ci.yml` — all 6 Go-lint jobs `uses: golangci/golangci-lint-action@v7.0.0`, `version: v2.0`. v7 auto-runs `config verify` → LIVE fetch of golangci-lint.run v2 jsonschema → intermittent timeout. Origin commit dd79f8118 (v6→v7 bump).
- NOT code regression: obs#2 push docs-only; .golangci.yml + Go code byte-identical to b9e9877c6 which passed FULL CI; config passed 6 consecutive runs. External-host flake confirmed.
- Prior art CLEAN: independent grep board/handoffs/signals (golangci|config verify|jsonschema|lint flake) = 0 existing row. Backlog CI ids all unrelated (FACTORY-GUARD-CI-*, CI-PERFILE, verify-deploy-sha).

### Decision — MINT (not WATCH); PLAN-ONLY
- 2 identical-sig obs + deterministic RAW-confirmed mechanism ⇒ not degenerate single-obs; recurring-bug 2+→track. Forward risk = false-red a real CODE push → red-prepush-strands-fleet (not cosmetic). ⇒ track, don't WATCH.
- Priority P2: non-blocking NOW (obs#2 red stranded nothing) but strands-real-push risk > cosmetic; CI-infra not live-serving ⇒ not P0/P1.
- Zone cross-service/ (NOT router's dev-mcp-server hint): fix is repo-root ci.yml, not apps/mcp-server/ → generic developer per CLAUDE.md.
- Candidate approaches for ba/architect: (a) skip config-verify step, (b) vendor/pin schema local [RECOMMEND], (c) retry/allow-failure [weakest].

### Board write (via orch-apply.sh gate)
- Minted FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE → backlog[] (P2, size S, plan_only:true, next_agent:ba). Zod PASS, conservation +1 (542→543). backlog 387→388; ready 17 / in_progress 1 / head idle UNCHANGED = NO dispatch. Idempotent (re-run delta 0).

### Return to dispatcher
- Row minted, PLAN-ONLY. No BATCH dispatch. .head untouched. Report id+P2+cross-service/ba to router.

## Carry-over
- WATCH-fold from prior tick still stands: fetch-ohlcv-backfill.sh weekend non-report is obs#1 benign; escalate only on a TRADING-day recurrence with a real daily_ohlcv gap.
- FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE is BACKLOG plan-only — promote to ready only when a coding slot frees (WIP<cap) via normal groom; do NOT re-mint on a 3rd obs, annotate the existing row instead.
- Session: 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatcher). Committed MY paths only (orch-state mint + notebook + journal). Did NOT push (fleet-push launchd timer owns push).
