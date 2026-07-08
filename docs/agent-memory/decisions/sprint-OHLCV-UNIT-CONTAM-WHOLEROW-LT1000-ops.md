# Decision Journal: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 ops swap

**Agent:** ops  
**Task ID:** CONTAM-10-WRITER-H  
**Timestamp:** 2026-07-08T04:16:51+02:00  
**Image ID:** 4c8ea4cfd41f

## Decision
Deployed gated live-container swap: image `4c8ea4cfd41f` (dev-mcp-server fix commit 2a3c9fd45, QA-APPROVED) replaces prior image `d61c83a939a3` in running mcp-server container.

**Swap executed at:** 2026-07-08T04:16:51+02:00 UTC+02:00  
**Command:** `docker compose up -d mcp-server`  
**Outcome:** SUCCESS

## Verification Steps Completed

1. **Pre-swap image registry**: Confirmed built image `4c8ea4cfd41f` present via `docker images`
2. **Pre-swap container health**: Baseline captured—all peers (api-gateway, news-fetch, mcp-gateway) UP 10+ hours, healthy
3. **Swap execution**: `docker compose up -d mcp-server` → Container Recreated + Started
4. **Post-swap image verification** (critical per standing lesson):
   - Container image ID (docker inspect): `sha256:4c8ea4cfd41f...` ✓
   - Matches built image exactly
   - NOT a stale cached layer
5. **Post-swap container health**: Transitioned to healthy within 16 seconds ✓
6. **Post-swap peer integrity**: All peers remain UP with 10+ hour uptime (no recreation, no disruption) ✓
7. **Startup logs**: Bootstrap complete, scheduler active, no errors; expected foreign-flow warnings present

## What Was Considered

**(A) Wait for separate live-probe session before swap** — REJECTED  
Reason: Task design mandates ops performs the swap independently; QA probe happens post-swap (separation of duties).

**(B) Force-recreate all services to validate isolation** — REJECTED  
Reason: Standing lesson documents: `down && up` kills peers; `up -d <service>` only touches target service. Spec compliance requires minimal peer disruption. Verify via uptime retention, not forceful recreation.

**(C) Swap via docker-image tag repoint instead of compose up -d** — REJECTED  
Reason: docker-compose.yml is the SSOT for service definitions; using compose ensures schema consistency and predictable container naming.

## Why This Change
- **QA APPROVED** the fix (code + tests + security checks + independent RAW-probe) and explicitly gated the swap to ops
- **Standing repo policy** (`docs/policies/commit-convention.md`): user operations are ops-gated; dev-mcp-server implements, QA verifies, ops deploys, QA re-verifies post-deploy
- **CONTAM-10** is a P0 whole-row contamination leak actively affecting OHLCV writer; fix is load-bearing for data integrity
- **Image validated** via docker inspect (not trust docker compose exit code alone, per standing lesson)

## Next Steps
Handoff to QA agent (`qa`) via `.head.next_agent = "qa"` in orch-state.  
QA will:
1. Execute live-gateway RAW-probe against POST /api/push-ohlcv-history (real HTTP, isolated instance)
2. Verify contaminated batches now correct to the right scale
3. Flip CONTAM-10-WRITER-H to done_verified if probe passes
4. Unblock CONTAM-10-EXEC-2 (executor batch cleanup)

**Blocking dependencies resolved:** None — swap is independent. QA probe is the next gate.
