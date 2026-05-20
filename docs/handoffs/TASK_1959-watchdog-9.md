# TASK 1959-watchdog-9 — Dockerfile volume-shadow standing policy

**Sprint:** 1959 (watchdog hardening cycle-3) · **Owner:** architect · **Size:** XS (~10 min) · **Zone:** `docs/standards/` · **Priority:** LOW · **Status:** DISPATCH-NOW

Parent goal: `docs/SPRINT_GOAL.md` (Sprint 1959) · Predecessor: `docs/signals/architect-1959-watchdog-8.json` (audit verdict: 2 CONFIRMED SHADOWs, threshold ≥3 NOT reached, recommend standing policy)

---

## Why

Audit watchdog-8 found 2 CONFIRMED SHADOWs (pdf-extractor + rag-service) but both are latent-risk only (empty `mkdir`s under `/app/data/*`, no seed data). The audit brief recommendation: "baked assets go to `/opt/<service>-assets/`, never under `/app/data/*`". The watchdog-3 ship already proves the pattern (`/opt/model-cache` lives outside the `market_data` named volume). A standing policy document converts this lesson into a forward guard so future developers catch it at code-review time, not at next outage.

---

## Work

1. Create `docs/standards/dockerfile-volume-policy.md` (~30 lines).
2. Content:
   - **Rule:** Any image-layer asset (model weights, seed JSON, fallback DBs, fixtures) MUST live under `/opt/<service>-assets/` or another path NOT mounted as a named volume. NEVER under `/app/data/*` for any service mounting `market_data:/app/data`.
   - **Why:** The `market_data` named volume overlays `/app/data/*` on container start. Image-layer content under that path is silently shadowed — invisible at runtime, looks "missing" to debugging, no error message.
   - **Pattern:** Use env var to point service at the asset path (e.g. `EMBEDDING_CACHE_DIR=/opt/model-cache`). Dockerfile bakes content into `/opt/<name>-cache/...`. Compose passes the env.
   - **Audit trigger:** Any PR adding `RUN mkdir -p /app/data/*` or `COPY ... /app/data/*` in a service mounting `market_data` MUST justify the deviation in the PR description or move to `/opt/`.
   - **Precedent:** Sprint 1959 watchdog-3 (`apps/rag-service/Dockerfile`, commit `66255410`) — model cache moved from `/app/data/models` (shadowed) to `/opt/model-cache` (clean).
   - **Audit reference:** `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md`.
3. Cross-link:
   - Add row to `docs/references/tree-map.md` (logic file, parent → standards).
   - Mention in developer-runbook OR appendix of compose-deployment runbook IF those exist (architect's call — if not, just the tree-map link is enough).
4. NO code change, NO test, NO rebuild.

---

## Acceptance criteria

- AC-9-1: `docs/standards/dockerfile-volume-policy.md` exists; explicit rule + rationale + pattern + audit-trigger + precedent + audit-reference all present.
- AC-9-2: `docs/references/tree-map.md` lists the new file.
- AC-9-3: Length ≤ 60 lines (standards-doc discipline).
- AC-9-4: Commit message format: `docs(standards/1959-watchdog-9): dockerfile volume-shadow policy`.

## Signal

On done, emit `docs/signals/architect-1959-watchdog-9.json`:
```json
{
  "schema": "agent-signal/v1",
  "signal_id": "architect-1959-watchdog-9",
  "from": "architect",
  "to": ["po"],
  "type": "task_complete",
  "task_id": "1959-watchdog-9",
  "sprint": "1959",
  "generated_at": "<ISO UTC>",
  "files_created": ["docs/standards/dockerfile-volume-policy.md"],
  "files_modified": ["docs/references/tree-map.md"],
  "ac_pass": ["AC-9-1", "AC-9-2", "AC-9-3", "AC-9-4"],
  "next": "po"
}
```

---

## [PO] Ratification Record

- **Date:** 2026-05-20T21:40:28Z
- **Verdict:** RATIFIED — DONE
- **Commit reviewed:** 59e043fa — `docs(standards/1959-watchdog-9): dockerfile volume-shadow policy`
- **Signal ratified:** `docs/signals/architect-1959-watchdog-9.json`
- **Emitted signal:** `docs/signals/po-1959-w9-ratified.json`

| AC | Result | Evidence |
|----|--------|----------|
| AC-9-1 | PASS | `docs/standards/dockerfile-volume-policy.md` has rule (`/opt/<service>-assets/`) + rationale (named-volume shadow failure mode) + canonical pattern + audit-trigger (code-review checklist) + precedent (watchdog-3 commit `66255410`) + audit-ref link |
| AC-9-2 | PASS | `docs/references/tree-map.md` lists new file in standards block + Write Ownership |
| AC-9-3 | PASS | 59 lines (wc -l confirmed) ≤ 60 |
| AC-9-4 | PASS | Commit subject `docs(standards/1959-watchdog-9): dockerfile volume-shadow policy` |

**Bonus cross-link (above-AC):** `docs/protocols/docker-deployment-runbook.md` Related section now points to the new policy doc. Architect went one step further than spec required — accepted, ratified, no rework.

**Sprint position post-ratification:**
- Cycle-3 active dev work fully shipped (w-9 RATIFIED + w-10 DEV-DONE in QA)
- Sprint 1959 STAYS OPEN until watchdog-4 ships post-2026-05-22T21:00Z gate (48 h soak is design, not idle)
- TASKS.md Done section already has w-9 row (architect appended on close)
- Dashboard row 1959-watchdog-9 flipped → DONE

**Next:** PO idle until either (a) QA-PASS on w-10 arrives → confirm + ops rebuild, OR (b) 2026-05-22T21:00Z gate triggers cycle-4 (watchdog-4 LanceDB compaction).
