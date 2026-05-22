---
title: "Phase 0 Exit Gate — technical-analysis pilot"
date: "2026-05-22"
author: "qa"
task: "Phase-0-exit-gate"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
---

# Phase 0 Exit Gate — technical-analysis Pilot

**Verified:** 2026-05-22T20:00Z
**QA Session:** c262
**Charter:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`

---

## Overall Verdict: PASS

All 4 gates pass. Cleared for PO sign-off.

---

## Gate 1: `docs/data/bug-inventory.json`

**Verdict: PASS**

### Verification commands and output

```bash
$ python3 -c "import json; d=json.load(open('docs/data/bug-inventory.json')); bugs=d['bugs']; print(f'count: {len(bugs)}'); print(f'baselineCapturedAt: {d[\"baselineCapturedAt\"]}'); print(f'baselineCycleCount: {d[\"baselineCycleCount\"]} ({type(d[\"baselineCycleCount\"]).__name__})')"
count: 29
baselineCapturedAt: 2026-05-22T19:28:05Z
baselineCycleCount: 1.5 (float)
```

```bash
$ python3 -c "... required=['id','module','fixCycles','date','resolved','evidence']; [check schema per bug]"
All required fields present per task spec
Bug count: 29 (>= 20: True)
Open (resolved=false) bugs: 11
```

### Checklist

| Check | Result |
|---|---|
| File exists | PASS |
| Valid JSON | PASS |
| bugs[] count >= 20 | PASS — 29 bugs |
| Schema: baselineCapturedAt | PASS — "2026-05-22T19:28:05Z" |
| Schema: windowDays | PASS — 60 |
| Schema: bugs[].id | PASS — all 29 present |
| Schema: bugs[].module | PASS — all 29 present |
| Schema: bugs[].fixCycles | PASS — all 29 present |
| Schema: bugs[].date | PASS — all 29 present |
| Schema: bugs[].resolved | PASS — all 29 present |
| Schema: bugs[].evidence | PASS — all 29 present |
| baselineCycleCount numeric | PASS — 1.5 (float) |
| Open bugs marked resolved=false | PASS — 11 open bugs explicitly marked resolved=false |

**Note:** The charter minimum schema uses `"status": "open|resolved"` string but the task spec requires `resolved: bool`. The actual file uses `resolved: boolean` — this matches the task spec check fields exactly. All open bugs (e.g., `1967-10-ITEM-18-isRunning-guard`, `A-21-vnstockFundamentalsRefresh-crash`, `1953-G-FAIL-BCTC-stale`, etc.) are explicitly `resolved: false`.

---

## Gate 2: `docs/data/pilot-status.json`

**Verdict: PASS**

### Verification commands and output

```bash
$ python3 -c "import json; s=json.load(open('docs/data/pilot-status.json')); print(f'goals: {len(s[\"goals\"])}')"
goals: 12
```

```bash
# Title cross-check (all 12 against charter word-for-word)
G1 [A] status=TBD | match=True
G2 [A] status=TBD | match=True
G3 [A] status=TBD | match=True
G4 [A] status=TBD | match=True
G5 [A] status=TBD | match=True
G6 [B] status=TBD | match=True
G7 [B] status=TBD | match=True
G8 [B] status=TBD | match=True
G9 [B] status=TBD | match=True
G10 [C] status=TBD | match=True
G11 [C] status=TBD | match=True
G12 [C] status=TBD | match=True
All 12 goal titles match charter: PASS

# Decision matrix
decisionMatrix keys: ['speed', 'trust', 'scale', '3yes', '2yes', '0-1yes']
3yes: scale | 2yes: rescope | 0-1yes: stop-MVR
```

### Checklist

| Check | Result |
|---|---|
| File exists | PASS |
| Valid JSON | PASS |
| goals[] exactly 12 entries (G1-G12) | PASS |
| All goals initial status = TBD | PASS — all 12 status=TBD |
| Track field present per goal (A/B/C) | PASS — G1-G5=A, G6-G9=B, G10-G12=C |
| Goal titles match charter EXACTLY (word-for-word) | PASS — all 12 match verbatim |
| decisionMatrix section present | PASS |
| decisionMatrix: 3yes outcome | PASS — "scale" |
| decisionMatrix: 2yes outcome | PASS — "rescope" |
| decisionMatrix: 0-1yes outcome | PASS — "stop-MVR" |

**Note:** The charter minimum schema shows `goals` as a flat dict `{"G1": "TBD", ...}`. The actual implementation uses an enriched array format with `{id, track, title, status, verifiedAt, verifiedBy, evidence}` per goal. This is a superset of the charter minimum — it satisfies all charter requirements and adds tracking fields. The task spec requirements (12 entries, all TBD, track field, titles match, decisionMatrix) are fully met.

---

## Gate 3: `.claude/flows/dev-technical-analysis/main.md` + `.claude/agents/dev-technical-analysis.md`

**Verdict: PASS**

### Verification commands and output

```bash
$ ls -la .claude/flows/dev-technical-analysis/main.md
-rw-r--r-- 1 admin staff 1282 22 mai 21:28 .claude/flows/dev-technical-analysis/main.md

