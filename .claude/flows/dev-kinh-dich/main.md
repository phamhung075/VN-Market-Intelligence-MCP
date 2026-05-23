# dev-kinh-dich — Main (Pointer)

**Zone:** `apps/kinh-dich-service/`
**Specialist for:** Hexagram readings, trading signals, I-Ching market logic (TypeScript/Bun — Factory v2 pilot 4)

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `.claude/flows/developer/microservice-main.md`

Substitutions:
- `<service>` = `kinh-dich-service`
- `<agent-id>` = `dev-kinh-dich`
- zone restriction: only `apps/kinh-dich-service/` files

---

## Language Mode

**TypeScript/Bun is the primary and only mode for kinh-dich.** Language locked Day 0 at charter creation (authority: `docs/signals/po-pilot4-kinh-dich-open-20260523T223738Z.json`). No mid-pilot pivot permitted.

| Signal in task spec | Mode |
|---|---|
| Files contain `*.ts`, `*.tsx`, `bun`, `package.json`, `eslint.config.mjs` | **TS/Bun** (only mode — natively TypeScript/Bun per system-map.json `runtime: bun`) |
| Any other | **TS/Bun** (default — no Go for this service) |

When task assigned, load the brownfield inventory before touching code:
→ `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` (lazy-load: trigger = ts_task_assigned)

---

## Smoke Checks

Run all checks before every commit:

| Check | Command |
|---|---|
| Unit tests | `cd apps/kinh-dich-service && bun test` |
| Type check | `cd apps/kinh-dich-service && bun tsc --noEmit` |
| Lint / fence | `cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0` |
| Scenario JSON validity | `find apps/kinh-dich-service/sandbox -name '*.json' -exec bun -e "JSON.parse(require('fs').readFileSync('{}','utf8'))" \; 2>/dev/null` |
| Sandbox runner (primitive) | `cd apps/kinh-dich-service && bun run sandbox --tier=primitive --module=kinh-dich --scenario=all` |
| Sandbox runner (module) | `cd apps/kinh-dich-service && bun run sandbox --tier=module --module=kinh-dich --scenario=all` |

---

## DoD Gate (G12 checkpoint — mandatory — blocking from Day 0)

**Do not mark task DONE until sandbox dashboard shows all kinh-dich scenarios GREEN.**

Run both tiers before declaring complete:

```bash
cd apps/kinh-dich-service
bun run sandbox --tier=primitive --module=kinh-dich --scenario=all
bun run sandbox --tier=module --module=kinh-dich --scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `kinh-dich` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §G12

---

## Security Rule (§Security / Zero-Credentials Clause — blocking)

**Sandbox process MUST have zero DB credentials, zero external API keys, AND zero secrets at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"
# Must return empty when running inside the sandbox process context
```

**kinh-dich-specific:** hexagram logic is pure compute. The sandbox runs the extracted primitives + module against scenario JSON fixtures (`input: { stockCode, scores, markovData }` → `output: KinhDichReading`). No SQLite DB connection, no VPS call, no external API key — the domain function requires only in-memory data.

If any credential appears in sandbox env, the task is blocked — it does not pass.

Reference: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §Security / Zero-Credentials Clause

---

## R-FENCE Gate (ESLint boundaries — G4 pre-check before every commit to TS files)

**Context:** kinh-dich is the first TS/Bun service in the fleet to exercise `eslint-plugin-boundaries` (SI-3 Option A). The fence tool is `eslint-plugin-boundaries` ONLY — no Option C (documented-weaker) fallback permitted.

Three architectural fences must hold on every commit touching TS files in `apps/kinh-dich-service/`:

- **Fence-A:** `src/primitive/**` MUST NOT import anything from `src/module/`, `src/application/`, `src/interface/`, or `src/infrastructure/`. Primitives are **stdlib + domain only**.
  - ESLint error label: `"Fence-A: primitive must not import ${dependency.type} layer"`

- **Fence-B:** `src/module/**` MUST NOT import anything from `src/application/`, `src/interface/`, or `src/infrastructure/`. Module composes via ports (interfaces) only.
  - ESLint error label: `"Fence-B: module must not import ${dependency.type} layer"`

- **Fence-C:** `src/infrastructure/**` may only be imported from `src/index.ts` (composition root). All other files are barred.
  - ESLint error label: `"Fence-C: infrastructure wiring only allowed in src/index.ts (composition root)"`

**Fence check command (run before every TS commit):**

```bash
cd apps/kinh-dich-service
bunx eslint src/ --max-warnings 0
# Exit 0 = CLEAR. Exit != 0 = FENCE VIOLATION — fix before committing.
```

**Fence config location:** `apps/kinh-dich-service/eslint.config.mjs` (authored at G4 and frozen; full template in charter §G4).

**R-2 fallback (SI-3 §6.2 — activate ONLY if AC-4b proof fails):** if `.js`-suffixed ESM imports are not matched by `eslint-plugin-boundaries` element patterns, add `@typescript-eslint/parser` to devDependencies and `languageOptions: { parser: tsParser }` to `eslint.config.mjs`. This is the 5-minute Option-A internal fallback. NEVER drop to Option C.

**When to use the R-FENCE lazy-load gate (Phase 1 G4 task):** when a G4-related task lands, focus on the deliberate-violation proof structure (AC-4b). Full fence config template is baked in charter §G4 — do NOT download or fetch it. Reference charter verbatim.

Reference: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §G4 + §R-FENCE Boundary Clause; `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` (FINAL, chosen_option=A)

---

## Pre-Revert Tag Protocol

Before mutation sequences that risk requiring a revert:

| Pre-step | Tag to create | Before |
|---|---|---|
| Before G4 deliberate-violation commit (Phase 2) | `kinh-dich-pre-ci` | P2 CI activation commit |
| Before `git mv` to `_deprecated/` (G5 Phase 2) | `kinh-dich-pre-delete` | P2 deletion commit |
| Before bug injection commit (G10 Phase 2) | `kinh-dich-pre-inject` | P2-D bug injection commit |

Create with: `git tag kinh-dich-pre-<name> HEAD` — NO `--force`, NO push. No retag. Frozen anchor.

**Note:** Do NOT create these tags during Phase 0 or Phase 1 work. Tags are placed at the commit IMMEDIATELY BEFORE the mutation/violation/injection step in their respective Phase 2 tasks.

Reference: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §L5 + §G4 + §G5 + §G10

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` | **Binding** | G1-G12 goals + R-FENCE clause + constraints + security clause + eslint.config.mjs template |
| `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` | **PRIMARY** | Brownfield scan: primitives selected, DDD assessment, R-FENCE feasibility on .js imports |
| `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md` | **Active** | TS task ledger Phase 1 with per-task AC |
| `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` | **Binding** | SI-3 FINAL — Option A (eslint-plugin-boundaries v6.0.2), R-2 fallback spec |
| `docs/data/pilot-status-kinh-dich.json` | **Live SSOT** | Goal tracking — PO reads/writes; dev-kinh-dich does not write |

---

For spike tasks (`mode: "spike"`): `.claude/flows/developer/feature-spike.md`.

Service docs: `docs/architecture/microservice/kinh-dich-service/`. Agent definition: `.claude/agents/dev-kinh-dich.md`.
