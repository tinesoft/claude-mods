# 10: Flow tab is a vertical timeline

**What to build:** The pane's Flow tab reads the seven phases top to bottom as the board's timeline: a state mark per phase joined to the next by a line, then the label, its command in mono and its one-line result. On the terminal the mark is the phase glyph and a `│` (ASCII form too) joins the rows; on Desktop the mark is the numbered dot from 04, joined by a thin vertical bar. Each phase's buttons stay under it. On mobile and VS Code the tab keeps heading with the rail and the map chip.

Spec: [spec.md](../spec.md), stories 46–48.

**Blocked by:** 04 (the numbered dot)

**Status:** resolved

- [ ] Each Flow row holds mark, label, mono command and result in that order; a joining line sits between rows but not after the last.
- [ ] Desktop uses the `Svg` dot and a bar; the terminal uses glyphs and `│`.
- [ ] Per-phase buttons are kept.
- [ ] Harness tests on the terminal and Desktop.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Panel board's Flow tab.
