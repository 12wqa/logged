#!/usr/bin/env node
// Logged — Context Manager for Claude Code
// Seamless context management — the user never thinks about context.
// Silently indexes in the background, updates session.md, keeps reload file fresh.
// Auto-clears at 50% — stop → /cc → /clear → SessionStart reloads context.
//
// Trigger source passed via env: LOGGED_TRIGGER=manual|auto (default: auto)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDE_DIR = path.join(HOME, '.claude');
const STATUS_LOG = path.join(CLAUDE_DIR, 'statusline.log');
const INDEXER = path.join(CLAUDE_DIR, 'session-indexer.js');
const INDEX_LOG_DIR = path.join(CLAUDE_DIR, 'index-logs');

// Per-pane file isolation — each tmux pane gets its own state files
let PANE_ID = '';
try {
  PANE_ID = execSync('tmux display-message -p "#{pane_id}" 2>/dev/null', { encoding: 'utf8' }).trim().replace('%', '');
} catch {}
const PANE_SUFFIX = PANE_ID ? `-${PANE_ID}` : '';
const CONTEXT_STATE = path.join(CLAUDE_DIR, `context-state${PANE_SUFFIX}.json`);
const RELOAD_FILE = path.join(CLAUDE_DIR, `reload-after-clear${PANE_SUFFIX}.md`);

const TRIGGER = process.env.LOGGED_TRIGGER || 'auto';

// --- Core functions ---

const INDEX_INTERVAL_PCT = 5;
const INDEX_START_PCT = 15;
const AUTO_CLEAR_PCT = 50;

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

## Recent activity (last 30 mins):

\`\`\`
${indexOutput}
\`\`\`

## To go deeper:
# node ~/.claude/session-indexer.js --previous --last 30
# node ~/.claude/session-indexer.js --previous --last 60
`;
  fs.writeFileSync(RELOAD_FILE, content);
}

function writeSessionMd(indexOutput, contextPct) {
  try {
    const continueFile = path.join(CLAUDE_DIR, 'logged-continue.md');
    const continueContent = fs.existsSync(continueFile) ? fs.readFileSync(continueFile, 'utf8') : '';
    const sessionMd = `# Session Continuity\n# Updated: ${new Date().toISOString()} | Context: ${contextPct}%\n\n` +
      '## Recent activity (last 30 mins):\n\n```\n' + indexOutput + '\n```\n\n' + continueContent;
    fs.writeFileSync(path.join(process.cwd(), 'session.md'), sessionMd);
  } catch {}
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

function fireAutoClear() {
  let tmuxTarget = '';
  try {
    tmuxTarget = execSync('tmux display-message -p "#{session_name}:#{window_index}.#{pane_index}" 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {}
  if (!tmuxTarget) return;
  // tmux: send /cc to our pane (which triggers logged.js --cc → save → /clear)
  require('child_process').exec(
    `bash -c "MSYS_NO_PATHCONV=1 tmux send-keys -t '${tmuxTarget}' -l '/cc' && tmux send-keys -t '${tmuxTarget}' Enter" &`,
    { windowsHide: true }
  );
}

// --- Main — silent, seamless ---

const pct = getContextPct();
if (pct < INDEX_START_PCT) process.exit(0);

const state = getState();

if (pct - state.lastIndexPct >= INDEX_INTERVAL_PCT) {
  const session = findLatestSession();
  if (session) {
    const index = runIndexer(session, 30);
    if (index) {
      writeReloadFile(index, pct, TRIGGER);
      writeSessionMd(index, pct);

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

      // At threshold: fire stop → /cc → /clear chain
      if (pct >= AUTO_CLEAR_PCT && !state.autoClearFired) {
        fireAutoClear();
        state.autoClearFired = true;
      }
    }
  }
  state.lastIndexPct = pct;
  state.previousSessionFile = session;
  saveState(state);

  // Reset autoClearFired flag when context drops (new session after clear)
  if (pct < AUTO_CLEAR_PCT) {
    state.autoClearFired = false;
    saveState(state);
  }
}
