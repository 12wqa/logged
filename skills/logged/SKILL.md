---
name: logged
description: Run a Logged snapshot now. Execute this command and report the result.
allowed-tools: Bash
---

Run a Logged snapshot now. Execute this command and report the result:

```bash
node ~/.claude/logged.js
```

If the script says context is too low or asks for confirmation, relay that message to the user. If they confirm, re-run with `--force`.
