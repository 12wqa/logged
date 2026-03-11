#!/usr/bin/env node
// Claude Code Status Line - inspired by PAI STATUSLINE

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'statusline.log');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  const d = JSON.parse(raw);

  // Extract values
  const model = d.model?.display_name || '?';
  const version = d.version || '?';
  const ctxUsed = d.context_window?.used_percentage || 0;
  const cost = d.cost?.total_cost_usd || 0;
  const durationMs = d.cost?.total_duration_ms || 0;
  const linesAdd = d.cost?.total_lines_added || 0;
  const linesDel = d.cost?.total_lines_removed || 0;
  const curDir = d.workspace?.current_dir || '?';
  const projDir = d.workspace?.project_dir || '?';

  // Colors
  const R = '\x1b[0m';
  const C = '\x1b[36m';
  const G = '\x1b[32m';
  const Y = '\x1b[33m';
  const B = '\x1b[34m';
  const M = '\x1b[35m';
  const W = '\x1b[97m';
  const DIM = '\x1b[2m';
  const BOLD = '\x1b[1m';
  const RED = '\x1b[31m';

  // Context progress bar with 83% compaction threshold
  const barW = 30;
  const COMPACT_PCT = 83;
  const ctxInt = Math.round(ctxUsed);
  const compactPos = Math.round(COMPACT_PCT * barW / 100); // position of compaction marker
  const filled = Math.round(ctxInt * barW / 100);
  const barColor = ctxInt < 50 ? G : ctxInt < COMPACT_PCT ? Y : RED;

  // Build bar character by character with a '|' marker at the compaction threshold
  let bar = '';
  for (let i = 0; i < barW; i++) {
    if (i === compactPos) {
      bar += `${R}${W}│${R}`; // compaction threshold marker
    } else if (i < filled) {
      bar += `${barColor}█`;
    } else {
      bar += `${DIM}░`;
    }
  }
  bar += R;

  // Format duration
  const totalSec = Math.floor(durationMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const dur = mins > 0 ? `${mins}m${secs}s` : `${secs}s`;

  // Format cost
  const costFmt = `$${cost.toFixed(2)}`;

  // Short dir
  const shortDir = curDir.split(/[/\\]/).pop();

  // Git branch
  let branch = '';
  try {
    branch = execSync('git branch --show-current 2>/dev/null', {
      cwd: curDir.replace(/^\/([a-z])\//, '$1:/'),
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {}

  // Output lines
  const lines = [];

  // Line 1: Header
  lines.push(`${DIM}──${R} ${BOLD}${C}CLAUDE STATUS${R} ${DIM}─────────────────────────────────${R}`);

  // Line 2: ENV
  lines.push(`${DIM}ENV:${R} ${W}CC: ${G}${version}${R}  ${DIM}│${R}  ${W}Model: ${M}${model}${R}`);

  // Line 3: Context
  lines.push(`${G}◉${R} ${BOLD}${C}CONTEXT:${R} ${bar} ${barColor}${ctxUsed}%${R}  ${DIM}│${R}  ${DIM}compact@${COMPACT_PCT}%${R}`);

  // Line 4: Usage
  lines.push(`${Y}▸${R} ${BOLD}${Y}USAGE:${R} ${W}${costFmt}${R}  ${DIM}│${R}  ${W}Time: ${dur}${R}  ${DIM}│${R}  ${G}+${linesAdd}${R} ${DIM}/${R} ${M}-${linesDel}${R} ${DIM}lines${R}`);

  // Line 5: Project + PWD + Git
  const shortProj = projDir.split(/[/\\]/).pop();
  let pwdLine = `${B}◆${R} ${BOLD}${B}Project:${R} ${W}${shortProj}${R}`;
  if (shortDir !== shortProj) {
    pwdLine += `  ${DIM}│${R}  ${W}PWD: ${C}${shortDir}${R}`;
  }
  if (branch) {
    pwdLine += `  ${DIM}│${R}  ${W}Branch: ${C}${branch}${R}`;
  }
  lines.push(pwdLine);

  console.log(lines.join('\n'));

  // Write log for Claude to monitor its own context
  const compactTokens = Math.round(COMPACT_PCT / 100 * (d.context_window?.context_window_size || 0));
  const usedTokens = Math.round(ctxUsed / 100 * (d.context_window?.context_window_size || 0));
  const logEntry = [
    `[${new Date().toISOString()}]`,
    `context_used: ${ctxUsed}%`,
    `compact_at: ${COMPACT_PCT}%`,
    `headroom: ${(COMPACT_PCT - ctxUsed).toFixed(1)}%`,
    `tokens_used: ${usedTokens}`,
    `compact_tokens: ${compactTokens}`,
    `window_size: ${d.context_window?.context_window_size || '?'}`,
    `cost: ${costFmt}`,
    `model: ${model}`,
    `duration: ${dur}`,
  ].join(' | ');

  try {
    fs.writeFileSync(LOG_PATH, logEntry + '\n');
  } catch {}
});
