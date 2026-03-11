#!/usr/bin/env node
// Session Indexer for Claude Code JSONL logs
// Parses conversation logs and builds a timestamped index
// Zero AI tokens — pure JSON parsing
//
// Usage:
//   node session-indexer.js <session-file.jsonl>           # index specific session
//   node session-indexer.js <session-file.jsonl> --last 10  # show last 10 minutes
//   node session-indexer.js <session-file.jsonl> --last 60  # show last 60 minutes
//   node session-indexer.js --latest                        # auto-find most recent session
//   node session-indexer.js --latest --last 10              # last 10 mins of latest session

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const lastIdx = args.indexOf('--last');
const lastMins = lastIdx !== -1 ? parseInt(args[lastIdx + 1]) || 10 : null;
const useLatest = args.includes('--latest');

let filePath;

if (useLatest) {
  // Find most recent .jsonl in all project dirs
  const claudeDir = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects');
  let newest = null;
  let newestTime = 0;

  function scanDir(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('subagents')) {
          scanDir(full);
        } else if (entry.name.endsWith('.jsonl') && !entry.name.includes('agent-')) {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > newestTime) {
            newestTime = stat.mtimeMs;
            newest = full;
          }
        }
      }
    } catch (e) {}
  }

  scanDir(claudeDir);
  if (!newest) {
    console.error('No session files found');
    process.exit(1);
  }
  filePath = newest;
  console.log(`Latest session: ${path.basename(newest)}`);
  console.log(`Modified: ${new Date(newestTime).toLocaleString()}\n`);
} else {
  filePath = args.find(a => !a.startsWith('--') && a !== String(lastMins));
  if (!filePath) {
    console.log('Usage: node session-indexer.js <file.jsonl> [--last N] [--latest]');
    process.exit(1);
  }
}

const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);

const entries = [];
let turnNumber = 0;

for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    const ts = obj.timestamp;
    if (!ts) continue;

    if (obj.type === 'user' && obj.userType === 'external') {
      turnNumber++;
      const content = typeof obj.message?.content === 'string'
        ? obj.message.content
        : null;
      if (content) {
        entries.push({
          turn: turnNumber,
          time: ts,
          type: 'USER',
          summary: content.slice(0, 120).replace(/\n/g, ' ')
        });
      }
    } else if (obj.type === 'assistant') {
      const parts = Array.isArray(obj.message?.content) ? obj.message.content : [];
      for (const p of parts) {
        if (p.type === 'text' && p.text?.trim()) {
          entries.push({
            turn: turnNumber,
            time: ts,
            type: 'CLAUDE',
            summary: p.text.slice(0, 120).replace(/\n/g, ' ')
          });
        }
        if (p.type === 'tool_use') {
          let detail = '';
          if (p.name === 'Read' || p.name === 'Write' || p.name === 'Edit') {
            detail = p.input?.file_path ? path.basename(p.input.file_path) : '';
          } else if (p.name === 'Bash') {
            detail = (p.input?.command || '').slice(0, 60);
          } else if (p.name === 'Glob' || p.name === 'Grep') {
            detail = p.input?.pattern || '';
          } else if (p.name === 'WebFetch') {
            detail = p.input?.url?.slice(0, 60) || '';
          } else {
            detail = JSON.stringify(p.input || {}).slice(0, 60);
          }
          entries.push({
            turn: turnNumber,
            time: ts,
            type: 'TOOL',
            summary: `${p.name}: ${detail}`
          });
        }
      }
    }
  } catch (e) {}
}

// Filter by time if --last specified
let filtered = entries;
if (lastMins) {
  const cutoff = new Date(Date.now() - lastMins * 60 * 1000);
  filtered = entries.filter(e => new Date(e.time) >= cutoff);
  if (filtered.length === 0) {
    console.log(`No entries in the last ${lastMins} minutes.`);
    console.log(`Session spans: ${entries[0]?.time} to ${entries[entries.length-1]?.time}`);
    process.exit(0);
  }
  console.log(`--- Last ${lastMins} minutes (${filtered.length} entries) ---\n`);
}

// Format output
const timeFormat = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

let lastTurn = 0;
for (const e of filtered) {
  if (e.turn !== lastTurn) {
    if (lastTurn > 0) console.log('');
    lastTurn = e.turn;
  }
  const pad = e.type.padEnd(5);
  console.log(`[${timeFormat(e.time)}] T${String(e.turn).padStart(3)} ${pad} | ${e.summary}`);
}

// Summary stats
console.log(`\n--- Summary ---`);
console.log(`Total turns: ${turnNumber}`);
console.log(`Total entries: ${entries.length}`);
console.log(`Session start: ${entries[0]?.time || 'unknown'}`);
console.log(`Session end: ${entries[entries.length-1]?.time || 'unknown'}`);

// Write index file alongside the jsonl
if (!lastMins) {
  const indexPath = filePath.replace('.jsonl', '.index.txt');
  const indexLines = filtered.map(e =>
    `[${timeFormat(e.time)}] T${String(e.turn).padStart(3)} ${e.type.padEnd(5)} | ${e.summary}`
  ).join('\n');
  fs.writeFileSync(indexPath, indexLines + '\n');
  console.log(`\nIndex written to: ${path.basename(indexPath)}`);
}
