<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/images/session-activity-logo-dark.svg">
  <img alt="session-activity — see what took part in your Claude Code session" src="../../assets/images/session-activity-logo-light.svg" width="128">
</picture>

# Session Activity

[![CI](https://github.com/tinesoft/claude-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/tinesoft/claude-mods/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A52.1.287-D97757.svg)](https://claude.com/claude-code)

</div>

A Claude Code mod that shows what took part in your session. A row of chips above the prompt names each skill, subagent, MCP server, permission decision, settings hook and rule file that activated. Press a chip to see why it is there. The detail card opens above the row, next to the prompt, or the pane opens when the band is too short for it.

```text
 ↯ block-secrets  BLOCKED    ◉ code-reviewer    ⇌ github ×3    ⚷ git push    +10 more
╭──────────────────────────────────────────────────────────────────────────────────────────╮
│ > _                                                                                      │
╰──────────────────────────────────────────────────────────────────────────────────────────╯
  16 active · /session-activity
```

---

## ✨ Features

- 🧩 **One chip per participant** — skills, subagents, MCP servers, permission decisions, settings hooks and rule files, each with its own glyph
- 🔍 **Why is it there?** — press a chip for a detail card with the reason and the source it came from
- 🚨 **Problems first** — blocked, denied and errored chips lead the row, stay visible when their type is hidden, and raise one toast
- 📋 **A full pane** — `/session-activity` opens every activation grouped by type, with filters, muting and live settings
- 🎛️ **Optional types** — permission decisions, slash commands memory writes, context use, model switches and background Bash tasks
- 🌓 **Follows your theme** — tinted chips in the design's light or dark colours, picked from your Claude Code theme, your terminal or your system, or pinned with `chip_theme`
- ♿ **Never colour alone** — every status is also a text badge
- 🖥️ **Terminal, Desktop, VS Code and mobile** — chips above the prompt in the terminal and on Desktop, the pane everywhere, a text summary where nothing can be drawn

---

## 📦 Installation

Requires Claude Code 2.1.299 or later. On an older version the mod draws nothing and says to run `claude update`. Tested with 2.1.302.

Install the mod from `main`, which holds released code only:

```sh
claude plugin install session-activity --marketplace tinesoft/claude-mods@main
```

<details>
<summary><strong>claude.ai/code cloud sessions</strong></summary>

Cloud sessions do not install plugins from your settings. If your cloud environment's setup script can run this command, the mod works there in text form:

```sh
claude plugin install session-activity --marketplace tinesoft/claude-mods@main
```

This is unverified until the cloud spike confirms that a setup script can install a plugin and that the text shows in the transcript.

</details>

### Surfaces

| Surface                               | What you get                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Terminal (`claude`, editor terminals) | The full UI, drawn with glyphs and one-row tinted chips                                                                      |
| Claude Desktop app, Code tab          | The full UI with `Svg` icons, exact colours, rounded bordered chips, a darker tint on hover, and clicks on every control     |
| VS Code                               | The pane and the status line, drawn as on Desktop. Claude Code draws no band here, so open the pane with `/session-activity` |
| Mobile                                | The pane and the status line, with an `N active` chip (and a red dot when something stopped) heading the pane. No band       |
| claude.ai/code cloud sessions         | Text only: `/session-activity` replies with a summary, and `text_summary` adds a line after each answer                      |
| claude.ai chat, `claude -p`           | Nothing is drawn. Hooks still run, so `/session-activity` replies in text where it is available                              |

Remote Control from claude.ai shows the chips in the terminal on your machine. Desktop WSL sessions do not load plugins.

---

## 🚀 Usage

### What the chips show

| Chip       | Glyph | Recorded when                                                          | States                      |
| ---------- | ----- | ---------------------------------------------------------------------- | --------------------------- |
| Skill      | `▤`   | Claude expands a skill (`/name`, the Skill tool, a preload)            | active                      |
| Agent      | `◉`   | Claude starts a subagent, keyed by its type                            | running, ok, error          |
| MCP server | `⇌`   | Claude calls one of the server's tools; the pane lists the tools       | ok, error                   |
| Permission | `⚷`   | A rule or hook allowed a call, a call was denied, or Claude asked you  | ok, running (asked), denied |
| Hook       | `↯`   | A settings hook configured for the event ran, or the event was blocked | ok, blocked                 |
| Rule       | `▣`   | A `CLAUDE.md` or `.claude/rules` file was loaded                       | active                      |

Optional types are off by default: permission decisions (`⚷`; denied calls still show), slash commands (`/`), memory (`✎`), context use and compaction (`◔`), model switches (`≡`), background Bash tasks (`▶`), and checkpoints (`⚑`, not yet supported). The plugin option tags every chip that a plugin supplied with a dim `via <plugin>`; it is a tag, not a chip of its own.

A memory chip appears when Claude writes or edits `CLAUDE.md`, `CLAUDE.local.md` or a markdown file in a `memory/` folder, labelled `Remembered: <file>`.

A chip that was just activated is bold with a `●` for four seconds. A running agent or asked permission cycles `◐◓◑◒`. A failed one shows a red `▲` and an `ERROR` badge (bold red `Error` on a tinted chip, with a dashed red border on Desktop). When an action is blocked or denied, one toast names it, such as `↯ block-secrets blocked Bash`; turn it off with `toast_on_block`. The status line under the prompt keeps the count: `16 active · /session-activity`.

Blocked, denied and errored chips sit first in the row and stay visible even when their type is hidden or muted. Each status is also a text badge, so the colour is never the only signal.

Chips are tinted with the design's light or dark colours. With `chip_theme` on `auto`, the terminal follows a `light` or `dark` Claude Code theme (daltonized included). Under the `auto` theme, which asks the terminal for its colours in a way a mod cannot see, it reads `COLORFGBG`, then the system appearance, then settles on dark. Desktop, VS Code and mobile follow the system appearance, then the Claude Code theme, then light. The ANSI themes keep coloured text. Set `chip_theme` to `light` or `dark` to pin the colours, or `chip_style` to `text` to always use coloured text.

### Key bindings

A gear (`⚙`) at the right end of the row opens the pane on its settings view, and pressing it again closes the pane. It sits beside Claude Code's own `[-]` collapse mark.

Press Ctrl+X then Tab to focus the band. In fullscreen mode and in the Desktop app a click works too.

| Keys            | Action                                                     |
| --------------- | ---------------------------------------------------------- |
| `Ctrl+X` `Tab`  | Focus the band                                             |
| `Enter`         | Open the selected chip's detail card                       |
| `Enter` again   | Close the card (as does its `x: Close`)                    |
| `o`             | Copy the source path (a mod cannot open an editor)         |
| `m`             | Mute the chip, hiding it from the band                     |
| `1` to `9`, `0` | Open a chip, or `+N more` (off by default; `chip_hotkeys`) |

Digit hotkeys are off by default, because a bare digit typed into an empty prompt would open a chip. A mod cannot read Esc in the band, so the card closes with the chip or its `x: Close` button, not with Esc.

### The pane

Open it with `/session-activity`, `+N more`, or a chip when the band is too short for the card (the pane then opens on that item).

- **Activity** (`1`). A header counts the items and activations. Filter by type with the letter hotkeys (`a` all, `s` skills, `g` agents, `p` MCP, `k` permissions, `h` hooks, `r` rules, with a count each). Rows are grouped by type. Every row shows its why line and a `Mute` or `Unmute` button; stopped and errored rows always show, so they carry a note instead. Select a row to see where it came from: `m` mutes or unmutes it in the band, `c` copies its path, and `Customize` jumps to the settings. A muted row is dim with a `Muted` badge.
- **Settings** (`2`). The master switch, a live preview drawn by the band renderer with `Chip row` and `Collapsed summary`, one switch per type in "Shown by default" and "Optional", then chip theme, chip style, digit hotkeys, the toast and the text summary. `Reset to defaults` returns to your plugin options and `Turn everything on` shows every type.

---

## ⚙️ Settings

The plugin options (`/config`, or `pluginConfigs` in settings) are the defaults. Changes made in the pane override them, persist across sessions, and are reloaded when a session starts, including after `/clear`.

| Option           | Default               | Effect                                                                                                                             |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`        | `true`                | Show chips above the prompt                                                                                                        |
| `layout`         | `row`                 | `row` of chips, or one `summary` chip such as `▤2 ◉2 ⇌2 · ● 1 blocked`                                                             |
| `max_chips`      | `6`                   | Chips shown before `+N more` (1 to 20)                                                                                             |
| `show_<type>`    | core on, optional off | Show that type: skills, agents, mcp, permissions, hooks, rules, commands, memory, plugins, context, checkpoints, model, background |
| `chip_theme`     | `auto`                | `light` or `dark` chip colours, or `auto` to follow the Claude Code theme, then the terminal, then the system                      |
| `chip_style`     | `tinted`              | `tinted` chips, or `text` for coloured text only                                                                                   |
| `chip_hotkeys`   | `false`               | Digit hotkeys on chips                                                                                                             |
| `toast_on_block` | `true`                | Toast when an action is blocked or denied                                                                                          |
| `text_summary`   | `false`               | Where nothing can be drawn, add a one-line `Activity: ▤ docx · ◉ code-reviewer · ↯ block-secrets BLOCKED` beneath each answer      |

Chips belong to one conversation. `/clear` and `/resume` empty them; muting lasts until then too.

---

## 🔒 Data, programs and permissions

The mod makes no network calls and sends nothing anywhere. It reads session data to draw chips, and keeps that data in the session.

**What it reads**

- The events Claude Code raises: skills, subagents, MCP calls, tool permission checks, hooks, slash commands, and `/clear` and `/resume`. The conversation text is not stored; a chip keeps only a label (a command, a path, a server name) and a one-line reason.
- Your settings, to tell which configured hooks match an event.
- The rule and memory files Claude loads, to count their lines (`$.fs.read`). Contents are not kept.
- The `COLORFGBG` environment variable, to guess whether the terminal is light or dark. No other variable and no credential is read.

**What it stores**

- The chip list lives in the session's state and goes with it. Your switches and muted chips are saved with `$.store`, on your machine, so they survive a restart. Nothing is uploaded.
- `c` in the pane copies a path to the clipboard when you press it.

**What it runs**

Once a minute, to read the system light or dark setting, it runs one fixed command per platform, with a 1.5 second timeout. No argument comes from the conversation or from your files.

| Platform | Command                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------- |
| macOS    | `defaults read -g AppleInterfaceStyle`                                                             |
| Linux    | `gsettings get org.gnome.desktop.interface color-scheme`                                           |
| Windows  | `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize /v AppsUseLightTheme` |

It starts no other program. If a command is missing, the mod falls back to `COLORFGBG` and then to the Claude Code theme.

**What its hooks decide**

- `tool.check` runs when Claude Code asks whether a tool call may run. The hook only watches: it calls `next`, records the verdict as a permission chip, and returns that same verdict. It never allows, denies or asks for itself, so the decision stays with you, your rules and your permission mode.
- `tool.call`, `agent.spawn`, `skill.prompt`, `command.run` and `turn.complete` also pass their result through unchanged. The one exception is `turn.complete` with `text_summary` on, which, where nothing can be drawn (cloud sessions), adds a one-line activity summary beneath the answer.
- `classic.*` observes the settings hooks that run, and returns what each one answered without changing it.
- `/session-activity` is the only command the mod registers. It opens the pane, or prints a text summary where no pane can draw.

---

## ⚠️ Limits

- A hook chip is keyed by its full command when one configured command matches the event, and is one `<Event> hooks` chip when several match. Claude Code does not expose a hook's exit code to a mod, so a hook chip is running, ok or blocked and never shows an error. Hooks that plugins configure are not in your settings, so they show only when they block.
- Permission chips leave out calls your permission mode allows on its own, such as reads, to keep the band readable. A call a hook allowed or denied shows on that hook's chip instead. Whether you approved "once" or "always" is not visible to a mod.
- Rule chips mean a file was loaded, not that a line in it shaped an action.
- Where an organization manages Claude Code, skill, hook, rule and compaction events reach only plugins the organization lists, so those chips stay empty.
- Checkpoints are not supported yet: Claude Code 2.1.302 sends no event for them, so the toggle exists and records nothing. Memory chips come only from writes Claude makes with `Write`, `Edit` or `MultiEdit`.
- Claude Code draws the band above the prompt only in the terminal and on Desktop. On VS Code and mobile, use the status line and `/session-activity`.
- Background task chips never show as running, because no event reports a background shell exiting.
- The ANSI themes cannot be told apart as light or dark, so chips fall back to coloured text there. Under the `auto` theme the tone is a guess from `COLORFGBG` or the system, and dark when neither is known; pin it with `chip_theme`.
- The system appearance is read with `defaults` (macOS), `gsettings` (Linux) or `reg` (Windows) once a minute. Where none is available the guess stops at the Claude Code theme.
- Where the design promises more than the mod can do, the pane keeps the accurate text: rules mean a file was loaded, memory covers writes only, checkpoints record nothing yet, and background tasks cannot be stopped from the chip.
- When another mod also draws in the band, its content comes first in the row and this mod's chips are sized as if they had the row to themselves, so the row can wrap.

---

## 🛠️ Development

From the repository root:

```sh
pnpm nx dev session-activity            # claude --plugin-dir mods/session-activity
pnpm nx run-many -t lint typecheck validate test
```

`hooks/register.tsx` holds every hook and every `$` call. `src/` holds pure helpers that take plain data: `model.ts` (the activation list and its reducer), `classify.ts` (event data to chips), `render.tsx` (band row and detail card), `pane.tsx` (the pane tabs), `icons.ts` (the Desktop `Svg` icons), `summary.ts` (the text summaries) and `theme.ts` (the registry of types with their glyphs, colours and settings copy). Tests in `tests/` run under `claude plugin test` and drive the mod through the engine's events and drawings.

---

## 🤝 Contributing

Contributions are welcome! See the [repository README](../../README.md#development) for setup, branch flow, commit conventions and releases.

---

## 📄 License

[MIT](../../LICENSE) © 2026 Tine Kondo. Not affiliated with or endorsed by Anthropic.
