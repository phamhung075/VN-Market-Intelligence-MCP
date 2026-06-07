## Task Report — SELF-CRITIQUE-DETECT Phase-1 QA Gate

**Sprint:** SELF-CRITIQUE-DETECT  
**Task:** QA gate before shadow-pilot arm  
**QA cycle:** 182 · 2026-06-01  
**Gate type:** PLAN-ONLY static read — no code executed, no merges, no deployments  
**SSOT brief:** `docs/architecture-briefs/2026-06-01-agent-self-critique-detect-source.md`  
**Verdict:** **PASS (both C1 and C5 fully satisfied)**  
**Shadow pilot status:** CLEARED TO ARM — PO conditions C1 and C5 verified. Operator greenlight required per brief §11.

---

## Files Read (raw verification — no badge relay)

| File | Line count verified |
|---|---|
| `.claude/skills/self-critique/SKILL.md` | 109L |
| `.claude/skills/cowork-end-cycle/SKILL.md` | 16L |
| `docs/agents/dev-team/flow/post-cycle.md` | 77L |
| `.claude/skills/commit-mutex/SKILL.md` | 196L |
| `docs/architecture-briefs/2026-06-01-agent-self-critique-detect-source.md` | 706L |

---

## C1 — Pilot-scope gate (commit 7818b4d4)

**Verdict: PASS**

### C1(a) — Allowlist is EXACTLY {news-scout, dev-team}

Evidence: `self-critique/SKILL.md` line 18:

```
If agent-id NOT IN {`news-scout`, `dev-team`} → log `"[self-critique] skip: agent <agent-id> outside C1 pilot scope"` → EXIT silently.
```

The allowlist contains exactly two entries: `news-scout` and `dev-team`. Not broader, not narrower. PASS.

### C1(b) — Pilot-scope gate is FIRST in SC-0 (before daily-cap glob)

Evidence: `self-critique/SKILL.md` Step SC-0 structure (lines 15–27):

```
Line 17-19: C1 SHADOW-PILOT SCOPE block → agent-id NOT IN {news-scout, dev-team} → EXIT
Line 22:    Glob docs/improvement-proposals/IMP-<YYYYMMDD>-<agent-id>-*.md  ← daily cap, SECOND
```

The allowlist check occupies lines 17–19. The daily-cap glob appears at line 22, AFTER the pilot-scope gate. A non-pilot agent exits at line 19 before ever executing the glob at line 22. Zero cost incurred. PASS.

### C1(c) — cowork-end-cycle routing: all non-pilot cowork agents hit the gate and EXIT

Evidence — activation path:

1. `cowork-end-cycle/SKILL.md` line 15: `4. **Self-critique** → skill: .claude/skills/self-critique/SKILL.md` — step 4 calls the skill for ALL cowork agents (~10 total).
2. `self-critique/SKILL.md` SC-0 lines 17–19: allowlist check fires immediately. Agents whose id is NOT `news-scout` receive `EXIT silently`.

Confirmed: market-watcher, unified-agent, and all other cowork agents that are not `news-scout` are called through cowork-end-cycle Step 4 → hit SC-0 line 18 → EXIT before SC-1. There is no alternate path into SC-1 through SC-6 visible in any of the three edited files. PASS.

### C1(d) — dev-team passes the gate

Evidence:

1. `post-cycle.md` line 60: `**Self-critique** → skill: .claude/skills/self-critique/SKILL.md` — dev-team post-cycle.md calls the skill.
2. `self-critique/SKILL.md` SC-0 line 18: `NOT IN {news-scout, dev-team}` — `dev-team` is explicitly listed. It does NOT trigger the EXIT. Execution continues past the allowlist gate into the daily-cap check and then SC-1. PASS.

**C1 overall: PASS — all four sub-conditions satisfied.**

---

## C5 — Commit batching (no -A/., no half-staged index)

**Verdict: PASS**

### C5(a) — SC-5 commits ONLY explicit paths, never -A or .

Evidence: `self-critique/SKILL.md` SC-5 lines 84–91:

```
own_paths: [docs/improvement-proposals/<ID>.md, docs/signals/DASHBOARD.md]
intent:    "chore(improve): self-critique draft <ID>"
NEVER `-A` or `.` — explicit paths only (C5 safety invariant).
```

The comment `NEVER \`-A\` or \`.\`` is embedded directly in the SC-5 step text. The step delegates to `commit-mutex/SKILL.md`, which in its Step 3 critical-section header (line 91) reads:
```
# 3a. Stage own files — EXPLICIT PATHS ONLY. NEVER -A / . / dir
```

Two independent layers prohibit `-A`/`.`: the SC-5 text itself, and the commit-mutex SKILL it delegates to. PASS.

### C5(b) — On-error path releases mutex and EXITs without half-staged index

Evidence: `self-critique/SKILL.md` SC-5 line 91:

```
On error: release mutex, EXIT — do not leave a half-staged index.
```

The invoked skill (`commit-mutex/SKILL.md`) enforces this contractually at Step 4 (lines 129–135):

```
Release MUST be called on every exit path from Step 3 (success, foreign-abort, error).
```

