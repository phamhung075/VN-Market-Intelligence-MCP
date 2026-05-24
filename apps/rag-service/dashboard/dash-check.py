#!/usr/bin/env python3
"""
dash-check.py — AI/CI health inspector for rag-service Scenario Trust Dashboard.

Parses apps/rag-service/dashboard/index.html statically:
  - Verifies 3 panels exist (Primitives, Module, Microservice)
  - Reads inline <script type="application/json"> trace blocks
  - Confirms all 5 primitive traces: passed=true (GREEN — Phase 2 full)
  - Confirms module-full trace: passed=true
  - Confirms microservice card has no trace (honest NOT-RUN, no false-green)
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
# Phase 2: all 5 primitive traces + module-full trace must have passed=true
EXPECTED_GREEN = {
    "trace-similarity-scorer-golden": "similarity_scorer",          # P1-B
    "trace-relevance-threshold-gate-golden": "relevance_threshold_gate",  # P2-B1
    "trace-top-k-selector-golden": "top_k_selector",                # P2-B2
    "trace-context-window-packer-golden": "context_window_packer",  # P2-B3
    "trace-temporal-decay-scorer-golden": "temporal_decay_scorer",  # P2-B4
    "trace-module-full-golden": "retrieval",                        # P2-C full pipeline
}

# Phase 2: all primitives have traces now — EXPECTED_NOT_RUN is empty for primitives.
# Only microservice is NOT-RUN.
EXPECTED_NOT_RUN_PRIMITIVES: list[str] = []  # Phase 2: all 5 are GREEN

# Microservice must NOT have a trace (honest NOT-RUN)
EXPECTED_MICROSERVICE_NOT_RUN = "trace-microservice-rag-service"

# Required panel ids
EXPECTED_PANELS = [
    "panel-primitives",
    "panel-module",
    "panel-microservice",
]

# Required primitive card names in HTML
EXPECTED_PRIMITIVE_NAMES = [
    "similarity-scorer",
    "relevance-threshold-gate",
    "temporal-decay-scorer",
    "top-k-selector",
    "context-window-packer",
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
    for pname in EXPECTED_PRIMITIVE_NAMES:
        if pname in html:
            passes.append(f"Primitive card name {pname!r} found")
        else:
            fails.append(f"Primitive card name {pname!r} NOT found")

    # ── 4. Extract inline JSON traces ────────────────────────────────────────
    parser = InlineScriptExtractor()
    parser.feed(html)
    extracted = parser.scripts

    # ── 5. Verify all 5 primitive traces + module-full are GREEN (passed=true) ─
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

    # ── 6. Microservice card must NOT have a live trace (honest NOT-RUN) ──────
    # The microservice panel shows NOT-RUN until live HTTP wiring is proven.
    if EXPECTED_MICROSERVICE_NOT_RUN in extracted:
        fails.append(
            f"Microservice has an inline trace {EXPECTED_MICROSERVICE_NOT_RUN!r} — "
            "check if this is a false-green (G8 violation if trace not from live run)"
        )
    else:
        passes.append("Microservice card: no inline trace (honest NOT-RUN — G8 policy)")

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
    # Microservice panel is honest NOT-RUN — no fetch() to port 5002
    if "localhost:5002" in html or "127.0.0.1:5002" in html:
        fails.append(
            "Live HTTP call to port 5002 detected — microservice panel must remain "
            "NOT-RUN until live trace is available (G8 honesty)"
        )
    else:
        passes.append("No live HTTP call to port 5002 (microservice panel is honestly NOT-RUN)")

    # ── 9. Phase 2: all 5 primitive trace IDs are wired in JS ─────────────────
    # Verify the traceId strings appear in the JS PRIMITIVE_CARDS array
    for trace_id in EXPECTED_GREEN:
        if "retrieval" in trace_id:
            continue  # Module traces checked separately
        if trace_id in html:
            passes.append(f"Primitive traceId {trace_id!r} wired in JS PRIMITIVE_CARDS")
        else:
            fails.append(f"Primitive traceId {trace_id!r} NOT found in HTML — JS not wired")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n[dash-check] rag-service Dashboard Analysis (Phase 2)")
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
        print("\n[dash-check] Panel summary (Phase 2 full):")
        print("  Primitives panel:")
        print("    similarity-scorer          GREEN  (trace passed=true — P1-B)")
        print("    relevance-threshold-gate   GREEN  (trace passed=true — P2-B1)")
        print("    temporal-decay-scorer      GREEN  (trace passed=true — P2-B4)")
        print("    top-k-selector             GREEN  (trace passed=true — P2-B2)")
        print("    context-window-packer      GREEN  (trace passed=true — P2-B3)")
        print("  Module panel:")
        print("    retrieval                  GREEN  (trace passed=true — P2-C full pipeline)")
        print("  Microservice panel:")
        print("    rag-service (port 5002)    NOT-RUN  (honest — no live HTTP trace)")

    return verdict == "PASS"


if __name__ == "__main__":
    ok = check_dashboard()
    sys.exit(0 if ok else 1)
