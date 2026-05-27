<!-- size-justification: 135L — thin pointer + pilot enforcement content (Language Mode, Smoke Checks, G12 DoD, Security Clause, Fence Note AC-locked-on-SI-3, Pre-Revert Tag Protocol, References); mirrors dev-macro-indicators pattern for TS/Bun service; split when news-fetch pilot reaches Phase 2 -->
# dev-news-fetch — Main (Pointer)

**Zone:** `apps/news-fetch/`
**Specialist for:** RSS/API news fetch, headline normalize, source dedup, article relevance filter, ticker tagging (TypeScript/Bun — stays TS; no Go rewrite, small surface)
**Owner agent:** `developer` (generic — no dev-news-fetch specialist in roster; routed here by zone)

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `news-fetch`
- `<agent-id>` = `developer` (generic owner)
- zone restriction: only `apps/news-fetch/` files

---

## Language Mode

**TypeScript/Bun is the only mode for news-fetch.** Language locked Day 0: small fetch/normalize service, low Go-rewrite payoff (charter §Deltas). Do NOT propose a language pivot without PO approval.

| Signal in task spec | Mode |
|---|---|
| Files contain `*.ts`, `bun`, `package.json`, `bunfig.toml` | **TS/Bun** (only mode) |
| Any other ambiguity | **TS/Bun** (default) |

When task assigned, load the brownfield inventory before touching code:
→ `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md` (lazy-load: trigger = pilot_task_or_g12_gate)

---

## Smoke Checks

Run all checks before every commit:

| Check | Command |
|---|---|
| Unit tests | `cd apps/news-fetch && bun test` |
| Type check | `cd apps/news-fetch && bun tsc --noEmit` |
| Scenario JSON validity | `find docs/scenarios/news-fetch -name '*.json' -exec jq . {} \; > /dev/null` |
| Sandbox runner (all tiers) | `cd apps/news-fetch && bun run sandbox --tier=all --module=news-fetch` |

---

## Pilot Hard Rule (G12 — blocking from Day 0)

### G12 DoD Gate (mandatory — blocking)

**Do not mark task DONE until sandbox dashboard shows all news-fetch scenarios green.**

Run before declaring complete:

```bash
cd apps/news-fetch
bun run sandbox --tier=all --module=news-fetch
```

Command must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `news-fetch` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12 (canonical G1–G12)

---

## Security Rule (§Security Clause — blocking)

**Sandbox process MUST have zero DB credentials and zero external API keys at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD|NEWS_API_KEY"
# Must return empty when running inside the sandbox process context
```

`NEWS_API_KEY` and any newsapi/flaresolverr credentials are explicitly named — they MUST NOT leak into the sandbox process. Sandbox runs against scenario JSON fixtures, NOT live APIs.

If any credential appears in sandbox env, the task is blocked — it does not pass.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Security Clause

---

## Fence Rules (G4 — ESLint, AC locked after SI-3)

**Note: G4 AC for TS pilots is gated on SI-3 design landing.** Do NOT block Phase 1 tasks on G4 — note fence intent but do not require CI failure proof until SI-3 ships.

Three architectural fences (ESLint `eslint-plugin-boundaries` — same pattern as macro/stock-price):

- **Fence-A:** `src/primitives/` MUST NOT import anything from `src/modules/`, `src/application/`, `src/interface/`, or `src/infrastructure/`. Primitives are pure-function only.
- **Fence-B:** `src/modules/` MUST NOT import anything from `src/infrastructure/`. Module composes via ports only.
- **Fence-C:** `src/infrastructure/` wiring is allowed only from the composition root (`src/index.ts` or equivalent entry). All other files are barred.

G4 deliberate-violation proof: 1 deliberate boundary violation in a PR + CI failure — pending SI-3 landing.

---

## Pre-Revert Tag Protocol

Before mutation sequences that risk requiring a revert:

| Pre-step | Tag to create | Before |
|---|---|---|
| Before G4 CI job activation | `news-fetch-pre-ci` | P2 CI activation commit |
| Before source deletion (G5) | `news-fetch-pre-delete` | P2 deletion commit |
| Before bug injection (G10) | `news-fetch-pre-inject` | P2-D bug injection commit |

Create with: `git tag news-fetch-pre-<name> HEAD` — NO `--force`, NO push. No retag. Frozen anchor.

**Note:** Do NOT create these tags during Phase 0 work. Tags are placed at the commit IMMEDIATELY BEFORE the mutation/violation/injection step.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4 + §G5 + §G10

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md` | **Binding** | Service deltas — language lock (TS), anti-scope boundary, key risks (I/O-heavy, generic owner) |
| `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` | **Canonical** | G1–G12 goals (language-agnostic) + security clause + pre-revert tag protocol |
| `docs/data/pilot-status-news-fetch.json` | **Live SSOT** | Goal tracking — PO reads/writes; developer does not write goal state |

---

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.
