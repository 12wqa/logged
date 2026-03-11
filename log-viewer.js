#!/usr/bin/env node
// Claude Log Viewer — local web UI for searching conversation history
// No dependencies. Just Node.js built-in http module.
//
// Usage: node ~/.claude/log-viewer.js
// Then open: http://localhost:3333

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const HTML_FILE = path.join(HOME, '.claude', 'log-viewer.html');
const PORT = 3333;

// --- Search engine ---

function findSessions(maxAgeDays) {
  const cutoff = maxAgeDays ? Date.now() - maxAgeDays * 86400000 : 0;
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
            const relPath = path.relative(PROJECTS_DIR, full);
            const project = relPath.split(path.sep)[0]
              .replace(/^C--Users-lane-Projects-/, '')
              .replace(/^C--Users-lane$/, 'general')
              .replace(/^--TOWER-projects-/, 'server:')
              .replace(/^E--[^-]+-/, '');
            sessions.push({
              path: full,
              project,
              sessionId: path.basename(full, '.jsonl').slice(0, 8),
              modified: stat.mtime.toISOString(),
              size: stat.size
            });
          }
        }
      }
    } catch {}
  }

  scan(PROJECTS_DIR);
  return sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

function parseSession(filepath) {
  const entries = [];
  let turnNumber = 0;
  let lines;
  try {
    lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return entries;
  }

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

  return entries;
}

function search(query, maxDays) {
  const sessions = findSessions(maxDays);
  const searchLower = query.toLowerCase();
  const results = [];

  for (const session of sessions) {
    const entries = parseSession(session.path);
    const matches = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.text.toLowerCase().includes(searchLower)) {
        const context = [];
        for (let j = Math.max(0, i - 2); j <= Math.min(entries.length - 1, i + 2); j++) {
          context.push({
            ...entries[j],
            text: entries[j].text.slice(0, 300),
            isMatch: j === i
          });
        }
        matches.push({ context });
      }
    }

    if (matches.length > 0) {
      results.push({
        project: session.project,
        sessionId: session.sessionId,
        modified: session.modified,
        matchCount: matches.length,
        matches: matches.slice(0, 50)
      });
    }
  }

  return results;
}

// --- Server ---

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/api/search' && parsed.query.q) {
    const results = search(parsed.query.q, parsed.query.days ? parseInt(parsed.query.days) : null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
  } else {
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
});

server.listen(PORT, () => {
  console.log('\n  Claude Log Viewer running at: http://localhost:' + PORT + '\n');
  console.log('  Search all your Claude Code conversations in one place.');
  console.log('  Press Ctrl+C to stop.\n');

  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(cmd + ' http://localhost:' + PORT);
});
