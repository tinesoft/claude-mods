# 11: Live client check on the pinned Claude Code

**What to build:** The user live-checks Craftory on the pinned Claude Code across Desktop, VS Code and terminal, in light and dark (mobile is out of scope for now): the band, pane, hover cards, `$.ui.ask` in a Skill hook, `TaskStop` and glyph widths. Schedule early, in line with live-testing Desktop and terminal before changing code; findings become new tickets.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] Desktop, VS Code and terminal checked in light and dark; mobile out of scope for now (user, 2026-11-14)
- [ ] Band, pane, hover cards, `$.ui.ask` in a Skill hook, `TaskStop` and glyph widths checked
- [ ] Any problems filed as tickets

## Versions

"Pinned" can't hold on every surface. CI pins 2.1.302, the Desktop app bundles its own build (it runs 2.1.321 as of 2026-11-11), and the terminal `claude` is the native install, 2.1.322 (it replaced the Homebrew cask, which stopped at 2.1.311). Write down the version each surface actually ran. Treat a failure on a newer build as a finding, not a blocker, and file it.

| Surface  | Version                    | Light | Dark | Notes                                                                                           |
| -------- | -------------------------- | ----- | ---- | ----------------------------------------------------------------------------------------------- |
| Terminal | 2.1.322                    | ✓     | ✓    | All checks passed (user, 2026-11-11). Agent first-render pass on 2.1.311                        |
| Desktop  | 2.1.321                    | ✓     | ✓    | All checks passed (user, 2026-11-11), after the compact-card fix                                |
| VS Code  | 1.146.0, extension 2.1.323 | ✓     | ✓    | Passed after ticket 13's fixes (user, 2026-11-14)                                               |
| Mobile   | —                          | —     | —    | Out of scope for now (user, 2026-11-14); the mobile code paths stay as they are, unchecked live |

## Checklist (per surface, per theme)

Run from this repo, which has three Features in `.craftory/features/` and `.scratch/` maps to show.

**Band**

- [ ] Rail order: Inbox │ map chip │ feature title │ phases … gear
- [ ] Phase markers: todo, next, running (spinner), done; selected ring on the pressed step
- [ ] Map chip text reads `name · n decided · n open`, with no route status; purple on Desktop
- [ ] Desktop: the rail wraps rather than collapsing into the summary; no nested frame inside Desktop's band frame
- [ ] Terminal: the rail stays borderless and falls back to the summary only when it can't fit
- [ ] Collapsed summary (`railLayout: summary`): `[◆ map 3✓ 2?] › [Title · Phase n/m]`
- [ ] Phase card opens above the rail; the `×` close works; the card and a wrapped rail fit in the band's rows
- [ ] Frontier card: kicker, Frontier list, **Work next ticket** and **Open map**
- [ ] Every Desktop button label is readable on its fill (the regression `ef782ec` guards against)
- [ ] Notices: gate notice (Run anyway / Diagnose / dismiss), wayfinder suggest, automations

**Pane** (Flow 1, Tickets 2, Worktrees 3, Glossary 4, Settings 5)

- [ ] Header shows the Feature (kicker, title, phases done); the plugin line is under Settings
- [ ] The hotkeys 1–5 switch tabs; the tab counts show
- [ ] Tickets: map card with its switcher, Takeable / Claimed / Blocked / Decided, Inbox
- Mobile, out of scope for now: the Flow tab heads with the wrapped rail and the map chip (VS Code draws the band, so its Flow tab is the phase flow alone)

**Interactions**

- [ ] Hover cards (`reply.tsx` hover) show and hide
- [ ] `$.ui.ask` from a card button: "Anything to add for /<skill>?" (`withContext`); the answer is appended to the submitted command
- [ ] `$.ui.ask` from Settings: the first write to a shared file asks Write it / Not now
- [ ] `TaskStop` on a running Build subagent: the agents list and phase marker update and nothing gets stuck running
- [ ] Glyph widths: `◆ ✓ ▸ · ─ ⚙` and the spinner keep the rail aligned (no wrap shift) in the terminal font

## Findings

<!-- One line per problem: surface, theme, what, then the ticket it became. -->

Terminal, 2.1.311, 120 columns, first render in this repo:

```
⊟ Triage │ ◆ Craftory MVP · 14 decided · 0 open │ Craftory automations, h… ▾                 ⚙ [-]
✓ Align ─✓ Spec craftory-automations-hooks ─✓ Tickets 12 ─▸ Build ─⊘ Review ─⊘ Ship ─· Retro
  ⚠ craftory: Craftory automations, h… · Build · /craftory
```

- OK: the rail order (tray, map chip, title, phases, gear); the map chip reads `name · n decided · n open` without route status; the rail wraps onto a second line and doesn't drop to the summary; glyphs line up.
- Settled: the tray stays `Triage` (with a count when items wait); DESIGN.md's Rail section now says so.
- Settled: the `⚠` before the status line is drawn by the terminal only, and Desktop doesn't show it. Nothing for Craftory to do.
- Fixed (`dd968b9`): the terminal card close read `x: ×`, and now reads `x: Close`.
- Terminal, 2.1.322, light and dark: every check passed.

Desktop, 2.1.321:

- Fixed: with a card open, the card and the wrapped rail didn't fit, so the band scrolled. `e4114ed` had removed compact spacing everywhere to fix the terminal Build card's missing blank lines. Compact is now back on Desktop only, whenever the rail wraps (story 25), and the terminal stays roomy. You checked it live and decided to keep it. A Build card with a long agents list can still scroll.

VS Code, light and dark (user, 2026-11-13, `image-light.png`, `image-dark.png`):

- Problem: padding and margins are too tight on chips and chip detail cards, and don't match DESIGN.md or Desktop. Filed as 13.
- Problem: in dark, cards and chip rows draw light and the pane text is dark on dark. Filed as 13.
- Problem: every button draws as a small blue label with no padding. Filed as 13.
- Open: record the VS Code extension and Claude Code version that ran.
- Not yet checked on VS Code: hover cards, `$.ui.ask`, `TaskStop`, glyph widths.
- Fixed in 13 (2026-11-13 to 2026-11-14): spacing in whole rows, the toneless theme, button and tab padding, the phase row's wrap, the selected-tab marker, the Flow tab without the band's repeat, and Claude's terracotta in place of VS Code's blue. VS Code, 1.146.0 with extension 2.1.323, light and dark: passed (user, 2026-11-14).
