# 09: Pane tabs read as tabs on Desktop

**What to build:** The pane's tabs move onto the chip pattern. On Desktop the selected tab is a raised tab (surface fill, border) on a fill strip with its label in ink, unselected tabs have no fill, and each tab's count is a mono `Text` sibling outside the Button. On the terminal the selected tab stays bold, as today.

Spec: [spec.md](../spec.md), story 45. Limits: [analysis.md](../analysis.md), decision 1.

**Blocked by:** 01 (the chip pattern)

**Status:** ready-for-agent

- [ ] Tab state is carried by the tab Box on Desktop; no `Text` inside a tab Button carries a `color`.
- [ ] Counts sit outside the Button on Desktop.
- [ ] The terminal's tab row is unchanged in look.
- [ ] Harness tests on the terminal and Desktop, light and dark, with each tab selected in turn.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Panel board's tablist.
