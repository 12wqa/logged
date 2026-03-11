#!/usr/bin/env node
// Search across ALL Claude Code conversation logs
// Finds what you were working on, when, and where
//
// Usage:
//   node ~/.claude/search-logs.js "uptick api"          # search all logs
//   node ~/.claude/search-logs.js "quote generator" -5  # last 5 days only
//   node ~/.claude/search-logs.js "checkmarks" --full   # show more context per match

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');

const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('-'));
const daysBack = args.find(a => /^-\d+$/.test(a));
const fullMode = args.includes('--full');

if (!query) {
  console.log('Usage: node ~/.claude/search-logs.js "search term" [-days] [--full]');
  console.log('');
  console.log('Examples:');
  console.log('  node ~/.claude/search-logs.js "uptick"');
  console.log('  node ~/.claude/search-logs.js "quote" -7       # last 7 days');
  console.log('  node ~/.claude/search-logs.js "oauth" --full   # more context');
  process.exit(0);
}

const maxAge = daysBack ? parseInt(daysBack.slice(1)) * 24 * 60 * 60 * 1000 : Infinity;
const cutoff = Date.now() - maxAge;
const searchLower = query.toLowerCase();
const contextLines = fullMode ? 5 : 1;

// Colors
const G = '\x1b[32m';
const Y = '\x1b[33m';
const C = '\x1b[36m';
const M = '\x1b[35m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RST = '\x1b[0m';
const RED = '\x1b[31m';

// Find all session JSONL files
function findSessions() {
  const sessions = [];

  function scan(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('subagents')) {
          scan(full);
        } else if (entry.name.endsWith('.jsonl') && !entry.name.includes('agent-')) {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= cutoff) {
            // Get project name from parent dir
            const relPath = path.relative(PROJECTS_DIR, full);
            const project = relPath.split(path.sep)[0]
              .replace(/^C--Users-lane-Projects-/, '')
              .replace(/^C--Users-lane$/, 'general')
              .replace(/^--TOWER-projects-/, 'server:');
            sessions.push({
              path: full,
              project,
              sessionId: path.basename(full, '.jsonl').slice(0, 8),
              modified: stat.mtime,
              size: stat.size
            });
          }
        }
      }
    } catch {}
  }

  scan(PROJECTS_DIR);
  return sessions.sort((a, b) => b.modified - a.modified);
}

// Search a single session file
function searchSession(session) {
  const matches = [];
  let lines;
  try {
    lines = fs.readFileSync(session.path, 'utf8').split('\n').filter(Boolean);
  } catch {
    return matches;
  }

  // Parse all entries with text content
  const entries = [];
  let turnNumber = 0;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const ts = obj.timestamp;
      if (!ts) continue;

      if (obj.type === 'user' && obj.userType === 'external') {
        turnNumber++;
        const content = typeof obj.message?.content === 'string' ? obj.message.content : null;
        if (content) {
          entries.push({ turn: turnNumber, time: ts, type: 'USER', text: content });
        }
      } else if (obj.type === 'assistant') {
        const parts = Array.isArray(obj.message?.content) ? obj.message.content : [];
        for (const p of parts) {
          if (p.type === 'text' && p.text?.trim()) {
            entries.push({ turn: turnNumber, time: ts, type: 'CLAUDE', text: p.text });
          }
        }
      }
    } catch {}
  }

  // Search entries
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.text.toLowerCase().includes(searchLower)) {
      // Grab surrounding context
      const context = [];
      for (let j = Math.max(0, i - contextLines); j <= Math.min(entries.length - 1, i + contextLines); j++) {
        context.push(entries[j]);
      }
      matches.push({
        entry: e,
        context,
        matchIndex: i - Math.max(0, i - contextLines)
      });
    }
  }

  return matches;
}

// Highlight search term in text
function highlight(text, maxLen) {
  const truncated = text.slice(0, maxLen).replace(/\n/g, ' ');
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return truncated.replace(re, `${RED}${BOLD}$1${RST}`);
}

// Format timestamp
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Main
const sessions = findSessions();
console.log(`${BOLD}${C}Searching ${sessions.length} sessions for "${query}"${RST}\n`);

let totalMatches = 0;
const resultsBySession = [];

for (const session of sessions) {
  const matches = searchSession(session);
  if (matches.length > 0) {
    resultsBySession.push({ session, matches });
    totalMatches += matches.length;
  }
}

if (totalMatches === 0) {
  console.log(`${DIM}No matches found.${RST}`);
  if (maxAge < Infinity) {
    console.log(`${DIM}Try without the day limit, or a different search term.${RST}`);
  }
  process.exit(0);
}

console.log(`${G}${totalMatches} matches${RST} across ${resultsBySession.length} session(s)\n`);

for (const { session, matches } of resultsBySession) {
  console.log(`${BOLD}${M}── ${session.project}${RST} ${DIM}(${session.sessionId}... | ${session.modified.toLocaleDateString('en-AU')})${RST}`);

  // Deduplicate nearby matches (within 3 turns)
  const shown = new Set();
  for (const match of matches) {
    const turnKey = match.entry.turn;
    if (shown.has(turnKey)) continue;
    shown.add(turnKey);

    if (fullMode) {
      // Show context
      for (let i = 0; i < match.context.length; i++) {
        const c = match.context[i];
        const prefix = i === match.matchIndex ? '>>>' : '   ';
        const typeColor = c.type === 'USER' ? Y : C;
        console.log(`  ${prefix} ${DIM}${fmtTime(c.time)}${RST} ${typeColor}${c.type.padEnd(5)}${RST} ${i === match.matchIndex ? highlight(c.text, 200) : c.text.slice(0, 120).replace(/\n/g, ' ')}`);
      }
      console.log('');
    } else {
      // Compact: just the matching line
      const typeColor = match.entry.type === 'USER' ? Y : C;
      console.log(`  ${DIM}${fmtTime(match.entry.time)}${RST} T${String(match.entry.turn).padStart(3)} ${typeColor}${match.entry.type.padEnd(5)}${RST} ${highlight(match.entry.text, 150)}`);
    }
  }
  console.log('');
}

console.log(`${DIM}Tip: Use --full for more context around each match${RST}`);
console.log(`${DIM}Tip: Use -N to limit to last N days (e.g. -3 for last 3 days)${RST}`);
