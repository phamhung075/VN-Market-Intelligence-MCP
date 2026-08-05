<!-- size-justification: single closeout brief for a small, fully-shipped guard — root
     cause, regex/logic design, corpus-replay evidence, and the two shipped artifacts
     (hook function + standalone replay script) are one coherent record. -->

# Architecture Brief — FIX-AGENT-NOTEBOOK-UUID-PROVENANCE (Part b: CI/pre-commit guard)

**Date:** 2026-08-05 | **Author:** architect (router-dispatched, coordination_session f298ccf7-8cf4-452d-9a5a-57dcb47e65ac)
**Task:** `docs/data/orch/orch-state.json` `.task_board.in_progress[]` id `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE`, P1, supervised+plan_only
**Status:** DESIGNED + SHIPPED (small enough to implement directly per the row's own dispatch note). Zone: multi.
**BUILD-STANDARD:** not-applicable (guardrail/hardening class, existing hook infra extended, no new service).

---

## 0. Verdict up front

- Ship as a **pre-commit hook function** (`scripts/git-hooks/pre-commit` `_check_notebook_uuid_provenance`), colocated with the existing sibling notebook guard `_check_notebook_immutability` — same file, same corpus, same "prose alone already failed once" precedent, same installed-hook mechanism (`scripts/git-hooks/install.sh`). This is the primary and, for now, sufficient control (see §5 for why a CI companion is deferred, not required).
- Detection is **diff-scoped**: only heading (`^## `) lines a commit *adds* are inspected — never a whole-file rescan, never body prose below a heading. This is what makes the design self-grandfathering: pre-existing corpus debt (confirmed, see §2) never blocks a future unrelated commit, with no baseline/ratchet JSON file needed (unlike the `task-claim-owner-session-lint` family).
- **Two rules**, deliberately asymmetric in enforceability:
  - **RULE 1 — full UUID** (`8-4-4-4-12` hyphenated hex) anywhere on an added heading line. Unambiguous; false-positive-proof against short git SHAs by construction (a bare SHA has no internal hyphens and can never match the grouped shape). Opt-in hard-`reject` via `GIT_NOTEBOOK_UUID_PROVENANCE_MODE=reject`.
  - **RULE 2 — bare 6-8 hex first token** immediately after `## ` (the confirmed `ad265f86` shape — the *first segment* of a UUID, not a full UUID). Ambiguous by nature (indistinguishable from a deliberately short-SHA-shaped fixed label) — **WARN-only forever**, never escalated even under `mode=reject`.
- Default disposition for both rules is **WARN, never blocking, fleet-wide, day 1** — mirrors `_check_notebook_immutability`'s own documented rationale (that gate's first cut was validated on n=2 commits of one file and blocked most of the fleet's next commit). A standalone replay script (`scripts/audits/verify-notebook-uuid-provenance-gate.sh`) is shipped alongside so a caller can validate before ever flipping `reject`.
- 10/10 new regression tests pass (`scripts/git-hooks/pre-commit-notebook-uuid-provenance.test.sh`); the two pre-existing hook suites (13/13, 6/6) still pass unmodified — no regression introduced into the shared `pre-commit` file.

---

## 1. Brownfield verification

Part (a) of this row (agent-father, 2026-07-29) already fixed the root cause in prose: `.claude/skills/notebook-write/SKILL.md` AC-1 states the `c<NNN>` counter/fixed-label generation rule and forbids deriving a heading token from any session-UUID fragment. This brief covers part (b) only — the mechanical backstop — per `next_agent=architect`/`plan_only:true` on this row.

Read `notebook-write/SKILL.md` AC-1 template shapes directly (not inferred): `## c<NNN> · <ISO>` (counter), `## <ISO>` (bare timestamp), `## Session: <date> (<context>)`. Live corpus (`grep -rn "^## " docs/agent-memory/notebooks/*.md`, 46 files at scan time) additionally shows accepted variants never enumerated in AC-1 but structurally safe against this guard: `## <ISO> — <TASK-SLUG>` (dev-mcp-server), `## Fix (<prose>) <ISO> <TASK-SLUG>` (agent-father), `## Cycle <date> — <TASK-SLUG>` (dev-pdf-extractor), fixed rolling labels like `## Current state` / `## Carry-over` (no token at all). None of these collide with either rule (verified in §3's test matrix).

Existing sibling infrastructure this design reuses verbatim, not reimplements:
- `scripts/git-hooks/pre-commit` — home of `_check_notebook_immutability` (AC-2a) and `_check_auditor_heartbeat_shapes`, both unconditional, both notebook/docs-data specific, both with a WARN-default / opt-in-reject disposition and a `write_signal()` aggregated `docs/signals/` write. New function follows the exact same shape.
- `scripts/audits/verify-notebook-immutability-gate.sh` — sourcing pattern (`sed -n '/^_fn()/,/^}/p' "$HOOK" | source`) reused verbatim for the new replay script, so the replay can never silently drift from what the live hook actually runs.
- `scripts/audits/task-claim-owner-session-lint.sh` — escape-hatch convention (`<check>-lint-allow: <reason>`) reused as `notebook-uuid-lint-allow: <reason>`.

---

## 2. Corpus-replay evidence (not asserted, measured)

Ran `scripts/audits/verify-notebook-uuid-provenance-gate.sh` against the real repo history:

| Scope | RULE1 (full UUID) hits | RULE2 (bare hex) hits |
|---|---|---|
| Last 8 commits / file, all 52 tracked notebook files | 1 (`tran-ngoc-bau.md`, see below) | 0 |
| Full history, `system-auditor.md` alone (1055 commits) | 0 | **79**, all dated 2026-07-21 → 2026-07-24 |
| Full history, `tran-ngoc-bau.md` alone (85 commits) | 1 | 0 |

**Confirms the row's own framing quantitatively**: the single `## ad265f86 · 2026-07-29T06:09:36Z` incident named in the row's `po_recurrence_20260729` note was not a one-off — it was the **last** instance of a standing, ~daily failure mode across `system-auditor.md`'s entire pre-fix history (79 distinct bare-hex-token headings found, none in the last-8-commits window, i.e. the 2026-07-29 AC-1 fix is holding going forward).

**Second, structurally different leak found live**, not previously named in the row: `docs/agent-memory/notebooks/tran-ngoc-bau.md`, commit `f449a1cdaada`, heading `## c117 · 2026-07-23T20:21:32Z (... session=22ed5ba1-502f-4683-8a7e-70fd79e71645 ...)` — a **full** session UUID embedded as explanatory prose *on* the heading line (documenting which peer session handled a fire-election collision), not as the AC-1 token itself. Same standing violation of `feedback_agent_commits_session_uuid_into_notebook` ("a session id is a coordination parameter ONLY, never authored into a committed file"), reached via a different code path — RULE 1 catches this shape; RULE 2 (token-position-only) would have missed it. **A live, currently-uncommitted recurrence of this exact same pattern was also found** in this agent's *working tree* at brief-writing time (`## c122 · ~2026-08-04T20:29Z (... router_session=1004035c-3e7a-4e05-b56f-284e86894d9f)`, `git diff` on `docs/agent-memory/notebooks/tran-ngoc-bau.md`, not yet committed) — flagged here for visibility, **not fixed by this task** (out of scope: a different agent's own notebook content, not the guard itself; the guard would WARN, not block, when this is committed, per the disposition in §0).

Both findings support the WARN-by-default disposition rather than an immediate `reject`: RULE 2's volume proves the underlying bug is closed (part a), so a future occurrence is expected to be rare, but RULE 1's tran-ngoc-bau pattern is a plausible *legitimate* incident-documentation convention for that agent (recording a peer's session id for forensic/collision-recovery purposes) that a hard reject would block without further product-level adjudication of whether that convention itself should move off the heading line — not a call for this brief to make unilaterally.

---

## 3. Detection design — the false-positive shaping this row explicitly required

The row's own accumulated notes named two load-bearing constraints: avoid the git-short-SHA collision, and handle the fact that the confirmed incident was a *fragment* (`ad265f86`, 8 hex chars) of a UUID, not a full UUID.

**Scoping decision:** anchor on the heading LINE (`^## `), not all notebook prose — this alone kills the "short SHA legitimately cited in body text" false positive (verified: T7/T8 in the test suite, §4).

**RULE 1 (full UUID, `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)** is inherently immune to the short-SHA class: a short SHA has no internal hyphens, so it can never match this exact 5-group shape regardless of length.

**RULE 2 (bare 6-8 hex first token)** is the harder case — a stripped UUID-fragment and a hypothetical short-SHA-shaped fixed label are lexically identical. Two refinements were required beyond a naive `[0-9a-f]{6,8}` character-class check:
1. **Scope to the token position**, not the whole line — the first whitespace-delimited token immediately after `## `, matching the exact `<NNN>`/label slot in the SKILL.md AC-1 template (`## <token> - <ts>`). A bare hex-looking substring anywhere else on the line (e.g. inside parenthetical prose) is not inspected by this rule.
2. **Exclude the legitimate `c<NNN>` counter shape FIRST, before the hex-fragment check runs** — this is not cosmetic. Because `c` is itself a valid hex nibble, a counter like `c12345` is a string composed *entirely* of characters in `[0-9a-f]`, so a naive character-class check without the `^c[0-9]+$` pre-exclusion would eventually collide with the AC-1 counter convention as the count grows past 5 digits. Verified explicitly (test T4, §4) with a synthetic `c12345` heading.

Residual, documented, accepted risk: a future fixed SOURCE LABEL that happens to be an all-hex-letter English word (e.g. `facade`, `decade`, `deface`) would still trip RULE 2. No such convention exists in the live corpus today (checked structurally against every observed heading shape in §1) — this is why RULE 2 is WARN-only unconditionally, with the `notebook-uuid-lint-allow:` escape hatch as the documented remedy if it ever occurs.

---

## 4. Verification

`scripts/git-hooks/pre-commit-notebook-uuid-provenance.test.sh` — 10/10 passing, isolated scratch-repo-per-test (never touches the live repo), covering: RULE1 warn (T1) / RULE1 reject-blocks (T2) / RULE2 warn-never-blocks-even-under-reject (T3) / `c12345` counter negative control (T4) / `d4-auto` fixed-label negative control (T5) / escape hatch under reject (T6) / short-SHA-in-body-prose negative control (T7) / full-UUID-in-body-prose negative control (T8) / non-notebook-file no-op (T9) / retained-pre-existing-UUID-heading not re-flagged by a later append-only commit (T10, the mechanism that makes this design self-grandfathering).

Regression: pre-existing `scripts/git-hooks/pre-commit.test.sh` (13/13) and `pre-commit-auditor-heartbeat.test.sh` (6/6) re-run unmodified against the now-larger shared `pre-commit` file — both still 100% green, confirming the new function does not interfere with the sweep-guard or heartbeat-shape checks that run in the same file.

Live sanity check: ran the sourced classifier against the actual current (uncommitted) `git diff` of every `docs/agent-memory/notebooks/*.md` file in this repo at write time — exactly one hit, the `tran-ngoc-bau.md` recurrence named in §2 (not fixed, per scope).

---

## 5. CI companion — designed, deliberately deferred

`.git/hooks` is untracked (`scripts/git-hooks/install.sh` symlinks it in; a fresh clone or `.git` rebuild has no hooks until that script re-runs) — the other CI-only lint family (`task-claim-owner-session-lint`, `size-lint-justification`, `metric-mask-lint`, `dead-code-gate`) exists precisely because a hook can be structurally absent for a given session/clone. This guard's sibling in the SAME file, `_check_notebook_immutability`, has shipped hook-only with no CI companion since 2026-07-29 and that has been accepted as sufficient — the precedent this brief follows. Additional reasons specific to this guard: (1) it is diff-scoped against the STAGED index, which is cheap to replicate against `git diff <base>...<head>` in CI but adds a second code path to keep in sync with the hook's own `_notebook_uuid_line_verdict`; (2) the git hook itself already reaches the INV-GATEWAY-1-exempt population (dev-\*/qa/ba/pm/architect specialists that commit directly, no MCP gateway binding) because it lives beneath the OS `git commit` invocation, same justification the sweep-guard brief (`2026-07-21-commit-path-peer-index-sweep-guard.md` §1.3) used to choose a hook over an MCP-bound skill in the first place. **Recommended follow-up** (not required to close this row): a thin CI step in `.github/workflows/ci.yml` that sources `_notebook_uuid_line_verdict` and replays it against `git diff origin/main...HEAD -- docs/agent-memory/notebooks/*.md`, as defense-in-depth for the "hook never installed" gap — sized S, PO to schedule if the hook-only coverage proves insufficient in practice.

---

## 6. Files touched

| File | Change |
|---|---|
| `scripts/git-hooks/pre-commit` | + `_notebook_uuid_line_verdict` (pure classifier) + `_check_notebook_uuid_provenance` (staged-diff driver), called unconditionally alongside the existing notebook guard |
| `scripts/audits/verify-notebook-uuid-provenance-gate.sh` (new) | corpus-replay harness, sources the classifier verbatim, `--commits N` / `--file` / `--all-history` |
| `scripts/git-hooks/pre-commit-notebook-uuid-provenance.test.sh` (new) | 10-case regression suite |
| `.claude/skills/notebook-write/SKILL.md` | AC-1 cross-reference to the new mechanical backstop (mirrors the existing AC-2a cross-reference pattern) |
| `docs/architecture-briefs/2026-08-05-fix-agent-notebook-uuid-provenance-guard.md` (this file) | design record |

No production code, no service, no schema touched. `scripts/git-hooks/install.sh` requires no change (already symlinks `pre-commit` as a whole file).
