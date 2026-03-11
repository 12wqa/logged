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
  // Force snapshot — reset state and set trigger=manual
  fs.writeFileSync(path.join(CLAUDE_DIR, 'context-state.json'), '{"lastIndexPct":0}');
  execSync('node "' + path.join(CLAUDE_DIR, 'context-manager.js') + '"', {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { LOGGED_TRIGGER: 'manual' })
  });
  const state = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'context-state.json'), 'utf8'));
  console.log('Snapshot taken at ' + state.lastIndexPct + '% context.');
  console.log('MEMORY.md updated, reload file ready, daily log appended.');
}
