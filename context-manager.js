#!/usr/bin/env node
// Logged — Context Manager for Claude Code
// Seamless context management — the user never thinks about context.
// Silently indexes in the background, updates MEMORY.md, keeps reload file fresh.
// After /clear, Claude picks up from MEMORY.md automatically. No friction.
//
// Trigger source passed via env: LOGGED_TRIGGER=manual|auto (default: auto)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDE_DIR = path.join(HOME, '.claude');
const STATUS_LOG = path.join(CLAUDE_DIR, 'statusline.log');
const CONTEXT_STATE = path.join(CLAUDE_DIR, 'context-state.json');
const RELOAD_FILE = path.join(CLAUDE_DIR, 'reload-after-clear.md');
const INDEXER = path.join(CLAUDE_DIR, 'session-indexer.js');
const INDEX_LOG_DIR = path.join(CLAUDE_DIR, 'index-logs');

const TRIGGER = process.env.LOGGED_TRIGGER || 'auto';

// --- MEMORY.md auto-update ---

const SESSION_MARKER = '\n<!-- SESSION-STATE-AUTO -->';

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
        if (stat.mtimeMs > newestTime) {
          newestTime = stat.mtimeMs;
          newest = memFile;
        }
      } catch {}
    }
  } catch {}
  return newest;
}

function updateMemoryMd(indexOutput, contextPct, trigger) {
  const memFile = findMemoryMd();
  if (!memFile) return;

  try {
    let content = fs.readFileSync(memFile, 'utf8');

    const indexLines = indexOutput.split('\n')
      .filter(l => l.includes('USER') || l.includes('CLAUDE'))
      .slice(-15);

    const sessionSection = [
      SESSION_MARKER,
      '## Current Session',
      `_Updated: ${new Date().toISOString()} | Context: ${contextPct}% | Trigger: ${trigger}_`,
      '',
      ...indexLines,
      '',
      '_Full history: `node ~/.claude/session-indexer.js --latest --last 30`_',
      '<!-- /SESSION-STATE-AUTO -->'
    ].join('\n');

    if (content.includes(SESSION_MARKER)) {
      content = content.replace(
        /\n<!-- SESSION-STATE-AUTO -->[\s\S]*<!-- \/SESSION-STATE-AUTO -->/,
        sessionSection
      );
    } else {
      content = content.trimEnd() + '\n' + sessionSection + '\n';
    }

    if (content.split('\n').length <= 200) {
      fs.writeFileSync(memFile, content);
    }
  } catch {}
}

// --- Core functions ---

const INDEX_INTERVAL_PCT = 5;
const INDEX_START_PCT = 15;
function getContextPct() {
  try {
    const log = fs.readFileSync(STATUS_LOG, 'utf8');
    const match = log.match(/context_used:\s*([\d.]+)%/);
    return match ? parseFloat(match[1]) : 0;
  } catch {
    return 0;
  }
}

function findLatestSession() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  let newest = null;
  let newestTime = 0;

  function scan(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('subagents')) {
          scan(full);
        } else if (entry.name.endsWith('.jsonl') && !entry.name.includes('agent-')) {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > newestTime) {
            newestTime = stat.mtimeMs;
            newest = full;
          }
        }
      }
    } catch {}
  }

  scan(projectsDir);
  return newest;
}

function runIndexer(sessionFile, lastMins) {
  try {
    return execSync(
      `node "${INDEXER}" "${sessionFile}" --last ${lastMins}`,
      { encoding: 'utf8', timeout: 10000 }
    );
  } catch {
    return null;
  }
}

function writeReloadFile(indexOutput, contextPct, trigger) {
  const content = `# Session Continuity
# Generated: ${new Date().toISOString()} | Context: ${contextPct}% | Trigger: ${trigger}
# This file exists so /clear is seamless. Just keep working.

## Recent activity (last 15 mins):

\`\`\`
${indexOutput}
\`\`\`

## To go deeper:
# node ~/.claude/session-indexer.js --latest --last 30
# node ~/.claude/session-indexer.js --latest --last 60

## Full index history:
# ~/.claude/index-logs/    (one file per day, all sessions)
`;
  fs.writeFileSync(RELOAD_FILE, content);
}

function getState() {
  try {
    return JSON.parse(fs.readFileSync(CONTEXT_STATE, 'utf8'));
  } catch {
    return { lastIndexPct: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(CONTEXT_STATE, JSON.stringify(state));
}

// --- Main — silent, seamless ---

const pct = getContextPct();
if (pct < INDEX_START_PCT) process.exit(0);

const state = getState();

if (pct - state.lastIndexPct >= INDEX_INTERVAL_PCT) {
  const session = findLatestSession();
  if (session) {
    const index = runIndexer(session, 15);
    if (index) {
      writeReloadFile(index, pct, TRIGGER);
      updateMemoryMd(index, pct, TRIGGER);

      try {
        fs.mkdirSync(INDEX_LOG_DIR, { recursive: true });
        const today = new Date().toISOString().slice(0, 10);
        const sessionId = path.basename(session, '.jsonl');
        const logFile = path.join(INDEX_LOG_DIR, `${today}.log`);
        const entry = [
          `\n=== INDEX @ ${new Date().toISOString()} | context: ${pct}% | trigger: ${TRIGGER} | session: ${sessionId} ===\n`,
          index,
          '\n'
        ].join('');
        fs.appendFileSync(logFile, entry);
      } catch {}
    }
  }
  state.lastIndexPct = pct;
  saveState(state);
}
