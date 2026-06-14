#!/usr/bin/env python3
"""
devteam-session-trace.py — extract a compact workflow trace from a Claude Code
dev-team session transcript (.jsonl), so the orchestration flow can be audited
without reading the raw multi-MB transcript.

Emits, per session: agent spawns (who→who), dev-team Telegram narration,
task_claim lock outcomes (SKIP/contention), errors, and workflow-smell keyword hits.

Usage: devteam-session-trace.py <session.jsonl> [<session.jsonl> ...]
Pointer: docs/agents/dev-team/flow/main.md (audited flow)
"""
import sys, json, re

SMELL = re.compile(r'\b(SKIP|conflict|false[- ]?(green|positive|promot)|double[- ]?(run|post|spawn)|'
                   r'race|recurs|HEAD\.lock|index\.lock|stale|BLOCKED|re-?spawn|already running|'
                   r'held by|self[- ]?flip|over[- ]?claim|fabricat|hallucinat|misunderstand|'
                   r'retry|rollback|revert|wedge|deadlock|orphan)\b', re.I)

def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for b in content:
            if isinstance(b, dict) and b.get('type') == 'text':
                out.append(b.get('text', ''))
        return ' '.join(out)
    return ''

def short(s, n=160):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s[:n]

def trace(path):
    spawns=[]; tg=[]; claims=[]; errors=[]; smells=[]; n=0
    first_ts=last_ts=None
    with open(path, 'r', errors='replace') as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            try: o=json.loads(line)
            except: continue
            n+=1
            ts=o.get('timestamp')
            if ts:
                if first_ts is None: first_ts=ts
                last_ts=ts
            msg=o.get('message') or {}
            content=msg.get('content')
            # assistant tool_use blocks
            if isinstance(content, list):
                for b in content:
                    if not isinstance(b, dict): continue
                    bt=b.get('type')
                    if bt=='tool_use':
                        name=b.get('name',''); inp=b.get('input',{}) or {}
                        if name in ('Task','Agent'):
                            st=inp.get('subagent_type','?')
                            desc=short(inp.get('description') or inp.get('prompt',''), 90)
                            bg=inp.get('run_in_background')
                            spawns.append((ts, st, bg, desc))
                        elif name=='mcp__claude_ai_gateway__call_tool' or 'call_tool' in name:
                            tool=inp.get('tool',''); args=inp.get('arguments',{}) or {}
                            if tool=='send_telegram':
                                tg.append((ts, args.get('channel','?'), short(args.get('message',''),200)))
                            elif tool in ('task_claim','task_release'):
                                claims.append((ts, tool, short(str(args.get('task_id','')),60),
                                               args.get('owner_agent','')))
                        # detect bash that touches locks / git races
                        elif name=='Bash':
                            cmd=inp.get('command','')
                            if SMELL.search(cmd):
                                m=SMELL.search(cmd)
                                smells.append((ts,'bash',m.group(0),short(cmd,120)))
                    elif bt=='tool_result':
                        if b.get('is_error'):
                            errors.append((ts, short(text_of(b.get('content')),140)))
            # text content (assistant reasoning / user injects)
            txt=text_of(content)
            if txt:
                if 'API Error' in txt or 'InputValidationError' in txt:
                    errors.append((ts, short(txt,140)))
                for m in SMELL.finditer(txt):
                    smells.append((ts, o.get('type','?'), m.group(0), short(txt,160)))
    return dict(path=path, lines=n, first=first_ts, last=last_ts,
                spawns=spawns, tg=tg, claims=claims, errors=errors, smells=smells)

def render(t):
    p=t['path'].split('/')[-1]
    print(f"\n{'='*90}\nSESSION {p}  lines={t['lines']}  {t['first']} → {t['last']}")
    print(f"  spawns={len(t['spawns'])} telegram={len(t['tg'])} claims={len(t['claims'])} "
          f"errors={len(t['errors'])} smells={len(t['smells'])}")
    print("\n-- SPAWN SEQUENCE (agent | bg | desc) --")
    for ts,st,bg,desc in t['spawns']:
        bgm='bg' if bg else ('FG!' if bg is False else '?')
        print(f"  {ts} {st:<22} [{bgm}] {desc}")
    print("\n-- DEV-TEAM TELEGRAM NARRATION --")
    for ts,ch,m in t['tg']:
        print(f"  {ts} #{ch}: {m}")
    # claim contention summary
    skips=[c for c in t['claims']]
    print(f"\n-- task_claim/release events: {len(t['claims'])} --")
    for ts,tool,tid,owner in t['claims'][:60]:
        print(f"  {ts} {tool:<13} {tid}")
    print("\n-- ERRORS --")
    for ts,e in t['errors'][:40]:
        print(f"  {ts} {e}")
    print("\n-- WORKFLOW SMELLS (dedup keyword sample) --")
    seen=set()
    for ts,src,kw,ctx in t['smells']:
        key=(src,kw.lower(),ctx[:60])
        if key in seen: continue
        seen.add(key)
        print(f"  {ts} [{src}/{kw}] {ctx}")

if __name__=='__main__':
    for p in sys.argv[1:]:
        try: render(trace(p))
        except Exception as e:
            print(f"ERR {p}: {e}")
