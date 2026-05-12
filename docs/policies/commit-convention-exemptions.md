# Commit Convention — Exemptions

> Parent: [commit-convention.md](./commit-convention.md)

**Load when:** you are unsure whether a commit needs the `Sprint:` / `Task:` / `AC:` trailers (no-sprint chores, cycle bookkeeping, merge commits).

---

## No-Sprint Rule

Commits with no sprint context (hotfix, doc tweak, repo maintenance): **omit Sprint/Task/AC trailers entirely**. Use the scope to carry context instead:

```
fix(infra/docker): correct volume mount path
docs(knowledge/commit-convention): fix worked example typo
chore(vps): rotate Vinahost SSH key
```

---

## C3-Exempt Commit Categories

These commit types carry `Task:` trailer for tracking but are **not required** to carry `AC:` trailer — the auditor skips them:

| Pattern | Example | Reason |
|---|---|---|
| `chore(memory/<id>): ...` | `chore(memory/qa): notebook 2026-05-11` | Notebook commit, no task delivery |
| `chore(state...): ...` | `chore(state): 1877c → In Progress` | Pipeline bookkeeping |
| Subject contains `merge task/` | `chore(1869/mcp-server): merge task/1869a-...` | AC lives on the feat/fix commit |

---

## C2-Exempt Commit Categories

These commit types are excluded from the C2 denominator — they contain a digit in scope but do not deliver sprint tasks:

| Pattern | Example | Reason |
|---|---|---|
| `chore(cycle-NN): ...` | `chore(cycle-28): persist 1872a artifacts` | Digit is cycle number, not sprint ID |
| `chore(pm/cNN): ...` | `chore(pm/c26): add Done rows from TNB c36` | Digit is cycle reference |
| `chore(pm/NNNN*): ...` | `chore(pm/1862c): decompose RCA brief` | PM sprint bookkeeping, no code delivery |
| Sprint-scoped chore containing `merge task/` | `chore(1869/mcp-server): merge task/1869b-...` | AC lives on the feat/fix commit |
