# 08: The pane opens on the Feature

**What to build:** `/craftory` opens a pane whose header is about the Feature, not the plugin: a mono kicker (`Craftory · spec #42`, or `Craftory` before a spec exists), the Feature title, and a progress line (`3 of 7 phases done · Build running, 2 agents`), with a gear (to Settings) and a close at the top right as one-glyph Buttons. With no Feature in flight, the header says so and points at `/grill-with-docs`. The plugin status line moves from the top of every tab into the Settings tab header. On the terminal the header is three text lines; on Desktop a mono caption kicker, a heading title and an ink-2 progress line.

Spec: [spec.md](../spec.md), stories 41–44.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] The pane tree starts with kicker, title, progress line, gear and close on both surfaces.
- [ ] A pure helper builds the progress line from the Feature's phase states and agents; helper tests cover none done, some done with Running and agents, and all done.
- [ ] With no Feature, the header names `/grill-with-docs`.
- [ ] The plugin status line shows in the Settings tab header only.
- [ ] Harness tests mount the pane on the terminal and Desktop.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Panel board's header.
