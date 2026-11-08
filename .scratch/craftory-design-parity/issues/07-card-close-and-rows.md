# 07: Phase card close and rows follow the board

**What to build:** The phase card stays in the band above the rail. On Desktop its close is a `×` glyph at the top right (a one-glyph plain Button), not the grey "Close" pill that `role="dismiss"` draws; the terminal keeps its `x` hotkey. The card's kicker, title, paragraph, Command row, Helpers row, artifact tile, gate line and buttons follow the board's order and styles: inverse command chips, skill-tinted helper chips with the layers icon, the tile background for the artifact, the amber gate line with the lock icon, a primary Button for the command. The Build card's Agents list matches the board (header with live count and total tokens; rows with id, title, status pill, TDD step, token bar with time, worktree line; footer with Pause all and Open panel), and on Desktop its status pills are tinted Boxes with `Text`, not coloured Button labels.

Spec: [spec.md](../spec.md), stories 29–32. Limits: [analysis.md](../analysis.md), decisions 1 and 6.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] On Desktop the close is a one-glyph `×` Button at the top right (ASCII form too); no `role="dismiss"`.
- [ ] Card rows appear in the board's order on both surfaces; Desktop chips, tile and gate line carry the board's look props.
- [ ] Agents list order and text match the board; Desktop status pills are Boxes with `Text`, with no `color` on `Text` inside a Button.
- [ ] Harness tests on the terminal and Desktop for a plain phase card and the Build card with agents.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Main board's card.
