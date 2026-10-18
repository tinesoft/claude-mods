# session-activity: design spec

Source of truth for the look and behaviour of the `session-activity` mod.
The interactive canvas lives at https://claude.ai/artifact/Vq3u2zZ6whyGNDGdXBFj3m (owner access).
The implementation plan is [`plan.md`](./plan.md), next to this file.

## How to read these files

`artboards/*.dc.html` are the validated mockups, drawn as web UI. They are a **visual and behavioural
reference, not code to port**. A Claude Code mod draws with `Box`, `Text`, `Button`, `Input`, `Select`
and `Markdown` in the `AbovePrompt` band and in a `Pane`, so translate each board as below.
Each file's `<script data-dc-script>` block holds the sample data and interaction logic (selection,
filters, mute, toggles), which is the most useful part to read.

| Board | File | Becomes in the mod |
| --- | --- | --- |
| Default: chips above the prompt | `Main.dc.html` | `AbovePrompt` band: one row of plain `Button`s, digit hotkeys 1–9, `+N more` |
| Chip popover (inside Main) | `Main.dc.html` | The selected row's expanded detail in the pane (no floating popovers in a mod) |
| Expanded tray | `Expanded.dc.html` | `Pane` id `session-activity`, tab `1: Activity`: filter row, grouped rows, mute |
| Settings | `Settings.dc.html` | `userConfig` defaults + pane tab `2: Settings` overrides stored in `$.store` |
| Types, states, overflow | `States.dc.html` | Glyph + colour + text badge rules below |
| Mobile | `Mobile.dc.html` | Out of scope (mods run in terminal and Desktop only) |

`canvas.json` is the board index; ignore its layout coordinates.

## Chip types

Default-on types, in band order after status sorting:

| Type | Mockup icon | Terminal glyph | Terminal colour | Desktop fg / bg / border |
| --- | --- | --- | --- | --- |
| Skill | stacked layers | `▤` | blue | `#1F4FC1` / `#EDF2FD` / `#C9D7F7` |
| Agent | robot head | `◉` | magenta | `#5B3A99` / `#F3EEFB` / `#D9CCF0` |
| MCP server | plug | `⇌` | magenta (dim) | `#9C1F62` / `#FCEEF5` / `#F0C8DC` |
| Permission | key | `⚷` | cyan | `#0E6159` / `#E8F5F2` / `#BCE0D8` |
| Hook | bolt | `⚡` | yellow | `#9A4A0B` / `#FDF1E6` / `#F0CFAE` |
| Rule | shield | `▣` | default text | `#2A2D35` / `#FFFFFF` / `#CFD2D8` |

Optional types (off by default, opt-in in settings), all neutral `#2A2D35` on `#F0F1F4`, border `#DADCE1`:

| Type | Glyph | Example label |
| --- | --- | --- |
| Slash command | `/` | `/release-notes` |
| Memory | `✎` | `Remembered: prefers pnpm` |
| Plugin | `⬡` | `via acme-devtools` (a tag on other chips) |
| Context | `◔` | `Compacted · 62% used` |
| Checkpoint | `⚑` | `Checkpoint 3 · Rewind` |
| Output style / model | `≡` | `Style: Explanatory` |
| Background task | `▶` | `pnpm dev · running` |

Every glyph must be one terminal cell wide; fall back to `↯` (hook) and `⌐` (permission) where `⚡`/`⚷` render wide.

## Chip anatomy

`[hotkey] glyph label [×count] [STATUS]`

- `hotkey`: digit 1–9 in band order (band digit hotkeys fire when typed alone into an empty prompt).
- `×count`: only when count > 1. One chip per source; repeats increment the counter.
- `STATUS`: `Text` with `inverse` + `bold`. Meaning is always carried by text, never by colour alone.

## States

| State | Mockup | Terminal |
| --- | --- | --- |
| Just activated | halo + dot, settles after 4 s | `bold` for 4 s, then normal |
| Running | spinner ring replaces icon | `RUNNING` badge, dimmed |
| Repeated | `×N` counter | `×N` |
| Blocked an action | red `Blocked` badge, red-tinted border | `BLOCKED` badge, red, always shown first |
| Denied (permission) | red `Denied` badge | `DENIED` badge, red, always shown first |
| Hook failed | dashed red outline, triangle icon, `Error` | `ERROR` badge, red |
| Muted | grey, struck through | hidden from band, dimmed `Muted` in pane |
| Pinned | pin icon, stays first | out of scope for v1 |
| Selected | 3 px focus ring | focused `Button` (Claude Code draws focus) |

## Band rules

1. One row only, width `e.props.bodyColumns`, first row 2 cells shorter.
2. Order: blocked / denied / error → running → most recent.
3. Show as many chips as fit, capped by `max_chips` (default 6); the rest fold into `+N more`, which opens the pane.
4. Layout `summary`: one button `16 active · ▤2 ◉2 ⇌2 ⚷3 ⚡4 ▣3`, plus `· 2 stopped` when anything was blocked or denied.
5. Nothing recorded, or disabled: return `next(e)` (empty band). Always include `await next(e)` so other mods' band content stays.

## Pane rules

- Opened by a chip press (on that item), `+N more`, or `/session-activity` (`immediate: true`).
- Tab `1: Activity`: filters `a: All`, `s: Skills`, `g: Agents`, `p: MCP`, `k: Permissions`, `h: Hooks`, `r: Rules` with counts; rows grouped by type showing name, meta, `×count · last`, status badge. The selected row expands to the popover content: why line, source path, `m: Mute`/`Unmute`, `c: Copy path`.
- Tab `2: Settings`: master toggle, layout `Select` (row / summary), one toggle per type in "Shown by default" and "Optional · off by default (N of 7 on)", `Reset to defaults`, `Turn everything on`.

## Copy

Use the exact strings from the artboards for titles and labels: "Session activity", "Shown by default",
"Optional", "Off by default", "Reset to defaults", "Turn everything on", "Show chips above the prompt bar",
"Blocked and denied actions are always shown while this is on."
Sample data in the artboards (docx, code-reviewer, github, block-secrets, …) is illustrative only.
