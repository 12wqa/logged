#!/usr/bin/env node
// Logged — context management for Claude Code
// Forces an index snapshot right now, regardless of thresholds
//
// Usage:
//   node ~/.claude/logged.js              # snapshot now
//   node ~/.claude/logged.js search term  # search logs
//   node ~/.claude/logged.js viewer       # open web viewer
//   node ~/.claude/logged.js last 30      # show last 30 mins
//   node ~/.claude/logged.js test         # run test harness

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDE_DIR = path.join(HOME, '.claude');
const args = process.argv.slice(2);
const cmd = args[0] || 'snapshot';

// Per-pane file isolation
let PANE_ID = '';
try {
  PANE_ID = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf8' }).trim().replace('%', '');
} catch {}
const PANE_SUFFIX = PANE_ID ? `-${PANE_ID}` : '';

if (cmd === 'viewer') {
  console.log('Starting Logged viewer...');
  execSync('node "' + path.join(CLAUDE_DIR, 'log-viewer.js') + '"', { stdio: 'inherit' });

} else if (cmd === 'search') {
  const term = args.slice(1).join(' ');
  if (!term) { console.log('Usage: logged search <term>'); process.exit(1); }
  execSync('node "' + path.join(CLAUDE_DIR, 'search-logs.js') + '" "' + term + '"', { stdio: 'inherit' });

} else if (cmd === 'last') {
  const mins = args[1] || '15';
  execSync('node "' + path.join(CLAUDE_DIR, 'session-indexer.js') + '" --latest --last ' + mins, { stdio: 'inherit' });

} else if (cmd === 'test') {
  execSync('node "' + path.join(CLAUDE_DIR, 'test-context-system.js') + '"', { stdio: 'inherit' });

} else {
  // Check context level before snapshotting
  const statusLog = path.join(CLAUDE_DIR, 'statusline.log');
  let pct = 0;
  try {
    const log = fs.readFileSync(statusLog, 'utf8');
    const match = log.match(/context_used:\s*([\d.]+)%/);
    if (match) pct = parseFloat(match[1]);
  } catch {}

  if (pct < 15) {
    console.log('Context too low (' + pct + '%) — nothing meaningful to snapshot yet.');
    process.exit(0);
  }

  if (pct < 25) {
    console.log('WARNING: Context is only ' + pct + '%. Snapshot will be thin.');
    console.log('CONFIRM: Pass --force to snapshot anyway.');
    if (!args.includes('--force')) process.exit(0);
  }

  // Force snapshot — reset state and set trigger=manual
  fs.writeFileSync(path.join(CLAUDE_DIR, `context-state${PANE_SUFFIX}.json`), '{"lastIndexPct":0}');
  execSync('node "' + path.join(CLAUDE_DIR, 'context-manager.js') + '"', {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { LOGGED_TRIGGER: 'manual' })
  });
  const state = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, `context-state${PANE_SUFFIX}.json`), 'utf8'));

  // Write session.md in cwd — ongoing working context for next session
  try {
    const reloadContent = fs.readFileSync(path.join(CLAUDE_DIR, `reload-after-clear${PANE_SUFFIX}.md`), 'utf8');
    const continueContent = fs.readFileSync(path.join(CLAUDE_DIR, 'logged-continue.md'), 'utf8');
    const sessionMd = reloadContent + '\n' + continueContent;
    fs.writeFileSync(path.join(process.cwd(), 'session.md'), sessionMd);
  } catch {}

  console.log('Snapshot taken at ' + state.lastIndexPct + '% context.');
  console.log('MEMORY.md updated, reload file ready, session.md written, daily log appended.');

  // Write trigger file and fire auto-clear when called with --cc (from /cc skill)
  if (args.includes('--cc')) {
    fs.writeFileSync(path.join(CLAUDE_DIR, `auto-clear-trigger${PANE_SUFFIX}`), new Date().toISOString());

    // /clear is handled by the skill via tmux send-keys
  }
}
