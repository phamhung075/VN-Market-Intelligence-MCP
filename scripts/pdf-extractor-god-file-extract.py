#!/usr/bin/env python3
"""
scripts/pdf-extractor-god-file-extract.py — FACTORY-PDF-split-generic-md-table

Reusable line-accurate extraction helper for splitting
apps/pdf-extractor/infrastructure/generic_md_table_extractor.py into the
infrastructure/generic_md_table/ package (staged, one sub-module per commit).

Uses `ast` to find the exact [lineno, end_lineno] span of each named top-level
def/class in the source file (Python 3.8+ gives exact end lines — no manual
line-counting, no risk of accidentally including/excluding adjacent comments
that belong to a different symbol).

Usage:
    # Print the extracted source for the given top-level names, in the order given,
    # separated by two blank lines (does NOT modify the source file):
    python3 scripts/pdf-extractor-god-file-extract.py extract <src.py> NAME [NAME ...]

    # Remove the given top-level names from the source file in place (bottom-to-top
    # so earlier spans stay valid), leaving everything else untouched. Does NOT
    # insert a replacement import — that is added separately (by hand) so the
    # import statement can be reviewed and placed sensibly:
    python3 scripts/pdf-extractor-god-file-extract.py remove <src.py> NAME [NAME ...]

    # List every top-level def/class name + line span (diagnostic):
    python3 scripts/pdf-extractor-god-file-extract.py list <src.py>

Owning task: FACTORY-PDF-split-generic-md-table (docs/architecture-briefs/
2026-06-15-maintainability-factory-audit.md). One-shot tool for this split;
kept in scripts/ per docs/policies/dev-standards.md Script Persistence in case
a similar god-file split needs the same line-accurate extraction approach.
"""

from __future__ import annotations

import ast
import sys


def _spans(src_path: str) -> dict:
    src = open(src_path, encoding="utf-8").read()
    tree = ast.parse(src)
    lines = src.splitlines(keepends=True)
    out = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
            out[node.name] = (node.lineno, node.end_lineno, lines)
    return out


def cmd_list(src_path: str) -> None:
    spans = _spans(src_path)
    for name, (s, e, _lines) in spans.items():
        print(f"{name}\t{s}\t{e}\t{e - s + 1}L")


def cmd_extract(src_path: str, names: list) -> None:
    spans = _spans(src_path)
    parts = []
    for name in names:
        if name not in spans:
            raise SystemExit(f"not found in {src_path}: {name}")
        s, e, lines = spans[name]
        parts.append("".join(lines[s - 1:e]))
    sys.stdout.write("\n\n".join(parts) + "\n")


def cmd_remove(src_path: str, names: list) -> None:
    spans = _spans(src_path)
    for name in names:
        if name not in spans:
            raise SystemExit(f"not found in {src_path}: {name}")
    # Remove bottom-to-top so earlier (lower-numbered) spans stay valid.
    targets = sorted((spans[n][0], spans[n][1]) for n in names)
    src = open(src_path, encoding="utf-8").read()
    all_lines = src.splitlines(keepends=True)
    for s, e in sorted(targets, reverse=True):
        del all_lines[s - 1:e]
    open(src_path, "w", encoding="utf-8").writelines(all_lines)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    mode, src_path, *rest = sys.argv[1:]
    if mode == "list":
        cmd_list(src_path)
    elif mode == "extract":
        cmd_extract(src_path, rest)
    elif mode == "remove":
        cmd_remove(src_path, rest)
    else:
        raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    main()
