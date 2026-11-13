# 13: Fit Craftory to the VS Code surface: spacing, theme and buttons

**What to build:** Craftory draws on VS Code (it has `Svg`, so `isRich` is true and it takes the Desktop path), but the Desktop-tuned spacing, theme and button handling don't fit there. Found in the live check (ticket 11), VS Code light and dark. Fix the three problems below, then re-check VS Code in both themes, and Desktop and the terminal for regressions.

**Blocked by:** None (can start immediately). Needs the user for the live re-check.

**Status:** ready-for-agent

- [ ] Chips, the chip detail cards and the rail have padding and margins that match DESIGN.md and Desktop
- [x] The tone follows the VS Code theme: no light cards in a dark window, and no dark text on a dark pane (code done; needs the live re-check)
- [ ] Card buttons (Close, Work next ticket, Open map, Prototype, save, gear and × icon buttons) read as buttons in both themes
- [ ] A test pins each fix; Desktop and terminal output unchanged
- [ ] The user re-checks VS Code in light and dark

## Findings (user, 2026-11-13, VS Code, `image-light.png` and `image-dark.png`)

**1. Spacing.** Padding and margins are too tight overall and don't match DESIGN.md or the Desktop app:

- Chips (Flow, Tickets, Worktrees, Glossary, Settings; Entry points, Pipeline, Local Markdown…) sit tight to their labels and counts. Their wrap rows touch each other with no row gap.
- Chip detail cards (the map card, Frontier card) have almost no inner padding. The card text sits at the border, and the header, "Frontier · takeable now" and "Work next ticket / Open map" rows touch.
- The rail's head row and phase row are cramped, the phase labels sit hard against their dots, and the connector bars float above the labels.
- The Settings pane runs headings, helper text and fields together, with no vertical rhythm between settings.

**2. Theme (dark).** The tone appears to be taken as light while VS Code is dark:

- The map card, the rail's feature title and the pane's chip rows draw on near-white fills.
- In the pane, the headings, helper text and field labels are dark on dark, so they are almost invisible. The toggle track disappears and only its knob shows.
- "Open map" is grey on dark and barely readable.
- Likely cause (to confirm): `tone` in `src/theme.ts` (~line 301) returns `system ?? claude ?? 'light'` for every surface but the terminal. On VS Code that reads the OS appearance, not the editor's theme, so it can disagree with the window. Check what VS Code gives a mod, and which signal to prefer.

**3. Buttons.** Every `Button` draws as a small solid blue label with no padding, in both themes:

- Phase names (Spec, Tickets, Build…), the tab chips, "Close", "Work next ticket", "Prototype", and the rail's gear and the pane's `⚙` and `×` icons.
- This matches the Desktop note in `widgets.tsx`: the surface drops colours set inside a `Button`. VS Code does it too, so our own frames (`buttonFrame`, chip `look`, `SPACE.buttonPadX`) don't apply and nothing replaces them.
- Primary and secondary are not told apart: "Work next ticket" and "Close" look the same, and the outlined "Open map" is the odd one out.
- Decide the VS Code treatment: keep the native button, with padding from a wrapping `Box`, or draw a `plain` Button around our own framed `Box`. The `plain` path is how the terminal and `settings.tsx` toggle already work.

## Pointers

- Rich-surface detection and chip layout: `src/ui.tsx` (`isRich`, chip `look`), `src/widgets.tsx` (`buttonFrame`, `CardButton`), `src/card-model.ts` (rail fit and compact rule: compact is "Desktop only, whenever the rail wraps").
- Spacing tokens: `SPACE` in `src/theme.ts` (`chipPadX`, `cardPadX`, `buttonPadX`, `railRowGap`…).
- Tone: `src/theme.ts` (~274-303) and `src/appearance.ts`.
- Surface support: the READMEs say VS Code draws nothing on 2.1.302. On the VS Code build used here it draws the band and the pane, so those lines are stale for newer builds. See the 2.1.323 migration ticket.

## Progress (2026-11-13)

