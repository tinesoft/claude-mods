# 04: Numbered phase dots on Desktop

**What to build:** On Desktop each phase step shows its marker as a round `Svg` dot, as on the board: a grey ring with the step number for not started, a blue ring with the number for Up next, a blue fill with a white number and a spinner ring for Running, a teal ring with a check for Done. Needs you, Gated, Failed and Over budget keep their own glyph inside the dot in the state's colour, so colour is never the only signal; Skipped is struck through and dashed. The terminal keeps its state glyphs (no dot can be drawn there). The dot is built in the icons module next to the existing phase icons, so the Flow tab (10) can reuse it.

Spec: [spec.md](../spec.md), stories 10–12. Limits: [analysis.md](../analysis.md), "terminal" target and decision 1.

**Blocked by:** 03 (the new phase step)

**Status:** ready-for-agent

- [ ] A pure helper picks the dot (ring colour, fill, number or glyph, dashed or not) per phase state; helper tests cover every state.
- [ ] On Desktop each phase step holds an `Svg` dot; on the terminal no `Svg` appears and the glyphs are unchanged.
- [ ] Dot colours come from the design tokens in light and dark.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop (each state seen at least once, or covered by a seeded fixture) and the terminal.
