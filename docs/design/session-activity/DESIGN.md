# session-activity: design spec

Source of truth for the look and behaviour of the `session-activity` mod. How each element is built in the
terminal and on the rich surfaces, and the decisions U1–U6 (tinted chips with light/dark tokens, band-anchored popover, digit
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
| Default: chips above the prompt | `Main.dc.html` | `AbovePrompt` band: one row of chips (round, bordered `Box`es on rich surfaces), digit hotkeys 1–9, `+N more` |
| Chip popover (inside Main) | `Main.dc.html` | Detail card drawn in the band above the chip row; small pane `detail` view as fallback |
| Expanded tray | `Expanded.dc.html` | `Pane` id `session-activity`, tab `1: Activity`: filter row, grouped rows, mute |
| Settings | `Settings.dc.html` | `userConfig` defaults + pane tab `2: Settings` overrides stored in `$.store` |
| Types, states, overflow | `States.dc.html` | Glyph + colour + text badge rules below |
| Mobile | `Mobile.dc.html` | The same row on the mobile surface, led by an `N active` chip that opens the pane |

`canvas.json` is the board index; ignore its layout coordinates.

Every artboard has light and dark themes. Colours are CSS custom properties on the root `.sa` element
(`--ink`, `--surface`, `--skill-fg`, `--skill-bg`, …), with dark values under `prefers-color-scheme: dark`
and a `theme` tweak (`auto` / `light` / `dark`). `TOKENS` in `src/theme.ts` holds the same set for both tones; the table is in the Palette section of `plan.md`. The mod's `chip_theme` setting is the `theme` tweak, and its `auto` follows the tone resolution chain in `plan.md`.

The `<script src="./support.js">` line in each artboard is the canvas editor's runtime (it also needs
`vendor/react.js` and `vendor/react-dom.js`). It is injected by the editor and is **not part of this
handoff**, so the `.dc.html` files don't open on their own in a browser. Read them as source. To view
them rendered, open the canvas link above, or use an artboard's Export menu there: the HTML export bundles
`support.js` and the vendor files, and PNG export gives screenshots you can drop into `artboards/`.
See `artboards/README.md`.

## Surfaces

The design is implemented on the **rich surfaces** (Desktop Code tab, VS Code, mobile: any surface whose
element table has `Svg`) and on the **terminal**. Rich surfaces get exact hex colours, the artboards' icons
redrawn as `Svg`, round bordered chips, hover and clicks. The terminal uses glyphs and one-row tinted chips.
Mobile adds a leading `N active` chip. claude.ai chat can't show a mod's UI and is out of scope;
claude.ai/code cloud sessions get text summaries at most (optional milestone M6).
See "Rich surfaces" in the UI spec of `plan.md`.

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

Optional types (off by default, opt-in in settings) are neutral: `ink-2` on `fill`, border `line`:

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
The dark values and every neutral token are in `plan.md` (Palette).

## Chip anatomy

`[hotkey] glyph label [×count] [STATUS]`

- `hotkey`: digit 1–9 in band order, only when the `chip_hotkeys` setting is on (off by default: a bare digit
  typed into an empty prompt would otherwise open a chip).
- `×count`: only when count > 1. One chip per source; repeats increment the counter.
- `STATUS`: white on `#B42318` for Blocked and Denied (` BLOCKED ` in the terminal, ` Blocked ` on rich surfaces), `inverse` + `bold` when untinted. Meaning is always carried by text, never by colour alone.
- `×count`: its own `Text` on `count-bg` blended over the chip when tinted.

## States

| State | Mockup | Terminal |
| --- | --- | --- |
| Just activated | halo + dot, settles after 4 s | `bold` + `●` prefix for 4 s |
| Running | spinner ring replaces icon | glyph cycles `◐◓◑◒` |
| Repeated | `×N` counter | `×N` |
| Blocked an action | red `Blocked` badge, `danger-bd` border | `BLOCKED` badge (`Blocked` and a `danger-bd` border on rich surfaces), always shown first, plus a 4 s toast |
| Denied (permission) | red `Denied` badge | `DENIED` badge, red, always shown first |
| Hook failed | dashed red outline, triangle icon, `Error` | rich: dashed `danger` border, triangle, bold `Error`; terminal: red `▲` + `Error`, no border |
| Muted | grey, struck through | hidden from band, dimmed `Muted` in pane |
| Pinned | pin icon, stays first | out of scope for v1 |
| Selected | 3 px focus ring | border takes the kind colour on rich surfaces; `underline` on the label; detail card opens above the row |

## Band rules

1. One chip row, width `e.props.bodyColumns`, first row 2 cells shorter. While a chip is selected, its detail
   card is drawn above the row (pane fallback when `maxRows` is too small). On mobile the row starts with the `N active` lead chip.
