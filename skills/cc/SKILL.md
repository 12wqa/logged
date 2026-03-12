---
name: cc
description: Save context to memory then clear. Use when the user wants to clear with continuity.
allowed-tools: Bash
---

Save the current session context and automatically clear with continuity.

Run this command:

```bash
node ~/.claude/logged.js --cc
```

The --cc flag saves context, writes the trigger file, and fires a delayed keystroke that clears the session automatically.

After the command finishes, say only "Done" and nothing else.

If context is too low (<15%), tell the user: "Nothing to save yet — just `/clear` directly if you want."

If context is 15-24% and needs --force, run with both flags: `node ~/.claude/logged.js --cc --force`
