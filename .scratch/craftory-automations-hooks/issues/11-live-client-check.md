# 11: Live client check on the pinned Claude Code

**What to build:** The user live-checks Craftory on the pinned Claude Code across Desktop, VS Code, terminal and mobile, in light and dark: the band, pane, hover cards, `$.ui.ask` in a Skill hook, `TaskStop` and glyph widths. Schedule early, in line with live-testing Desktop and terminal before changing code; findings become new tickets.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Desktop, VS Code, terminal and mobile checked in light and dark
- [ ] Band, pane, hover cards, `$.ui.ask` in a Skill hook, `TaskStop` and glyph widths checked
- [ ] Any problems filed as tickets

## Versions

"Pinned" can't hold on every surface. CI pins 2.1.302, the Desktop app bundles its own build (it runs 2.1.321 as of 2026-11-11), and the terminal `claude` is the Homebrew cask, still 2.1.311. Write down the version each surface actually ran. Treat a failure on a newer build as a finding, not a blocker, and file it.

| Surface  | Version | Light | Dark | Notes                                                                      |
| -------- | ------- | ----- | ---- | -------------------------------------------------------------------------- |
| Terminal | 2.1.311 | –     | ✓    | Agent pass: static render only (the agent can't press anything in the TUI) |
| Desktop  |         |       |      |                                                                            |
| VS Code  |         |       |      |                                                                            |
| Mobile   |         |       |      |                                                                            |

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
- [ ] Mobile and VS Code: the Flow tab heads with the wrapped rail and the map chip

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
- Still to do by hand on the terminal: press a phase (card, `×`), the frontier card, `/craftory` pane tabs 1–5, the `$.ui.ask` prompts, `TaskStop`, light theme.
