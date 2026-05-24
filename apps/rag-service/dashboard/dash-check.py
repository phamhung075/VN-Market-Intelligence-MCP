#!/usr/bin/env python3
"""
dash-check.py — AI/CI health inspector for rag-service Scenario Trust Dashboard.

Parses apps/rag-service/dashboard/index.html statically:
  - Verifies 3 panels exist (Primitives, Module, Microservice)
  - Reads inline <script type="application/json"> trace blocks
  - Confirms similarity-scorer trace: passed=true
  - Confirms retrieval module trace: passed=true
  - Confirms NOT-RUN primitives have no trace (no false-greens)
  - Confirms SI-2 boundary comment is present
  - Zero network calls — reads only the local file

Exit codes:
  0 — PASS
  1 — FAIL

Usage:
  python3 apps/rag-service/dashboard/dash-check.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from html.parser import HTMLParser
from typing import Any, Optional


DASHBOARD_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_HTML = os.path.join(DASHBOARD_DIR, "index.html")

# ── Expected honesty contract ────────────────────────────────────────────────
# These trace IDs must have passed=true
EXPECTED_GREEN = {
    "trace-similarity-scorer-golden": "similarity_scorer",
    "trace-module-golden": "retrieval",
}

# These primitive names must NOT have a green trace (honest NOT-RUN)
EXPECTED_NOT_RUN = [
    "relevance-threshold-gate",
    "temporal-decay-scorer",
    "top-k-selector",
    "context-window-packer",
]

# Required panel ids
EXPECTED_PANELS = [
    "panel-primitives",
    "panel-module",
    "panel-microservice",
]

# SI-2 boundary marker
SI2_MARKER = "SI-2: This dashboard is rag-service-EXCLUSIVE"


class InlineScriptExtractor(HTMLParser):
    """Extract content of <script id=X type='application/json'> blocks."""

    def __init__(self) -> None:
        super().__init__()
        self._current_id: Optional[str] = None
        self._capture = False
        self.scripts: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag != "script":
            return
        attr_dict = dict(attrs)
        if attr_dict.get("type") == "application/json":
            sid = attr_dict.get("id", "")
            self._current_id = sid
            self._capture = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._capture = False
            self._current_id = None

    def handle_data(self, data: str) -> None:
        if self._capture and self._current_id:
            self.scripts[self._current_id] = data


def check_dashboard() -> bool:
    if not os.path.exists(INDEX_HTML):
        print(f"[dash-check] FAIL: index.html not found at {INDEX_HTML}")
        return False

    with open(INDEX_HTML, encoding="utf-8") as fh:
        html = fh.read()

    fails: list[str] = []
    passes: list[str] = []

    # ── 1. SI-2 boundary comment ──────────────────────────────────────────────
    if SI2_MARKER in html:
        passes.append("SI-2 boundary comment present")
    else:
        fails.append(f"SI-2 boundary comment missing (expected: {SI2_MARKER!r})")

    # ── 2. Three panels ──────────────────────────────────────────────────────
    for panel_id in EXPECTED_PANELS:
        if f'id="{panel_id}"' in html:
            passes.append(f"Panel {panel_id!r} found")
        else:
            fails.append(f"Panel {panel_id!r} NOT found in HTML")

    # ── 3. Five primitive card names ─────────────────────────────────────────
    five_prims = [
        "similarity-scorer",
        "relevance-threshold-gate",
        "temporal-decay-scorer",
        "top-k-selector",
        "context-window-packer",
    ]
    for pname in five_prims:
        if pname in html:
            passes.append(f"Primitive card name {pname!r} found")
        else:
            fails.append(f"Primitive card name {pname!r} NOT found")

    # ── 4. Extract inline JSON traces ────────────────────────────────────────
    parser = InlineScriptExtractor()
    parser.feed(html)
    extracted = parser.scripts

    # ── 5. Verify green traces are actually passed=true ──────────────────────
    for trace_id, expected_primitive in EXPECTED_GREEN.items():
        raw = extracted.get(trace_id)
        if raw is None:
            fails.append(
                f"Inline trace script #{trace_id!r} NOT found — cannot verify honesty"
            )
            continue
        try:
            trace: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError as exc:
            fails.append(f"Inline trace #{trace_id!r} invalid JSON: {exc}")
            continue

        if trace.get("passed") is True:
            prim = trace.get("primitive", "?")
            passes.append(
                f"Trace #{trace_id!r}: passed=true, primitive={prim!r} — GREEN is honest"
            )
        else:
            fails.append(
                f"Trace #{trace_id!r}: passed={trace.get('passed')!r} — "
                f"not green-worthy but would display as green (G8 violation)"
            )

    # ── 6. Verify NOT-RUN primitives have no inline trace ────────────────────
    for pname in EXPECTED_NOT_RUN:
        # Derive expected trace-id pattern (normalise name)
        norm = pname.replace("-", "_")
        potential_id = f"trace-{norm}-golden"
        if potential_id in extracted:
            fails.append(
                f"NOT-RUN primitive {pname!r} has an inline trace {potential_id!r} — "
                "this could be a false-green (G8 violation)"
            )
        else:
            passes.append(f"Primitive {pname!r}: no inline trace (honest NOT-RUN)")

    # ── 7. Zero external URLs ─────────────────────────────────────────────────
    # Check for CDN-style URLs in HTML (data: and file: are fine)
    cdn_patterns = [
        r'https?://',  # Any http/https URL
    ]
    cdn_found = []
    for pat in cdn_patterns:
        matches = re.findall(pat, html)
        cdn_found.extend(matches)

    if cdn_found:
        fails.append(
            f"External URLs found ({len(cdn_found)} occurrences of http/https) — "
            "dashboard must be zero-network (G6)"
        )
    else:
        passes.append("Zero external URLs in HTML (G6 file:// compatible)")

    # ── 8. No hardcoded port-5002 HTTP call ──────────────────────────────────
    if "localhost:5002" in html or "127.0.0.1:5002" in html:
        fails.append("Live HTTP call to port 5002 detected — microservice panel must be NOT-RUN in Phase 1 (G8)")
    else:
        passes.append("No live HTTP call to port 5002 (microservice panel is honestly NOT-RUN)")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n[dash-check] rag-service Dashboard Analysis")
    print("=" * 60)
    for p in passes:
        print(f"  PASS  {p}")
    for f in fails:
        print(f"  FAIL  {f}")
    print("=" * 60)

    verdict = "PASS" if not fails else "FAIL"
    print(f"\n[dash-check] Verdict: {verdict}")
    print(f"  {len(passes)} checks passed, {len(fails)} checks failed")

    if verdict == "PASS":
        print("\n[dash-check] Panel summary:")
        print("  Primitives panel:")
        print("    similarity-scorer     GREEN  (trace passed=true)")
        print("    relevance-threshold-gate  NOT-RUN  (Phase 2)")
        print("    temporal-decay-scorer     NOT-RUN  (Phase 2)")
        print("    top-k-selector            NOT-RUN  (Phase 2)")
        print("    context-window-packer     NOT-RUN  (Phase 2)")
        print("  Module panel:")
        print("    retrieval             GREEN  (trace passed=true)")
        print("  Microservice panel:")
        print("    rag-service (port 5002)  NOT-RUN  (Phase 2 composition-root)")

    return verdict == "PASS"


if __name__ == "__main__":
    ok = check_dashboard()
    sys.exit(0 if ok else 1)