$ ls -la .claude/agents/dev-technical-analysis.md
-rw-r--r-- 1 admin staff 7095 20 mai 22:36 .claude/agents/dev-technical-analysis.md
```

```bash
# G12 verbatim check
$ grep "MUST run pilot scenarios" .claude/flows/dev-technical-analysis/main.md
> MUST run pilot scenarios + verify dashboard green before reporting task complete
# Exact match: PASS
```

```bash
# trigger: startup check
$ grep "trigger: startup" .claude/flows/dev-technical-analysis/main.md
(no output — 0 results)
# PASS
```

```bash
# Blocking section placement
$ grep -n "blocking\|Pilot Hard Rule\|G12" .claude/flows/dev-technical-analysis/main.md
17:## Pilot Hard Rule (G12 — blocking)
29:Reference: docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md §G12
```

```bash
# Agent file frontmatter
$ head -8 .claude/agents/dev-technical-analysis.md
---
name: dev-technical-analysis
color: green
description: Technical Analysis Developer. RSI, MACD, Bollinger Bands, indicator calculation expert.
tools: Read, Edit, Write, Glob, Grep, Bash
model: sonnet
---
```

### Checklist

| Check | Result |
|---|---|
| Flow file exists | PASS — `.claude/flows/dev-technical-analysis/main.md` |
| Flow: no `trigger: startup` | PASS — 0 results |
| Flow: G12 rule VERBATIM present | PASS — line 19: "> MUST run pilot scenarios + verify dashboard green before reporting task complete" |
| Flow: G12 in blocking section (not buried in prose) | PASS — under `## Pilot Hard Rule (G12 — blocking)` heading at line 17 with explicit `(blocking)` label |
| Agent file exists | PASS — `.claude/agents/dev-technical-analysis.md` |
| Agent file: YAML frontmatter | PASS — name/color/description/tools/model all present |
| Agent file: lazy_load tags | PASS — both always_load and lazy_load sections present |
| Agent file: no `trigger: startup` in lazy_load | PASS — no startup triggers found |

**Note on flow "frontmatter":** The dev-technical-analysis flow is a thin-pointer file (1282 bytes, 35 lines). It follows the same pattern as all 9 sister dev-* zone flows (dev-stock-price, dev-kinh-dich, etc.) which do not carry YAML frontmatter at the file level — the metadata lives in the agent definition file. This is the established factory pattern for thin-pointer flows in this project. No finding.

---

## Gate 4: `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`

**Verdict: PASS**

### Verification commands and output

```bash
$ ls -la docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md
-rw-r--r-- 1 admin staff 16729 22 mai 21:29 p0-4-composition-root-plan.md
```

```bash
# Source files: actual vs plan coverage
Actual source files (9):
  src/application/dtos.ts
  src/application/usecases.ts
  src/domain/models.ts
  src/domain/repositories.ts
  src/domain/services.ts
  src/index.ts
  src/infrastructure/calculator.ts
  src/infrastructure/repositories.ts
  src/interface/handlers.ts
All actual files covered in plan: PASS
```

```bash
# No changes in apps/technical-analysis/ (read-only gate)
$ git status -- apps/technical-analysis/
Sur la branche main
rien à valider, la copie de travail est propre
# PASS — working tree clean for that path
```

### Checklist

| Check | Result |
|---|---|
| File exists | PASS — 16729 bytes |
| Covers all 9 source files in `apps/technical-analysis/src/` | PASS — exact 1:1 match |
| Migration steps are concrete (named files, not vague verbs) | PASS — 6 steps: CREATE composition-root.ts, MODIFY package.json (before/after JSON shown), MODIFY Dockerfile (before/after shown), DELETE src/index.ts, run tests + tsc, CREATE openapi.yaml |
| Risk assessment present | PASS — §8 "Risk Assessment Per File Touched" covers all 5 touched files with risk level + mitigation |
| Sprint sequence estimate present | PASS — §11 "Sprint Sequence" with 7 steps (P1-A through P1-G), owner and time estimate per step (~1 hour total) |
| No edits to `apps/technical-analysis/` | PASS — `git status -- apps/technical-analysis/` reports clean working tree; last commit touching that path is `9f1b5392` (candlestick/RSI/MACD charts — pre-pilot) |

**Notable quality:** The plan includes §10 "G3 Acceptance Gates" — a QA verification checklist with 6 shell commands ready to run. This is above the minimum requirement and will accelerate Phase 1 QA.

---

## Summary Matrix

| Gate | File | Verdict | Blocking Issues |
|---|---|---|---|
| Gate 1 | `docs/data/bug-inventory.json` | PASS | 0 |
| Gate 2 | `docs/data/pilot-status.json` | PASS | 0 |
| Gate 3 | `.claude/flows/dev-technical-analysis/main.md` + agent | PASS | 0 |
| Gate 4 | `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md` | PASS | 0 |

**Overall: PASS**

All 4 gates pass. Zero blocking issues. Zero conditional items.

**Cleared for PO sign-off.**

---

## Next Action

Dispatch PM/PO to:
1. Record pilot kickoff sprint number in `docs/data/pilot-status.json` (`sprintKickoff` + `sprintDeadline` fields currently TBD)
2. Assign Phase 1 tasks to `dev-technical-analysis` agent starting with P1-A (create `composition-root.ts`)
3. Set pilot deadline = kickoff sprint + 6
