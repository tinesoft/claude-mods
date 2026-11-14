# The VS Code surface

How Claude Code for VS Code draws a mod, read from the extension's own webview code and confirmed in craftory's live check (VS Code 1.146.0, extension 2.1.323, light and dark). Read the source before guessing at a layout or colour: the webview is a plain React page, and one search answers what a screenshot can't.

## Reading the source

The extension is installed in the dev container at `~/.vscode-server/extensions/anthropic.claude-code-<version>-linux-arm64/`. The mod renderer is `webview/index.js` (minified) and its styles `webview/index.css`. Search for:

- `function CAt(` – a Box's props turned into CSS (flex, gaps, padding, border).
- `function SAt(` – a Text's props turned into CSS (colour, dim, bold).
- `case"Button":` – two hits: the tree normaliser (what props survive) and the renderer.
- `--app-claude-orange`, `--app-accent-color`, `.button_` in `index.css` – the colours and button chrome.

Minified names change between versions; search by the string around them (`alignItems:Aae(e,"alignItems"`, `isDim:a.data.dimColor`).

## What it draws

- **Band and pane.** On 2.1.323 VS Code raises the `AbovePrompt` band as well as the `Pane`. The 2.1.302 declarations (the CI pin) say the band is terminal and desktop only, and the 2.1.302 test engine refuses to mount a band on `vscode`: render the band with `tests/fake-ui.ts` there.
- **Tone.** VS Code passes no light or dark appearance a mod can read; craftory's `resolveTone` returns no tone there unless Claude Code's `theme` setting names one. With no tone, draw with Claude Code's theme keys, never hex fills.

## Layout

- **Box** is a flex `div`. Spacing is in cells: across in `ch`, down in `lh`, so a `Space` of `xs` or `sm` down is no row at all.
- **A row Box with no `flexWrap` wraps** (`flex-wrap: wrap`), where the terminal never wraps. Squeezed rows then break mid-group. Give every Box an explicit `flexWrap`; craftory's `vscodeBox` defaults it to `nowrap`.
- A Box's `borderStyle` is a 1px border and, for `round`, a 6px radius. There is no `alignSelf`: a bordered Box in a column stretches to its width unless an outer row Box holds it.

## Buttons, links and inputs

- **Button children are flattened to plain text.** Colour, bold and dim on a `Text` inside a Button are dropped; only the Button's own `dimColor` survives.
- **The Button fill is VS Code's theme button colour** (`--vscode-button-background`, blue by default), and no prop changes it. A `dimColor` Button is transparent with a grey label and a thin border.
- **A Link** is always `--app-link-foreground`.
- **An Input's `submitLabel`** draws a native button in the theme's button colour. Without `submitLabel` there is none; Enter still submits.

## Colours

- Claude Code's theme keys map to the editor's CSS variables. `suggestion`, `permission` and `ide` are `--app-accent-color`, VS Code's blue. `claude` is `--app-claude-orange`, `#d97757`: the accent of Claude Code's own buttons and checkboxes.
- Keys outside the map (`planMode`, `merged`) draw no colour at all.
- Hex colours pass through unchanged, so a hex fill made for one theme clashes with the other.

## How craftory fits it

`uiFor` in `mods/craftory/hooks/shell/ui.ts` wraps the element table on `vscode` with the helpers in `mods/craftory/src/ui.tsx`:

- `vscodeBox` – a structural `sm` gap becomes one row, a Box with no `flexWrap` is `nowrap`, and blue theme keys become `claude`.
- `vscodeText` – blue theme keys become `claude`.
- `vscodeButton` – an accent Button is a dim one inside a `claude` round outline; a dim Button stays plain.
- `Entry` in `src/widgets.tsx` draws its own Save Button beside an Input in place of the native submit button.