- **Theme (done in code):** `resolveTone` now gives VS Code no tone unless Claude Code's own theme is explicitly `light` or `dark`. It ignores the OS appearance and the Craftory theme pref, which say nothing about the editor's theme (and a Dev Container or remote host has no appearance to read, so the old fallback to `light` drew light fills in a dark window). With no tone the surface draws in theme keys and plain `[ label ]` buttons, which follow the editor. Pinned by `tests/theme.test.ts` and `tests/flow-timeline.test.ts`.
- **Still open:** spacing and button treatment on VS Code. With no tone, VS Code now takes the plain path, which fixes the dark-on-dark text and the native blue buttons, but it has terminal-like spacing, not the Desktop rich layout. Whether to give VS Code its own richer layout when the editor says light or dark is for the live re-check to decide.
- **Live re-check (user):** with `theme: auto` and Claude Code's theme `auto`, check VS Code light and dark: text readable, buttons look like buttons, spacing acceptable. Also try Claude Code's theme set to `dark` and `light`, which should give the rich layout in that tone.

## Second live check (user, 2026-11-13, VS Code 1.146.0, Claude Code extension 2.1.323, `image2-light.png`, `image2-dark.png`)

After the tone fix, with `theme: auto` the text is readable in both themes and nothing draws light-on-dark. Still wrong:

1. **Spacing.** Inner padding and margins are too small in the chips, the rail, the band and the cards. They must closely match Claude Desktop.
2. **Accent.** Buttons, toggles and links draw blue. They should use the accent of the host's own controls: the terracotta of "Show me" and the checkboxes in "Learn Claude Code".
3. **Card close.** "Close" is misaligned and doesn't read `x: Close` as on the terminal. Match the Desktop card's header layout as closely as possible.
4. **Settings pane.** Improve the padding and margins of the tabs, buttons, links and rows.

### Why (read from the code and the types)

