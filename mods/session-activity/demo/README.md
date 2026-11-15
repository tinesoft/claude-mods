# session-activity demo

A throwaway sample repo ("Invoicely") for recording session-activity in action. It is not part of the mod and is never published.

```sh
node mods/session-activity/demo/setup.mjs --run   # rebuild the workspace, then start Claude Code in it
node mods/session-activity/demo/setup.mjs         # rebuild only
```

`setup.mjs` copies `template/` to `demo/.workspace/` (git-ignored), writes a fake `.env`, runs `git init` and commits. Run it again before each session to reset.

## One prompt, unlike other demos

session-activity draws what Claude does in the session, and keeps it in memory only, so no file can stage it. The tour sends one real prompt, `/ship-check`, and the workspace pins it to Haiku (`"model": "haiku"` in `.claude/settings.json`). A recording or a probe costs a few cents, and Claude's run takes about 20 seconds, which the tour waits out.

## What the workspace shows

| Where                                   | Chip                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `CLAUDE.md`, `.claude/rules/testing.md` | Two rule chips, before any prompt                                        |
| `.claude/skills/release-notes`          | A skill chip                                                             |
| `tools/github-mcp.mjs`, `.mcp.json`     | A `github` MCP chip, from its one `list_issues` tool                     |
| `.claude/agents/code-reviewer.md`       | An agent chip, running then done                                         |
| `.claude/hooks/block-secrets.sh`        | A `block-secrets` hook chip, `BLOCKED`, and its toast                    |
| `.claude/commands/ship-check.md`        | The prompt. Claude Code runs it as a skill, so it is a second skill chip |

`setup.mjs` also lists every `CLAUDE.md` and `.claude/rules` file above the workspace in `claudeMdExcludes`. Claude Code would otherwise load this repo's own `CLAUDE.md` too, and show it as a rule chip.

## Hooks from your own settings

Hooks in your user settings run in the demo too, and show as chips. Orca, for one, adds a hook to nearly every event: a `claude-hook ×28` chip appears, and with two `PreToolUse` hooks the blocked chip reads `PreToolUse hooks` instead of `block-secrets`. Record the terminal from the devcontainer, which has none, as the skill says. On the Mac, turn such hooks off for the length of a Desktop recording.

The tour clicks chips by their glyph (`↯` for the blocked hook, which always comes first, `◉` for the agent), so it plays either way.

## Recording the GIF

Run the `screen-recording` skill (`.claude/skills/screen-recording`): `/screen-recording session-activity`. It resets the workspace, plays `tour.json` in a real Claude Code session and renders `assets/screenshots/session-activity.gif`.

- `tour.json`: the terminal tour, 120×44. The band needs that height for the detail card to open above the chips rather than in the pane.
- `tour.desktop.json`: the Desktop tour. Its clicks are `null` until probed on the Mac with a maximized window, as `references/desktop.md` describes.
