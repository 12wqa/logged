#!/usr/bin/env node
// Logged Launcher — manage Claude Code sessions in tmux
//
// Usage:
//   logged-launcher setup name1:path1 name2:path2 ...
//   logged-launcher list
//   logged-launcher kill <name>
//   logged-launcher kill-all

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const cmd = args[0];

const SESSION = 'logged';

function run(command, opts = {}) {
  try {
    return execSync(command, { encoding: 'utf8', ...opts }).trim();
  } catch (e) {
    if (!opts.quiet) console.error('Error:', e.message);
    return null;
  }
}

function sessionExists() {
  return run(`tmux has-session -t ${SESSION} 2>/dev/null`, { quiet: true }) !== null;
}

function setup(entries) {
  if (entries.length === 0) {
    console.log('Usage: logged-launcher setup name1:path1 name2:path2 ...');
    console.log('Example: logged-launcher setup ops:~/Projects/ops-dashboard calc:E:/websites/firecalc');
    process.exit(1);
  }

  // Parse entries
  const sessions = entries.map(e => {
    const [name, ...rest] = e.split(':');
    const dir = rest.join(':'); // rejoin in case Windows path has C:
    return { name, dir };
  });

  // Kill existing session if present
  if (sessionExists()) {
    run(`tmux kill-session -t ${SESSION}`, { quiet: true });
  }

  // Create session with first window
  const first = sessions[0];
  run(`tmux new-session -d -s ${SESSION} -n ${first.name}`);

  // Set up first window
  const unset = 'Remove-Item env:CLAUDE_CODE_ENTRYPOINT -EA SilentlyContinue; Remove-Item env:CLAUDECODE -EA SilentlyContinue';
  const cdFirst = first.dir ? `Set-Location '${first.dir}';` : '';
  run(`tmux send-keys -t ${SESSION}:${first.name} '${unset}; ${cdFirst} claude' Enter`);

  // Create remaining windows
  for (let i = 1; i < sessions.length; i++) {
    const s = sessions[i];
    run(`tmux new-window -t ${SESSION} -n ${s.name}`);
    const cd = s.dir ? `Set-Location '${s.dir}';` : '';
    run(`tmux send-keys -t ${SESSION}:${s.name} '${unset}; ${cd} claude' Enter`);
  }

  // Select first window
  run(`tmux select-window -t ${SESSION}:${first.name}`);

  console.log(`Session "${SESSION}" ready with ${sessions.length} windows:`);
  sessions.forEach(s => console.log(`  ${s.name} → ${s.dir}`));
  console.log('');
  console.log('Attach with:  tmux attach -t logged');
  console.log('Switch windows: Ctrl+b n (next), Ctrl+b p (prev), Ctrl+b <number>');
}

function list() {
  if (!sessionExists()) {
    console.log('No logged session running.');
    return;
  }
  const windows = run(`tmux list-windows -t ${SESSION} -F "#{window_name} #{pane_id} #{pane_current_path}"`);
  console.log('Logged session:');
  if (windows) {
    windows.split('\n').forEach(w => console.log('  ' + w));
  }
}

function kill(name) {
  if (name === 'all') {
    run(`tmux kill-session -t ${SESSION}`);
    console.log('Killed all logged sessions.');
  } else {
    run(`tmux kill-window -t ${SESSION}:${name}`);
    console.log(`Killed window "${name}".`);
  }
}

// --- Main ---
if (!cmd || cmd === 'help') {
  console.log('Logged Launcher — manage Claude Code tmux sessions');
  console.log('');
  console.log('Commands:');
  console.log('  setup name1:path1 name2:path2   Create session with Claude in each window');
  console.log('  list                             Show running windows');
  console.log('  kill <name>                      Kill a specific window');
  console.log('  kill-all                         Kill entire session');
  console.log('');
  console.log('Example:');
  console.log('  node logged-launcher.js setup ops:~/Projects/ops-dashboard calc:E:/websites/firecalc');
} else if (cmd === 'setup') {
  setup(args.slice(1));
} else if (cmd === 'list') {
  list();
} else if (cmd === 'kill') {
  kill(args[1] || 'all');
} else if (cmd === 'kill-all') {
  kill('all');
} else {
  console.log('Unknown command: ' + cmd);
}
