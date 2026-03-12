---
name: cc
description: Save context to memory then clear. Use when the user wants to clear with continuity.
allowed-tools: Bash
---

Save the current session context and automatically clear with continuity.

Run these commands in order:

```bash
node ~/.claude/logged.js --cc
```

Then schedule the /clear:

```bash
sleep 10 && MSYS_NO_PATHCONV=1 tmux send-keys -t "$(tmux display-message -p '#{session_name}:#{window_index}.#{pane_index}')" -l '/clear' && tmux send-keys -t "$(tmux display-message -p '#{session_name}:#{window_index}.#{pane_index}')" C-m &
```

After both commands finish, say only "Done" and nothing else.

If context is too low (<15%), tell the user: "Nothing to save yet — just `/clear` directly if you want."

If context is 15-24% and needs --force, run with both flags: `node ~/.claude/logged.js --cc --force`
