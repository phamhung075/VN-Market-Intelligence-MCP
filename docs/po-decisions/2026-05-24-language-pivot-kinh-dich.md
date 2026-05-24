---
title: "Language Pivot Decision — kinh-dich-service (TS/Bun → Go)"
date: "2026-05-24"
author: "po"
status: "FINAL"
service: "kinh-dich-service"
precedent: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-service-charter.md"
pilot_charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
authority: "po self-initiated under SCALE rollout — consistency mandate from TA pivot precedent §Q1 (Go-first default for all fractals)"
---

# Language Pivot Decision — `kinh-dich-service` (TS/Bun → Go)

**Decision is FINAL for the scale rollout. This mirrors the technical-analysis Option-B pivot.**

---

## Verdict

**Pivot `kinh-dich-service` from TypeScript/Bun to Go.**

The kinh-dich microservice will be re-implemented in Go as part of the three-tier-trust scale rollout. The existing TS code (full DDD `src/` tree with `primitive/`, `module/`, `application/`, `domain/`, `infrastructure/`, `interface/`) is **reverted/rewritten in Go (TS→Go reboot)**. The existing TS implementation is preserved as the canonical behavioral specification for the Go rewrite — it tells the Go implementer exactly what hexagram logic, Hao encoding, nuclear/transformed computation, Ngu Hanh classification, and reading composition must produce, but no TS file ships in the final service.

---

## Authority & Rationale

This is a PO self-initiated decision under the SCALE phase (TA pilot verdict = `scale`, recorded in `docs/data/pilot-status.json`). It does not require fresh user approval — the user has delegated full autonomy for product improvements (MEMORY: PO full autonomy), and the precedent below already established the operative rule.

**Precedent:** `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q1 sign-off recorded the operative rule verbatim:

> "Future fractals (macro-indicators, etc.) inherit the same default: **Go-first unless a stronger constraint overrides.**"

kinh-dich-service inherits that default. No stronger constraint overrides:

1. **Consistency.** Six of the ten non-pilot services are Go (api-gateway, stock-price, alert-engine already Go; macro-indicators, technical-analysis pivoting to Go). Keeping kinh-dich on TS/Bun leaves a single odd-language Go-eligible service, fragmenting the sandbox toolchain.
2. **Single sandbox toolchain.** The proven three-tier dashboard + sandbox runner from the TA pilot is Go (`cmd/sandbox/main.go` + scenario JSON). A Go kinh-dich service reuses that exact toolchain (one `go test ./...`, one `golangci-lint` fence, one sandbox harness) instead of maintaining a parallel Bun sandbox path.
3. **Domain fit.** Kinh-dich is pure deterministic computation (6 signals → hexagram → nuclear/transformed → Ngu Hanh → formatted reading). It has zero external-API or heavy-NLP dependency — exactly the pure-function profile that suits Go primitives + scenario-JSON verification, identical to the TA primitives.

The Python services (pdf-extractor, rag-service) and the TS/Remix frontend stay in their languages — they have stronger constraints (OCR/ML ecosystem, Remix SSR) and are NOT pivoted.

---

## TS→Go Reboot Scope

| Existing TS artifact | Reboot action |
|---|---|
| `apps/kinh-dich-service/src/primitive/{hao-encoder, hexagram-resolver, ngu-hanh-classifier, nuclear-hexagram-computer, reading-scorer}` | Rewrite as Go primitives under `apps/kinh-dich-service/pkg/primitive/` (mirror the macro/TA Go layout). Each gets ≥3 scenario JSON (happy + edge + failure) per charter G1. |
| `apps/kinh-dich-service/src/module/reading_composer` | Rewrite as Go module under `pkg/module/` composing the primitives via ports (charter G2). |
| `src/application/{dtos,usecases}.ts` | Rewrite in Go `pkg/application/`. |
| `src/domain/{errors,hexagram-data,models,repositories}.ts` | Rewrite in Go `pkg/domain/`. Hexagram static data is portable — migrate the data, rewrite the accessor. |
| `src/infrastructure/{config,repositories}.ts` | Rewrite in Go `pkg/infrastructure/`. |
| `src/interface/handlers.ts` | Rewrite as Go HTTP interface under `pkg/interface/http/` + `cmd/server/main.go`. Preserve the HTTP contract (charter G3). |
| `src/__tests__/**` (TS tests) | Behavioral oracle for Go scenario JSON. Do not port test framework; encode the assertions as scenario JSON + Go unit tests. |
| `src/_deprecated/services_v1.ts` | Already deprecated — drop. |
| `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `eslint.config.mjs`, `node_modules/` | Remove once Go scaffold lands and parity is proven (charter G5 — old code deleted). |

**Behavioral parity is the gate:** the Go primitives must reproduce the TS primitives' outputs for the documented hexagram test vectors. The kinh-dich logic reference (MEMORY: `reference_kinhdich_logic.md`) and the existing TS tests are the parity oracle.

---

## Charter Alignment

- The kinh-dich scale charter (`docs/architecture-briefs/2026-05-22-refactor/scale/kinh-dich-service-charter.md`) points to `pilot-charter.md` G1–G12 as canonical. **Goals are unchanged and language-agnostic** — exactly as the TA pivot established (gates on scenario JSON pass/fail, dashboard red/green, AI fix-cycle count).
- Only the implementation language and the TS→Go reboot scope are service-specific deltas; they live in the charter, not in new goals.

---

## Operational State Changes (separate deliverables — NOT done by this decision)

PO cannot edit agent files or `system-map.json` directly. The following are dispatched to **agent-father** via a signal (`docs/signals/po-{ts}.json`, logged on the agent-father dashboard section):

1. **`.claude/agents/dev-kinh-dich.md` (or `.claude/flows/dev-kinh-dich/main.md`)** — flip language TS/Bun → Go. Replace `bun test` / `bun tsc --noEmit` / eslint toolchain references with `go test ./...`, `go vet`, `golangci-lint run`, and the Go sandbox harness (`go run ./cmd/sandbox`).
2. **`docs/data/system-map.json`** — flip `project.microservices[] | select(.name=="kinh-dich-service") .language` from `"ts"` → `"go"`.

Both file edits are agent-father's job. PO drops the signal and does not touch those files.

---

## Sign-off

- **Decided by:** `po` (self-initiated, SCALE rollout), under TA-pivot precedent §Q1 Go-first default.
- **Date:** 2026-05-24.
- **Status:** FINAL. Mirrors the TA Option-B pivot. No re-litigation.