- **Spacing has no VS Code layout.** `rich` is `isRich(ui) && tone !== undefined` in about 35 places (`card.tsx`, `map-card.tsx`, `rail.tsx`, `pane.tsx`, `widgets.tsx`, `ui.tsx`). With no tone, VS Code takes the terminal layout: terminal spacing, `fitRail` with `rich` false, and compact density never chosen. `rich` carries two meanings, structure and spacing (Svg exists, so a surface draws boxes and pixels) and tint (we know the tone and may paint fills). VS Code needs the first without the second. The fix is to split them: a `rich` for layout and a `tinted` for our own colours.
- **Close.** On VS Code the card close is `Button key="close" plain hotkey="x" label="Close"` whose child is the bare string `Close`. The terminal's `x: Close` comes from the plain Button drawing the hotkey in the accent colour, a colon, then the label. The card header row's `justifyContent: 'space-between'` needs the Desktop close in a fixed-size slot.
- **Accent colour is the host's.** The API says a Button draws as the surface's native button "either way", including `plain`, and the code notes that colours set inside a Button are dropped. So a mod can't repaint a native button's fill, and the blue here is VS Code's. Two things a mod can do:
  - Text outside a Button can take the theme key `claude` (the host's terracotta) via `color="claude"`, which follows the person's theme without a tone. That covers links, counts, the toggle's "On" label and the active-chip marker.
  - A pressable we draw ourselves, as a `Box` with our own fill, still needs a `Button` to be pressable, so its chrome stays the host's.
- **To confirm live:** whether the blue on VS Code comes from the Button's own chrome, or from a `Link` or `suggestion` colour applied to a pressable's text.

### Plan

1. Split `rich` into layout and tint. Add a `look` tier: terminal, rich-untinted (VS Code with no tone) and rich-tinted (Desktop, mobile, VS Code with an explicit theme). Give the rich-untinted tier Desktop's spacing tokens and wrapping, with colours only from theme keys.
2. Make the card close one component used by every card, laid out as on Desktop, with `x: Close` on VS Code and the glyph close where a tone exists.
3. Replace blue with `color="claude"` for text accents on the untinted tier. Keep native button chrome as it is, and say so in the README's VS Code note.
4. Give the Settings pane its own vertical rhythm: section gap, label-to-field gap, helper text gap, row padding, tab chip gap.
5. Tests: a surface matrix for the untinted tier (spacing props present, no raw fills, close reads `x: Close`), and snapshots for Desktop and the terminal to show nothing moved.
6. The user re-checks VS Code, `theme: auto` and Claude's theme forced to `dark` and `light`.

## Progress, second pass (2026-11-13)

Cause found: the engine draws a Space step as character cells on VS Code, so a vertical `xs` or `sm` is no row (down: `xs` and `sm` 0, `md` and `lg` 1), where Desktop draws them as pixels. Rows of chips, rail rows, fields and cards were touching. Also `cardDensity` went compact over the wrapping rail, which on VS Code means zero padding.

Done in code:

- `uiFor` wraps `Box` on VS Code with `vscodeSpaced` (`src/ui.tsx`): a vertical `sm` gap (`rowGap`, `marginTop`, `marginBottom`) becomes one row, and a wrapping row with no row gap gets one. Padding and `xs` are left alone. This reaches the rail rows, the card slots, the settings fields and the pane tabs, with no change to Desktop or the terminal.
- VS Code cards stay roomy (`rail.tsx`); Desktop still goes compact over its wrapping rail.
- A chip with no tone keeps a cell of padding and a cell between its parts on VS Code (`Chip` in `ui.tsx`).
- One `CloseButton` (`widgets.tsx`) for the phase card and the map card, in a slot that doesn't shrink, with the header row aligned to the top. VS Code with no tone reads `x: Close`; Desktop keeps `×`; the terminal keeps `Close`, which its plain Button draws as `x: Close`.
- Pinned by `tests/vscode-spacing.test.ts` (the band can't be mounted on VS Code by the 2.1.302 test engine, so the tests render it with the fake UI).

Postponed by the user: the accent colour (replace blue with the host's terracotta where a mod can).

Still for the live re-check: whether one row is too much or too little between the rail's two rows and between wrapped chip rows, and whether the settings pane reads well. VS Code can only space in whole rows, so there's no half-way step.

## Progress, third pass (2026-11-13)

From the third live check (`image.png`, VS Code, dark):

- **Phase row on one line:** the connector after a done phase was an Svg bar, and after the others a text dash, so the row sat on different lines. With no tone every connector is now the text dash (`Connector` in `rail.tsx`).
- **Settings panel padding:** with no tone on a rich surface, the pane's tab chips, the settings segments and the pane's buttons take one row of padding above and below (`padRowsOf` in `ui.tsx`, the `padY` prop on `CardButton`). The band's cards and the rail are unchanged.

## Progress, fourth pass (2026-11-13)

The phase chips still sat on different lines (done and next ones level, todo and gated ones about a row lower), and the settings panel showed no selected tab.

- **Phase row (hypothesis, not yet seen live):** the lower chips are the ones whose glyph and label are dim `Text` inside the native Button. With no tone, the dim now goes on the Button (`dimColor`) and the Text inside carries none (`Chip` in `ui.tsx`); the steps row also aligns to the top, not the centre, so a taller or shorter chip can't shift the others. If they are still uneven on the next check, note which chips are lower.
- **Selected tab:** a native button shows no bold or underline, so with no tone the selected pane tab and settings segment carry a `▸` marker.

## Progress, fifth pass (2026-11-13)

The selected-tab marker is confirmed live. The phase chips were still on a staircase, so the fourth pass's dim hypothesis was wrong.

- **Phase row (cause found):** the extension's webview (`anthropic.claude-code-2.1.323`, `webview/index.js`) draws a Box as a flex `div` and gives a row Box `flex-wrap: wrap` when the mod names no `flexWrap`; the terminal never wraps. Each phase step is a row Box of connector and chip, so when the steps row squeezed it, the chip wrapped under its connector. `vscodeSpaced` now gives a Box with no `flexWrap` `nowrap` on VS Code; a Box that asks for `wrap` still wraps. The dim-on-Button change stays, as it fades glyph and label together, but it was not the cause.
- [ ] Live re-check: the seven phase chips on one row with their connectors.
