---
task: P2-A1
title: "Pre-revert tag + import-linter Fence-A/B in pyproject.toml"
owner: dev-pdf-extractor
goal: G4
status: DONE
date: "2026-05-24"
---

# P2-A1 — Ship Record

## Pre-CI Tag

```
git tag pdf-extractor-pre-ci
```

Tag `pdf-extractor-pre-ci` created and pointing to commit immediately before this
task's changes (HEAD at time of tag creation). No `--force`. No push.

## Contracts Added

Two `[tool.importlinter]` contracts appended to `apps/pdf-extractor/pyproject.toml`:

**Fence-A** — domain.primitives must NOT import infrastructure / application / interface:
```toml
[[tool.importlinter.contracts]]
name = "Fence-A: primitives must not import infrastructure, application, or interface"
type = "forbidden"
source_modules = ["domain.primitives"]
forbidden_modules = ["infrastructure", "application", "interface"]
```

**Fence-B** — domain.modules must NOT import infrastructure or interface:
```toml
[[tool.importlinter.contracts]]
name = "Fence-B: modules must not import infrastructure or interface; no cross-module imports"
type = "forbidden"
source_modules = ["domain.modules"]
forbidden_modules = ["infrastructure", "interface"]
```

Root packages: `["domain", "infrastructure", "application", "interface"]`
`include_external_packages = true`

## lint-imports Clean-Run Output (exit 0)

```
╔══╗─────────▶╔╗ ╔╗      ╔╗◀───┐
╚╣╠╝◀─────┐  ╔╝╚╗║║────▶╔╝╚╗   │
 ║║   ╔══╦══╦╩╗╔╝║║  ╔╦═╩╗╔╝╔═╦══╗
 ║║╔══╣╔╗║╔╗║╔╣║ ║║ ╔╬╣╔╗║║ ║│║╔═╝
╔╣╠╣║║║╚╝║╚╝║║║╚╗║╚═╝║║║║║╚╗║═╣║
╚══╩╩╩╣╔═╩══╩╝╚═╝╚═══╩╩╝╚╩═╩╩═╩╝
  └──▶║║                    ▲ 
      ╚╝────────────────────┘


---------
Contracts
---------

Analyzed 58 files, 77 dependencies.
-----------------------------------

Fence-A: primitives must not import infrastructure, application, or interface KEPT
Fence-B: modules must not import infrastructure or interface; no cross-module 
imports KEPT

Contracts: 2 kept, 0 broken.
```

Exit code: **0** — all contracts KEPT on clean codebase.

## AC Checklist

1. [x] `git tag pdf-extractor-pre-ci` created pointing to pre-change HEAD.
2. [x] `[tool.importlinter]` section in pyproject.toml with root_packages + 2 contracts.
3. [x] `lint-imports` exits 0 on clean codebase — 2 kept, 0 broken.
4. [x] `python3 -c "import tomllib; ..."` prints importlinter section — TOML valid.
5. [x] Fence-A: source_modules=domain.primitives, forbidden=infrastructure/application/interface.
6. [x] Fence-B: source_modules=domain.modules, forbidden=infrastructure/interface.

## pytest
114 passed — no regression.

## import-linter in requirements
- `pyproject.toml [project.optional-dependencies].dev` — `import-linter>=2.0` added.
- `requirements.txt` — `import-linter>=2.0` added under dev/testing section.
