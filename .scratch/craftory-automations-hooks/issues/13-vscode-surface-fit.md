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