2. Order: blocked / denied / error → running → most recent.
3. Show as many chips as fit, capped by `max_chips` (default 6); the rest fold into `+N more`, which opens the pane.
4. Layout `summary`: one box with a glyph or icon and count per type in that type's colour (`▤2 ◉2 ⇌2 ⚷3 ↯4 ▣3`), then `● 2 blocked` in `danger` when anything was blocked or denied.
5. Nothing recorded, or disabled: return `next(e)` (empty band). Always include `await next(e)` so other mods' band content stays.
6. Counter in the status line under the prompt: `16 active · /session-activity`.
7. Everything reachable by keyboard (Ctrl+X then Tab, Up/Down, Enter); clicks work in fullscreen mode and Desktop.
8. On rich surfaces, chips and rows use `hover` (fill one step darker) and `Svg` icons from the artboards.

## Pane rules

- Opened by `+N more`, `/session-activity` (`immediate: true`), or a chip press when the band is too short for the detail card.
- Tab `1: Activity`: header `Session activity` and `N items · M activations · started X ago · Customize`; filters `a: All`, `s: Skills`, `g: Agents`, `p: MCP`, `k: Permissions`, `h: Hooks`, `r: Rules` with counts; rows grouped by type showing an icon tile, name, meta, status badge, a why line, `×count · last` and a `Mute` / `Unmute` button (stopped and errored rows always show, so they carry a note instead). The selected row also expands to the source path and `c: Copy path`.
- Tab `2: Settings`: title and intro, master toggle, live preview with layout buttons (chip row / collapsed summary), one switch per type in "Shown by default" and "Optional · Off by default · N of 7 on", chip theme (auto / light / dark), chip style (tinted / text), digit hotkeys on chips (off), toast when blocked or denied (on), text summary after each answer (off), `Reset to defaults`, `Turn everything on`. Saved per user in `$.store`.

## Spacing

Every gap, padding and margin in `render.tsx` and `pane.tsx` reads from the `SPACE` table in `src/theme.ts`,
keyed by design role. Each value is a `Space` step, taken from the board's pixel value: 6px `xs`,
8-10px `sm`, 12-14px `md`, 16-20px `lg`, 24px and up `xl`. A step lets each surface use its own scale.
Desktop and mobile draw it in pixels. The terminal and VS Code draw it in cells, across as `xs`/`sm` 1,
`md` 2, `lg` 3, `xl` 4 and down as `xs`/`sm` 0, `md`/`lg` 1, `xl` 2. `across` and `down` in `theme.ts` give the
same cells to the width and height math, so the chip row never overflows.

| Role | Board value | Step |
| --- | --- | --- |
| Chip gap, chip icon-to-label gap | 6px | `xs` |
| Chip inner padding, `+N more` padding | 0 10px 0 8px, 0 10px | `sm` across, none down |
| Summary chip padding, gap between its groups | 0 12px, 10px | `md` across, `sm` |
| Mobile chip row padding | 0 16px | `lg` across |
| Card above the chip row | 8px | `sm` |
| Card padding, card inner gap | 16px, 12px | `lg`, `md` in the roomy density (see below) |
| Card header gap, buttons gap, tiles gap | 10px, 8px, 8px | `sm` |
| Card header lines gap, tile label gap | 4px, 2px | `xs` |
| Tile padding | 8px 10px | `sm` |
| Pane padding | 16px left, 12px right | `md` left, `sm` right |
| Pane header, tabs-to-body and group gaps | 12px | `md` |
| Pane row grid gap, row side gap | 10px | `sm` |
| Pane row text gap, stats gap | 2px, 6px | `xs` |
| Gap between rows (activity and settings) | row padding 8-10px twice | `lg` |
| Settings main column gap | 24px | `xl` |
| Settings title and intro gap | 6px | `xs` |
| Settings section gap, preview gap, footer buttons gap | 10px, 8px, 8px | `sm` |
| Settings row grid gap | 14px | `md` |

Where the terminal needs a blank line between rows, the row padding of the board becomes one `lg` gap
between rows, which draws as 16px on Desktop and one blank line in the terminal. The 6-cell indent of the why
line under a row name is the one bare number left, because it must line up with the icon column in cells.
The untinted `chip_style: text` look keeps its two-cell chip gap. Terminal chips never get vertical padding,
so they stay one row tall. The card has two densities, `CARD_SPACE` in `theme.ts`:

| Density | Horizontal padding | Vertical padding | Gap between parts |
| --- | --- | --- | --- |
| `roomy` | `lg` | `lg` | `md` |
| `compact` | `lg` | none | none |

`cardRows(a, columns, density)` counts the terminal rows of each. The band takes the first of `roomy`, `compact` whose
rows fit under `maxRows` (prompt rows, chip row, the gap above the card and the card), draws `DetailCard` with it,
and falls back to the pane only when neither fits. The chip's `pick` uses the same test. The pane always draws the
roomy card. On the terminal the roomy card costs 5 to 6 more rows than the compact one, so a short band shows the compact
card and a tall one keeps the board's spacing; Desktop, VS Code and mobile get the roomy card wherever it fits, as before.

## Copy

Use the exact strings from the artboards for titles and labels: "Session activity", "Shown by default",
"Optional", "Off by default", "Reset to defaults", "Turn everything on", "Show chips above the prompt bar",
"Blocked and denied actions are always shown while this is on."
Sample data in the artboards (docx, code-reviewer, github, block-secrets, …) is illustrative only.
