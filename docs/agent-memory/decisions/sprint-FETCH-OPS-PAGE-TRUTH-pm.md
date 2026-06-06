# FETCH-OPS-PAGE-TRUTH — PM Decision Journal

**Sprint:** FETCH-OPS-PAGE-TRUTH  
**PM cycle:** 2026-06-06T21:35:00Z  
**Architect handoff:** FETCH-OPS-PAGE-TRUTH-ARCH.md  
**Tasks registered:** 4 (F-1, F-2, F-3, F-4)

---

## Context

Architect delivered a 4-zone blueprint (handoff doc):
- F-1: mcp-server news filter fix + new fetch-status endpoint (M, blocker for F-3)
- F-2: macro-indicators remove fake latency (XS, independent)
- F-3: frontend redesign panels to use real sources (M, depends F-1)
- F-4: api-gateway /mcp/* duality SPIKE (SPIKE, deferrable, depends F-1 but doesn't block F-3)

---

## Decomposition Decisions

### D-1: WIP Sequencing — Batch 1 (F-1 + F-2 parallel), Batch 2 (F-3 after F-1), Batch 3 (F-4 parallel or deferred)

**Rationale:**
- F-1 and F-2 are **independent zones** (mcp-server vs macro-indicators) with no shared files or SSOT writes.
- F-3 **depends on F-1** shipping (needs new `/api/fetch-status` endpoint).
- F-4 is a **SPIKE with 4h timebox** and **deferrable** (doesn't block user-facing F-3; F-3 uses `/api/` paths, not `/mcp/*`).
- **WIP cap = 2** per PM init.md mandate.

**Decision:** Dispatch Batch 1 (F-1 + F-2) immediately; after F-1 DONE, dispatch F-3; F-4 can run in parallel with F-3 if scope is confirmed ≤4h, else defer to own sprint.

**Risk:** None — standard dependency ordering.

---

### D-2: F-1 Scope — Minimize to 2 fixes (filter + endpoint)

**Rationale:**
- Architect identified 3 issues in mcp-server: (a) false-positive filter, (b) missing fetch-status endpoint, (c) part of the gateway duality (F-4).
- PM decision: **F-1 focuses on (a) + (b) only**. Do NOT try to fix the gateway duality inside F-1; that is F-4's scope.
- F-1 registers the new endpoint at `/api/fetch-status` (plain `/api/`, not `/mcp/api/`). This unblocks F-3 and avoids the gateway duality path entirely for the new endpoint.

**Decision:** F-1 = domain-anchor LIKE filters + new fetch-status endpoint. DONE when both are shipped and containerized.

**Risk:** Low — both changes are orthogonal.

---

### D-3: F-2 Scope — Delete fake field, not attempt real latency measurement

**Rationale:**
- Architect noted: macro-indicators reads from SQLite (cached), no live HTTP calls → real latency is not available.
- F-2 decision: **Remove `totalLatencyMs: 0` entirely**. Do NOT attempt to measure real latency (out of scope; would require significant refactoring).
- Frontend already guards with `!== undefined`, so removal is safe.

**Decision:** F-2 = deletion only, no measurement. Ship.

**Risk:** Acceptable — the field was fake anyway.

---

### D-4: F-3 Scope — Use new GET /api/fetch-status (NOT system-map.json)

**Rationale:**
- Architect design decision D-1 states: source list must come from GET /api/fetch-status, not system-map.json.
- Reason: system-map.json contains 28 entries (non-crawled sources like `bctc-discover`, `muasamcong`, `sbv-vps`, `fred`). The endpoint narrows to only sources with actual `rag_analyses` rows.
- This is the ground truth.

**Decision:** F-3 loader calls `fetchFetchStatus()` (new client fn); component iterates over `sources[]` array from response; zero hardcoded source names in JSX.

**Risk:** Low — endpoint is the source of truth by design.

---

### D-5: F-4 Scope — Additive alias-only approach (safest for SPIKE)

**Rationale:**
- F-4 is a SPIKE with 4h timebox. The 3 options are:
  1. **Additive alias:** Add `/api/*` routes alongside `/mcp/api/*` (both paths work, no deletion). ~30–60 min.
  2. **Full cleanup:** Remove `/mcp/api/*` routes, update rerouter, retarget all paths. ~2–4h.
  3. **Defer:** Push to own sprint, F-3 ships without F-4 fix.

- Architect recommended additive alias as safest.
- F-3 does NOT need F-4 to ship (F-3 uses `/api/fetch-status`, not `/mcp/*` paths).

**Decision:** F-4 owner (dev-api-gateway) measures scope on alias-only approach first. If feasible in 1–2h, ship additive aliases. If overrun or issues found, escalate to PM, don't ship, note deferral.

**Risk:** Minimal — alias-only is backward-compatible. Full cleanup can always be attempted separately.

---

### D-6: Handoff Files — One per task (F-1, F-2, F-3, F-4)

**Rationale:**
- PM init.md mandate: "Handoff file created per task with file paths, deps, acceptance criteria."
- 4 tasks → 4 handoff files.

**Decision:** Created F-1-mcp-server.md, F-2-macro-indicators.md, F-3-frontend.md, F-4-api-gateway-spike.md in docs/handoffs/.

**Risk:** None — standard practice.

---

### D-7: orch-state.json — Register Batch 1 as in_progress

**Rationale:**
- PM init.md mandate: ".task_board as SSOT, .head reflects current in_progress state."
- Batch 1 (F-1 + F-2) is dispatched immediately, so they are in_progress.

**Decision:** Set `.head = { in_progress: ["F-1", "F-2"], next_agent: "dev-mcp-server|dev-macro-indicators", wip_count: 2 }`.

**Risk:** None — this is the ground truth for WIP enforcement.

---

## Task Board Summary

| ID | Title | Owner | Size | Status | Zone | Depends | Batch |
|---|---|---|---|---|---|---|---|
| ARCH-FETCH-OPS-1 | Technical blueprint | architect | S | DONE | multi | — | — |
| F-1 | mcp-server fix + endpoint | dev-mcp-server | M | TODO→IP | apps/mcp-server/ | — | 1 |
| F-2 | macro-indicators latency | dev-macro-indicators | XS | TODO→IP | apps/macro-indicators/ | — | 1 |
| F-3 | frontend redesign | dev-frontend | M | TODO | apps/frontend/ | F-1 | 2 |
| F-4 | api-gateway SPIKE | dev-api-gateway | SPIKE | TODO | apps/api-gateway/ | F-1 (may) | 3 |

---

## Dispatch Plan

**Batch 1 (now):** Claim & spawn dev-mcp-server(F-1) + dev-macro-indicators(F-2) in parallel message.  
**Batch 2 (after F-1 DONE):** Claim & spawn dev-frontend(F-3).  
**Batch 3 (optional):** If F-4 scope confirmed ≤4h and time permits, claim & spawn dev-api-gateway(F-4) in parallel with F-3.  

All handoff files ready in docs/handoffs/.

---

## Exit Criteria

PM cycle complete when:
- [ ] F-1 and F-2 assigned (Batch 1)
- [ ] NEXT block returned to main terminal with agent spawn list
- [ ] All task JSON validated (jq)
- [ ] All handoff files created and linked in task_board
- [ ] .head.in_progress reflects Batch 1

**Status:** READY TO RETURN

---

## Open Decisions

- **F-4 deferral condition:** If dev-api-gateway reports scope > 4h on alias-only approach, PM will defer F-4 to own sprint (document and gate).
- **F-3 timeline:** Depends entirely on F-1 ship date. Once F-1 container rebuilt, F-3 can proceed immediately.

---

## Session Log

- 2026-06-06T21:35Z: PM cycle start, read architect handoff.
- 2026-06-06T21:35Z: Decomposed 4 tasks per architect blueprint.
- 2026-06-06T21:35Z: Created 4 handoff files in docs/handoffs/.
- 2026-06-06T21:35Z: Registered tasks in orch-state.json.task_board (FETCH-OPS-PAGE-TRUTH sprint).
- 2026-06-06T21:35Z: Set .head to in_progress Batch 1 (F-1, F-2).
- 2026-06-06T21:35Z: Decision journal written.
- 2026-06-06T21:35Z: READY TO DISPATCH.
