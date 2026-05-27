#!/usr/bin/env python3
"""
MD Dependency Graph — Dead Letter Detection

Scans all .md files, resolves cross-references, BFS from roots,
reports orphaned (dead letter) files.

Usage:
  python3 scripts/md-dependency-graph.py              # JSON report to stdout
  python3 scripts/md-dependency-graph.py --html       # HTML graph to docs/data/md-dependency-graph.html
  python3 scripts/md-dependency-graph.py --summary     # One-line summary (for cron/agent)
"""
import os, re, json, sys, subprocess
from collections import defaultdict

# --- Config ---
EXCLUDE_DIRS = {'node_modules', '.git', 'dist', 'coverage'}
EXCLUDE_PREFIXES = ('apps/', 'services/', 'packages/')

def get_project_root():
    """Use git rev-parse to find project root."""
    try:
        return subprocess.check_output(
            ['git', 'rev-parse', '--show-toplevel'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except subprocess.CalledProcessError:
        return os.getcwd()

def scan_md_files(project):
    """Collect all .md files as relative paths."""
    all_md = set()
    for root, dirs, files in os.walk(project):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('~')]
        for f in files:
            if f.endswith('.md'):
                rel = os.path.relpath(os.path.join(root, f), project)
                if not any(rel.startswith(p) for p in EXCLUDE_PREFIXES):
                    all_md.add(rel)
    return all_md

def build_lookup_maps(all_md):
    """Build basename and suffix maps for reference resolution."""
    basename_map = defaultdict(list)
    for p in all_md:
        basename_map[os.path.basename(p)].append(p)

    suffix_map = {}
    for p in all_md:
        parts = p.split('/')
        for i in range(len(parts)):
            suffix = '/'.join(parts[i:])
            if suffix not in suffix_map:
                suffix_map[suffix] = p
            elif suffix_map[suffix] != p:
                suffix_map[suffix] = None  # ambiguous
    return basename_map, suffix_map

MD_REF_PATTERN = re.compile(
    r'(?:^|[\s\(\[`"\'/])([a-zA-Z0-9_./-]*?[a-zA-Z0-9_-]+\.md)(?:[\s\)\]`"\',;:|]|$)',
    re.MULTILINE
)

def build_edges(all_md, basename_map, suffix_map, project):
    """Extract .md -> .md references and resolve paths."""
    edges = defaultdict(set)
    for src in all_md:
        try:
            content = open(os.path.join(project, src), 'r', errors='replace').read()
        except Exception:
            continue
        for ref in MD_REF_PATTERN.findall(content):
            ref = ref.strip('./')
            resolved = None
            if ref in all_md:
                resolved = ref
            else:
                candidate = os.path.normpath(os.path.join(os.path.dirname(src), ref))
                if candidate in all_md:
                    resolved = candidate
                elif ref in suffix_map and suffix_map[ref]:
                    resolved = suffix_map[ref]
                else:
                    bn = os.path.basename(ref)
                    if bn in basename_map and len(basename_map[bn]) == 1:
                        resolved = basename_map[bn][0]
            if resolved and resolved != src:
                edges[src].add(resolved)
    return edges

def find_roots(all_md):
    """Identify root nodes: CLAUDE.md, agents, flows, skills, commands, cowork."""
    roots = set()
    for p in all_md:
        if p in ('CLAUDE.md', 'README.md'):
            roots.add(p)
        elif p.startswith('.claude/agents/'):
            roots.add(p)
        elif p.startswith('docs/agents/') and '/flow/' in p:
            roots.add(p)
        elif p.startswith('.claude/skills/') and p.endswith('SKILL.md'):
            roots.add(p)
        elif p.startswith('.claude/commands/'):
            roots.add(p)
        elif p.startswith('cowork-workspace-team-claude-desktop/'):
            roots.add(p)
    return roots

def bfs_reachable(roots, edges):
    """BFS from roots, return set of reachable nodes."""
    visited = set()
    queue = list(roots)
    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        for target in edges.get(node, set()):
            if target not in visited:
                queue.append(target)
    return visited

def get_category(path):
    parts = path.split('/')
    if parts[0] == '.claude':
        return '.claude/' + parts[1] if len(parts) > 1 else '.claude'
    if parts[0] == 'docs':
        return 'docs/' + parts[1] if len(parts) > 1 else 'docs'
    if parts[0] == 'cowork-workspace-team-claude-desktop':
        return 'cowork-workspace'
    return 'root'

def analyze(project):
    """Run full analysis, return structured result."""
    all_md = scan_md_files(project)
    basename_map, suffix_map = build_lookup_maps(all_md)
    edges = build_edges(all_md, basename_map, suffix_map, project)
    roots = find_roots(all_md)
    visited = bfs_reachable(roots, edges)
    dead = all_md - visited

    # In-degree
    in_degree = defaultdict(int)
    for src, targets in edges.items():
        for t in targets:
            in_degree[t] += 1

    # Categorize dead letters
    dead_by_cat = defaultdict(list)
    for d in sorted(dead):
        cat = get_category(d)
        refs_from = [s for s in all_md if d in edges.get(s, set())]
        dead_by_cat[cat].append({
            "path": d,
            "inbound": len(refs_from),
            "refs_from": refs_from[:3],
            "is_orphan": len(refs_from) == 0
        })

    # Critical = .claude/ excluding tools/
    critical = []
    for cat, items in dead_by_cat.items():
        if cat.startswith('.claude/') and cat != 'docs/agents/tools':
            critical.extend(items)

    return {
        "total_md": len(all_md),
        "roots": len(roots),
        "reachable": len(visited),
        "dead_count": len(dead),
        "coverage_pct": round(len(visited) / len(all_md) * 100, 1) if all_md else 0,
        "critical_dead": critical,
        "dead_by_category": {cat: items for cat, items in sorted(dead_by_cat.items())},
        "top_referenced": sorted(
            [{"path": f, "refs": c} for f, c in in_degree.items()],
            key=lambda x: -x["refs"]
        )[:20]
    }

def generate_html(result, project):
    """Generate interactive D3 HTML graph."""
    all_md = scan_md_files(project)
    basename_map, suffix_map = build_lookup_maps(all_md)
    edges = build_edges(all_md, basename_map, suffix_map, project)
    roots = find_roots(all_md)
    visited = bfs_reachable(roots, edges)
    dead = all_md - visited
    in_degree = defaultdict(int)
    for src, targets in edges.items():
        for t in targets:
            in_degree[t] += 1

    # Filter to important files for graph
    important = set()
    for f in all_md:
        if f.startswith('.claude/') and not f.startswith('docs/agents/tools/list/'):
            important.add(f)
        elif f.startswith('docs/') and not f.startswith('docs/handoffs/') and not f.startswith('docs/agent-memory/sessions/'):
            important.add(f)
        elif f in ('CLAUDE.md', 'README.md'):
            important.add(f)
        elif f.startswith('cowork-workspace'):
            important.add(f)

    nodes = []
    node_ids = {}
    for idx, f in enumerate(sorted(important)):
        cat = get_category(f)
        node_ids[f] = idx
        nodes.append({
            "id": idx, "label": os.path.basename(f), "path": f,
            "category": cat, "isRoot": f in roots, "isDead": f in dead,
            "inDegree": in_degree.get(f, 0), "outDegree": len(edges.get(f, set()))
        })

    links = []
    for src, targets in edges.items():
        if src in node_ids:
            for t in targets:
                if t in node_ids:
                    links.append({"source": node_ids[src], "target": node_ids[t]})

    colors = {
        ".claude/agents": "#4CAF50", "docs/agents": "#2196F3",
        ".claude/knowledge": "#FF9800", ".claude/skills": "#9C27B0",
        ".claude/commands": "#00BCD4", ".claude/templates": "#795548",
        "docs/agents/tools": "#607D8B", ".claude/projects": "#E91E63",
        "docs/agent-memory": "#8BC34A", "docs/analysis-briefs": "#FFEB3B",
        "docs/handoffs": "#FF5722", "docs/microservices": "#3F51B5",
        "docs/guides": "#009688", "cowork-workspace": "#673AB7", "root": "#F44336",
    }

    # Build sidebar HTML
    dead_report = defaultdict(list)
    for d in sorted(dead):
        if d.startswith('docs/agents/tools/list/'): continue
        cat = get_category(d)
        refs_from = [s for s in all_md if d in edges.get(s, set())]
        dead_report[cat].append({"path": d, "inbound": len(refs_from), "refs_from": refs_from[:3]})

    critical_items = []
    for cat, items in sorted(dead_report.items()):
        if cat.startswith('.claude/') and cat != 'docs/agents/tools':
            for d in items:
                ref_text = "ORPHAN" if d["inbound"] == 0 else f'{d["inbound"]} refs from: {", ".join(d["refs_from"][:2])}'
                critical_items.append(f'<div class="dead-item orphan"><span class="path">{d["path"]}</span><br><span class="refs">{ref_text}</span></div>')

    cat_sections = []
    for cat, items in sorted(dead_report.items()):
        section = f'<h2>{cat} ({len(items)} dead)</h2>'
        for d in items[:20]:
            cls = "orphan" if d["inbound"] == 0 else "referenced"
            ref_text = "ORPHAN" if d["inbound"] == 0 else f'{d["inbound"]} refs'
            section += f'<div class="dead-item {cls}"><span class="path">{os.path.basename(d["path"])}</span> <span class="refs">{ref_text}</span></div>'
        if len(items) > 20:
            section += f'<div style="color:#8b949e;font-size:10px">...and {len(items)-20} more</div>'
        cat_sections.append(section)

    legend_html = "".join(f'<div class="legend-item"><div class="legend-dot" style="background:{c}"></div>{cat}</div>' for cat, c in sorted(colors.items()))

    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MD Dependency Graph - Dead Letter Detection</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'SF Mono', 'Fira Code', monospace; background: #0d1117; color: #c9d1d9; }
.container { display: flex; height: 100vh; }
#graph { flex: 1; position: relative; }
#sidebar { width: 420px; overflow-y: auto; background: #161b22; border-left: 1px solid #30363d; padding: 16px; }
h1 { font-size: 16px; color: #58a6ff; margin-bottom: 8px; }
h2 { font-size: 14px; color: #f0883e; margin: 16px 0 8px; border-bottom: 1px solid #30363d; padding-bottom: 4px; }
.stat { display: inline-block; background: #21262d; border-radius: 6px; padding: 8px 12px; margin: 4px; }
.stat .num { font-size: 24px; font-weight: bold; }
.stat .label { font-size: 11px; color: #8b949e; }
.stat.dead .num { color: #f85149; }
.stat.alive .num { color: #3fb950; }
.stat.root .num { color: #58a6ff; }
.dead-item { padding: 4px 8px; margin: 2px 0; border-radius: 4px; font-size: 11px; cursor: pointer; }
.dead-item:hover { background: #21262d; }
.dead-item.orphan { border-left: 3px solid #f85149; }
.dead-item.referenced { border-left: 3px solid #d29922; }
.dead-item .path { color: #c9d1d9; }
.dead-item .refs { color: #8b949e; font-size: 10px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 6px; background: #21262d; border-radius: 3px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.critical { background: #f8514922; border: 1px solid #f85149; border-radius: 6px; padding: 8px; margin: 8px 0; }
.critical h3 { color: #f85149; font-size: 12px; margin-bottom: 6px; }
svg { width: 100%; height: 100%; }
.link { stroke: #30363d; stroke-opacity: 0.4; }
.tooltip { position: absolute; background: #21262d; border: 1px solid #30363d; border-radius: 6px; padding: 8px 12px; font-size: 11px; pointer-events: none; display: none; z-index: 100; max-width: 400px; }
.filter-btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; margin: 2px; }
.filter-btn:hover { background: #30363d; }
.filter-btn.active { background: #388bfd33; border-color: #58a6ff; color: #58a6ff; }
</style>
</head>
<body>
<div class="container">
<div id="graph">
  <div id="tooltip" class="tooltip"></div>
  <svg></svg>
</div>
<div id="sidebar">
  <h1>MD Dependency Graph</h1>
  <p style="font-size:11px;color:#8b949e;margin-bottom:12px;">BFS from CLAUDE.md + agents/flows/skills/commands</p>
  <div>
    <div class="stat root"><div class="num">""" + str(result["roots"]) + """</div><div class="label">Roots</div></div>
    <div class="stat alive"><div class="num">""" + str(result["reachable"]) + """</div><div class="label">Reachable</div></div>
    <div class="stat dead"><div class="num">""" + str(result["dead_count"]) + """</div><div class="label">Dead Letters</div></div>
    <div class="stat"><div class="num">""" + str(result["total_md"]) + """</div><div class="label">Total .md</div></div>
  </div>
  <div style="margin:8px 0;">
    <button class="filter-btn active" onclick="toggleFilter('all')">All</button>
    <button class="filter-btn" onclick="toggleFilter('dead')">Dead Only</button>
    <button class="filter-btn" onclick="toggleFilter('critical')">Critical Dead</button>
  </div>
  <div class="legend">""" + legend_html + """</div>
  <div class="critical">
    <h3>CRITICAL DEAD LETTERS (.claude/ excl. tools/)</h3>
    """ + "\n".join(critical_items) + """
  </div>
  """ + "\n".join(cat_sections) + """
</div>
</div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const nodes = """ + json.dumps(nodes) + """;
const links = """ + json.dumps(links) + """;
const colors = """ + json.dumps(colors) + """;
const svg = d3.select("svg");
const width = document.getElementById("graph").clientWidth;
const height = document.getElementById("graph").clientHeight;
const tooltip = document.getElementById("tooltip");
svg.attr("viewBox", [0, 0, width, height]);
const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.1, 8]).on("zoom", (e) => g.attr("transform", e.transform)));
const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(links).id(d => d.id).distance(40))
  .force("charge", d3.forceManyBody().strength(-80))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collision", d3.forceCollide().radius(12));
const link = g.append("g").selectAll("line")
  .data(links).join("line").attr("class", "link").attr("stroke-width", 0.5);
const node = g.append("g").selectAll("g")
  .data(nodes).join("g").attr("class", "node")
  .call(d3.drag()
    .on("start", (e,d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
    .on("drag", (e,d) => { d.fx=e.x; d.fy=e.y; })
    .on("end", (e,d) => { if (!e.active) simulation.alphaTarget(0); d.fx=null; d.fy=null; }));
node.append("circle")
  .attr("r", d => d.isRoot ? 8 : (d.isDead ? 4 : 5))
  .attr("fill", d => colors[d.category] || "#666")
  .attr("stroke", d => d.isDead ? "#f85149" : (d.isRoot ? "#58a6ff" : "#30363d"))
  .attr("stroke-width", d => d.isDead ? 2 : 1)
  .attr("opacity", d => d.isDead ? 0.7 : 1);
node.on("mouseover", (e, d) => {
  tooltip.style.display = "block";
  tooltip.innerHTML = "<strong>"+d.label+"</strong><br>"+d.path+"<br>Cat: "+d.category+"<br>In: "+d.inDegree+" | Out: "+d.outDegree+"<br>"+(d.isDead ? "DEAD LETTER" : "Reachable")+(d.isRoot ? " | ROOT" : "");
}).on("mousemove", (e) => {
  tooltip.style.left = (e.pageX + 10) + "px";
  tooltip.style.top = (e.pageY - 10) + "px";
}).on("mouseout", () => { tooltip.style.display = "none"; });
simulation.on("tick", () => {
  link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
  node.attr("transform", d => "translate("+d.x+","+d.y+")");
});
function toggleFilter(mode) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  node.style("display", d => {
    if (mode === 'dead') return d.isDead ? null : "none";
    if (mode === 'critical') return (d.isDead && d.path.startsWith('.claude/')) ? null : "none";
    return null;
  });
  link.style("display", mode === 'all' ? null : "none");
}
</script>
</body>
</html>"""
    return html

# --- CLI ---
if __name__ == '__main__':
    project = get_project_root()
    result = analyze(project)
    mode = sys.argv[1] if len(sys.argv) > 1 else '--json'

    if mode == '--summary':
        crit = len(result["critical_dead"])
        print(f'total={result["total_md"]} reachable={result["reachable"]} dead={result["dead_count"]} critical_dead={crit} coverage={result["coverage_pct"]}%')

    elif mode == '--html':
        html = generate_html(result, project)
        out_path = os.path.join(project, "docs/data/md-dependency-graph.html")
        with open(out_path, 'w') as f:
            f.write(html)
        print(f"Written to: {out_path}")
        print(f"Graph: {len(result['top_referenced'])} top-ref nodes")
        print(f"Critical dead: {len(result['critical_dead'])}")

    else:  # --json (default)
        # Convert sets in edges for JSON
        print(json.dumps(result, indent=2, default=str))
