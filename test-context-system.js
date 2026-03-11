#!/usr/bin/env node
// Test harness for the Context Management System
// Simulates rising context % and verifies everything fires correctly
// Zero tokens — just mocks statusline.log and runs the context manager
//
// Usage: node ~/.claude/test-context-system.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDE_DIR = path.join(HOME, '.claude');
const STATUS_LOG = path.join(CLAUDE_DIR, 'statusline.log');
const CONTEXT_STATE = path.join(CLAUDE_DIR, 'context-state.json');
const RELOAD_FILE = path.join(CLAUDE_DIR, 'reload-after-clear.md');
const INDEX_LOG_DIR = path.join(CLAUDE_DIR, 'index-logs');
const CONTEXT_MANAGER = path.join(CLAUDE_DIR, 'context-manager.js');

// Colors
const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const C = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RST = '\x1b[0m';

// Save originals so we can restore them
let originalStatusLog = '';
let originalState = '';
try { originalStatusLog = fs.readFileSync(STATUS_LOG, 'utf8'); } catch {}
try { originalState = fs.readFileSync(CONTEXT_STATE, 'utf8'); } catch {}

function fakeStatusLog(pct) {
  const tokens = Math.round(pct / 100 * 200000);
  const line = `[${new Date().toISOString()}] | context_used: ${pct}% | compact_at: 83% | headroom: ${(83-pct).toFixed(1)}% | tokens_used: ${tokens} | compact_tokens: 166000 | window_size: 200000 | cost: $5.00 | model: Opus 4.6 | duration: 30m0s\n`;
  fs.writeFileSync(STATUS_LOG, line);
}

function resetState() {
  fs.writeFileSync(CONTEXT_STATE, '{"lastIndexPct":0}');
}

function runContextManager() {
  try {
    const out = execSync(`node "${CONTEXT_MANAGER}" 2>&1`, { encoding: 'utf8', timeout: 15000 });
    return out.trim();
  } catch (e) {
    return e.stdout?.trim() || e.stderr?.trim() || '';
  }
}

function checkFile(filepath) {
  try {
    const stat = fs.statSync(filepath);
    return { exists: true, size: stat.size, modified: stat.mtime };
  } catch {
    return { exists: false };
  }
}

function findMemoryMd() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  let newest = null;
  let newestTime = 0;
  try {
    for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const memFile = path.join(projectsDir, entry.name, 'memory', 'MEMORY.md');
      try {
        const stat = fs.statSync(memFile);
        if (stat.mtimeMs > newestTime) { newestTime = stat.mtimeMs; newest = memFile; }
      } catch {}
    }
  } catch {}
  return newest;
}

console.log(`${BOLD}${C}=== Context Management System — Test Harness ===${RST}\n`);

// Check all files exist
console.log(`${BOLD}1. File check${RST}`);
const files = [
  { name: 'statusline.js', path: path.join(CLAUDE_DIR, 'statusline.js') },
  { name: 'statusline.log', path: STATUS_LOG },
  { name: 'context-manager.js', path: CONTEXT_MANAGER },
  { name: 'session-indexer.js', path: path.join(CLAUDE_DIR, 'session-indexer.js') },
  { name: 'settings.json', path: path.join(CLAUDE_DIR, 'settings.json') },
];
for (const f of files) {
  const info = checkFile(f.path);
  console.log(`   ${info.exists ? G + 'OK' : R + 'MISSING'}${RST}  ${f.name}`);
}

const memFile = findMemoryMd();
console.log(`   ${memFile ? G + 'OK' : R + 'MISSING'}${RST}  MEMORY.md ${DIM}(${memFile ? path.basename(path.dirname(path.dirname(memFile))) : '?'})${RST}`);

// Check hook is configured
console.log(`\n${BOLD}2. Hook check${RST}`);
try {
  const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
  const hasHook = settings.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command?.includes('context-manager');
  console.log(`   ${hasHook ? G + 'OK' : R + 'MISSING'}${RST}  PostToolUse hook → context-manager.js`);
} catch {
  console.log(`   ${R}MISSING${RST}  Could not read settings.json`);
}

