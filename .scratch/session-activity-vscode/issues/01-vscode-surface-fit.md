# 01: Fit session-activity to the VS Code surface: tone, spacing and buttons

**What to build:** Apply craftory's VS Code fixes (ticket 13 of `craftory-automations-hooks`, and `docs/agents/vscode-surface.md`) to session-activity, in light and dark. VS Code 2.1.323 draws the band as well as the pane, so both need to fit. Keep the type colours: Skill and Permission stay Claude Code's blue, and Claude's terracotta goes on the buttons and the selection only.

**Blocked by:** None (can start immediately). Needs the user for the live check.

**Status:** ready-for-human

- [x] No tone on VS Code unless Claude Code's `theme` names one; no hex fills then
- [x] Spacing in whole rows, and no row wraps unless it asks to (`vscodeBox`)
- [x] Buttons outlined in terracotta, dim ones plain (`vscodeButton`)
- [x] Type marks as coloured glyphs beside their Buttons; row badges beside the row Button
- [x] Selected tab and choice marked with `▸`, the others dim; a row of padding on tabs and choices
- [x] The band's detail card roomy, with `x: Close`
- [x] Tests in `mods/session-activity/tests/vscode.test.ts`; terminal and Desktop output unchanged
- [ ] The user live-checks VS Code in light and dark: the band, the detail card, and the Activity and Settings tabs
