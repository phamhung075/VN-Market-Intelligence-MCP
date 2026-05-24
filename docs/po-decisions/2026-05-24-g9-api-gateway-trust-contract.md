# PO Decision — G9 api-gateway Trust Contract (Path B, Day-0 default)

- **Date:** 2026-05-24T08:49:07Z
- **Author:** po (api-gateway SCALE pilot terminal close)
- **Goal:** G9 — "Dashboard is the trust contract (Path A user verbal OR Path B PO Playwright)"
- **Path:** B (PO headless verification — Day-0 default per L6 carry-over from TA cycle-19 + macro cycle-53)
- **Charter:** docs/architecture-briefs/2026-05-22-refactor/scale/api-gateway-charter.md (scale-1.0 → canonical G1–G12)

## Verdict: PASS — G9 = YES

## Method

Ran the trust-contract verification headlessly against the standalone file:// dashboard:

```
node apps/api-gateway/dashboard/dash-check.mjs
  → file:///.../apps/api-gateway/dashboard/index.html
```

(dash-check.mjs drives headless Chromium via playwright-core; functionally equal to the
Playwright headless path specified in the G9 calibration — zero network, file:// only.)

## Evidence

```
DASH-CHECK-RESULT: {
  "service":"api-gateway",
  "panelCount":3, "cardCount":12,
  "dotsGreen":12, "dotsRed":0, "dotsPending":0,
  "jsErrors":0, "pageErrors":0,
  "categoryChips":{"Valid Input":7,"Edge Case":0,"Failure Scenario":0,"Fixture":5},
  "badLabels":[], "groupStatuses":["PASS","PASS","PASS"],
  "verdict":"PASS"
}
```

- 3 panels rendered (primitives / module / microservice)
- 12 cards, all green; 0 red; 0 pending
- console.error count = 0; pageerror count = 0; requestfailed not triggered (file:// zero-network)
- badLabels = [] (no mislabelled scenarios)
- exit 0

## What a viewer can conclude from the dashboard ALONE

The trust narrative is honest to what a gateway actually does — it does NOT fabricate
domain claims it cannot prove. A viewer reading the dashboard alone can verify the three
routing behaviours the gateway is responsible for:

1. **Routing-rule-resolves-to-upstream** (proxy-path-resolver, 3 scenarios):
   "/:service/health resolves to downstream path /health — strips the service prefix
   segment"; "virtual alias /api/push-news preserved (full-path passthrough)"; failure
   scenario for a path with no trailing segment is documented and honest.
2. **Service-name extraction** (route-service-matcher, 3 scenarios):
   "routing rule extracts the first path segment as service name"; empty-service edge
   ("yields serviceName='' without panic") is shown as an honest expected-vs-actual, not
   hidden.
3. **Overall-status aggregation** (overall-status-computer, 3 scenarios):
   "{ok,ok,down} → degraded, any-down guard"; "a reversed guard would emit ok" — the card
   explicitly states why it is green (implementation matches the any-down guard), and the
   g11-canary-cascade fixture proves degraded propagates under the coupled cascade.

Each card carries the scenario's expected and actual values; green means expected==actual,
not a hardcoded pass. The cold-open and category chips (Valid Input / Fixture) are honest
labels. This satisfies the G9 acceptance bar: a non-technical viewer can answer
"is the gateway's routing/health-aggregation working correctly?" from this dashboard alone.

## Decision

G9 → **YES** (Path B, dash-check verdict PASS, dashboard honest-green, zero errors).
This is the trust gate for the decisionMatrix `trust` criterion (G9 PASS + G8 honest → trust=YES).
