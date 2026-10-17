# Session Activity

A Claude Code mod that shows what took part in your session. A row of chips above the prompt names each skill, subagent, MCP server, permission decision, settings hook and rule file that activated. Press a chip, or type its digit into an empty prompt, to open the details pane.

```text
 1 ↯ block-secrets  BLOCKED    2 ◉ code-reviewer    3 ⇌ github ×3    4 ⚷ git push    +10 more
╭──────────────────────────────────────────────────────────────────────────────────────────╮
│ > _                                                                                       │
╰──────────────────────────────────────────────────────────────────────────────────────────╯
```

Tested with Claude Code 2.1.302. Mods need 2.1.287 or later.

## Install

```sh
claude plugin marketplace add tinesoft/claude-mods@main
```

```text
/plugin install session-activity@tinesoft-mods
```

## What the chips show

| Chip       | Glyph | Recorded when                                                          | States                      |
| ---------- | ----- | ---------------------------------------------------------------------- | --------------------------- |
| Skill      | `▤`   | Claude expands a skill (`/name`, the Skill tool, a preload)            | active                      |
| Agent      | `◉`   | Claude starts a subagent, keyed by its type                            | running, ok, error          |
| MCP server | `⇌`   | Claude calls one of the server's tools; the pane lists the tools       | ok, error                   |
| Permission | `⚷`   | A rule or hook allowed a call, a call was denied, or Claude asked you  | ok, running (asked), denied |
| Hook       | `↯`   | A settings hook configured for the event ran, or the event was blocked | ok, blocked                 |
| Rule       | `▣`   | A `CLAUDE.md` or `.claude/rules` file was loaded                       | active                      |

Optional types are off by default: slash commands (`/`), context use and compaction (`◔`), the model each request went to (`≡`), and background Bash tasks (`▶`).

Blocked, denied and errored chips sit first in the row and stay visible even when their type is hidden or muted. Each status is also a text badge, so the colour is never the only signal.

## The pane

Open it with `/session-activity`, a chip, or `+N more` (hotkey `0`).

- **Activity** (`1`). Filter by type with the letter hotkeys (`a` all, `s` skills, `g` agents, `p` MCP, `k` permissions, `h` hooks, `r` rules). Select a row to see why it is there and where it came from. `m` mutes or unmutes it in the band, and `c` copies its path.
- **Settings** (`2`). Turn the band on or off, pick the layout, and show or hide each type. `Reset to defaults` returns to your plugin options.

## Settings

The plugin options (`/config`, or `pluginConfigs` in settings) are the defaults. Changes made in the pane override them and persist across sessions.

| Option        | Default               | Effect                                                                           |
| ------------- | --------------------- | -------------------------------------------------------------------------------- |
| `enabled`     | `true`                | Show chips above the prompt                                                      |
| `layout`      | `row`                 | `row` of chips, or one `summary` chip such as `16 active · ▤2 ◉2 ⇌2 · 1 stopped` |
| `max_chips`   | `6`                   | Chips shown before `+N more` (1 to 20)                                           |
| `show_<type>` | core on, optional off | Show that type in the band                                                       |

Chips belong to one conversation. `/clear` and `/resume` empty them; muting lasts until then too.

## Limits

- Hook chips are one per event (`PreToolUse`, `PostToolUse`, ...). Claude Code does not expose each command's exit code to a mod, so a chip names the script when one command is configured and `<Event> hooks` otherwise. Hooks that plugins configure are not in your settings, so they show only when they block.
- Permission chips leave out calls your permission mode allows on its own, such as reads, to keep the band readable. A call a hook allowed or denied shows on that hook's chip instead. Whether you approved "once" or "always" is not visible to a mod.
- Rule chips mean a file was loaded, not that a line in it shaped an action.
- Where an organization manages Claude Code, skill, hook, rule and compaction events reach only plugins the organization lists, so those chips stay empty.
- Memory and checkpoint chips are not supported: no event names them.

## Development

From the repository root:

```sh
pnpm nx run session-activity:dev        # claude --plugin-dir mods/session-activity
pnpm nx run-many -t lint typecheck validate test
```

`hooks/register.tsx` holds every hook and every `$` call. `src/` holds pure helpers that take plain data: `model.ts` (the activation list and its reducer), `classify.ts` (event data to chips), `render.tsx` (band and pane trees) and `theme.ts` (glyphs, colours, hotkeys). Tests in `tests/` run under `claude plugin test` and drive the mod through the engine's events and drawings.
