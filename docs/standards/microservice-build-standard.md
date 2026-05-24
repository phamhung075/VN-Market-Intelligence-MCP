# Microservice Build Standard — Size-Gated Profiles

**Authority:** Architect (classification) | **Maintainer:** Architect
**Ref:** `docs/architecture-briefs/2026-05-24-microservice-build-standard-promotion.md`

---

## § 1 — Profile Selection Gate

Architect classifies at handoff time. PM propagates tag verbatim. dev-* reads at Step 0c.

### FULL — New Service (`apps/<svc>/` does not yet exist)

Handoff tag: `BUILD-STANDARD: full`

When active, dev-* agent ALSO lazy-loads:
- `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` (fail_loud: true)
- `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` (fail_loud: false)

### LEAN — New Feature on Existing Service (`apps/<svc>/` already exists)

Handoff tag: `BUILD-STANDARD: lean`

Load this file only. §§ 4–5 below carry all LEAN-mandatory content inline.

### Ambiguous Scope

Default to `BUILD-STANDARD: lean`. Architect notes ambiguity for PM visibility.

---

## § 2 — Three-Tier Sequence

Build sequence: primitives → modules → composition root.
Full phase plan: `docs/architecture-briefs/2026-05-22-refactor/07-phases.md`

- **FULL profile:** all three tiers required.
- **LEAN profile:** correct-tier placement required; no new composition root unless the feature
  genuinely spans multiple modules.

---

## § 3 — 12-Goal DoD Gate

G1–G12 DoD spec: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` § 12 Completion Goals

- **FULL profile:** all 12 goals as hard gates. No task marked DONE until all pass.
- **LEAN profile:** G1–G6 (fence, sandbox, replay, red/green) mandatory. G7–G12 scoped to
  what the feature touches — architect annotates which goals apply in the handoff.

---

## § 4 — Sandbox Security Clause (BOTH profiles — no bypass)

The sandbox process MUST have zero DB credentials and zero external API keys.

Verification command:
```
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"
```
Expected result: empty output.

Failure here is a hard block on G7 (FULL) and on the LEAN DoD. No bypass permitted.

---

## § 5 — Dashboard and Honest Red/Green Requirement

**FULL profile:** three-level dashboard (primitive / module / service), `file://` URL render,
1 deliberate broken primitive before G8=YES. User trust confirmation required (Path A verbal /
Path B PO Playwright).

**LEAN profile:** no standalone dashboard required. Honest red/green still mandatory — dev-* must
show one failing test BEFORE marking DoD green. No false greens permitted.

---

## § 6 — Role Relay

**FULL profile:** PO → BA → architect → PM → dev-`<svc>` → QA (full relay, all six roles).

**LEAN profile:** dev-`<svc>` drives end-to-end. PM task spec is the handoff. No separate
BA / charter / QA relay — QA validates inside dev-`<svc>` cycle via fence + replay.

---

## § 7 — Per-Service Pilot-Status SSOT Convention

**FULL profile:** instantiate `docs/data/pilot-status-<svc>.json` from
`docs/data/pilot-status-schema.json` on Phase 0. Sole writer: dev-`<svc>` during active phase.
Never written concurrently.

**LEAN profile:** if `pilot-status-<svc>.json` exists, dev-`<svc>` may update the relevant
phase entry. Do NOT create a new pilot-status file for a feature — no per-feature pilot-status.