// Simulate rising context
console.log(`\n${BOLD}3. Simulating rising context${RST}`);
console.log(`   ${DIM}(Faking statusline.log at different %s and running context-manager)${RST}\n`);

resetState();

const testPcts = [5, 10, 14, 15, 19, 20, 24, 25, 30, 35, 40, 45, 50, 60, 70, 80];
let lastReloadMod = 0;
let lastMemoryMod = 0;
let lastLogSize = 0;

try { lastReloadMod = fs.statSync(RELOAD_FILE).mtimeMs; } catch {}
if (memFile) { try { lastMemoryMod = fs.statSync(memFile).mtimeMs; } catch {} }

const today = new Date().toISOString().slice(0, 10);
const logFile = path.join(INDEX_LOG_DIR, `${today}.log`);
try { lastLogSize = fs.statSync(logFile).size; } catch {}

for (const pct of testPcts) {
  fakeStatusLog(pct);
  const output = runContextManager();

  // Check what changed
  let reloadUpdated = false;
  let memoryUpdated = false;
  let logUpdated = false;

  try {
    const t = fs.statSync(RELOAD_FILE).mtimeMs;
    if (t > lastReloadMod) { reloadUpdated = true; lastReloadMod = t; }
  } catch {}

  if (memFile) {
    try {
      const t = fs.statSync(memFile).mtimeMs;
      if (t > lastMemoryMod) { memoryUpdated = true; lastMemoryMod = t; }
    } catch {}
  }

  try {
    const s = fs.statSync(logFile).size;
    if (s > lastLogSize) { logUpdated = true; lastLogSize = s; }
  } catch {}

  const bar = pct < 25 ? G : pct < 50 ? Y : R;
  const actions = [];
  if (reloadUpdated) actions.push('reload-file');
  if (memoryUpdated) actions.push('MEMORY.md');
  if (logUpdated) actions.push('daily-log');

  const actionStr = actions.length > 0
    ? `${G}INDEXED${RST} → ${actions.join(', ')}`
    : `${DIM}silent${RST}`;

  console.log(`   ${bar}${String(pct).padStart(3)}%${RST}  ${actionStr}`);
}

// Check final state
console.log(`\n${BOLD}4. Final state${RST}`);
try {
  const state = JSON.parse(fs.readFileSync(CONTEXT_STATE, 'utf8'));
  console.log(`   Last index point: ${state.lastIndexPct}%`);
} catch {}

const reloadInfo = checkFile(RELOAD_FILE);
console.log(`   Reload file: ${reloadInfo.exists ? G + 'OK' + RST + ` (${reloadInfo.size} bytes)` : R + 'MISSING' + RST}`);

if (memFile) {
  const memContent = fs.readFileSync(memFile, 'utf8');
  const hasSession = memContent.includes('<!-- SESSION-STATE-AUTO -->');
  console.log(`   MEMORY.md session section: ${hasSession ? G + 'OK' : R + 'MISSING'}${RST}`);
  console.log(`   MEMORY.md total lines: ${memContent.split('\n').length}/200`);
}

const logInfo = checkFile(logFile);
console.log(`   Daily log: ${logInfo.exists ? G + 'OK' + RST + ` (${logInfo.size} bytes)` : R + 'MISSING' + RST}`);

// Restore originals
console.log(`\n${BOLD}5. Restoring original state${RST}`);
if (originalStatusLog) fs.writeFileSync(STATUS_LOG, originalStatusLog);
if (originalState) fs.writeFileSync(CONTEXT_STATE, originalState);
else fs.writeFileSync(CONTEXT_STATE, '{"lastIndexPct":0}');
console.log(`   ${G}OK${RST}  statusline.log and context-state.json restored`);

console.log(`\n${BOLD}${G}=== Test complete ===${RST}\n`);
