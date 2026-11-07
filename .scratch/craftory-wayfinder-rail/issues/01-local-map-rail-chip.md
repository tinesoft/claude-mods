# 01: Local map in the rail chip

**What to build:** A developer with a Local `.scratch` wayfinder map opens the repo and sees the map's frontier in a single rail chip, with no configuration. The chip opens a frontier card above the rail whose kicker names the source (`Wayfinder · Local · .scratch/<effort>`). It heads the Flow tab on mobile and collapses to a summary on narrow bands. The chip is hidden when there is no map. This slice also lays the shared map model, the Local reader plugged into the tracker registry, and the fixture pipeline with the Local `mixed` scenario (2 takeable, 1 claimed with an assignee, 1 blocked, 2 decided, Not yet specified non-empty). The vendor script generates the fixtures module, each fixture header says "captured" or "hand-made", and `validate` drift-checks the module. Map state follows the spec's rules: structural children only, decided, claimed, blocked, frontier. Adds **Frontier** and **Takeable** to the Craftory glossary.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A Local map is found by scanning for the map shape (`## Destination` heading) without a prompt
- [x] Chip counts add up: decided plus open equals total, and open includes claimed
- [x] Card kicker names the source; the chip is hidden when no map exists
- [x] Chip heads the Flow tab on mobile; narrow bands show a collapsed summary
- [x] Never edits a map or ticket file
- [x] Fixtures module is generated from real files, pinned to mattpocock-skills 1.3.x, and `validate` fails on drift
- [x] Tests feed the `mixed` scenario through the fake world and assert the rendered chip and card
- [x] Glossary defines Frontier and Takeable
