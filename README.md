# Logged

Seamless context management for Claude Code. Never lose track of what you're working on.

## What It Does

Claude Code has a context window. When it fills up, compaction kicks in and throws away details — often the important ones. **Logged** fixes this by:

1. **Silently indexing** your conversation every 5% of context usage
2. **Updating MEMORY.md** so after `/clear`, Claude automatically knows what was happening
3. **Keeping a reload file** with recent activity for instant recovery
4. **Writing daily logs** so you have a permanent, searchable record of every session
5. **Providing a web UI** to search across all your conversations

You never think about context again. Just work.

## Quick Start

```bash
# Clone into your .claude directory
git clone https://github.com/12wqa/logged.git
cp logged/*.js ~/.claude/
cp logged/log-viewer.html ~/.claude/

# Add the hook to ~/.claude/settings.json
```

Add this to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/context-manager.js 2>&1 || true"
          }
        ]
      }
    ]
  }
}
```

Restart Claude Code. Done.

## How It Works

Logged reads the JSONL conversation logs that Claude Code already writes. Every message, every tool call, every response — timestamped. Logged just indexes what's already there.

```
Claude Code writes JSONL → statusline.js logs context % →
context-manager.js watches % → session-indexer.js builds timeline →
MEMORY.md + reload file + daily log all stay current
```

After `/clear`, the next Claude instance loads MEMORY.md automatically and sees a "Current Session" section with the last 15 conversation entries. It picks up where you left off. No manual intervention.

## Commands

```bash
node ~/.claude/logged.js                # force snapshot now
node ~/.claude/logged.js last 30        # show last 30 minutes
node ~/.claude/logged.js search uptick  # search all conversation logs
node ~/.claude/logged.js viewer         # open web search UI
node ~/.claude/logged.js test           # run test harness
```

## Files

| File | Purpose |
|---|---|
| `logged.js` | Main entry point — snapshot, search, viewer, test |
| `context-manager.js` | Hook that silently indexes every 5% context increase |
| `session-indexer.js` | Parses JSONL logs into timestamped timelines |
| `search-logs.js` | CLI search across all conversation logs |
| `log-viewer.js` | Local web server for the search UI |
| `log-viewer.html` | Search UI — dark theme, results with context, copy buttons |
| `test-context-system.js` | Test harness that simulates rising context % |
| `statusline.js` | Statusline that displays context % and writes to log file |

## Three Layers of Continuity

| Layer | File | How it loads | Purpose |
|---|---|---|---|
| Automatic | MEMORY.md | Built-in (always loaded) | Key context + live session state |
| On-demand | reload-after-clear.md | Claude reads it | Detailed recent activity |
| Archive | index-logs/YYYY-MM-DD.log | Manual lookup or search | Full permanent history |

## Prerequisites

- **Claude Code** (with statusline support and hooks)
- **Node.js** (no other dependencies)
- **statusline.js** configured to write context % to `~/.claude/statusline.log`

## The Key Insight

Claude Code already logs everything to JSONL files with timestamps. The statusline already tracks context %. Logged just connects the pipes that are already there.

Context is a workspace, not a bucket to fill up.
Logs are the real memory, not the conversation.
`/clear` is free, instant, no data loss.

## License

MIT — see [LICENSE](LICENSE)
