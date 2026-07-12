# Incident Report: Cloudflare Tunnel Push-Delivery Outage — Root-Cause Analysis

**Outage window**: 2026-07-04T19:47:07Z → 2026-07-07T16:46Z (~69h)
**Detected/recovered**: self-recovered, coincident with mcp-server container restart 2026-07-07T16:42:17Z
**Agent**: ops (RCA), dispatched by dev-team cron tick 2026-07-12T14:07Z
**Task**: INFRA-CLOUDFLARE-TUNNEL-OUTAGE-ROOT-CAUSE (P1/S, zone=infra, owner=ops)
**Status**: 🟢 ROOT-CAUSE COMPLETE — hardening spun out to FIX-PUSH-DELIVERY-ERROR-RATE-ALERT
**Confidence**: MEDIUM (root cause inferred; direct tunnel logs from the window were rotated)

---

## 1. Root Cause (best-supported hypothesis)

**Cloudflare Tunnel connection-pool exhaustion / stall, likely triggered by mcp-server resource contention.** A tunnel-layer failure, **not** an application-logic defect.

**Evidence:**
- **Error signature:** all VPS push endpoints (news, SBV rates, foreign-flow, prices) failed *simultaneously* with Cloudflare error `1033` ("origin unreachable") + HTTP 530/502, starting 2026-07-04T19:47:07Z.
- **Duration:** exactly ~69h — suspiciously round; points to a stalled process / stuck connection state rather than transient network flakiness.
- **Code causality ruled out:** a major refactor (commit `821bbbeea`, "extract macro/news VPS-push routes → macroPushHandler") deployed during the window was RAW-verified clean (26/26 tests, `tsc` exit 0). The outage hit ALL routes with a tunnel-layer signature, not a handler-layer one. The June-1 tunnel reroute fix (`/api/* → localhost:3000`) was verified still in place; no ops config drift in git log.
- **Recovery event:** mcp-server container restarted 2026-07-07T16:42:17Z; tunnel connectivity recovered ~16:46Z. Hypothesis: the restart freed local socket/connection-pool resources that cloudflared was exhausting or deadlocked on, letting the tunnel re-establish.
- **Secondary:** the cloudflared process itself may have crashed/stalled/hit a connection limit; the container restart forced a reconnect.

## 2. Hardening / Detection Recommendation → FIX-PUSH-DELIVERY-ERROR-RATE-ALERT

Catches a recurrence in ~10 min instead of 69h.

| Aspect | Specification |
|---|---|
| Metric | Push-endpoint 5xx ratio `(5xx)/(total)` over a 5-min window |
| Scope | `/api/push-news`, `/api/push-prices`, `/api/push-sbv-rates`, `/api/push-foreign-flow` + any future `/api/push-*` |
| Owner service | **alert-engine** (consuming mcp-server `/metrics`) |
| Threshold | P1 alert if error rate ≥ 5% for ≥ 5 consecutive minutes |
| Instrumentation | `apps/mcp-server/src/interface/metrics.ts` — add `push_delivery_errors` + `push_delivery_total` counters in each `/api/push-*` handler |
| Alert rule | alert-engine config (target file TBD by dev-alert-engine); channel `#ops`; optional auto-mint INFRA-PUSH-DELIVERY-OUTAGE-DETECTED |
| Recovery runbook | (1) check CF dashboard tunnel status + container health; (2) if tunnel stalled, `docker restart mcp-server` / tunnel reconnect; (3) if >15 min, hard-restart stack (user-gated per swap policy). |

**Secondary monitoring:** synthetic tunnel-roundtrip probe (`curl https://zenmidi.com/api/health`) via headroom-proxy; track local TCP conns to `127.0.0.1:7844` (cloudflared listener) for pool anomalies.

## 3. Confidence & Data Gaps

- **Confidence: MEDIUM** — temporal sequence (refactor → 69h stall → restart → recovery) is clear; root cause inferred from error signature + duration pattern + recovery coincidence.
- **Gaps:** Cloudflare tunnel logs rotated (>3 days off-host); mcp-server container logs from the window unavailable (would confirm a connection leak); no pre-outage CF dashboard snapshot; restart→recovery causality is correlational, not proven.
- **Mitigation:** the FIX above gives full observability so any future incident of this class trips an alert in minutes rather than degrading silently for days.

---

*Findings produced by ops (Bash/Read/gateway; no Write tool); persisted by dev-team dispatcher at close of tick 2026-07-12T14:07Z.*
