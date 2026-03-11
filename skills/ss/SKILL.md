---
name: ss
description: Check the screenshots directory for the latest screenshots and read/analyze them.
argument-hint: [count] [description]
allowed-tools: Bash, Read, Glob
---

Check the user's screenshot directory for the latest screenshots.

Screenshot directory: `C:\Users\lane\screenshots`

## Arguments

The arguments are flexible:
- `/ss 4 describe these` — show the latest 4 screenshots
- `/ss what is this error` — show the latest 1 screenshot (default) with context about what to look for
- `/ss 2` — show the latest 2 screenshots

Parse the arguments: if the first word is a number, use it as the count. Everything else is context/description. Default count is 1.

## Steps

1. List the screenshot directory sorted by modification time (newest first), limited to the count
2. Read each screenshot file using the Read tool (it supports images)
3. Describe what you see, focusing on any context the user provided in their description

Arguments: $ARGUMENTS
