# session-activity: design spec

Source of truth for the look and behaviour of the `session-activity` mod. How each element is built in the
terminal, and the decisions U1–U6 (tinted chips with light/dark palettes, band-anchored popover, digit
hotkeys off by default, status-line counter, settings tab, block toast), are in the UI spec of `plan.md`;
where this file and that section differ, `plan.md` wins.
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
| Chip popover (inside Main) | `Main.dc.html` | Detail card growing in the band under the selected chip; small pane `detail` view as fallback |
| Expanded tray | `Expanded.dc.html` | `Pane` id `session-activity`, tab `1: Activity`: filter row, grouped rows, mute |
| Settings | `Settings.dc.html` | `userConfig` defaults + pane tab `2: Settings` overrides stored in `$.store` |
| Types, states, overflow | `States.dc.html` | Glyph + colour + text badge rules below |
| Mobile | `Mobile.dc.html` | Out of scope (mods run in terminal and Desktop only) |

`canvas.json` is the board index; ignore its layout coordinates.

The `<script src="./support.js">` line in each artboard is the canvas editor's runtime (it also needs
`vendor/react.js` and `vendor/react-dom.js`). It is injected by the editor and is **not part of this
handoff**, so the `.dc.html` files don't open on their own in a browser. Read them as source. To view
them rendered, open the canvas link above, or use an artboard's Export menu there: the HTML export bundles
`support.js` and the vendor files, and PNG export gives screenshots you can drop into `artboards/`.
See `artboards/README.md`.

## Chip types

Default-on types, in band order after status sorting:

| Type | Mockup icon | Terminal glyph | Terminal colour | Desktop fg / bg / border |
| --- | --- | --- | --- | --- |
| Skill | stacked layers | `▤` | blue | `#1F4FC1` / `#EDF2FD` / `#C9D7F7` |
| Agent | robot head | `◉` | magenta | `#5B3A99` / `#F3EEFB` / `#D9CCF0` |
| MCP server | plug | `⇌` | magenta (dim) | `#9C1F62` / `#FCEEF5` / `#F0C8DC` |
| Permission | key | `⚷` | cyan | `#0E6159` / `#E8F5F2` / `#BCE0D8` |
| Hook | bolt | `↯` | yellow | `#9A4A0B` / `#FDF1E6` / `#F0CFAE` |
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

Every glyph must be one terminal cell wide; `↯` is used for hooks, and `⚷` falls back to `⌐` where it renders wide.
Dark-theme palette values are in `plan.md` (Palette).

## Chip anatomy

`[hotkey] glyph label [×count] [STATUS]`

- `hotkey`: digit 1–9 in band order, only when the `chip_hotkeys` setting is on (off by default: a bare digit
  typed into an empty prompt would otherwise open a chip).
- `×count`: only when count > 1. One chip per source; repeats increment the counter.
- `STATUS`: `Text` with `inverse` + `bold`. Meaning is always carried by text, never by colour alone.

## States

| State | Mockup | Terminal |
| --- | --- | --- |
| Just activated | halo + dot, settles after 4 s | `bold` + `●` prefix for 4 s |
| Running | spinner ring replaces icon | glyph cycles `◐◓◑◒` |
| Repeated | `×N` counter | `×N` |
| Blocked an action | red `Blocked` badge, red-tinted border | `BLOCKED` badge, red, always shown first, plus a 4 s toast |
| Denied (permission) | red `Denied` badge | `DENIED` badge, red, always shown first |
| Hook failed | dashed red outline, triangle icon, `Error` | red `▲` glyph + `ERROR` badge |
| Muted | grey, struck through | hidden from band, dimmed `Muted` in pane |
| Pinned | pin icon, stays first | out of scope for v1 |
| Selected | 3 px focus ring | focus highlight + `underline`; detail card opens under the row |

## Band rules

1. One chip row, width `e.props.bodyColumns`, first row 2 cells shorter. While a chip is selected, its detail
   card grows below the row (pane fallback when `maxRows` is too small).
2. Order: blocked / denied / error → running → most recent.
3. Show as many chips as fit, capped by `max_chips` (default 6); the rest fold into `+N more`, which opens the pane.
4. Layout `summary`: one button `16 active · ▤2 ◉2 ⇌2 ⚷3 ↯4 ▣3`, plus `· 2 stopped` when anything was blocked or denied.
5. Nothing recorded, or disabled: return `next(e)` (empty band). Always include `await next(e)` so other mods' band content stays.
6. Counter in the status line under the prompt: `16 active · /session-activity`.
7. Everything reachable by keyboard (Ctrl+X then Tab, Up/Down, Enter); clicks work in fullscreen mode and Desktop.

## Pane rules

- Opened by `+N more`, `/session-activity` (`immediate: true`), or a chip press when the band is too short for the detail card.
- Tab `1: Activity`: filters `a: All`, `s: Skills`, `g: Agents`, `p: MCP`, `k: Permissions`, `h: Hooks`, `r: Rules` with counts; rows grouped by type showing name, meta, `×count · last`, status badge. The selected row expands to the popover content: why line, source path, `m: Mute`/`Unmute`, `c: Copy path`.
- Tab `2: Settings`: master toggle, live preview with layout buttons (chip row / collapsed summary), one toggle per type in "Shown by default" and "Optional · off by default (N of 7 on)", chip style (tinted / text), digit hotkeys on chips (off), toast when blocked or denied (on), `Reset to defaults`, `Turn everything on`. Saved per user in `$.store`.

## Copy

Use the exact strings from the artboards for titles and labels: "Session activity", "Shown by default",
"Optional", "Off by default", "Reset to defaults", "Turn everything on", "Show chips above the prompt bar",
"Blocked and denied actions are always shown while this is on."
Sample data in the artboards (docx, code-reviewer, github, block-secrets, …) is illustrative only.
