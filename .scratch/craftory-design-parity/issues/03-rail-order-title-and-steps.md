# 03: Rail order, title pill and phase steps follow the board

**What to build:** The rail reads Inbox, divider, map chip, divider, feature title, the seven phases, then the gear, on both surfaces. On Desktop the feature title is a fill-tinted pill with a list icon, the title in ink and clipped with an ellipsis at the board's width; it stays the Feature switcher. Phase steps have no fill or border at rest; the step whose card is open gets the `fill` background and a `lineStrong` border; hovering tints a step. Phase labels are in ink on Desktop (state colour moves to the marker, see 04); the meta count pill (`#42`, `5`, `1/5`, `Q6 of ~14`) stays after the label. Connectors between phases are short bars on Desktop, teal after a Done phase and neutral otherwise; the terminal keeps `─`. Inbox (dashed border, amber count) and the gear (a one-glyph plain Button) move onto the chip pattern. On the terminal only the order changes; steps keep their glyphs, colours and underline.

Spec: [spec.md](../spec.md), stories 7–9 and 13–20. Limits: [analysis.md](../analysis.md), decisions 1 and 2.

**Blocked by:** 01 (the chip pattern)

**Status:** ready-for-agent

- [ ] The band tree holds Inbox, map chip, title, seven phases and gear in that order on the terminal and Desktop.
- [ ] On Desktop the title pill is a tinted Box with an `Svg` list icon and an ink label, and still switches the Feature.
- [ ] On Desktop steps carry no fill or border at rest; the selected step carries `fill` and `lineStrong`; hover is kept.
- [ ] On Desktop no phase label `Text` inside a Button carries a `color`; meta counts are pills outside the Button.
- [ ] On Desktop connectors are short bars, teal after Done; the terminal keeps `─`.
- [ ] Inbox and the gear use the chip pattern; the gear opens the pane on Settings.
- [ ] Harness tests cover order, the selected step look and the connector colour on both surfaces, light and dark.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Main board's rail.
