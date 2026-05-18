#!/usr/bin/env node
// cowork-team slot matcher — reads docs/data/cowork-schedule.json, returns slots
// whose cron matches current UTC ±2min window.
//
// Usage: node .claude/scripts/cowork-match-slots.js
//   No args — reads system clock. Output: JSON array of {slot_id, agent, flow_path, cron}.
//   Empty array → silent exit per flow Step 4.

const fs = require('fs');
const path = require('path');

const schedPath = path.join(process.cwd(), 'docs/data/cowork-schedule.json');
const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));

const now = new Date();
const actualM = now.getUTCMinutes();
const M = Math.floor(actualM / 15) * 15; // nominal tick: round down to nearest 15-min boundary
const H = now.getUTCHours();
const DOM = now.getUTCDate();
const MON = now.getUTCMonth() + 1;
const DOW = now.getUTCDay(); // 0=Sun..6=Sat

function field(expr, val) {
  if (expr === '*') return true;
  if (expr.includes(',')) return expr.split(',').map(Number).includes(val);
  if (expr.startsWith('*/')) return val % parseInt(expr.slice(2)) === 0;
  if (expr.includes('-')) {
    const [a, b] = expr.split('-').map(Number);
    return val >= a && val <= b;
  }
  return parseInt(expr) === val;
}

function dowMatch(expr, dow) {
  if (expr === '*') return true;
  return field(expr, dow) || (dow === 0 && field(expr, 7));
}

function cronMatches(cron) {
  const [cm, ch, cdom, cmon, cdow] = cron.split(' ');
  for (let d = -2; d <= 2; d++) {
    let m = M + d, h = H;
    if (m < 0)  { m += 60; h--; }
    if (m >= 60) { m -= 60; h++; }
    if (h < 0 || h >= 24) continue;
    if (field(cm, m) && field(ch, h) && field(cdom, DOM) && field(cmon, MON) && dowMatch(cdow, DOW))
      return true;
  }
  return false;
}

const hits = sched.slots
  .filter(sl => sl.enabled && !sl._disabled_by && cronMatches(sl.cron))
  .map(sl => ({
    slot_id: sl.slot_id,
    agent: sl.agent,
    flow_path: sl.flow_path,
    cron: sl.cron,
    trigger_prompt: sl.trigger_prompt
  }));

process.stdout.write(JSON.stringify(hits));
