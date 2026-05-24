---
task_id: P2-KD-I
title: "G3 — Composition Root Cleanup ≤80L + OpenAPI Contract"
owner: dev-kinh-dich
phase: 2
goal_advanced: G3
date_created: 2026-05-24
blocked_by: P2-KD-H
blocks: P2-KD-J
est_hours: 1.5
ac_count: 6
---

# TASK_P2-KD-I: G3 — Composition Root Cleanup ≤80L + OpenAPI Contract

**Owner:** dev-kinh-dich  
**Blocked by:** P2-KD-H DONE (G5 chain confirmed clean — safe to finalize composition root)  
**Blocks:** P2-KD-J  
**Est:** 1.5h  
**ACs:** 6

---

## Background

G3 requires the composition root (`src/index.ts`) to be a **pure wiring file** (no business logic, no hexagram calculations) AND an HTTP contract document (`openapi.yaml`) at `src/interface/`.

The SQLite MarkovPort implementation (`SQLiteKinhDichRepository`) is wired **ONLY HERE** — this is the single allowed location for infrastructure injection per **Fence-C**.

`src/index.ts` target: **≤80 lines**. If complexity exceeds 80 lines, extract DI wiring to `src/index.wire.ts` (pure wiring helper, not business logic).

Port **5005** is the kinh-dich-service address per `docs/data/system-map.json`. Never hardcode — read from env-var or system-map query.

---

## Files to Touch

- `apps/kinh-dich-service/src/index.ts` (MODIFY — wire `reading_composer` module; ensure MarkovPort injection; remove any remaining domain logic)
- `apps/kinh-dich-service/src/interface/openapi.yaml` (CREATE — OpenAPI contract for all HTTP endpoints)

---

## Acceptance Criteria

### AC-1 — Zero Domain-Operation Grep in Composition Root

```bash
grep -c "computeReading\|classifyNguHanh\|resolveHexagram\|encodeHaos" \
  apps/kinh-dich-service/src/index.ts
```

**Verdict:** Must return **0**. Business logic lives in primitives/module, not the composition root.

**Evidence:** Paste command output.

---

### AC-2 — MarkovPort Infra Injected at Composition Root (Fence-C Confirmed)

```bash
grep -n "SQLiteKinhDichRepository\|repositories\|MarkovPort" apps/kinh-dich-service/src/index.ts
```

**Verdict:** Must return **≥1 match**. The SQLite adapter is wired here (correct per Fence-C).

**Evidence:** Paste command output. Confirm the wiring pattern matches the expected DI container pattern.

---

### AC-3 — Composition Root ≤80 Lines

```bash
wc -l apps/kinh-dich-service/src/index.ts
```

**Verdict:** Must return **≤80**. If exceeding 80, extract to `src/index.wire.ts` (DI helper file, not business logic).

**Evidence:** Paste command output.

---

### AC-4 — OpenAPI Contract Exists and Covers All Live Endpoints

```bash
test -f apps/kinh-dich-service/src/interface/openapi.yaml && echo FOUND
```

**Verdict:** Echoes **FOUND**.

**Endpoint documentation required:**

- `GET /health` → `{ status, service, port }`
- `POST /reading/{code}` → request: `{ scores: number[6], markovData?: MarkovData | null }`, response: `KinhDichReading`
- `GET /market` → response: `KinhDichReading`
- `GET /readings/{code}/history?days=N` → response: `KinhDichStoredRow[]`
- `GET /hexagram/{number}/transitions?code=X` → response: `MarkovTransition[]`
- `GET /backtest/{code}?days=N` → response: `BacktestResult`
- `GET /hexagram/{number}/explain` → response: `HexagramExplanation`

**YAML Validation:**

```bash
python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)" < apps/kinh-dich-service/src/interface/openapi.yaml
```

Must exit **0** (valid YAML).

**Evidence:** Paste validation output.

---

### AC-5 — Fence-C + ESLint Clean

```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0 && bun run tsc --noEmit
```

**Verdict:** Both exit **0**.

**Evidence:** Paste ESLint and TypeScript compiler outputs.

---

### AC-6 — G12 DoD Gate

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

**Verdict:** Exits **0**. Baseline: **14/14 scenarios PASS** (12 primitives + 2 module).

**Evidence:** Paste full sandbox output summary.

---

## Commit Subject

```
feat(kinh-dich): P2-KD-I — composition root cleanup ≤80L + OpenAPI contract src/interface/openapi.yaml (G3)
```

---

## G-Goal Posture

**NO goal flips.** § 4.5 SSOT untouched. G3 advances but does NOT flip to YES until Phase-3 terminal close (12/12 atomic decision matrix population by PO).

---

## Notes

- **Phase-2 §4.5 binding rule:** Never flip `decisionMatrix.{speed,trust,scale}` or `goalsEarned`. All 12 goal flips happen atomically in Phase-3 close by PO only.
- **Port 5005:** kinh-dich-service internal == external. Verify via `docs/data/system-map.json` jq query, not hardcode.
- **Composition root purity:** Zero if-on-data-values. Zero business logic. Pure wiring only.
- **SI-3 Fence-C:** Infrastructure imports ONLY in `src/index.ts`. All other files must not import from `src/infrastructure/`.