And at Step 3 lines 96–100: the foreign-restore rule explicitly uses `git restore --staged <foreign-path>` before aborting, then goes to Step 4 (release). The commit-mutex skill's Step 2 give-up path (all 6 retries exhausted) also does NOT stage (line 81: "Do NOT stage."). No half-staged index path exists in either the SC-5 text or the commit-mutex protocol. PASS.

### C5(c) — SC-5 invocation contract matches what commit-mutex actually expects

Contract cross-check — SC-5 invocation vs commit-mutex schema:

| Parameter | SC-5 text (self-critique/SKILL.md line 87–90) | commit-mutex expects (SKILL.md lines 27–33) | Match? |
|---|---|---|---|
| skill path | `.claude/skills/commit-mutex/SKILL.md` | `.claude/skills/commit-mutex/SKILL.md` | YES |
| `own_paths` | `[docs/improvement-proposals/<ID>.md, docs/signals/DASHBOARD.md]` | `own_paths: ["<path1>", "<path2>", ...]` (wiring pattern line 146) | YES |
| `intent` | `"chore(improve): self-critique draft <ID>"` | `intent: "<one-line commit summary>"` (wiring pattern line 147) | YES |
| `owner_agent` field name | not named in SC-5 wiring text — inherited from skill Step 1 | `owner_agent` REQUIRED (NOT `owner`) at line 31 | NOTE BELOW |
| `ttl_seconds` | not named in SC-5 wiring text — inherited from skill Step 1 | `ttl_seconds: 60` (min 60) at lines 29–32 | NOTE BELOW |

**Note on owner_agent and ttl_seconds:** SC-5 does not specify `owner_agent` or `ttl_seconds` in its wiring block — it delegates entirely to the commit-mutex skill via `→ skill: .claude/skills/commit-mutex/SKILL.md`. The commit-mutex SKILL.md Step 1 (line 31) hard-codes `owner_agent: "<your-agent-id>"` and `ttl_seconds: 60` as part of the skill's own Step 1 acquire protocol. SC-5 passes `own_paths` and `intent` as caller-supplied parameters per the wiring pattern (commit-mutex lines 146–147). The skill itself supplies `owner_agent` (from the invoking agent's id) and `ttl_seconds: 60`.

This is the correct and standard invocation pattern — matching how all other flows wire to commit-mutex (e.g., `qa/flow/main.md` lines 190–195 also only supply `own_paths` and intent, relying on the skill for the rest). The contract is consistent. PASS.

**C5 overall: PASS — all three sub-conditions satisfied.**

---

## Safety Invariants S1–S5 Spot-Check

| Invariant | Brief location | Skill location | Consistent? |
|---|---|---|---|
| S1 PLAN-ONLY (no auto-repair, no flow/.md edits, no DB mutations, no spawned agents) | §5 S1, lines 206–218 | SKILL.md line 104 + header lines 11–13 | YES — both enumerate same forbidden ops |
| S2 NO SELF-APPROVE / NO SELF-IMPLEMENT | §5 S2, lines 228–235 | SKILL.md line 105 | YES — both present |
| S3 NO SHELL INTERPOLATION | §5 S3, lines 244–249 | SKILL.md line 75 + line 107 | YES — SC-3 explicitly states "Write via Write tool — NEVER interpolate payload through a shell (S3 guard)" |
| S4 SILENT ON CLEAN CYCLE + daily cap | §5 S4, lines 255–265 | SKILL.md lines 41 ("If NONE fired → EXIT silently"), SC-0 daily-cap glob lines 22–23 | YES — both enforce the cap and the silent-on-clean rule |
| S5 COMMIT SAFETY (mutex + explicit paths, no half-stage) | §5 S5, lines 269–275 | SKILL.md lines 108, SC-5 lines 84–91 | YES — consistent across brief and skill |

All five safety invariants are present in both the brief and the skill, and are consistent with each other. No drift detected.

Additional: S3 anchor is present in `self-critique/SKILL.md` SC-3 line 75: `Write via Write tool — NEVER interpolate payload through a shell (S3 guard)`. The fleet incident (signal-payload shell injection, `feedback_signal_payload_shell_injection`) is correctly mitigated.

---

## Summary

| Condition | Verdict | Blocking defects |
|---|---|---|
| C1(a) allowlist exactly {news-scout, dev-team} | PASS | none |
| C1(b) gate is first in SC-0 before daily cap | PASS | none |
| C1(c) non-pilot cowork agents hit gate and exit | PASS | none |
| C1(d) dev-team passes the gate | PASS | none |
| C5(a) explicit paths only, never -A/. | PASS | none |
| C5(b) on-error releases mutex, no half-staged index | PASS | none |
| C5(c) invocation contract matches commit-mutex schema | PASS | none |
| S1–S5 spot-check | PASS | none |

**QA VERDICT: PASS**

Both PO conditions C1 and C5 are verified by raw file reads. No defects found. No fixes required.

**Shadow pilot CLEARED TO ARM** — subject only to the operator greenlight already required by brief §11 (`This APPROVAL does NOT release implementation. It stays BLOCKED for the operator's final greenlight`). Do NOT arm until operator explicitly greenlights.
