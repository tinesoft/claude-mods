# 05: Collapsed summary shows Map › Feature · Phase

**What to build:** In summary mode with a Map, the band reads `[◆ <map> 3✓ 2?] › [<title> · <Phase> <count>]`, so it carries the same Map-to-Feature path as the rail. On Desktop the title is the plain Button's label (ink, bold), and the phase name in its state colour and the count as a pill are `Text` siblings outside the Button. On the terminal the `›` separator and the compact counts are added; colours stay as today. Pressing the summary still expands the rail.

Spec: [spec.md](../spec.md), stories 26–28. Limits: [analysis.md](../analysis.md), decision 1.

**Blocked by:** 01 (compact counts and the chip pattern)

**Status:** resolved

- [ ] The summary tree holds the map chip in compact form, a `›` (ASCII form too), then the title, phase and count in that order on both surfaces.
- [ ] On Desktop the phase name and count sit outside the Button and carry their colours; no `Text` inside the Button has a `color`.
- [ ] Without a Map, the summary is title · phase · count with no `›`.
- [ ] Pressing the summary expands the rail.
- [ ] Harness tests on the terminal and Desktop, light and dark.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the States board's collapsed summary.
