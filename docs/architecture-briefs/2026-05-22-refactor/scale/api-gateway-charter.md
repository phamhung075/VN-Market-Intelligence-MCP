---
title: "Scale Charter — api-gateway"
date: "2026-05-24"
author: "po"
status: "READY"
service: "api-gateway"
owner: "dev-api-gateway"
language: "Go"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `api-gateway`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `api-gateway` for `technical-analysis` and `dev-api-gateway` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking:** `docs/data/refactor-status-api-gateway.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-api-gateway` |
| **Language** | Go (already Go) |
| **Anti-scope-creep boundary** | `apps/api-gateway/` ONLY. |

### Current state — CLEAN GO, THIN DOMAIN (routing/proxy)

`apps/api-gateway/` is clean Go (`go.mod`, `pkg/{domain,application,infrastructure,interface}`, `cmd/server`). **No `pkg/primitive/` and no `pkg/module/`** — by design: a gateway is mostly routing, request fan-out, and response aggregation, not domain computation.

This is the **lowest-domain-logic service** in the rollout. The three-tier metaphor applies thinly:
- **Primitives (G1)** — few and routing-flavored: e.g. `route-resolver`, `upstream-selector`, `response-merger`, `auth-header-validator`. Expect 3–5 small primitives, not the 5–8 domain-rich set the pilot had. Document in `refactor-status` if a primitive genuinely has no meaningful failure scenario (rare).
- **Module (G2)** — likely a single `gateway` module composing the routing primitives, or G2 may be lighter-touch here. Architect to confirm the module boundary during phase expansion.
- **Composition root (G3)** — gateway is already mostly composition root; the win is making routing rules declarative and the wiring auditable.

### Key risks
1. **Over-fitting the pilot.** The pilot was domain-heavy (RSI/MACD math). A gateway is I/O orchestration. Do NOT manufacture artificial "primitives" to hit a count — extract only genuine pure-function units (header parsing, route matching, merge logic). Honest G1 here may be 3 primitives, and that is correct.
2. **Dashboard meaning (G6–G9).** The trust dashboard for a gateway demonstrates "routing rule X resolves to upstream Y" rather than "RSI computed correctly". Keep the narrative honest to what a gateway does.
3. **Cross-service contract surface.** The gateway is the single MCP-facing interface; a primitive/route regression has the widest blast radius of any service. G11 regression-canary is especially important here.

### Sequencing note
Because the gateway routes to every other service, schedule it AFTER at least one upstream Go service (macro) has its dashboard, so the gateway's integration story has a real upstream to point at. Not RUN-SOLO, but not first.
