# Logged — Context Management System

## What Is This?

A system that makes sure Claude never loses track of what you're working on.
It runs silently in the background — you don't need to do anything.

When you `/clear` a conversation (or start a new one), Claude automatically
knows what you were just doing because the system keeps notes for it.

No more "sorry, I lost context" moments.

---

## How It Works (Plain English)

1. **Every few minutes**, a script checks how full Claude's memory is
2. **When it's getting full**, it writes a snapshot of what's been happening
3. **That snapshot goes to three places:**
   - MEMORY.md (Claude reads this automatically every time)
   - A reload file (backup, in case Claude needs more detail)
   - A daily log file (permanent record of everything)
4. **When you `/clear`**, Claude starts fresh but immediately sees
   the snapshot in MEMORY.md — picks up right where you left off
5. **If Claude needs more detail**, it reads the log files

That's it. You never think about context again.

---

## The Files

All files live in `~/.claude/` (that's `C:\Users\lane\.claude\`)

| File | What It Does |
|---|---|
| `statusline.js` | The bar at the bottom showing context %, cost, etc. |
| `statusline.log` | Current stats (updates every refresh) |
| `context-manager.js` | The brain — watches context, writes snapshots |
| `session-indexer.js` | Reads conversation logs and builds a timeline |
| `context-state.json` | Tracks when the last snapshot was taken |
| `reload-after-clear.md` | Backup snapshot Claude can read after /clear |
| `settings.json` | Hooks that make it all run automatically |
| `index-logs/` | Folder with daily log files (one per day) |

### Where does MEMORY.md live?

`~/.claude/projects/C--Users-lane/memory/MEMORY.md`

This file is special — Claude loads it automatically at the start of
every conversation. The context manager writes a "Current Session"
section at the bottom that updates itself.

---

## What You Might Actually Need To Do

### Nothing, usually

The system is automatic. Just work normally.

### If Claude seems lost after a /clear

Tell it: "Read ~/.claude/reload-after-clear.md"

That file has the last 15 minutes of activity with timestamps.

### If you want to see what happened today

Run this in the terminal:
```
node ~/.claude/session-indexer.js --latest --last 30
```
That shows the last 30 minutes. Change the number for more or less.

### If you want to see a specific day's history

Look in:
```
~/.claude/index-logs/
```
Files are named by date: `2026-03-11.log`, `2026-03-12.log`, etc.

### If you want to see the FULL conversation log (raw)

The raw logs are at:
```
~/.claude/projects/C--Users-lane/[session-id].jsonl
```
These are the complete transcripts — every message, every tool call.
The indexer reads these to build the timeline.

---

## How The Hook Works

In `settings.json`, there's a hook set up on "PostToolUse" — meaning
after every tool Claude uses (reading a file, running a command, etc.),
the context manager runs automatically.

It checks: "Has context gone up 5% since I last took a snapshot?"
- **No?** Does nothing. Silent.
- **Yes?** Takes a snapshot, updates MEMORY.md, writes reload file, appends to daily log.

Starts watching from 15% context onwards.

---

## Troubleshooting

### The session section in MEMORY.md isn't updating
- Check `~/.claude/context-state.json` — the `lastIndexPct` value
- Reset it: `echo '{"lastIndexPct":0}' > ~/.claude/context-state.json`
- The hook will re-trigger on the next tool use

### Want to force a snapshot right now?
```
echo '{"lastIndexPct":0}' > ~/.claude/context-state.json
node ~/.claude/context-manager.js
```

### The statusline disappeared
- Check `~/.claude/settings.json` has the statusLine section
- Restart Claude Code

### Index logs getting too big?
- Each day is a separate file, so old days can be deleted
- They're just text files, a few KB each

---

## The Big Idea

Context = a workspace, not a bucket to fill up.
Logs = the real memory, not the conversation.
/clear = free, instant, no data loss.

The system makes /clear seamless so you never fear running out of context.
Clear early, clear often, the logs have your back.
