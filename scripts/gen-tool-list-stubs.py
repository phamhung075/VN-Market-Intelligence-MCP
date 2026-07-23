#!/usr/bin/env python3
"""
scripts/gen-tool-list-stubs.py

Reusable, idempotent generator for docs/agents/tools/list/<tool>.md stubs.

SSOT for "which tools need a stub": docs/data/tool-registry.json vs the
basenames already present under docs/agents/tools/list/ (INDEX.md excluded).
Re-running only mints the CURRENT missing delta — it never overwrites an
existing stub file. The "26" in the T-28 title is a snapshot, not a
hardcoded constant: the diff is always computed live against both files.

Live schema source: MCP gateway meta-tool `list_server_tools`
(server="vn-market"), reached via the shared bash bridge
scripts/agents-flow/mcp-call.sh's mcp_call_gateway_meta() function — this
script never re-implements the gateway session/HTTP transport (architect
risk note R1, see that file's header comment).

Usage:
  python3 scripts/gen-tool-list-stubs.py              # live run, writes missing stubs
  python3 scripts/gen-tool-list-stubs.py --dry-run     # print the missing set, write nothing

Env overrides (testing / offline use — mirrors the ORCH_APPLY_LIVE_FILE_OVERRIDE
convention used elsewhere in this repo):
  TOOL_SCHEMA_JSON_OVERRIDE=<path>   pre-fetched list_server_tools JSON payload
                                     ({"server": "...", "tools": [...]}) — skips
                                     the live gateway call entirely.

No-fabrication contract: every stub is built ONLY from tool-registry.json group
membership + the live JSON-Schema (name / description / input_schema). If the
live schema cannot be fetched, or a specific missing tool is absent from the
live listing, the stub is STILL emitted (registry metadata only) but clearly
flagged "LIVE SCHEMA UNAVAILABLE" with zero fabricated parameter rows — the
flow doc re-runs this script later to backfill the real signature.

Owning task: TE-T28 — docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-28
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY = REPO_ROOT / "docs/data/tool-registry.json"
LIST_DIR = REPO_ROOT / "docs/agents/tools/list"
MCP_CALL_BRIDGE = REPO_ROOT / "scripts/agents-flow/mcp-call.sh"

# Section-label keywords that terminate a "Returns:" extraction (these
# descriptions run multiple labelled clauses together in one paragraph).
RETURNS_STOP_KEYWORDS = [
    "Honest-NULL:",
    "Error:",
    "Source tier:",
    "Package destination:",
    "Gauge dependency:",
    "IMPORTANT:",
    "NOTE:",
]

SNAPSHOT_MISSING_COUNT = 26  # T-28 brief snapshot — informational only, never gates behavior


def load_registry_tools():
    data = json.loads(REGISTRY.read_text())
    names = sorted({t for g in data["groups"] for t in g["tools"]})
    name_to_group = {t: g["name"] for g in data["groups"] for t in g["tools"]}
    return names, name_to_group


def load_existing_stubs():
    return sorted(p.stem for p in LIST_DIR.glob("*.md") if p.stem != "INDEX")


def fetch_live_schema():
    """Returns {tool_name: schema_dict}, or {} if the live fetch fails."""
    override = os.environ.get("TOOL_SCHEMA_JSON_OVERRIDE")
    if override:
        raw = Path(override).read_text()
    else:
        if not MCP_CALL_BRIDGE.exists():
            print(f"[gen-tool-list-stubs] WARN: bridge script missing: {MCP_CALL_BRIDGE}", file=sys.stderr)
            return {}
        cmd = (
            f'source "{MCP_CALL_BRIDGE}" && '
            'mcp_call_gateway_meta "list_server_tools" \'{"server":"vn-market"}\''
        )
        try:
            proc = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            print("[gen-tool-list-stubs] WARN: live schema fetch timed out", file=sys.stderr)
            return {}
        if proc.returncode != 0:
            print(
                f"[gen-tool-list-stubs] WARN: live schema fetch failed (rc={proc.returncode}): "
                f"{proc.stderr.strip()[:300]}",
                file=sys.stderr,
            )
            return {}
        raw = proc.stdout
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[gen-tool-list-stubs] WARN: live schema JSON parse failed: {e}", file=sys.stderr)
        return {}
    return {t["name"]: t for t in data.get("tools", [])}


def first_sentence(desc: str) -> str:
    parts = re.split(r"(?<=\.)\s", desc.strip(), maxsplit=1)
    return parts[0].strip()


def extract_returns(desc: str) -> str:
    m = re.search(r"Returns:\s*(.+)", desc, re.S)
    if not m:
        return "Not itemized separately in the live tool description — call the tool to see the returned shape."
    seg = m.group(1)
    for kw in RETURNS_STOP_KEYWORDS:
        idx = seg.find(kw)
        if idx != -1:
            seg = seg[:idx]
    seg = seg.strip().rstrip(".")
    cap = 380
    if len(seg) > cap:
        cut = seg.rfind(";", 0, cap)
        if cut == -1:
            cut = seg.rfind(",", 0, cap)
        if cut == -1:
            cut = cap
        seg = seg[:cut].rstrip(" ,;") + "…"
    return seg


def escape_table_cell(text: str) -> str:
    """Escape literal '|' so it can't be mistaken for a markdown table column
    separator (a raw pipe inside a cell corrupts the row layout)."""
    return text.replace("|", "\\|")


def type_str(prop: dict) -> str:
    if "enum" in prop:
        # " / " separator, not " | " — a raw pipe here would break the
        # markdown table this string is rendered into.
        return "enum: " + " / ".join(str(v) for v in prop["enum"])
    t = prop.get("type", "any")
    if t == "array":
        item_t = prop.get("items", {}).get("type", "any")
        return f"array<{item_t}>"
    return t


def param_rows(schema: dict):
    input_schema = schema.get("input_schema", {}) or {}
    props = input_schema.get("properties", {}) or {}
    required = set(input_schema.get("required", []) or [])
    rows = []
    for name in sorted(props):
        prop = props[name]
        desc = (prop.get("description") or "").strip()
        bits = []
        if "default" in prop:
            bits.append(f"default: {prop['default']}")
        if name in required:
            bits.append("required")
        if bits:
            desc = (desc + " " if desc else "") + "(" + "; ".join(bits) + ")"
        rows.append((name, type_str(prop), escape_table_cell(desc) or "—"))
    return rows


def render_stub(name: str, live_schema, group: str) -> str:
    if live_schema is None:
        return "\n".join(
            [
                f"# {name}",
                "",
                "**Purpose:** LIVE SCHEMA UNAVAILABLE at generation time — this stub was minted from "
                f"`docs/data/tool-registry.json` (group: `{group}`) metadata only. Re-run "
                "`python3 scripts/gen-tool-list-stubs.py` once the gateway is reachable to backfill "
                "the real parameter signature.",
                "",
                "**Parameters:** UNKNOWN — live schema fetch failed; not guessed (no-fabrication contract).",
                "",
                "**Returns:** UNKNOWN — live schema fetch failed; not guessed.",
                "",
                "**Example:**",
                "```javascript",
                f'call_tool(server="vn-market", tool="{name}", arguments={{...}})',
                "```",
                "",
                "**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern",
                "",
            ]
        )

    desc = (live_schema.get("description") or "").strip()
    purpose = first_sentence(desc) if desc else "(no description in live schema)"
    returns = extract_returns(desc) if desc else "Not specified in live tool description."
    rows = param_rows(live_schema)

    lines = [
        f"# {name}",
        "",
        f"**Purpose:** {purpose}",
        "",
        "**Parameters:**",
        "| Name | Type | Description |",
        "|------|------|-------------|",
    ]
    if rows:
        for pname, ptype, pdesc in rows:
            lines.append(f"| `{pname}` | `{ptype}` | {pdesc} |")
    else:
        lines.append("| — | — | No parameters |")

    lines += ["", f"**Returns:** {returns}", "", "**Example:**", "```javascript"]
    if rows:
        arg_str = ", ".join(f'"{pname}": ...' for pname, _, _ in rows)
        lines.append(f'call_tool(server="vn-market", tool="{name}", arguments={{')
        lines.append(f"  {arg_str}")
        lines.append("})")
    else:
        lines.append(f'call_tool(server="vn-market", tool="{name}", arguments={{}})')
    lines += ["```", "", "**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern", ""]
    return "\n".join(lines)


def main():
    dry_run = "--dry-run" in sys.argv[1:]

    registry_names, name_to_group = load_registry_tools()
    existing = set(load_existing_stubs())
    missing = [t for t in registry_names if t not in existing]

    print(
        f"[gen-tool-list-stubs] registry={len(registry_names)} "
        f"existing_stubs={len(existing)} missing={len(missing)}"
    )
    if len(missing) != SNAPSHOT_MISSING_COUNT:
        print(
            f"[gen-tool-list-stubs] NOTE: live missing count ({len(missing)}) differs from the "
            f"T-28 brief snapshot ({SNAPSHOT_MISSING_COUNT}) — generating the real current delta, "
            "not the stale snapshot number."
        )

    if not missing:
        print("[gen-tool-list-stubs] nothing to do — every registry tool already has a stub")
        return 0

    live = fetch_live_schema()
    if not live:
        print(
            "[gen-tool-list-stubs] WARN: live schema unavailable — all missing stubs will be "
            "registry-metadata-only (flagged, zero fabricated params)",
            file=sys.stderr,
        )

    written, flagged = [], []
    for name in missing:
        schema = live.get(name)
        content = render_stub(name, schema, name_to_group.get(name, "unknown"))
        out_path = LIST_DIR / f"{name}.md"
        if dry_run:
            print(f"[dry-run] would write {out_path} ({'live' if schema else 'FLAGGED registry-only'})")
        else:
            out_path.write_text(content)
            print(f"[gen-tool-list-stubs] wrote {out_path}")
        (written if schema else flagged).append(name)

    print(f"[gen-tool-list-stubs] done: {len(written)} from live schema, {len(flagged)} flagged registry-only")
    if flagged:
        print(f"[gen-tool-list-stubs] flagged (re-run once gateway reachable): {', '.join(flagged)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
