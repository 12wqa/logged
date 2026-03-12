#!/usr/bin/env node
// SessionStart hook — pure file loader, no instructions here
//
// Input:  JSON on stdin with {"cwd": "/path/to/dir", ...}
// Output: JSON with hookSpecificOutput.additionalContext
//
// Loads in order:
//   1. Auto-clear continuation (reload-after-clear.md) if trigger exists
//   2. Logged instructions (logged-instructions.md) — always
//   3. si.md from launch directory (session/role instructions)
//   4. comms.md from parent directory (shared protocol, optional)
//
// All intelligence lives in the FILES, not this hook.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDE_DIR = path.join(HOME, '.claude');
const TRIGGER_FILE = path.join(CLAUDE_DIR, 'auto-clear-trigger');
const RELOAD_FILE = path.join(CLAUDE_DIR, 'reload-after-clear.md');
const INSTRUCTIONS_FILE = path.join(CLAUDE_DIR, 'logged-instructions.md');
const CONTINUE_FILE = path.join(CLAUDE_DIR, 'logged-continue.md');

let input = '';
const logFile = path.join(CLAUDE_DIR, 'session-start.log');
function log(msg) {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  log(`stdin: ${input.substring(0, 200)}`);
  let cwd = '';
  try {
    const parsed = JSON.parse(input);
    cwd = parsed.cwd || '';
  } catch {}
  if (!cwd) cwd = process.cwd();
  log(`cwd: ${cwd}`);

  // Stash launch dir so it persists if cwd changes during session
  const launchMarker = path.join(os.tmpdir(), `.claude-session-${process.ppid}`);
  try {
    if (!fs.existsSync(launchMarker)) {
      fs.writeFileSync(launchMarker, cwd);
    }
  } catch {}
  let launchDir = cwd;
  try { launchDir = fs.readFileSync(launchMarker, 'utf8').trim() || cwd; } catch {}
  log(`launchDir: ${launchDir}`);

  const parts = [];

  // 1. Auto-clear continuation — if trigger file exists, load reload + continue
  let wasContinuation = false;
  try {
    fs.readFileSync(TRIGGER_FILE, 'utf8');
    wasContinuation = true;
    log('trigger file found — continuation mode');
    // Load the reload file (recent activity snapshot)
    try {
      parts.push(fs.readFileSync(RELOAD_FILE, 'utf8'));
    } catch {}
    // Load continue instructions — tells Claude to resume the task
    try {
      parts.push(fs.readFileSync(CONTINUE_FILE, 'utf8'));
    } catch {}
    // One-shot: delete trigger
    try { fs.unlinkSync(TRIGGER_FILE); } catch {}
  } catch {
    // No trigger = normal start
  }

  // 2. Logged instructions — always load if the file exists
  try {
    parts.push(fs.readFileSync(INSTRUCTIONS_FILE, 'utf8'));
  } catch {}

  // 3. session.md or si.md from launch directory
  const sessionMdFile = path.join(launchDir, 'session.md');
  const siFile = path.join(launchDir, 'si.md');
  // session.md — ongoing working context (written by Logged)
  try {
    parts.push(fs.readFileSync(sessionMdFile, 'utf8'));
  } catch {}

  // si.md — role/project instructions (multi-agent / pipework)
  try {
    const si = fs.readFileSync(siFile, 'utf8');
    const role = path.basename(launchDir);
    const sessionsDir = path.dirname(launchDir);
    const projectDir = path.dirname(sessionsDir);
    const project = projectDir === HOME ? 'Home' : path.basename(projectDir);

    parts.push(`## ${project} - ${role} Session\n`);
    parts.push(si);

    // 4. comms.md from parent (sessions) directory
    const commsFile = path.join(sessionsDir, 'comms.md');
    try {
      parts.push('\n');
      parts.push(fs.readFileSync(commsFile, 'utf8'));
    } catch {}
  } catch {}

  log(`parts count: ${parts.length}, wasContinuation: ${wasContinuation}`);

  // Always output valid JSON — Claude Code errors on empty stdout
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      additionalContext: parts.join('\n')
    }
  }));

  process.exit(0);
});
