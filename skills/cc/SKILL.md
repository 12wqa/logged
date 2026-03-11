---
name: cc
description: Save context to memory then clear. Use when the user wants to clear with continuity.
allowed-tools: Bash
---

Save the current session context to MEMORY.md, then instruct the user to /clear.

Run this command:

```bash
node ~/.claude/logged.js
```

If the snapshot succeeds, tell the user: "Context saved. You're good to `/clear` now — the next Claude will pick up from MEMORY.md."

If context is too low (<15%), tell the user: "Nothing to save yet — just `/clear` directly if you want."

If context is 15-24% and needs --force, just run it with --force automatically (the user chose /cc so they want the save).
